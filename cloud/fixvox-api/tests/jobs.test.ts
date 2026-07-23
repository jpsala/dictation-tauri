import { describe, expect, test } from "bun:test";
import { runMaintenanceJobs } from "../src/jobs.ts";

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
});
