import { createHash } from "node:crypto";

import {
  stableCanonicalJson,
  writeTranscriptionQualityArtifacts,
  type TranscriptionQualityArtifactInput,
  type WrittenTranscriptionQualityArtifacts,
} from "./transcription-quality-artifacts";
import {
  syntheticAudioCorpusManifest,
  type TranscriptionQualityCorpusManifest,
} from "../src/test-fixtures/synthetic-audio-manifest";
import type {
  TranscriptionQualityCandidate,
  TranscriptionQualityCandidateRecipe,
  TranscriptionQualityRawSource,
  TranscriptionQualityResultIdentity,
  TranscriptionQualitySampleResult,
} from "../src/test-fixtures/transcription-quality-contract";

const emptyPromptSha256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const providerFreeRecipe: TranscriptionQualityCandidateRecipe = {
  audioPrep: {
    mode: "fixture-reference",
    configHash: sha256(stableCanonicalJson({ mode: "fixture-reference" })),
  },
  stt: {
    provider: "provider-free",
    model: "manifest-expected-text",
    prompt: {
      id: "empty",
      version: "1",
      sha256: emptyPromptSha256,
      chars: 0,
    },
    language: "manifest",
    temperature: 0,
    responseFormat: "text",
    evaluationRecipeId: "prompt-short-auto",
    metadata: { mode: "none" },
  },
  materialization: {
    mode: "identity",
    configHash: sha256(stableCanonicalJson({ mode: "identity" })),
  },
  postprocess: null,
  vocabulary: { mode: "off" },
};

export const providerFreeTranscriptionQualityCandidate = {
  candidateId: "provider-free-manifest-replay",
  candidateVersion: "1",
  recipe: {
    configured: providerFreeRecipe,
    resolved: providerFreeRecipe,
  },
} as const satisfies TranscriptionQualityCandidate;

export type ProviderFreeSampleText = {
  gold: string;
  raw: string;
  final: string;
};

export type ProviderFreeQualityRunOptions = {
  runId?: string;
  corpus?: TranscriptionQualityCorpusManifest;
  textBySampleId?: Readonly<Record<string, ProviderFreeSampleText>>;
  rawSourceBySampleId?: Readonly<Record<string, TranscriptionQualityRawSource>>;
};

export function createProviderFreeQualityArtifactInput(
  options: ProviderFreeQualityRunOptions = {},
): TranscriptionQualityArtifactInput {
  const corpus: TranscriptionQualityCorpusManifest =
    options.corpus ?? syntheticAudioCorpusManifest;
  const runId = options.runId ?? "provider-free-synthetic-v1";
  const recipeHash = sha256(stableCanonicalJson(providerFreeRecipe));
  const candidateReceipt = {
    candidateId: providerFreeTranscriptionQualityCandidate.candidateId,
    candidateVersion: providerFreeTranscriptionQualityCandidate.candidateVersion,
    recipeHash,
    evaluationRecipeId: providerFreeRecipe.stt.evaluationRecipeId,
  };
  const run = {
    schemaVersion: 1,
    runId,
    runnerVersion: "1",
    corpus: {
      corpusId: corpus.corpusId,
      corpusVersion: corpus.corpusVersion,
    },
    candidates: [{
      configured: candidateReceipt,
      resolved: candidateReceipt,
    }],
    sampleIds: corpus.samples.map((sample) => sample.id),
    providerCalls: { enabled: false, maxRequests: 0 },
    resultPath: `artifacts/transcription-quality/${runId}/results.jsonl`,
  } as const;

  const results: TranscriptionQualitySampleResult[] = corpus.samples.map(
    (sample) => {
      const suppliedText = options.textBySampleId?.[sample.id];
      if (suppliedText === undefined && sample.expectedText === undefined) {
        throw new Error(
          `Provider-free replay requires explicit private text refs for ${sample.id}.`,
        );
      }
      const expectedText = sample.expectedText ?? "";
      const text = suppliedText ?? {
        gold: expectedText,
        raw: expectedText,
        final: expectedText,
      };
      const identity: TranscriptionQualityResultIdentity = {
        sttProvider: providerFreeRecipe.stt.provider,
        sttModel: providerFreeRecipe.stt.model,
        sttPromptSha256: providerFreeRecipe.stt.prompt.sha256,
        language: sample.language,
        responseFormat: providerFreeRecipe.stt.responseFormat,
      };
      return {
        schemaVersion: 1,
        runId,
        sampleId: sample.id,
        candidateId: providerFreeTranscriptionQualityCandidate.candidateId,
        audio: {
          sha256: sample.audioSha256,
          original: {
            format: sample.format,
            bytes: 0,
            durationMs: sample.durationMs ?? 0,
          },
          upload: {
            format: sample.format,
            bytes: 0,
            source: "provider-free-no-upload",
          },
        },
        identity: {
          configured: identity,
          resolved: identity,
        },
        rawSource:
          options.rawSourceBySampleId?.[sample.id] ?? { kind: "produced" },
        text: {
          goldRef: sample.goldRef,
          rawTranscriptRef: `artifacts/transcription-quality/${runId}/private/${sample.id}/raw.txt`,
          finalTextRef: `artifacts/transcription-quality/${runId}/private/${sample.id}/final.txt`,
          goldLength: text.gold.length,
          rawTranscriptLength: text.raw.length,
          finalTextLength: text.final.length,
        },
        stages: {
          stt: {
            status: "ok",
            metadata: { status: "not-observed", redacted: true },
          },
          materialization: {
            status: text.raw === text.final ? "kept" : "changed",
            reasons: text.raw === text.final ? ["provider_text_kept"] : ["whitespace_normalized"],
          },
          postprocess: { status: "off" },
          vocabulary: { status: "off" },
        },
        timingsMs: { audioPrep: 0, stt: 0, postprocess: 0, total: 0 },
        costUsd: { total: 0, source: "provider-free-no-call" },
        scores: {
          entities: { expected: 0, matched: 0, falseReplacements: 0, exactMatchRate: 1 },
          structure: { punctuation: 1, lists: 1 },
          semanticSafety: {
            omissions: 0,
            additions: 0,
            translationDrift: 0,
            intentDrift: 0,
            instructionFollowing: 1,
          },
        },
        errors: [],
      };
    },
  );

  return {
    corpus,
    candidates: [providerFreeTranscriptionQualityCandidate],
    run,
    results,
  };
}

export type ProviderFreeTranscriptionQualityRunResult = {
  ok: true;
  runId: string;
  sampleCount: number;
  providerCalls: { enabled: false; maxRequests: 0 };
  artifacts: WrittenTranscriptionQualityArtifacts;
};

export async function runProviderFreeTranscriptionQuality(
  options: ProviderFreeQualityRunOptions & { workspaceRoot?: string } = {},
): Promise<ProviderFreeTranscriptionQualityRunResult> {
  const input = createProviderFreeQualityArtifactInput(options);
  const artifacts = await writeTranscriptionQualityArtifacts(input, {
    workspaceRoot: options.workspaceRoot,
  });
  return {
    ok: true,
    runId: input.run.runId,
    sampleCount: input.results.length,
    providerCalls: input.run.providerCalls,
    artifacts,
  };
}
function readCliArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

if (import.meta.main) {
  const runId = readCliArgument("--run-id");
  if (!runId || !/^[A-Za-z0-9._-]{1,96}$/.test(runId) || process.argv.some((arg) => arg.startsWith("--") && arg !== "--run-id")) {
    process.exitCode = 2;
  } else {
    try {
      await runProviderFreeTranscriptionQuality({ runId });
    } catch {
      process.exitCode = 1;
    }
  }
}
