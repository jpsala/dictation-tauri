import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CONSERVATIVE_TIMING_EVALUATION_RECIPE, MANAGED_POSTPROCESS_SAFETY_PROMPT, POSTPROCESS_EVALUATION_RECIPES, type PostprocessEvaluationRecipe } from "../cloud/fixvox-core/src/control-plane/evaluation-recipes";
import {
  evaluatePostprocessSemanticSafety,
  POSTPROCESS_SEMANTIC_SAFETY_REASONS,
  type PostprocessSemanticSafetyReceipt,
} from "../cloud/fixvox-core/src/execution/postprocess-semantic-safety";
import { formatConservativeProsodyContext, formatProsodyHints } from "../src/fixvox-text-runtime";
import { resolveVocabularyPreDelivery, type PersonalVocabularySnapshot } from "../src/personal-vocabulary";
import type { TranscriptionQualitySampleResult } from "../src/test-fixtures/transcription-quality-contract";
import { resolveProductConfiguration, scoreTranscript } from "./transcription-quality-product-baseline";

export const WAVE_2_POSTPROCESS_REQUEST_CAP = 6;
export const WAVE_2_POSTPROCESS_MODEL = "openai/gpt-oss-120b";
export type ReplayVocabularyMode = "off" | "automatic" | "ask";
export type PostprocessReplayPlan = Readonly<{
  status: "blocked";
  providerCalls: 0;
  requiredAuthorization: "gate-b-explicit-user-approval";
  plannedRequests: 6;
  model: typeof WAVE_2_POSTPROCESS_MODEL;
  variants: readonly ["without-prosody", "with-prosody"];
  outputRef: null;
}>;
export type ReplayResult = Readonly<{
  sampleId: string;
  candidateId: string;
  rawRef: string;
  vocabularyMode: ReplayVocabularyMode;
  vocabularyStatus: "off" | "unchanged" | "changed" | "waiting-for-choice";
  finalRef: string;
  postprocess: PostprocessReplayPlan;
}>;
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function createPostprocessPlan(): PostprocessReplayPlan { return { status: "blocked", providerCalls: 0, requiredAuthorization: "gate-b-explicit-user-approval", plannedRequests: WAVE_2_POSTPROCESS_REQUEST_CAP, model: WAVE_2_POSTPROCESS_MODEL, variants: ["without-prosody", "with-prosody"], outputRef: null }; }
export async function replayTranscriptionQualityLocally(options: {
  workspaceRoot?: string;
  sourceResultsPath: string;
  runId: string;
  vocabulary: PersonalVocabularySnapshot;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; providerCalls: 0; sttCalls: 0; results: readonly ReplayResult[]; artifactPath: string }> {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const source = (await readFile(resolve(workspaceRoot, options.sourceResultsPath), "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as TranscriptionQualitySampleResult);
  const results: ReplayResult[] = [];
  for (const item of source) {
    const raw = (await readFile(resolve(workspaceRoot, item.text.rawTranscriptRef), "utf8")).trim();
    for (const vocabularyMode of ["off", "automatic", "ask"] as const) {
      let final = raw; let vocabularyStatus: ReplayResult["vocabularyStatus"] = "off";
      if (vocabularyMode !== "off") {
        const snapshot = vocabularyMode === "automatic" ? { ...options.vocabulary, rules: options.vocabulary.rules.filter((rule) => rule.mode === "automatic") } : options.vocabulary;
        const replay = resolveVocabularyPreDelivery({ sessionId: `${options.runId}-${item.sampleId}-${item.candidateId}-${vocabularyMode}`, text: raw, snapshot, source: "dictation" });
        final = replay.text; vocabularyStatus = replay.outcome === "waiting_for_choice" ? "waiting-for-choice" : final === raw ? "unchanged" : "changed";
      }
      const root = `artifacts/transcription-quality/${options.runId}/private/${item.sampleId}/${item.candidateId}/${vocabularyMode}`; const finalRef = `${root}/final.txt`; await mkdir(resolve(workspaceRoot, root), { recursive: true }); await writeFile(resolve(workspaceRoot, finalRef), `${final}\n`);
      results.push({ sampleId: item.sampleId, candidateId: item.candidateId, rawRef: item.text.rawTranscriptRef, vocabularyMode, vocabularyStatus, finalRef, postprocess: createPostprocessPlan() });
    }
  }
  const artifactPath = `artifacts/transcription-quality/${options.runId}/replay.json`; await mkdir(dirname(resolve(workspaceRoot, artifactPath)), { recursive: true });
  const publicArtifact = { schemaVersion: 1, runId: options.runId, providerCalls: 0, sttCalls: 0, vocabularyRulesHash: sha256(JSON.stringify(options.vocabulary.rules.map(({ id, revision, mode }) => ({ id, revision, mode })))), results };
  await writeFile(resolve(workspaceRoot, artifactPath), `${JSON.stringify(publicArtifact, null, 2)}\n`);
  return { ok: true, providerCalls: 0, sttCalls: 0, results, artifactPath };
}

export const GATE_B_REQUEST_CAP = 6;
export const GATE_B_COST_CAP_USD = 0.005;
export const GATE_B_SOURCE_CANDIDATE_ID = "transcription-quality-v1-short-auto";
export const GATE_B_INPUT_USD_PER_MILLION_TOKENS = 0.15;
export const GATE_B_OUTPUT_USD_PER_MILLION_TOKENS = 0.60;
const ACTION_ROUTE = "/product/v1/runtime/actions";
const GATE_B_RUNNER_VERSION = "gate-b-postprocess-1";
const GATE_B_V2_RUNNER_VERSION = "gate-b-postprocess-2";

type GateBFailure = Readonly<{ status: number; code?: string; category?: string; retryable?: boolean }>;
type GateBResult = Readonly<{
  sampleId: string;
  sourceCandidateId: string;
  candidateId: PostprocessEvaluationRecipe["id"];
  recipeId: PostprocessEvaluationRecipe["id"];
  variant: PostprocessEvaluationRecipe["variant"];
  rawRef: string;
  finalRef: string;
  prosodyRef: string | null;
  text: {
    rawTranscriptRef: string;
    finalTextRef: string;
    goldRef: string;
  };
  scores: TranscriptionQualitySampleResult["scores"];
  semanticSafety: PostprocessSemanticSafetyReceipt;
  latencyMs: number;
  timingsMs: { total: number };
  identity: {
    configured: { provider: "server-owned"; model: "server-owned"; promptId: PostprocessEvaluationRecipe["promptId"] };
    resolved: { provider: PostprocessEvaluationRecipe["provider"]; model: PostprocessEvaluationRecipe["model"]; promptId: PostprocessEvaluationRecipe["promptId"] };
    observed: { evaluationRecipeId: PostprocessEvaluationRecipe["id"]; evaluationRecipeVersion: PostprocessEvaluationRecipe["version"] };
  };
}>;
export type GateBRunResult = Readonly<{
  ok: boolean;
  runId: string;
  requestCount: number;
  estimatedMaxCostUsd?: number;
  results?: readonly GateBResult[];
  artifacts?: { root: string; runPath: string; resultsPath: string; summaryPath: string };
  error?: string;
  failure?: GateBFailure;
}>;
export type GateBRunOptions = Readonly<{
  workspaceRoot?: string;
  sourceResultsPath: string;
  backendBaseUrl?: string;
  deviceId?: string;
  runId?: string;
  executionId?: string;
  definitionHash?: string;
  allowProviderCalls?: boolean;
  maxRequests?: number;
  maxCostUsd?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  schemaVersion?: 1 | 2;
}>;

type PreparedGateBSample = Readonly<{
  source: TranscriptionQualitySampleResult;
  raw: string;
  gold: string;
  prosodyHints: string;
}>;

function postprocessRecipesForSchema(schemaVersion: 1 | 2): readonly PostprocessEvaluationRecipe[] {
  return schemaVersion === 2
    ? [POSTPROCESS_EVALUATION_RECIPES[0], CONSERVATIVE_TIMING_EVALUATION_RECIPE]
    : POSTPROCESS_EVALUATION_RECIPES;
}

export type GateBProviderFreePlan = Readonly<{
  ok: true;
  providerCalls: 0;
  plannedRequests: 6;
  sourceCandidateId: typeof GATE_B_SOURCE_CANDIDATE_ID;
  estimatedMaxCostUsd: number;
  costCapUsd: typeof GATE_B_COST_CAP_USD;
  recipes: readonly PostprocessEvaluationRecipe["id"][];
  samples: readonly { sampleId: string; rawRef: string; metadataRef: string; prosodyAvailable: boolean }[];
}>;

function safeFailure(value: unknown, status: number): GateBFailure {
  const envelope = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const error = envelope.error && typeof envelope.error === "object" && !Array.isArray(envelope.error) ? envelope.error as Record<string, unknown> : {};
  return {
    status,
    ...(typeof error.code === "string" ? { code: error.code } : {}),
    ...(typeof error.category === "string" ? { category: error.category } : {}),
    ...(typeof error.retryable === "boolean" ? { retryable: error.retryable } : {}),
  };
}
function parseSemanticSafetyReceipt(value: unknown): PostprocessSemanticSafetyReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const receipt = value as Record<string, unknown>;
  if ((receipt.decision !== "accepted" && receipt.decision !== "fallback") || receipt.redacted !== true || !Array.isArray(receipt.reasons)) return null;
  if (!receipt.reasons.every((reason) => typeof reason === "string" && POSTPROCESS_SEMANTIC_SAFETY_REASONS.includes(reason as never))) return null;
  if (!receipt.alignment || typeof receipt.alignment !== "object" || Array.isArray(receipt.alignment)) return null;
  const alignment = receipt.alignment as Record<string, unknown>;
  const counts = ["rawTokenCount", "candidateTokenCount", "matched", "omissions", "additions", "trailingOmissions"] as const;
  if (!counts.every((name) => Number.isInteger(alignment[name]) && Number(alignment[name]) >= 0)) return null;
  return {
    decision: receipt.decision,
    reasons: receipt.reasons as PostprocessSemanticSafetyReceipt["reasons"],
    alignment: {
      rawTokenCount: Number(alignment.rawTokenCount),
      candidateTokenCount: Number(alignment.candidateTokenCount),
      matched: Number(alignment.matched),
      omissions: Number(alignment.omissions),
      additions: Number(alignment.additions),
      trailingOmissions: Number(alignment.trailingOmissions),
    },
    redacted: true,
  };
}

function selectedGateARows(rows: readonly TranscriptionQualitySampleResult[]): readonly TranscriptionQualitySampleResult[] {
  if (rows.length !== 12) throw new Error("gate-b-source-incomplete");
  const expectedSamples = new Set(["jp-quality-bilingual-technical-20260812", "jp-quality-punctuation-list-20260812", "jp-quality-model-comparison-20260812"]);
  const selected = rows.filter((row) => row.candidateId === GATE_B_SOURCE_CANDIDATE_ID);
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.sampleId, (counts.get(row.sampleId) ?? 0) + 1);
  if (selected.length !== 3 || new Set(selected.map(({ sampleId }) => sampleId)).size !== 3
    || counts.size !== 3 || [...counts.values()].some((count) => count !== 4)
    || [...new Set(rows.map(({ candidateId }) => candidateId))].length !== 4
    || !selected.every(({ sampleId }) => expectedSamples.has(sampleId))) {
    throw new Error("gate-b-source-matrix-invalid");
  }
  return selected;
}

function validObservedRecipe(value: unknown, recipe: PostprocessEvaluationRecipe): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const observed = value as Record<string, unknown>;
  return observed.id === recipe.id
    && observed.version === recipe.version
    && observed.variant === recipe.variant
    && observed.provider === recipe.provider
    && observed.model === recipe.model
    && observed.promptId === recipe.promptId;
}

