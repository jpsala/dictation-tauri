import { describe, expect, test } from "bun:test";
import { createApiHandler, type ApiDependencies } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import {
  VocabularyConflictError,
  VocabularyRuleNotFoundError,
  VocabularyValidationError,
  StaleVocabularyRevisionError,
  normalizeVocabularySpoken,
  validateMutationInput,
  type PersonalVocabularyMutationInput,
  type PersonalVocabularyRepository,
  type PersonalVocabularyRule,
  type PersonalVocabularySnapshot,
} from "../src/personal-vocabulary.ts";

const accountA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const deviceA = "vocabulary-device-a";
const deviceB = "vocabulary-device-b";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class MemoryVocabularyRepository implements PersonalVocabularyRepository {
  private readonly entries = new Map<string, { revision: bigint; rules: PersonalVocabularyRule[] }>();

  async getSnapshot(accountId: string): Promise<PersonalVocabularySnapshot> {
    const value = this.entries.get(accountId) ?? { revision: 0n, rules: [] };
    return { revision: value.revision.toString(), rules: clone(value.rules) };
  }

  async createRule(input: { accountId: string; expectedRevision: string; mutation: PersonalVocabularyMutationInput }) {
    const state = this.state(input.accountId);
    this.expectRevision(state.revision, input.expectedRevision);
    if (state.rules.length >= 500) throw new VocabularyValidationError("rules_limit");
    const spoken = input.mutation.spoken.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();
    if (input.mutation.mode === "automatic" && state.rules.some((rule) => rule.enabled && rule.mode === "automatic" && rule.spoken === spoken)) throw new VocabularyConflictError();
    const next = state.revision + 1n;
    const rule: PersonalVocabularyRule = {
      id: crypto.randomUUID(), revision: next.toString(), spoken: input.mutation.spoken,
      candidates: input.mutation.candidates.map((candidate) => ({ id: candidate.id ?? crypto.randomUUID(), written: candidate.written })),
      ...(input.mutation.defaultCandidateId ? { defaultCandidateId: input.mutation.defaultCandidateId } : {}),
      mode: input.mutation.mode, enabled: input.mutation.enabled ?? true,
      ...(input.mutation.note ? { note: input.mutation.note } : {}), createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    state.revision = next; state.rules.push(rule);
    return { rule: clone(rule), vocabularyRevision: next.toString() };
  }

  async updateRule(input: { accountId: string; ruleId: string; expectedRevision: string; mutation: Partial<PersonalVocabularyMutationInput> }) {
    const state = this.state(input.accountId);
    this.expectRevision(state.revision, input.expectedRevision);
    const rule = state.rules.find((candidate) => candidate.id === input.ruleId);
    if (!rule) throw new VocabularyRuleNotFoundError();
    const next = state.revision + 1n;
    const validated = validateMutationInput({
      spoken: input.mutation.spoken ?? rule.spoken,
      candidates: input.mutation.candidates ?? rule.candidates,
      mode: input.mutation.mode ?? rule.mode,
      enabled: input.mutation.enabled ?? rule.enabled,
      ...(input.mutation.defaultCandidateId !== undefined
        ? { defaultCandidateId: input.mutation.defaultCandidateId }
        : rule.defaultCandidateId !== undefined ? { defaultCandidateId: rule.defaultCandidateId } : {}),
      ...(input.mutation.note !== undefined
        ? { note: input.mutation.note }
        : rule.note !== undefined ? { note: rule.note } : {}),
      ...(input.mutation.automaticConfirmed !== undefined ? { automaticConfirmed: input.mutation.automaticConfirmed } : {}),
    }) as PersonalVocabularyMutationInput;
    const { automaticConfirmed: _automaticConfirmed, ...persisted } = validated;
    Object.assign(rule, persisted, { revision: next.toString(), updatedAt: "2026-01-01T00:00:00.000Z" });
    state.revision = next;
    return { rule: clone(rule), vocabularyRevision: next.toString() };
  }

  async deleteRule(input: { accountId: string; ruleId: string; expectedRevision: string }) {
    const state = this.state(input.accountId);
    this.expectRevision(state.revision, input.expectedRevision);
    const index = state.rules.findIndex((candidate) => candidate.id === input.ruleId);
    if (index < 0) throw new VocabularyRuleNotFoundError();
    state.rules.splice(index, 1);
    state.revision += 1n;
    return { vocabularyRevision: state.revision.toString() };
  }

  private state(accountId: string) {
    let state = this.entries.get(accountId);
    if (!state) { state = { revision: 0n, rules: [] }; this.entries.set(accountId, state); }
    return state;
  }

  private expectRevision(current: bigint, expected: string) {
    if (current.toString() !== expected) throw new StaleVocabularyRevisionError();
  }
}

type AuthFixture = {
  authorize: (input: { tokenHash: string; deviceId: string; accountId: string; now: Date }) => boolean;
  calls: Array<{ tokenHash: string; deviceId: string; accountId: string; now: Date }>;
};

function dependencies(repository: PersonalVocabularyRepository, authFixture: AuthFixture = { authorize: () => true, calls: [] }): ApiDependencies {
  return {
    config: loadConfig({ FIXVOX_API_DATABASE_URL: "postgres://fixture", FIXVOX_API_PUBLIC_BASE_URL: "https://fixture.test", FIXVOX_API_MOCK_PROVIDERS: "true", FIXVOX_API_MAX_REQUEST_BYTES: "8192" }),
    devices: {
      async bindDevice(input) { return { deviceId: input.generatedDeviceId, created: true }; },
      async resolveDevice(deviceId) {
        if (deviceId === deviceA) return { deviceId, accountId: accountA };
        if (deviceId === deviceB) return { deviceId, accountId: accountB };
        return null;
      },
      async resolveEffectiveProfile() {
        return { profileId: "basic", label: "Basic", version: 1, source: "fallback", definition: { capabilities: ["vocabulary"], quota: { limit: 20 }, engines: { chat: { provider: "mock", model: "fixture" }, audio: { provider: "mock", model: "fixture" } } } };
      },
    },
    providers: { async proxy() { throw new Error("provider must not be called"); } },
    auth: {
      async createDesktopHandoff() {},
      async readDesktopHandoff() { return null; },
      async readDesktopStatus() { return null; },
      async createOAuthState() {},
      async attachDesktopOAuthState() { return false; },
      async readOAuthState() { return null; },
      async readOAuthResult() { return null; },
      async consumeOAuthState() { return null; },
      async completeOAuthState() { return false; },
      async failOAuthState() { return false; },
      async claimDesktopDevice() { return null; },
      async authorizeProductBearer(input) { authFixture.calls.push(input); return authFixture.authorize(input); },
    },
    vocabulary: repository,
    readiness: { async database() { return true; }, async schema() { return true; }, async jobs() { return true; }, async authorityMode() { return "cloudflare-authority"; } },
  };
}

function jsonRequest(url: string, method: string, body: unknown, deviceId = deviceA, headers: Record<string, string> = {}) {
  return new Request(`https://fixture.test${url}`, { method, headers: { "content-type": "application/json", "x-device-id": deviceId, authorization: "Bearer fixture-vocabulary-token", ...headers }, body: JSON.stringify(body) });
}

describe("account vocabulary contract", () => {
  test("derives the same per-code-point Unicode key used by the matcher", () => {
    expect(normalizeVocabularySpoken("Á\tΟΣ")).toBe("a οσ");
  });

  test("isolates accounts, enforces capability and exposes bootstrap revision", async () => {
    const repository = new MemoryVocabularyRepository();
    const deps = dependencies(repository);
    const handler = createApiHandler(deps);
    const deniedDeps = dependencies(repository);
    deniedDeps.devices.resolveEffectiveProfile = async () => ({ profileId: "basic", label: "Basic", version: 1, source: "fallback", definition: { capabilities: [], engines: {} } });
    expect((await createApiHandler(deniedDeps)(new Request("https://fixture.test/product/v1/account/vocabulary", { headers: { "x-device-id": deviceA } }))).status).toBe(403);

    const bootstrap = await handler(jsonRequest("/product/v1/desktop/bootstrap", "POST", { installId: "install", device: { platform: "windows", appVersion: "1" } }));
    expect(bootstrap.status).toBe(200);
    expect(JSON.stringify(await bootstrap.json())).toContain('"vocabularyRevision":"0"');

    const created = await handler(jsonRequest("/product/v1/account/vocabulary/rules", "POST", {
      expectedRevision: "0", spoken: "App punto Svelte", candidates: [{ written: "app.svelte" }], mode: "automatic",
    }));
    expect(created.status).toBe(200);
    expect(created.headers.get("etag")).toBe('"vocabulary-1"');
    const createdData = (await created.json() as { data: { rule: PersonalVocabularyRule } }).data;
    expect(createdData.rule.candidates[0].written).toBe("app.svelte");
    const getA = await handler(new Request("https://fixture.test/product/v1/account/vocabulary", { headers: { "x-device-id": deviceA, authorization: "Bearer fixture-vocabulary-token" } }));
    expect(getA.status).toBe(200);
    expect(JSON.stringify(await getA.json())).not.toContain(accountA);
    const etag = getA.headers.get("etag")!;
    expect((await handler(new Request("https://fixture.test/product/v1/account/vocabulary", { headers: { "x-device-id": deviceA, authorization: "Bearer fixture-vocabulary-token", "if-none-match": etag } }))).status).toBe(304);
    const getB = await handler(new Request("https://fixture.test/product/v1/account/vocabulary", { headers: { "x-device-id": deviceB, authorization: "Bearer fixture-vocabulary-token" } }));
    expect(JSON.stringify(await getB.json())).toContain('"rules":[]');
  });

  test("uses exact rule IDs and expected revisions for mutation conflicts", async () => {
    const repository = new MemoryVocabularyRepository();
    const handler = createApiHandler(dependencies(repository));
    const created = await handler(jsonRequest("/product/v1/account/vocabulary/rules", "POST", { expectedRevision: "0", spoken: "jota", candidates: [{ written: "JP" }], mode: "ask" }));
    const ruleId = (await created.clone().json() as { data: { rule: PersonalVocabularyRule } }).data.rule.id;
    expect((await handler(jsonRequest(`/product/v1/account/vocabulary/rules/${ruleId}`, "PATCH", { expectedRevision: "0", enabled: false }))).status).toBe(409);
    expect((await handler(jsonRequest(`/product/v1/account/vocabulary/rules/${ruleId}`, "PATCH", { expectedRevision: "1", enabled: false }))).status).toBe(200);
    expect((await handler(jsonRequest(`/product/v1/account/vocabulary/rules/${ruleId}x`, "DELETE", { expectedRevision: "2" }))).status).toBe(404);
  });

  test("rejects bounded-rule violations and dangerous placeholders before repository writes", async () => {
    const repository = new MemoryVocabularyRepository();
    const handler = createApiHandler(dependencies(repository));
    expect((await handler(jsonRequest("/product/v1/account/vocabulary/rules", "POST", { expectedRevision: "0", spoken: "{{raw}}", candidates: [{ written: "safe" }], mode: "automatic" }))).status).toBe(400);
    expect((await handler(jsonRequest("/product/v1/account/vocabulary/rules", "POST", { expectedRevision: "0", spoken: "\u0301", candidates: [{ written: "safe" }], mode: "automatic" }))).status).toBe(400);
    expect((await handler(jsonRequest("/product/v1/account/vocabulary/rules", "POST", { expectedRevision: "0", spoken: "ambiguous", candidates: [{ written: "one" }, { written: "two" }], mode: "automatic" }))).status).toBe(400);
  });

  test("requires an authenticated, device/account-bound bearer session", async () => {
    const repository = new MemoryVocabularyRepository();
    const validTokenHash = new Bun.CryptoHasher("sha256").update("fixture-vocabulary-token").digest("hex");
    const expiry = new Date("2026-01-02T00:00:00.000Z");
    const authFixture: AuthFixture = {
      authorize: (input) => input.tokenHash === validTokenHash
        && input.now < expiry
        && input.deviceId === deviceA
        && input.accountId === accountA,
      calls: [],
    };
    const deps = dependencies(repository, authFixture);
    let requestNow = new Date("2026-01-01T00:00:00.000Z");
    deps.now = () => requestNow;
    const handler = createApiHandler(deps);
    expect((await handler(new Request("https://fixture.test/product/v1/account/vocabulary", { headers: { "x-device-id": deviceA } }))).status).toBe(401);

    expect((await handler(new Request("https://fixture.test/product/v1/account/vocabulary", { headers: { "x-device-id": deviceA, authorization: "Bearer invalid-token" } }))).status).toBe(401);

    requestNow = new Date("2026-01-03T00:00:00.000Z");
    expect((await handler(new Request("https://fixture.test/product/v1/account/vocabulary", { headers: { "x-device-id": deviceA, authorization: "Bearer fixture-vocabulary-token" } }))).status).toBe(401);

    requestNow = new Date("2026-01-01T00:00:00.000Z");
    expect((await handler(new Request("https://fixture.test/product/v1/account/vocabulary", { headers: { "x-device-id": deviceB, authorization: "Bearer fixture-vocabulary-token" } }))).status).toBe(401);
    expect(authFixture.calls.every((call) => call.tokenHash.length === 64)).toBe(true);
  });

  test("requires explicit confirmation only for short/common automatic triggers", async () => {
    const repository = new MemoryVocabularyRepository();
    const handler = createApiHandler(dependencies(repository));
    const unconfirmed = await handler(jsonRequest("/product/v1/account/vocabulary/rules", "POST", {
      expectedRevision: "0", spoken: "max", candidates: [{ written: "MAX" }], mode: "automatic",
    }));
    expect(unconfirmed.status).toBe(400);
    expect(await unconfirmed.json()).toMatchObject({ ok: false, error: { code: "automatic_confirmation_required" } });

    const confirmed = await handler(jsonRequest("/product/v1/account/vocabulary/rules", "POST", {
      expectedRevision: "0", spoken: "max", candidates: [{ written: "MAX" }], mode: "automatic", automaticConfirmed: true,
    }));
    expect(confirmed.status).toBe(200);

    const ask = await handler(jsonRequest("/product/v1/account/vocabulary/rules", "POST", {
      expectedRevision: "1", spoken: "the", candidates: [{ written: "THE" }], mode: "ask",
    }));
    expect(ask.status).toBe(200);
    expect(() => validateMutationInput({ spoken: "max", candidates: [{ written: "MAX" }], mode: "automatic" })).toThrow("automatic_confirmation_required");
    expect(validateMutationInput({ spoken: "max", candidates: [{ written: "MAX" }], mode: "automatic", automaticConfirmed: true })).toMatchObject({ automaticConfirmed: true });
  });

  test("applies the same confirmation guard when a PATCH changes an Ask rule to automatic", async () => {
    const repository = new MemoryVocabularyRepository();
    const handler = createApiHandler(dependencies(repository));
    const created = await handler(jsonRequest("/product/v1/account/vocabulary/rules", "POST", {
      expectedRevision: "0", spoken: "max", candidates: [{ written: "MAX" }], mode: "ask",
    }));
    const ruleId = (await created.json() as { data: { rule: PersonalVocabularyRule } }).data.rule.id;
    expect((await handler(jsonRequest(`/product/v1/account/vocabulary/rules/${ruleId}`, "PATCH", {
      expectedRevision: "1", mode: "automatic",
    }))).status).toBe(400);
    expect((await handler(jsonRequest(`/product/v1/account/vocabulary/rules/${ruleId}`, "PATCH", {
      expectedRevision: "1", mode: "automatic", automaticConfirmed: true,
    }))).status).toBe(200);
  });

  test("keeps personal text out of request telemetry", async () => {
    const repository = new MemoryVocabularyRepository();
    const events: unknown[] = [];
    const deps = dependencies(repository);
    deps.logger = { info(event) { events.push(event); } };
    const handler = createApiHandler(deps);
    const spoken = "private-spoken-vocabulary-fixture";
    const written = "private-written-vocabulary-fixture";
    expect((await handler(jsonRequest("/product/v1/account/vocabulary/rules", "POST", {
      expectedRevision: "0", spoken, candidates: [{ written }], mode: "automatic",
    }))).status).toBe(200);
    expect(JSON.stringify(events)).not.toContain(spoken);
    expect(JSON.stringify(events)).not.toContain(written);
  });
});
