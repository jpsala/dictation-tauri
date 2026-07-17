import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, mock, test } from "bun:test";

import {
  HTTP_CONTRACT_FIXTURES,
  NON_HTTP_CONTRACT_FIXTURES,
  CONTRACT_TEST_VALUES,
  type ContractFixture,
} from "../../../tests/cloud-contract/fixtures";
import {
  assertNoSensitiveText,
  assertNormalizedContract,
  normalizeResponse,
  redactEvidence,
  summarizeRequest,
  type NormalizedResponse,
} from "../../../tests/cloud-contract/redaction";
import {
  assignControlPlaneAdminAccountBudget,
  assignControlPlaneAdminAccountGroups,
  assignControlPlaneAdminAccountPolicy,
  assignControlPlaneAdminAccountSegments,
  assignControlPlaneAdminDevicePolicy,
  assignControlPlaneAdminSelectionPresetDefaults,
  createControlPlaneAdminAccountVariant,
  createControlPlaneAdminEngine,
  createControlPlaneAdminGroup,
  createControlPlaneAdminProfileDraft,
  createControlPlaneAdminPrompt,
  listControlPlaneAdminAccounts,
  listControlPlaneAdminProfiles,
  registerDevice,
} from "./control-plane-store";
import type { KvNamespaceLike } from "./admin-store";

