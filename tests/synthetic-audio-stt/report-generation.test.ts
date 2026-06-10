import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  compareTranscripts,
  transcriptComparisonPolicy,
} from "../../src/model-gateway/comparison";
import { createDryRunTranscriptionAdapter } from "../../src/model-gateway/mock";
import { PipelineService } from "../../src/pipeline/service";
import type { SimulatedFixture } from "../../src/pipeline/types";
import {
  syntheticAudioArtifactDirectories,
  syntheticAudioArtifactRoot,
} from "../../src/test-fixtures/synthetic-audio-artifacts";
import { syntheticAudioFixtures } from "../../src/test-fixtures/synthetic-audio-manifest";
import {
  createSyntheticSttReport,
  writeSyntheticSttReport,
} from "../../scripts/synthetic-audio-stt";

describe("synthetic audio STT report generation", () => {
  it("normalizes transcript comparisons without hiding the raw text", () => {
    const comparison = compareTranscripts(
      "Hola, JP. Probando dictado rapido.",
      " hola jp probando dictado rapido ",
    );

    expect(comparison).toEqual({
      policy: transcriptComparisonPolicy,
      expected: {
        raw: "Hola, JP. Probando dictado rapido.",
        normalized: "hola jp probando dictado rapido",
      },
      transcript: {
        raw: " hola jp probando dictado rapido ",
        normalized: "hola jp probando dictado rapido",
      },
      exactMatch: false,
      normalizedMatch: true,
    });
  });

  it("builds a structured dry-run report with comparison and safe metadata", async () => {
    const [fixture] = syntheticAudioFixtures;
    const summary = await runFixtureDryRun(fixture);
    const report = createSyntheticSttReport(fixture, summary, {
      createdAt: "2026-06-10T00:00:00.000Z",
      reportId: "synthetic-report-test",
    });

    expect(report).toMatchObject({
      reportId: "synthetic-report-test",
      createdAt: "2026-06-10T00:00:00.000Z",
      dryRun: true,
      providerCallsEnabled: false,
      audioRequired: false,
      artifactRoot: syntheticAudioArtifactRoot,
      fixture: {
        id: fixture.id,
        language: fixture.language,
        expectedText: fixture.expectedText,
        expectedTextLength: fixture.expectedText.length,
        artifact: {
          fixtureId: fixture.id,
          artifactPath: fixture.audioArtifactPath,
          exists: false,
          status: "setup-required",
          policy: {
            artifactRoot: syntheticAudioArtifactRoot,
            gitPolicy: "ignored",
          },
        },
      },
      stt: {
        status: "ok",
        transcript: fixture.expectedText,
        provider: "synthetic-dry-run",
        model: "manifest-expected-text",
        mode: "dry-run",
        latencyMs: 0,
        requestId: `dry-run:${fixture.id}:synthetic-report-run`,
        costEstimate: {
          amount: 0,
          currency: "USD",
          source: "dry-run:no-provider-call",
        },
      },
      comparison: {
        policy: transcriptComparisonPolicy,
        exactMatch: true,
        normalizedMatch: true,
      },
      postprocess: {
        output: fixture.expectedText,
      },
      pipeline: {
        runId: "synthetic-report-run",
        terminalState: "done",
        states: ["idle", "listening", "transcribing", "delivering", "done"],
        eventTypes: [
          "run_started",
          "state_changed",
          "state_changed",
          "transcription_completed",
          "state_changed",
          "delivery_completed",
          "state_changed",
          "run_completed",
        ],
        delivery: {
          status: "skipped",
          reason: "Simulated delivery was skipped.",
        },
      },
      artifactPaths: {
        report: `${syntheticAudioArtifactDirectories.reports}/synthetic-report-test.json`,
        audio: fixture.audioArtifactPath,
        transcripts: syntheticAudioArtifactDirectories.transcripts,
        providerPayloads: syntheticAudioArtifactDirectories.providerPayloads,
      },
    });
  });

  it("writes reports only under the gitignored synthetic report artifact path", async () => {
    const [fixture] = syntheticAudioFixtures;
    const summary = await runFixtureDryRun(fixture);
    const reportPath = `${syntheticAudioArtifactDirectories.reports}/vitest-report-generation.json`;
    const report = createSyntheticSttReport(fixture, summary, {
      createdAt: "2026-06-10T00:00:00.000Z",
      reportId: "vitest-report-generation",
      reportPath,
    });

    const written = await writeSyntheticSttReport(report);
    const stored = JSON.parse(await readFile(written.path, "utf8"));

    expect(written.path).toBe(reportPath);
    expect(stored.artifactPaths.report).toBe(reportPath);
    expect(stored.comparison.normalizedMatch).toBe(true);
    expect(stored.providerCallsEnabled).toBe(false);
    expect(isIgnoredByGit(reportPath)).toBe(true);
  });

  it("rejects report paths outside the synthetic report artifact directory", async () => {
    const [fixture] = syntheticAudioFixtures;
    const summary = await runFixtureDryRun(fixture);
    const report = createSyntheticSttReport(fixture, summary, {
      reportPath: "artifacts/elsewhere/report.json",
    });

    await expect(writeSyntheticSttReport(report)).rejects.toThrow(
      "Synthetic STT reports must stay under artifacts/synthetic-audio-stt/reports/.",
    );
  });

  it("rejects report paths with traversal segments", async () => {
    const [fixture] = syntheticAudioFixtures;
    const summary = await runFixtureDryRun(fixture);
    const report = createSyntheticSttReport(fixture, summary, {
      reportPath: `${syntheticAudioArtifactDirectories.reports}/../report.json`,
    });

    await expect(writeSyntheticSttReport(report)).rejects.toThrow(
      "Synthetic STT reports must stay under artifacts/synthetic-audio-stt/reports/.",
    );
  });
});

async function runFixtureDryRun(
  fixture: (typeof syntheticAudioFixtures)[number],
) {
  let tick = 1;
  const service = new PipelineService({
    createRunId: () => "synthetic-report-run",
    now: () => tick++,
    getFixture: (fixtureId) =>
      fixtureId === fixture.id ? toSimulatedFixture(fixture) : undefined,
    transcriptionAdapter: createDryRunTranscriptionAdapter({
      fixtures: syntheticAudioFixtures,
    }),
  });

  return service.run({
    fixtureId: fixture.id,
  });
}

function toSimulatedFixture(
  fixture: (typeof syntheticAudioFixtures)[number],
): SimulatedFixture {
  return {
    id: fixture.id,
    label: fixture.id,
    sourceText: fixture.expectedText,
    expectedTranscript: fixture.expectedText,
    expectedOutput: fixture.expectedText,
    deliveryMode: "skipped",
  };
}

function isIgnoredByGit(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", path], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}
