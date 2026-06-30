import type { KvNamespaceLike } from "./admin-store";
import type { PricingTarget } from "./pricing-watchlist-store";

export type PricingRecord = {
  provider: string;
  model: string;
  pricingSource: string;
  checkedAt: string;
  status: "live" | "manual" | "stale" | "needs-review";
  unitType: "per_hour" | "per_minute" | "per_1m_tokens" | "per_request" | "unknown";
  currency: string;
  inputPrice: string | null;
  outputPrice: string | null;
  audioInputPrice: string | null;
  audioOutputPrice: string | null;
  requestPrice: string | null;
  rawPriceJson: unknown;
};

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeRecord(record: PricingRecord): PricingRecord {
  const provider = typeof record.provider === "string" ? record.provider.trim() : "";
  const model = typeof record.model === "string" ? record.model.trim() : "";
  if (!provider || !model) {
    throw new Error("pricing record requires provider and model");
  }
  return {
    ...record,
    provider,
    model,
    pricingSource: typeof record.pricingSource === "string" ? record.pricingSource.trim() : "",
    checkedAt: typeof record.checkedAt === "string" ? record.checkedAt.trim() : "",
    currency: typeof record.currency === "string" && record.currency.trim() ? record.currency.trim() : "USD",
  };
}

function pricingKey(provider: string, model: string): string {
  return `pricing:model:${provider.trim().toLowerCase()}:${model.trim().toLowerCase()}`;
}

function compareTargets(left: PricingTarget, right: PricingTarget): number {
  const providerCompare = left.provider.localeCompare(right.provider);
  return providerCompare !== 0 ? providerCompare : left.model.localeCompare(right.model);
}

export async function putPricingRecord(store: KvNamespaceLike, record: PricingRecord): Promise<PricingRecord> {
  const normalized = normalizeRecord(record);
  await store.put(pricingKey(normalized.provider, normalized.model), JSON.stringify(normalized, null, 2));
  return normalized;
}

export async function getPricingRecord(store: KvNamespaceLike, provider: string, model: string): Promise<PricingRecord | null> {
  const raw = await store.get(pricingKey(provider, model));
  if (!raw) return null;
  const parsed = parseJson<PricingRecord | null>(raw, null);
  return parsed ? normalizeRecord(parsed) : null;
}

export async function getPricingSnapshot(store: KvNamespaceLike, targets: PricingTarget[]): Promise<PricingRecord[]> {
  const sorted = [...targets]
    .map((target) => ({
      provider: typeof target.provider === "string" ? target.provider.trim() : "",
      model: typeof target.model === "string" ? target.model.trim() : "",
    }))
    .filter((target) => target.provider && target.model)
    .sort(compareTargets);

  const rows = await Promise.all(sorted.map((target) => getPricingRecord(store, target.provider, target.model)));
  return rows.filter((row): row is PricingRecord => Boolean(row));
}
