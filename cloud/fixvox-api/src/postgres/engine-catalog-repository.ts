/// <reference path="../bun-runtime.d.ts" />

import {
  normalizeDiscoveredEngine,
} from "../../../fixvox-core/src/control-plane/engine-catalog.ts";
import type {
  DiscoveredEngine,
  EngineCatalogAudit,
  EngineCatalogEntry,
  EngineCatalogKind,
  EngineCatalogRun,
  EngineCatalogStore,
  EngineCatalogTier,
  EngineAvailability,
  EngineLifecycleStatus,
  EngineCatalogSource,
  EngineEffort,
} from "../../../fixvox-core/src/control-plane/engine-catalog.ts";

export type EngineCatalogSql = {
  unsafe<T extends Record<string, unknown> = Record<string, unknown>>(query: string, parameters?: unknown[]): Promise<T[]>;
  begin<T>(operation: (transaction: EngineCatalogSql) => Promise<T>): Promise<T>;
};

type EngineRow = {
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

function jsonRecord(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function efforts(value: unknown): readonly EngineEffort[] {
  const parsed = jsonRecord(value);
  if (!Array.isArray(parsed)) return [];
  return Object.freeze(parsed.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const id = (entry as Record<string, unknown>).id;
    const label = (entry as Record<string, unknown>).label;
    return typeof id === "string" && typeof label === "string" && id.trim() && label.trim()
      ? [Object.freeze({ id: id.trim(), label: label.trim() })]
      : [];
  }));
}

function entry(row: EngineRow): EngineCatalogEntry {
  const kind = row.kind as EngineCatalogKind;
  const availability = row.availability as EngineAvailability;
  const lifecycleStatus = row.lifecycle_status as EngineLifecycleStatus;
  const source = row.source as EngineCatalogSource;
  if (!(["transcription", "postprocess", "selectionTransform"] as string[]).includes(kind)) throw new Error("engine_catalog_kind_invalid");
  if (!("available temporarily_unavailable retired".split(" ") as string[]).includes(availability)) throw new Error("engine_catalog_availability_invalid");
  if (!("candidate published retired".split(" ") as string[]).includes(lifecycleStatus)) throw new Error("engine_catalog_lifecycle_invalid");
  if (!("built-in discovered custom".split(" ") as string[]).includes(source)) throw new Error("engine_catalog_source_invalid");
  return Object.freeze({
    engineId: row.engine_id,
    provider: row.provider,
    model: row.model,
    providerLabel: row.provider_label,
    modelLabel: row.model_label,
    kind,
    tier: row.tier as EngineCatalogTier,
    supportedEfforts: efforts(row.supported_efforts),
    defaultEffortId: row.default_effort_id,
    availability,
    lifecycleStatus,
    source,
    revision: Number(row.catalog_revision),
    publishedRevision: row.published_revision,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastMissedAt: row.last_missed_at,
    consecutiveMisses: Number(row.consecutive_misses),
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
  });
}

function sameDiscovery(current: EngineCatalogEntry, discovered: DiscoveredEngine): boolean {
  const normalized = normalizeDiscoveredEngine(discovered);
  return current.provider === normalized.provider
    && current.model === normalized.model
    && current.providerLabel === normalized.providerLabel
    && current.modelLabel === normalized.modelLabel
    && current.kind === normalized.kind
    && current.tier === normalized.tier
    && current.defaultEffortId === normalized.defaultEffortId
    && JSON.stringify(current.supportedEfforts) === JSON.stringify(normalized.supportedEfforts);
}

function discoveryMetadata(entry: EngineCatalogEntry): DiscoveredEngine {
  return Object.freeze({
    engineId: entry.engineId,
    provider: entry.provider,
    model: entry.model,
    providerLabel: entry.providerLabel,
    modelLabel: entry.modelLabel,
    kind: entry.kind,
    tier: entry.tier,
    supportedEfforts: entry.supportedEfforts,
    defaultEffortId: entry.defaultEffortId,
  });
}

