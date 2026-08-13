import type {
  DeliveryEvidenceStatus,
  PipelineEvent,
  PipelineInputKind,
  RuntimeTelemetryStage,
  SimulatedRunSummary,
  TerminalPipelineState,
} from "../pipeline/types";

/** The identity of a server-owned profile version used as a dictation recipe. */
export type RecipeIdentity = Readonly<{
  profileId?: string;
  version?: string | number;
  revision?: string | number;
  recipeId?: string;
  recipeVersion?: string | number;
}>;

export type IdentitySource = "configured" | "resolved" | "observed" | "mixed" | "unavailable";

/** Keep all three authorities visible; effective identity is derived, never substituted. */
export type IdentityLayers = Readonly<{
  configured?: RecipeIdentity | null;
  resolved?: RecipeIdentity | null;
  observed?: RecipeIdentity | null;
}>;

export type EffectiveIdentity = RecipeIdentity & Readonly<{ source: IdentitySource }>;

export const humanVerdicts = [
  "unreviewed",
  "better",
  "same",
  "worse",
  "unsafe",
  "inconclusive",
] as const;
export type HumanVerdict = (typeof humanVerdicts)[number];

export type EvidenceAvailability = Readonly<{
  status: "available" | "partial" | "unavailable";
  missing: readonly string[];
  redacted: true;
}>;

export type LengthRefEvidence = Readonly<{
  length?: number;
  /** An opaque locator only. It is not a transcript, audio path, or public text ref. */
  ref?: string;
  availability: EvidenceAvailability;
  redacted: true;
}>;

export type SemanticSafetySignals = Readonly<{
  status: "pass" | "warn" | "fail" | "unavailable";
  omissions?: number;
  additions?: number;
  changedSegments?: number;
  unsafeChanges?: number;
  fallbackToRaw?: boolean;
  reason?: string;
  redacted: true;
}>;

export type LatencyEvidence = Readonly<{
  totalMs?: number;
  captureMs?: number;
  transcriptionMs?: number;
  postprocessMs?: number;
  deliveryMs?: number;
  availability: EvidenceAvailability;
  redacted: true;
}>;

export type CostEvidence = Readonly<{
  estimatedUsd?: number;
  observedUsd?: number;
  inputUnits?: number;
  outputUnits?: number;
  currency: "USD";
  availability: EvidenceAvailability;
  redacted: true;
}>;

export type FallbackEvidence = Readonly<{
  used: boolean;
  stages: readonly string[];
  reason?: string;
  availability: EvidenceAvailability;
  redacted: true;
}>;

export type ObservedExecution = Readonly<{
  provider?: string;
  model?: string;
  engineId?: string;
  promptId?: string;
  availability: EvidenceAvailability;
  redacted: true;
}>;

export type LabRunEvidence = Readonly<{
  runId: string;
  source?: "dictation" | "selection_transform" | "assistant";
  inputKind?: PipelineInputKind;
  terminalState?: TerminalPipelineState | "unknown";
  startedAt?: number;
  endedAt?: number;
  identity: IdentityLayers;
  raw: LengthRefEvidence;
  final: LengthRefEvidence;
  semanticSafety: SemanticSafetySignals;
  latency: LatencyEvidence;
  cost: CostEvidence;
  fallback: FallbackEvidence;
  observed: ObservedExecution;
  delivery: Readonly<{
    status?: DeliveryEvidenceStatus;
    availability: EvidenceAvailability;
    redacted: true;
  }>;
  humanVerdict: HumanVerdict;
  eligibility: EligibilityResult;
  redacted: true;
}>;

export type EligibilityReason =
  | "missing_run_id"
  | "not_completed"
  | "not_dictation"
  | "telemetry_not_redacted";

export type EligibilityResult = Readonly<{
  eligible: boolean;
  reasons: readonly EligibilityReason[];
}>;

