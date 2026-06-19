import { describe, expect, it } from "vitest";
import {
  applyCopiedFallback,
  getRecoveryAction,
  getRuntimeRecoveryAction,
  getTranscriptReview,
} from "../../src/App";
import { createFakeCaptureArtifact } from "../../src/capture/fake-gateway";
import type { CaptureResult } from "../../src/capture/types";
import { createCapturedAudioTranscriptionAdapter } from "../../src/model-gateway/direct-stt";
import { createCapturedAudioPipelineRequest } from "../../src/pipeline/ports";
import { PipelineService } from "../../src/pipeline/service";
import type { DeliveryResult } from "../../src/pipeline/types";

describe("captured run delivery evidence", () => {
  it("marks completed captured runs as available without claiming paste observation", async () => {
    const service = createCapturedAudioService();
    const summary = await service.run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary.terminalState).toBe("done");
    expect(summary.delivery).toEqual({
      status: "skipped",
      reason: "Simulated delivery was skipped.",
    });
    expect(summary.deliveryEvidence).toEqual({
      status: "available",
      output: "captured fake transcript",
      reason: "Simulated delivery was skipped.",
    });
    expect(JSON.stringify(summary)).not.toContain("paste_observed");
  });

  it("keeps copy fallback honest by recording copied instead of observed paste", async () => {
    const service = createCapturedAudioService({
      async deliver({ output }) {
        return {
          status: "copiedFallback",
          output,
          reason: "Transcript was copied as fallback.",
        };
      },
    });
    const summary = await service.run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary.deliveryEvidence).toEqual({
      status: "copied",
      output: "captured fake transcript",
      reason: "Transcript was copied as fallback.",
    });
    expect(applyCopiedFallback(summary)).toEqual(summary);
    expect(JSON.stringify(summary)).not.toContain("paste_observed");
  });

  it("keeps uncertain delivery distinct from text availability", async () => {
    const service = createCapturedAudioService({
      async deliver({ output }) {
        return {
          status: "uncertain",
          output,
          reason: "Delivery target could not be verified.",
        };
      },
    });
    const summary = await service.run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary.terminalState).toBe("done");
    expect(summary.deliveryEvidence).toEqual({
      status: "uncertain",
      output: "captured fake transcript",
      reason: "Delivery target could not be verified.",
    });
  });

  it("returns a recoverable next action for failed capture setup", async () => {
    const failedCapture: Extract<CaptureResult, { ok: false }> = {
      ok: false,
      metadata: {
        captureId: "capture-failed",
        source: "microphone",
        permissionStatus: "denied",
        artifactPolicy: "gitignored-local",
        deviceKind: "audioinput",
        deviceLabel: "redacted-test-device",
      },
      error: {
        phase: "permission",
        code: "permission-denied",
        message: "Microphone permission was denied.",
      },
    };
    const service = createCapturedAudioService();
    const summary = await service.run(
      createCapturedAudioPipelineRequest(failedCapture),
    );

    expect(summary.deliveryEvidence).toEqual({
      status: "failed",
      reason: "Capture failed before transcription.",
    });
    expect(getRuntimeRecoveryAction(summary)).toMatchObject({
      kind: "record_again",
      label: "Check microphone setup",
      clipAvailable: false,
    });
    expect(getRecoveryAction(summary)).toBe(
      "Check microphone setup: Check microphone permission or device setup, then capture again.",
    );
  });

  it("returns a recoverable next action for transcription setup failures", async () => {
    const service = new PipelineService({
      createRunId: () => "captured-run-missing-provider",
      transcriptionAdapter: createCapturedAudioTranscriptionAdapter({
        provider: "local-provider",
        model: "local-stt-model",
      }),
    });
    const summary = await service.run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary.deliveryEvidence).toEqual({
      status: "failed",
      reason: "Direct local STT provider is not configured.",
    });
    expect(getRuntimeRecoveryAction(summary)).toMatchObject({
      kind: "inspect_setup",
      label: "Inspect provider setup",
      clipAvailable: true,
    });
    expect(getRecoveryAction(summary)).toBe(
      "Inspect provider setup: Provider configuration must be fixed before retrying transcription.",
    );
  });

  it("exposes transcript review evidence separately from delivery success", async () => {
    const service = createCapturedAudioService();
    const summary = await service.run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(getTranscriptReview(summary)).toEqual({
      text: "captured fake transcript",
      provider: "captured-dry-run",
      model: "fake-artifact",
      latencyMs: 9,
      requestId: "captured:captured-run-001",
    });
    expect(getRuntimeRecoveryAction(summary)).toMatchObject({
      kind: "copy_manually",
      label: "Copy transcript manually",
      clipAvailable: true,
    });
  });
});

function createCapturedAudioService(deliveryAdapter?: {
  deliver(input: { output: string }): Promise<DeliveryResult>;
}) {
  return new PipelineService({
    createRunId: () => "captured-run-001",
    transcriptionAdapter: createCapturedAudioTranscriptionAdapter({
      gateway: {
        async transcribe(input) {
          return {
            status: "ok",
            text: "captured fake transcript",
            provider: "captured-dry-run",
            model: "fake-artifact",
            latencyMs: 9,
            requestId: `captured:${input.runId}`,
          };
        },
      },
      mode: "dry-run",
    }),
    deliveryAdapter,
  });
}

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
