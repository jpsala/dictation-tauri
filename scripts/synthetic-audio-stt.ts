import { syntheticAudioFixtures } from "../src/test-fixtures/synthetic-audio-manifest";
import type { SyntheticAudioFixture } from "../src/test-fixtures/synthetic-audio-manifest";
import {
  createSyntheticAudioArtifactPolicy,
  evaluateSyntheticAudioArtifactSetup,
  syntheticAudioArtifactRoot,
} from "../src/test-fixtures/synthetic-audio-artifacts";
import { createDryRunTranscriptionAdapter } from "../src/model-gateway/mock";
import { PipelineService } from "../src/pipeline/service";
import type { SimulatedFixture } from "../src/pipeline/types";

type PlaceholderMode = "fixture-check" | "stt-dry-run";

const args = process.argv.slice(2);

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function readMode(): PlaceholderMode {
  const modeIndex = args.indexOf("--mode");
  const mode = modeIndex >= 0 ? args[modeIndex + 1] : undefined;

  if (mode === "fixture-check" || mode === "stt-dry-run") {
    return mode;
  }

  console.error(
    "Usage: bun scripts/synthetic-audio-stt.ts --mode <fixture-check|stt-dry-run> --dry-run",
  );
  process.exit(2);
}

if (!hasFlag("--dry-run")) {
  console.error("Only --dry-run placeholder commands are available in Phase 1.");
  process.exit(2);
}

const mode = readMode();
const artifactPolicy = createSyntheticAudioArtifactPolicy();

const result =
  mode === "fixture-check" ? createFixtureCheckResult() : await runSttDryRun();

console.log(JSON.stringify(result, null, 2));

function createFixtureCheckResult() {
  return {
    ok: true,
    mode,
    dryRun: true,
    artifactRoot: `${syntheticAudioArtifactRoot}/`,
    artifactPolicy,
    fixtureCount: syntheticAudioFixtures.length,
    providerCallsEnabled: false,
    audioRequired: false,
    fixtures: syntheticAudioFixtures.map((fixture) => ({
      id: fixture.id,
      language: fixture.language,
      expectedTextLength: fixture.expectedText.length,
      artifact: evaluateSyntheticAudioArtifactSetup(fixture),
    })),
  };
}

async function runSttDryRun() {
  const fixture = syntheticAudioFixtures[0];
  let tick = 1;
  const service = new PipelineService({
    createRunId: () => `synthetic-dry-run-${fixture.id}`,
    now: () => tick++,
    getFixture: (fixtureId) =>
      fixtureId === fixture.id ? toSimulatedFixture(fixture) : undefined,
    transcriptionAdapter: createDryRunTranscriptionAdapter({
      fixtures: syntheticAudioFixtures,
    }),
  });
  const summary = await service.run({
    fixtureId: fixture.id,
  });

  return {
    ok: summary.terminalState === "done",
    mode,
    dryRun: true,
    providerCallsEnabled: false,
    audioRequired: false,
    fixture: {
      id: fixture.id,
      language: fixture.language,
      expectedTextLength: fixture.expectedText.length,
      artifact: evaluateSyntheticAudioArtifactSetup(fixture),
    },
    stt: {
      transcript: summary.transcript,
      matchesExpectedText: summary.transcript === fixture.expectedText,
    },
    pipeline: {
      runId: summary.runId,
      terminalState: summary.terminalState,
      states: summary.states,
      eventTypes: summary.events.map((event) => event.type),
      delivery: summary.delivery,
      durationMs: summary.durationMs,
    },
  };
}

function toSimulatedFixture(fixture: SyntheticAudioFixture): SimulatedFixture {
  return {
    id: fixture.id,
    label: fixture.id,
    sourceText: fixture.expectedText,
    expectedTranscript: fixture.expectedText,
    expectedOutput: fixture.expectedText,
    deliveryMode: "skipped",
  };
}