function auditFromRow(row: { action: string; engine_id: string; actor_ref_hash: string; previous_status: string; resulting_status: string; previous_revision: string | number; resulting_revision: string | number; occurred_at: string }): EngineCatalogAudit {
  return Object.freeze({ action: row.action as EngineCatalogAudit["action"], engineId: row.engine_id, actorRef: row.actor_ref_hash, previousStatus: row.previous_status as EngineLifecycleStatus, resultingStatus: row.resulting_status as EngineLifecycleStatus, previousRevision: Number(row.previous_revision), resultingRevision: Number(row.resulting_revision), occurredAt: row.occurred_at });
}

/** PostgreSQL implementation of the provider-neutral catalog lifecycle. */
export class PostgresEngineCatalogRepository implements EngineCatalogStore {
  constructor(private readonly sql: EngineCatalogSql) {}

  private async row(engineId: string, lock = false): Promise<EngineRow | null> {
    const rows = await this.sql.unsafe<EngineRow>(`SELECT engine_id, provider, model, provider_label, model_label, kind, tier, supported_efforts, default_effort_id, availability, lifecycle_status, source, catalog_revision, published_revision, first_seen_at::text, last_seen_at::text, last_missed_at::text, consecutive_misses, reviewed_at::text, reviewed_by FROM engines WHERE engine_id = $1${lock ? " FOR UPDATE" : ""}`, [engineId]);
    return rows[0] ?? null;
  }

  async list(): Promise<readonly EngineCatalogEntry[]> {
    const rows = await this.sql.unsafe<EngineRow>("SELECT engine_id, provider, model, provider_label, model_label, kind, tier, supported_efforts, default_effort_id, availability, lifecycle_status, source, catalog_revision, published_revision, first_seen_at::text, last_seen_at::text, last_missed_at::text, consecutive_misses, reviewed_at::text, reviewed_by FROM engines ORDER BY engine_id");
    return Object.freeze(rows.map(entry));
  }

  async upsertDiscovered(input: { adapterId: string; engine: DiscoveredEngine; observedAt: string }): Promise<{ entry: EngineCatalogEntry; created: boolean; changed: boolean }> {
    const discovered = normalizeDiscoveredEngine(input.engine);
    return this.sql.begin(async (tx) => {
      const inserted = await tx.unsafe<{ engine_id: string }>(`INSERT INTO engines (engine_id, kind, provider, model, enabled, runtime_options, provider_label, model_label, tier, supported_efforts, default_effort_id, availability, lifecycle_status, source, first_seen_at, last_seen_at) VALUES ($1,$2,$3,$4,false,'{}'::jsonb,$5,$6,$7,$8::jsonb,$9,'available','candidate','discovered',$10::timestamptz,$10::timestamptz) ON CONFLICT (engine_id) DO NOTHING RETURNING engine_id`, [discovered.engineId, discovered.kind, discovered.provider, discovered.model, discovered.providerLabel, discovered.modelLabel, discovered.tier, JSON.stringify(discovered.supportedEfforts), discovered.defaultEffortId, input.observedAt]);
      const rows = await tx.unsafe<EngineRow>("SELECT engine_id, provider, model, provider_label, model_label, kind, tier, supported_efforts, default_effort_id, availability, lifecycle_status, source, catalog_revision, published_revision, first_seen_at::text, last_seen_at::text, last_missed_at::text, consecutive_misses, reviewed_at::text, reviewed_by FROM engines WHERE engine_id = $1 FOR UPDATE", [discovered.engineId]);
      const current = rows[0];
      if (!current) throw new Error("engine_catalog_not_found");
      const currentEntry = entry(current);
      // Discovery may refine a candidate, but never rewrites metadata that an
      // operator has already published or retired. Sightings remain mutable.
      const metadata = currentEntry.lifecycleStatus === "candidate" ? discovered : normalizeDiscoveredEngine(discoveryMetadata(currentEntry));
      const changed = !sameDiscovery(currentEntry, metadata) || currentEntry.lastSeenAt !== input.observedAt || currentEntry.consecutiveMisses !== 0 || currentEntry.lastMissedAt !== null;
      await tx.unsafe(`UPDATE engines SET provider = $2, model = $3, kind = $4, provider_label = $5, model_label = $6, tier = $7, supported_efforts = $8::jsonb, default_effort_id = $9, last_seen_at = $10::timestamptz, last_missed_at = NULL, consecutive_misses = 0, availability = CASE WHEN lifecycle_status = 'retired' THEN 'retired' ELSE CASE WHEN availability = 'retired' THEN 'available' ELSE availability END END, updated_at = now() WHERE engine_id = $1`, [discovered.engineId, metadata.provider, metadata.model, metadata.kind, metadata.providerLabel, metadata.modelLabel, metadata.tier, JSON.stringify(metadata.supportedEfforts), metadata.defaultEffortId, input.observedAt]);
      const updated = await tx.unsafe<EngineRow>("SELECT engine_id, provider, model, provider_label, model_label, kind, tier, supported_efforts, default_effort_id, availability, lifecycle_status, source, catalog_revision, published_revision, first_seen_at::text, last_seen_at::text, last_missed_at::text, consecutive_misses, reviewed_at::text, reviewed_by FROM engines WHERE engine_id = $1", [discovered.engineId]);
      return { entry: entry(updated[0]!), created: inserted.length > 0, changed };
    });
  }

