import { describe, expect, test } from "bun:test";

import { authorizeAdminBearer } from "./auth/admin-authorization";
import { createJsonAuthSessionStore } from "./auth/session-store";
import { DeviceBindingConflictError, resolveDeviceBinding } from "./control-plane/device-binding";
import { resolveEffectiveRuntimeProfile } from "./control-plane/policy-resolution";
import { deriveQuotaState, quotaWouldExceed } from "./execution/quota";
import { scheduleBackgroundJobs } from "./jobs/schedule";

class MemoryStorage {
  readonly values = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async put(key: string, value: string): Promise<void> { this.values.set(key, value); }
}

function parseMappedBinding(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as string;
  } catch {
    return null;
  }
}

function parseBindingRecord(raw: string | null): { installId: string } | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { installId: string };
  } catch {
    return null;
  }
}

describe("platform-neutral control-plane slices", () => {
  test("resolves account, device, group, then base policy priority", () => {
    const shared = {
      basePolicyId: "starter",
      basePolicyLabel: "Starter",
      defaultPolicyId: "starter",
      accountHandle: "acct-redacted",
      accountBudget: null,
      activeGroups: ["team"],
      groupOptions: [{ id: "team", policyId: "pro" }],
      policyOptions: [{ policyId: "starter", policyLabel: "Starter" }, { policyId: "pro", policyLabel: "Pro" }],
    };
    expect(resolveEffectiveRuntimeProfile({ ...shared, accountAssignment: { policyId: "pro" } }).policySource).toBe("account");
    expect(resolveEffectiveRuntimeProfile({ ...shared, basePolicyId: "pro", accountAssignment: null }).policySource).toBe("device");
    expect(resolveEffectiveRuntimeProfile({ ...shared, accountAssignment: null }).policySource).toBe("group");
    expect(resolveEffectiveRuntimeProfile({ ...shared, activeGroups: [], accountAssignment: null }).policySource).toBe("base");
    expect(resolveEffectiveRuntimeProfile({
      ...shared,
      basePolicyId: "custom-tier",
      basePolicyLabel: null,
      activeGroups: [],
      policyOptions: [],
      accountAssignment: null,
    }).policyLabel).toBe("Custom Tier");
  });

  test("resolves device bindings with injected storage and IDs", async () => {
    const storage = new MemoryStorage();
    const input = {
      storage,
      ids: { randomUuid: () => "generated" },
      installId: "install-a",
      suppliedDeviceId: null,
      installKey: (id: string) => `install:${id}`,
      deviceKey: (id: string) => `device:${id}`,
      parseMappedDeviceId: parseMappedBinding,
      parseRecord: parseBindingRecord,
    };
    expect((await resolveDeviceBinding(input)).deviceId).toBe("dev_generated");
    storage.values.set("install:install-a", JSON.stringify("device-existing"));
    expect((await resolveDeviceBinding(input)).deviceId).toBe("device-existing");
    await expect(resolveDeviceBinding({ ...input, suppliedDeviceId: "device-other" })).rejects.toBeInstanceOf(DeviceBindingConflictError);
  });

  test("keeps quota decisions deterministic", () => {
    const windows = {
      rolling5h: { used: 9, remaining: 1, limit: 10 },
      weekly: { used: 20, remaining: 80, limit: 100 },
    };
    expect(deriveQuotaState(windows).state).toBe("almost_used");
    expect(quotaWouldExceed({ windows }, 2)).toBe("rolling5h");
  });

  test("authorizes bearer capabilities without host APIs", () => {
    const credentials = [["view-token", "view"], ["publish-token", "publish"]] as const;
    expect(authorizeAdminBearer([...credentials], "Bearer publish-token", "edit")).toBeNull();
    expect(authorizeAdminBearer([...credentials], "Bearer view-token", "edit")).toBe("insufficient_admin_capability");
    expect(authorizeAdminBearer([], null, "view")).toBe("missing_admin_api_key");
  });

  test("serializes auth sessions and schedules jobs through ports", async () => {
    const storage = new MemoryStorage();
    const sessions = createJsonAuthSessionStore({
      get: (key) => storage.get(key),
      put: (key, value) => storage.put(key, value),
    });
    await sessions.putJson("session", { ok: true }, 60);
    expect(await sessions.getJson("session")).toEqual({ ok: true });

    const scheduled: Promise<unknown>[] = [];
    scheduleBackgroundJobs({ schedule: (task) => scheduled.push(task) }, [async () => "done"]);
    expect(await Promise.all(scheduled)).toEqual(["done"]);
  });
});
