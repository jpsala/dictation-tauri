import { describe, expect, it } from "vitest";

import {
  syntheticAudioCorpusManifest,
  syntheticAudioFixtures,
  type TranscriptionQualityCorpusManifest,
} from "../../src/test-fixtures/synthetic-audio-manifest";
import {
  TranscriptionQualityValidationError,
  validateTranscriptionQualityCandidate,
  validateTranscriptionQualityCorpusManifest,
  validateTranscriptionQualityRunResults,
  type TranscriptionQualityValidationCode,
} from "../../src/test-fixtures/transcription-quality-contract";
import {
  createProviderFreeQualityArtifactInput,
  providerFreeTranscriptionQualityCandidate,
} from "../../scripts/transcription-quality-provider-free";

function expectValidationCode(
  action: () => void,
  code: TranscriptionQualityValidationCode,
): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(TranscriptionQualityValidationError);
    expect((error as TranscriptionQualityValidationError).code).toBe(code);
    return;
  }
  throw new Error(`Expected validation error ${code}.`);
}

function patchedManifest(
  patch: Record<string, unknown>,
): TranscriptionQualityCorpusManifest {
  const [first, second] = syntheticAudioCorpusManifest.samples;
  return {
    ...syntheticAudioCorpusManifest,
    samples: [{ ...first, ...patch }, second],
  } as TranscriptionQualityCorpusManifest;
}

