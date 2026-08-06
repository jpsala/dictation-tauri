import { describe, expect, test } from "bun:test";
import { runMaintenanceJobs, createEngineCatalogDiscoveryTask } from "../src/jobs.ts";
import { InMemoryEngineCatalogStore, createProviderDiscoveryAdapter } from "../../fixvox-core/src/control-plane/engine-catalog.ts";

describe("explicit maintenance jobs", () => {
  test("isolates failures so a timer can report both jobs without HTTP or provider work", async () => {
    const result = await runMaintenanceJobs({
      async releaseExpiredReservations() { return 0; },
      async publishBudgetLedgerOutbox() { return 1; },
      async refreshSafeProjections() { throw new Error("synthetic_failure"); },
      async expireAuthHandoffs() { return 2; },
      async pruneProductSignals() { return 3; },
    });
    expect(result.map(({ name, ok, count }) => ({ name, ok, count }))).toEqual([
      { name: "release-expired-reservations", ok: true, count: 0 },
      { name: "publish-budget-ledger-outbox", ok: true, count: 1 },
      { name: "refresh-safe-projections", ok: false, count: 0 },
      { name: "expire-auth-handoffs", ok: true, count: 2 },
      { name: "prune-product-signals", ok: true, count: 3 },
    ]);
    expect(result.every((job) => job.durationMs >= 0)).toBe(true);
  });

  test("runs injected catalog discovery as an optional local job", async () => {
    const result = await runMaintenanceJobs({
      async releaseExpiredReservations() { return 0; },
      async publishBudgetLedgerOutbox() { return 0; },
      async refreshSafeProjections() { return 0; },
      async expireAuthHandoffs() { return 0; },
      async pruneProductSignals() { return 0; },
      async discoverEngineCatalog() { return 2; },
    });
    expect(result.at(-1)).toMatchObject({ name: "discover-engine-catalog", ok: true, count: 2 });
  });

  test("binds the six-hour discovery task without contacting a provider", async () => {
    const task = createEngineCatalogDiscoveryTask({
      store: new InMemoryEngineCatalogStore(),
      adapters: [createProviderDiscoveryAdapter({ id: "fixture", async discover() { return []; } })],
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    await expect(task()).resolves.toBe(0);
  });
});
