import { describe, expect, it } from "vitest";
import { deriveRunSummaryFromEvents } from "../../src/pipeline/events";
import type {
  CapturedAudioArtifact,
  CaptureMetadata,
} from "../../src/capture/types";
import type { PipelineEvent } from "../../src/pipeline/types";

describe("pipeline capture metadata events", () => {
  it("derives microphone input metadata from capture ledger events", () => {
    const metadata = createCaptureMetadata();
    const artifact = createCapturedArtifact();
    const events: PipelineEvent[] = [
      {
        type: "run_started",
        runId: "run-capture-001",
        fixtureId: "microphone",
        state: "idle",
        at: 100,
      },
      {
        type: "capture_started",
        runId: "run-capture-001",
        captureId: metadata.captureId,
        at: 101,
        data: metadata,
      },
      {
        type: "capture_completed",
        runId: "run-capture-001",
        captureId: metadata.captureId,
        at: 102,
        data: {
          metadata: {
            ...metadata,
            artifact,
            durationMs: artifact.durationMs,
            mimeType: artifact.mimeType,
            sizeBytes: artifact.sizeBytes,
          },
          artifact,
        },
      },
      {
        type: "state_changed",
        runId: "run-capture-001",
        fixtureId: "microphone",
        state: "done",
        at: 103,
      },
      {
        type: "run_completed",
        runId: "run-capture-001",
        fixtureId: "microphone",
        at: 104,
        data: {
          output: "fake transcript ready",
          delivery: {
            status: "skipped",
            reason: "Capture contract test does not deliver text.",
          },
        },
      },
    ];

    const summary = deriveRunSummaryFromEvents(events);

    expect(summary).toMatchObject({
      runId: "run-capture-001",
      fixtureId: "microphone",
      inputKind: "microphone",
      capture: {
        captureId: "capture-001",
        source: "microphone",
        permissionStatus: "granted",
        artifactPolicy: "gitignored-local",
        artifact,
      },
      terminalState: "done",
      states: ["idle", "done"],
      durationMs: 4,
    });
    expect(summary.capture).not.toHaveProperty("bytes");
    expect(summary.capture).not.toHaveProperty("transcript");
  });

  it("derives redacted failed capture metadata without provider data", () => {
    const metadata = createCaptureMetadata();
    const events: PipelineEvent[] = [
      {
        type: "run_started",
        runId: "run-capture-failed",
        fixtureId: "microphone",
        state: "idle",
        at: 200,
      },
      {
        type: "capture_failed",
        runId: "run-capture-failed",
        captureId: metadata.captureId,
        at: 201,
        data: {
          metadata,
          error: {
            phase: "permission",
            code: "permission-denied",
            message: "Microphone permission was denied.",
          },
        },
      },
      {
        type: "state_changed",
        runId: "run-capture-failed",
        fixtureId: "microphone",
        state: "error",
        at: 202,
      },
      {
        type: "run_failed",
        runId: "run-capture-failed",
        fixtureId: "microphone",
        at: 203,
        data: {
          error: {
            phase: "listening",
            message: "Capture failed before transcription.",
          },
        },
      },
    ];

    const summary = deriveRunSummaryFromEvents(events);

    expect(summary).toMatchObject({
      inputKind: "microphone",
      capture: metadata,
      terminalState: "error",
      error: {
        phase: "listening",
        message: "Capture failed before transcription.",
      },
    });
    expect(JSON.stringify(summary)).not.toContain("providerPayload");
    expect(JSON.stringify(summary)).not.toContain("secret");
  });

  it("keeps existing simulated ledgers classified as simulated input", () => {
    const summary = deriveRunSummaryFromEvents([
      {
        type: "run_started",
        runId: "run-simulated-001",
        fixtureId: "clean-note",
        state: "idle",
        at: 1,
      },
      {
        type: "state_changed",
        runId: "run-simulated-001",
        fixtureId: "clean-note",
        state: "done",
        at: 2,
      },
      {
        type: "run_completed",
        runId: "run-simulated-001",
        fixtureId: "clean-note",
        at: 3,
      },
    ]);

    expect(summary.inputKind).toBe("simulated");
    expect(summary.capture).toBeUndefined();
  });
});

function createCaptureMetadata(): CaptureMetadata {
  return {
    captureId: "capture-001",
    source: "microphone",
    permissionStatus: "granted",
    artifactPolicy: "gitignored-local",
    deviceKind: "audioinput",
    deviceLabel: "redacted-test-device",
  };
}

function createCapturedArtifact(): CapturedAudioArtifact {
  return {
    artifactId: "artifact-001",
    captureId: "capture-001",
    relativePath: "artifacts/microphone-capture/audio/capture-001.webm",
    mimeType: "audio/webm",
    extension: "webm",
    sizeBytes: 2048,
    durationMs: 1200,
    sensitivity: "real-user-audio",
    policy: "gitignored-local",
  };
}
