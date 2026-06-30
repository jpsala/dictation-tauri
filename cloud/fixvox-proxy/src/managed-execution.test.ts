import { describe, expect, mock, test } from "bun:test";
import type { KvNamespaceLike } from "./admin-store";
import { registerDevice } from "./control-plane-store";
import { putRuntimePolicy } from "./runtime-policy-store";

mock.module("cloudflare:workers", () => ({
  DurableObject: class DurableObject {},
}));

const { default: worker } = await import("./index");

class MemoryKv implements KvNamespaceLike {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function createEnv(store: KvNamespaceLike) {
  return {
    GROQ_API_KEY: "test-groq-key",
    GOOGLE_CLOUD_CLIENT_ID: "test-google-client-id",
    GOOGLE_CLOUD_CLIENT_SECRET: "test-google-client-secret",
    ADMIN_API_KEY: "test-admin-key",
    USAGE: store,
    USAGE_COUNTERS: {} as DurableObjectNamespace,
  };
}

describe("desktop auth handoff", () => {
  test("serves the Tauri device-code login handoff without echoing raw state", async () => {
    const store = new MemoryKv();
    const rawState = "fxv_sensitive_state_1234567890";

    const response = await worker.fetch(
      new Request(`https://example.com/desktop/login?flow=device-code&client=fixvox-tauri&state=${rawState}`),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("Fixvox Cloud sign-in is ready");
    expect(body).toContain("Continue with Google");
    expect(body).toContain("device-code");
    expect(body).not.toContain(rawState);
    expect(await store.get(`auth:desktop:state:${rawState}`)).toContain("fixvox-tauri");

    const handoff = body.match(/\/desktop\/google\/start\?handoff=([a-f0-9-]+)/)?.[1];
    expect(handoff).toBeTruthy();
    expect(await store.get(`auth:desktop:handoff:${handoff}`)).toBe(rawState);

    const status = await worker.fetch(
      new Request(`https://example.com/desktop/login/status?state=${rawState}`),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      status: "pending",
      flow: "device-code",
      provider: null,
      redacted: true,
    });
  });

  test("starts Google from a desktop handoff without exposing tokens to the page", async () => {
    const store = new MemoryKv();
    const rawState = "fxv_google_state_1234567890";
    const page = await worker.fetch(
      new Request(`https://example.com/desktop/login?flow=device-code&client=fixvox-tauri&state=${rawState}`),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    const handoff = (await page.text()).match(/\/desktop\/google\/start\?handoff=([a-f0-9-]+)/)?.[1];
    expect(handoff).toBeTruthy();

    const response = await worker.fetch(
      new Request(`https://example.com/desktop/google/start?handoff=${handoff}`),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("accounts.google.com");
    expect(response.headers.get("Location")).toContain(encodeURIComponent(rawState));
    const authState = await store.get(`auth:google:state:${rawState}`);
    expect(authState).toContain("fixvox-tauri");
    expect(authState).not.toContain("access_token");
    expect(authState).not.toContain("refresh_token");
  });

  test("links a completed desktop Google login to the current device with redacted auth policy", async () => {
    const store = new MemoryKv();
    const rawState = "fxv_link_state_1234567890";
    await worker.fetch(
      new Request(`https://example.com/desktop/login?flow=device-code&client=fixvox-tauri&state=${rawState}`),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    await store.put(`auth:google:result:${rawState}`, JSON.stringify({
      status: "success",
      state: rawState,
      deviceId: "fixvox-tauri",
      createdAt: "2026-06-30T00:00:00.000Z",
      completedAt: "2026-06-30T00:01:00.000Z",
      profile: { sub: "google-sub-123456", email: "person@example.com" },
      token: { access_token: "secret-access-token", refresh_token: "secret-refresh-token" },
    }));

    const response = await worker.fetch(
      new Request("https://example.com/desktop/login/link-device", {
        method: "POST",
        body: JSON.stringify({
          state: rawState,
          installId: "install-link-device",
          version: "0.1.0",
          platform: "windows",
          arch: "x64",
          hostname: "dev-host",
          ts: "2026-06-30T00:02:00.000Z",
        }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok: boolean;
      deviceId: string;
      accountId: string | null;
      auth: Record<string, unknown>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.deviceId).toMatch(/^dev_/);
    expect(payload.accountId).toBe(null);
    expect(payload.auth).toMatchObject({
      accessMode: "signed_in",
      provider: "google",
      userRedacted: "p…@example.com",
      policyTemplateId: "alpha-basic",
      policyTemplateLabel: "Alpha Basic",
      redacted: true,
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain("google-sub-123456");
    expect(serialized).not.toContain("secret-access-token");
    expect(serialized).not.toContain("secret-refresh-token");

    const deviceRecord = await store.get(`control:device:${payload.deviceId}`);
    expect(deviceRecord).toContain("google:google-sub-123456");
  });

  test("rejects desktop device link before Google login completes", async () => {
    const store = new MemoryKv();
    const rawState = "fxv_pending_link_state_1234567890";
    await worker.fetch(
      new Request(`https://example.com/desktop/login?flow=device-code&client=fixvox-tauri&state=${rawState}`),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    const response = await worker.fetch(
      new Request("https://example.com/desktop/login/link-device", {
        method: "POST",
        body: JSON.stringify({ state: rawState, installId: "install-pending-link" }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { message: "Desktop login is still pending.", redacted: true },
    });
  });

  test("rejects malformed desktop login handoffs", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/desktop/login?flow=unknown&client=fixvox-tauri"),
      createEnv(new MemoryKv()) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { message: "Invalid desktop login request." } });
  });
});

describe("control-plane admin devices", () => {
  test("lists devices through the authenticated admin endpoint", async () => {
    const store = new MemoryKv();
    const registered = await registerDevice(store, {
      installId: "install-admin-route",
      version: "0.1.0",
      platform: "win32",
      ts: "2026-04-28T00:00:00.000Z",
    });

    const response = await worker.fetch(
      new Request("https://example.com/admin/control-plane/devices", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      source: "default",
      devices: [
        {
          deviceId: registered.deviceId,
          installId: "install-admin-route",
          policyId: "alpha-basic",
          policyLabel: "Alpha Basic",
          cohorts: ["alpha-basic"],
          status: "active",
          profiles: {
            uiProfile: "alpha-basic",
            capabilityProfile: "basic",
            quotaProfile: null,
            llmProfile: "locked-presets",
            settingsDefaultsProfile: "alpha-lulu",
          },
        },
      ],
      nextCursor: null,
    });
  });

  test("assigns device policy through the authenticated admin endpoint", async () => {
    const store = new MemoryKv();
    const registered = await registerDevice(store, {
      installId: "install-admin-route-assign",
      version: "0.1.0",
      platform: "win32",
    });

    const response = await worker.fetch(
      new Request("https://example.com/admin/control-plane/devices/policy", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deviceId: registered.deviceId, policyId: "alpha-full" }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      device: {
        deviceId: registered.deviceId,
        policyId: "alpha-full",
        policyLabel: "Alpha Full",
        cohorts: ["alpha-full"],
      },
    });
  });
});

describe("managed execution preflight", () => {
  test("rejects null execution preflight payload", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "null",
      }),
      createEnv(new MemoryKv()) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { message: "Invalid execution preflight payload." },
    });
  });

  test("denies managed preflight when device identity is missing", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "managed" }),
      }),
      createEnv(new MemoryKv()) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      allowed: false,
      reason: "device_not_registered",
    });
  });

  test("rejects invalid execution mode", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "local" }),
      }),
      createEnv(new MemoryKv()) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { message: "Invalid execution preflight payload." },
    });
  });

  test("allows byok preflight without device registration", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "byok" }),
      }),
      createEnv(new MemoryKv()) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      allowed: true,
      reason: null,
    });
  });

  test("denies managed preflight when quota is exhausted", async () => {
    const store = new MemoryKv();
    await putRuntimePolicy(store, {
      managedUsage: {
        estimatePerRequest: 1,
        globalMultiplier: 1,
        groups: {
          "alpha-private": {
            rolling5hLimit: 1,
            weeklyLimit: 1,
            quotaMultiplier: 1,
          },
        },
      },
    });
    const registration = await registerDevice(store, {
      installId: "install-quota",
      deviceId: "device-quota",
    });

    const first = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "managed",
          installId: "install-quota",
          deviceId: registration.deviceId,
        }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, allowed: true, reason: null });

    const second = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "managed",
          installId: "install-quota",
          deviceId: registration.deviceId,
        }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      ok: true,
      allowed: false,
      reason: "quota_exceeded",
      limits: {
        managedUsage: {
          state: "blocked",
          blockedWindow: "rolling5h",
          windows: {
            rolling5h: {
              used: 1,
              limit: 1,
              remaining: 0,
            },
          },
        },
      },
    });
  });

  test("denies managed preflight when only deviceId is provided", async () => {
    const store = new MemoryKv();
    const registration = await registerDevice(store, {
      installId: "install-1",
      deviceId: "device-1",
    });

    const response = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "managed", deviceId: registration.deviceId }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      allowed: false,
      reason: "device_not_registered",
    });
  });

  test("allows managed preflight when install binding exists", async () => {
    const store = new MemoryKv();
    const registration = await registerDevice(store, {
      installId: "install-1",
      deviceId: "device-1",
    });

    const response = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "managed",
          installId: "install-1",
          deviceId: registration.deviceId,
        }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      allowed: true,
      reason: null,
      limits: {
        managedUsage: {
          unit: "managedUsageUnit",
          windows: {
            rolling5h: {
              used: 1,
            },
            weekly: {
              used: 1,
            },
          },
        },
      },
    });
  });

  test("denies managed preflight when installId does not match provided deviceId", async () => {
    const store = new MemoryKv();
    await registerDevice(store, {
      installId: "install-1",
      deviceId: "device-1",
    });
    const otherRegistration = await registerDevice(store, {
      installId: "install-2",
      deviceId: "device-2",
    });

    const response = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "managed",
          installId: "install-1",
          deviceId: otherRegistration.deviceId,
        }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      allowed: false,
      reason: "device_not_registered",
    });
  });

  test("denies managed preflight for stale install alias after device rebind", async () => {
    const store = new MemoryKv();
    const registration = await registerDevice(store, {
      installId: "install-1",
      deviceId: "device-1",
    });

    await registerDevice(store, {
      installId: "install-2",
      deviceId: registration.deviceId,
    });

    const staleResponse = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "managed",
          installId: "install-1",
          deviceId: registration.deviceId,
        }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(staleResponse.status).toBe(200);
    expect(await staleResponse.json()).toEqual({
      ok: true,
      allowed: false,
      reason: "device_not_registered",
    });
  });
});
