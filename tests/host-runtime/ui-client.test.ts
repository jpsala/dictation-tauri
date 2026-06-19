import { describe, expect, it } from "vitest";
import {
  getRuntimeRecoveryAction,
  getTranscriptReview,
} from "../../src/App";
import { createFakeHostRuntimeClient } from "../../src/host-runtime/client";
import type {
  HostRuntimeClient,
  HostTranscriptionResponse,
} from "../../src/host-runtime/types";
import type { CaptureResult } from "../../src/capture/types";
import { createCapturedAudioPipelineRequest } from "../../src/pipeline/ports";
import { PipelineService } from "../../src/pipeline/service";
import type { MockTranscriptionAdapter } from "../../src/pipeline/ports";
import { createRuntimeClip } from "../runtime-transcription/runtime-fixtures";

describe("host runtime UI/pipeline client mapping", () => {
  it("maps fake host success to transcript review and honest availability evidence", async () => {
    const client = createFakeHostRuntimeClient({
      readiness: configuredReadiness(),
      transcribe: () => ({
        status: "ok",
        text: "host client transcript",
        provider: "fake-host",
        model: "fake-model",
        latencyMs: 5,
        requestId: "req_safe_host",
        redacted: true,
      }),
    });
    const summary = await createHostClientPipeline(client).run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary).toMatchObject({
      terminalState: "done",
      transcript: "host client transcript",
      deliveryEvidence: {
        status: "available",
        output: "host client transcript",
      },
    });
    expect(getTranscriptReview(summary)).toMatchObject({
      text: "host client transcript",
      provider: "fake-host",
      model: "fake-model",
      latencyMs: 5,
      requestId: "req_safe_host",
    });
    expect(JSON.stringify(summary)).not.toContain("paste_observed");
    expect(JSON.stringify(summary)).not.toContain("GROQ_API_KEY");
  });

  it("maps fake setup failures to inspect-setup recovery without secret leaks", async () => {
    const client = createFakeHostRuntimeClient({
      readiness: configuredReadiness(),
      transcribe: () => ({
        status: "setup-error",
        error: {
          code: "GROQ_API_KEY_MISSING",
          message: "Groq STT provider is not configured.",
          redacted: true,
        },
        provider: "groq",
        model: "whisper-large-v3",
        retryable: true,
        redacted: true,
      }),
    });
    const summary = await createHostClientPipeline(client).run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary).toMatchObject({
      terminalState: "error",
      error: {
        phase: "transcribing",
        message: "Groq STT provider is not configured.",
      },
    });
    expect(getRuntimeRecoveryAction(summary)).toMatchObject({
      kind: "inspect_setup",
      clipAvailable: true,
    });
    expect(JSON.stringify(summary)).not.toContain("sk_");
    expect(JSON.stringify(summary)).not.toContain("gsk_");
  });

  it("maps fake provider failures to retry recovery when the clip remains available", async () => {
    const client = createFakeHostRuntimeClient({
      readiness: configuredReadiness(),
      transcribe: () => ({
        status: "provider-error",
        error: {
          code: "GROQ_HTTP_500",
          message: "Groq STT provider returned HTTP 500 Server Error.",
          redacted: true,
        },
        provider: "groq",
        model: "whisper-large-v3",
        retryable: true,
        redacted: true,
      }),
    });
    const summary = await createHostClientPipeline(client).run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary.terminalState).toBe("error");
    expect(getRuntimeRecoveryAction(summary)).toMatchObject({
      kind: "retry_transcription",
      clipAvailable: true,
    });
  });
});

function configuredReadiness() {
  return {
    configured: true,
    provider: "groq" as const,
    model: "whisper-large-v3",
    artifactRoot: "artifacts/microphone-capture" as const,
    supportsRealProviderCall: true,
  };
}

function createHostClientPipeline(client: HostRuntimeClient) {
  return new PipelineService({
    createRunId: () => "host-client-run",
    transcriptionAdapter: createHostClientTranscriptionAdapter(client),
  });
}

function createHostClientTranscriptionAdapter(
  client: HostRuntimeClient,
): MockTranscriptionAdapter {
  return {
    async transcribe(_fixture, context) {
      const artifact = context?.capture?.artifact;
      const response = await client.transcribeCapturedAudio({
        runId: context?.runId ?? "host-client-run",
        audioPath: artifact?.relativePath ?? artifact?.path ?? "",
        mode: "dry-run",
        allowProviderCall: false,
      });

      return mapHostResponseToMockTranscription(response);
    },
  };
}

function mapHostResponseToMockTranscription(response: HostTranscriptionResponse) {
  if (response.status === "ok") {
    return {
      text: response.text,
      latencyMs: response.latencyMs,
      stt: {
        provider: response.provider,
        model: response.model,
        mode: "dry-run" as const,
        requestId: response.requestId,
      },
    };
  }

  return {
    error: {
      phase: "transcribing" as const,
      message: response.error.message,
    },
    latencyMs: response.latencyMs ?? 0,
  };
}

function createCapturedAudioResult(): Extract<CaptureResult, { ok: true }> {
  const artifact = createRuntimeClip({
    relativePath: "artifacts/microphone-capture/audio/host-client.wav",
  });

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
