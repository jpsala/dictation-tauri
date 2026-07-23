/// <reference path="../bun-runtime.d.ts" />

export type SttPricingRecord = {
  schemaVersion: 1;
  currency: "USD";
  unit: "per_hour";
  priceMicrousd: number;
};

export type BudgetPricingPort = {
  sttPriceMicrousd(input: { providerId: string; modelId: string }): Promise<number | null>;
};

export interface BudgetPricingSql {
  unsafe<T extends Record<string, unknown> = Record<string, unknown>>(query: string, parameters?: unknown[]): Promise<T[]>;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { return record(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function parseSttPricingRecord(value: unknown): SttPricingRecord | null {
  const candidate = record(value);
  const priceMicrousd = candidate.priceMicrousd;
  if (
    candidate.schemaVersion !== 1
    || candidate.currency !== "USD"
    || candidate.unit !== "per_hour"
    || typeof priceMicrousd !== "number"
    || !Number.isSafeInteger(priceMicrousd)
    || priceMicrousd < 0
  ) return null;
  return { schemaVersion: 1, currency: "USD", unit: "per_hour", priceMicrousd };
}

export class PostgresBudgetPricingRepository implements BudgetPricingPort {
  constructor(private readonly sql: BudgetPricingSql) {}

  async sttPriceMicrousd(input: { providerId: string; modelId: string }): Promise<number | null> {
    const providerId = input.providerId.trim();
    const modelId = input.modelId.trim();
    if (!providerId || !modelId) return null;
    const rows = await this.sql.unsafe<{ pricing: unknown }>(`
      SELECT pricing
      FROM pricing_records
      WHERE provider_id = $1 AND model_id = $2
      ORDER BY effective_at DESC, created_at DESC
      LIMIT 1
    `, [providerId, modelId]);
    return parseSttPricingRecord(rows[0]?.pricing)?.priceMicrousd ?? null;
  }
}
