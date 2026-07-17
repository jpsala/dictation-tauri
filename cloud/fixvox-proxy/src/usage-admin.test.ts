import { describe, expect, test } from "bun:test";
import type { AdminRequestEvent, KvNamespaceLike } from "./admin-store";
import {
  registerDevice,
  type ControlPlaneAdminDeviceRow,
  type ManagedQuotaLimits,
  type ManagedUsageLimits,
} from "./control-plane-store";
import { buildUsageAdminProjection, getUsageAdminProjection } from "./usage-admin";

class MemoryKv implements KvNamespaceLike {
  readonly values = new Map<string, string>();
  putCount = 0;

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.putCount += 1;
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function quota(
  unit: ManagedQuotaLimits["unit"],
  state: ManagedQuotaLimits["state"] = "ok",
): ManagedQuotaLimits {
  return {
    unit,
    label: unit === "audioSecond" ? "STT" : "AI",
    state,
    blockedWindow: state === "blocked" ? "rolling5h" : null,
    windows: {
      rolling5h: { used: state === "blocked" ? 10 : 2, limit: 10, remaining: state === "blocked" ? 0 : 8, resetsAt: "2026-07-15T10:00:00.000Z" },
      weekly: { used: 5, limit: 20, remaining: 15, resetsAt: "2026-07-20T00:00:00.000Z" },
    },
    policy: { policyId: "alpha-basic", matchedCohort: null, quotaMultiplier: 1, globalMultiplier: 1 },
  };
}

function managedQuota(state: ManagedUsageLimits["state"] = "ok"): ManagedUsageLimits {
  return {
    unit: "managedUsageUnit",
    state,
    blockedWindow: state === "blocked" ? "rolling5h" : null,
    windows: {
      rolling5h: { used: 1, limit: 10, remaining: 9, resetsAt: "2026-07-15T10:00:00.000Z" },
      weekly: { used: 3, limit: 20, remaining: 17, resetsAt: "2026-07-20T00:00:00.000Z" },
    },
    policy: { policyId: "alpha-basic", matchedCohort: null, quotaMultiplier: 1, globalMultiplier: 1 },
  };
}

function device(state: ManagedQuotaLimits["state"] = "ok"): ControlPlaneAdminDeviceRow {
  return {
    deviceId: "device-sensitive-1234567890",
    installId: "install-sensitive-1234567890",
    accountHandle: "acct_0123456789abcdef",
    policyId: "alpha-basic",
    policyLabel: "Alpha Basic",
    cohorts: [],
    status: "active",
    lastSeenAt: "2026-07-15T09:00:00.000Z",
    profiles: {
      uiProfile: null,
      capabilityProfile: null,
      quotaProfile: null,
      llmProfile: null,
      settingsDefaultsProfile: null,
    },
    limits: {
      managedUsage: managedQuota(),
      transcription: quota("audioSecond", state),
      aiActions: quota("aiAction"),
    },
  };
}

function event(overrides: Partial<AdminRequestEvent>): AdminRequestEvent {
  return {
    id: "request-redacted",
    ts: "2026-07-15T09:00:00.000Z",
    deviceId: "device-sensitive-1234567890",
    provider: "provider-test",
    model: "model-test",
    context: "voice-transcription",
    status: "success",
    transportMode: "proxied",
    costAuthority: "backend-reported",
    inputChars: 0,
    outputChars: 0,
    inputSeconds: 0,
    outputSeconds: null,
    durationMs: 1,
    ttftMs: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    actualCostUsd: null,
    billedCostUsd: null,
    pricingSource: null,
    providerRequestId: null,
    backendRequestId: "backend-redacted",
    usageKey: null,
    usageLimit: null,
    usageRemaining: null,
    usageResetAt: null,
    errorMessage: null,
    ...overrides,
  };
}

describe("usage admin projection", () => {
  test("aggregates STT, LLM, failures and prewarm without raw identifiers", () => {
    const rawDeviceId = "device-sensitive-1234567890";
    const projection = buildUsageAdminProjection(
      [device()],
      [
        event({ id: "stt", inputSeconds: 2.3456 }),
        event({ id: "llm", context: "preset.test", inputSeconds: null, status: "error" }),
      ],
      true,
      new Map([[rawDeviceId, { available: true, attempts: 4, successes: 3, failures: 1 }]]),
    );

    expect(projection.rows[0]).toMatchObject({
      accountHandle: "acct_0123456789abcdef",
      deviceHandle: "device…7890",
      sttSeconds: 2.346,
      llmActions: 1,
      failures: 1,
      prewarm: { available: true, attempts: 4, successes: 3, failures: 1 },
    });
    expect(projection.coverage).toMatchObject({ deviceCap: 20, recentEvents: 2, eventsPartial: true, prewarmRetentionDays: 7 });
    expect(JSON.stringify(projection)).not.toContain(rawDeviceId);
    expect(JSON.stringify(projection)).not.toContain("install-sensitive");
    expect(JSON.stringify(projection)).not.toContain("preset.test");
  });

  test("represents empty, unavailable and over-limit states honestly", () => {
    const empty = buildUsageAdminProjection([], [], false, new Map());
    expect(empty.rows).toEqual([]);
    expect(empty.coverage).toMatchObject({ knownDevices: 0, recentEvents: 0, eventsPartial: false });

    const unavailable = buildUsageAdminProjection([device("blocked")], [], false, new Map());
    expect(unavailable.rows[0]?.prewarm.available).toBe(false);
    expect(unavailable.rows[0]?.quota.transcription).toMatchObject({
      state: "blocked",
      rolling5hRemaining: 0,
    });
    expect(unavailable.coverage.prewarmUnavailableDevices).toBe(1);
  });

  test("uses bounded known devices, fails open on missing prewarm data, and performs no KV writes", async () => {
    const store = new MemoryKv();
    const registration = await registerDevice(store, {
      installId: "install-usage-admin-123456",
      deviceId: "device-usage-admin-123456",
      platform: "windows",
      arch: "x64",
      version: "0.1.0",
      hostname: "fixture",
      ts: "2026-07-15T09:00:00.000Z",
    }, { accountId: "google:account-sensitive-123456" });
    const writesBeforeProjection = store.putCount;

    const projection = await getUsageAdminProjection(store, {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => { throw new Error("prewarm summary unavailable"); } }),
    });

    expect(registration.deviceId).toBe("device-usage-admin-123456");
    expect(store.putCount).toBe(writesBeforeProjection);
    expect(projection.rows).toHaveLength(1);
    expect(projection.rows[0]?.accountHandle).toMatch(/^acc_[a-f0-9]{16}$/);
    expect(projection.rows[0]?.prewarm.available).toBe(false);
    expect(JSON.stringify(projection)).not.toContain("account-sensitive");
    expect(JSON.stringify(projection)).not.toContain(registration.deviceId);
  });
});
