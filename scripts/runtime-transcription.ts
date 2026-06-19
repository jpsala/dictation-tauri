import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { createGroqSttGateway, createGroqSttGatewayFromEnv } from "../src/model-gateway/groq-stt";
import type { GroqSttEnv } from "../src/model-gateway/groq-stt";
import type { TranscriptionResult } from "../src/model-gateway/types";

export type RuntimeTranscriptionMode =
  | "artifact-check"
  | "groq-dry-run"
  | "groq-real";

export type RuntimeTranscriptionArgs = {
  mode: RuntimeTranscriptionMode;
  dryRun: boolean;
  allowProviderCall: boolean;
  audioPath?: string;
};

export type RuntimeTranscriptionReport = {
  ok: boolean;
  runId: string;
  createdAt: string;
  mode: RuntimeTranscriptionMode;
  dryRun: boolean;
  providerCallsEnabled: boolean;
  audioPath?: string;
  audioFile?: string;
  transcriptPath?: string;
  reportPath: string;
  status: TranscriptionResult["status"] | "not-run";
  provider?: string;
  model?: string;
  latencyMs?: number;
  requestId?: string;
  transcriptLength?: number;
  error?: Exclude<TranscriptionResult, { status: "ok" }>["error"];
  rawProviderPayloadStored: false;
  redacted: true;
};

const artifactRoot = "artifacts/microphone-capture";
const artifactDirectories = {
  audio: `${artifactRoot}/audio`,
  transcripts: `${artifactRoot}/transcripts`,
  providerPayloads: `${artifactRoot}/provider-payloads`,
  reports: `${artifactRoot}/reports`,
};

const audioExtensions = new Set([".wav", ".webm", ".m4a", ".mp3", ".ogg", ".flac"]);

export function parseRuntimeTranscriptionArgs(
  argv = process.argv.slice(2),
): RuntimeTranscriptionArgs {
  const mode = readValue(argv, "--mode") as RuntimeTranscriptionMode | undefined;

  if (!mode || !["artifact-check", "groq-dry-run", "groq-real"].includes(mode)) {
    throw new Error(
      "Usage: bun scripts/runtime-transcription.ts --mode <artifact-check|groq-dry-run|groq-real> [--dry-run] [--audio <path>] [--allow-provider-call]",
    );
  }

  return {
    mode,
    dryRun: argv.includes("--dry-run"),
    allowProviderCall: argv.includes("--allow-provider-call"),
    audioPath: readValue(argv, "--audio"),
  };
}

export async function runRuntimeTranscriptionCommand(
  args: RuntimeTranscriptionArgs,
): Promise<Record<string, unknown>> {
  switch (args.mode) {
    case "artifact-check":
      if (!args.dryRun) {
        throw new Error("artifact-check requires --dry-run.");
      }
      return createArtifactCheckResult(await findLatestAudioArtifact());
    case "groq-dry-run":
      if (!args.dryRun) {
        throw new Error("groq-dry-run requires --dry-run.");
      }
      return runGroqDryRun(args.audioPath ?? (await findLatestAudioArtifact()));
    case "groq-real":
      if (!args.allowProviderCall) {
        throw new Error("groq-real requires --allow-provider-call.");
      }
      return runGroqReal(args.audioPath ?? (await requireLatestAudioArtifact()));
  }
}

export async function findLatestAudioArtifact(): Promise<string | undefined> {
  let entries: Array<{ path: string; mtimeMs: number }> = [];

  try {
    const names = await readdir(artifactDirectories.audio);
    entries = await Promise.all(
      names
        .filter((name) => audioExtensions.has(extensionOf(name)))
        .map(async (name) => {
          const path = `${artifactDirectories.audio}/${name}`;
          const info = await stat(path);
          return { path, mtimeMs: info.mtimeMs };
        }),
    );
  } catch {
    return undefined;
  }

  return entries.sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.path;
}

export function createRuntimeTranscriptionReport(input: {
  runId: string;
  createdAt: string;
  mode: RuntimeTranscriptionMode;
  dryRun: boolean;
  providerCallsEnabled: boolean;
  audioPath?: string;
  result?: TranscriptionResult;
  reportPath?: string;
  transcriptPath?: string;
}): RuntimeTranscriptionReport {
  const result = input.result;
  const reportPath =
    input.reportPath ?? `${artifactDirectories.reports}/${input.runId}.json`;

  return {
    ok: result?.status === "ok",
    runId: input.runId,
    createdAt: input.createdAt,
    mode: input.mode,
    dryRun: input.dryRun,
    providerCallsEnabled: input.providerCallsEnabled,
    audioPath: input.audioPath,
    audioFile: input.audioPath ? basename(input.audioPath) : undefined,
    transcriptPath: result?.status === "ok" ? input.transcriptPath : undefined,
    reportPath,
    status: result?.status ?? "not-run",
    provider: result?.provider,
    model: result?.model,
    latencyMs: result?.latencyMs,
    requestId: redactRequestId(result?.requestId),
    transcriptLength: result?.status === "ok" ? result.text.length : undefined,
    error: result?.status === "ok" ? undefined : result?.error,
    rawProviderPayloadStored: false,
    redacted: true,
  };
}

