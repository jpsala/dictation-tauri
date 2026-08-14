import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  EVALUATION_RECIPES,
  GATE_A_DEFINITION as CORE_GATE_A_DEFINITION,
  isExactGateADefinition as isExactCoreGateADefinition,
  type EvaluationRecipe,
  type EvaluationRecipeId,
  type PublicSttMetadata,
} from "../cloud/fixvox-core/src/control-plane/evaluation-recipes";
import {
  evaluatePostprocessSemanticSafety,
  type PostprocessSemanticSafetyReceipt,
} from "../cloud/fixvox-core/src/execution/postprocess-semantic-safety";
import {
  localHumanCorpusCatalog,
  verifyLocalHumanCorpus,
  type LocalHumanCorpusCatalogEntry,
} from "./transcription-quality-local-human-corpus";
import { stableCanonicalJson, writeTranscriptionQualityArtifacts } from "./transcription-quality-artifacts";
import type {
  TranscriptionQualityCandidate,
  TranscriptionQualityCandidateRecipe,
  TranscriptionQualityResultIdentity,
  TranscriptionQualitySampleResult,
  TranscriptionQualityRun,
} from "../src/test-fixtures/transcription-quality-contract";

export const GATE_A_REQUEST_CAP = 12;
export const GATE_A_COST_CAP_USD = 0.005;
export const GATE_A_ESTIMATED_COST_USD = 0.003848;
const ESTIMATED_STT_USD_PER_HOUR = 0.04;
const PRODUCT_ROUTE = "/product/v1/runtime/transcriptions";
const CONTEXT_ROUTE = "/product/v1/desktop/context";
const RUNNER_VERSION = "gate-a-matrix-1";
const AUDIO_PREP_HASH = sha256("tauri-audio-prep-v1:normalize-low-level:3981ppm:-34dbfs:-6dbfs:18db:ffmpeg:mono:16000hz:libmp3lame:48k");
const MATERIALIZATION_HASH = sha256("product-v1:response-text:kept");

export const productBaselineSamples = [
  { id: "jp-quality-bilingual-technical-20260812", durationMs: 30_590 },
  { id: "jp-quality-punctuation-list-20260812", durationMs: 22_930 },
  { id: "jp-quality-model-comparison-20260812", durationMs: 33_110 },
] as const;
export const GATE_A_DEFINITION = CORE_GATE_A_DEFINITION;
export const GATE_A_DEFINITION_HASH = sha256(stableCanonicalJson(GATE_A_DEFINITION));
export const isExactGateADefinition = isExactCoreGateADefinition;
export const gateAEvaluationRecipeIds = EVALUATION_RECIPES.map(({ id }) => id) as readonly EvaluationRecipeId[];

