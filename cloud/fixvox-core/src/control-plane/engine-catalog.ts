/**
 * Provider-neutral lifecycle for the server-owned engine catalog.
 *
 * Discovery is deliberately an injected boundary: this module never reaches a
 * provider and never promotes a discovered model.  That keeps scheduled jobs
 * deterministic in tests and makes publication an explicit admin action.
 */

import type { BuiltinEngineKind } from "./catalog.ts";

export type EngineCatalogKind = BuiltinEngineKind;
export type EngineCatalogTier = "cheap" | "balanced" | "premium" | (string & {});
export type EngineAvailability = "available" | "temporarily_unavailable" | "retired";
export type EngineLifecycleStatus = "candidate" | "published" | "retired";
export type EngineCatalogSource = "built-in" | "discovered" | "custom";

export type EngineEffort = Readonly<{
  id: string;
  label: string;
}>;

export type EngineCatalogEntry = Readonly<{
  engineId: string;
  provider: string;
  model: string;
  providerLabel: string;
  modelLabel: string;
  kind: EngineCatalogKind;
  tier: EngineCatalogTier;
  supportedEfforts: readonly EngineEffort[];
  defaultEffortId: string | null;
  availability: EngineAvailability;
  lifecycleStatus: EngineLifecycleStatus;
  source: EngineCatalogSource;
  revision: number;
  publishedRevision: string | null;
  firstSeenAt: string;
  lastSeenAt: string | null;
  lastMissedAt: string | null;
  consecutiveMisses: number;
  reviewedAt: string | null;
  reviewedBy: string | null;
}>;

/** Public projection consumed by future account-aware catalog readers. */
export type PublishedEngineChoice = Readonly<Pick<EngineCatalogEntry,
  "engineId" | "providerLabel" | "modelLabel" | "kind" | "tier" | "supportedEfforts" | "defaultEffortId" | "availability" | "publishedRevision"
>>;

export type EngineCandidate = DiscoveredEngine;

/** Input emitted by a provider-specific adapter after provider response parsing. */
export type DiscoveredEngine = Readonly<{
  engineId: string;
  provider: string;
  model: string;
  providerLabel?: string;
  modelLabel?: string;
  kind?: EngineCatalogKind;
  tier?: EngineCatalogTier;
  supportedEfforts?: readonly EngineEffort[];
  defaultEffortId?: string | null;
}>;

/** A provider observation after the catalog boundary has supplied defaults. */
export type NormalizedDiscoveredEngine = Readonly<{
  engineId: string;
  provider: string;
  model: string;
  providerLabel: string;
  modelLabel: string;
  kind: EngineCatalogKind;
  tier: EngineCatalogTier;
  supportedEfforts: readonly EngineEffort[];
  defaultEffortId: string | null;
}>;

export type EngineDiscoveryAdapter = Readonly<{
  /** Stable adapter/provider identity used to scope transient misses. */
  id: string;
  discover(): Promise<readonly DiscoveredEngine[]>;
}>;

export type EngineCatalogAuditAction = "publish" | "retire" | "review";
export type EngineCatalogAudit = Readonly<{
  action: EngineCatalogAuditAction;
  engineId: string;
  actorRef: string;
  previousStatus: EngineLifecycleStatus;
  resultingStatus: EngineLifecycleStatus;
  previousRevision: number;
  resultingRevision: number;
  occurredAt: string;
}>;

export type EngineCatalogRunStatus = "running" | "succeeded" | "failed";
export type EngineCatalogRun = Readonly<{
  runKey: string;
  status: EngineCatalogRunStatus;
  startedAt: string;
  completedAt: string | null;
  discoveredCount: number;
  candidateCount: number;
  missCount: number;
  failedAdapters: readonly string[];
}>;