function estimatedMaxGateBCost(
  prepared: readonly { raw: string; prosodyHints: string }[],
  recipes: readonly PostprocessEvaluationRecipe[],
): number {
  let inputTokenUpperBound = 0;
  let outputTokenUpperBound = 0;
  for (const item of prepared) {
    for (const recipe of recipes) {
      const providerInput = { transcript: item.raw, ...(recipe.variant !== "without-prosody" ? { prosodyHints: item.prosodyHints } : {}) };
      inputTokenUpperBound += Buffer.byteLength(MANAGED_POSTPROCESS_SAFETY_PROMPT, "utf8")
        + Buffer.byteLength(JSON.stringify(providerInput), "utf8")
        + 512;
      outputTokenUpperBound += recipe.maxCompletionTokens;
    }
  }
  return inputTokenUpperBound / 1_000_000 * GATE_B_INPUT_USD_PER_MILLION_TOKENS
    + outputTokenUpperBound / 1_000_000 * GATE_B_OUTPUT_USD_PER_MILLION_TOKENS;
}

async function prepareGateB(workspaceRoot: string, sourceResultsPath: string, schemaVersion: 1 | 2): Promise<{ prepared: readonly PreparedGateBSample[]; estimatedMaxCostUsd: number }> {
  const sourceRows = (await readFile(resolve(workspaceRoot, sourceResultsPath), "utf8"))
    .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as TranscriptionQualitySampleResult);
  const selected = selectedGateARows(sourceRows);
  const prepared = await Promise.all(selected.map(async (source) => {
    const raw = (await readFile(resolve(workspaceRoot, source.text.rawTranscriptRef), "utf8")).trim();
    const gold = (await readFile(resolve(workspaceRoot, source.text.goldRef), "utf8")).trim();
    const metadata = source.stages.stt.metadata;
    if (metadata.status !== "observed") throw new Error(`gate-b-metadata-not-observed:${source.sampleId}`);
    const privateMetadata = JSON.parse(await readFile(resolve(workspaceRoot, metadata.privateRef), "utf8")) as Record<string, unknown>;
    const words = Array.isArray(privateMetadata.words) ? privateMetadata.words : [];
    const prosodyHints = schemaVersion === 2
      ? formatConservativeProsodyContext(words)
      : formatProsodyHints(words);
    return { source, raw, gold, prosodyHints };
  }));
  const recipes = postprocessRecipesForSchema(schemaVersion);
  return { prepared, estimatedMaxCostUsd: estimatedMaxGateBCost(prepared, recipes) };
}