export type LabRunInput = Readonly<{
  runId?: unknown;
  source?: unknown;
  inputKind?: unknown;
  terminalState?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  durationMs?: unknown;
  transcript?: unknown;
  output?: unknown;
  rawLength?: unknown;
  finalLength?: unknown;
  rawRef?: unknown;
  finalRef?: unknown;
  events?: unknown;
  runtimeTelemetryStages?: unknown;
  identity?: unknown;
  configured?: unknown;
  resolved?: unknown;
  observed?: unknown;
  semanticSafety?: unknown;
  cost?: unknown;
  deliveryEvidence?: unknown;
  deliveryStatus?: unknown;
  humanVerdict?: unknown;
}>;

export type ResultHistoryLike = Readonly<{
  runId?: unknown;
  id?: unknown;
  source?: unknown;
  text?: unknown;
  textLength?: unknown;
  createdAt?: unknown;
  provider?: unknown;
  model?: unknown;
  deliveryEvidence?: unknown;
}>;

export type ComparisonNumber = Readonly<{
  baseline?: number;
  candidate?: number;
  delta?: number;
  availability: EvidenceAvailability;
  redacted: true;
}>;

export type ComparisonSummary = Readonly<{
  baseline: Readonly<Pick<LabRunEvidence, "runId" | "identity" | "humanVerdict">>;
  candidate: Readonly<Pick<LabRunEvidence, "runId" | "identity" | "humanVerdict">>;
  identity: Readonly<{
    baseline: EffectiveIdentity;
    candidate: EffectiveIdentity;
    sameProfile: boolean | null;
    sameVersion: boolean | null;
  }>;
  rawLength: ComparisonNumber;
  finalLength: ComparisonNumber;
  latencyMs: ComparisonNumber;
  costUsd: Readonly<{
    estimated: ComparisonNumber;
    observed: ComparisonNumber;
  }>;
  semanticSafety: Readonly<{
    baseline: SemanticSafetySignals;
    candidate: SemanticSafetySignals;
    omissions: ComparisonNumber;
    additions: ComparisonNumber;
    unsafeChanges: ComparisonNumber;
  }>;
  fallback: Readonly<{
    baseline: FallbackEvidence;
    candidate: FallbackEvidence;
  }>;
  observedExecution: Readonly<{
    baseline: ObservedExecution;
    candidate: ObservedExecution;
  }>;
  evidence: EvidenceAvailability;
  redacted: true;
}>;

const MAX_ID_LENGTH = 120;
const MAX_REASON_LENGTH = 160;
const MAX_STAGE_COUNT = 8;
const MAX_MISSING_COUNT = 16;

export function effectiveRecipeIdentity(layers: IdentityLayers): EffectiveIdentity {
  const keys: readonly (keyof RecipeIdentity)[] = ["profileId", "version", "revision", "recipeId", "recipeVersion"];
  const values: RecipeIdentity = Object.fromEntries(
    keys.flatMap((key) => {
      const value = layers.observed?.[key] ?? layers.resolved?.[key] ?? layers.configured?.[key];
      return value === undefined ? [] : [[key, normalizeIdentityValue(value)]];
    }),
  ) as RecipeIdentity;
  const source: IdentitySource = layers.observed
    ? layers.resolved || layers.configured
      ? "mixed"
      : "observed"
    : layers.resolved
      ? layers.configured
        ? "mixed"
        : "resolved"
      : layers.configured
        ? "configured"
        : "unavailable";
  return { ...values, source };
}

export function selectEligibleRuns(
  runs: readonly LabRunEvidence[],
  options: { limit?: number; source?: "dictation" | "selection_transform" | "assistant" } = {},
): readonly LabRunEvidence[] {
  const limit = clampInteger(options.limit ?? 50, 1, 100);
  return runs
    .filter((run) => run.eligibility.eligible && (!options.source || run.source === options.source))
    .slice()
    .sort((a, b) => (b.endedAt ?? b.startedAt ?? 0) - (a.endedAt ?? a.startedAt ?? 0))
    .slice(0, limit);
}

