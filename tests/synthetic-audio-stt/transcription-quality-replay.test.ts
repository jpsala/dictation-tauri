import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GATE_B_COST_CAP_USD, GATE_B_REQUEST_CAP, planGateBPostprocess, replayTranscriptionQualityLocally, runGateBPostprocess } from "../../scripts/transcription-quality-replay";
import { gateAEvaluationRecipeIds, productBaselineSamples } from "../../scripts/transcription-quality-product-baseline";
import type { PersonalVocabularySnapshot } from "../../src/personal-vocabulary";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
describe("Wave 2 provider-free replay", () => {
  it("reuses raw refs, applies local vocabulary variants, and only plans postprocess", async () => {
    const root = await mkdtemp(join(tmpdir(), "tq-replay-")); roots.push(root); const rawRef = "artifacts/transcription-quality/source/private/sample-a/recipe-a/raw.txt"; const sourceResultsPath = "artifacts/transcription-quality/source/results.jsonl";
    await mkdir(join(root, ...rawRef.split("/").slice(0, -1)), { recursive: true }); await writeFile(join(root, ...rawRef.split("/")), "private acme transcript\n");
    await writeFile(join(root, ...sourceResultsPath.split("/")), `${JSON.stringify({ sampleId: "sample-a", candidateId: "recipe-a", text: { rawTranscriptRef: rawRef } })}\n`);
    const vocabulary: PersonalVocabularySnapshot = { revision: "1", rules: [{ id: "acme", revision: "1", spoken: "acme", mode: "automatic", enabled: true, candidates: [{ id: "canonical", written: "ACME" }], defaultCandidateId: "canonical", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }, { id: "transcript", revision: "1", spoken: "transcript", mode: "ask", enabled: true, candidates: [{ id: "canonical", written: "TRANSCRIPT" }], defaultCandidateId: "canonical", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }] };
    const fetchImpl = vi.fn<typeof fetch>(); const result = await replayTranscriptionQualityLocally({ workspaceRoot: root, sourceResultsPath, runId: "replay-run", vocabulary, fetchImpl });
    expect(result).toMatchObject({ ok: true, providerCalls: 0, sttCalls: 0 }); expect(fetchImpl).not.toHaveBeenCalled(); expect(result.results).toHaveLength(3);
    expect(result.results.map(({ vocabularyMode, vocabularyStatus }) => [vocabularyMode, vocabularyStatus])).toEqual([["off", "off"], ["automatic", "changed"], ["ask", "waiting-for-choice"]]);
    expect(await readFile(join(root, ...result.results[1].finalRef.split("/")), "utf8")).toContain("ACME");
    expect(result.results.every(({ postprocess }) => postprocess.status === "blocked" && postprocess.providerCalls === 0 && postprocess.plannedRequests === 6 && postprocess.outputRef === null)).toBe(true);
    const publicArtifact = await readFile(join(root, ...result.artifactPath.split("/")), "utf8"); expect(publicArtifact).not.toContain("private acme transcript"); expect(publicArtifact).not.toContain("ACME");
  });

  it("requires the exact Gate B provider-call gate before reading sources or dispatching", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await runGateBPostprocess({
      sourceResultsPath: "missing.jsonl",
      backendBaseUrl: "https://fixture.test",
      deviceId: "fixture-device",
      fetchImpl,
    });
    expect(result).toMatchObject({ ok: false, requestCount: 0, error: "provider-call-gate-required" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("runs exactly three raws through the two server-owned Gate B variants and redacts public artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "tq-gate-b-"));
    roots.push(root);
    const sourceResultsPath = "artifacts/transcription-quality/source/results.jsonl";
    await mkdir(join(root, "artifacts", "transcription-quality", "source"), { recursive: true });
    const sourceRows = [];
    for (const [index, sample] of productBaselineSamples.entries()) {
      const sampleId = sample.id;
      const goldRef = `artifacts/transcription-quality/source/private/gold/${sampleId}.txt`;
      await mkdir(join(root, "artifacts", "transcription-quality", "source", "private", "gold"), { recursive: true });
      await writeFile(join(root, ...goldRef.split("/")), `Clean ACME transcript ${index + 1}.\n`);
      for (const recipeId of gateAEvaluationRecipeIds) {
        const privateRoot = `artifacts/transcription-quality/source/private/${sampleId}/${recipeId}`;
        const rawRef = `${privateRoot}/raw.txt`;
        const metadataRef = `${privateRoot}/stt-metadata.json`;
        await mkdir(join(root, ...privateRoot.split("/")), { recursive: true });
        await writeFile(join(root, ...rawRef.split("/")), `private acme transcript ${index + 1}\n`);
        await writeFile(join(root, ...metadataRef.split("/")), JSON.stringify({ words: [{ word: "transcript", start: 0, end: 1.2 }], segments: [] }));
        sourceRows.push({
          sampleId,
          candidateId: recipeId,
          text: { rawTranscriptRef: rawRef, goldRef },
          stages: { stt: { metadata: { status: "observed", privateRef: metadataRef } } },
        });
      }
    }
    await writeFile(join(root, ...sourceResultsPath.split("/")), `${sourceRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
    const requests: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(request);
      const recipeId = String(request.evaluationRecipeId);
      const withProsody = recipeId.endsWith("-prosody");
      const input = request.input as Record<string, unknown>;
      const raw = String(input.transcript);
      const semanticSafety = withProsody
        ? {
            decision: "fallback",
            reasons: ["material_omission", "unsupported_addition", "semantic_transformation"],
            alignment: { rawTokenCount: 4, candidateTokenCount: 7, matched: 1, omissions: 3, additions: 6, trailingOmissions: 0 },
            redacted: true,
          }
        : {
            decision: "accepted",
            reasons: [],
            alignment: { rawTokenCount: 4, candidateTokenCount: 4, matched: 4, omissions: 0, additions: 0, trailingOmissions: 0 },
            redacted: true,
          };
      return Response.json({
        ok: true,
        data: {
          operationId: request.operationId,
          kind: "postprocess",
          output: { text: `${raw}.` },
          semanticSafety,
          evaluationRecipe: {
            id: recipeId,
            version: "v1",
            variant: withProsody ? "with-prosody" : "without-prosody",
            provider: "groq",
            model: "openai/gpt-oss-120b",
            promptId: "managed-postprocess-v1",
          },
        },
      });
    });
    const plan = await planGateBPostprocess({ workspaceRoot: root, sourceResultsPath });
    expect(plan).toMatchObject({ ok: true, providerCalls: 0, plannedRequests: 6, costCapUsd: 0.005 });
    expect(plan.estimatedMaxCostUsd).toBeLessThan(0.005);
    expect(plan.samples).toHaveLength(3);

    const result = await runGateBPostprocess({
      workspaceRoot: root,
      sourceResultsPath,
      backendBaseUrl: "https://fixture.test",
      deviceId: "fixture-device",
      runId: "gate-b-test",
      allowProviderCalls: true,
      maxRequests: GATE_B_REQUEST_CAP,
      maxCostUsd: GATE_B_COST_CAP_USD,
      executionId: "00000000-0000-4000-8000-000000000002",
      definitionHash: "b".repeat(64),
      fetchImpl,
    });
    expect(result).toMatchObject({ ok: true, requestCount: 6 });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(requests.filter((request) => JSON.stringify(request).includes("prosodyHints"))).toHaveLength(3);
    expect(requests.every((request) => !JSON.stringify(request).includes("audio"))).toBe(true);
    const publicArtifact = await readFile(join(root, ...result.artifacts!.summaryPath.split("/")), "utf8");
    expect(publicArtifact).not.toContain("private acme transcript");
    expect(publicArtifact).not.toContain("advisory pause");
    expect(result.results?.every(({ identity }) => identity.resolved.model === "openai/gpt-oss-120b")).toBe(true);
    expect(result.results?.filter(({ variant }) => variant === "without-prosody").every(({ semanticSafety, scores }) => semanticSafety.decision === "accepted" && scores.semanticSafety.instructionFollowing === 1)).toBe(true);
    expect(result.results?.filter(({ variant }) => variant === "with-prosody").every(({ semanticSafety, scores }) => semanticSafety.decision === "fallback" && scores.semanticSafety.instructionFollowing === 0 && scores.semanticSafety.omissions === 3 && scores.semanticSafety.additions === 6)).toBe(true);
  });
});
