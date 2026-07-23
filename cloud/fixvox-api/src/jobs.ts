export type JobDependencies = {
  releaseExpiredReservations(): Promise<number>;
  publishBudgetLedgerOutbox(): Promise<number>;
  refreshSafeProjections(): Promise<number | void>;
  expireAuthHandoffs(): Promise<number | void>;
  pruneProductSignals(): Promise<number>;
};

export type JobName =
  | "release-expired-reservations"
  | "publish-budget-ledger-outbox"
  | "refresh-safe-projections"
  | "expire-auth-handoffs"
  | "prune-product-signals";
export type JobResult = { name: JobName; ok: boolean; count: number; durationMs: number };

/** Explicit, provider-free local jobs. Each failure is isolated from the runtime hot path. */
export async function runMaintenanceJobs(deps: JobDependencies): Promise<JobResult[]> {
  const jobs: Array<[JobName, () => Promise<number | void>]> = [
    ["release-expired-reservations", deps.releaseExpiredReservations],
    ["publish-budget-ledger-outbox", deps.publishBudgetLedgerOutbox],
    ["refresh-safe-projections", deps.refreshSafeProjections],
    ["expire-auth-handoffs", deps.expireAuthHandoffs],
    ["prune-product-signals", deps.pruneProductSignals],
  ];
  const results: JobResult[] = [];
  for (const [name, run] of jobs) {
    const started = performance.now();
    try {
      const count = await run();
      results.push({ name, ok: true, count: typeof count === "number" ? count : 0, durationMs: Math.max(0, Math.round(performance.now() - started)) });
    } catch {
      results.push({ name, ok: false, count: 0, durationMs: Math.max(0, Math.round(performance.now() - started)) });
    }
  }
  return results;
}