export type EngineCatalogStore = {
  list(): Promise<readonly EngineCatalogEntry[]>;
  upsertDiscovered(input: { adapterId: string; engine: DiscoveredEngine; observedAt: string }): Promise<{ entry: EngineCatalogEntry; created: boolean; changed: boolean }>;
  markMiss(input: { adapterId: string; engineId: string; observedAt: string }): Promise<EngineCatalogEntry | null>;
  claimRun(runKey: string, startedAt: string): Promise<boolean>;
  completeRun(input: Omit<EngineCatalogRun, "status" | "completedAt"> & { status: Exclude<EngineCatalogRunStatus, "running">; completedAt: string }): Promise<void>;
  lastSuccessfulRunAt(): Promise<string | null>;
  publish(input: { engineId: string; actorRef: string; expectedRevision?: number; occurredAt: string }): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }>;
  retire(input: { engineId: string; actorRef: string; expectedRevision?: number; occurredAt: string }): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }>;
  review(input: { engineId: string; actorRef: string; expectedRevision?: number; occurredAt: string }): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }>;
};

export type DiscoveryJobResult = Readonly<{
  status: "succeeded" | "failed" | "skipped";
  runKey: string | null;
  discoveredCount: number;
  candidateCount: number;
  missCount: number;
  failedAdapters: readonly string[];
  reason?: "interval" | "duplicate" | "provider_failure" | "unexpected_failure";
}>;

export const ENGINE_CATALOG_DISCOVERY_INTERVAL_MS = 6 * 60 * 60 * 1000;

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`engine_catalog_${field}_required`);
  return value.trim();
}

function publicId(value: unknown, field: string): string {
  const id = nonEmpty(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/.test(id)) throw new Error(`engine_catalog_${field}_invalid`);
  return id;
}

function normalizeEfforts(value: readonly EngineEffort[] | undefined, defaultEffortId: string | null | undefined): { supportedEfforts: readonly EngineEffort[]; defaultEffortId: string | null } {
  const efforts = (value ?? []).map((effort) => ({ id: publicId(effort?.id, "effort_id"), label: nonEmpty(effort?.label, "effort_label") }));
  const unique = new Map<string, EngineEffort>();
  for (const effort of efforts) {
    const previous = unique.get(effort.id);
    if (previous && previous.label !== effort.label) throw new Error(`engine_catalog_effort_conflict:${effort.id}`);
    unique.set(effort.id, Object.freeze(effort));
  }
  const normalizedDefault = defaultEffortId === undefined || defaultEffortId === null || defaultEffortId === ""
    ? null
    : publicId(defaultEffortId, "default_effort_id");
  if (normalizedDefault && !unique.has(normalizedDefault)) throw new Error(`engine_catalog_default_effort_unknown:${normalizedDefault}`);
  // Keep the adapter's declared order: effort order is presentation metadata,
  // not a universal enum that should be invented by the catalog.
  return { supportedEfforts: Object.freeze([...unique.values()]), defaultEffortId: normalizedDefault };
}

function normalizedDiscovery(input: DiscoveredEngine): NormalizedDiscoveredEngine {
  const engineId = publicId(input.engineId, "engine_id");
  const provider = publicId(input.provider, "provider");
  const model = publicId(input.model, "model");
  const providerLabel = nonEmpty(input.providerLabel ?? provider, "provider_label");
  const modelLabel = nonEmpty(input.modelLabel ?? model, "model_label");
  const kind = input.kind ?? "selectionTransform";
  if (kind !== "transcription" && kind !== "postprocess" && kind !== "selectionTransform") throw new Error(`engine_catalog_kind_invalid:${kind}`);
  const tier = input.tier ?? "balanced";
  const { supportedEfforts, defaultEffortId } = normalizeEfforts(input.supportedEfforts, input.defaultEffortId);
  return Object.freeze({ engineId, provider, model, providerLabel, modelLabel, kind, tier, supportedEfforts, defaultEffortId });
}

/** Public adapter boundary validation used by persistent stores as well. */
export function normalizeDiscoveredEngine(input: DiscoveredEngine): NormalizedDiscoveredEngine {
  return normalizedDiscovery(input);
}