export function evaluateRunEligibility(input: {
  runId?: unknown;
  source?: unknown;
  terminalState?: unknown;
  runtimeTelemetryStages?: unknown;
}): EligibilityResult {
  const reasons: EligibilityReason[] = [];
  if (!nonEmptyString(input.runId)) reasons.push("missing_run_id");
  if (input.terminalState !== undefined && input.terminalState !== "done") reasons.push("not_completed");
  if (input.source !== undefined && input.source !== "dictation") reasons.push("not_dictation");
  if (Array.isArray(input.runtimeTelemetryStages) && !telemetryIsRedacted(input.runtimeTelemetryStages)) {
    reasons.push("telemetry_not_redacted");
  }
  return { eligible: reasons.length === 0, reasons };
}
export function adaptLabRunInput(input: LabRunInput): LabRunEvidence {
  const runId = nonEmptyString(input.runId) ?? "";
  const stages = Array.isArray(input.runtimeTelemetryStages) ? input.runtimeTelemetryStages : [];
  const rawLength = finiteNonNegative(input.rawLength) ?? safeLength(input.transcript);
  const finalLength = finiteNonNegative(input.finalLength) ?? safeLength(input.output);
  const identity = normalizeIdentityLayers(input.identity, input.configured, input.resolved, input.observed);
  const semanticSafety = normalizeSafety(input.semanticSafety);
  const cost = normalizeCost(input.cost);
  const observed = normalizeObserved(input.observed);
  const eligibility = evaluateRunEligibility({
    runId,
    source: input.source,
    terminalState: input.terminalState,
    runtimeTelemetryStages: stages,
  });
  return buildLabRun({
    runId,
    source: normalizeSource(input.source),
    inputKind: input.inputKind === "simulated" || input.inputKind === "synthetic-fixture" || input.inputKind === "local-audio-fixture" || input.inputKind === "microphone" ? input.inputKind : undefined,
    terminalState: normalizeTerminalState(input.terminalState),
    startedAt: parseTime(input.startedAt),
    endedAt: parseTime(input.endedAt),
    identity,
    raw: rawLength === undefined ? unavailableLength("raw_length") : lengthEvidence(rawLength, String(input.rawRef ?? `run:${runId}:raw`)),
    final: finalLength === undefined ? unavailableLength("final_length") : lengthEvidence(finalLength, String(input.finalRef ?? `run:${runId}:final`)),
    semanticSafety,
    latency: latencyFromStages(stages, finiteNonNegative(input.durationMs)),
    cost,
    fallback: fallbackFromStages(stages),
    observed,
    delivery: deliveryEvidence(normalizeDeliveryStatus(input.deliveryEvidence ?? input.deliveryStatus), "delivery_evidence"),
    humanVerdict: isHumanVerdict(input.humanVerdict) ? input.humanVerdict : "unreviewed",
    eligibility,
  });
}
export const adaptRunToLabEvidence = adaptLabRunInput;
export const compareRuns = compareLabRuns;
export const selectEligibleLabRuns = selectEligibleRuns;



export function adaptPipelineRunToLabEvidence(
  summary: SimulatedRunSummary,
  options: { identity?: IdentityLayers; humanVerdict?: HumanVerdict } = {},
): LabRunEvidence {
  const stages = Array.isArray(summary.runtimeTelemetryStages) ? summary.runtimeTelemetryStages : [];
  const events = summary.events ?? [];
  const firstAt = minEventAt(events);
  const lastAt = maxEventAt(events);
  const observed = observedExecutionFromStages(stages);
  const identity = mergeIdentityLayers(options.identity, observedIdentityFromStages(stages));
  const rawLength = safeLength(summary.transcript);
  const finalValue = summary.deliveryEvidence?.output ?? summary.output;
  const finalLength = safeLength(finalValue);
  const telemetryAvailable = stages.length > 0;
  const eligibility = evaluateRunEligibility({
    runId: summary.runId,
    source: summary.resultSource,
    terminalState: summary.terminalState,
    runtimeTelemetryStages: stages,
  });
  const fallback = fallbackFromStages(stages, summary.error?.message);
  const safety = normalizeSafety(undefined, fallback.used ? "pipeline_fallback" : undefined);
  const latency = latencyFromStages(stages, summary.durationMs);
  return buildLabRun({
    runId: summary.runId,
    source: summary.resultSource,
    inputKind: summary.inputKind,
    terminalState: summary.terminalState,
    startedAt: firstAt,
    endedAt: lastAt,
    identity,
    raw: lengthEvidence(rawLength, `run:${summary.runId}:raw`, rawLength === undefined ? "raw_length" : undefined),
    final: lengthEvidence(finalLength, `run:${summary.runId}:final`, finalLength === undefined ? "final_length" : undefined),
    semanticSafety: safety,
    latency,
    cost: unavailableCost("cost_not_recorded"),
    fallback,
    observed,
    delivery: deliveryEvidence(summary.deliveryEvidence?.status, telemetryAvailable ? undefined : "delivery_evidence"),
    humanVerdict: options.humanVerdict ?? "unreviewed",
    eligibility,
  });
}

