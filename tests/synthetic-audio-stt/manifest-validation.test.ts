import { describe, expect, it } from "vitest";
import {
  syntheticAudioFixtures,
} from "../../src/test-fixtures/synthetic-audio-manifest";
import {
  createSyntheticAudioArtifactPolicy,
  evaluateSyntheticAudioArtifactSetup,
  syntheticAudioArtifactDirectories,
  syntheticAudioArtifactRoot,
  validateSyntheticAudioArtifactPath,
} from "../../src/test-fixtures/synthetic-audio-artifacts";
import {
  getSyntheticAudioFixture,
  listSyntheticAudioFixtures,
  requireSyntheticAudioFixture,
} from "../../src/pipeline/fixtures";

describe("synthetic audio fixture manifest scaffold", () => {
  it("defines the gitignored artifact policy without requiring audio files", () => {
    const policy = createSyntheticAudioArtifactPolicy();

    expect(policy).toEqual({
      artifactRoot: syntheticAudioArtifactRoot,
      allowedDirectories: Object.values(syntheticAudioArtifactDirectories),
      gitPolicy: "ignored",
    });
  });

  it("defines initial synthetic fixture entries with stable ids and expected text", () => {
    expect(syntheticAudioFixtures.length).toBeGreaterThanOrEqual(2);

    const fixtureIds = new Set<string>();

    for (const fixture of syntheticAudioFixtures) {
      expect(fixture.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(fixtureIds.has(fixture.id)).toBe(false);
      fixtureIds.add(fixture.id);

      expect(fixture.language.length).toBeGreaterThan(0);
      expect(fixture.expectedText.trim()).toBe(fixture.expectedText);
      expect(fixture.expectedText.length).toBeGreaterThan(10);
      expect(fixture.sourceType).toBe("generated-tts");
      expect(fixture.sensitivity).toBe("synthetic");
      expect(fixture.versionPolicy).toBe("versioned-metadata");
    }
  });

  it("validates fixture artifact paths without touching the filesystem", () => {
    for (const fixture of syntheticAudioFixtures) {
      expect(validateSyntheticAudioArtifactPath(fixture)).toMatchObject({
        ok: true,
        normalizedPath: fixture.audioArtifactPath,
      });
    }
  });

  it("reports missing local audio as setup state, not manifest failure", () => {
    const setupResults = syntheticAudioFixtures.map((fixture) =>
      evaluateSyntheticAudioArtifactSetup(fixture),
    );

    expect(setupResults).toEqual(
      syntheticAudioFixtures.map((fixture) => ({
        fixtureId: fixture.id,
        artifactPath: fixture.audioArtifactPath,
        exists: false,
        format: fixture.format,
        status: "setup-required",
        policy: createSyntheticAudioArtifactPolicy(fixture.versionPolicy),
        reason:
          "Audio artifact is missing; generate or restore local fixture audio.",
      })),
    );
  });

  it("wires synthetic fixtures into pipeline fixture lookup helpers", () => {
    const [fixture] = syntheticAudioFixtures;
    const missingFixtureId = "missing-synthetic-fixture";

    expect(listSyntheticAudioFixtures()).toBe(syntheticAudioFixtures);
    expect(getSyntheticAudioFixture(fixture.id)).toBe(fixture);
    expect(requireSyntheticAudioFixture(fixture.id)).toBe(fixture);
    expect(getSyntheticAudioFixture(missingFixtureId)).toBeUndefined();
    expect(() => requireSyntheticAudioFixture(missingFixtureId)).toThrow(
      `Unknown synthetic audio fixture: ${missingFixtureId}`,
    );
  });
});
