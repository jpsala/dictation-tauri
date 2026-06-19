import { describe, expect, it } from "vitest";
import type { CaptureResult } from "../../src/capture/types";
import { createCapturedAudioTranscriptionAdapter } from "../../src/model-gateway/direct-stt";
import type { ModelGateway } from "../../src/model-gateway/types";
import { createCapturedAudioPipelineRequest } from "../../src/pipeline/ports";
import { PipelineService } from "../../src/pipeline/service";
import type { DeliveryResult } from "../../src/pipeline/types";
import { createRuntimeClip } from "./runtime-fixtures";

describe("runtime delivery evidence", () => {
  it("marks runtime transcript text as available when delivery is skipped", async () => {
    const summary = await createRuntimeService().run(runtimeRequest());

    expect(summary.deliveryEvidence).toEqual({
      status: "available",
      output: "runtime transcript",
      reason: "Simulated delivery was skipped.",
    });
  });

  it("keeps copied fallback distinct from observed paste", async () => {
    const summary = await createRuntimeService({
      async deliver({ output }) {
        return {
          status: "copiedFallback",
          output,
          reason: "Runtime transcript copied as fallback.",
        };
      },
    }).run(runtimeRequest());

    expect(summary.deliveryEvidence).toEqual({
      status: "copied",
      output: "runtime transcript",
      reason: "Runtime transcript copied as fallback.",
    });
    expect(JSON.stringify(summary)).not.toContain("paste_observed");
  });

  it("keeps uncertain delivery recoverable with transcript text", async () => {
    const summary = await createRuntimeService({
      async deliver({ output }) {
        return {
          status: "uncertain",
          output,
          reason: "Target app could not be verified.",
        };
      },
    }).run(runtimeRequest());

    expect(summary.deliveryEvidence).toEqual({
      status: "uncertain",
      output: "runtime transcript",
      reason: "Target app could not be verified.",
    });
  });

  it("preserves transcript text when delivery fails", async () => {
    const summary = await createRuntimeService({
      async deliver() {
        return {
          status: "failed",
          reason: "Clipboard write failed.",
        };
      },
    }).run(runtimeRequest());

    expect(summary).toMatchObject({
      terminalState: "error",
      transcript: "runtime transcript",
      deliveryEvidence: {
        status: "failed",
        output: "runtime transcript",
        reason: "Clipboard write failed.",
      },
    });
  });

  it("maps unverified delivered status to paste_sent, never paste_observed", async () => {
    const summary = await createRuntimeService({
      async deliver({ output }) {
        return {
          status: "delivered",
          output,
          reason: "Paste command was sent but not observed.",
        };
      },
    }).run(runtimeRequest());

    expect(summary.deliveryEvidence).toEqual({
      status: "paste_sent",
      output: "runtime transcript",
      reason: "Paste command was sent but not observed.",
    });
    expect(JSON.stringify(summary)).not.toContain("paste_observed");
  });
});

function createRuntimeService(deliveryAdapter?: {
  deliver(input: { output: string }): Promise<DeliveryResult>;
}) {
  const gateway: ModelGateway = {
    async transcribe(input) {
      return {
        status: "ok",
        text: "runtime transcript",
        provider: "runtime-dry-run",
        model: "fake-artifact",
        latencyMs: 7,
        requestId: `runtime:${input.runId}`,
      };
    },
  };

  return new PipelineService({
    createRunId: () => "runtime-delivery-run",
    transcriptionAdapter: createCapturedAudioTranscriptionAdapter({
      gateway,
      mode: "dry-run",
    }),
    deliveryAdapter,
  });
}

function runtimeRequest() {
  return createCapturedAudioPipelineRequest(createCapturedAudioResult());
}

function createCapturedAudioResult(): Extract<CaptureResult, { ok: true }> {
  const artifact = createRuntimeClip();

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