export function adaptResultHistoryEntryToLabEvidence(entry: ResultHistoryLike): LabRunEvidence {
  const runId = nonEmptyString(entry.runId) ?? nonEmptyString(entry.id) ?? "";
  const source = normalizeSource(entry.source);
  const length = finiteNonNegative(entry.textLength) ?? safeLength(entry.text);
  const provider = boundedString(entry.provider);
  const model = boundedString(entry.model);
  const deliveryStatus = normalizeDeliveryStatus(entry.deliveryEvidence);
  const eligibility = evaluateRunEligibility({ runId, source, terminalState: "done" });
  return buildLabRun({
    runId,
    source,
    terminalState: "done",
    startedAt: parseTime(entry.createdAt),
    identity: {},
    raw: unavailableLength("raw_length"),
    final: lengthEvidence(length, `history:${runId}:final`, length === undefined ? "final_length" : undefined),
    semanticSafety: normalizeSafety(undefined, "semantic_safety"),
    latency: unavailableLatency("latency"),
    cost: unavailableCost("cost"),
    fallback: unavailableFallback("fallback"),
    observed: {
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      availability: provider || model ? availableEvidence() : unavailableEvidence("provider_model"),
      redacted: true,
    },
    delivery: deliveryEvidence(deliveryStatus, deliveryStatus ? undefined : "delivery_evidence"),
    humanVerdict: "unreviewed",
    eligibility,
  });
}

/** Honest adapter for history/telemetry sources that do not contain evaluation evidence. */
export function createUnavailableEvidenceAdapter(reason = "evidence_not_recorded") {
  return (input: Pick<LabRunInput, "runId" | "source" | "terminalState"> = {}): LabRunEvidence => {
    const runId = nonEmptyString(input.runId) ?? "";
    return buildLabRun({
      runId,
      source: normalizeSource(input.source),
      terminalState: normalizeTerminalState(input.terminalState),
      identity: {},
      raw: unavailableLength(reason),
      final: unavailableLength(reason),
      semanticSafety: normalizeSafety(undefined, reason),
      latency: unavailableLatency(reason),
      cost: unavailableCost(reason),
      fallback: unavailableFallback(reason),
      observed: { availability: unavailableEvidence(reason), redacted: true },
      delivery: deliveryEvidence(undefined, reason),
      humanVerdict: "unreviewed",
      eligibility: evaluateRunEligibility(input),
    });
  };
}

