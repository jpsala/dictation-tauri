// @ts-expect-error Bun provides this module in `bun test`; root TS config does not ship Bun ambient types.
import { describe, expect, test } from "bun:test";
import {
  InMemoryEngineCatalogStore,
  publishEngine,
  runEngineCatalogDiscoveryJob,
} from "../../fixvox-core/src/control-plane/engine-catalog";
import { createProviderEngineDiscoveryAdapter } from "./provider-model-catalog";

describe("provider engine discovery adapter", () => {
  test("does not turn fallback picker data into authoritative candidates", async () => {
    const adapter = createProviderEngineDiscoveryAdapter("groq", {});
    await expect(adapter.discover()).rejects.toThrow("groq_discovery_unavailable");
  });

  test("partitions a live mixed Llama/Whisper catalog by capability and preserves lifecycle semantics", async () => {
    const previousFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = async () => {
      fetches += 1;
      return Response.json({
        data: [
          { id: "llama-3.3-70b-versatile" },
          { id: "whisper-large-v3-turbo" },
        ],
      });
    };

    try {
      const adapter = createProviderEngineDiscoveryAdapter("groq", { groq: "fixture-key" });
      const store = new InMemoryEngineCatalogStore();
      const first = await runEngineCatalogDiscoveryJob({
        store,
        adapters: [adapter],
        now: new Date("2026-01-01T00:00:00.000Z"),
      });
      expect(first).toMatchObject({ status: "succeeded", discoveredCount: 2, candidateCount: 2 });

      const entries = await store.list();
      expect(entries.map(({ engineId, kind }) => ({ engineId, kind }))).toEqual([
        { engineId: "discovered:groq:selectionTransform:llama-3.3-70b-versatile", kind: "selectionTransform" },
        { engineId: "discovered:groq:transcription:whisper-large-v3-turbo", kind: "transcription" },
      ]);
      expect(entries.some((entry) => entry.kind === "selectionTransform" && entry.model.includes("whisper"))).toBe(false);

      const replay = await runEngineCatalogDiscoveryJob({
        store,
        adapters: [adapter],
        now: new Date("2026-01-01T00:00:00.000Z"),
        force: true,
      });
      expect(replay).toMatchObject({ status: "skipped", reason: "duplicate" });

      const published = await publishEngine({
        store,
        engineId: "discovered:groq:selectionTransform:llama-3.3-70b-versatile",
        actorRef: "fixture-publisher",
        expectedRevision: 0,
        now: new Date("2026-01-01T00:00:00.000Z"),
      });
      expect(published.entry).toMatchObject({ lifecycleStatus: "published", kind: "selectionTransform", tier: "balanced" });

      const next = await runEngineCatalogDiscoveryJob({
        store,
        adapters: [adapter],
        now: new Date("2026-01-01T06:00:00.000Z"),
      });
      expect(next).toMatchObject({ status: "succeeded", discoveredCount: 2 });
      expect((await store.list()).find((entry) => entry.engineId === published.entry.engineId)).toMatchObject({
        lifecycleStatus: "published",
        kind: "selectionTransform",
        providerLabel: "groq",
        modelLabel: "llama-3.3-70b-versatile",
      });
      expect(fetches).toBe(2);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
