import { runEngineCatalogDiscoveryJob, type EngineCatalogStore, type EngineDiscoveryAdapter } from "../../fixvox-core/src/control-plane/engine-catalog.ts";

export type JobDependencies = {
  releaseExpiredReservations(): Promise<number>;
  publishBudgetLedgerOutbox(): Promise<number>;
  refreshSafeProjections(): Promise<number | void>;
  expireAuthHandoffs(): Promise<number | void>;
  pruneProductSignals(): Promise<number>;
  /** Optional local six-hour catalog discovery callback. It is injected so tests never call providers. */
  discoverEngineCatalog?: () => Promise<number | void>;
};

export type JobName =
  | "release-expired-reservations"
  | "publish-budget-ledger-outbox"
  | "refresh-safe-projections"
  | "expire-auth-handoffs"
  | "prune-product-signals"
  | "discover-engine-catalog";
export type JobResult = { name: JobName; ok: boolean; count: number; durationMs: number };

/**
 * Bind the provider-neutral six-hour job to the maintenance runner. The
 * adapters are supplied by the caller, so constructing this task is itself
 * provider-free and safe for unit tests.
 */
export function createEngineCatalogDiscoveryTask(input: { store: EngineCatalogStore; adapters: readonly EngineDiscoveryAdapter[]; now?: () => Date }): () => Promise<number> {
  return async () => {
    const result = await runEngineCatalogDiscoveryJob({ store: input.store, adapters: input.adapters, now: input.now?.() });
    if (result.status === "failed") throw new Error(result.reason ?? "engine_catalog_discovery_failed");
    return result.candidateCount;
  };
}
/** Explicit, provider-free local jobs. Each failure is isolated from the runtime hot path. */
export async function runMaintenanceJobs(deps: JobDependencies): Promise<JobResult[]> {
  const jobs: Array<[JobName, () => Promise<number | void>]> = [
    ["release-expired-reservations", deps.releaseExpiredReservations],
    ["publish-budget-ledger-outbox", deps.publishBudgetLedgerOutbox],
    ["refresh-safe-projections", deps.refreshSafeProjections],
    ["expire-auth-handoffs", deps.expireAuthHandoffs],
    ["prune-product-signals", deps.pruneProductSignals],
  ];
  if (deps.discoverEngineCatalog) jobs.push(["discover-engine-catalog", deps.discoverEngineCatalog]);
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