export function compareLabRuns(baseline: LabRunEvidence, candidate: LabRunEvidence): ComparisonSummary {
  const baselineIdentity = effectiveRecipeIdentity(baseline.identity);
  const candidateIdentity = effectiveRecipeIdentity(candidate.identity);
  const evidenceMissing = new Set<string>();
  const compare = (left: number | undefined, right: number | undefined, name: string): ComparisonNumber => {
    if (left === undefined || right === undefined) {
      evidenceMissing.add(name);
      return { baseline: left, candidate: right, availability: unavailableEvidence(name), redacted: true };
    }
    return { baseline: left, candidate: right, delta: right - left, availability: availableEvidence(), redacted: true };
  };
  const rawLength = compare(baseline.raw.length, candidate.raw.length, "raw_length");
  const finalLength = compare(baseline.final.length, candidate.final.length, "final_length");
  const latencyMs = compare(baseline.latency.totalMs, candidate.latency.totalMs, "latency");
  const estimated = compare(baseline.cost.estimatedUsd, candidate.cost.estimatedUsd, "estimated_cost");
  const observed = compare(baseline.cost.observedUsd, candidate.cost.observedUsd, "observed_cost");
  const omissions = compare(baseline.semanticSafety.omissions, candidate.semanticSafety.omissions, "omissions");
  const additions = compare(baseline.semanticSafety.additions, candidate.semanticSafety.additions, "additions");
  const unsafeChanges = compare(baseline.semanticSafety.unsafeChanges, candidate.semanticSafety.unsafeChanges, "unsafe_changes");
  for (const missing of [...baseline.raw.availability.missing, ...candidate.raw.availability.missing, ...baseline.final.availability.missing, ...candidate.final.availability.missing]) evidenceMissing.add(missing);
  return {
    baseline: { runId: boundedString(baseline.runId) ?? "", identity: baseline.identity, humanVerdict: baseline.humanVerdict },
    candidate: { runId: boundedString(candidate.runId) ?? "", identity: candidate.identity, humanVerdict: candidate.humanVerdict },
    identity: {
      baseline: baselineIdentity,
      candidate: candidateIdentity,
      sameProfile: sameOptional(baselineIdentity.profileId, candidateIdentity.profileId),
      sameVersion: sameOptional(`${baselineIdentity.profileId ?? ""}:${baselineIdentity.version ?? ""}`, `${candidateIdentity.profileId ?? ""}:${candidateIdentity.version ?? ""}`),
    },
    rawLength,
    finalLength,
    latencyMs,
    costUsd: { estimated, observed },
    semanticSafety: {
      baseline: baseline.semanticSafety,
      candidate: candidate.semanticSafety,
      omissions,
      additions,
      unsafeChanges,
    },
    fallback: { baseline: baseline.fallback, candidate: candidate.fallback },
    observedExecution: { baseline: baseline.observed, candidate: candidate.observed },
    evidence: evidenceMissing.size === 0 ? availableEvidence() : partialEvidence([...evidenceMissing]),
    redacted: true,
  };
}

function buildLabRun(input: Omit<LabRunEvidence, "redacted">): LabRunEvidence {
  return { ...input, runId: boundedString(input.runId) ?? "", redacted: true };
}

function normalizeIdentityLayers(identity: unknown, configured: unknown, resolved: unknown, observed: unknown): IdentityLayers {
  const source = isRecord(identity) ? identity : {};
  return {
    configured: normalizeIdentityLayer(source.configured ?? configured),
    resolved: normalizeIdentityLayer(source.resolved ?? resolved),
    observed: normalizeIdentityLayer(source.observed ?? observed),
  };
}

function normalizeIdentityLayer(value: unknown): RecipeIdentity | null {
  if (!isRecord(value)) return null;
  const result: Record<string, string | number> = {};
  for (const key of ["profileId", "version", "revision", "recipeId", "recipeVersion"] as const) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) result[key] = candidate.slice(0, MAX_ID_LENGTH);
    else if (typeof candidate === "number" && Number.isFinite(candidate)) result[key] = candidate;
  }
  return Object.keys(result).length ? result : null;
}

function normalizeObserved(value: unknown): ObservedExecution {
  if (!isRecord(value)) return { availability: unavailableEvidence("provider_model"), redacted: true };
  const fields = ["provider", "model", "engineId", "promptId"] as const;
  const result: Partial<Record<(typeof fields)[number], string>> = {};
  for (const field of fields) {
    const candidate = boundedString(value[field]);
    if (candidate) result[field] = candidate;
  }
  return {
    ...result,
    availability: Object.keys(result).length ? availableEvidence() : unavailableEvidence("provider_model"),
    redacted: true,
  };
}

function normalizeCost(value: unknown): CostEvidence {
  if (!isRecord(value)) return unavailableCost("cost");
  const estimatedUsd = finiteNonNegative(value.estimatedUsd ?? value.estimatedCostUsd);
  const observedUsd = finiteNonNegative(value.observedUsd ?? value.observedCostUsd);
  const inputUnits = finiteNonNegative(value.inputUnits);
  const outputUnits = finiteNonNegative(value.outputUnits);
  const hasValue = estimatedUsd !== undefined || observedUsd !== undefined || inputUnits !== undefined || outputUnits !== undefined;
  return {
    ...(estimatedUsd === undefined ? {} : { estimatedUsd }),
    ...(observedUsd === undefined ? {} : { observedUsd }),
    ...(inputUnits === undefined ? {} : { inputUnits }),
    ...(outputUnits === undefined ? {} : { outputUnits }),
    currency: "USD",
    availability: hasValue ? availableEvidence() : unavailableEvidence("cost"),
    redacted: true,
  };
}

