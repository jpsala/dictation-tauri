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
      async resolveEffectiveProfile() { return { profileId: "basic", label: "Basic", version: 1, source: "fallback", definition: { capabilities: ["dictation", "postprocess", "selection_transform", "assistant"], quota: { limit: 20 }, engines: { chat: { provider: "mock", model: "chat-policy" }, audio: { provider: "mock", model: "audio-policy" } } } }; },
    },
    providers: createMockProviderProxy(),
    quota: {
      async reserve() { return { allowed: true, reservationId: crypto.randomUUID(), idempotent: false }; },
      async consume() {},
      async release() { return true; },
    },
    async preflight() { return { ok: true, allowed: true, reason: null, limits: {}, profile: { id: "basic" }, engines: {} }; },
    readiness: { async database() { return true; }, async schema() { return true; }, async jobs() { return true; }, async authorityMode() { return "cloudflare-authority"; } },
    logger: { info(event) { lines.push(JSON.stringify(event)); } },
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };
}

function transcriptionRequest(operationId: string, durationMs = 100): Request {
  const form = new FormData();
  form.set("metadata", JSON.stringify({ operationId, durationMs, language: "es" }));
  form.set("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }), "capture.wav");
  return new Request("https://fixture.test/product/v1/runtime/transcriptions", {
    method: "POST", headers: { "x-device-id": "fixture-device-001" }, body: form,
  });
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

  test("serves canonical bootstrap/context without exposing routing authority", async () => {
    const handler = createApiHandler(createDependencies());
    const bootstrap = await handler(new Request("https://fixture.test/product/v1/desktop/bootstrap", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ installId: "fixture-install", device: { platform: "windows", appVersion: "1.0" } }),
    }));
    expect(bootstrap.status).toBe(200);
    const encoded = JSON.stringify(await bootstrap.json());
    expect(encoded).toContain('"quotaClass":"metered"');
    expect(encoded).not.toMatch(/chat-policy|audio-policy|provider|model/i);
    const context = await handler(new Request("https://fixture.test/product/v1/desktop/context", { headers: { "x-device-id": "fixture-device-001" } }));
    expect(context.status).toBe(200);
  });

  test("runs canonical transcription through one reserve and one provider call", async () => {
    let calls = 0; let reserves = 0; let consumes = 0;
    const deps = createDependencies();
    deps.providers = { async proxy() { calls++; return Response.json({ text: "safe transcript" }); } };
    deps.quota = { async reserve() { reserves++; return { allowed: true, reservationId: "stt-reservation", idempotent: false }; }, async consume() { consumes++; }, async release() { return true; } };
    const form = new FormData();
    form.set("metadata", JSON.stringify({ operationId: "stt-operation", durationMs: 100, language: "es" }));
    form.set("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }), "capture.wav");
    const response = await createApiHandler(deps)(new Request("https://fixture.test/product/v1/runtime/transcriptions", {
      method: "POST", headers: { "x-device-id": "fixture-device-001" }, body: form,
    }));
    expect(response.status).toBe(200);
    expect({ calls, reserves, consumes }).toEqual({ calls: 1, reserves: 1, consumes: 1 });
    expect(JSON.stringify(await response.json())).toContain("safe transcript");
  });

  test("shadows canonical STT with account-first limits and settles provider cost", async () => {
    const receipts: unknown[] = [];
    const calls = { reserve: 0, settle: 0, release: 0 };
    let reserveInput: Record<string, unknown> | null = null;
    let settled: Record<string, unknown> | null = null;
    const deps = createDependencies();
    deps.devices.resolveDevice = async () => ({
      deviceId: "fixture-device-001",
      accountBudget: { dailyMicrousd: 500, monthlyMicrousd: null, mode: "warn" },
    });
    deps.devices.resolveEffectiveProfile = async () => ({
      profileId: "basic", label: "Basic", version: 1, source: "fallback",
      definition: {
        capabilities: ["dictation", "postprocess", "selection_transform", "assistant"],
        quota: { limit: 20 }, limits: { mode: "block", dailyUsd: 1, monthlyUsd: 10 },
        engines: { audio: { provider: "mock", model: "audio-policy" } },
      },
    });
    deps.providers = { async proxy() { return Response.json({ text: "safe transcript" }, { headers: { "x-fixvox-cost-usd": "0.000123" } }); } };
    deps.budgetPricing = { async sttPriceMicrousd() { return 3_600_000; } };
    deps.budgetLedger = {
      async reserve(input) { calls.reserve++; reserveInput = input as unknown as Record<string, unknown>; return { allowed: true, reason: null, reservationId: "private-ledger-id", idempotent: false, snapshot: null }; },
      async settle(input) { calls.settle++; settled = input; return { state: "settled", idempotent: false, snapshot: { daily: { periodKey: "2026-01-01", spentMicrousd: 123, reservedMicrousd: 0, revision: 1 }, monthly: { periodKey: "2026-01-01", spentMicrousd: 123, reservedMicrousd: 0, revision: 1 } } }; },
      async release() { calls.release++; throw new Error("unexpected release"); },
      async snapshot() { throw new Error("unexpected snapshot"); },
    };
    deps.budgetShadowReceipt = (receipt) => receipts.push(receipt);

    const handler = createApiHandler(deps);
    const response = await handler(transcriptionRequest("stable-stt-operation", 100));
    expect(response.status).toBe(200);
    expect((await handler(transcriptionRequest("stable-stt-operation", 100))).status).toBe(409);
    expect(calls).toEqual({ reserve: 1, settle: 1, release: 0 });
    expect(reserveInput).toEqual({
      requestId: "stable-stt-operation", estimatedMicrousd: 100, mode: "warn",
      limits: { dailyMicrousd: 500, monthlyMicrousd: 10_000_000 },
      scope: { type: "device", id: "fixture-device-001" },
      occurredAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:01:00.000Z",
    });
    expect(settled).toEqual({ requestId: "stable-stt-operation", actualMicrousd: 123 });
    expect(receipts).toEqual([{ status: "match", legacyAllowed: true, ledgerAllowed: true, legacyReason: null, ledgerReason: null }]);
    expect(JSON.stringify(receipts)).not.toMatch(/private-ledger-id|stable-stt-operation|123/);
  });

  test("settles the conservative estimate when provider cost is absent", async () => {
    let actualMicrousd = -1;
    const deps = createDependencies();
    deps.providers = { async proxy() { return Response.json({ text: "safe transcript" }); } };
    deps.budgetPricing = { async sttPriceMicrousd() { return 3_600_000; } };
    deps.budgetLedger = {
      async reserve() { return { allowed: true, reason: null, reservationId: "reservation", idempotent: false, snapshot: null }; },
      async settle(input) { actualMicrousd = input.actualMicrousd; return { state: "settled", idempotent: false, snapshot: { daily: { periodKey: "2026-01-01", spentMicrousd: 0, reservedMicrousd: 0, revision: 1 }, monthly: { periodKey: "2026-01-01", spentMicrousd: 0, reservedMicrousd: 0, revision: 1 } } }; },
      async release() { throw new Error("unexpected release"); }, async snapshot() { throw new Error("unexpected snapshot"); },
    };
    const response = await createApiHandler(deps)(transcriptionRequest("estimated-stt-operation", 250));
    expect(response.status).toBe(200);
    expect(actualMicrousd).toBe(250);
  });

  test("reduces missing STT pricing to a redacted error receipt without changing the response", async () => {
    const receipts: unknown[] = [];
    let ledgerReserves = 0;
    const deps = createDependencies();
    deps.providers = { async proxy() { return Response.json({ text: "safe transcript" }); } };
    deps.budgetPricing = { async sttPriceMicrousd() { return null; } };
    deps.budgetLedger = {
      async reserve() { ledgerReserves++; throw new Error("private-ledger-detail"); },
      async settle() { throw new Error("unexpected settle"); }, async release() { throw new Error("unexpected release"); }, async snapshot() { throw new Error("unexpected snapshot"); },
    };
    deps.budgetShadowReceipt = (receipt) => receipts.push(receipt);
    const response = await createApiHandler(deps)(transcriptionRequest("private-operation"));
    expect(response.status).toBe(200);
    expect(ledgerReserves).toBe(0);
    expect(receipts).toEqual([{ status: "error", legacyAllowed: true, ledgerAllowed: false, legacyReason: null, ledgerReason: "ledger_unavailable" }]);
    expect(JSON.stringify(receipts)).not.toMatch(/private|operation/);
  });

  test("releases STT shadow reservation on provider failure without changing legacy authority", async () => {
    const receipts: unknown[] = [];
    let released = 0;
    const deps = createDependencies();
    deps.providers = { async proxy() { throw new Error("provider failed"); } };
    deps.budgetPricing = { async sttPriceMicrousd() { return 3_600_000; } };
    deps.budgetLedger = {
      async reserve() { return { allowed: false, reason: "daily_limit", reservationId: null, idempotent: false, snapshot: null }; },
      async settle() { throw new Error("unexpected settle"); }, async release() { released++; throw new Error("unexpected release"); }, async snapshot() { throw new Error("unexpected snapshot"); },
    };
    deps.budgetShadowReceipt = (receipt) => receipts.push(receipt);
    const response = await createApiHandler(deps)(transcriptionRequest("failed-stt-operation"));
    expect(response.status).toBe(502);
    expect(released).toBe(0);
    expect(receipts).toEqual([{ status: "mismatch", legacyAllowed: true, ledgerAllowed: false, legacyReason: null, ledgerReason: "daily_limit" }]);
  });

  test("releases an admitted STT shadow reservation when provider work fails", async () => {
    let releases = 0;
    const deps = createDependencies();
    deps.providers = { async proxy() { throw new Error("provider failed"); } };
    deps.budgetPricing = { async sttPriceMicrousd() { return 3_600_000; } };
    deps.budgetLedger = {
      async reserve() { return { allowed: true, reason: null, reservationId: "reservation", idempotent: false, snapshot: null }; },
      async settle() { throw new Error("unexpected settle"); },
      async release(input) { releases++; expect(input).toEqual({ requestId: "release-stt-operation", reason: "released" }); return { state: "released", idempotent: false, snapshot: { daily: { periodKey: "2026-01-01", spentMicrousd: 0, reservedMicrousd: 0, revision: 1 }, monthly: { periodKey: "2026-01-01", spentMicrousd: 0, reservedMicrousd: 0, revision: 1 } } }; },
      async snapshot() { throw new Error("unexpected snapshot"); },
    };
    const response = await createApiHandler(deps)(transcriptionRequest("release-stt-operation"));
    expect(response.status).toBe(502);
    expect(releases).toBe(1);
  });

  test("rejects non-canonical transcription parts before quota or provider work", async () => {
    let calls = 0; let reserves = 0;
    const deps = createDependencies();
    deps.providers = { async proxy() { calls++; return Response.json({}); } };
    deps.quota = { async reserve() { reserves++; return { allowed: true, reservationId: "unexpected", idempotent: false }; }, async consume() {}, async release() { return true; } };
    const form = new FormData();
    form.set("metadata", JSON.stringify({ operationId: "bad-stt", durationMs: 100 }));
    form.set("audio", new Blob([new Uint8Array([1])], { type: "audio/wav" }), "capture.wav");
    form.set("model", "client-authority-forbidden");
    const response = await createApiHandler(deps)(new Request("https://fixture.test/product/v1/runtime/transcriptions", {
      method: "POST", headers: { "x-device-id": "fixture-device-001" }, body: form,
    }));
    expect(response.status).toBe(400);
    expect({ calls, reserves }).toEqual({ calls: 0, reserves: 0 });
  });

  test("runs each typed action through one authoritative reserve and exactly one provider call", async () => {
    for (const fixture of [
      { kind: "postprocess", input: { transcript: "synthetic-transcript-sentinel" } },
      { kind: "selection_transform", input: { selectedText: "synthetic-selection-sentinel-001", instruction: "shorten" } },
      { kind: "assistant", input: { utterance: "synthetic-assistant-sentinel" } },
    ]) {
      let calls = 0; let reserves = 0; let consumes = 0;
      const deps = createDependencies();
      deps.providers = { async proxy() { calls++; return Response.json({ choices: [{ message: { content: "safe output" } }] }); } };
      deps.quota = { async reserve() { reserves++; return { allowed: true, reservationId: crypto.randomUUID(), idempotent: false }; }, async consume() { consumes++; }, async release() { return true; } };
      const handler = createApiHandler(deps);
      const response = await handler(new Request("https://fixture.test/product/v1/runtime/actions", { method: "POST", headers: { "content-type": "application/json", "x-device-id": "fixture-device-001" }, body: JSON.stringify({ operationId: `op-${fixture.kind}`, ...fixture }) }));
      expect(response.status).toBe(200);
      expect({ calls, reserves, consumes }).toEqual({ calls: 1, reserves: 1, consumes: 1 });
    }
  });

  test("forwards typed selection inputs while keeping provider authority server-owned", async () => {
    let forwarded = "";
    let policy: unknown;
    const deps = createDependencies();
    deps.providers = { async proxy(input) { forwarded = await input.request.text(); policy = input.policy; return Response.json({ choices: [{ message: { content: "safe output" } }] }); } };
    const response = await createApiHandler(deps)(new Request("https://fixture.test/product/v1/runtime/actions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": "fixture-device-001" },
      body: JSON.stringify({ operationId: "typed-selection", kind: "selection_transform", input: { selectedText: "private text", instruction: "shorten", presetKey: "corregir-texto" } }),
    }));
    expect(response.status).toBe(200);
    expect(forwarded).toContain('\\"selectedText\\":\\"private text\\"');
    expect(forwarded).toContain('\\"instruction\\":\\"shorten\\"');
    expect(forwarded).toContain('\\"presetKey\\":\\"corregir-texto\\"');
    expect(forwarded).not.toContain("client-model");
    expect(policy).toEqual({ profileId: "basic", engine: { provider: "mock", model: "chat-policy" } });
  });

  test("idempotent replay never dispatches or consumes twice", async () => {
    let calls = 0; let reserves = 0; let consumes = 0;
    const deps = createDependencies();
    deps.providers = { async proxy() { calls++; return Response.json({ choices: [{ message: { content: "safe" } }] }); } };
    deps.quota = { async reserve() { reserves++; return { allowed: true, reservationId: "reservation", idempotent: false }; }, async consume() { consumes++; }, async release() { return true; } };
    const handler = createApiHandler(deps);
    const request = () => new Request("https://fixture.test/product/v1/runtime/actions", {
      method: "POST", headers: { "content-type": "application/json", "x-device-id": "fixture-device-001" },
      body: JSON.stringify({ operationId: "replay-op", kind: "assistant", input: { utterance: "private" } }),
    });
    expect((await handler(request())).status).toBe(200);
    expect((await handler(request())).status).toBe(409);
    expect({ calls, reserves, consumes }).toEqual({ calls: 1, reserves: 1, consumes: 1 });
  });

  test("denied and ambiguous operations preserve the zero/one provider-call matrix", async () => {
    let calls = 0;
    const denied = createDependencies();
    denied.providers = { async proxy() { calls++; return Response.json({}); } };
    denied.quota = { async reserve() { return { allowed: false, reservationId: null, idempotent: false }; }, async consume() {}, async release() { return true; } };
    const deniedResponse = await createApiHandler(denied)(new Request("https://fixture.test/product/v1/runtime/actions", { method: "POST", headers: { "content-type": "application/json", "x-device-id": "fixture-device-001" }, body: JSON.stringify({ operationId: "denied-op", kind: "postprocess", input: { transcript: "private" } }) }));
    expect(deniedResponse.status).toBe(429);
    expect(calls).toBe(0);

    let consumedOutcome = "";
    const ambiguous = createDependencies();
    ambiguous.providers = { async proxy() { calls++; throw new Error("ambiguous"); } };
    ambiguous.quota = { async reserve() { return { allowed: true, reservationId: "reservation", idempotent: false }; }, async consume(input) { consumedOutcome = input.outcome; }, async release() { return true; } };
    const ambiguousResponse = await createApiHandler(ambiguous)(new Request("https://fixture.test/product/v1/runtime/actions", { method: "POST", headers: { "content-type": "application/json", "x-device-id": "fixture-device-001" }, body: JSON.stringify({ operationId: "ambiguous-op", kind: "assistant", input: { utterance: "private" } }) }));
    expect(ambiguousResponse.status).toBe(502);
    expect(calls).toBe(1);
    expect(consumedOutcome).toBe("ambiguous");
  });

  test("pro-unlimited dispatches once with zero reservation/event writes", async () => {
    let calls = 0; let writes = 0;
    const deps = createDependencies();
    const original = deps.devices.resolveEffectiveProfile;
    deps.devices.resolveEffectiveProfile = async (input) => ({ ...(await original(input))!, definition: { ...(await original(input))!.definition, quota: { profile: "pro-unlimited" } } });
    deps.providers = { async proxy() { calls++; return Response.json({ choices: [{ message: { content: "safe" } }] }); } };
    deps.quota = { async reserve(input) { expect(input.unlimited).toBe(true); return { allowed: true, reservationId: null, idempotent: false }; }, async consume() { writes++; }, async release() { writes++; return true; } };
    const response = await createApiHandler(deps)(new Request("https://fixture.test/product/v1/runtime/actions", { method: "POST", headers: { "content-type": "application/json", "x-device-id": "fixture-device-001" }, body: JSON.stringify({ operationId: "unlimited-op", kind: "assistant", input: { utterance: "private" } }) }));
    expect(response.status).toBe(200);
    expect({ calls, writes }).toEqual({ calls: 1, writes: 0 });
  });

  test("retains only bounded redacted canonical signals", async () => {
    const deps = createDependencies();
    let stored: unknown;
    deps.feedback = { async submit(input) { stored = input; return "feedback-redacted"; } };
    const handler = createApiHandler(deps);
    const headers = { "content-type": "application/json", "x-device-id": "fixture-device-001" };
    const events = await handler(new Request("https://fixture.test/product/v1/signals/events", { method: "POST", headers, body: JSON.stringify({ events: [{ id: "evt-1", kind: "runtime_succeeded", dimensions: { elapsed_ms: 12, cached: false } }] }) }));
    expect(events.status).toBe(200);
    expect(await events.json()).toEqual({ ok: true, data: { accepted: 1, acceptedIds: ["evt-1"] } });
    const sensitive = await handler(new Request("https://fixture.test/product/v1/signals/events", { method: "POST", headers, body: JSON.stringify({ events: [{ id: "evt-2", kind: "runtime_succeeded", dimensions: { transcript: "raw" } }] }) }));
    expect(sensitive.status).toBe(400);
    const tooMany = await handler(new Request("https://fixture.test/product/v1/signals/events", { method: "POST", headers, body: JSON.stringify({ events: Array.from({ length: 51 }, (_, index) => ({ id: `evt-${index}`, kind: "runtime_succeeded", dimensions: {} })) }) }));
    expect(tooMany.status).toBe(413);
    const feedback = await handler(new Request("https://fixture.test/product/v1/signals/feedback", { method: "POST", headers, body: JSON.stringify({ category: "issue", rating: 2, note: "not persisted" }) }));
    expect(feedback.status).toBe(202);
    expect(stored).toEqual({ classification: "issue", deviceId: "fixture-device-001" });
    const rawContent = await handler(new Request("https://fixture.test/product/v1/signals/feedback", { method: "POST", headers, body: JSON.stringify({ category: "issue", rating: 2, transcript: "forbidden" }) }));
    expect(rawContent.status).toBe(400);
    expect((await handler(new Request("https://fixture.test/product/v1/support/tickets"))).status).toBe(404);
    expect((await handler(new Request("https://fixture.test/product/v1/internal/prewarm"))).status).toBe(404);
  });

  test("serves the canonical one-time desktop auth handoff without exposing OAuth authority", async () => {
    const deps = createDependencies();
    let sessionHash = "";
    deps.auth = {
      async createDesktopHandoff(input) { sessionHash = input.sessionHash; },
      async readDesktopHandoff() { return { sessionHash, expiresAt: new Date("2026-01-01T00:05:00.000Z") }; },
      async readDesktopStatus(input) { return input === sessionHash ? { status: "completed", expiresAt: new Date("2026-01-01T00:05:00.000Z"), completedAt: new Date("2026-01-01T00:01:00.000Z") } : null; },
      async createOAuthState() {}, async attachDesktopOAuthState() { return true; }, async readOAuthState() { return null; },
      async readOAuthResult() { return null; }, async consumeOAuthState() { return null; }, async completeOAuthState() { return true; },
      async failOAuthState() { return true; }, async claimDesktopDevice() { return { deviceId: "fixture-device-001", accountId: "redacted" }; },
    };
    const handler = createApiHandler(deps);
    const started = await handler(new Request("https://fixture.test/product/v1/desktop/auth/sessions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "fixture-device-001", returnTo: "fixvox-tauri" }),
    }));
    expect(started.status).toBe(200);
    const startData = (await started.json() as { data: { handoffId: string; verificationUri: string } }).data;
    expect(startData.verificationUri).toBe(`https://auth.fixture.test/product/v1/desktop/auth/browser/${startData.handoffId}`);
    const status = await handler(new Request(`https://fixture.test/product/v1/desktop/auth/sessions/${startData.handoffId}`));
    const statusData = (await status.json() as { data: { status: string; claimProof: string } }).data;
    expect(statusData.status).toBe("approved");
    expect(statusData.claimProof).toBe(startData.handoffId);
    const claimed = await handler(new Request(`https://fixture.test/product/v1/desktop/auth/sessions/${startData.handoffId}/claim`, {
      method: "POST", headers: { "content-type": "application/json", "x-fixvox-install-id": "fixture-install" },
      body: JSON.stringify({ deviceId: "fixture-device-001", claimProof: statusData.claimProof }),
    }));
    expect(claimed.status).toBe(200);
    const encoded = JSON.stringify(await claimed.json());
    expect(encoded).not.toMatch(/oauth|google|accountId|provider|model/i);
  });
});
