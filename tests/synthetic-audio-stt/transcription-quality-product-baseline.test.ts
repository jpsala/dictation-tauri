import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GATE_A_COST_CAP_USD,
  GATE_A_REQUEST_CAP,
  GATE_A_DEFINITION_HASH,
  gateAEvaluationRecipeIds,
  productBaselineSamples,
  runProductBaseline,
  scoreTranscript,
  safeProductHeaders,
} from "../../scripts/transcription-quality-product-baseline";
import type { LocalHumanCorpusCatalogEntry } from "../../scripts/transcription-quality-local-human-corpus";

const temporaryRoots: string[] = [];
function sha256(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
async function createWorkspace(): Promise<{ root: string; catalog: readonly LocalHumanCorpusCatalogEntry[] }> {
  const root = await mkdtemp(join(tmpdir(), "tq-gate-a-")); temporaryRoots.push(root); const catalog: LocalHumanCorpusCatalogEntry[] = [];
  for (const [index, sample] of productBaselineSamples.entries()) {
    const bytes = Buffer.from(`RIFF-private-audio-${index}`); const audioArtifactPath = `artifacts/transcription-quality/corpus/private/audio/${sample.id}.wav`; const goldRef = `artifacts/transcription-quality/corpus/private/gold/${sample.id}.txt`;
    await mkdir(join(root, ...audioArtifactPath.split("/").slice(0, -1)), { recursive: true }); await mkdir(join(root, ...goldRef.split("/").slice(0, -1)), { recursive: true }); await writeFile(join(root, ...audioArtifactPath.split("/")), bytes); await writeFile(join(root, ...goldRef.split("/")), `PRIVATE-GOLD-${index}`);
    catalog.push({ id: sample.id, expectedSha256: sha256(bytes), expectedBytes: bytes.length, categories: ["controlled", "technical"], difficulty: "hard", language: index ? "es" : "es-en", goldStatus: "approved", sourceType: "local-human-reference", format: "wav", sensitivity: "local-sensitive", versionPolicy: "gitignored-artifact", audioArtifactPath, goldRef, storageRoot: "workspace" });
  }
  return { root, catalog };
}
function options(root: string, catalog: readonly LocalHumanCorpusCatalogEntry[]) { return { workspaceRoot: root, catalog, backendBaseUrl: "https://product.example", deviceId: "private-device", allowProviderCalls: true, maxRequests: GATE_A_REQUEST_CAP, maxCostUsd: GATE_A_COST_CAP_USD, runId: "gate-a-test", executionId: "00000000-0000-4000-8000-000000000001", definitionHash: GATE_A_DEFINITION_HASH } as const; }
function metadataReceipt() { return { status: "observed", redacted: true, bounds: { maxWords: 500, maxSegments: 100 }, counts: { words: 2, segments: 1, droppedWords: 0, droppedSegments: 0 }, durationMs: 1000, noSpeechProbability: 0.7, averageLogProbability: -1.1 }; }
function privateMetadata(suffix: string) {
  return {
    words: [{ word: `PRIVATE-WORD-${suffix}`, start: 0, end: 0.4 }, { word: `PRIVATE-WORD-SECOND-${suffix}`, start: 0.4, end: 0.8 }],
    segments: [{ text: `PRIVATE-SEGMENT-${suffix}`, start: 0, end: 0.8, no_speech_prob: 0.7, avg_logprob: -1.1 }],
  };
}
afterEach(async () => { await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("Gate A product matrix", () => {
  it("redacts unknown headers", () => {
    expect(safeProductHeaders(new Headers({ "x-fixvox-engine-id": "stt-groq", "x-fixvox-cost-usd": "0.004", "x-fixvox-proxy-total-ms": "12.5", authorization: "secret" }))).toEqual({ engine: "stt-groq", costUsd: 0.004, timingsMs: { "proxy-total": 12.5 } });
  });
  it("counts aligned omissions and additions even when token lengths are equal", () => {
    expect(scoreTranscript("alpha beta gamma", "alpha novel gamma").semanticSafety).toMatchObject({
      omissions: 1,
      additions: 1,
    });
  });
  it.each([
    { allowProviderCalls: false, maxRequests: 12, maxCostUsd: 0.005 },
    { allowProviderCalls: true, maxRequests: 11, maxCostUsd: 0.005 },
    { allowProviderCalls: true, maxRequests: 12, maxCostUsd: 0.004 },
    { allowProviderCalls: true, maxRequests: 13, maxCostUsd: 0.005 },
    { allowProviderCalls: true, maxRequests: 12, maxCostUsd: 0.006 },
  ])("performs zero fetch for an incorrect gate: %j", async (gate) => {
    const { root, catalog } = await createWorkspace(); const fetchImpl = vi.fn<typeof fetch>();
    const result = await runProductBaseline({ ...options(root, catalog), ...gate, fetchImpl });
    expect(result).toMatchObject({ ok: false, requestCount: 0, error: "provider-call-gate-required" }); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("makes one context request plus twelve sequential requests and prepares audio once per sample", async () => {
    const { root, catalog } = await createWorkspace(); const calls: Array<{ operationId: string; recipeId: string }> = []; let active = 0; let maximumActive = 0; const prep = vi.fn(async ({ fallbackDurationMs }: { fallbackDurationMs: number }) => ({ bytes: Buffer.from("prepared"), format: "mp3" as const, mimeType: "audio/mpeg" as const, fileName: "recording.mp3" as const, source: "ffmpeg-mp3" as const, durationMs: fallbackDurationMs, prepMs: 7 }));
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).endsWith("/desktop/context")) return Response.json({ data: { profile: { key: "pro", version: 1 }, capabilities: { transcription: true }, authority: { mode: "cloud" } } });
      active += 1; maximumActive = Math.max(maximumActive, active); await Promise.resolve();
      const metadata = JSON.parse(String((init?.body as FormData).get("metadata"))) as { operationId: string; evaluationRecipeId: string; durationMs: number };
      expect(Object.keys(metadata).sort()).toEqual(["durationMs", "evaluationRecipeId", "operationId"]); expect((init?.body as FormData).has("prompt")).toBe(false); expect((init?.body as FormData).has("model")).toBe(false); calls.push({ operationId: metadata.operationId, recipeId: metadata.evaluationRecipeId }); active -= 1;
      const response = Response.json({ data: { operationId: metadata.operationId, evaluationRecipeId: metadata.evaluationRecipeId, text: `PRIVATE-RAW-${calls.length}`, sttMetadata: metadataReceipt(), sttMetadataPrivate: privateMetadata(String(calls.length)) } }, { headers: calls.length === 1 ? { "x-fixvox-engine-id": "stt-groq-whisper-turbo", "x-fixvox-prompt-id": metadata.evaluationRecipeId } : {} });
      return response;
    });
    const result = await runProductBaseline({ ...options(root, catalog), fetchImpl, audioPrepImpl: prep });
    expect(result).toMatchObject({ ok: true, requestCount: 12 }); expect(fetchImpl).toHaveBeenCalledTimes(13); expect(prep).toHaveBeenCalledTimes(3); expect(maximumActive).toBe(1);
    expect(calls.map(({ recipeId }) => recipeId)).toEqual(productBaselineSamples.flatMap(() => gateAEvaluationRecipeIds)); expect(new Set(calls.map(({ operationId }) => operationId)).size).toBe(12);
    const publicFiles = await Promise.all(["run.json", "results.jsonl", "summary.json", "context.json"].map((name) => readFile(join(root, "artifacts/transcription-quality/gate-a-test", name), "utf8"))); const publicText = publicFiles.join("\n");
    expect(publicText).not.toContain("PRIVATE-RAW"); expect(publicText).not.toContain("PRIVATE-GOLD"); expect(publicText).not.toContain("PRIVATE-WORD"); expect(publicText).not.toContain("PRIVATE-SEGMENT"); expect(publicText).not.toContain("private-device"); expect(publicText).not.toContain("https://product.example");
    const results = publicFiles[1].trim().split("\n").map((line) => JSON.parse(line)); expect(results).toHaveLength(12); expect(new Set(results.map((item) => `${item.sampleId}:${item.candidateId}`)).size).toBe(12);
    expect(results.every((item) => item.identity.configured.sttProvider === "server-owned" && item.identity.configured.sttPromptSha256 === undefined && item.identity.resolved.sttProvider === "groq" && item.identity.resolved.sttModel === "whisper-large-v3-turbo" && /^[a-f0-9]{64}$/.test(item.identity.resolved.sttPromptSha256) && item.stages.postprocess.status === "off" && item.stages.vocabulary.status === "off" && item.stages.stt.metadata.redacted === true && !("words" in item.stages.stt.metadata) && !("segments" in item.stages.stt.metadata))).toBe(true);
    expect(results[0].identity.observed).toEqual({ sttEngineId: "stt-groq-whisper-turbo", sttPromptId: gateAEvaluationRecipeIds[0] });
    expect(results[0].identity.observed).not.toHaveProperty("sttProvider");
    expect(results[0].identity.observed).not.toHaveProperty("sttModel");
    expect(results[0].identity.observed).not.toHaveProperty("sttPromptSha256");
    expect(results[1].identity).not.toHaveProperty("observed");
    const persistedMetadata = await Promise.all(results.map((item) => readFile(join(root, ...item.stages.stt.metadata.privateRef.split("/")), "utf8").then(JSON.parse)));
    expect(persistedMetadata).toHaveLength(12);
    expect(persistedMetadata.every((item) => item.words.length === 2 && item.segments.length === 1 && item.noSpeechProbability === 0.7 && item.averageLogProbability === -1.1)).toBe(true);
    expect(persistedMetadata[0].words[0].word).toBe("PRIVATE-WORD-1");
    expect(persistedMetadata[0].segments[0].text).toBe("PRIVATE-SEGMENT-1");
  });
  it("stops on the first provider error", async () => {
    const { root, catalog } = await createWorkspace(); let productCalls = 0; const fetchImpl = vi.fn<typeof fetch>(async (input, init) => { if (String(input).endsWith("/desktop/context")) return Response.json({ data: { capabilities: { transcription: true } } }); productCalls += 1; if (productCalls === 3) return Response.json({ ok: false, error: { code: "invalid_request", category: "evaluationRecipeId", message: "private detail", retryable: false } }, { status: 400 }); const metadata = JSON.parse(String((init?.body as FormData).get("metadata"))) as { operationId: string; evaluationRecipeId: string }; return Response.json({ data: { operationId: metadata.operationId, evaluationRecipeId: metadata.evaluationRecipeId, text: "private", sttMetadata: metadataReceipt(), sttMetadataPrivate: privateMetadata(String(productCalls)) } }); });
    const result = await runProductBaseline({ ...options(root, catalog), fetchImpl, audioPrepImpl: async ({ fallbackDurationMs }) => ({ bytes: Buffer.from("prepared"), format: "mp3", mimeType: "audio/mpeg", fileName: "recording.mp3", source: "ffmpeg-mp3", durationMs: fallbackDurationMs, prepMs: 0 }) });
    expect(result).toMatchObject({ ok: false, requestCount: 3, error: "transcription-http-400", failure: { status: 400, code: "invalid_request", category: "evaluationRecipeId", retryable: false } }); expect(JSON.stringify(result)).not.toContain("private detail"); expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
