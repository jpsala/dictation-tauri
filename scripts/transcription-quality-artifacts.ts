import { mkdir, open, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import {
  validateTranscriptionQualityRunResults,
  type TranscriptionQualityCandidate,
  type TranscriptionQualityCorpusManifest,
  type TranscriptionQualityRun,
  type TranscriptionQualitySampleResult,
} from "../src/test-fixtures/transcription-quality-contract";

export const transcriptionQualityArtifactRoot =
  "artifacts/transcription-quality";

export type TranscriptionQualityArtifactInput = {
  corpus: TranscriptionQualityCorpusManifest;
  candidates: readonly TranscriptionQualityCandidate[];
  run: TranscriptionQualityRun;
  results: readonly TranscriptionQualitySampleResult[];
};

export type WrittenTranscriptionQualityArtifacts = {
  root: string;
  runPath: string;
  resultsPath: string;
  summaryPath: string;
};
export type RenderedTranscriptionQualityArtifacts = {
  runJson: string;
  resultsJsonl: string;
  summaryJson: string;
  deterministicProjection: string;
};

type JsonObject = { readonly [key: string]: JsonValue };
type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | JsonObject;

function canonicalize(value: unknown): JsonValue {
  if (value === null || typeof value !== "object") {
    return value as JsonValue;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const output: Record<string, JsonValue> = {};
  for (const [key, entryValue] of entries) {
    output[key] = canonicalize(entryValue);
  }
  return output;
}

export function stableCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function prettyCanonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function runWithoutTimestamps(run: TranscriptionQualityRun): JsonObject {
  const { startedAt: _startedAt, finishedAt: _finishedAt, ...deterministic } = run;
  return canonicalize(deterministic) as JsonObject;
}

export function createTranscriptionQualitySummary(
  input: TranscriptionQualityArtifactInput,
): JsonObject {
  validateTranscriptionQualityRunResults(
    input.run,
    input.corpus,
    input.candidates,
    input.results,
  );

  const sampleById = new Map(
    input.corpus.samples.map((sample) => [sample.id, sample]),
  );
  const statusCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const sensitivityCounts: Record<string, number> = {};

  const samples = input.results.map((result) => {
    const sample = sampleById.get(result.sampleId);
    if (!sample) {
      throw new Error(`Validated sample missing from corpus: ${result.sampleId}`);
    }
    statusCounts[result.stages.stt.status] =
      (statusCounts[result.stages.stt.status] ?? 0) + 1;
    sensitivityCounts[sample.sensitivity] =
      (sensitivityCounts[sample.sensitivity] ?? 0) + 1;
    for (const category of sample.categories) {
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    }

    return {
      sampleId: result.sampleId,
      candidateId: result.candidateId,
      categories: sample.categories,
      difficulty: sample.difficulty,
      goldStatus: sample.goldStatus,
      sensitivity: sample.sensitivity,
      identity: result.identity,
      rawSource: result.rawSource,
      textRefs: {
        gold: result.text.goldRef,
        raw: result.text.rawTranscriptRef,
        final: result.text.finalTextRef,
      },
      textLengths: {
        gold: result.text.goldLength,
        raw: result.text.rawTranscriptLength,
        final: result.text.finalTextLength,
      },
      stages: result.stages,
      timingsMs: result.timingsMs,
      costUsd: result.costUsd,
      scores: result.scores,
      errorCodes: result.errors,
    };
  });

  return canonicalize({
    schemaVersion: 1,
    runId: input.run.runId,
    runnerVersion: input.run.runnerVersion,
    corpus: input.run.corpus,
    candidates: input.run.candidates,
    providerCalls: input.run.providerCalls,
    sampleCount: samples.length,
    counts: {
      sttStatus: statusCounts,
      categories: categoryCounts,
      sensitivity: sensitivityCounts,
    },
    samples,
  }) as JsonObject;
}

export function renderTranscriptionQualityArtifacts(
  input: TranscriptionQualityArtifactInput,
): RenderedTranscriptionQualityArtifacts {
  const summary = createTranscriptionQualitySummary(input);
  const resultLines = input.results.map(stableCanonicalJson);
  const resultsJsonl = resultLines.length > 0 ? `${resultLines.join("\n")}\n` : "";
  return {
    runJson: prettyCanonicalJson(input.run),
    resultsJsonl,
    summaryJson: prettyCanonicalJson(summary),
    deterministicProjection: stableCanonicalJson({
      run: runWithoutTimestamps(input.run),
      results: input.results,
      summary,
    }),
  };
}

function workspaceArtifactPath(
  workspaceRoot: string,
  runId: string,
): { absoluteRoot: string; relativeRoot: string } {
  const relativeRoot = `${transcriptionQualityArtifactRoot}/${runId}`;
  const absoluteRoot = join(workspaceRoot, ...relativeRoot.split("/"));
  const relativeToWorkspace = relative(workspaceRoot, absoluteRoot);
  if (
    relativeToWorkspace === ".." ||
    relativeToWorkspace.startsWith(`..${sep}`) ||
    relativeToWorkspace.includes("\0")
  ) {
    throw new Error("Transcription-quality artifact root escaped the workspace.");
  }
  return { absoluteRoot, relativeRoot };
}

export async function writeTranscriptionQualityArtifacts(
  input: TranscriptionQualityArtifactInput,
  options: { workspaceRoot?: string } = {},
): Promise<WrittenTranscriptionQualityArtifacts> {
  const summary = createTranscriptionQualitySummary(input);
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const { absoluteRoot, relativeRoot } = workspaceArtifactPath(
    workspaceRoot,
    input.run.runId,
  );
  await mkdir(absoluteRoot, { recursive: true });

  const runPath = join(absoluteRoot, "run.json");
  const resultsPath = join(absoluteRoot, "results.jsonl");
  const summaryPath = join(absoluteRoot, "summary.json");

  await writeFile(runPath, prettyCanonicalJson(input.run), "utf8");
  const resultsHandle = await open(resultsPath, "w");
  try {
    for (const result of input.results) {
      await resultsHandle.write(`${stableCanonicalJson(result)}\n`);
    }
  } finally {
    await resultsHandle.close();
  }
  await writeFile(summaryPath, prettyCanonicalJson(summary), "utf8");

  return {
    root: relativeRoot,
    runPath: `${relativeRoot}/run.json`,
    resultsPath: `${relativeRoot}/results.jsonl`,
    summaryPath: `${relativeRoot}/summary.json`,
  };
}
