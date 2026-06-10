import { describe, expect, it } from "vitest";
import { createDirectLocalSttGateway } from "../../src/model-gateway/direct-stt";
import {
  createDryRunModelGateway,
  createDryRunTranscriptionAdapter,
} from "../../src/model-gateway/mock";
import { PipelineService } from "../../src/pipeline/service";
import type { SimulatedFixture } from "../../src/pipeline/types";
import { syntheticAudioFixtures } from "../../src/test-fixtures/synthetic-audio-manifest";

describe("synthetic audio STT dry run", () => {
  it("transcribes fixture expected text deterministically without provider calls", async () => {
    const [fixture] = syntheticAudioFixtures;
    const gateway = createDryRunModelGateway({
      fixtures: syntheticAudioFixtures,
      latencyMs: 12,
    });

    const result = await gateway.transcribe({
      runId: "dry-run-test-001",
      fixtureId: fixture.id,
      audioPath: fixture.audioArtifactPath,
      language: fixture.language,
      mode: "dry-run",
    });

    expect(result).toEqual({
      status: "ok",
      text: fixture.expectedText,
      provider: "synthetic-dry-run",
      model: "manifest-expected-text",
      latencyMs: 12,
      requestId: `dry-run:${fixture.id}:dry-run-test-001`,
    });
  });

  it("emits pipeline STT evidence and derives summary transcript", async () => {
    const [fixture] = syntheticAudioFixtures;
    const events: string[] = [];
    let tick = 2_000;
    const service = new PipelineService({
      createRunId: () => "synthetic-pipeline-001",
      now: () => tick++,
      getFixture: (fixtureId) =>
        fixtureId === fixture.id ? toSimulatedFixture(fixture) : undefined,
      transcriptionAdapter: createDryRunTranscriptionAdapter({
        fixtures: syntheticAudioFixtures,
      }),
      onEvent: (event) => events.push(event.type),
    });

    const summary = await service.run({
      fixtureId: fixture.id,
    });
    const transcriptionEvent = summary.events.find(
      (event) => event.type === "transcription_completed",
    );

    expect(summary).toMatchObject({
      runId: "synthetic-pipeline-001",
      fixtureId: fixture.id,
      terminalState: "done",
      transcript: fixture.expectedText,
      output: fixture.expectedText,
      delivery: {
        status: "skipped",
        reason: "Simulated delivery was skipped.",
      },
    });
    expect(events).toEqual([
      "run_started",
      "state_changed",
      "state_changed",
      "transcription_completed",
      "state_changed",
      "delivery_completed",
      "state_changed",
      "run_completed",
    ]);
    expect(transcriptionEvent).toMatchObject({
      type: "transcription_completed",
      data: {
        transcript: fixture.expectedText,
        stt: {
          provider: "synthetic-dry-run",
          model: "manifest-expected-text",
          mode: "dry-run",
          audioPath: fixture.audioArtifactPath,
          requestId: `dry-run:${fixture.id}:synthetic-pipeline-001`,
        },
      },
    });
  });

  it("returns redacted setup errors from the direct local shell", async () => {
    const [fixture] = syntheticAudioFixtures;
    const gateway = createDirectLocalSttGateway({
      provider: "local-provider",
      model: "local-stt-model",
    });

    const result = await gateway.transcribe({
      runId: "direct-shell-001",
      fixtureId: fixture.id,
      audioPath: fixture.audioArtifactPath,
      language: fixture.language,
      provider: "local-provider",
      model: "local-stt-model",
      mode: "real",
    });

    expect(result).toEqual({
      status: "setup-error",
      error: {
        code: "PROVIDER_SETUP_MISSING",
        message: "Direct local STT provider is not configured.",
        redacted: true,
      },
      provider: "local-provider",
      model: "local-stt-model",
      latencyMs: 0,
    });
  });
});

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