function sameDiscovery(entry: EngineCatalogEntry, discovered: DiscoveredEngine): boolean {
  const normalized = normalizedDiscovery(discovered);
  return entry.provider === normalized.provider
    && entry.model === normalized.model
    && entry.providerLabel === normalized.providerLabel
    && entry.modelLabel === normalized.modelLabel
    && entry.kind === normalized.kind
    && entry.tier === normalized.tier
    && entry.defaultEffortId === normalized.defaultEffortId
    && JSON.stringify(entry.supportedEfforts) === JSON.stringify(normalized.supportedEfforts);
}

function discoveryMetadata(entry: EngineCatalogEntry): NormalizedDiscoveredEngine {
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

function cloneEntry(entry: EngineCatalogEntry): EngineCatalogEntry {
  return Object.freeze({ ...entry, supportedEfforts: Object.freeze(entry.supportedEfforts.map((effort) => Object.freeze({ ...effort }))) });
}

/** A deterministic in-memory store for provider-free tests and local jobs. */
export class InMemoryEngineCatalogStore implements EngineCatalogStore {
  private readonly entries = new Map<string, EngineCatalogEntry>();
  private readonly runs = new Map<string, EngineCatalogRun>();
  private readonly audits: EngineCatalogAudit[] = [];

  constructor(initial: readonly EngineCatalogEntry[] = []) {
    for (const entry of initial) this.entries.set(entry.engineId, cloneEntry(entry));
  }

  async list(): Promise<readonly EngineCatalogEntry[]> {
    return Object.freeze([...this.entries.values()].sort((left, right) => left.engineId.localeCompare(right.engineId)).map(cloneEntry));
  }

  async upsertDiscovered(input: { adapterId: string; engine: DiscoveredEngine; observedAt: string }): Promise<{ entry: EngineCatalogEntry; created: boolean; changed: boolean }> {
    const discovered = normalizedDiscovery(input.engine);
    const current = this.entries.get(discovered.engineId);
    if (!current) {
      const entry: EngineCatalogEntry = Object.freeze({
        ...discovered,
        source: "discovered",
        availability: "available",
        lifecycleStatus: "candidate",
        revision: 0,
        publishedRevision: null,
        firstSeenAt: input.observedAt,
        lastSeenAt: input.observedAt,
        lastMissedAt: null,
        consecutiveMisses: 0,
        reviewedAt: null,
        reviewedBy: null,
      });
      this.entries.set(entry.engineId, entry);
      return { entry: cloneEntry(entry), created: true, changed: true };
    }
    // Provider discovery is authoritative for candidates only. Once an entry is
    // published (or retired), its labels/tier/efforts/default remain curated;
    // discovery may still update sightings and observed availability below.
    const metadata = current.lifecycleStatus === "candidate" ? discovered : discoveryMetadata(current);
    const changed = !sameDiscovery(current, metadata) || current.lastSeenAt !== input.observedAt || current.consecutiveMisses !== 0 || current.lastMissedAt !== null;
    const entry: EngineCatalogEntry = Object.freeze({
      ...current,
      ...metadata,
      lastSeenAt: input.observedAt,
      lastMissedAt: null,
      consecutiveMisses: 0,
      availability: current.lifecycleStatus === "retired" ? "retired" : current.availability === "retired" ? "available" : current.availability,
    });
    this.entries.set(entry.engineId, entry);
    return { entry: cloneEntry(entry), created: false, changed };
  }

  async markMiss(input: { adapterId: string; engineId: string; observedAt: string }): Promise<EngineCatalogEntry | null> {
    const current = this.entries.get(input.engineId);
    if (!current || current.provider !== input.adapterId || current.lifecycleStatus === "retired") return current ? cloneEntry(current) : null;
    const entry = Object.freeze({ ...current, lastMissedAt: input.observedAt, consecutiveMisses: current.consecutiveMisses + 1 });
    this.entries.set(entry.engineId, entry);
    return cloneEntry(entry);
  }

  async claimRun(runKey: string, startedAt: string): Promise<boolean> {
    const current = this.runs.get(runKey);
    if (current?.status === "running" || current?.status === "succeeded") return false;
    this.runs.set(runKey, { runKey, status: "running", startedAt, completedAt: null, discoveredCount: 0, candidateCount: 0, missCount: 0, failedAdapters: [] });
    return true;
  }

  async completeRun(input: Omit<EngineCatalogRun, "status" | "completedAt"> & { status: Exclude<EngineCatalogRunStatus, "running">; completedAt: string }): Promise<void> {
    this.runs.set(input.runKey, Object.freeze({ ...input, failedAdapters: Object.freeze([...input.failedAdapters]) }));
  }

  async lastSuccessfulRunAt(): Promise<string | null> {
    const successful = [...this.runs.values()].filter((run) => run.status === "succeeded" && run.completedAt).sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)));
    return successful[0]?.completedAt ?? null;
  }

  async publish(input: { engineId: string; actorRef: string; expectedRevision?: number; occurredAt: string }): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }> {
    return this.mutateLifecycle(input, "publish");
  }

  async retire(input: { engineId: string; actorRef: string; expectedRevision?: number; occurredAt: string }): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }> {
    return this.mutateLifecycle(input, "retire");
  }

  async review(input: { engineId: string; actorRef: string; expectedRevision?: number; occurredAt: string }): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }> {
    return this.mutateLifecycle(input, "review");
  }

  private async mutateLifecycle(input: { engineId: string; actorRef: string; expectedRevision?: number; occurredAt: string }, action: EngineCatalogAuditAction): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }> {
    const current = this.entries.get(input.engineId);
    if (!current) throw new Error("engine_catalog_not_found");
    if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision) throw new Error("engine_catalog_stale_revision");
    const targetStatus: EngineLifecycleStatus = action === "publish" ? "published" : action === "retire" ? "retired" : current.lifecycleStatus;
    if (action !== "review" && current.lifecycleStatus === targetStatus) {
      const audit: EngineCatalogAudit = Object.freeze({ action, engineId: current.engineId, actorRef: input.actorRef, previousStatus: targetStatus, resultingStatus: targetStatus, previousRevision: current.revision, resultingRevision: current.revision, occurredAt: input.occurredAt });
      return { entry: cloneEntry(current), audit, idempotentReplay: true };
    }
    if (action === "publish" && current.lifecycleStatus === "retired") throw new Error("engine_catalog_retired");
    const nextRevision = current.revision + 1;
    const entry: EngineCatalogEntry = Object.freeze({
      ...current,
      lifecycleStatus: targetStatus,
      availability: targetStatus === "retired" ? "retired" : action === "review" ? current.availability : "available",
      revision: nextRevision,
      publishedRevision: action === "publish" ? `r${nextRevision}` : current.publishedRevision,
      consecutiveMisses: 0,
      reviewedAt: input.occurredAt,
      reviewedBy: input.actorRef,
    });
    this.entries.set(entry.engineId, entry);
    const audit: EngineCatalogAudit = Object.freeze({ action, engineId: entry.engineId, actorRef: input.actorRef, previousStatus: current.lifecycleStatus, resultingStatus: targetStatus, previousRevision: current.revision, resultingRevision: nextRevision, occurredAt: input.occurredAt });
    this.audits.push(audit);
    return { entry: cloneEntry(entry), audit, idempotentReplay: false };
  }

  get auditsSnapshot(): readonly EngineCatalogAudit[] { return Object.freeze(this.audits.map((audit) => Object.freeze({ ...audit }))); }
}

