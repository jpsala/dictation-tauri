import { describe, expect, test } from "bun:test";
import { runMaintenanceJobs } from "../src/jobs.ts";

describe("explicit maintenance jobs", () => {
  test("isolates failures so a timer can report both jobs without HTTP or provider work", async () => {
    const result = await runMaintenanceJobs({
      async releaseExpiredReservations() { return 0; },
      async refreshSafeProjections() { throw new Error("synthetic_failure"); },
    });
    expect(result).toEqual([
      { name: "release-expired-reservations", ok: true },
      { name: "refresh-safe-projections", ok: false },
    ]);
  });
});