export type PreparedBaselineAudio = {
  bytes: Buffer;
  format: "wav" | "mp3";
  mimeType: "audio/wav" | "audio/mpeg";
  fileName: "recording.wav" | "recording.mp3";
  source: "wav" | "ffmpeg-mp3";
  durationMs: number;
  prepMs: number;
};
export type ProductBaselineRunOptions = {
  workspaceRoot?: string;
  backendBaseUrl?: string;
  deviceId?: string;
  fetchImpl?: typeof fetch;
  allowProviderCalls?: boolean;
  maxRequests?: number;
  maxCostUsd?: number;
  runId?: string;
  executionId?: string;
  definitionHash?: string;
  now?: () => number;
  catalog?: readonly LocalHumanCorpusCatalogEntry[];
  audioPrepImpl?: (input: { audioPath: string; bytes: Buffer; fallbackDurationMs: number }) => Promise<PreparedBaselineAudio>;
};
export type ProductBaselineRunResult = {
  ok: boolean;
  runId: string;
  requestCount: number;
  artifacts?: { root: string; runPath: string; resultsPath: string; summaryPath: string; contextPath: string };
  error?: string;
  failure?: { status: number; code?: string; category?: string; retryable?: boolean };
};
type ProductContext = { profile?: { key?: unknown; revision?: unknown; version?: unknown }; capabilities?: Record<string, unknown>; authority?: { mode?: unknown; revision?: unknown } };
type ProductTranscription = {
  operationId?: unknown;
  text?: unknown;
  language?: unknown;
  evaluationRecipeId?: unknown;
  sttMetadata?: unknown;
  sttMetadataPrivate?: unknown;
};
type ProductFailureEnvelope = { error?: { code?: unknown; category?: unknown; retryable?: unknown } };
const SAFE_PRODUCT_HEADERS = {
  engine: "x-fixvox-engine-id", profile: "x-fixvox-profile-id", prompt: "x-fixvox-prompt-id", runtimeRoute: "x-fixvox-runtime-route", costUsd: "x-fixvox-cost-usd",
  timingsMs: ["x-fixvox-proxy-init-ms", "x-fixvox-proxy-parse-ms", "x-fixvox-proxy-upstream-ms", "x-fixvox-proxy-usage-ms", "x-fixvox-proxy-engine-binding-ms", "x-fixvox-proxy-prompt-resolution-ms", "x-fixvox-proxy-budget-config-ms", "x-fixvox-proxy-budget-events-ms", "x-fixvox-proxy-multipart-ms", "x-fixvox-proxy-budget-ms", "x-fixvox-proxy-total-ms"],
} as const;

