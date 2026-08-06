/// <reference path="../src/bun-test.d.ts" />

import { describe, expect, test } from "bun:test";
import { PostgresEngineCatalogRepository, type EngineCatalogSql } from "../src/postgres/engine-catalog-repository.ts";

type FakeEngineRow = Record<string, unknown> & {
  engine_id: string;
  provider: string;
  model: string;
  provider_label: string;
  model_label: string;
  kind: string;
  tier: string;
  supported_efforts: unknown;
  default_effort_id: string | null;
  availability: string;
  lifecycle_status: string;
  source: string;
  catalog_revision: string | number;
  published_revision: string | null;
  first_seen_at: string;
  last_seen_at: string | null;
  last_missed_at: string | null;
  consecutive_misses: string | number;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

class FakeEngineCatalogSql implements EngineCatalogSql {
  readonly updates: unknown[][] = [];

  constructor(private row: FakeEngineRow) {}

  async unsafe<T extends Record<string, unknown> = Record<string, unknown>>(query: string, parameters: unknown[] = []): Promise<T[]> {
    const normalized = query.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("INSERT INTO engines")) return [];
    if (normalized.includes("FROM engines WHERE engine_id = $1 FOR UPDATE")) return [this.row as T];
    if (normalized.startsWith("UPDATE engines SET provider = $2")) {
      this.updates.push(parameters);
      const [, provider, model, kind, providerLabel, modelLabel, tier, supportedEfforts, defaultEffortId, lastSeenAt] = parameters;
      this.row = {
        ...this.row,
        provider: String(provider),
        model: String(model),
        kind: String(kind),
        provider_label: String(providerLabel),
        model_label: String(modelLabel),
        tier: String(tier),
        supported_efforts: supportedEfforts,
        default_effort_id: (defaultEffortId as string | null),
        last_seen_at: String(lastSeenAt),
        last_missed_at: null,
        consecutive_misses: 0,
      };
      return [];
    }
    if (normalized.startsWith("SELECT engine_id, provider, model")) return [this.row as T];
    throw new Error(`unexpected_sql:${normalized}`);
  }

  async begin<T>(operation: (transaction: EngineCatalogSql) => Promise<T>): Promise<T> {
    return operation(this);
  }
}

function publishedRow(): FakeEngineRow {
  return {
    engine_id: "groq:selection:curated",
    provider: "groq",
    model: "curated-model",
    provider_label: "Curated provider",
    model_label: "Curated premium",
    kind: "selectionTransform",
    tier: "premium",
    supported_efforts: [{ id: "high", label: "High" }],
    default_effort_id: "high",
    availability: "available",
    lifecycle_status: "published",
    source: "discovered",
    catalog_revision: 1,
    published_revision: "r1",
    first_seen_at: "2026-01-01T00:00:00.000Z",
    last_seen_at: "2026-01-01T00:00:00.000Z",
    last_missed_at: null,
    consecutive_misses: 0,
    reviewed_at: "2026-01-01T00:00:00.000Z",
    reviewed_by: "arp_publisher",
  };
}

describe("PostgreSQL engine catalog repository", () => {
  test("keeps published metadata immutable while updating the sighting", async () => {
    const sql = new FakeEngineCatalogSql(publishedRow());
    const repository = new PostgresEngineCatalogRepository(sql);

    const result = await repository.upsertDiscovered({
      adapterId: "groq",
      observedAt: "2026-01-01T06:00:00.000Z",
      engine: {
        engineId: "groq:selection:curated",
        provider: "groq",
        model: "curated-model",
        providerLabel: "Observed provider",
        modelLabel: "Observed balanced",
        kind: "selectionTransform",
        tier: "balanced",
        supportedEfforts: [],
        defaultEffortId: null,
      },
    });

    expect(result.entry).toMatchObject({
      lifecycleStatus: "published",
      providerLabel: "Curated provider",
      modelLabel: "Curated premium",
      tier: "premium",
      supportedEfforts: [{ id: "high", label: "High" }],
      defaultEffortId: "high",
      lastSeenAt: "2026-01-01T06:00:00.000Z",
    });
    expect(sql.updates).toHaveLength(1);
    expect(sql.updates[0]?.slice(1, 10)).toEqual([
      "groq",
      "curated-model",
      "selectionTransform",
      "Curated provider",
      "Curated premium",
      "premium",
      JSON.stringify([{ id: "high", label: "High" }]),
      "high",
      "2026-01-01T06:00:00.000Z",
    ]);
  });
});
