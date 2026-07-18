// @ts-expect-error Bun provides this module in `bun test`; root TS config does not ship Bun ambient types.
import { describe, expect, mock, test } from "bun:test";
import {
  createControlPlaneAdminProfileDraft,
  listControlPlaneAdminAudit,
  listControlPlaneAdminProfiles,
  type ProfileDefinition,
} from "./control-plane-store";
import type { KvNamespaceLike } from "./admin-store";

class FakeDurableObject {
  protected readonly ctx: unknown;

  constructor(ctx: unknown, _env: unknown) {
    this.ctx = ctx;
  }
}

mock.module("cloudflare:workers", () => ({ DurableObject: FakeDurableObject }));

const { ControlPlanePublishDurableObject } = await import("./control-plane-publish-lock");

const PROFILE_KEY = "control:profiles:v1";
const AUDIT_KEY = "control:admin-audit:v1";
const PROJECTION_COMMIT_KEY = "control:profiles:projection-commit:v1";

type CrashBoundary = "before-projection" | "after-profile-projection" | "after-projection" | "after-commit";

class MemoryKv implements KvNamespaceLike {
  readonly values = new Map<string, string>();
  readonly puts: Array<{ key: string; value: string }> = [];
  readonly staleReads = new Map<string, string | null>();
  readonly failingPuts = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    await Promise.resolve();
    if (this.staleReads.has(key)) return this.staleReads.get(key) ?? null;
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    await Promise.resolve();
    const failures = this.failingPuts.get(key) ?? 0;
    if (failures > 0) {
      this.failingPuts.set(key, failures - 1);
      throw new Error("simulated projection write failure");
    }
    this.puts.push({ key, value });
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    await Promise.resolve();
    this.values.delete(key);
  }

  read(key: string): string | null {
    return this.values.get(key) ?? null;
  }
}

