/// <reference path="../src/bun-test.d.ts" />

import { describe, expect, test } from "bun:test";
import { handleAdminRoute, type AdminRouteDependencies } from "../src/routes/admin.ts";
import { GATE_A_DEFINITION } from "../../fixvox-core/src/control-plane/evaluation-recipes.ts";

const principalKey = `arp_${"a".repeat(64)}`;
const engineId = "groq:selection:llama-3.3-70b-versatile";
const entry = { engineId, lifecycleStatus: "candidate", availability: "available", revision: 0 };

function deps(overrides: Record<string, unknown> = {}): AdminRouteDependencies {
  return {
    keys: { publish: "publish-key" },
    repository: {
      async roleForPrincipal() { return "publisher" as const; },
      async linkedPrincipals() { return { principals: [], bindings: [] }; },
    },
    sessions: {
      async authorizeBearer() {
        return { capability: "publish" as const, recentGoogle: true, principalKey, role: "publisher" as const };
      },
    },
    profileCommands: {},
    engineCatalog: {
      async list() { return [entry]; },
      async catalogAudits() { return []; },
      async publish() { return { entry: { ...entry, lifecycleStatus: "published", revision: 1 }, audit: { action: "publish" }, idempotentReplay: false }; },
      async retire() { return { entry: { ...entry, lifecycleStatus: "retired", availability: "retired", revision: 1 }, audit: { action: "retire" }, idempotentReplay: false }; },
      ...overrides,
    },
  } as unknown as AdminRouteDependencies;
}

function request(action: "publish" | "retire", expectedRevision = 0) {
  return new Request(`https://control-room.test/product/v1/control-room/engine-catalog/${encodeURIComponent(engineId)}/${action}`, {
    method: "POST",
    headers: {
      authorization: "Bearer desktop-session",
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
        postprocessRecipes: [
          { availability: { status: "available", reasonCode: null } },
          { availability: { status: "available", reasonCode: null } },
          { availability: { status: "available", reasonCode: null } },
        ],
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

  test("derives versioned Gate B grants from the same identity-bound Gate A source", async () => {
    const sourceExecutionId = "00000000-0000-4000-8000-000000000002";
    const issuedDefinitions: string[] = [];
    for (const schemaVersion of [1, 2] as const) {
      let issued: Record<string, unknown> | null = null;
      const laboratoryGrants = {
        async gateBSource(input: Record<string, unknown>) {
          expect(input).toEqual({
            runId: sourceExecutionId,
            principalKey,
            deviceId: "device-lab",
          });
          return {
            definitionHash: "a".repeat(64),
            rawRefs: GATE_A_DEFINITION.sampleIds.map((sampleId, index) => ({
              sampleId,
              rawRef: `lraw_${String(index + 1).repeat(64)}`,
            })),
          };
        },
        async issue(input: Record<string, unknown>) {
          issued = input;
          return { grantToken: "d".repeat(64) };
        },
      };
      const request = new Request(
        "https://control-room.test/product/v1/control-room/laboratory/execution-grants",
        {
          method: "POST",
          headers: {
            authorization: "Bearer desktop-session",
            "x-device-id": "device-lab",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            schemaVersion,
            kind: "gate-b",
            sourceGateARunId: sourceExecutionId,
          }),
        },
      );

      const response = await handleAdminRoute(
        request,
        new URL(request.url),
        { ...deps(), sessions, laboratoryGrants } as never,
      );
      expect(response?.status).toBe(201);
      expect(issued).toMatchObject({
        principalKey,
        deviceId: "device-lab",
        request: {
          schemaVersion,
          kind: "gate-b",
          sourceGateARunId: sourceExecutionId,
        },
        sourceRunId: sourceExecutionId,
        maxRequests: 6,
        maxCostMicrousd: 5000,
      });
      issuedDefinitions.push(String((issued as unknown as Record<string, unknown>).definitionHash));
    }
    expect(new Set(issuedDefinitions).size).toBe(2);
  });
});

describe("laboratory execution terminal routes", () => {
  const sessions = {
    async authorizeBearer() {
      return { capability: "edit" as const, recentGoogle: false, principalKey, role: "editor" as const };
    },
  };
  const executionId = "00000000-0000-4000-8000-000000000001";
  const evidence = GATE_A_DEFINITION.sampleIds.map((sampleId, index) => ({
    sampleId,
    candidateId: "transcription-quality-v1-short-auto",
    sha256: `${String.fromCharCode(97 + index)}${"a".repeat(63)}`,
    byteLength: index + 1,
  }));
  function routeDeps(overrides: Record<string, unknown> = {}) {
    return {
      ...deps(),
      sessions,
      laboratoryGrants: {
        async complete(input: Record<string, unknown>) {
          return { ok: true, data: { executionId: input.executionId, status: "completed", completedRequestCount: 12, canonicalRawRefs: [], completedAt: "2026-08-14T00:00:00.000Z", idempotentReplay: false } };
        },
        async abort(input: Record<string, unknown>) {
          return { ok: true, data: { executionId: input.executionId, status: "aborted", reason: "runner-failed", abortedAt: "2026-08-14T00:00:00.000Z", idempotentReplay: false } };
        },
        ...overrides,
      },
    } as never;
  }
  function terminalRequest(path: string, payload: unknown) {
    return new Request(`https://control-room.test${path}`, {
      method: "POST",
      headers: { authorization: "Bearer desktop-session", "x-device-id": "device-lab", "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  test("accepts strict Gate A completion and rejects reordered evidence", async () => {
    const payload = {
      schemaVersion: 1,
      kind: "gate-a",
      definitionHash: "b".repeat(64),
      estimateHash: "c".repeat(64),
      completedRequestCount: 12,
      rawEvidence: evidence,
    };
    const request = terminalRequest(`/product/v1/control-room/laboratory/executions/${executionId}/completion`, payload);
    const response = await handleAdminRoute(request, new URL(request.url), routeDeps());
    expect(response?.status).toBe(200);
    const reordered = { ...payload, rawEvidence: [...evidence].reverse() };
    const invalid = terminalRequest(`/product/v1/control-room/laboratory/executions/${executionId}/completion`, reordered);
    expect((await handleAdminRoute(invalid, new URL(invalid.url), routeDeps()))?.status).toBe(400);
  });

  test("accepts strict Gate B completion and bounded abort body", async () => {
    const complete = terminalRequest(`/product/v1/control-room/laboratory/executions/${executionId}/completion`, {
      schemaVersion: 1,
      kind: "gate-b",
      definitionHash: "b".repeat(64),
      estimateHash: "c".repeat(64),
      completedRequestCount: 6,
    });
    expect((await handleAdminRoute(complete, new URL(complete.url), routeDeps()))?.status).toBe(200);
    const abort = terminalRequest(`/product/v1/control-room/laboratory/executions/${executionId}/abort`, { schemaVersion: 1, reason: "runner-failed" });
    expect((await handleAdminRoute(abort, new URL(abort.url), routeDeps()))?.status).toBe(200);
    const extra = terminalRequest(`/product/v1/control-room/laboratory/executions/${executionId}/abort`, { schemaVersion: 1, reason: "runner-failed", retry: true });
    expect((await handleAdminRoute(extra, new URL(extra.url), routeDeps()))?.status).toBe(400);
  });
});
