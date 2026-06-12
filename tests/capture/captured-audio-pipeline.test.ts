import { describe, expect, it } from "vitest";
import { createFakeCaptureArtifact } from "../../src/capture/fake-gateway";
import type { CaptureResult } from "../../src/capture/types";
import { createCapturedAudioTranscriptionAdapter } from "../../src/model-gateway/direct-stt";
import type { ModelGateway } from "../../src/model-gateway/types";
import { createCapturedAudioPipelineRequest } from "../../src/pipeline/ports";
import {
  ActivePipelineRunError,
  PipelineService,
} from "../../src/pipeline/service";
import type {
  MockTranscriptionResult,
  PipelineEvent,
} from "../../src/pipeline/types";

describe("captured audio pipeline integration", () => {
  it("records capture metadata and transcribes a captured artifact without real audio", async () => {
    const capture = createCapturedAudioResult();
    const request = createCapturedAudioPipelineRequest(capture);
    const events: PipelineEvent[] = [];
    let tick = 1_000;
    const gateway: ModelGateway = {
      async transcribe(input) {
        expect(input).toMatchObject({
          runId: "captured-run-001",
          fixtureId: "microphone",
          audioPath: "artifacts/microphone-capture/audio/capture-001.webm",
          mode: "dry-run",
        });

        return {
          status: "ok",
          text: "captured fake transcript",
          provider: "captured-dry-run",
          model: "fake-artifact",
          latencyMs: 9,
          requestId: `captured:${input.runId}`,
        };
      },
    };

    const service = new PipelineService({
      createRunId: () => "captured-run-001",
      now: () => tick++,
      onEvent: (event) => events.push(event),
      transcriptionAdapter: createCapturedAudioTranscriptionAdapter({
        gateway,
        mode: "dry-run",
      }),
    });

    const summary = await service.run(request);

    expect(summary).toMatchObject({
      runId: "captured-run-001",
      fixtureId: "microphone",
      inputKind: "microphone",
      terminalState: "done",
      states: ["idle", "listening", "transcribing", "delivering", "done"],
      transcript: "captured fake transcript",
      output: "captured fake transcript",
      delivery: {
        status: "skipped",
        reason: "Simulated delivery was skipped.",
      },
      capture: {
        captureId: "capture-001",
        source: "microphone",
        permissionStatus: "granted",
        artifact: capture.artifact,
      },
    });
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "capture_started",
      "capture_completed",
      "state_changed",
      "state_changed",
      "transcription_completed",
      "state_changed",
      "delivery_completed",
      "state_changed",
      "run_completed",
    ]);
    expect(JSON.stringify(summary)).not.toContain("bytesBase64");
    expect(JSON.stringify(summary)).not.toContain("providerPayload");
  });

  it("surfaces missing-provider setup as a redacted captured-audio failure", async () => {
    const capture = createCapturedAudioResult();
    const request = createCapturedAudioPipelineRequest(capture);
    const service = new PipelineService({
      createRunId: () => "captured-run-missing-provider",
      transcriptionAdapter: createCapturedAudioTranscriptionAdapter({
        provider: "local-provider",
        model: "local-stt-model",
      }),
    });

    const summary = await service.run(request);

    expect(summary).toMatchObject({
      inputKind: "microphone",
      terminalState: "error",
      error: {
        phase: "transcribing",
        message: "Direct local STT provider is not configured.",
      },
      capture: {
        captureId: "capture-001",
      },
    });
    expect(JSON.stringify(summary)).not.toContain("OPENAI");
    expect(JSON.stringify(summary)).not.toContain("apiKey");
    expect(JSON.stringify(summary)).not.toContain("providerPayload");
  });

  it("rejects overlapping captured-audio runs while preserving the active run", async () => {
    const capture = createCapturedAudioResult();
    const request = createCapturedAudioPipelineRequest(capture);
    const events: PipelineEvent[] = [];
    const runIds = ["captured-run-overlap-001", "captured-run-overlap-002"];
    let releaseTranscription:
      | ((result: MockTranscriptionResult) => void)
      | undefined;

    const service = new PipelineService({
      createRunId: () => runIds.shift() ?? "unexpected-run",
      onEvent: (event) => events.push(event),
      transcriptionAdapter: {
        transcribe: async () =>
          new Promise<MockTranscriptionResult>((resolve) => {
            releaseTranscription = resolve;
          }),
      },
    });

    const firstRun = service.run(request);

    expect(service.activeRunId).toBe("captured-run-overlap-001");
    await expect(service.run(request)).rejects.toBeInstanceOf(
      ActivePipelineRunError,
    );
    await expect(service.run(request)).rejects.toMatchObject({
      activeRunId: "captured-run-overlap-001",
    });

    for (let index = 0; index < 10 && !releaseTranscription; index += 1) {
      await Promise.resolve();
    }

    releaseTranscription?.({
      text: "captured fake transcript",
      latencyMs: 4,
    });

    const summary = await firstRun;

    expect(summary.terminalState).toBe("done");
    expect(summary.runId).toBe("captured-run-overlap-001");
    expect(service.activeRunId).toBeUndefined();
    expect(events.every((event) => event.runId === "captured-run-overlap-001")).toBe(
      true,
    );
    expect(events.some((event) => event.runId === "captured-run-overlap-002")).toBe(
      false,
    );
  });
});

function createCapturedAudioResult(): Extract<CaptureResult, { ok: true }> {
  const artifact = createFakeCaptureArtifact();

  return {
    ok: true,
    metadata: {
      captureId: artifact.captureId,
      source: "microphone",
      permissionStatus: "granted",
      artifactPolicy: "gitignored-local",
      durationMs: artifact.durationMs,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes,
      artifact,
      deviceKind: "audioinput",
      deviceLabel: "redacted-test-device",
    },
    artifact,
  };
}