export async function planGateBPostprocess(options: Pick<GateBRunOptions, "workspaceRoot" | "sourceResultsPath" | "schemaVersion">): Promise<GateBProviderFreePlan> {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const schemaVersion = options.schemaVersion ?? 1;
  const { prepared, estimatedMaxCostUsd } = await prepareGateB(workspaceRoot, options.sourceResultsPath, schemaVersion);
  return {
    ok: true,
    providerCalls: 0,
    plannedRequests: GATE_B_REQUEST_CAP,
    sourceCandidateId: GATE_B_SOURCE_CANDIDATE_ID,
    estimatedMaxCostUsd,
    costCapUsd: GATE_B_COST_CAP_USD,
    recipes: postprocessRecipesForSchema(schemaVersion).map(({ id }) => id),
    samples: prepared.map(({ source, prosodyHints }) => {
      const metadata = source.stages.stt.metadata;
      if (metadata.status !== "observed") throw new Error(`gate-b-metadata-not-observed:${source.sampleId}`);
      return { sampleId: source.sampleId, rawRef: source.text.rawTranscriptRef, metadataRef: metadata.privateRef, prosodyAvailable: prosodyHints.length > 0 };
    }),
  };
}
export async function smokeStoredGateBSemanticSafety(options: {
  workspaceRoot?: string;
  runRoot: string;
}): Promise<{
  ok: true;
  providerCalls: 0;
  outputs: readonly {
    sampleId: string;
    recipeId: string;
    decision: PostprocessSemanticSafetyReceipt["decision"];
    reasons: PostprocessSemanticSafetyReceipt["reasons"];
    omissions: number;
    additions: number;
  }[];
}> {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const rows = (await readFile(resolve(workspaceRoot, options.runRoot, "results.jsonl"), "utf8"))
    .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  if (rows.length !== GATE_B_REQUEST_CAP) throw new Error("gate-b-smoke-matrix-invalid");
  const outputs = await Promise.all(rows.map(async (row) => {
    if (typeof row.sampleId !== "string" || typeof row.recipeId !== "string" || typeof row.rawRef !== "string" || typeof row.finalRef !== "string") {
      throw new Error("gate-b-smoke-row-invalid");
    }
    const [raw, candidate] = await Promise.all([
      readFile(resolve(workspaceRoot, row.rawRef), "utf8"),
      readFile(resolve(workspaceRoot, row.finalRef), "utf8"),
    ]);
    const receipt = evaluatePostprocessSemanticSafety(raw.trim(), candidate.trim()).receipt;
    return {
      sampleId: row.sampleId,
      recipeId: row.recipeId,
      decision: receipt.decision,
      reasons: receipt.reasons,
      omissions: receipt.alignment.omissions,
      additions: receipt.alignment.additions,
    };
  }));
  if (new Set(outputs.map(({ sampleId, recipeId }) => `${sampleId}:${recipeId}`)).size !== GATE_B_REQUEST_CAP) {
    throw new Error("gate-b-smoke-matrix-invalid");
  }
  return { ok: true, providerCalls: 0, outputs };
}