describe("Batch 1A transcription-quality contract", () => {
  it("validates the versioned corpus containing both existing synthetic fixtures", () => {
    expect(() =>
      validateTranscriptionQualityCorpusManifest(syntheticAudioCorpusManifest),
    ).not.toThrow();
    expect(syntheticAudioCorpusManifest).toMatchObject({
      schemaVersion: 1,
      corpusId: "synthetic-audio-stt",
      corpusVersion: "1.0.0",
      samples: syntheticAudioFixtures,
    });
    expect(syntheticAudioCorpusManifest.samples).toHaveLength(2);
  });

  it.each([
    ["invalid id", { id: "../escape" }, "INVALID_ID"],
    ["invalid hash", { audioSha256: "abc" }, "INVALID_SHA256"],
    ["zero placeholder hash", { audioSha256: "0".repeat(64) }, "INVALID_SHA256"],
    ["absolute POSIX audio path", { audioArtifactPath: "/tmp/audio.wav" }, "INVALID_PATH"],
    ["absolute Windows audio path", { audioArtifactPath: "C:/private/audio.wav" }, "INVALID_PATH"],
    ["audio traversal", { audioArtifactPath: "artifacts/transcription-quality/../audio.wav" }, "INVALID_PATH"],
    ["audio outside allowlist", { audioArtifactPath: "artifacts/other/audio.wav" }, "PATH_OUTSIDE_ALLOWLIST"],
    ["gold traversal", { goldRef: "src/test-fixtures/../private.txt" }, "INVALID_PATH"],
    ["gold outside allowlist", { goldRef: "docs/private.txt" }, "PATH_OUTSIDE_ALLOWLIST"],
  ] as const)("rejects %s", (_name, patch, code) => {
    expectValidationCode(
      () => validateTranscriptionQualityCorpusManifest(patchedManifest(patch)),
      code,
    );
  });

  it.each([
    {
      sourceType: "generated-tts",
      sensitivity: "local-sensitive",
      versionPolicy: "versioned-metadata",
    },
    {
      sourceType: "local-human-reference",
      sensitivity: "local-sensitive",
      versionPolicy: "temporary",
    },
    {
      sourceType: "external-reference",
      sensitivity: "unknown",
      versionPolicy: "versioned-metadata",
    },
  ] as const)(
    "rejects incoherent sourceType/sensitivity/versionPolicy %#",
    (patch) => {
      expectValidationCode(
        () =>
          validateTranscriptionQualityCorpusManifest(patchedManifest(patch)),
        "SOURCE_POLICY_MISMATCH",
      );
    },
  );

  it("rejects approved gold with unknown sensitivity", () => {
    expectValidationCode(
      () =>
        validateTranscriptionQualityCorpusManifest(
          patchedManifest({
            sourceType: "external-reference",
            sensitivity: "unknown",
            versionPolicy: "temporary",
            goldStatus: "approved",
            goldRef: "artifacts/transcription-quality/corpus/unknown/gold.txt",
          }),
        ),
      "GOLD_POLICY_MISMATCH",
    );
  });

  it("keeps configured, resolved, and observed distinct without inferring observed", () => {
    const input = createProviderFreeQualityArtifactInput();
    expect(() =>
      validateTranscriptionQualityCandidate(
        providerFreeTranscriptionQualityCandidate,
      ),
    ).not.toThrow();
    expect(input.candidates[0].recipe.configured).toBeDefined();
    expect(input.candidates[0].recipe.resolved).toBeDefined();
    expect(input.candidates[0].recipe).not.toHaveProperty("observed");
    expect(input.run.candidates[0].configured).toBeDefined();
    expect(input.run.candidates[0].resolved).toBeDefined();
    expect(input.run.candidates[0]).not.toHaveProperty("observed");
    for (const result of input.results) {
      expect(result.identity.configured).toBeDefined();
      expect(result.identity.resolved).toBeDefined();
      expect(result.identity).not.toHaveProperty("observed");
    }
  });

  it("rejects duplicate/out-of-corpus samples and collapsed raw/final refs", () => {
    const input = createProviderFreeQualityArtifactInput();
    expectValidationCode(
      () =>
        validateTranscriptionQualityRunResults(
          { ...input.run, sampleIds: [input.run.sampleIds[0], input.run.sampleIds[0]] },
          input.corpus,
          input.candidates,
          input.results,
        ),
      "DUPLICATE_SAMPLE",
    );
    expectValidationCode(
      () =>
        validateTranscriptionQualityRunResults(
          { ...input.run, sampleIds: [...input.run.sampleIds, "not-in-corpus"] },
          input.corpus,
          input.candidates,
          input.results,
        ),
      "SAMPLE_OUTSIDE_RUN",
    );
    expectValidationCode(
      () =>
        validateTranscriptionQualityRunResults(
          input.run,
          input.corpus,
          input.candidates,
          [
            {
              ...input.results[0],
              text: {
                ...input.results[0].text,
                finalTextRef: input.results[0].text.rawTranscriptRef,
              },
            },
            input.results[1],
          ],
        ),
      "COLLAPSED_TEXT_REFS",
    );
  });

  it("accepts explicit bounded provider calls, rejects unauthorized calls, and accepts raw replay", () => {
    const replay = createProviderFreeQualityArtifactInput({
      rawSourceBySampleId: {
        [syntheticAudioFixtures[0].id]: {
          kind: "reused",
          sourceRunId: "source-run-1",
          sourceSampleId: syntheticAudioFixtures[0].id,
        },
      },
    });
    expect(replay.results[0].rawSource).toEqual({
      kind: "reused",
      sourceRunId: "source-run-1",
      sourceSampleId: syntheticAudioFixtures[0].id,
    });
    expect(replay.run.providerCalls).toEqual({ enabled: false, maxRequests: 0 });
    expect(() =>
      validateTranscriptionQualityRunResults(
        replay.run,
        replay.corpus,
        replay.candidates,
        replay.results,
      ),
    ).not.toThrow();

    expectValidationCode(
      () =>
        validateTranscriptionQualityRunResults(
          {
            ...replay.run,
            providerCalls: {
              enabled: true,
              maxRequests: 1,
              maxCostUsd: 0.01,
              authorization: "implicit",
            } as never,
          },
          replay.corpus,
          replay.candidates,
          replay.results,
        ),
      "PROVIDER_CALLS_DISALLOWED",
    );
  });
});