  async markMiss(input: { adapterId: string; engineId: string; observedAt: string }): Promise<EngineCatalogEntry | null> {
    await this.sql.unsafe("UPDATE engines SET last_missed_at = $3::timestamptz, consecutive_misses = consecutive_misses + 1, updated_at = now() WHERE engine_id = $1 AND provider = $2 AND lifecycle_status <> 'retired'", [input.engineId, input.adapterId, input.observedAt]);
    const row = await this.row(input.engineId);
    return row ? entry(row) : null;
  }

  async claimRun(runKey: string, startedAt: string): Promise<boolean> {
    const rows = await this.sql.unsafe<{ run_key: string }>(`INSERT INTO engine_catalog_runs (run_key, status, started_at) VALUES ($1, 'running', $2::timestamptz) ON CONFLICT (run_key) DO UPDATE SET status = 'running', started_at = EXCLUDED.started_at, completed_at = NULL, discovered_count = 0, candidate_count = 0, miss_count = 0, failed_adapters = '[]'::jsonb WHERE engine_catalog_runs.status = 'failed' RETURNING run_key`, [runKey, startedAt]);
    return rows.length > 0;
  }

  async completeRun(input: Omit<EngineCatalogRun, "status" | "completedAt"> & { status: Exclude<EngineCatalogRun["status"], "running">; completedAt: string }): Promise<void> {
    await this.sql.unsafe("UPDATE engine_catalog_runs SET status = $2, completed_at = $3::timestamptz, discovered_count = $4, candidate_count = $5, miss_count = $6, failed_adapters = $7::jsonb WHERE run_key = $1", [input.runKey, input.status, input.completedAt, input.discoveredCount, input.candidateCount, input.missCount, JSON.stringify(input.failedAdapters)]);
  }

  async lastSuccessfulRunAt(): Promise<string | null> {
    const rows = await this.sql.unsafe<{ completed_at: string | null }>("SELECT completed_at::text FROM engine_catalog_runs WHERE status = 'succeeded' ORDER BY completed_at DESC LIMIT 1");
    return rows[0]?.completed_at ?? null;
  }

