export type JobDependencies = {
  releaseExpiredReservations(): Promise<number>;
  refreshSafeProjections(): Promise<void>;
};

export type JobResult = { name: "release-expired-reservations" | "refresh-safe-projections"; ok: boolean };

/** Explicit, injectable scheduled work; systemd invokes these functions, not HTTP routes. */
export async function runMaintenanceJobs(deps: JobDependencies): Promise<JobResult[]> {
  const results: JobResult[] = [];
  try {
    await deps.releaseExpiredReservations();
    results.push({ name: "release-expired-reservations", ok: true });
  } catch {
    results.push({ name: "release-expired-reservations", ok: false });
  }
  try {
    await deps.refreshSafeProjections();
    results.push({ name: "refresh-safe-projections", ok: true });
  } catch {
    results.push({ name: "refresh-safe-projections", ok: false });
  }
  return results;
}
