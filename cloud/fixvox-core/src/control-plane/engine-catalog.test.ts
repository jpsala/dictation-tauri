// @ts-expect-error Bun provides this module in `bun test`; root TS config does not ship Bun ambient types.
import { describe, expect, test } from "bun:test";
import {
  InMemoryEngineCatalogStore,
  createProviderDiscoveryAdapter,
  publishEngine,
  reviewEngine,
  retireEngine,
  runEngineCatalogDiscoveryJob,
} from "./engine-catalog.ts";

const firstRun = new Date("2026-01-01T00:00:00.000Z");
const secondRun = new Date("2026-01-01T06:00:00.000Z");
const thirdRun = new Date("2026-01-01T12:00:00.000Z");

function adapter(discover: () => Promise<readonly Record<string, unknown>[]>) {
  return createProviderDiscoveryAdapter({ id: "groq", discover: discover as never });
}

const model = {
  engineId: "groq:selection:llama-3.3-70b-versatile",
  provider: "groq",
  providerLabel: "Groq",
  model: "llama-3.3-70b-versatile",
  modelLabel: "Llama 3.3 70B",
  kind: "selectionTransform" as const,
  tier: "balanced" as const,
  supportedEfforts: [{ id: "medium", label: "Medium" }],
  defaultEffortId: "medium",
};

describe("engine catalog lifecycle", () => {
  test("keeps discovery candidates unpublished and makes a repeated window idempotent", async () => {
    const store = new InMemoryEngineCatalogStore();
    const result = await runEngineCatalogDiscoveryJob({ store, adapters: [adapter(async () => [model, model])], now: firstRun });
    expect(result).toMatchObject({ status: "succeeded", discoveredCount: 1, candidateCount: 1, missCount: 0 });
    expect((await store.list())[0]).toMatchObject({ engineId: model.engineId, lifecycleStatus: "candidate", availability: "available", revision: 0, publishedRevision: null });

    const replay = await runEngineCatalogDiscoveryJob({ store, adapters: [adapter(async () => [model])], now: firstRun, force: true });
    expect(replay).toMatchObject({ status: "skipped", reason: "duplicate" });
    expect((await store.list())).toHaveLength(1);
  });

  test("preserves last-known-good metadata on provider failure and transient misses", async () => {
    const store = new InMemoryEngineCatalogStore();
    await runEngineCatalogDiscoveryJob({ store, adapters: [adapter(async () => [model])], now: firstRun });
    const published = await publishEngine({ store, engineId: model.engineId, actorRef: "arp_actor", now: firstRun });
    expect(published.entry.lifecycleStatus).toBe("published");

    const missing = await runEngineCatalogDiscoveryJob({ store, adapters: [adapter(async () => [])], now: secondRun });
    expect(missing).toMatchObject({ status: "succeeded", missCount: 1 });
    expect((await store.list())[0]).toMatchObject({ lifecycleStatus: "published", availability: "available", consecutiveMisses: 1, lastSeenAt: firstRun.toISOString() });

    const failed = await runEngineCatalogDiscoveryJob({ store, adapters: [adapter(async () => { throw new Error("provider_down"); })], now: thirdRun });
    expect(failed).toMatchObject({ status: "failed", reason: "provider_failure", failedAdapters: ["groq"] });
    expect((await store.list())[0]).toMatchObject({ lifecycleStatus: "published", availability: "available", consecutiveMisses: 1, lastSeenAt: firstRun.toISOString() });
  });

  test("keeps published premium/high metadata when discovery reports balanced without efforts", async () => {
    const store = new InMemoryEngineCatalogStore();
    const premium = {
      ...model,
      providerLabel: "Curated provider",
      modelLabel: "Curated premium",
      tier: "premium" as const,
      supportedEfforts: [{ id: "high", label: "High" }],
      defaultEffortId: "high",
    };
    await runEngineCatalogDiscoveryJob({ store, adapters: [adapter(async () => [premium])], now: firstRun });
    await publishEngine({ store, engineId: model.engineId, actorRef: "arp_publisher", expectedRevision: 0, now: secondRun });

    const result = await runEngineCatalogDiscoveryJob({
      store,
      adapters: [adapter(async () => [{ ...model, providerLabel: "Observed provider", modelLabel: "Observed balanced", tier: "balanced", supportedEfforts: [], defaultEffortId: null }])],
      now: thirdRun,
    });

    expect(result).toMatchObject({ status: "succeeded", discoveredCount: 1 });
    expect((await store.list())[0]).toMatchObject({
      lifecycleStatus: "published",
      providerLabel: "Curated provider",
      modelLabel: "Curated premium",
      tier: "premium",
      supportedEfforts: [{ id: "high", label: "High" }],
      defaultEffortId: "high",
      lastSeenAt: thirdRun.toISOString(),
    });
  });

  test("publishes and retires manually with revisioned audit records", async () => {
    const store = new InMemoryEngineCatalogStore();
    await runEngineCatalogDiscoveryJob({ store, adapters: [adapter(async () => [model])], now: firstRun });
    const published = await publishEngine({ store, engineId: model.engineId, actorRef: "arp_publisher", expectedRevision: 0, now: secondRun });
    expect(published).toMatchObject({ idempotentReplay: false, entry: { lifecycleStatus: "published", revision: 1, publishedRevision: "r1", reviewedBy: "arp_publisher" }, audit: { action: "publish", previousStatus: "candidate", resultingStatus: "published" } });
    const replay = await publishEngine({ store, engineId: model.engineId, actorRef: "arp_publisher", expectedRevision: 1, now: secondRun });
    expect(replay.idempotentReplay).toBe(true);
    const reviewed = await reviewEngine({ store, engineId: model.engineId, actorRef: "arp_reviewer", expectedRevision: 1, now: thirdRun });
    expect(reviewed).toMatchObject({ idempotentReplay: false, entry: { lifecycleStatus: "published", availability: "available", revision: 2, reviewedBy: "arp_reviewer" }, audit: { action: "review" } });
    const retired = await retireEngine({ store, engineId: model.engineId, actorRef: "arp_publisher", expectedRevision: 2, now: thirdRun });
    expect(retired).toMatchObject({ idempotentReplay: false, entry: { lifecycleStatus: "retired", availability: "retired", revision: 3 }, audit: { action: "retire" } });
    expect(store.auditsSnapshot.map((audit) => audit.action)).toEqual(["publish", "review", "retire"]);
  });

  test("rejects stale admin revisions and never auto-publishes", async () => {
    const store = new InMemoryEngineCatalogStore();
    await runEngineCatalogDiscoveryJob({ store, adapters: [adapter(async () => [model])], now: firstRun });
    await expect(publishEngine({ store, engineId: model.engineId, actorRef: "arp_publisher", expectedRevision: 99, now: secondRun })).rejects.toThrow("engine_catalog_stale_revision");
    expect((await store.list())[0]?.lifecycleStatus).toBe("candidate");
  });
});
