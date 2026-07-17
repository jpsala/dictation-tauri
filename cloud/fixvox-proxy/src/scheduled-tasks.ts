import { scheduleBackgroundJobs } from "../../fixvox-core/src/jobs/schedule";
import type { BackgroundJobSchedulerPort } from "../../fixvox-core/src/ports";
import { refreshPricing } from "./pricing-refresh";
import type { KvNamespaceLike } from "./admin-store";
import { getPricingSnapshot } from "./pricing-store";
import { getPricingWatchlist } from "./pricing-watchlist-store";

export type ScheduledTaskEnv = {
  GROQ_API_KEY: string;
  OPENROUTER_API_KEY?: string;
  DISCORD_SUPPORT_SCAN_ENABLED?: string;
  USAGE?: KvNamespaceLike;
};

type ScheduledTaskDeps = {
  refreshPricingTask: () => Promise<void>;
  discordScanTask: () => Promise<void>;
};

const DEFAULT_PRICING_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const OPENROUTER_PRICING_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

function isDiscordSupportScanEnabled(env: ScheduledTaskEnv): boolean {
  const value = env.DISCORD_SUPPORT_SCAN_ENABLED?.trim().toLowerCase() ?? "";
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function buildScheduledTaskDeps(
  env: ScheduledTaskEnv,
  discordScanTask: () => Promise<void>,
): ScheduledTaskDeps {
  return {
    refreshPricingTask: async () => {
      if (!env.USAGE) return;
      if (!(await shouldRefreshPricing(env.USAGE))) return;
      await refreshPricing(env.USAGE, {
        groqApiKey: env.GROQ_API_KEY,
        openrouterApiKey: env.OPENROUTER_API_KEY ?? null,
      });
    },
    discordScanTask,
  };
}

function normalizeTargetKey(provider: string, model: string): string {
  return `${provider.trim().toLowerCase()}:${model.trim().toLowerCase()}`;
}

function pricingRefreshIntervalMs(provider: string): number {
  return provider.trim().toLowerCase() === "openrouter"
    ? OPENROUTER_PRICING_REFRESH_INTERVAL_MS
    : DEFAULT_PRICING_REFRESH_INTERVAL_MS;
}

export async function shouldRefreshPricing(
  store: KvNamespaceLike,
  now: Date = new Date(),
): Promise<boolean> {
  const watchlist = await getPricingWatchlist(store);
  if (watchlist.merged.length === 0) {
    return false;
  }

  const snapshot = await getPricingSnapshot(store, watchlist.merged);
  const byTarget = new Map(snapshot.map((record) => [normalizeTargetKey(record.provider, record.model), record]));
  const nowMs = now.getTime();

  for (const target of watchlist.merged) {
    const record = byTarget.get(normalizeTargetKey(target.provider, target.model));
    if (!record) {
      return true;
    }

    const checkedAtMs = Date.parse(record.checkedAt);
    if (!Number.isFinite(checkedAtMs)) {
      return true;
    }

    if ((nowMs - checkedAtMs) >= pricingRefreshIntervalMs(target.provider)) {
      return true;
    }
  }

  return false;
}

export function runScheduledTasks(
  env: ScheduledTaskEnv,
  scheduler: BackgroundJobSchedulerPort,
  deps: ScheduledTaskDeps,
): void {
  const jobs = [deps.refreshPricingTask];
  if (isDiscordSupportScanEnabled(env)) jobs.push(deps.discordScanTask);
  scheduleBackgroundJobs(scheduler, jobs);
}
