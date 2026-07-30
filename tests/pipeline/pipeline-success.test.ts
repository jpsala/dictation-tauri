import { describe, expect, it } from "vitest";
import { createFakeCaptureArtifact } from "../../src/capture/fake-gateway";
import { getSimulatedFixture } from "../../src/pipeline/fixtures";
import { createCapturedAudioPipelineRequest } from "../../src/pipeline/ports";
import { runSimulatedPipeline } from "../../src/pipeline/runner";
import { PipelineService } from "../../src/pipeline/service";
import type { PipelineStateEvent } from "../../src/pipeline/types";

describe("simulated pipeline success flow", () => {
  it("runs a fixture-backed dictation flow to deterministic output", async () => {
    const fixture = getSimulatedFixture("clean-note");
    const events: PipelineStateEvent[] = [];
    let tick = 1_000;

    const summary = await runSimulatedPipeline(
      { fixtureId: "clean-note" },
      {
        createRunId: () => "run-success-001",
        now: () => tick++,
        onState: (event) => events.push(event),
      },
    );

    expect(summary).toMatchObject({
      runId: "run-success-001",
      fixtureId: "clean-note",
      states: ["idle", "listening", "transcribing", "delivering", "done"],
      terminalState: "done",
      output: fixture?.expectedOutput,
      delivery: {
        status: "delivered",
        output: fixture?.expectedOutput,
      },
      durationMs: 7,
    });
    expect(fixture).toBeDefined();
    expect(summary.error).toBeUndefined();
    expect(summary.events.map((event) => event.type)).toEqual([
      "run_started",
      "state_changed",
      "state_changed",
      "transcription_completed",
      "state_changed",
      "delivery_completed",
      "state_changed",
      "run_completed",
    ]);
    expect(events.map((event) => event.state)).toEqual(summary.states);
    expect(events.every((event) => event.runId === summary.runId)).toBe(true);
    expect(events.every((event) => event.fixtureId === summary.fixtureId)).toBe(
      true,
    );
  });

  it("keeps native capture runs unique when callers create a fresh pipeline service", async () => {
    const runForCapture = async (captureId: string) => {
      const artifact = createFakeCaptureArtifact(captureId);
      const service = new PipelineService({
        transcriptionAdapter: {
          async transcribe() {
            return { text: "history result", latencyMs: 0 };
          },
        },
      });

      return service.run(createCapturedAudioPipelineRequest({
        ok: true,
        metadata: {
          captureId,
          source: "microphone",
          permissionStatus: "granted",
          artifactPolicy: "gitignored-local",
          deviceKind: "audioinput",
        },
        artifact,
      }));
    };

    const first = await runForCapture("capture-native-1001");
    const second = await runForCapture("capture-native-1002");

    expect(first.runId).toBe("capture-native-1001");
    expect(second.runId).toBe("capture-native-1002");
    expect(first.runId).not.toBe(second.runId);
  });
});
