import { composeApi, type ApiComposition } from "./composition.ts";
import { createEngineCatalogDiscoveryTask, runMaintenanceJobs, type JobResult } from "./jobs.ts";
import { PostgresBudgetLedgerMaintenanceRepository } from "./postgres/budget-ledger-maintenance-repository.ts";
import { PostgresEngineCatalogRepository } from "./postgres/engine-catalog-repository.ts";
import {
  createProviderEngineDiscoveryAdapter,
  type Provider,
  type ProviderKeyBag,
} from "../../fixvox-proxy/src/provider-model-catalog.ts";
import type { EngineCatalogStore, EngineDiscoveryAdapter } from "../../fixvox-core/src/control-plane/engine-catalog.ts";

const LOCAL_DISCOVERY_PROVIDERS = ["groq", "openrouter"] as const satisfies readonly Provider[];

export type LocalEngineCatalogOptions = {
  /** Explicit adapters make local/unit runs provider-free and deterministic. */
  adapters?: readonly EngineDiscoveryAdapter[];
  /** Defaults to the API's Postgres repository in the executable entrypoint. */
  store?: EngineCatalogStore;
  /** Defaults to configured API keys; tests can pass an empty bag. */
  providerKeys?: ProviderKeyBag;
  now?: () => Date;
};

/**
 * Build the injected catalog task used by local maintenance. Fallback model
 * lists are intentionally not adapters: only configured providers can make a
 * live discovery request, and the caller can always supply fixture adapters.
 */
export function createLocalEngineCatalogDiscoveryTask(input: {
  store: EngineCatalogStore;
  providerKeys?: ProviderKeyBag;
  adapters?: readonly EngineDiscoveryAdapter[];
  now?: () => Date;
}): () => Promise<number> {
  const adapters = input.adapters ?? LOCAL_DISCOVERY_PROVIDERS
    .filter((provider) => Boolean(input.providerKeys?.[provider]))
    .map((provider) => createProviderEngineDiscoveryAdapter(provider, input.providerKeys ?? {}));
  return createEngineCatalogDiscoveryTask({ store: input.store, adapters, now: input.now });
}

export type LocalMaintenanceOptions = {
  engineCatalog?: LocalEngineCatalogOptions;
};

/** Run the existing local maintenance set with an injected catalog task. */
export async function runLocalMaintenance(api: ApiComposition, options: LocalMaintenanceOptions = {}): Promise<JobResult[]> {
  const budgetMaintenance = new PostgresBudgetLedgerMaintenanceRepository(api.sql);
  const engineCatalogStore = options.engineCatalog?.store ?? new PostgresEngineCatalogRepository(api.sql);
  const discoverEngineCatalog = createLocalEngineCatalogDiscoveryTask({
    store: engineCatalogStore,
    adapters: options.engineCatalog?.adapters,
    providerKeys: options.engineCatalog?.providerKeys ?? api.config.providerKeys,
    now: options.engineCatalog?.now,
  });

  return runMaintenanceJobs({
    async releaseExpiredReservations() {
      const rows = await api.sql.unsafe<{ id: string }>(`
        UPDATE usage_reservations SET state = 'expired', updated_at = now()
        WHERE state = 'reserved' AND expires_at <= now() RETURNING id::text
      `);
      const budget = await budgetMaintenance.expireDueReservations({
        now: new Date().toISOString(),
        limit: 100,
      });
      return rows.length + budget.expiredCount;
    },
    async publishBudgetLedgerOutbox() {
      const result = await budgetMaintenance.publishPendingOutbox({ limit: 100 });
      return result.publishedCount;
    },
    async refreshSafeProjections() {
      await api.sql.unsafe("SELECT 1 FROM control_plane_authority WHERE singleton = true");
    },
    async expireAuthHandoffs() {
      const oauth = await api.sql.unsafe(`UPDATE oauth_states SET result_status = 'expired' WHERE expires_at <= now() AND result_status = 'pending' RETURNING state_hash`);
      const desktop = await api.sql.unsafe(`UPDATE desktop_login_sessions SET status = 'expired', updated_at = now() WHERE expires_at <= now() AND status = 'pending' RETURNING session_hash`);
      return oauth.length + desktop.length;
    },
    async pruneProductSignals() {
      const rows = await api.sql.unsafe<{ count: string }>(`WITH deleted AS (DELETE FROM feedback_events WHERE occurred_at < now() - interval '30 days' RETURNING 1) SELECT count(*)::text AS count FROM deleted`);
      return Number(rows[0]?.count ?? 0);
    },
    discoverEngineCatalog,
  });
}

async function main(): Promise<void> {
  const api = composeApi();
  try {
    const result = await runLocalMaintenance(api);
    if (result.some((job) => !job.ok)) process.exitCode = 1;
  } finally {
    await api.close();
  }
}

// Keep this module importable for provider-free tests and composition checks.
if ((import.meta as ImportMeta & { main?: boolean }).main) await main();
