import { pathToFileURL } from "node:url";

type PlaceholderMode = "artifact-check" | "capture-dry-run";

const artifactRoot = "artifacts/microphone-capture";
const artifactDirectories = {
  audio: `${artifactRoot}/audio`,
  transcripts: `${artifactRoot}/transcripts`,
  providerPayloads: `${artifactRoot}/provider-payloads`,
  reports: `${artifactRoot}/reports`,
};

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function readMode(): PlaceholderMode {
  const args = process.argv.slice(2);
  const modeIndex = args.indexOf("--mode");
  const mode = modeIndex >= 0 ? args[modeIndex + 1] : undefined;

  if (mode === "artifact-check" || mode === "capture-dry-run") {
    return mode;
  }

  console.error(
    "Usage: bun scripts/microphone-capture.ts --mode <artifact-check|capture-dry-run> --dry-run",
  );
  process.exit(2);
}

function createPlaceholderResult(mode: PlaceholderMode) {
  return {
    ok: true,
    mode,
    dryRun: true,
    microphoneAccessRequested: false,
    audioRecorded: false,
    providerCallsEnabled: false,
    envRequired: false,
    artifactRoot: `${artifactRoot}/`,
    artifactPaths: artifactDirectories,
    manualChecks: {
      tauriDev: "npm run tauri:dev",
      gitIgnoredStatus: "git status --short --ignored",
    },
    nextImplementationGate:
      "Real microphone/provider checks require explicit JP approval before running.",
  };
}

async function main() {
  if (!hasFlag("--dry-run")) {
    console.error("Only --dry-run microphone capture commands are available by default.");
    process.exit(2);
  }

  console.log(JSON.stringify(createPlaceholderResult(readMode()), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