export async function runGateBPostprocess(options: GateBRunOptions): Promise<GateBRunResult> {
  const schemaVersion = options.schemaVersion ?? 1;
  const recipes = postprocessRecipesForSchema(schemaVersion);
  const runId = options.runId ?? `gate-b-v${schemaVersion}-${Date.now().toString(36)}`;
  if (
    options.allowProviderCalls !== true
    || options.maxRequests !== GATE_B_REQUEST_CAP
    || options.maxCostUsd !== GATE_B_COST_CAP_USD
    || !/^[a-f0-9-]{36}$/.test(options.executionId ?? "")
    || !/^[a-f0-9]{64}$/.test(options.definitionHash ?? "")
  ) {
    return { ok: false, runId, requestCount: 0, error: "provider-call-gate-required" };
  }
  const backendBaseUrl = options.backendBaseUrl?.replace(/\/+$/, "") ?? "";
  const deviceId = options.deviceId?.trim() ?? "";
  if (!backendBaseUrl || !deviceId) return { ok: false, runId, requestCount: 0, error: "backend-or-device-not-configured" };
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const { prepared, estimatedMaxCostUsd } = await prepareGateB(workspaceRoot, options.sourceResultsPath, schemaVersion);
  if (estimatedMaxCostUsd > GATE_B_COST_CAP_USD) return { ok: false, runId, requestCount: 0, estimatedMaxCostUsd, error: "provider-cost-cap-exceeded" };
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => performance.now());
  const results: GateBResult[] = [];
  let requestCount = 0;

  for (const { source, raw, gold, prosodyHints } of prepared) {
    for (const recipe of recipes) {
      if (requestCount >= GATE_B_REQUEST_CAP) return { ok: false, runId, requestCount, error: "provider-cap-exceeded" };
      const operationId = `${runId}-${source.sampleId}-${recipe.variant}`;
      const body = {
        operationId,
        kind: "postprocess",
        evaluationRecipeId: recipe.id,
        input: {
          transcript: raw,
          ...(recipe.variant !== "without-prosody" ? { prosodyHints } : {}),
        },
      };
      const started = now();
      requestCount += 1;
      const response = await fetchImpl(`${backendBaseUrl}${ACTION_ROUTE}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-id": deviceId, "x-laboratory-execution-id": options.executionId!, "x-laboratory-definition-hash": options.definitionHash! },
        body: JSON.stringify(body),
      });
      const latencyMs = Math.max(0, now() - started);
      let envelope: unknown;
      try { envelope = await response.json(); } catch { envelope = {}; }
      if (!response.ok) return { ok: false, runId, requestCount, error: `postprocess-http-${response.status}`, failure: safeFailure(envelope, response.status) };
      const data = envelope && typeof envelope === "object" && !Array.isArray(envelope) ? (envelope as Record<string, unknown>).data : undefined;
      const payload = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
      const output = payload.output && typeof payload.output === "object" && !Array.isArray(payload.output) ? payload.output as Record<string, unknown> : {};
      const finalText = typeof output.text === "string" ? output.text.trim() : "";
      const semanticSafety = parseSemanticSafetyReceipt(payload.semanticSafety);
      if (payload.operationId !== operationId || payload.kind !== "postprocess" || !finalText || !semanticSafety || !validObservedRecipe(payload.evaluationRecipe, recipe)) {
        return { ok: false, runId, requestCount, error: "invalid-product-response" };
      }
      const privateRoot = `artifacts/transcription-quality/${runId}/private/${source.sampleId}/${recipe.id}`;
      const finalRef = `${privateRoot}/final.txt`;
      const prosodyRef = recipe.variant !== "without-prosody" ? `${privateRoot}/prosody-hints.txt` : null;
      await mkdir(resolve(workspaceRoot, privateRoot), { recursive: true });
      await writeFile(resolve(workspaceRoot, finalRef), `${finalText}\n`);
      if (prosodyRef) await writeFile(resolve(workspaceRoot, prosodyRef), `${prosodyHints}\n`);
      results.push({
        sampleId: source.sampleId,
        candidateId: recipe.id,
        sourceCandidateId: source.candidateId,
        recipeId: recipe.id,
        variant: recipe.variant,
        rawRef: source.text.rawTranscriptRef,
        finalRef,
        prosodyRef,
        text: {
          rawTranscriptRef: source.text.rawTranscriptRef,
          finalTextRef: finalRef,
          goldRef: source.text.goldRef,
        },
        scores: scoreTranscript(gold, finalText, semanticSafety),
        semanticSafety,
        latencyMs,
        timingsMs: { total: latencyMs },
        identity: {
          configured: { provider: "server-owned", model: "server-owned", promptId: recipe.promptId },
          resolved: { provider: recipe.provider, model: recipe.model, promptId: recipe.promptId },
          observed: { evaluationRecipeId: recipe.id, evaluationRecipeVersion: recipe.version },
        },
      });
    }
  }
  if (requestCount !== GATE_B_REQUEST_CAP || results.length !== GATE_B_REQUEST_CAP) return { ok: false, runId, requestCount, error: "incomplete-gate-b-matrix" };
  const root = `artifacts/transcription-quality/${runId}`;
  const runPath = `${root}/run.json`;
  const resultsPath = `${root}/results.jsonl`;
  const summaryPath = `${root}/summary.json`;
  await mkdir(resolve(workspaceRoot, root), { recursive: true });
  const run = { schemaVersion: 1, runId, runnerVersion: schemaVersion === 2 ? GATE_B_V2_RUNNER_VERSION : GATE_B_RUNNER_VERSION, sourceResultsPath: options.sourceResultsPath, sourceCandidateId: GATE_B_SOURCE_CANDIDATE_ID, requestCap: GATE_B_REQUEST_CAP, costCapUsd: GATE_B_COST_CAP_USD, estimatedMaxCostUsd, pricing: { inputUsdPerMillionTokens: GATE_B_INPUT_USD_PER_MILLION_TOKENS, outputUsdPerMillionTokens: GATE_B_OUTPUT_USD_PER_MILLION_TOKENS }, requestCount };
  const publicResults = results.map(({ prosodyRef: _prosodyRef, ...result }) => result);
  const summary = {
    schemaVersion: 1,
    runId,
    requestCount,
    costCapUsd: GATE_B_COST_CAP_USD,
    estimatedMaxCostUsd,
    variants: recipes.map(({ id, variant, provider, model, promptId }) => ({ id, variant, provider, model, promptId })),
    samples: publicResults,
  };
  await writeFile(resolve(workspaceRoot, runPath), `${JSON.stringify(run, null, 2)}\n`);
  await writeFile(resolve(workspaceRoot, resultsPath), `${publicResults.map((result) => JSON.stringify(result)).join("\n")}\n`);
  await writeFile(resolve(workspaceRoot, summaryPath), `${JSON.stringify(summary, null, 2)}\n`);
  return { ok: true, runId, requestCount, estimatedMaxCostUsd, results, artifacts: { root, runPath, resultsPath, summaryPath } };
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.main) {
  const sourceResultsPath = readArg("--source-results") ?? "";
  const smokeRun = readArg("--smoke-run");
  if (smokeRun) {
    console.log(JSON.stringify(await smokeStoredGateBSemanticSafety({ runRoot: smokeRun })));
  } else if (process.argv.includes("--plan")) {
    const schemaVersion = Number(readArg("--schema-version")) === 2 ? 2 : 1;
    const plan = await planGateBPostprocess({ sourceResultsPath, schemaVersion });
    console.log(JSON.stringify({ ...plan, samples: plan.samples.map(({ sampleId, prosodyAvailable }) => ({ sampleId, prosodyAvailable })), redacted: true }));
  } else {
    const configuration = resolveProductConfiguration({});
    const result = await runGateBPostprocess({
      sourceResultsPath,
      backendBaseUrl: configuration.backendBaseUrl,
      deviceId: configuration.deviceId,
      allowProviderCalls: process.argv.includes("--allow-provider-call"),
      maxRequests: Number(readArg("--max-requests")),
      maxCostUsd: Number(readArg("--max-cost-usd")),
      runId: readArg("--run-id"),
      executionId: readArg("--execution-id"),
      definitionHash: readArg("--definition-hash"),
      schemaVersion: Number(readArg("--schema-version")) === 2 ? 2 : 1,
    });
    console.log(JSON.stringify({ ...result, results: undefined, redacted: true }));
    if (!result.ok) process.exitCode = 1;
  }
}