function isHumanVerdict(value: unknown): value is HumanVerdict {
  return typeof value === "string" && humanVerdicts.includes(value as HumanVerdict);
}

function normalizeIdentityValue(value: string | number): string | number {
  return typeof value === "number" ? value : boundedString(value) ?? "";
}

function mergeIdentityLayers(base: IdentityLayers | undefined, observed: IdentityLayers): IdentityLayers {
  return { configured: base?.configured, resolved: base?.resolved, observed: observed.observed ?? base?.observed };
}

function observedIdentityFromStages(stages: readonly RuntimeTelemetryStage[]): IdentityLayers {
  const stage = [...stages].reverse().find((entry) => entry.profileId || entry.recipeId || entry.recipeVersion);
  if (!stage) return {};
  return { observed: { profileId: stage.profileId, version: stage.recipeVersion, recipeId: stage.recipeId, recipeVersion: stage.recipeVersion } };
}

function observedExecutionFromStages(stages: readonly RuntimeTelemetryStage[]): ObservedExecution {
  const stage = [...stages].reverse().find((entry) => entry.provider || entry.model || entry.engineId || entry.promptId);
  if (!stage) return { availability: unavailableEvidence("provider_model"), redacted: true };
  return {
    ...(stage.provider ? { provider: boundedString(stage.provider) } : {}),
    ...(stage.model ? { model: boundedString(stage.model) } : {}),
    ...(stage.engineId ? { engineId: boundedString(stage.engineId) } : {}),
    ...(stage.promptId ? { promptId: boundedString(stage.promptId) } : {}),
    availability: availableEvidence(),
    redacted: true,
  };
}

function fallbackFromStages(stages: readonly RuntimeTelemetryStage[], reason?: string): FallbackEvidence {
  const fallbackStages = stages.filter((stage) => stage.status === "fallback").map((stage) => stage.stage).slice(0, MAX_STAGE_COUNT);
  return {
    used: fallbackStages.length > 0,
    stages: fallbackStages,
    ...(reason || fallbackStages.length ? { reason: boundedString(reason ?? "runtime_fallback") } : {}),
    availability: stages.length ? availableEvidence() : unavailableEvidence("fallback"),
    redacted: true,
  };
}

function latencyFromStages(stages: readonly RuntimeTelemetryStage[], durationMs: number | undefined): LatencyEvidence {
  const durations = new Map(stages.map((stage) => [stage.stage, finiteNonNegative(stage.durationMs)]));
  return {
    totalMs: finiteNonNegative(durationMs),
    ...(durations.get("capture") === undefined ? {} : { captureMs: durations.get("capture") }),
    ...(durations.get("stt") === undefined ? {} : { transcriptionMs: durations.get("stt") }),
    ...(durations.get("postprocess") === undefined ? {} : { postprocessMs: durations.get("postprocess") }),
    ...(durations.get("delivery") === undefined ? {} : { deliveryMs: durations.get("delivery") }),
    availability: finiteNonNegative(durationMs) === undefined ? unavailableEvidence("latency") : availableEvidence(),
    redacted: true,
  };
}

