import { describe, expect, it } from "vitest";
import type { CaptureResult } from "../../src/capture/types";
import { createCapturedAudioTranscriptionAdapter } from "../../src/model-gateway/direct-stt";
import type { ModelGateway } from "../../src/model-gateway/types";
import { createCapturedAudioPipelineRequest } from "../../src/pipeline/ports";
import {
  ActivePipelineRunError,
  PipelineService,
} from "../../src/pipeline/service";
import type { MockTranscriptionResult } from "../../src/pipeline/types";
import { createRuntimeClip } from "./runtime-fixtures";

describe("runtime captured-audio pipeline", () => {
  it("preserves provider/model/latency/request evidence for successful runtime transcription", async () => {
    const gateway: ModelGateway = {
      async transcribe(input) {
        return {
          status: "ok",
          text: " runtime transcript ",
          provider: "groq",
          model: "whisper-large-v3",
          latencyMs: 123,
          requestId: `req:${input.runId}`,
        };
      },
    };
    const service = new PipelineService({
      createRunId: () => "runtime-run-001",
      transcriptionAdapter: createCapturedAudioTranscriptionAdapter({
        gateway,
        mode: "real",
      }),
    });

    const summary = await service.run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary).toMatchObject({
      terminalState: "done",
      transcript: "runtime transcript",
      deliveryEvidence: {
        status: "available",
        output: "runtime transcript",
      },
    });
    const transcriptionEvent = summary.events.find(
      (event) => event.type === "transcription_completed",
    );
    expect(transcriptionEvent).toMatchObject({
      data: {
        latencyMs: 123,
        stt: {
          provider: "groq",
          model: "whisper-large-v3",
          mode: "real",
          requestId: "req:runtime-run-001",
        },
      },
    });
  });

  it("maps missing audio to a setup-style transcription failure", async () => {
    const service = new PipelineService({
      createRunId: () => "runtime-run-missing-audio",
      transcriptionAdapter: createCapturedAudioTranscriptionAdapter({
        gateway: successfulGateway(),
        mode: "real",
      }),
    });

    const summary = await service.run(
      createCapturedAudioPipelineRequest(
        createCapturedAudioResult({ relativePath: undefined, path: undefined }),
      ),
    );

    expect(summary).toMatchObject({
      terminalState: "error",
      error: {
        phase: "transcribing",
        message: "Captured audio artifact is unavailable.",
      },
    });
  });

  it("maps provider setup failures to redacted retryable pipeline errors", async () => {
    const gateway: ModelGateway = {
      async transcribe() {
        return {
          status: "setup-error",
          provider: "groq",
          model: "whisper-large-v3",
          latencyMs: 0,
          error: {
            code: "PROVIDER_SETUP_MISSING",
            message: "Missing GROQ_API_KEY=gsk_hidden",
            redacted: true,
          },
        };
      },
    };
    const service = new PipelineService({
      createRunId: () => "runtime-run-setup-failure",
      transcriptionAdapter: createCapturedAudioTranscriptionAdapter({
        gateway,
        mode: "real",
      }),
    });

    const summary = await service.run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary).toMatchObject({
      terminalState: "error",
      error: {
        phase: "transcribing",
        message: "Missing GROQ_API_KEY=[REDACTED]",
      },
      deliveryEvidence: {
        status: "failed",
        reason: "Missing GROQ_API_KEY=[REDACTED]",
      },
    });
    expect(JSON.stringify(summary)).not.toContain("gsk_hidden");
  });

  it("redacts provider diagnostics before they reach pipeline errors", async () => {
    const gateway: ModelGateway = {
      async transcribe() {
        return {
          status: "provider-error",
          provider: "groq",
          model: "whisper-large-v3",
          latencyMs: 50,
          error: {
            code: "PROVIDER_FAILURE",
            message: "Authorization: Bearer sk-live-secret failed",
            redacted: true,
          },
        };
      },
    };
    const service = new PipelineService({
      createRunId: () => "runtime-run-provider-failure",
      transcriptionAdapter: createCapturedAudioTranscriptionAdapter({
        gateway,
        mode: "real",
      }),
    });

    const summary = await service.run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary.terminalState).toBe("error");
    expect(summary.error?.message).toBe("Authorization: Bearer [REDACTED] failed");
    expect(JSON.stringify(summary)).not.toContain("sk-live-secret");
  });

  it("treats empty provider success as a recoverable transcription failure", async () => {
    const gateway: ModelGateway = {
      async transcribe() {
        return {
          status: "ok",
          text: "   ",
          provider: "groq",
          model: "whisper-large-v3",
          latencyMs: 10,
        };
      },
    };
    const service = new PipelineService({
      createRunId: () => "runtime-run-empty",
      transcriptionAdapter: createCapturedAudioTranscriptionAdapter({
        gateway,
        mode: "real",
      }),
    });

    const summary = await service.run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary).toMatchObject({
      terminalState: "error",
      error: {
        phase: "transcribing",
        message: "Transcription returned no usable text.",
      },
      deliveryEvidence: {
        status: "failed",
        reason: "Transcription returned no usable text.",
      },
    });
  });

  it("treats provider no-speech placeholders as unusable without delivery", async () => {
    const gateway: ModelGateway = {
      async transcribe() {
        return {
          status: "ok",
          text: "no speech detected",
          provider: "groq",
          model: "whisper-large-v3",
          latencyMs: 10,
        };
      },
    };
    const service = new PipelineService({
      createRunId: () => "runtime-run-placeholder",
      transcriptionAdapter: createCapturedAudioTranscriptionAdapter({
        gateway,
        mode: "real",
      }),
    });

    const summary = await service.run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary).toMatchObject({
      terminalState: "error",
      output: undefined,
      delivery: undefined,
      error: {
        phase: "transcribing",
        message: "Transcription looks like a non-speech placeholder.",
      },
      deliveryEvidence: {
        status: "failed",
        output: undefined,
        reason: "Transcription looks like a non-speech placeholder.",
      },
    });
    expect(summary.events.some((event) => event.type === "delivery_completed")).toBe(false);
  });

  it("cancels before provider submission when the run is cancelled at transcribing", async () => {
    let providerCalls = 0;
    const gateway: ModelGateway = {
      async transcribe() {
        providerCalls += 1;
        return {
          status: "ok",
          text: "should not happen",
          provider: "groq",
          model: "whisper-large-v3",
          latencyMs: 1,
        };
      },
    };
    const service = new PipelineService({
      createRunId: () => "runtime-run-cancelled",
      transcriptionAdapter: createCapturedAudioTranscriptionAdapter({
        gateway,
        mode: "real",
      }),
    });
    const request = createCapturedAudioPipelineRequest(createCapturedAudioResult());

    const summary = await service.run({
      ...request,
      cancelAtState: "transcribing",
    });

    expect(summary).toMatchObject({
      terminalState: "cancelled",
      states: ["idle", "listening", "transcribing", "cancelled"],
    });
    expect(providerCalls).toBe(0);
  });

  it("rejects overlapping runtime transcription runs while preserving the active run", async () => {
    let releaseTranscription:
      | ((result: MockTranscriptionResult) => void)
      | undefined;
    const service = new PipelineService({
      createRunId: () => "runtime-run-overlap",
      transcriptionAdapter: {
        transcribe: async () =>
          new Promise<MockTranscriptionResult>((resolve) => {
            releaseTranscription = resolve;
          }),
      },
    });
    const request = createCapturedAudioPipelineRequest(createCapturedAudioResult());

    const firstRun = service.run(request);

    await expect(service.run(request)).rejects.toBeInstanceOf(
      ActivePipelineRunError,
    );
    expect(service.activeRunId).toBe("runtime-run-overlap");

    for (let index = 0; index < 10 && !releaseTranscription; index += 1) {
      await Promise.resolve();
    }
    releaseTranscription?.({ text: "done", latencyMs: 1 });

    await expect(firstRun).resolves.toMatchObject({ terminalState: "done" });
    expect(service.activeRunId).toBeUndefined();
  });
});

function successfulGateway(): ModelGateway {
  return {
    async transcribe() {
      return {
        status: "ok",
        text: "runtime transcript",
        provider: "test-provider",
        model: "test-model",
        latencyMs: 1,
      };
    },
  };
}

function createCapturedAudioResult(
  artifactOverrides = {},
): Extract<CaptureResult, { ok: true }> {
  const artifact = createRuntimeClip(artifactOverrides);

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
