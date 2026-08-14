/// <reference path="../src/bun-test.d.ts" />

import { describe, expect, test } from "bun:test";
import { handleAdminRoute } from "../src/routes/admin.ts";
import { GATE_A_DEFINITION } from "../../fixvox-core/src/control-plane/evaluation-recipes.ts";

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

describe("desktop laboratory authorization", () => {
  test("accepts a role-bound desktop session and derives operator identity server-side", async () => {
    const sessions = {
      async authorizeBearer(_tokenHash: string, _now: Date, deviceId?: string) {
        expect(deviceId).toBe("device-lab");
        return { capability: "publish" as const, recentGoogle: true, principalKey, role: "owner" as const };
      },
    };
    const request = new Request("https://control-room.test/product/v1/control-room/session", {
      headers: { authorization: "Bearer desktop-session", "x-device-id": "device-lab" },
    });
    const response = await handleAdminRoute(request, new URL(request.url), { ...deps(), sessions } as never);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ ok: true, role: "owner", principalKey, recentGoogle: true });
  });

  test("does not trust desktop-supplied operator headers without an authorized session", async () => {
    const sessions = { async authorizeBearer() { return null; } };
    const request = new Request("https://control-room.test/product/v1/control-room/session", {
      headers: {
        authorization: "Bearer desktop-session",
        "x-device-id": "device-lab",
        "x-fixvox-principal-key": principalKey,
        "x-fixvox-recent-google-at": new Date().toISOString(),
      },
    });
    const response = await handleAdminRoute(request, new URL(request.url), { ...deps(), sessions } as never);
    expect(response?.status).toBe(401);
  });
});

describe("laboratory execution authority", () => {
  const sessions = {
    async authorizeBearer() {
      return { capability: "edit" as const, recentGoogle: true, principalKey, role: "editor" as const };
    },
  };

  test("publishes the exact catalog and issues then consumes an opaque Gate A grant", async () => {
    let issued: Record<string, unknown> | null = null;
    const laboratoryGrants = {
      async issue(input: Record<string, unknown>) {
        issued = input;
        return { grantToken: "c".repeat(64) };
      },
      async consume() {
        return {
          ok: true as const,
          execution: {
            executionId: "00000000-0000-4000-8000-000000000001",
            definitionHash: "a".repeat(64),
            estimateHash: "b".repeat(64),
            maxRequests: 12,
            maxCostMicrousd: 5000,
            expiresAt: new Date("2026-08-13T23:59:00.000Z"),
          },
        };
      },
    };
    const routeDeps = { ...deps(), sessions, laboratoryGrants } as never;
    const catalogRequest = new Request("https://control-room.test/product/v1/control-room/laboratory/catalog", {
      headers: { authorization: "Bearer desktop-session", "x-device-id": "device-lab" },
    });
    const catalogResponse = await handleAdminRoute(catalogRequest, new URL(catalogRequest.url), routeDeps);
    expect(catalogResponse?.status).toBe(200);
    expect(await catalogResponse?.json()).toMatchObject({
      data: {
        sttRecipes: [{}, {}, {}, {}],
        postprocessRecipes: [{}, {}],
        providerAuthorization: { status: "available", reasonCode: null },
      },
    });

    const grantRequest = new Request("https://control-room.test/product/v1/control-room/laboratory/execution-grants", {
      method: "POST",
      headers: { authorization: "Bearer desktop-session", "x-device-id": "device-lab", "content-type": "application/json" },
      body: JSON.stringify({ schemaVersion: 1, kind: "gate-a", definition: GATE_A_DEFINITION }),
    });
    const grantResponse = await handleAdminRoute(grantRequest, new URL(grantRequest.url), routeDeps);
    expect(grantResponse?.status).toBe(201);
    expect(await grantResponse?.json()).toEqual({ ok: true, data: { grantToken: "c".repeat(64) } });
    expect(issued).toMatchObject({ principalKey, deviceId: "device-lab", maxRequests: 12, maxCostMicrousd: 5000 });

    const startRequest = new Request("https://control-room.test/product/v1/control-room/laboratory/executions", {
      method: "POST",
      headers: { authorization: "Bearer desktop-session", "x-device-id": "device-lab", "content-type": "application/json" },
      body: JSON.stringify({ schemaVersion: 1, grantToken: "c".repeat(64) }),
    });
    const startResponse = await handleAdminRoute(startRequest, new URL(startRequest.url), routeDeps);
    expect(startResponse?.status).toBe(201);
    expect(await startResponse?.json()).toMatchObject({
      ok: true,
      data: {
        executionId: "00000000-0000-4000-8000-000000000001",
        bounds: { maxRequests: 12, maxCostUsd: 0.005 },
      },
    });
  });
});