  async publish(input: { engineId: string; actorRef: string; expectedRevision?: number; occurredAt: string }): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }> {
    return this.mutate(input, "publish");
  }

  async retire(input: { engineId: string; actorRef: string; expectedRevision?: number; occurredAt: string }): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }> {
    return this.mutate(input, "retire");
  }

  async review(input: { engineId: string; actorRef: string; expectedRevision?: number; occurredAt: string }): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }> {
    return this.mutate(input, "review");
  }

  private async mutate(input: { engineId: string; actorRef: string; expectedRevision?: number; occurredAt: string }, action: "publish" | "retire" | "review"): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }> {
    return this.sql.begin(async (tx) => {
      const rows = await tx.unsafe<EngineRow>("SELECT engine_id, provider, model, provider_label, model_label, kind, tier, supported_efforts, default_effort_id, availability, lifecycle_status, source, catalog_revision, published_revision, first_seen_at::text, last_seen_at::text, last_missed_at::text, consecutive_misses, reviewed_at::text, reviewed_by FROM engines WHERE engine_id = $1 FOR UPDATE", [input.engineId]);
      const current = rows[0];
      if (!current) throw new Error("engine_catalog_not_found");
      const currentEntry = entry(current);
      if (input.expectedRevision !== undefined && input.expectedRevision !== currentEntry.revision) throw new Error("engine_catalog_stale_revision");
      const targetStatus: EngineLifecycleStatus = action === "publish" ? "published" : action === "retire" ? "retired" : currentEntry.lifecycleStatus;
      if (action !== "review" && currentEntry.lifecycleStatus === targetStatus) {
        return { entry: currentEntry, audit: Object.freeze({ action, engineId: currentEntry.engineId, actorRef: input.actorRef, previousStatus: targetStatus, resultingStatus: targetStatus, previousRevision: currentEntry.revision, resultingRevision: currentEntry.revision, occurredAt: input.occurredAt }), idempotentReplay: true };
      }
      if (action === "publish" && currentEntry.lifecycleStatus === "retired") throw new Error("engine_catalog_retired");
      const nextRevision = currentEntry.revision + 1;
      const publishedRevision = action === "publish" ? `r${nextRevision}` : currentEntry.publishedRevision;
      await tx.unsafe("UPDATE engines SET enabled = $2, lifecycle_status = $3, availability = $4, catalog_revision = $5, published_revision = $6, consecutive_misses = 0, reviewed_at = $7::timestamptz, reviewed_by = $8, updated_at = now() WHERE engine_id = $1", [input.engineId, targetStatus === "published", targetStatus, action === "retire" ? "retired" : action === "review" ? currentEntry.availability : "available", nextRevision, publishedRevision, input.occurredAt, input.actorRef]);
      await tx.unsafe("INSERT INTO engine_catalog_audits (actor_ref_hash, action, engine_id, previous_status, resulting_status, previous_revision, resulting_revision, safe_metadata, occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::timestamptz)", [input.actorRef, action, input.engineId, currentEntry.lifecycleStatus, targetStatus, currentEntry.revision, nextRevision, { schemaVersion: 1 }, input.occurredAt]);
      const updated = await tx.unsafe<EngineRow>("SELECT engine_id, provider, model, provider_label, model_label, kind, tier, supported_efforts, default_effort_id, availability, lifecycle_status, source, catalog_revision, published_revision, first_seen_at::text, last_seen_at::text, last_missed_at::text, consecutive_misses, reviewed_at::text, reviewed_by FROM engines WHERE engine_id = $1", [input.engineId]);
      return { entry: entry(updated[0]!), audit: Object.freeze({ action, engineId: input.engineId, actorRef: input.actorRef, previousStatus: currentEntry.lifecycleStatus, resultingStatus: targetStatus, previousRevision: currentEntry.revision, resultingRevision: nextRevision, occurredAt: input.occurredAt }), idempotentReplay: false };
    });
  }

  async catalogAudits(limit = 100): Promise<readonly EngineCatalogAudit[]> {
    const bounded = Math.min(100, Math.max(1, Math.trunc(limit) || 50));
    const rows = await this.sql.unsafe<{ action: string; engine_id: string; actor_ref_hash: string; previous_status: string; resulting_status: string; previous_revision: string | number; resulting_revision: string | number; occurred_at: string }>("SELECT action, engine_id, actor_ref_hash, previous_status, resulting_status, previous_revision, resulting_revision, occurred_at::text FROM engine_catalog_audits ORDER BY occurred_at DESC, id DESC LIMIT $1", [bounded]);
    return Object.freeze(rows.map(auditFromRow));
  }
}
