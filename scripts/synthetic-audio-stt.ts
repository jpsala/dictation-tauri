import { syntheticAudioFixtures } from "../src/test-fixtures/synthetic-audio-manifest";
import {
  createSyntheticAudioArtifactPolicy,
  syntheticAudioArtifactRoot,
} from "../src/test-fixtures/synthetic-audio-artifacts";

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

const result = {
  ok: true,
  mode,
  dryRun: true,
  artifactRoot: `${syntheticAudioArtifactRoot}/`,
  artifactPolicy,
  fixtureCount: syntheticAudioFixtures.length,
  providerCallsEnabled: false,
  audioRequired: false,
  note:
    mode === "fixture-check"
      ? "Fixture manifest scaffold is available; this dry run performs no file or provider access."
      : "STT harness is not implemented yet; this placeholder performs no audio or provider access.",
};

console.log(JSON.stringify(result, null, 2));
