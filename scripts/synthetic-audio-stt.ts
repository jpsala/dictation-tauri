import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { compareTranscripts } from "../src/model-gateway/comparison";
import { syntheticAudioFixtures } from "../src/test-fixtures/synthetic-audio-manifest";
import type { SyntheticAudioFixture } from "../src/test-fixtures/synthetic-audio-manifest";
import {
  createSyntheticAudioArtifactPolicy,
  evaluateSyntheticAudioArtifactSetup,
  syntheticAudioArtifactDirectories,
  syntheticAudioArtifactRoot,
} from "../src/test-fixtures/synthetic-audio-artifacts";
import { createDryRunTranscriptionAdapter } from "../src/model-gateway/mock";
import { PipelineService } from "../src/pipeline/service";
import type { CostEstimate } from "../src/model-gateway/types";
import type {
  SimulatedFixture,
  SimulatedRunSummary,
  TranscriptionCompletedEvent,
} from "../src/pipeline/types";

type PlaceholderMode = "fixture-check" | "stt-dry-run";

export type SyntheticSttReport = {
  reportId: string;
  createdAt: string;
  dryRun: true;
  providerCallsEnabled: false;
  audioRequired: false;
  artifactRoot: string;
  artifactPaths: {
    report: string;
    audio: string;
    transcripts: string;
    providerPayloads: string;
  };
  fixture: {
    id: string;
    language: string;
    expectedText: string;
    expectedTextLength: number;
    artifact: ReturnType<typeof evaluateSyntheticAudioArtifactSetup>;
  };
  stt: {
    status: "ok" | "missing-transcript";
    transcript?: string;
    provider?: string;
    model?: string;
    mode?: "mock" | "dry-run" | "real";
    latencyMs?: number;
    requestId?: string;
    costEstimate: CostEstimate;
  };
  comparison: ReturnType<typeof compareTranscripts>;
  postprocess?: {
    output?: string;
  };
  pipeline: {
    runId: string;
    terminalState: SimulatedRunSummary["terminalState"];
    states: SimulatedRunSummary["states"];
    eventTypes: string[];
    delivery: SimulatedRunSummary["delivery"];
    durationMs: number;
  };
};

type CreateReportOptions = {
  createdAt?: string;
  reportId?: string;
  reportPath?: string;
};

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function readMode(): PlaceholderMode {
  const args = process.argv.slice(2);
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

const artifactPolicy = createSyntheticAudioArtifactPolicy();

function createFixtureCheckResult() {
  return {
    ok: true,
    mode: "fixture-check" as const,
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

export async function runSttDryRun(options: CreateReportOptions = {}) {
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
  const report = createSyntheticSttReport(fixture, summary, options);
  const writtenReport = await writeSyntheticSttReport(report, options.reportPath);

  return {
    ok: summary.terminalState === "done",
    mode: "stt-dry-run" as const,
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
    report: {
      reportId: report.reportId,
      path: writtenReport.path,
      artifactRoot: report.artifactRoot,
      comparison: report.comparison,
      provider: report.stt.provider,
      model: report.stt.model,
      mode: report.stt.mode,
      latencyMs: report.stt.latencyMs,
      costEstimate: report.stt.costEstimate,
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

export function createSyntheticSttReport(
  fixture: SyntheticAudioFixture,
  summary: SimulatedRunSummary,
  options: CreateReportOptions = {},
): SyntheticSttReport {
  const transcription = findTranscriptionCompletedEvent(summary);
  const transcript = summary.transcript ?? "";
  const reportId =
    options.reportId ?? `synthetic-stt-${summary.runId}-${fixture.id}`;
  const reportPath =
    options.reportPath ??
    `${syntheticAudioArtifactDirectories.reports}/${reportId}.json`;

  return {
    reportId,
    createdAt: options.createdAt ?? new Date().toISOString(),
    dryRun: true,
    providerCallsEnabled: false,
    audioRequired: false,
    artifactRoot: syntheticAudioArtifactRoot,
    artifactPaths: {
      report: reportPath,
      audio: fixture.audioArtifactPath,
      transcripts: syntheticAudioArtifactDirectories.transcripts,
      providerPayloads: syntheticAudioArtifactDirectories.providerPayloads,
    },
    fixture: {
      id: fixture.id,
      language: fixture.language,
      expectedText: fixture.expectedText,
      expectedTextLength: fixture.expectedText.length,
      artifact: evaluateSyntheticAudioArtifactSetup(fixture),
    },
    stt: {
      status: transcript ? "ok" : "missing-transcript",
      transcript: summary.transcript,
      provider: transcription?.data.stt?.provider,
      model: transcription?.data.stt?.model,
      mode: transcription?.data.stt?.mode,
      latencyMs: transcription?.data.latencyMs,
      requestId: transcription?.data.stt?.requestId,
      costEstimate: {
        amount: 0,
        currency: "USD",
        source: "dry-run:no-provider-call",
      },
    },
    comparison: compareTranscripts(fixture.expectedText, transcript),
    postprocess: {
      output: summary.output,
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

export async function writeSyntheticSttReport(
  report: SyntheticSttReport,
  reportPath = report.artifactPaths.report,
): Promise<{ path: string }> {
  const normalizedPath = normalizeWorkspaceArtifactPath(reportPath);

  if (
    !normalizedPath.startsWith(`${syntheticAudioArtifactDirectories.reports}/`) ||
    normalizedPath.split("/").includes("..")
  ) {
    throw new Error(
      "Synthetic STT reports must stay under artifacts/synthetic-audio-stt/reports/.",
    );
  }

  const output = {
    ...report,
    artifactPaths: {
      ...report.artifactPaths,
      report: normalizedPath,
    },
  };

  await mkdir(dirname(normalizedPath), { recursive: true });
  await writeFile(normalizedPath, `${JSON.stringify(output, null, 2)}\n`, {
    encoding: "utf8",
  });

  return {
    path: normalizedPath,
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

function findTranscriptionCompletedEvent(
  summary: SimulatedRunSummary,
): TranscriptionCompletedEvent | undefined {
  return summary.events.find(
    (event): event is TranscriptionCompletedEvent =>
      event.type === "transcription_completed",
  );
}

function normalizeWorkspaceArtifactPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

async function main() {
  if (!hasFlag("--dry-run")) {
    console.error("Only --dry-run placeholder commands are available in Phase 1.");
    process.exit(2);
  }

  const mode = readMode();
  const result =
    mode === "fixture-check" ? createFixtureCheckResult() : await runSttDryRun();

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
