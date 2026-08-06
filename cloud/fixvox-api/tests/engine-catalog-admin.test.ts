/// <reference path="../src/bun-test.d.ts" />

import { describe, expect, test } from "bun:test";
import { handleAdminRoute } from "../src/routes/admin.ts";

const principalKey = `arp_${"a".repeat(64)}`;
const engineId = "groq:selection:llama-3.3-70b-versatile";
const entry = { engineId, lifecycleStatus: "candidate", availability: "available", revision: 0 };

function deps(overrides: Record<string, unknown> = {}) {
  return {
    keys: { publish: "publish-key" },
    repository: {
      async roleForPrincipal() { return "publisher" as const; },
      async linkedPrincipals() { return { principals: [], bindings: [] }; },
    },
    profileCommands: {},
    engineCatalog: {
      async list() { return [entry]; },
      async catalogAudits() { return []; },
      async publish() { return { entry: { ...entry, lifecycleStatus: "published", revision: 1 }, audit: { action: "publish" }, idempotentReplay: false }; },
      async retire() { return { entry: { ...entry, lifecycleStatus: "retired", availability: "retired", revision: 1 }, audit: { action: "retire" }, idempotentReplay: false }; },
      ...overrides,
    },
  } as never;
}

function request(action: "publish" | "retire", expectedRevision = 0) {
  return new Request(`https://control-room.test/product/v1/control-room/engine-catalog/${encodeURIComponent(engineId)}/${action}`, {
    method: "POST",
    headers: {
      authorization: "Bearer publish-key",
      "x-fixvox-principal-key": principalKey,
      "x-fixvox-recent-google-at": new Date().toISOString(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ expectedRevision, confirmation: { action, engineId, expectedRevision, phrase: `${action.toUpperCase()} ${engineId} REV ${expectedRevision}` } }),
  });
}

describe("engine catalog admin lifecycle", () => {
  test("requires the explicit publish confirmation and returns an audit receipt", async () => {
    const response = await handleAdminRoute(request("publish"), new URL(request("publish").url), deps());
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ ok: true, data: { engine: { lifecycleStatus: "published" }, audit: { action: "publish" }, idempotentReplay: false } });
  });

  test("rejects a confirmation phrase that does not match the engine/revision", async () => {
    const bad = new Request(request("publish").url, { method: "POST", headers: Object.fromEntries(request("publish").headers), body: JSON.stringify({ expectedRevision: 0, confirmation: { action: "publish", engineId, expectedRevision: 0, phrase: "PUBLISH wrong REV 0" } }) });
    const response = await handleAdminRoute(bad, new URL(bad.url), deps());
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: { code: "invalid_confirmation" } });
  });
});