export function createProviderDiscoveryAdapter(input: { id: string; discover: () => Promise<readonly DiscoveredEngine[]> }): EngineDiscoveryAdapter {
  const id = publicId(input.id, "adapter_id");
  return Object.freeze({ id, discover: input.discover });
}

/**
 * Run one six-hour discovery window. Successful adapters reconcile sightings;
 * failed adapters leave their last-known-good entries untouched. No branch in
 * this function publishes or retires an engine.
 */
export async function runEngineCatalogDiscoveryJob(input: {
  store: EngineCatalogStore;
  adapters: readonly EngineDiscoveryAdapter[];
  now?: Date;
  force?: boolean;
  intervalMs?: number;
}): Promise<DiscoveryJobResult> {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error("engine_catalog_invalid_clock");
  const observedAt = now.toISOString();
  const intervalMs = input.intervalMs ?? ENGINE_CATALOG_DISCOVERY_INTERVAL_MS;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error("engine_catalog_invalid_interval");
  const previous = await input.store.lastSuccessfulRunAt();
  if (!input.force && previous && now.getTime() - Date.parse(previous) < intervalMs) return { status: "skipped", runKey: null, discoveredCount: 0, candidateCount: 0, missCount: 0, failedAdapters: [], reason: "interval" };
  const runKey = `engine-catalog:${Math.floor(now.getTime() / intervalMs)}`;
  if (!(await input.store.claimRun(runKey, observedAt))) return { status: "skipped", runKey, discoveredCount: 0, candidateCount: 0, missCount: 0, failedAdapters: [], reason: "duplicate" };

  let discoveredCount = 0;
  let candidateCount = 0;
  let missCount = 0;
  const failedAdapters: string[] = [];
  try {
    for (const adapter of input.adapters) {
      let discovered: readonly DiscoveredEngine[];
      try {
        discovered = await adapter.discover();
      } catch {
        failedAdapters.push(adapter.id);
        continue;
      }
      const seen = new Set<string>();
      const uniqueDiscovered = new Map<string, DiscoveredEngine>();
      for (const candidate of discovered) uniqueDiscovered.set(candidate.engineId, candidate);
      const normalizedCandidates = [...uniqueDiscovered.values()].map((candidate) => normalizedDiscovery({ ...candidate, provider: candidate.provider || adapter.id }));
      for (const candidate of normalizedCandidates) {
        const result = await input.store.upsertDiscovered({ adapterId: adapter.id, engine: candidate, observedAt });
        seen.add(result.entry.engineId);
        discoveredCount += 1;
        if (result.created || result.entry.lifecycleStatus === "candidate") candidateCount += result.created ? 1 : 0;
      }
      const currentEntries = await input.store.list();
      for (const current of currentEntries) {
        if (current.provider !== adapter.id || seen.has(current.engineId)) continue;
        await input.store.markMiss({ adapterId: adapter.id, engineId: current.engineId, observedAt });
        missCount += 1;
      }
    }
    const status = failedAdapters.length > 0 ? "failed" : "succeeded";
    await input.store.completeRun({ runKey, status, startedAt: observedAt, completedAt: observedAt, discoveredCount, candidateCount, missCount, failedAdapters });
    return { status, runKey, discoveredCount, candidateCount, missCount, failedAdapters, ...(failedAdapters.length > 0 ? { reason: "provider_failure" as const } : {}) };
  } catch {
    await input.store.completeRun({ runKey, status: "failed", startedAt: observedAt, completedAt: observedAt, discoveredCount, candidateCount, missCount, failedAdapters });
    return { status: "failed", runKey, discoveredCount, candidateCount, missCount, failedAdapters, reason: "unexpected_failure" };
  }
}