export async function writeRuntimeTranscriptionReport(
  report: RuntimeTranscriptionReport,
): Promise<{ reportPath: string }> {
  assertUnderDirectory(report.reportPath, artifactDirectories.reports);
  await mkdir(dirname(report.reportPath), { recursive: true });
  await writeFile(report.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { reportPath: report.reportPath };
}

export async function writeRuntimeTranscript(input: {
  transcriptPath: string;
  text: string;
}): Promise<{ transcriptPath: string }> {
  assertUnderDirectory(input.transcriptPath, artifactDirectories.transcripts);
  await mkdir(dirname(input.transcriptPath), { recursive: true });
  await writeFile(input.transcriptPath, input.text, "utf8");
  return { transcriptPath: input.transcriptPath };
}

export function redactRequestId(requestId: string | undefined): string | undefined {
  if (!requestId) return undefined;
  if (requestId.length <= 8) return "[REDACTED]";
  return `${requestId.slice(0, 4)}…${requestId.slice(-4)}`;
}

async function runGroqDryRun(audioPath: string | undefined) {
  const runId = createRunId("groq-dry-run");
  const result = await createGroqSttGateway().transcribe({
    runId,
    fixtureId: "microphone",
    audioPath: audioPath ?? "",
    mode: "real",
  });
  const report = createRuntimeTranscriptionReport({
    runId,
    createdAt: new Date().toISOString(),
    mode: "groq-dry-run",
    dryRun: true,
    providerCallsEnabled: false,
    audioPath,
    result,
  });

  await writeRuntimeTranscriptionReport(report);

  return toConsoleSummary(report);
}

async function runGroqReal(audioPath: string) {
  const env = await loadDotEnvIfPresent();
  const runId = createRunId("groq-runtime");
  const transcriptPath = `${artifactDirectories.transcripts}/${runId}.txt`;
  const gateway = createGroqSttGatewayFromEnv(env, {
    fetch: globalThis.fetch,
    readAudioFile: async (input) => new Uint8Array(await readFile(input.audioPath)),
  });
  const result = await gateway.transcribe({
    runId,
    fixtureId: "microphone",
    audioPath,
    mode: "real",
  });
  const report = createRuntimeTranscriptionReport({
    runId,
    createdAt: new Date().toISOString(),
    mode: "groq-real",
    dryRun: false,
    providerCallsEnabled: true,
    audioPath,
    result,
    transcriptPath,
  });

  if (result.status === "ok") {
    await writeRuntimeTranscript({ transcriptPath, text: result.text });
  }

  await writeRuntimeTranscriptionReport(report);

  return toConsoleSummary(report);
}

async function loadDotEnvIfPresent(): Promise<GroqSttEnv> {
  const env: GroqSttEnv = {};

  try {
    const text = await readFile(".env", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex <= 0) continue;
      const key = trimmed.slice(0, equalsIndex).trim();
      const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      if (isGroqEnvKey(key)) {
        env[key as keyof GroqSttEnv] = value;
      }
    }
  } catch {
    // Missing .env is reported by the gateway as setup-error.
  }

  return env;
}

function createArtifactCheckResult(latestAudioPath: string | undefined) {
  return {
    ok: true,
    mode: "artifact-check" as const,
    dryRun: true,
    providerCallsEnabled: false,
    envRequired: false,
    artifactRoot: `${artifactRoot}/`,
    artifactPaths: artifactDirectories,
    latestAudioPath,
    realProviderCommand:
      "bun scripts/runtime-transcription.ts --mode groq-real --allow-provider-call --audio <ignored-audio-path>",
  };
}

function toConsoleSummary(report: RuntimeTranscriptionReport) {
  return {
    ok: report.ok,
    mode: report.mode,
    status: report.status,
    provider: report.provider,
    model: report.model,
    latencyMs: report.latencyMs,
    requestId: report.requestId,
    transcriptLength: report.transcriptLength,
    transcriptPath: report.transcriptPath,
    reportPath: report.reportPath,
    rawProviderPayloadStored: false,
    redacted: true,
  };
}

async function requireLatestAudioArtifact(): Promise<string> {
  const latest = await findLatestAudioArtifact();
  if (!latest) {
    throw new Error("No captured audio artifact found under artifacts/microphone-capture/audio/.");
  }
  return latest;
}

function readValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function extensionOf(path: string): string {
  const match = path.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function createRunId(prefix: string): string {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function assertUnderDirectory(path: string, directory: string): void {
  const normalized = path.replace(/\\/g, "/");
  if (!normalized.startsWith(`${directory}/`) || normalized.split("/").includes("..")) {
    throw new Error(`Runtime transcription artifacts must stay under ${directory}/.`);
  }
}

function isGroqEnvKey(key: string): boolean {
  return [
    "GROQ_API_KEY",
    "GROQ-API-KEY",
    "GROQ_STT_MODEL",
    "GROQ-STT-MODEL",
    "GROQ_STT_LANGUAGE",
    "GROQ-STT-LANGUAGE",
  ].includes(key);
}

async function main() {
  try {
    const result = await runRuntimeTranscriptionCommand(parseRuntimeTranscriptionArgs());
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