mock.module("cloudflare:workers", () => ({
  DurableObject: class DurableObject {
    protected readonly ctx: unknown;
    protected readonly env: unknown;

    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

const { default: worker, UsageCounterDurableObject, ControlPlanePublishDurableObject } = await import("./index");

type WaitContext = ExecutionContext & {
  waitUntilTasks: Promise<unknown>[];
};

class MemoryKv implements KvNamespaceLike {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  dump(): string {
    return [...this.values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
  }
}

class MemoryDurableObjectStorage {
  private readonly values = new Map<string, unknown>();
  private alarm: number | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async deleteAll(): Promise<void> {
    this.values.clear();
    this.alarm = null;
  }

  async transaction<T>(callback: (storage: MemoryDurableObjectStorage) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }

  async setAlarm(value: number): Promise<void> {
    this.alarm = value;
  }
}

class MemoryDurableObjectState {
  private queue = Promise.resolve();
  readonly storage = new MemoryDurableObjectStorage();

  blockConcurrencyWhile(callback: () => Promise<void>): Promise<void> {
    const next = this.queue.then(callback);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

class MemoryUsageCounter {
  private used = 0;

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    const body = await request.json() as Record<string, unknown>;
    const key = typeof body.key === "string" ? body.key : "fixture-counter-key";
    const limit = Number(body.limit);
    const amount = Number(body.amount ?? body.reserve);
    const next = this.used + amount;
    if (next > limit) {
      return Response.json({ ok: false, key, used: this.used, remaining: Math.max(0, limit - this.used), limit, resetAt: body.resetAt }, { status: 429 });
    }
    this.used = next;
    return Response.json({
      ok: true,
      key,
      granted: body.reserve === undefined ? undefined : amount,
      used: this.used,
      remaining: Math.max(0, limit - this.used),
      limit,
      resetAt: body.resetAt,
    });
  }
}

function createUsageCounterNamespace(): DurableObjectNamespace {
  const counters = new Map<string, MemoryUsageCounter>();
  return {
    idFromName: (name: string) => name,
    get: (id: unknown) => {
      const key = String(id);
      const counter = counters.get(key) ?? new MemoryUsageCounter();
      counters.set(key, counter);
      return counter as never;
    },
  } as never;
}

function createProfileMutationNamespace(store: KvNamespaceLike): DurableObjectNamespace {
  let object: InstanceType<typeof ControlPlanePublishDurableObject> | null = null;
  return {
    idFromName: (_name: string) => "fixture-profile-mutation-lock",
    get: (_id: unknown) => ({
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        object ??= new ControlPlanePublishDurableObject(new MemoryDurableObjectState() as never, { USAGE: store } as never);
        return object.fetch(new Request(input, init));
      },
    }),
  } as never;
}

function createContext(): WaitContext {
  const waitUntilTasks: Promise<unknown>[] = [];
  return {
    waitUntil(promise: Promise<unknown>) {
      waitUntilTasks.push(promise);
    },
    passThroughOnException() {
      // The Worker fixture does not use this Cloudflare-only hook.
    },
    waitUntilTasks,
  } as unknown as WaitContext;
}

function createEnv(store: MemoryKv) {
  return {
    GROQ_API_KEY: CONTRACT_TEST_VALUES.providerKey,
    OPENROUTER_API_KEY: CONTRACT_TEST_VALUES.providerKey,
    GOOGLE_CLOUD_CLIENT_ID: "fixture-google-client-id",
    GOOGLE_CLOUD_CLIENT_SECRET: "fixture-google-client-secret",
    AUTH_PUBLIC_BASE_URL: "https://auth.fixture.test",
    ALPHA_INVITE_CODE_BASIC: "FIXTURE-BASIC",
    ADMIN_VIEW_API_KEY: "fixture-admin-view-key",
    ADMIN_EDIT_API_KEY: "fixture-admin-edit-key",
    ADMIN_PUBLISH_API_KEY: "fixture-admin-publish-key",
    USAGE: store,
    USAGE_COUNTERS: createUsageCounterNamespace(),
    CONTROL_PLANE_PUBLISH_LOCKS: createProfileMutationNamespace(store),
  };
}

const ADMIN_TOKENS: Record<NonNullable<ContractFixture["adminCapability"]>, string> = {
  view: "fixture-admin-view-key",
  edit: "fixture-admin-edit-key",
  publish: "fixture-admin-publish-key",
};

function requestForFixture(fixture: ContractFixture): Request {
  const headers = new Headers(fixture.request.headers ?? {});
  const contentType = fixture.request.contentType;
  const body = fixture.request.bodyFactory
    ? fixture.request.bodyFactory()
    : fixture.request.body === undefined
      ? undefined
      : fixture.request.bodyKind === "text"
        ? String(fixture.request.body)
        : JSON.stringify(fixture.request.body);

  if (contentType && !fixture.request.bodyFactory) {
    headers.set("Content-Type", contentType);
  } else if (fixture.request.bodyKind === "json" && body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (fixture.adminCapability) {
    headers.set("Authorization", `Bearer ${ADMIN_TOKENS[fixture.adminCapability]}`);
  }

  return new Request(`https://fixture.invalid${fixture.path}`, {
    method: fixture.method,
    headers,
    body,
  });
}

async function invokeWorker(path: string, method: "GET" | "POST" | "PUT", body: unknown, token: string, env: ReturnType<typeof createEnv>, ctx: WaitContext): Promise<Response> {
  return worker.fetch(new Request(`https://fixture.invalid${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: "https://admin.fixture.test",
    },
    body: JSON.stringify(body),
  }), env as never, ctx as never);
}

async function seedPopulatedAdmin(store: MemoryKv): Promise<void> {
  await createControlPlaneAdminEngine(store, { id: "fixture-engine", label: "Fixture engine", kind: "postprocess", provider: "mock", model: "fixture-model", promptKey: "fixture-prompt", promptSummary: "Safe fixture prompt", notes: "synthetic" });
  await createControlPlaneAdminPrompt(store, { id: "fixture-prompt", label: "Fixture prompt", kind: "postprocess", version: "v1", summary: "Safe fixture prompt", content: "fixture prompt body must never be projected" });
  await createControlPlaneAdminAccountVariant(store, { id: "fixture-variant", label: "Fixture variant", description: "synthetic", preset: "custom" });
  await createControlPlaneAdminGroup(store, { id: "fixture-group", label: "Fixture group", description: "synthetic", policyId: "pro" });
  await registerDevice(store, { installId: CONTRACT_TEST_VALUES.installId, deviceId: CONTRACT_TEST_VALUES.deviceId, version: "0.1.0-fixture", platform: "windows", arch: "x64", hostname: "fixture-host" }, { accountId: CONTRACT_TEST_VALUES.accountId });
  const accounts = await listControlPlaneAdminAccounts(store, { limit: 1 });
  const accountHandle = accounts.accounts[0]?.accountHandle;
  if (!accountHandle) throw new Error("admin_fixture_account_missing");
  await assignControlPlaneAdminDevicePolicy(store, { deviceId: CONTRACT_TEST_VALUES.deviceId, policyId: "pro" });
  await assignControlPlaneAdminAccountPolicy(store, { accountHandle, policyId: "pro" });
  await assignControlPlaneAdminAccountBudget(store, { accountHandle, budget: { dailyUsd: 1, monthlyUsd: 10, mode: "warn" } });
  await assignControlPlaneAdminAccountGroups(store, { accountHandle, groups: ["fixture-group"] });
  await assignControlPlaneAdminAccountSegments(store, { accountHandle, segments: ["fixture-variant"] });
  await assignControlPlaneAdminSelectionPresetDefaults(store, { items: [{ id: "fixture-preset", label: "Fixture preset", promptId: "preset.fixture-preset", promptContent: "fixture preset prompt body must never be projected", enabled: true }] });
  await createControlPlaneAdminProfileDraft(store, { profileId: "pro" });
}

async function prepareFixture(fixture: ContractFixture, env: ReturnType<typeof createEnv>, ctx: WaitContext, store: MemoryKv): Promise<void> {
  if (fixture.setup === "admin-populated") await seedPopulatedAdmin(store);
  if (fixture.setup === "device") {
    await registerDevice(store, {
      installId: CONTRACT_TEST_VALUES.installId,
      deviceId: CONTRACT_TEST_VALUES.deviceId,
      version: "0.1.0-fixture",
      platform: "windows",
      arch: "x64",
      hostname: "fixture-host",
    });
  }

  if (fixture.setup !== "profile-draft" && fixture.setup !== "profile-publish" && fixture.setup !== "profile-rollback") return;

  const draftResponse = await invokeWorker("/admin/control-plane/profiles/drafts", "POST", { profileId: "pro" }, ADMIN_TOKENS.edit, env, ctx);
  if (!draftResponse.ok) throw new Error(`${fixture.id}: profile setup draft failed (${draftResponse.status})`);
  const profiles = await listControlPlaneAdminProfiles(store);
  const profile = profiles.profiles.find((entry) => entry.profileId === "pro");
  const draft = profile?.draft;
  const activeVersion = profile?.published?.version ?? null;
  if (!draft || activeVersion === null) throw new Error(`${fixture.id}: profile setup did not create a draft over a published version`);

  if (fixture.setup === "profile-draft") return;

  if (fixture.setup === "profile-publish") {
    const publishResponse = await invokeWorker("/admin/control-plane/profiles/publish", "POST", {
      profileId: "pro",
      expectedActiveVersion: activeVersion,
      expectedDraftVersion: draft.version,
      confirmation: `PUBLISH pro v${draft.version}`,
    }, ADMIN_TOKENS.publish, env, ctx);
    if (!publishResponse.ok) throw new Error(`${fixture.id}: profile setup publish failed (${publishResponse.status})`);
    return;
  }

  const publishResponse = await invokeWorker("/admin/control-plane/profiles/publish", "POST", {
    profileId: "pro",
    expectedActiveVersion: activeVersion,
    expectedDraftVersion: draft.version,
    confirmation: `PUBLISH pro v${draft.version}`,
  }, ADMIN_TOKENS.publish, env, ctx);
  if (!publishResponse.ok) throw new Error(`${fixture.id}: profile rollback setup publish failed (${publishResponse.status})`);
}

function createMockProviderFetch(calls: Array<{ url: string; method: string }>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    calls.push({ url, method });

    if (url.endsWith("/models")) {
      return new Response(JSON.stringify({ data: [{ id: "fixture-model" }, { id: "whisper-large-v3-turbo" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/audio/transcriptions")) {
      return new Response(JSON.stringify({ text: "fixture provider transcription" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "x-request-id": "provider-fixture-audio" },
      });
    }
    if (url.endsWith("/chat/completions")) {
      return new Response(JSON.stringify({
        id: "provider-fixture-chat",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "fixture provider response" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "x-request-id": "provider-fixture-chat" },
      });
    }
    if (url.includes("oauth2.googleapis.com") || url.includes("openidconnect.googleapis.com")) {
      return new Response(JSON.stringify({ error: "fixture_oauth_disabled" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`unexpected external request in provider-free runner: ${new URL(url).hostname}`);
  }) as typeof fetch;
}

async function invokeContractFixture(fixture: ContractFixture): Promise<{
  fixture: string;
  request: Record<string, unknown>;
  response: NormalizedResponse;
  mockedProviderCalls: number;
}> {
  const store = new MemoryKv();
  const env = createEnv(store);
  const ctx = createContext();
  await prepareFixture(fixture, env, ctx, store);

  const calls: Array<{ url: string; method: string }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createMockProviderFetch(calls);
  try {
    const response = fixture.source === "worker.fetch"
      ? await worker.fetch(requestForFixture(fixture), env as never, ctx as never)
      : await new UsageCounterDurableObject(new MemoryDurableObjectState() as never, env as never).fetch(requestForFixture(fixture));
    const normalized = await normalizeResponse(response);
    await Promise.all(ctx.waitUntilTasks);
    assertNormalizedContract(fixture, normalized);

    if (fixture.mockedProviderCalls !== undefined && calls.length !== fixture.mockedProviderCalls) {
      throw new Error(`${fixture.id}: expected ${fixture.mockedProviderCalls} mocked upstream call(s), received ${calls.length}`);
    }
    if (fixture.mockedProviderCalls === undefined && calls.length !== 0) {
      throw new Error(`${fixture.id}: unexpected mocked upstream call(s): ${calls.length}`);
    }

    if (["chat-completions", "audio-transcriptions"].includes(fixture.id)) {
      const persisted = store.dump();
      expect(persisted).not.toContain(CONTRACT_TEST_VALUES.transcript);
      expect(persisted).not.toContain(CONTRACT_TEST_VALUES.selectedText);
      expect(persisted).not.toContain(CONTRACT_TEST_VALUES.audio);
      expect(persisted).not.toContain(CONTRACT_TEST_VALUES.providerKey);
    }

    return {
      fixture: fixture.id,
      request: summarizeRequest(fixture),
      response: normalized,
      mockedProviderCalls: calls.length,
    };
  } finally {
    globalThis.fetch = previousFetch;
  }
}

describe("provider-free Worker contract runner", () => {
  test("executes every frozen HTTP fixture with deterministic mocks and memory storage", async () => {
    const results = [] as Array<Awaited<ReturnType<typeof invokeContractFixture>>>;
    for (const fixture of HTTP_CONTRACT_FIXTURES) {
      results.push(await invokeContractFixture(fixture));
    }

    const report = redactEvidence({
      schemaVersion: 1,
      runner: "worker-handler-memory-provider-free",
      fixtureCount: results.length,
      results,
    });
    const serialized = JSON.stringify(report, null, 2);
    assertNoSensitiveText(serialized, "contract runner report");

    const artifactDir = resolve(import.meta.dir, "../../../artifacts/self-hosted-control-plane/checkpoint-a");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(resolve(artifactDir, "worker-contract-report.json"), `${serialized}\n`, "utf8");

    expect(results).toHaveLength(HTTP_CONTRACT_FIXTURES.length);
    expect(results.every((result) => result.response.status >= 200 && result.response.status < 600)).toBe(true);
  }, 30_000);

  test("runs the scheduled boundary without enabling provider or support network calls", async () => {
    const store = new MemoryKv();
    const env = createEnv(store);
    const ctx = createContext();
    const calls: Array<{ url: string; method: string }> = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = createMockProviderFetch(calls);
    try {
      await worker.scheduled({} as ScheduledController, env as never, ctx as never);
      await Promise.all(ctx.waitUntilTasks);
      expect(calls).toEqual([]);
      expect(NON_HTTP_CONTRACT_FIXTURES.map((fixture) => fixture.id)).toEqual(["scheduled-maintenance"]);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
