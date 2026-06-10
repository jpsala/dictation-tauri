import { simulatedDictationFixtures } from "../test-fixtures/simulated-dictation";
import type { RedactedPipelineError, SimulatedFixture } from "./types";

const fixturesById: ReadonlyMap<string, SimulatedFixture> = new Map(
  simulatedDictationFixtures.map((fixture) => [fixture.id, fixture]),
);

export function listSimulatedFixtures(): readonly SimulatedFixture[] {
  return simulatedDictationFixtures;
}

export function getSimulatedFixture(
  fixtureId: string,
): SimulatedFixture | undefined {
  return fixturesById.get(fixtureId);
}

export function requireSimulatedFixture(fixtureId: string): SimulatedFixture {
  const fixture = getSimulatedFixture(fixtureId);

  if (!fixture) {
    throw createMissingFixtureError(fixtureId);
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
