import { describe, expect, it } from "vitest";
import {
  syntheticAudioFixtures,
  type SyntheticAudioFixture,
} from "../../src/test-fixtures/synthetic-audio-manifest";
import {
  createSyntheticAudioArtifactPolicy,
  syntheticAudioArtifactDirectories,
  syntheticAudioArtifactRoot,
  validateSyntheticAudioArtifactPath,
} from "../../src/test-fixtures/synthetic-audio-artifacts";

describe("synthetic audio fixture manifest scaffold", () => {
  it("defines the gitignored artifact policy without requiring audio files", () => {
    const policy = createSyntheticAudioArtifactPolicy();

    expect(policy).toEqual({
      artifactRoot: syntheticAudioArtifactRoot,
      allowedDirectories: Object.values(syntheticAudioArtifactDirectories),
      gitPolicy: "ignored",
    });
  });

  it("allows Phase 2 to compile before fixture entries exist", () => {
    expect(syntheticAudioFixtures).toEqual([]);
  });

  it("validates fixture artifact paths without touching the filesystem", () => {
    const fixture = {
      id: "scaffold",
      language: "en",
      expectedText: "Synthetic scaffold text.",
      audioArtifactPath: "artifacts/synthetic-audio-stt/audio/scaffold.wav",
      sourceType: "generated-tts",
      format: "wav",
      sensitivity: "synthetic",
      versionPolicy: "versioned-metadata",
    } satisfies SyntheticAudioFixture;

    expect(validateSyntheticAudioArtifactPath(fixture)).toMatchObject({
      ok: true,
      normalizedPath: fixture.audioArtifactPath,
    });
  });
});
