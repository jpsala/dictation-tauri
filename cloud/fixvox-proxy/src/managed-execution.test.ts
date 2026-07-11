import { describe, expect, mock, test } from "bun:test";
import { persistRequestEvent, type KvNamespaceLike } from "./admin-store";
import { assignControlPlaneAdminAccountBudget, assignControlPlaneAdminAccountGroups, assignControlPlaneAdminAccountPolicy, assignControlPlaneAdminPolicyBudget, assignControlPlaneAdminPolicyEngines, createControlPlaneAdminGroup, registerDevice } from "./control-plane-store";
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

    const refresh = await worker.fetch(
      new Request("https://example.com/v2/device/register", {
        method: "POST",
        body: JSON.stringify({
          installId: "install-link-device",
          deviceId: payload.deviceId,
          version: "0.1.0",
          platform: "windows",
          arch: "x64",
          hostname: "dev-host",
          ts: "2026-06-30T00:03:00.000Z",
        }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    expect(refresh.status).toBe(200);
    const refreshPayload = await refresh.json() as { accountId: string | null; auth: Record<string, unknown> };
    expect(refreshPayload.accountId).toBe(null);
    expect(refreshPayload.auth).toMatchObject({
      accessMode: "signed_in",
      userRedacted: "user redacted",
      policyTemplateId: "alpha-basic",
      capabilities: [],
      redacted: true,
    });
    const refreshSerialized = JSON.stringify(refreshPayload);
    expect(refreshSerialized).not.toContain("person@example.com");
    expect(refreshSerialized).not.toContain("google-sub-123456");
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

  test("lists signed-in accounts without leaking raw account identifiers", async () => {
    const store = new MemoryKv();
    const accountId = "google:jpsala@gmail.com";
    const registered = await registerDevice(store, {
      installId: "install-admin-account-list",
      version: "0.1.0",
      platform: "win32",
    }, { accountId, authProviders: ["google"] });

    const response = await worker.fetch(
      new Request("https://example.com/admin/control-plane/accounts", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok: boolean;
      accounts: Array<{
        accountHandle: string;
        accountIdRedacted: string;
        userRedacted: string;
        userEmail: string | null;
        provider: string | null;
        variants: string[];
        segments: string[];
        deviceCount: number;
        devices: Array<{ deviceIdRedacted: string; policyId: string | null }>;
      }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.accounts).toHaveLength(1);
    expect(payload.accounts[0]).toMatchObject({
      accountIdRedacted: "account redacted",
      userRedacted: "j…@gmail.com",
      userEmail: "jpsala@gmail.com",
      provider: "google",
      variants: [],
      segments: [],
      deviceCount: 1,
      devices: [{ policyId: "alpha-basic" }],
    });
    expect(payload.accounts[0].accountHandle).toMatch(/^acc_[a-f0-9]{16}$/);
    expect(payload.accounts[0].devices[0].deviceIdRedacted).not.toBe(registered.deviceId);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(accountId);
  });

  test("assigns variants by account without leaking raw account identifiers", async () => {
    const store = new MemoryKv();
    const accountId = "google:segments-user@gmail.com";
    await registerDevice(store, {
      installId: "install-admin-account-segments",
      version: "0.1.0",
      platform: "win32",
    }, { accountId, authProviders: ["google"] });

    const listResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/accounts", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    const listPayload = await listResponse.json() as { availableSegments: string[]; variantOptions: Array<{ id: string }>; accounts: Array<{ accountHandle: string; variants: string[]; segments: string[] }> };
    expect(listPayload.availableSegments).toContain("debug-tools");
    expect(listPayload.variantOptions.map((item) => item.id)).toContain("debug-tools");
    const accountHandle = listPayload.accounts[0].accountHandle;

    const assignResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/accounts/variants/assign", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountHandle, variants: ["debug-tools", "new-ui", "unknown-segment", "new-ui"] }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(assignResponse.status).toBe(200);
    const assignPayload = await assignResponse.json() as { account: { variants: string[]; segments: string[] }; availableSegments: string[] };
    expect(assignPayload.account.variants).toEqual(["debug-tools", "new-ui"]);
    expect(assignPayload.account.segments).toEqual(["debug-tools", "new-ui"]);
    expect(assignPayload.availableSegments).toContain("best-voice");
    expect(JSON.stringify(assignPayload)).not.toContain(accountId);

    const refreshedResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/accounts", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    const refreshedPayload = await refreshedResponse.json() as { accounts: Array<{ variants: string[]; segments: string[] }> };
    expect(refreshedPayload.accounts[0].variants).toEqual(["debug-tools", "new-ui"]);
    expect(refreshedPayload.accounts[0].segments).toEqual(["debug-tools", "new-ui"]);
  });

  test("creates, edits, deletes account variants and allows assigning them", async () => {
    const store = new MemoryKv();
    const accountId = "google:variant-user@gmail.com";
    await registerDevice(store, {
      installId: "install-admin-account-variant",
      version: "0.1.0",
      platform: "win32",
    }, { accountId, authProviders: ["google"] });

    const createResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/accounts/variants", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ label: "Ultra fast", description: "prioriza latencia baja", preset: "lowCost" }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    expect(createResponse.status).toBe(200);
    const createPayload = await createResponse.json() as { variant: { id: string; label: string; preset: string; effects: string[] }; availableSegments: string[] };
    expect(createPayload.variant).toMatchObject({ id: "ultra-fast", label: "Ultra fast", preset: "lowCost" });
    expect(createPayload.variant.effects).toContain("modelTier: low-cost");
    expect(createPayload.availableSegments).toContain("ultra-fast");

    const editBuiltInResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/accounts/variants", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: "debug-tools", label: "Debug JP", description: "debug editable", preset: "debug" }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    expect(editBuiltInResponse.status).toBe(200);
    const editPayload = await editBuiltInResponse.json() as { variant: { id: string; label: string; source: string } };
    expect(editPayload.variant).toMatchObject({ id: "debug-tools", label: "Debug JP", source: "custom" });

    const listResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/accounts", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    const listPayload = await listResponse.json() as { variantOptions: Array<{ id: string }>; accounts: Array<{ accountHandle: string }> };
    expect(listPayload.variantOptions.map((item) => item.id)).toContain("ultra-fast");
    expect(listPayload.variantOptions.find((item) => item.id === "debug-tools")).toMatchObject({ id: "debug-tools" });

    const assignResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/accounts/variants/assign", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountHandle: listPayload.accounts[0].accountHandle, variants: ["ultra-fast"] }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    expect(assignResponse.status).toBe(200);
    const assignPayload = await assignResponse.json() as { account: { variants: string[]; segments: string[] } };
    expect(assignPayload.account.variants).toEqual(["ultra-fast"]);
    expect(assignPayload.account.segments).toEqual(["ultra-fast"]);

    const policyVariantsResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/policy/variants", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ policyId: "pro", variants: ["ultra-fast", "unknown"] }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    expect(policyVariantsResponse.status).toBe(200);
    const policyVariantsPayload = await policyVariantsResponse.json() as { policyVariants: Record<string, string[]> };
    expect(policyVariantsPayload.policyVariants.pro).toEqual(["ultra-fast"]);

    const policyEnginesResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/policy/engines", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ policyId: "pro", engines: { transcription: "stt-groq-whisper-turbo", postprocess: "postprocess-openrouter-premium", selectionTransform: "transform-off" } }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    expect(policyEnginesResponse.status).toBe(200);
    const policyEnginesPayload = await policyEnginesResponse.json() as { engineOptions: Array<{ id: string }>; policyEngines: Record<string, { transcription: string; postprocess: string; selectionTransform: string }> };
    expect(policyEnginesPayload.engineOptions.map((engine) => engine.id)).toContain("postprocess-openrouter-premium");
    expect(policyEnginesPayload.policyEngines.pro).toEqual({ transcription: "stt-groq-whisper-turbo", postprocess: "postprocess-openrouter-premium", selectionTransform: "transform-off" });

    const createEngineResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/engines", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ label: "Sonnet JP", kind: "postprocess", tier: "premium", provider: "openrouter", model: "anthropic/claude-sonnet-4", notes: "premium owner" }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    expect(createEngineResponse.status).toBe(200);
    const createEnginePayload = await createEngineResponse.json() as { engine: { id: string; label: string; source: string }; engineOptions: Array<{ id: string }> };
    expect(createEnginePayload.engine).toMatchObject({ id: "sonnet-jp", label: "Sonnet JP", source: "custom" });
    expect(createEnginePayload.engineOptions.map((engine) => engine.id)).toContain("sonnet-jp");

    const policyResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/policy", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    const policyPayload = await policyResponse.json() as { policyVariants: Record<string, string[]>; policyEngines: Record<string, { transcription: string }> };
    expect(policyPayload.policyVariants.pro).toEqual(["ultra-fast"]);
    expect(policyPayload.policyEngines.pro.transcription).toBe("stt-groq-whisper-turbo");

    const deleteResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/accounts/variants/delete", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: "ultra-fast" }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    expect(deleteResponse.status).toBe(200);
    const afterDeleteResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/accounts", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    const afterDeletePayload = await afterDeleteResponse.json() as { variantOptions: Array<{ id: string }>; accounts: Array<{ variants: string[] }> };
    expect(afterDeletePayload.variantOptions.map((item) => item.id)).not.toContain("ultra-fast");
    expect(afterDeletePayload.accounts[0].variants).toEqual([]);
    const afterDeletePolicyResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/policy", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    const afterDeletePolicyPayload = await afterDeletePolicyResponse.json() as { policyVariants: Record<string, string[]> };
    expect(afterDeletePolicyPayload.policyVariants.pro).toBeUndefined();
  });

  test("assigns policy by account and applies it to future linked devices", async () => {
    const store = new MemoryKv();
    const accountId = "google:account-policy-sub-123456";
    const first = await registerDevice(store, {
      installId: "install-admin-account-policy-1",
      version: "0.1.0",
      platform: "win32",
    }, { accountId, authProviders: ["google"] });
    const second = await registerDevice(store, {
      installId: "install-admin-account-policy-2",
      version: "0.1.0",
      platform: "win32",
    }, { accountId, authProviders: ["google"] });

    const listResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/accounts", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    const listPayload = await listResponse.json() as { accounts: Array<{ accountHandle: string }> };
    const accountHandle = listPayload.accounts[0].accountHandle;

    const assignResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/accounts/policy", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountHandle, policyId: "pro" }),
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );

    expect(assignResponse.status).toBe(200);
    const assignPayload = await assignResponse.json() as { devicesUpdated: number; account: { policyId: string } };
    expect(assignPayload).toMatchObject({ devicesUpdated: 2, account: { policyId: "pro" } });
    expect(JSON.stringify(assignPayload)).not.toContain(accountId);

    const devicesResponse = await worker.fetch(
      new Request("https://example.com/admin/control-plane/devices", {
        headers: { Authorization: "Bearer test-admin-key" },
      }),
      createEnv(store) as never,
      {} as ExecutionContext,
    );
    const devicesPayload = await devicesResponse.json() as { devices: Array<{ deviceId: string; policyId: string | null }> };
    const updated = devicesPayload.devices.filter((device) => [first.deviceId, second.deviceId].includes(device.deviceId));
    expect(updated.map((device) => device.policyId).sort()).toEqual(["pro", "pro"]);

    const third = await registerDevice(store, {
      installId: "install-admin-account-policy-3",
      version: "0.1.0",
      platform: "win32",
    }, { accountId, authProviders: ["google"] });
    expect(third.policyId).toBe("pro");
    expect(third.policyLabel).toBe("Pro");
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
      profile: {
        policyId: "alpha-basic",
      },
      engines: {
        selectedKind: "postprocess",
        selected: {
          id: "postprocess-off",
          provider: "none",
          model: "off",
        },
        byKind: {
          transcription: {
            id: "stt-groq-whisper-turbo",
            provider: "groq",
            model: "whisper-large-v3-turbo",
          },
        },
      },
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

  test("returns the profile engine selected for the requested execution kind", async () => {
    const store = new MemoryKv();
    const registration = await registerDevice(store, {
      installId: "install-1",
      deviceId: "device-1",
    });
    await assignControlPlaneAdminPolicyEngines(store, {
      policyId: "alpha-basic",
      engines: {
        transcription: "stt-groq-whisper-turbo",
        postprocess: "postprocess-groq-gpt-oss-120b",
        selectionTransform: "transform-groq-llama-70b",
      },
    });

    const response = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "managed",
          usageKind: "aiAction",
          engineKind: "selectionTransform",
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
      engines: {
        selectedKind: "selectionTransform",
        selected: {
          id: "transform-groq-llama-70b",
          provider: "groq",
          model: "llama-3.3-70b-versatile",
          promptKey: "selectionTransformBase",
        },
      },
    });
  });

  test("groups select runtime profile before account or device override", async () => {
    const store = new MemoryKv();
    const accountId = "google:paid-runtime";
    const registration = await registerDevice(store, {
      installId: "install-paid-runtime",
      deviceId: "device-paid-runtime",
    }, { accountId });
    await assignControlPlaneAdminAccountGroups(store, { accountId, groups: ["paid"] });

    const response = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "managed",
          usageKind: "aiAction",
          engineKind: "postprocess",
          installId: "install-paid-runtime",
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
      profile: {
        policyId: "pro",
        policyLabel: "Pro",
        policySource: "group",
        groups: ["paid"],
        matchedGroup: "paid",
      },
      engines: {
        selected: {
          id: "postprocess-groq-gpt-oss-120b",
        },
      },
    });
  });

  test("account profile assignment overrides group runtime profile", async () => {
    const store = new MemoryKv();
    const accountId = "google:account-runtime";
    const registration = await registerDevice(store, {
      installId: "install-account-runtime",
      deviceId: "device-account-runtime",
    }, { accountId });
    await assignControlPlaneAdminAccountGroups(store, { accountId, groups: ["paid"] });
    await assignControlPlaneAdminAccountPolicy(store, { accountId, policyId: "alpha-basic" });

    const response = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "managed",
          usageKind: "aiAction",
          engineKind: "postprocess",
          installId: "install-account-runtime",
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
      profile: {
        policyId: "alpha-basic",
        policySource: "account",
        groups: ["paid"],
        matchedGroup: null,
      },
      engines: {
        selected: {
          id: "postprocess-off",
        },
      },
    });
  });

  test("custom groups can carry runtime profile targeting", async () => {
    const store = new MemoryKv();
    const accountId = "google:custom-group-runtime";
    const registration = await registerDevice(store, {
      installId: "install-custom-group-runtime",
      deviceId: "device-custom-group-runtime",
    }, { accountId });
    await createControlPlaneAdminGroup(store, {
      id: "premium-lab",
      label: "Premium Lab",
      description: "Custom group with Pro runtime.",
      policyId: "pro",
    });
    await assignControlPlaneAdminAccountGroups(store, { accountId, groups: ["premium-lab"] });

    const response = await worker.fetch(
      new Request("https://example.com/v2/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "managed",
          usageKind: "transcription",
          engineKind: "transcription",
          installId: "install-custom-group-runtime",
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
      profile: {
        policyId: "pro",
        policySource: "group",
        groups: ["premium-lab"],
        matchedGroup: "premium-lab",
      },
    });
  });

  test("chat completion proxy binds requested profile engine model", async () => {
    const store = new MemoryKv();
    const registration = await registerDevice(store, {
      installId: "install-1",
      deviceId: "device-1",
    });
    await assignControlPlaneAdminPolicyEngines(store, {
      policyId: "alpha-basic",
      engines: {
        transcription: "stt-groq-whisper-turbo",
        postprocess: "postprocess-groq-gpt-oss-120b",
        selectionTransform: "transform-off",
      },
    });

    const originalFetch = globalThis.fetch;
    let upstreamPayload: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const rawBody = typeof init?.body === "string" ? init.body : await new Response(init?.body as BodyInit).text();
      upstreamPayload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
      return new Response(JSON.stringify({
        id: "chatcmpl-test",
        choices: [{ message: { content: "ok" }, finish_reason: "stop", index: 0 }],
        usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
      }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const response = await worker.fetch(
        new Request("https://example.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Device-Id": registration.deviceId,
            "X-Fixvox-Engine-Kind": "postprocess",
          },
          body: JSON.stringify({ model: "caller-model", stream: false, messages: [{ role: "user", content: "hola" }] }),
        }),
        createEnv(store) as never,
        { waitUntil() {} } as unknown as ExecutionContext,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("X-Fixvox-Profile-Id")).toBe("alpha-basic");
      expect(response.headers.get("X-Fixvox-Engine-Id")).toBe("postprocess-groq-gpt-oss-120b");
      expect(response.headers.get("X-Fixvox-Prompt-Id")).toBe("postProcessBase");
      await response.json();
      expect(upstreamPayload?.model).toBe("openai/gpt-oss-120b");
      const messages = upstreamPayload?.messages as Array<Record<string, unknown>>;
      expect(messages[0]).toMatchObject({ role: "system" });
      expect(String(messages[0]?.content)).toContain("Limpia el dictado");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("chat completion proxy blocks profile when budget is exceeded", async () => {
    const store = new MemoryKv();
    const registration = await registerDevice(store, {
      installId: "install-1",
      deviceId: "device-1",
    });
    await assignControlPlaneAdminPolicyEngines(store, {
      policyId: "alpha-basic",
      engines: {
        transcription: "stt-groq-whisper-turbo",
        postprocess: "postprocess-groq-gpt-oss-120b",
        selectionTransform: "transform-off",
      },
    });
    await assignControlPlaneAdminPolicyBudget(store, { policyId: "alpha-basic", budget: { dailyUsd: 0.01, monthlyUsd: 1, mode: "block" } });
    await persistRequestEvent(store, {
      id: "budget-event-1",
      ts: new Date().toISOString(),
      deviceId: registration.deviceId,
      provider: "groq",
      model: "openai/gpt-oss-120b",
      context: "preset.test",
      status: "success",
      transportMode: "proxied",
      costAuthority: "backend-reported",
      inputChars: 1,
      outputChars: 1,
      inputSeconds: null,
      outputSeconds: null,
      durationMs: 1,
      ttftMs: null,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      actualCostUsd: 0.02,
      billedCostUsd: 0.02,
      pricingSource: "test",
      providerRequestId: "provider-1",
      backendRequestId: "budget-event-1",
      engineId: "postprocess-groq-gpt-oss-120b",
      promptId: "postProcessBase",
      usageKey: null,
      usageLimit: null,
      usageRemaining: null,
      usageResetAt: null,
      errorMessage: null,
    });

    const response = await worker.fetch(
      new Request("https://example.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": registration.deviceId,
          "X-Fixvox-Engine-Kind": "postprocess",
        },
        body: JSON.stringify({ model: "caller-model", stream: false, messages: [{ role: "user", content: "hola" }] }),
      }),
      createEnv(store) as never,
      { waitUntil() {} } as unknown as ExecutionContext,
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ error: { code: "daily_budget_exceeded", policyId: "alpha-basic" } });
  });

  test("chat completion proxy uses account budget override before profile budget", async () => {
    const store = new MemoryKv();
    const accountId = "google:owner-budget";
    const registration = await registerDevice(store, {
      installId: "install-1",
      deviceId: "device-1",
    }, { accountId });
    await assignControlPlaneAdminPolicyEngines(store, {
      policyId: "alpha-basic",
      engines: {
        transcription: "stt-groq-whisper-turbo",
        postprocess: "postprocess-groq-gpt-oss-120b",
        selectionTransform: "transform-off",
      },
    });
    await assignControlPlaneAdminPolicyBudget(store, { policyId: "alpha-basic", budget: { dailyUsd: 10, monthlyUsd: 100, mode: "block" } });
    await assignControlPlaneAdminAccountBudget(store, { accountId, budget: { dailyUsd: 0.01, monthlyUsd: 1, mode: "block" } });
    await persistRequestEvent(store, {
      id: "account-budget-event-1",
      ts: new Date().toISOString(),
      deviceId: registration.deviceId,
      provider: "groq",
      model: "openai/gpt-oss-120b",
      context: "preset.test",
      status: "success",
      transportMode: "proxied",
      costAuthority: "backend-reported",
      inputChars: 1,
      outputChars: 1,
      inputSeconds: null,
      outputSeconds: null,
      durationMs: 1,
      ttftMs: null,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      actualCostUsd: 0.02,
      billedCostUsd: 0.02,
      pricingSource: "test",
      providerRequestId: "provider-1",
      backendRequestId: "account-budget-event-1",
      profileId: "alpha-basic",
      engineId: "postprocess-groq-gpt-oss-120b",
      promptId: "postProcessBase",
      usageKey: null,
      usageLimit: null,
      usageRemaining: null,
      usageResetAt: null,
      errorMessage: null,
    });

    const response = await worker.fetch(
      new Request("https://example.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": registration.deviceId,
          "X-Fixvox-Engine-Kind": "postprocess",
        },
        body: JSON.stringify({ model: "caller-model", stream: false, messages: [{ role: "user", content: "hola" }] }),
      }),
      createEnv(store) as never,
      { waitUntil() {} } as unknown as ExecutionContext,
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ error: { code: "daily_budget_exceeded", budgetSource: "account" } });
  });

  test("audio transcription proxy binds requested profile transcription engine", async () => {
    const store = new MemoryKv();
    const registration = await registerDevice(store, {
      installId: "install-1",
      deviceId: "device-1",
    });

    const originalFetch = globalThis.fetch;
    let upstreamModel: string | null = null;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const form = init?.body instanceof FormData ? init.body : await new Response(init?.body as BodyInit).formData();
      const model = form.get("model");
      upstreamModel = typeof model === "string" ? model : null;
      return new Response(JSON.stringify({ text: "hola mundo" }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const form = new FormData();
      form.set("model", "caller-whisper");
      form.set("file", new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/wav" }), "audio.wav");
      const response = await worker.fetch(
        new Request("https://example.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            "X-Device-Id": registration.deviceId,
            "X-Audio-Duration": "3",
          },
          body: form,
        }),
        createEnv(store) as never,
        { waitUntil() {} } as unknown as ExecutionContext,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("X-Fixvox-Profile-Id")).toBe("alpha-basic");
      expect(response.headers.get("X-Fixvox-Engine-Id")).toBe("stt-groq-whisper-turbo");
      expect(response.headers.get("X-Fixvox-Prompt-Id")).toBe("transcriptBase");
      expect(await response.json()).toEqual({ text: "hola mundo" });
      expect(upstreamModel).toBe("whisper-large-v3-turbo");
    } finally {
      globalThis.fetch = originalFetch;
    }
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
