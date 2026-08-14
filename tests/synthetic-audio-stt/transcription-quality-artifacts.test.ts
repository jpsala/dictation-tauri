import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createTranscriptionQualitySummary,
  renderTranscriptionQualityArtifacts,
  writeTranscriptionQualityArtifacts,
} from "../../scripts/transcription-quality-artifacts";
import {
  createProviderFreeQualityArtifactInput,
  runProviderFreeTranscriptionQuality,
} from "../../scripts/transcription-quality-provider-free";
import type { TranscriptionQualityCorpusManifest } from "../../src/test-fixtures/synthetic-audio-manifest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

async function createTemporaryWorkspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "dictation-tq-"));
  temporaryDirectories.push(path);
  return path;
}

describe("Batch 1A transcription-quality artifacts", () => {
  it("renders equivalent provider-free runs deterministically except isolated timestamps", () => {
    const first = createProviderFreeQualityArtifactInput({ runId: "equivalent-run" });
    const second = createProviderFreeQualityArtifactInput({ runId: "equivalent-run" });
    const firstRendered = renderTranscriptionQualityArtifacts({
      ...first,
      run: {
        ...first.run,
        startedAt: "2026-08-12T10:00:00.000Z",
        finishedAt: "2026-08-12T10:00:01.000Z",
      },
    });
    const secondRendered = renderTranscriptionQualityArtifacts({
      ...second,
      run: {
        ...second.run,
        startedAt: "2026-08-12T11:00:00.000Z",
        finishedAt: "2026-08-12T11:00:01.000Z",
      },
    });

    expect(firstRendered.runJson).not.toBe(secondRendered.runJson);
    expect(firstRendered.resultsJsonl).toBe(secondRendered.resultsJsonl);
    expect(firstRendered.summaryJson).toBe(secondRendered.summaryJson);
    expect(firstRendered.deterministicProjection).toBe(
      secondRendered.deterministicProjection,
    );
  });

  it("keeps raw and final refs separate and reconstructs bounded ordered JSONL", () => {
    const input = createProviderFreeQualityArtifactInput();
    const rendered = renderTranscriptionQualityArtifacts(input);
    const reconstructed = rendered.resultsJsonl
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(reconstructed).toHaveLength(input.corpus.samples.length);
    expect(reconstructed.map((result) => result.sampleId)).toEqual(
      input.run.sampleIds,
    );
    expect(
      reconstructed.every(
        (result) =>
          result.text.rawTranscriptRef !== result.text.finalTextRef,
      ),
    ).toBe(true);
    expect(new Set(reconstructed.map((result) => result.sampleId)).size).toBe(
      input.corpus.samples.length,
    );
  });

  it("redacts local-sensitive gold/raw/final sentinels from summaries and public receipts", () => {
    const sentinelGold = "PRIVATE-GOLD-SENTINEL-81f2";
    const sentinelRaw = "PRIVATE-RAW-SENTINEL-1b7a";
    const sentinelFinal = "PRIVATE-FINAL-SENTINEL-c593";
    const base = createProviderFreeQualityArtifactInput().corpus.samples[0];
    const corpus: TranscriptionQualityCorpusManifest = {
      schemaVersion: 1,
      corpusId: "local-sensitive-contract",
      corpusVersion: "1",
      samples: [
        {
          id: "local-sensitive-1",
          language: base.language,
          audioArtifactPath:
            "docs/reference/ops/audio/human/local-sensitive-1.wav",
          audioSha256: base.audioSha256,
          sourceType: "local-human-reference",
          format: base.format,
          categories: base.categories,
          difficulty: base.difficulty,
          goldRef:
            "artifacts/transcription-quality/corpus/local-sensitive-1/gold.txt",
          goldStatus: "provisional",
          sensitivity: "local-sensitive",
          versionPolicy: "gitignored-artifact",
        },
      ],
    };
    const input = createProviderFreeQualityArtifactInput({
      runId: "local-sensitive-redaction",
      corpus,
      textBySampleId: {
        "local-sensitive-1": {
          gold: sentinelGold,
          raw: sentinelRaw,
          final: sentinelFinal,
        },
      },
    });
    const rendered = renderTranscriptionQualityArtifacts(input);
    const publicReceipt = `${rendered.runJson}${rendered.resultsJsonl}${rendered.summaryJson}`;

    expect(publicReceipt).not.toContain(sentinelGold);
    expect(publicReceipt).not.toContain(sentinelRaw);
    expect(publicReceipt).not.toContain(sentinelFinal);
    expect(JSON.parse(rendered.summaryJson).samples[0].textLengths).toEqual({
      final: sentinelFinal.length,
      gold: sentinelGold.length,
      raw: sentinelRaw.length,
    });
  });

  it("writes run.json, incremental results.jsonl, and derived summary.json", async () => {
    const workspaceRoot = await createTemporaryWorkspace();
    const result = await runProviderFreeTranscriptionQuality({
      runId: "writer-smoke",
      workspaceRoot,
    });
    const [runJson, resultsJsonl, summaryJson] = await Promise.all([
      readFile(join(workspaceRoot, result.artifacts.runPath), "utf8"),
      readFile(join(workspaceRoot, result.artifacts.resultsPath), "utf8"),
      readFile(join(workspaceRoot, result.artifacts.summaryPath), "utf8"),
    ]);

    expect(result.providerCalls).toEqual({ enabled: false, maxRequests: 0 });
    expect(JSON.parse(runJson).providerCalls).toEqual({
      enabled: false,
      maxRequests: 0,
    });
    expect(resultsJsonl.trimEnd().split("\n")).toHaveLength(2);
    expect(JSON.parse(summaryJson)).toEqual(
      createTranscriptionQualitySummary(
        createProviderFreeQualityArtifactInput({ runId: "writer-smoke" }),
      ),
    );
  });

  it("raw replay keeps source run/sample and performs no provider call", async () => {
    const workspaceRoot = await createTemporaryWorkspace();
    const input = createProviderFreeQualityArtifactInput({
      runId: "raw-replay",
      rawSourceBySampleId: {
        "en-clean-note": {
          kind: "reused",
          sourceRunId: "source-run",
          sourceSampleId: "en-clean-note",
        },
      },
    });
    const written = await writeTranscriptionQualityArtifacts(input, {
      workspaceRoot,
    });
    const stored = (await readFile(join(workspaceRoot, written.resultsPath), "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(stored[0].rawSource).toEqual({
      kind: "reused",
      sourceRunId: "source-run",
      sourceSampleId: "en-clean-note",
    });
    expect(input.run.providerCalls).toEqual({ enabled: false, maxRequests: 0 });
    expect(input.results[0].timingsMs.stt).toBe(0);
    expect(input.results[0].costUsd).toEqual({
      total: 0,
      source: "provider-free-no-call",
    });
  });
});
