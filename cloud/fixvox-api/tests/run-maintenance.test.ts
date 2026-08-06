/// <reference path="../src/bun-test.d.ts" />

import { describe, expect, test } from "bun:test";
import { createLocalEngineCatalogDiscoveryTask } from "../src/run-maintenance.ts";
import { InMemoryEngineCatalogStore, createProviderDiscoveryAdapter } from "../../fixvox-core/src/control-plane/engine-catalog.ts";

describe("local maintenance catalog wiring", () => {
  test("uses injected provider-free adapters and store", async () => {
    const store = new InMemoryEngineCatalogStore();
    const task = createLocalEngineCatalogDiscoveryTask({
      store,
      providerKeys: {},
      adapters: [createProviderDiscoveryAdapter({
        id: "fixture",
        async discover() {
          return [{
            engineId: "fixture:selectionTransform:model",
            provider: "fixture",
            model: "model",
            kind: "selectionTransform",
          }];
        },
      })],
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    await expect(task()).resolves.toBe(1);
    expect((await store.list())[0]).toMatchObject({ lifecycleStatus: "candidate", provider: "fixture" });
  });

  test("does not create provider adapters from an empty config", async () => {
    const store = new InMemoryEngineCatalogStore();
    const task = createLocalEngineCatalogDiscoveryTask({
      store,
      providerKeys: {},
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    await expect(task()).resolves.toBe(0);
    expect(await store.list()).toHaveLength(0);
  });
});