class MemoryDurableObjectStorage {
  readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async transaction<T>(callback: (transaction: MemoryDurableObjectStorage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

class FakeDurableObjectState {
  private queue = Promise.resolve();

  constructor(readonly storage = new MemoryDurableObjectStorage()) {}

  blockConcurrencyWhile(callback: () => Promise<void>): Promise<void> {
    const next = this.queue.then(callback);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

function createLock(
  store: KvNamespaceLike,
  storage = new MemoryDurableObjectStorage(),
  crashAt?: CrashBoundary,
): InstanceType<typeof ControlPlanePublishDurableObject> {
  let crashed = false;
  return new ControlPlanePublishDurableObject(
    new FakeDurableObjectState(storage) as never,
    {
      USAGE: store,
      PROFILE_MUTATION_TEST_HOOK: async (boundary: CrashBoundary) => {
        if (boundary !== crashAt || crashed) return;
        crashed = true;
        const error = new Error(`simulated crash at ${boundary}`);
        error.name = "SimulatedDurableObjectCrash";
        throw error;
      },
    } as never,
  );
}

async function mutate(
  lock: InstanceType<typeof ControlPlanePublishDurableObject>,
  action: "apply-profile" | "create-draft" | "save-draft" | "discard-draft" | "publish" | "rollback",
  payload: Record<string, unknown>,
): Promise<Response> {
  return lock.fetch(new Request("https://profile-lock/mutate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }),
  }));
}

async function prepareDraft(store: KvNamespaceLike, profileId: string): Promise<ProfileDefinition> {
  const record = await createControlPlaneAdminProfileDraft(store, { profileId });
  if (!record.draft) throw new Error(`expected ${profileId} draft`);
  return record.draft;
}

describe("control-plane profile mutation lock", () => {
  test("discards one exact draft idempotently without changing published history", async () => {
    const store = new MemoryKv();
    const draft = await prepareDraft(store, "pro");
    const lock = createLock(store);
    const payload = {
      profileId: "pro",
      expectedDraftVersion: draft.version,
      confirmation: `DISCARD pro v${draft.version}`,
    };

    const first = await mutate(lock, "discard-draft", payload);
    const second = await mutate(lock, "discard-draft", payload);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.headers.get("x-fixvox-idempotent-replay")).toBe("true");
    const profile = (await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro");
    expect(profile?.draft).toBeNull();
    expect(profile?.published?.version).toBe(1);
    expect(profile?.history.map((version) => version.version)).toEqual([1]);
    expect((await listControlPlaneAdminAudit(store)).records).toEqual([]);
  });

  test("applies a candidate once and replays the exact request without a second version or audit", async () => {
    const store = new MemoryKv();
    const source = (await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro")?.published;
    if (!source) throw new Error("expected published pro profile");
    const lock = createLock(store);
    const payload = {
      profileId: "pro",
      expectedActiveVersion: 1,
      definition: {
        ...source,
        label: "Pro applied",
        runtime: {
          ...source.runtime,
          postprocess: { engineId: "postprocess-openrouter-premium", promptId: "postProcessBase" },
        },
      },
      confirmation: "APPLY pro v1",
    };

    const [first, second] = await Promise.all([
      mutate(lock, "apply-profile", payload),
      mutate(lock, "apply-profile", payload),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect([first.headers.get("x-fixvox-idempotent-replay"), second.headers.get("x-fixvox-idempotent-replay")]).toContain("true");
    const profile = (await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro");
    expect(profile).toMatchObject({ published: { version: 2, label: "Pro applied" }, draft: null });
    expect(profile?.history.map((version) => version.version)).toEqual([1, 2]);
    expect((await listControlPlaneAdminAudit(store)).records).toEqual([
      expect.objectContaining({ action: "apply", profileId: "pro", sourceVersion: 1, resultingVersion: 2 }),
    ]);
  });

  test("fails closed after an interrupted apply, then recovers one version and audit on retry", async () => {
    const store = new MemoryKv();
    await prepareDraft(store, "pro");
    const source = (await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro")?.published;
    if (!source) throw new Error("expected published pro profile");
    const storage = new MemoryDurableObjectStorage();
    const payload = {
      profileId: "pro",
      expectedActiveVersion: 1,
      definition: { ...source, label: "Pro recovered apply" },
      confirmation: "APPLY pro v1",
    };

    expect((await mutate(createLock(store, storage, "after-profile-projection"), "apply-profile", payload)).status).toBe(503);
    await expect(listControlPlaneAdminProfiles(store)).rejects.toThrow("projection");

    const retry = await mutate(createLock(store, storage), "apply-profile", payload);
    expect(retry.status).toBe(200);
    const profile = (await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro");
    expect(profile).toMatchObject({ published: { version: 2, label: "Pro recovered apply" }, draft: null });
    expect(profile?.history.map((version) => version.version)).toEqual([1, 2]);
    expect((await listControlPlaneAdminAudit(store)).records).toEqual([
      expect.objectContaining({ action: "apply", resultingVersion: 2 }),
    ]);
  });

  test("serializes concurrent publishers and idempotently replays an exact duplicate", async () => {
    const store = new MemoryKv();
    const draft = await prepareDraft(store, "pro");
    const lock = createLock(store);

    const [first, second] = await Promise.all([
      mutate(lock, "publish", {
        profileId: "pro",
        expectedActiveVersion: 1,
        expectedDraftVersion: draft.version,
        confirmation: `PUBLISH pro v${draft.version}`,
      }),
      mutate(lock, "publish", {
        profileId: "pro",
        expectedActiveVersion: 1,
        expectedDraftVersion: draft.version,
        confirmation: `PUBLISH pro v${draft.version}`,
      }),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect([first.headers.get("x-fixvox-idempotent-replay"), second.headers.get("x-fixvox-idempotent-replay")]).toContain("true");
    const profile = (await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro");
    expect(profile?.history.map((version) => version.version)).toEqual([1, 2]);
    expect(profile?.draft).toBeNull();
    expect((await listControlPlaneAdminAudit(store)).records).toEqual([
      expect.objectContaining({ action: "publish", profileId: "pro", sourceVersion: 1, resultingVersion: 2 }),
    ]);
  });

  test("rejects stale expectedActive and expectedDraft before changing the snapshot or audit", async () => {
    const store = new MemoryKv();
    const draft = await prepareDraft(store, "pro");
    const lock = createLock(store);
    expect((await lock.fetch(new Request("https://profile-lock/not-found"))).status).toBe(404);
    const beforeProfile = store.read("control:profiles:v1");
    const beforeAudit = store.read("control:admin-audit:v1");
    store.puts.length = 0;

    const [staleActive, staleDraft] = await Promise.all([
      mutate(lock, "publish", {
        profileId: "pro",
        expectedActiveVersion: 99,
        expectedDraftVersion: draft.version,
        confirmation: `PUBLISH pro v${draft.version}`,
      }),
      mutate(lock, "publish", {
        profileId: "pro",
        expectedActiveVersion: 1,
        expectedDraftVersion: 99,
        confirmation: "PUBLISH pro v99",
      }),
    ]);

    expect(staleActive.status).toBe(409);
    expect(staleDraft.status).toBe(409);
    expect(store.read("control:profiles:v1")).toBe(beforeProfile);
    expect(store.read("control:admin-audit:v1")).toBe(beforeAudit);
    expect(store.puts).toEqual([]);
  });

  test("serializes concurrent rollbacks and idempotently appends one immutable publication", async () => {
    const store = new MemoryKv();
    const draft = await prepareDraft(store, "pro");
    const lock = createLock(store);
    expect((await mutate(lock, "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: draft.version,
      confirmation: "PUBLISH pro v2",
    })).status).toBe(200);

    const [first, second] = await Promise.all([
      mutate(lock, "rollback", {
        profileId: "pro",
        version: 1,
        expectedActiveVersion: 2,
        confirmation: "ROLLBACK pro to v1",
      }),
      mutate(lock, "rollback", {
        profileId: "pro",
        version: 1,
        expectedActiveVersion: 2,
        confirmation: "ROLLBACK pro to v1",
      }),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect([first.headers.get("x-fixvox-idempotent-replay"), second.headers.get("x-fixvox-idempotent-replay")]).toContain("true");
    const profile = (await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro");
    expect(profile?.history.map((version) => version.version)).toEqual([1, 2, 3]);
    expect(profile?.history[0].status).toBe("published");
    expect(profile?.history[1].status).toBe("published");
    expect(profile?.history[2]).toMatchObject({ version: 3, basedOnVersion: 1, status: "published" });
    expect((await listControlPlaneAdminAudit(store)).records.map((record) => record.action)).toEqual(["publish", "rollback"]);
  });

  test("keeps the one-value profile snapshot atomic while publishers target different profiles", async () => {
    const store = new MemoryKv();
    const proDraft = await prepareDraft(store, "pro");
    const alphaDraft = await prepareDraft(store, "alpha-full");
    const lock = createLock(store);
    store.puts.length = 0;

    const [proResult, alphaResult] = await Promise.all([
      mutate(lock, "publish", {
        profileId: "pro",
        expectedActiveVersion: 1,
        expectedDraftVersion: proDraft.version,
        confirmation: "PUBLISH pro v2",
      }),
      mutate(lock, "publish", {
        profileId: "alpha-full",
        expectedActiveVersion: 1,
        expectedDraftVersion: alphaDraft.version,
        confirmation: "PUBLISH alpha-full v2",
      }),
    ]);

    expect(proResult.status).toBe(200);
    expect(alphaResult.status).toBe(200);
    for (const write of store.puts.filter((item) => item.key === "control:profiles:v1")) {
      const snapshot = JSON.parse(write.value) as {
        schemaVersion: number;
        profiles: Record<string, { activeVersion: number | null; draft: ProfileDefinition | null; history: ProfileDefinition[] }>;
      };
      expect(snapshot.schemaVersion).toBe(1);
      for (const entry of Object.values(snapshot.profiles)) {
        expect(entry.history.every((version) => version.status === "published")).toBe(true);
        expect(entry.activeVersion === null || entry.history.some((version) => version.version === entry.activeVersion)).toBe(true);
        expect(entry.draft === null || entry.draft.status === "draft").toBe(true);
      }
    }
    const profiles = (await listControlPlaneAdminProfiles(store)).profiles;
    expect(profiles.find((item) => item.profileId === "pro")?.history.map((version) => version.version)).toEqual([1, 2]);
    expect(profiles.find((item) => item.profileId === "alpha-full")?.history.map((version) => version.version)).toEqual([1, 2]);
  });

  test("does not allow callers to mutate immutable history returned by a publication", async () => {
    const store = new MemoryKv();
    const draft = await prepareDraft(store, "pro");
    const lock = createLock(store);
    const response = await mutate(lock, "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: draft.version,
      confirmation: "PUBLISH pro v2",
    });
    const published = await response.json() as { history: ProfileDefinition[] };
    published.history[0].label = "tampered";

    const profile = (await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro");
    expect(profile?.history[0].label).not.toBe("tampered");
    expect(profile?.history.map((version) => version.version)).toEqual([1, 2]);
  });

  test("rejects a second publisher after rehydration even when KV returns the pre-publish snapshot", async () => {
    const store = new MemoryKv();
    const draft = await prepareDraft(store, "pro");
    const staleProfile = store.read(PROFILE_KEY);
    const storage = new MemoryDurableObjectStorage();
    const firstLock = createLock(store, storage);
    expect((await mutate(firstLock, "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: draft.version,
      confirmation: "PUBLISH pro v2",
      actorKey: `arp_${"a".repeat(64)}`,
    })).status).toBe(200);

    store.staleReads.set(PROFILE_KEY, staleProfile);
    const rehydrated = createLock(store, storage);
    const second = await mutate(rehydrated, "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: draft.version,
      confirmation: "PUBLISH pro v2",
      actorKey: `arp_${"b".repeat(64)}`,
    });
    store.staleReads.clear();

    expect(second.status).toBe(409);
    expect((await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro")?.history.map((item) => item.version)).toEqual([1, 2]);
    expect((await listControlPlaneAdminAudit(store)).records).toHaveLength(1);
  });

  test("rejects a second rollback after rehydration even when KV returns the pre-rollback snapshot", async () => {
    const store = new MemoryKv();
    const draft = await prepareDraft(store, "pro");
    const storage = new MemoryDurableObjectStorage();
    const firstLock = createLock(store, storage);
    expect((await mutate(firstLock, "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: draft.version,
      confirmation: "PUBLISH pro v2",
    })).status).toBe(200);
    const staleProfile = store.read(PROFILE_KEY);
    expect((await mutate(firstLock, "rollback", {
      profileId: "pro",
      version: 1,
      expectedActiveVersion: 2,
      confirmation: "ROLLBACK pro to v1",
      actorKey: `arp_${"a".repeat(64)}`,
    })).status).toBe(200);

    store.staleReads.set(PROFILE_KEY, staleProfile);
    const second = await mutate(createLock(store, storage), "rollback", {
      profileId: "pro",
      version: 1,
      expectedActiveVersion: 2,
      confirmation: "ROLLBACK pro to v1",
      actorKey: `arp_${"b".repeat(64)}`,
    });
    store.staleReads.clear();

    expect(second.status).toBe(409);
    expect((await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro")?.history.map((item) => item.version)).toEqual([1, 2, 3]);
  });

  test("never lets a stale audit projection erase a confirmed record", async () => {
    const store = new MemoryKv();
    const draft = await prepareDraft(store, "pro");
    const storage = new MemoryDurableObjectStorage();
    const lock = createLock(store, storage);
    expect((await mutate(lock, "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: draft.version,
      confirmation: "PUBLISH pro v2",
    })).status).toBe(200);
    const staleAudit = JSON.stringify({ schemaVersion: 1, records: [] });
    const created = await mutate(lock, "create-draft", { profileId: "pro" });
    const createdRecord = await created.json() as { draft: ProfileDefinition };
    store.staleReads.set(AUDIT_KEY, staleAudit);
    expect((await mutate(lock, "publish", {
      profileId: "pro",
      expectedActiveVersion: 2,
      expectedDraftVersion: createdRecord.draft.version,
      confirmation: `PUBLISH pro v${createdRecord.draft.version}`,
    })).status).toBe(200);
    store.staleReads.clear();

    expect((await listControlPlaneAdminAudit(store)).records.map((record) => record.resultingVersion)).toEqual([2, 3]);
  });

  for (const boundary of ["before-projection", "after-profile-projection", "after-projection", "after-commit"] as const) {
    test(`recovers safely from a crash at ${boundary}`, async () => {
      const store = new MemoryKv();
      const draft = await prepareDraft(store, "pro");
      const storage = new MemoryDurableObjectStorage();
      const crashingLock = createLock(store, storage, boundary);
      const interrupted = await mutate(crashingLock, "publish", {
        profileId: "pro",
        expectedActiveVersion: 1,
        expectedDraftVersion: draft.version,
        confirmation: "PUBLISH pro v2",
      });
      expect(interrupted.status).toBe(503);

      const retry = await mutate(createLock(store, storage), "publish", {
        profileId: "pro",
        expectedActiveVersion: 1,
        expectedDraftVersion: draft.version,
        confirmation: "PUBLISH pro v2",
      });
      expect([200, 409]).toContain(retry.status);
      store.staleReads.clear();
      expect((await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro")?.history.map((item) => item.version)).toEqual([1, 2]);
      expect((await listControlPlaneAdminAudit(store)).records.map((record) => record.resultingVersion)).toEqual([2]);
    });
  }

  test("replays an already committed request idempotently instead of publishing twice", async () => {
    const store = new MemoryKv();
    const draft = await prepareDraft(store, "pro");
    const storage = new MemoryDurableObjectStorage();
    const payload = {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: draft.version,
      confirmation: "PUBLISH pro v2",
    };
    expect((await mutate(createLock(store, storage), "publish", payload)).status).toBe(200);
    const replay = await mutate(createLock(store, storage), "publish", payload);

    expect(replay.status).toBe(200);
    expect(replay.headers.get("x-fixvox-idempotent-replay")).toBe("true");
    expect((await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro")?.history.map((item) => item.version)).toEqual([1, 2]);
    expect((await listControlPlaneAdminAudit(store)).records).toHaveLength(1);
  });

  test("fails closed on a KV projection failure and keeps the authoritative revision unambiguous", async () => {
    const store = new MemoryKv();
    const draft = await prepareDraft(store, "pro");
    const storage = new MemoryDurableObjectStorage();
    const lock = createLock(store, storage);
    expect((await lock.fetch(new Request("https://profile-lock/not-found"))).status).toBe(404);
    store.failingPuts.set(AUDIT_KEY, 1);

    const failed = await mutate(lock, "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: draft.version,
      confirmation: "PUBLISH pro v2",
    });
    expect(failed.status).toBe(503);

    const retry = await mutate(createLock(store, storage), "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: draft.version,
      confirmation: "PUBLISH pro v2",
    });
    expect(retry.status).toBe(200);
    expect((await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro")?.history.map((item) => item.version)).toEqual([1, 2]);
    expect((await listControlPlaneAdminAudit(store)).records).toHaveLength(1);
  });

  test("keeps immutable monotonic history after rehydration instead of trusting stale KV", async () => {
    const store = new MemoryKv();
    const firstDraft = await prepareDraft(store, "pro");
    const originalProjection = store.read(PROFILE_KEY);
    const storage = new MemoryDurableObjectStorage();
    expect((await mutate(createLock(store, storage), "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: firstDraft.version,
      confirmation: "PUBLISH pro v2",
    })).status).toBe(200);
    store.staleReads.set(PROFILE_KEY, originalProjection);
    const rehydrated = createLock(store, storage);
    const created = await mutate(rehydrated, "create-draft", { profileId: "pro" });
    const draft = (await created.json() as { draft: ProfileDefinition }).draft;
    expect(draft.version).toBe(3);
    expect((await mutate(rehydrated, "publish", {
      profileId: "pro",
      expectedActiveVersion: 2,
      expectedDraftVersion: 3,
      confirmation: "PUBLISH pro v3",
    })).status).toBe(200);
    store.staleReads.clear();

    const profile = (await listControlPlaneAdminProfiles(store)).profiles.find((item) => item.profileId === "pro");
    expect(profile?.history.map((item) => item.version)).toEqual([1, 2, 3]);
    expect(profile?.history[0].label).toBe("Pro");
  });

  test("materializes the first profile snapshot from an empty legacy KV store", async () => {
    const store = new MemoryKv();
    const response = await mutate(createLock(store), "create-draft", { profileId: "pro" });

    expect(response.status).toBe(200);
    expect(store.read(PROFILE_KEY)).toBeTruthy();
    expect(JSON.parse(store.read(PROJECTION_COMMIT_KEY) ?? "null")).toEqual({ schemaVersion: 1, authorityRevision: 1 });
    expect((await listControlPlaneAdminProfiles(store)).profiles.find((profile) => profile.profileId === "pro")?.draft?.status).toBe("draft");
  });

  test("fails closed when bootstrap sees a marker without a complete valid projection", async () => {
    const markerOnlyStore = new MemoryKv();
    const markerOnlyDraft = await prepareDraft(markerOnlyStore, "pro");
    markerOnlyStore.values.set(PROJECTION_COMMIT_KEY, JSON.stringify({ schemaVersion: 1, authorityRevision: 0 }));
    await expect(listControlPlaneAdminProfiles(markerOnlyStore)).rejects.toThrow("projection");

    const markerOnlyAttempt = await mutate(createLock(markerOnlyStore), "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: markerOnlyDraft.version,
      confirmation: `PUBLISH pro v${markerOnlyDraft.version}`,
    });
    expect(markerOnlyAttempt.status).toBe(503);

    const invalidMarkerStore = new MemoryKv();
    const invalidMarkerDraft = await prepareDraft(invalidMarkerStore, "pro");
    const profile = JSON.parse(invalidMarkerStore.read(PROFILE_KEY) ?? "null") as Record<string, unknown>;
    invalidMarkerStore.values.set(PROFILE_KEY, JSON.stringify({ ...profile, projection: { authorityRevision: 0 } }));
    invalidMarkerStore.values.set(AUDIT_KEY, JSON.stringify({
      schemaVersion: 1,
      records: [],
      projection: { authorityRevision: 0 },
    }));
    invalidMarkerStore.values.set(PROJECTION_COMMIT_KEY, JSON.stringify({ authorityRevision: 0 }));

    const invalidMarkerAttempt = await mutate(createLock(invalidMarkerStore), "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: invalidMarkerDraft.version,
      confirmation: `PUBLISH pro v${invalidMarkerDraft.version}`,
    });
    expect(invalidMarkerAttempt.status).toBe(503);

    const completeProjectionStore = new MemoryKv();
    const completeProjectionDraft = await prepareDraft(completeProjectionStore, "pro");
    const completeProfile = JSON.parse(completeProjectionStore.read(PROFILE_KEY) ?? "null") as Record<string, unknown>;
    completeProjectionStore.values.set(PROFILE_KEY, JSON.stringify({ ...completeProfile, projection: { authorityRevision: 0 } }));
    completeProjectionStore.values.set(AUDIT_KEY, JSON.stringify({
      schemaVersion: 1,
      records: [],
      projection: { authorityRevision: 0 },
    }));
    completeProjectionStore.values.set(PROJECTION_COMMIT_KEY, JSON.stringify({ schemaVersion: 1, authorityRevision: 0 }));
    const completeProjectionAttempt = await mutate(createLock(completeProjectionStore), "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: completeProjectionDraft.version,
      confirmation: `PUBLISH pro v${completeProjectionDraft.version}`,
    });
    expect(completeProjectionAttempt.status).toBe(503);
  });

  test("fails closed on invalid legacy snapshot shapes and invalid audit JSON", async () => {
    const invalidProfileStore = new MemoryKv();
    invalidProfileStore.values.set(PROFILE_KEY, JSON.stringify({ schemaVersion: 2, profiles: {} }));
    const invalidProfileAttempt = await mutate(createLock(invalidProfileStore), "create-draft", { profileId: "pro" });
    expect(invalidProfileAttempt.status).toBe(503);

    const invalidAuditStore = new MemoryKv();
    invalidAuditStore.values.set(AUDIT_KEY, JSON.stringify({ schemaVersion: 1, records: {} }));
    const invalidAuditAttempt = await mutate(createLock(invalidAuditStore), "create-draft", { profileId: "pro" });
    expect(invalidAuditAttempt.status).toBe(503);

    const invalidReadStore = new MemoryKv();
    invalidReadStore.values.set(AUDIT_KEY, "not-json");
    await expect(listControlPlaneAdminAudit(invalidReadStore)).rejects.toThrow("projection");
  });

  test("readers reject a partial projection whose revision is not committed", async () => {
    const store = new MemoryKv();
    await prepareDraft(store, "pro");
    const profile = JSON.parse(store.read(PROFILE_KEY) ?? "null") as Record<string, unknown>;
    store.values.set(PROFILE_KEY, JSON.stringify({ ...profile, projection: { authorityRevision: 2 } }));
    store.values.set(AUDIT_KEY, JSON.stringify({ schemaVersion: 1, records: [], projection: { authorityRevision: 1 } }));
    store.values.set(PROJECTION_COMMIT_KEY, JSON.stringify({ schemaVersion: 1, authorityRevision: 1 }));

    await expect(listControlPlaneAdminProfiles(store)).rejects.toThrow("projection");

    const oneSidedStore = new MemoryKv();
    oneSidedStore.values.set(PROFILE_KEY, JSON.stringify({ ...profile, projection: { authorityRevision: 1 } }));
    oneSidedStore.values.set(PROJECTION_COMMIT_KEY, JSON.stringify({ schemaVersion: 1, authorityRevision: 1 }));
    await expect(listControlPlaneAdminProfiles(oneSidedStore)).rejects.toThrow("projection");

    const bootstrapAttempt = await mutate(createLock(store), "publish", {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: 2,
      confirmation: "PUBLISH pro v2",
    });
    expect(bootstrapAttempt.status).toBe(503);
  });
});
