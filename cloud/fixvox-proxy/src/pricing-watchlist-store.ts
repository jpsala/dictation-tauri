import type { KvNamespaceLike } from "./admin-store";

export type PricingTarget = {
  provider: string;
  model: string;
};

export type PricingMergedTarget = PricingTarget & {
  source: "required" | "manual";
};

export type PricingWatchlistSnapshot = {
  required: PricingTarget[];
  manual: PricingTarget[];
  merged: PricingMergedTarget[];
};

const REQUIRED_KEY = "pricing:watchlist:required";
const MANUAL_KEY = "pricing:watchlist:manual";

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeTargets(targets: PricingTarget[]): PricingTarget[] {
  const seen = new Set<string>();
  const normalized: PricingTarget[] = [];

  for (const target of targets) {
    const provider = typeof target.provider === "string" ? target.provider.trim() : "";
    const model = typeof target.model === "string" ? target.model.trim() : "";
    if (!provider || !model) continue;
    const key = `${provider}:${model}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ provider, model });
  }

  return normalized.sort((left, right) => {
    const providerCompare = left.provider.localeCompare(right.provider);
    return providerCompare !== 0 ? providerCompare : left.model.localeCompare(right.model);
  });
}

async function readTargets(store: KvNamespaceLike, key: string): Promise<PricingTarget[]> {
  const raw = parseJson<unknown[]>(await store.get(key), []);
  const targets = raw
    .filter((value): value is { provider?: unknown; model?: unknown } => Boolean(value) && typeof value === "object")
    .map((value) => ({
      provider: typeof value.provider === "string" ? value.provider : "",
      model: typeof value.model === "string" ? value.model : "",
    }));
  return normalizeTargets(targets);
}

async function writeTargets(store: KvNamespaceLike, key: string, targets: PricingTarget[]): Promise<PricingTarget[]> {
  const normalized = normalizeTargets(targets);
  await store.put(key, JSON.stringify(normalized, null, 2));
  return normalized;
}

function mergeTargets(required: PricingTarget[], manual: PricingTarget[]): PricingMergedTarget[] {
  const merged: PricingMergedTarget[] = required.map((target) => ({ ...target, source: "required" }));
  const requiredKeys = new Set(required.map((target) => `${target.provider}:${target.model}`.toLowerCase()));
  for (const target of manual) {
    const key = `${target.provider}:${target.model}`.toLowerCase();
    if (requiredKeys.has(key)) continue;
    merged.push({ ...target, source: "manual" });
  }
  return merged;
}

export async function getPricingWatchlist(store: KvNamespaceLike): Promise<PricingWatchlistSnapshot> {
  const [required, manual] = await Promise.all([
    readTargets(store, REQUIRED_KEY),
    readTargets(store, MANUAL_KEY),
  ]);

  return {
    required,
    manual,
    merged: mergeTargets(required, manual),
  };
}

export async function putRequiredPricingTargets(store: KvNamespaceLike, targets: PricingTarget[]): Promise<PricingTarget[]> {
  return writeTargets(store, REQUIRED_KEY, targets);
}

export async function putManualPricingWatchlist(store: KvNamespaceLike, targets: PricingTarget[]): Promise<PricingTarget[]> {
  return writeTargets(store, MANUAL_KEY, targets);
}