export async function publishEngine(input: { store: EngineCatalogStore; engineId: string; actorRef: string; expectedRevision?: number; now?: Date }): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }> {
  return input.store.publish({ engineId: publicId(input.engineId, "engine_id"), actorRef: nonEmpty(input.actorRef, "actor_ref"), expectedRevision: input.expectedRevision, occurredAt: (input.now ?? new Date()).toISOString() });
}

export async function retireEngine(input: { store: EngineCatalogStore; engineId: string; actorRef: string; expectedRevision?: number; now?: Date }): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }> {
  return input.store.retire({ engineId: publicId(input.engineId, "engine_id"), actorRef: nonEmpty(input.actorRef, "actor_ref"), expectedRevision: input.expectedRevision, occurredAt: (input.now ?? new Date()).toISOString() });
}

export async function reviewEngine(input: { store: EngineCatalogStore; engineId: string; actorRef: string; expectedRevision?: number; now?: Date }): Promise<{ entry: EngineCatalogEntry; audit: EngineCatalogAudit; idempotentReplay: boolean }> {
  return input.store.review({ engineId: publicId(input.engineId, "engine_id"), actorRef: nonEmpty(input.actorRef, "actor_ref"), expectedRevision: input.expectedRevision, occurredAt: (input.now ?? new Date()).toISOString() });
}
