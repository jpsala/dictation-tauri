import { describe, expect, test } from "bun:test";
import { createApiHandler, type ApiDependencies } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { createMockProviderProxy } from "../src/providers.ts";

const sentinels = ["synthetic-audio-sentinel-001", "synthetic-selection-sentinel-001", "fixture-provider-key-001", "fixture-device-001"];

function createDependencies(lines: string[] = []): ApiDependencies {
  return {
    config: loadConfig({ FIXVOX_API_DATABASE_URL: "postgres://fixvox_test@localhost/fixvox_test", FIXVOX_API_PUBLIC_BASE_URL: "https://auth.fixture.test", FIXVOX_API_MOCK_PROVIDERS: "true", FIXVOX_API_MAX_REQUEST_BYTES: "1024" }),
    devices: {
      async bindDevice() { return { deviceId: "fixture-device-001", created: true }; },
      async resolveDevice(deviceId) { return deviceId === "fixture-device-001" ? { deviceId } : null; },
      async resolveEffectiveProfile() { return { profileId: "basic", label: "Basic", version: 1, source: "fallback", definition: { capabilities: ["dictation"], engines: { chat: { provider: "mock", model: "chat-policy" }, audio: { provider: "mock", model: "audio-policy" } } } }; },
    },
    providers: createMockProviderProxy(),
    async preflight() { return { ok: true, allowed: true, reason: null, limits: {}, profile: { id: "basic" }, engines: {} }; },
    readiness: { async database() { return true; }, async schema() { return true; }, async jobs() { return true; }, async authorityMode() { return "cloudflare-authority"; } },
    logger: { info(event) { lines.push(JSON.stringify(event)); } },
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("Bun API adapter", () => {
  test("provides compatible health and safe readiness", async () => {
    const handler = createApiHandler(createDependencies());
    expect(await (await handler(new Request("https://fixture.test/health"))).json()).toEqual({ ok: true, service: "fixvox-api", date: "2026-01-01T00:00:00.000Z" });
    expect(await (await handler(new Request("https://fixture.test/ready"))).json()).toEqual({ ok: true, database: true, schema: true, jobs: true, authorityMode: "cloudflare-authority" });
  });

  test("binds a device and routes provider calls without persisting or logging content", async () => {
    const lines: string[] = [];
    const handler = createApiHandler(createDependencies(lines));
    const registered = await handler(new Request("https://fixture.test/v2/device/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ installId: "fixture-install-001", deviceId: "fixture-device-001" }) }));
    expect(registered.status).toBe(200);
    const chat = await handler(new Request("https://fixture.test/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", "x-device-id": "fixture-device-001" }, body: JSON.stringify({ messages: [{ content: "synthetic-selection-sentinel-001" }] }) }));
    expect(chat.status).toBe(200);
    expect((await chat.json() as { id: string }).id).toBe("fixture-provider-chat");
    const logs = lines.join("\n");
    for (const sentinel of sentinels) expect(logs).not.toContain(sentinel);
  });

  test("rejects a supplied but unregistered device before any upstream call", async () => {
    let calls = 0;
    const deps = createDependencies();
    deps.providers = { async proxy() { calls += 1; return Response.json({}); } };
    const handler = createApiHandler(deps);
    const response = await handler(new Request("https://fixture.test/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": "fixture-device-missing" },
      body: JSON.stringify({ model: "client-cannot-select", messages: [] }),
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "device_not_registered", reason: "device_not_registered" });
    expect(calls).toBe(0);
  });

  test("routes with profile-selected policy rather than client routing fields", async () => {
    let policy: unknown;
    const deps = createDependencies();
    deps.providers = { async proxy(input) { policy = input.policy; return Response.json({ id: "mock", choices: [] }); } };
    const handler = createApiHandler(deps);
    const response = await handler(new Request("https://fixture.test/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": "fixture-device-001" },
      body: JSON.stringify({ provider: "forbidden", model: "forbidden", messages: [] }),
    }));
    expect(response.status).toBe(200);
    expect(policy).toEqual({ profileId: "basic", engine: { provider: "mock", model: "chat-policy" } });
  });

  test("preserves Worker-shaped desktop-link and unknown-route errors", async () => {
    const handler = createApiHandler(createDependencies());
    const link = await handler(new Request("https://fixture.test/desktop/login/link-device", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
    }));
    expect(link.status).toBe(400);
    expect(await link.json()).toEqual({ error: { message: "Missing desktop login state.", redacted: true } });
    const missing = await handler(new Request("https://fixture.test/fixture/not-found"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { message: "Not found." } });
  });

  test("adds only the Worker-compatible mock provider telemetry headers", async () => {
    const handler = createApiHandler(createDependencies());
    const response = await handler(new Request("https://fixture.test/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", "x-device-id": "fixture-device-001" }, body: JSON.stringify({ messages: [] }),
    }));
    expect(response.headers.get("x-fixvox-profile-id")).toBe(null);
    expect(response.headers.get("x-fixvox-total-tokens")).toBe("0");
    expect(response.headers.get("x-provider-request-id")).toBe("mock");
  });

  test("rejects oversized streamed JSON and returns redacted JSON errors", async () => {
    const handler = createApiHandler(createDependencies());
    const response = await handler(new Request("https://fixture.test/v2/device/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ installId: "x".repeat(2048) }) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "request_too_large", reason: "request_too_large" });
  });
});