export function safeProductHeaders(headers: Headers): Record<string, unknown> {
  const text = (name: string) => headers.get(name)?.trim() || undefined;
  const number = (name: string) => { const value = text(name); return value && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) ? Number(value) : undefined; };
  const result: Record<string, unknown> = {};
  for (const [key, name] of Object.entries(SAFE_PRODUCT_HEADERS).filter(([, value]) => typeof value === "string")) {
    const value = key === "costUsd" ? number(name as string) : text(name as string);
    if (value !== undefined) result[key] = value;
  }
  const timings: Record<string, number> = {};
  for (const name of SAFE_PRODUCT_HEADERS.timingsMs) { const value = number(name); if (value !== undefined) timings[name.slice(9, -3)] = value; }
  if (Object.keys(timings).length) result.timingsMs = timings;
  return result;
}
function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function recipeHash(recipe: TranscriptionQualityCandidateRecipe): string { return sha256(stableCanonicalJson(recipe)); }
function resolvedPromptIdentity(recipe: EvaluationRecipe) { return { id: recipe.id, version: recipe.version, sha256: sha256(recipe.prompt), chars: recipe.prompt.length }; }
function candidateFor(recipe: EvaluationRecipe): TranscriptionQualityCandidate {
  const configured: TranscriptionQualityCandidateRecipe = {
    audioPrep: { mode: "tauri-audio-prep-v1", configHash: AUDIO_PREP_HASH },
    stt: { provider: "server-owned", model: "server-owned", prompt: { id: recipe.id, version: recipe.version }, language: recipe.language, temperature: 0, responseFormat: "verbose-json", evaluationRecipeId: recipe.id, metadata: { mode: "bounded-verbose", maxWords: 500, maxSegments: 100 } },
    materialization: { mode: "response-text-kept", configHash: MATERIALIZATION_HASH }, postprocess: null, vocabulary: { mode: "off" },
  };
  const resolved: TranscriptionQualityCandidateRecipe = { ...configured, stt: { ...configured.stt, provider: "groq", model: recipe.model, prompt: resolvedPromptIdentity(recipe) } };
  return { candidateId: recipe.id, candidateVersion: recipe.version, recipe: { configured, resolved } };
}
function identity(recipe: EvaluationRecipe, state: "configured" | "resolved" | "observed", headers?: Record<string, unknown>): TranscriptionQualityResultIdentity {
  if (state === "configured") return { sttProvider: "server-owned", sttModel: "server-owned", sttPromptId: recipe.id, language: recipe.language, responseFormat: "verbose-json" };
  if (state === "resolved") return { sttProvider: "groq", sttModel: recipe.model, sttPromptId: recipe.id, sttPromptSha256: sha256(recipe.prompt), language: recipe.language, responseFormat: "verbose-json" };
  return {
    ...(typeof headers?.engine === "string" ? { sttEngineId: headers.engine } : {}),
    ...(typeof headers?.prompt === "string" ? { sttPromptId: headers.prompt } : {}),
  };
}
function safeContext(value: unknown, receipts: readonly Record<string, unknown>[]): Record<string, unknown> {
  const envelope = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const data = envelope.data && typeof envelope.data === "object" ? envelope.data as ProductContext : {};
  const profile = data.profile ?? {}; const authority = data.authority ?? {};
  return { route: "product-v1", profile: { key: typeof profile.key === "string" ? profile.key : null, revision: typeof profile.revision === "number" ? profile.revision : null, version: typeof profile.version === "number" ? profile.version : null }, transcriptionCapability: data.capabilities?.transcription === true, authority: { mode: typeof authority.mode === "string" ? authority.mode : null, revision: typeof authority.revision === "number" ? authority.revision : null }, identity: { configured: { route: PRODUCT_ROUTE, authority: "server-owned", postprocess: "off", vocabulary: "off", delivery: "off" }, resolved: { profile: typeof profile.key === "string" ? profile.key : null, authority: typeof authority.mode === "string" ? authority.mode : null }, observed: receipts.length ? { requests: receipts } : null }, observedEndpointPath: PRODUCT_ROUTE };
}
function normalizeWords(text: string): string[] { return text.normalize("NFKC").toLocaleLowerCase("es").match(/[\p{L}\p{N}]+/gu) ?? []; }
function editDistance<T>(left: readonly T[], right: readonly T[]): number { let previous = Array.from({ length: right.length + 1 }, (_, i) => i); for (let i = 1; i <= left.length; i += 1) { const current = [i]; for (let j = 1; j <= right.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)); previous = current; } return previous[right.length]; }
export function scoreTranscript(
  gold: string,
  transcript: string,
  semanticSafety?: PostprocessSemanticSafetyReceipt,
): TranscriptionQualitySampleResult["scores"] {
  const goldWords = normalizeWords(gold); const words = normalizeWords(transcript); const distance = editDistance(goldWords, words);
  const goldChars = [...gold.normalize("NFKC")]; const chars = [...transcript.normalize("NFKC")];
  const punctuation = (value: string) => value.match(/[.,;:!?]/g)?.length ?? 0;
  const comparison = semanticSafety ?? evaluatePostprocessSemanticSafety(gold, transcript).receipt;
  const unsafe = semanticSafety?.decision === "fallback";
  return {
    wer: distance / Math.max(1, goldWords.length),
    cer: editDistance(goldChars, chars) / Math.max(1, goldChars.length),
    entities: { expected: 0, matched: 0, falseReplacements: 0, exactMatchRate: 1 },
    structure: { punctuation: Math.min(1, punctuation(transcript) / Math.max(1, punctuation(gold))), lists: 1 },
    semanticSafety: {
      omissions: comparison.alignment.omissions,
      additions: comparison.alignment.additions,
      translationDrift: 0,
      intentDrift: unsafe && semanticSafety.reasons.includes("semantic_transformation") ? 1 : 0,
      instructionFollowing: unsafe ? 0 : 1,
    },
  };
}
function loadDotEnv(path: string): Record<string, string> { try { return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).flatMap((line) => { const trimmed = line.trim(); if (!trimmed || trimmed.startsWith("#")) return []; const separator = trimmed.indexOf("="); return separator < 1 ? [] : [[trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim().replace(/^['\"]|['\"]$/g, "")]]; })); } catch { return {}; } }
export function resolveProductConfiguration(options: Pick<ProductBaselineRunOptions, "workspaceRoot" | "backendBaseUrl" | "deviceId">): { backendBaseUrl: string; deviceId: string } {
  const env = loadDotEnv(resolve(options.workspaceRoot ?? process.cwd(), ".env"));
  const backendBaseUrl = (options.backendBaseUrl ?? process.env.FIXVOX_BACKEND_URL ?? env.FIXVOX_BACKEND_URL ?? env.FIXVOX_API_BASE_URL ?? env.PROXY_BASE_URL ?? "").replace(/\/+$/, "");
  let deviceId = options.deviceId ?? process.env.FIXVOX_DEVICE_ID ?? env.FIXVOX_DEVICE_ID ?? "";
  if (!deviceId) { const appData = process.env.APPDATA ?? process.env.LOCALAPPDATA; if (appData) try { const state = JSON.parse(readFileSync(join(appData, "dictation-tauri", "fixvox-device-state.json"), "utf8")) as { deviceId?: unknown }; if (typeof state.deviceId === "string") deviceId = state.deviceId; } catch {} }
  return { backendBaseUrl, deviceId };
}
function approvedCatalog(source: readonly LocalHumanCorpusCatalogEntry[]): readonly LocalHumanCorpusCatalogEntry[] { return productBaselineSamples.map(({ id }) => { const entry = source.find((candidate) => candidate.id === id); if (!entry || entry.goldStatus !== "approved") throw new Error(`approved-sample-missing:${id}`); return entry; }); }
function tauriNormalizationGainDb(bytes: Buffer): number | undefined { if (bytes.byteLength < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return undefined; const byteRate = bytes.readUInt32LE(28); if (!byteRate) return undefined; let sum = 0; let count = 0; let peak = 0; for (let offset = 44; offset + 1 < bytes.length; offset += 2) { const sample = bytes.readInt16LE(offset) / 32768; sum += sample * sample; count += 1; peak = Math.max(peak, Math.abs(sample)); } if (!count) return undefined; const rms = Math.sqrt(sum / count); if (rms >= 0.003981 || peak === 0) return undefined; const gain = Math.max(0, Math.min(-34 - 20 * Math.log10(rms), -6 - 20 * Math.log10(peak), 18)); return gain >= 0.5 ? gain : undefined; }
function wavDurationMs(bytes: Buffer): number | undefined { if (bytes.byteLength < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return undefined; const byteRate = bytes.readUInt32LE(28); if (!byteRate) return undefined; let offset = 12; while (offset + 8 <= bytes.length) { const size = bytes.readUInt32LE(offset + 4); if (bytes.toString("ascii", offset, offset + 4) === "data") return Math.floor(size * 1000 / byteRate); offset += 8 + size + size % 2; } return undefined; }
export async function prepareTauriBaselineAudio(input: { audioPath: string; bytes: Buffer; fallbackDurationMs: number }): Promise<PreparedBaselineAudio> {
  const durationMs = wavDurationMs(input.bytes) ?? input.fallbackDurationMs;
  if (input.bytes.byteLength < 160_000) return { bytes: input.bytes, format: "wav", mimeType: "audio/wav", fileName: "recording.wav", source: "wav", durationMs, prepMs: 0 };
  const outputPath = `${input.audioPath}.${process.pid}.${Date.now()}.stt.mp3`; const started = performance.now();
  try { const args = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", input.audioPath]; const gain = tauriNormalizationGainDb(input.bytes); if (gain !== undefined) args.push("-af", `volume=${gain.toFixed(1)}dB`); args.push("-ac", "1", "-ar", "16000", "-codec:a", "libmp3lame", "-b:a", "48k", outputPath); const child = Bun.spawn(args, { stdout: "ignore", stderr: "ignore" }); if (await child.exited === 0) { const bytes = await readFile(outputPath); if (bytes.length && bytes.length < input.bytes.length) return { bytes, format: "mp3", mimeType: "audio/mpeg", fileName: "recording.mp3", source: "ffmpeg-mp3", durationMs, prepMs: performance.now() - started }; } } catch {} finally { await rm(outputPath, { force: true }); }
  return { bytes: input.bytes, format: "wav", mimeType: "audio/wav", fileName: "recording.wav", source: "wav", durationMs, prepMs: performance.now() - started };
}
type WireSttMetadata = PublicSttMetadata;
function isWireMetadata(value: unknown): value is WireSttMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Partial<WireSttMetadata> & Record<string, unknown>;
  const bounds = data.bounds as Record<string, unknown> | undefined;
  const counts = data.counts as Record<string, unknown> | undefined;
  const nonNegativeInteger = (entry: unknown) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0;
  return data.status === "observed"
    && data.redacted === true
    && !("privateRef" in data)
    && !!bounds
    && !!counts
    && nonNegativeInteger(bounds.maxWords)
    && nonNegativeInteger(bounds.maxSegments)
    && nonNegativeInteger(counts.words)
    && nonNegativeInteger(counts.segments)
    && nonNegativeInteger(counts.droppedWords)
    && nonNegativeInteger(counts.droppedSegments);
}
function boundedPrivateMetadata(privateValue: unknown, receiptValue: unknown): { receipt: WireSttMetadata; payload: Record<string, unknown> } | undefined {
  if (!privateValue || typeof privateValue !== "object" || Array.isArray(privateValue) || !isWireMetadata(receiptValue)) return undefined;
  const source = privateValue as Record<string, unknown>;
  if (!Array.isArray(source.words) || !Array.isArray(source.segments)) return undefined;
  if (source.words.length > receiptValue.bounds.maxWords || source.segments.length > receiptValue.bounds.maxSegments) return undefined;
  if (source.words.length !== receiptValue.counts.words || source.segments.length !== receiptValue.counts.segments) return undefined;
  const payload: Record<string, unknown> = {
    words: source.words,
    segments: source.segments,
    ...(receiptValue.durationMs === undefined ? {} : { durationMs: receiptValue.durationMs }),
    ...(receiptValue.noSpeechProbability === undefined ? {} : { noSpeechProbability: receiptValue.noSpeechProbability }),
    ...(receiptValue.averageLogProbability === undefined ? {} : { averageLogProbability: receiptValue.averageLogProbability }),
  };
  return { receipt: receiptValue, payload };
}
async function safeProductFailure(response: Response): Promise<ProductBaselineRunResult["failure"]> {
  let envelope: ProductFailureEnvelope = {};
  try { envelope = await response.json() as ProductFailureEnvelope; } catch {}
  const failure: NonNullable<ProductBaselineRunResult["failure"]> = { status: response.status };
  if (typeof envelope.error?.code === "string") failure.code = envelope.error.code;
  if (typeof envelope.error?.category === "string") failure.category = envelope.error.category;
  if (typeof envelope.error?.retryable === "boolean") failure.retryable = envelope.error.retryable;
  return failure;
}
export async function runProductBaseline(options: ProductBaselineRunOptions = {}): Promise<ProductBaselineRunResult> {
  const runId = options.runId ?? `gate-a-${Date.now().toString(36)}`;
  if (
    options.allowProviderCalls !== true
    || options.maxRequests !== GATE_A_REQUEST_CAP
    || options.maxCostUsd !== GATE_A_COST_CAP_USD
    || !/^[a-f0-9-]{36}$/.test(options.executionId ?? "")
    || !/^[a-f0-9]{64}$/.test(options.definitionHash ?? "")
    || options.definitionHash !== GATE_A_DEFINITION_HASH
  ) return { ok: false, runId, requestCount: 0, error: "provider-call-gate-required" };
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd()); const { backendBaseUrl, deviceId } = resolveProductConfiguration({ ...options, workspaceRoot });
  if (!backendBaseUrl || !deviceId) return { ok: false, runId, requestCount: 0, error: "backend-or-device-not-configured" };
  const fetchImpl = options.fetchImpl ?? fetch; const catalog = approvedCatalog(options.catalog ?? localHumanCorpusCatalog); const { manifest } = await verifyLocalHumanCorpus({ workspaceRoot, catalog });
  const contextResponse = await fetchImpl(`${backendBaseUrl}${CONTEXT_ROUTE}`, { headers: { "X-Device-Id": deviceId } });
  if (!contextResponse.ok) return { ok: false, runId, requestCount: 0, error: `context-http-${contextResponse.status}` };
  const contextPayload = await contextResponse.json(); if (safeContext(contextPayload, []).transcriptionCapability !== true) return { ok: false, runId, requestCount: 0, error: "transcription-capability-disabled" };
  const candidates = EVALUATION_RECIPES.map(candidateFor); const results: TranscriptionQualitySampleResult[] = []; const receipts: Record<string, unknown>[] = []; const now = options.now ?? (() => performance.now()); let requestCount = 0; let accruedCost = 0;
  for (const sampleConfig of productBaselineSamples) {
    const sample = manifest.samples.find(({ id }) => id === sampleConfig.id); if (!sample) throw new Error(`manifest-sample-missing:${sampleConfig.id}`);
    const audioPath = resolve(workspaceRoot, sample.audioArtifactPath); const audio = await readFile(audioPath); const prepared = await (options.audioPrepImpl ?? prepareTauriBaselineAudio)({ audioPath, bytes: audio, fallbackDurationMs: sampleConfig.durationMs }); const gold = (await readFile(resolve(workspaceRoot, sample.goldRef), "utf8")).trim();
    for (const recipe of EVALUATION_RECIPES) {
      const estimatedCost = prepared.durationMs / 3_600_000 * ESTIMATED_STT_USD_PER_HOUR;
      if (requestCount >= GATE_A_REQUEST_CAP || accruedCost + estimatedCost > GATE_A_COST_CAP_USD) return { ok: false, runId, requestCount, error: "provider-cap-exceeded" };
      const operationId = `${runId}-${sample.id}-${recipe.id}`; const form = new FormData(); form.append("metadata", JSON.stringify({ operationId, durationMs: prepared.durationMs, evaluationRecipeId: recipe.id })); form.append("audio", new Blob([prepared.bytes], { type: prepared.mimeType }), prepared.fileName);
      const started = now(); requestCount += 1; const response = await fetchImpl(`${backendBaseUrl}${PRODUCT_ROUTE}`, { method: "POST", headers: { "X-Device-Id": deviceId, "X-Laboratory-Execution-Id": options.executionId!, "X-Laboratory-Definition-Hash": options.definitionHash! }, body: form }); const latencyMs = Math.max(0, now() - started);
      if (!response.ok) return { ok: false, runId, requestCount, error: `transcription-http-${response.status}`, failure: await safeProductFailure(response) };
      const headers = safeProductHeaders(response.headers); const envelope = await response.json() as { data?: ProductTranscription }; const payload = envelope.data ?? {};
      const privateMetadata = boundedPrivateMetadata(payload.sttMetadataPrivate, payload.sttMetadata);
      if (payload.operationId !== operationId || payload.evaluationRecipeId !== recipe.id || typeof payload.text !== "string" || !payload.text.trim() || !privateMetadata) return { ok: false, runId, requestCount, error: "invalid-product-response" };
      const transcript = payload.text.trim(); const privateRoot = `artifacts/transcription-quality/${runId}/private/${sample.id}/${recipe.id}`; await mkdir(resolve(workspaceRoot, privateRoot), { recursive: true }); const rawRef = `${privateRoot}/raw.txt`; const finalRef = `${privateRoot}/final.txt`; const metadataRef = `${privateRoot}/stt-metadata.json`; await writeFile(resolve(workspaceRoot, rawRef), `${transcript}\n`); await writeFile(resolve(workspaceRoot, finalRef), `${transcript}\n`); await writeFile(resolve(workspaceRoot, metadataRef), `${JSON.stringify(privateMetadata.payload, null, 2)}\n`);
      const metadata = { ...privateMetadata.receipt, privateRef: metadataRef }; const configured = identity(recipe, "configured"); const resolved = identity(recipe, "resolved"); const observed = identity(recipe, "observed", headers); receipts.push({ operationId, sampleId: sample.id, candidateId: recipe.id, evaluationRecipeId: recipe.id, configured, resolved, ...(Object.keys(observed).length ? { observed } : {}), ...headers }); accruedCost += estimatedCost;
      results.push({
        schemaVersion: 1,
        runId,
        sampleId: sample.id,
        candidateId: recipe.id,
        audio: {
          sha256: sample.audioSha256,
          original: { format: sample.format, bytes: sample.audioBytes ?? audio.length, durationMs: prepared.durationMs },
          upload: { format: prepared.format, bytes: prepared.bytes.length, source: prepared.source },
        },
        identity: { configured, resolved, ...(Object.keys(observed).length ? { observed } : {}) },
        rawSource: { kind: "produced" },
        text: {
          goldRef: sample.goldRef,
          rawTranscriptRef: rawRef,
          finalTextRef: finalRef,
          goldLength: gold.length,
          rawTranscriptLength: transcript.length,
          finalTextLength: transcript.length,
        },
        stages: {
          stt: { status: "ok", metadata },
          materialization: { status: "kept", reasons: ["provider_text_kept"] },
          postprocess: { status: "off" },
          vocabulary: { status: "off" },
        },
        scores: scoreTranscript(gold, transcript),
        timingsMs: { audioPrep: prepared.prepMs, stt: latencyMs, postprocess: 0, total: prepared.prepMs + latencyMs },
        costUsd: { stt: estimatedCost, total: estimatedCost, source: "estimated-from-duration" },
        errors: [],
      });
    }
  }
  const candidateReceipts = candidates.map((candidate) => ({ configured: { candidateId: candidate.candidateId, candidateVersion: candidate.candidateVersion, recipeHash: recipeHash(candidate.recipe.configured), evaluationRecipeId: candidate.recipe.configured.stt.evaluationRecipeId }, resolved: { candidateId: candidate.candidateId, candidateVersion: candidate.candidateVersion, recipeHash: recipeHash(candidate.recipe.resolved!), evaluationRecipeId: candidate.recipe.resolved!.stt.evaluationRecipeId } }));
  const run: TranscriptionQualityRun = { schemaVersion: 1, runId, runnerVersion: RUNNER_VERSION, corpus: { corpusId: manifest.corpusId, corpusVersion: manifest.corpusVersion }, candidates: candidateReceipts, sampleIds: productBaselineSamples.map(({ id }) => id), providerCalls: { enabled: true, maxRequests: GATE_A_REQUEST_CAP, maxCostUsd: GATE_A_COST_CAP_USD, authorization: "explicit-user-approval" }, resultPath: `artifacts/transcription-quality/${runId}/results.jsonl` };
  const artifacts = await writeTranscriptionQualityArtifacts({ corpus: manifest, candidates, run, results }, { workspaceRoot }); const contextPath = `artifacts/transcription-quality/${runId}/context.json`; await mkdir(dirname(resolve(workspaceRoot, contextPath)), { recursive: true }); await writeFile(resolve(workspaceRoot, contextPath), `${JSON.stringify(safeContext(contextPayload, receipts), null, 2)}\n`);
  return { ok: true, runId, requestCount, artifacts: { ...artifacts, contextPath } };
}
function readArg(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
if (import.meta.main) { const result = await runProductBaseline({ allowProviderCalls: process.argv.includes("--allow-provider-call"), maxRequests: Number(readArg("--max-requests")), maxCostUsd: Number(readArg("--max-cost-usd")), runId: readArg("--run-id"), executionId: readArg("--execution-id"), definitionHash: readArg("--definition-hash") }); console.log(JSON.stringify({ ...result, redacted: true })); if (!result.ok) process.exitCode = 1; }
