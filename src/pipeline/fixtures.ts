import { simulatedDictationFixtures } from "../test-fixtures/simulated-dictation";
import { syntheticAudioFixtures } from "../test-fixtures/synthetic-audio-manifest";
import type { SyntheticAudioFixture } from "../test-fixtures/synthetic-audio-manifest";
import type { RedactedPipelineError, SimulatedFixture } from "./types";

const fixturesById: ReadonlyMap<string, SimulatedFixture> = new Map(
  simulatedDictationFixtures.map((fixture) => [fixture.id, fixture]),
);

const syntheticAudioFixturesById: ReadonlyMap<string, SyntheticAudioFixture> =
  new Map(syntheticAudioFixtures.map((fixture) => [fixture.id, fixture]));

export function listSimulatedFixtures(): readonly SimulatedFixture[] {
  return simulatedDictationFixtures;
}

export function listSyntheticAudioFixtures(): readonly SyntheticAudioFixture[] {
  return syntheticAudioFixtures;
}

export function getSimulatedFixture(
  fixtureId: string,
): SimulatedFixture | undefined {
  return fixturesById.get(fixtureId);
}

export function getSyntheticAudioFixture(
  fixtureId: string,
): SyntheticAudioFixture | undefined {
  return syntheticAudioFixturesById.get(fixtureId);
}

export function requireSimulatedFixture(fixtureId: string): SimulatedFixture {
  const fixture = getSimulatedFixture(fixtureId);

  if (!fixture) {
    throw createMissingFixtureError(fixtureId);
  }

  return fixture;
}

export function requireSyntheticAudioFixture(
  fixtureId: string,
): SyntheticAudioFixture {
  const fixture = getSyntheticAudioFixture(fixtureId);

  if (!fixture) {
    throw createMissingSyntheticAudioFixtureError(fixtureId);
  }

  return fixture;
}

export function createMissingFixtureError(
  fixtureId: string,
): RedactedPipelineError {
  return {
    phase: "fixture",
    message: `Unknown simulated fixture: ${fixtureId}`,
  };
}

export function createMissingSyntheticAudioFixtureError(
  fixtureId: string,
): RedactedPipelineError {
  return {
    phase: "fixture",
    message: `Unknown synthetic audio fixture: ${fixtureId}`,
  };
}