function lengthEvidence(length: number | undefined, ref: string, missing?: string): LengthRefEvidence {
  return { ...(length === undefined ? {} : { length }), ref: opaqueRef(ref), availability: missing ? partialEvidence([missing]) : availableEvidence(), redacted: true };
}
function unavailableLength(reason: string): LengthRefEvidence { return { availability: unavailableEvidence(reason), redacted: true }; }
function unavailableLatency(reason: string): LatencyEvidence { return { availability: unavailableEvidence(reason), redacted: true }; }
function unavailableCost(reason: string): CostEvidence { return { currency: "USD", availability: unavailableEvidence(reason), redacted: true }; }
function unavailableFallback(reason: string): FallbackEvidence { return { used: false, stages: [], reason: boundedString(reason), availability: unavailableEvidence(reason), redacted: true }; }
function deliveryEvidence(status: DeliveryEvidenceStatus | undefined, missing?: string): LabRunEvidence["delivery"] { return { ...(status ? { status } : {}), availability: missing ? unavailableEvidence(missing) : availableEvidence(), redacted: true }; }
function normalizeSafety(value: unknown, fallbackReason?: string): SemanticSafetySignals {
  const record = isRecord(value) ? value : {};
  const status = record.status === "pass" || record.status === "warn" || record.status === "fail" ? record.status : "unavailable";
  return {
    status,
    ...numberField(record.omissions, "omissions"),
    ...numberField(record.additions, "additions"),
    ...numberField(record.changedSegments, "changedSegments"),
    ...numberField(record.unsafeChanges, "unsafeChanges"),
    ...(typeof record.fallbackToRaw === "boolean" ? { fallbackToRaw: record.fallbackToRaw } : {}),
    ...(fallbackReason ? { reason: boundedString(fallbackReason) } : typeof record.reason === "string" ? { reason: boundedString(record.reason) } : {}),
    redacted: true,
  };
}
function normalizeDeliveryStatus(value: unknown): DeliveryEvidenceStatus | undefined {
  const status = isRecord(value) ? value.status : value;
  return status === "available" || status === "copied" || status === "paste_sent" || status === "paste_observed" || status === "failed" || status === "uncertain" ? status : undefined;
}
function normalizeSource(value: unknown): LabRunEvidence["source"] { return value === "dictation" || value === "selection_transform" || value === "assistant" ? value : undefined; }
function normalizeTerminalState(value: unknown): LabRunEvidence["terminalState"] { return value === "done" || value === "error" || value === "cancelled" ? value : "unknown"; }
function numberField(value: unknown, _name: string): Record<string, number> { const number = finiteNonNegative(value); return number === undefined ? {} : { [_name]: number }; }
function safeLength(value: unknown): number | undefined { return typeof value === "string" ? value.length : finiteNonNegative(value); }
function finiteNonNegative(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined; }
function parseTime(value: unknown): number | undefined { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string") { const parsed = Date.parse(value); return Number.isNaN(parsed) ? undefined : parsed; } return undefined; }
function minEventAt(events: readonly PipelineEvent[]): number | undefined { const values = events.map((event) => event.at).filter((at) => Number.isFinite(at)); return values.length ? Math.min(...values) : undefined; }
function maxEventAt(events: readonly PipelineEvent[]): number | undefined { const values = events.map((event) => event.at).filter((at) => Number.isFinite(at)); return values.length ? Math.max(...values) : undefined; }
function telemetryIsRedacted(value: readonly unknown[]): boolean { return value.every((stage) => isRecord(stage) && stage.redacted === true && !/(rawAudio|rawTranscript|selectedText|rawText|secret)/iu.test(JSON.stringify(stage))); }
function sameOptional(left: string | number | undefined, right: string | number | undefined): boolean | null { return left === undefined || right === undefined ? null : left === right; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nonEmptyString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function boundedString(value: unknown): string | undefined { const normalized = nonEmptyString(value); return normalized ? normalized.slice(0, MAX_ID_LENGTH) : undefined; }
function opaqueRef(value: string): string { return value.replace(/[^A-Za-z0-9:._-]/g, "_").slice(0, MAX_ID_LENGTH); }
function clampInteger(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, Math.trunc(value))); }
function availableEvidence(): EvidenceAvailability { return { status: "available", missing: [], redacted: true }; }
function partialEvidence(missing: readonly string[]): EvidenceAvailability { return { status: "partial", missing: [...new Set(missing.map((value) => value.slice(0, MAX_REASON_LENGTH)))].slice(0, MAX_MISSING_COUNT), redacted: true }; }
function unavailableEvidence(reason: string): EvidenceAvailability { return { status: "unavailable", missing: [reason.slice(0, MAX_REASON_LENGTH)], redacted: true }; }

export type { EvidenceAvailability as LabEvidenceAvailability };
