import { describe, expect, it } from "vitest";
import {
  getRuntimeRecoveryAction,
  getTranscriptReview,
} from "../../src/App";
import { createHostClientTranscriptionAdapter } from "../../src/host-runtime/pipeline-adapter";
import type { CaptureResult } from "../../src/capture/types";
import type {
  HostRuntimeClient,
  HostTranscriptionRequest,
  HostTranscriptionResponse,
} from "../../src/host-runtime/types";
import { createCapturedAudioPipelineRequest } from "../../src/pipeline/ports";
import { PipelineService } from "../../src/pipeline/service";
import { createRuntimeClip } from "../runtime-transcription/runtime-fixtures";

describe("createHostClientTranscriptionAdapter", () => {
  it("maps ok host responses into PipelineService transcript metadata without provider calls", async () => {
    const { client, requests } = createRecordingHostClient({
      status: "ok",
      text: "production host transcript",
      provider: "groq",
      model: "whisper-large-v3",
      latencyMs: 42,
      requestId: "req_redacted_007",
      redacted: true,
    });

    const summary = await createHostClientPipeline(client).run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary).toMatchObject({
      terminalState: "done",
      transcript: "production host transcript",
      deliveryEvidence: {
        status: "available",
        output: "production host transcript",
      },
    });
    expect(getTranscriptReview(summary)).toMatchObject({
      text: "production host transcript",
      provider: "groq",
      model: "whisper-large-v3",
      latencyMs: 42,
      requestId: "req_redacted_007",
    });
    expect(requests).toEqual([
      expect.objectContaining({
        runId: "host-client-adapter-run",
        audioPath: "artifacts/microphone-capture/audio/host-client-adapter.wav",
        mode: "dry-run",
        allowProviderCall: false,
      }),
    ]);
    expect(JSON.stringify(summary)).not.toContain("paste_observed");
    expect(JSON.stringify(summary)).not.toContain("GROQ_API_KEY");
  });

  it("maps setup-error host responses to redacted transcribing errors", async () => {
    const { client, requests } = createRecordingHostClient({
      status: "setup-error",
      error: {
        code: "GROQ_API_KEY_MISSING",
        message: "Host transcription provider is not configured.",
        redacted: true,
      },
      provider: "groq",
      model: "whisper-large-v3",
      requestId: "gsk_setup_secret_must_not_leak",
      retryable: true,
      redacted: true,
    });

    const summary = await createHostClientPipeline(client).run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary).toMatchObject({
      terminalState: "error",
      error: {
        phase: "transcribing",
        message: "Host transcription provider is not configured.",
      },
    });
    expect(getRuntimeRecoveryAction(summary)).toMatchObject({
      kind: "inspect_setup",
      clipAvailable: true,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      mode: "dry-run",
      allowProviderCall: false,
    });
    expect(JSON.stringify(summary)).not.toContain("gsk_");
    expect(JSON.stringify(summary)).not.toContain("sk_");
  });

  it("maps provider-error host responses to redacted transcribing errors", async () => {
    const { client, requests } = createRecordingHostClient({
      status: "provider-error",
      error: {
        code: "GROQ_HTTP_500",
        message: "Host transcription provider returned a retryable error.",
        redacted: true,
      },
      provider: "groq",
      model: "whisper-large-v3",
      latencyMs: 7,
      requestId: "sk_provider_secret_must_not_leak",
      retryable: true,
      redacted: true,
    });

    const summary = await createHostClientPipeline(client).run(
      createCapturedAudioPipelineRequest(createCapturedAudioResult()),
    );

    expect(summary).toMatchObject({
      terminalState: "error",
      error: {
        phase: "transcribing",
        message: "Host transcription provider returned a retryable error.",
      },
    });
    expect(getRuntimeRecoveryAction(summary)).toMatchObject({
      kind: "retry_transcription",
      clipAvailable: true,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      mode: "dry-run",
      allowProviderCall: false,
    });
    expect(JSON.stringify(summary)).not.toContain("gsk_");
    expect(JSON.stringify(summary)).not.toContain("sk_");
  });
});

function createHostClientPipeline(client: HostRuntimeClient) {
  return new PipelineService({
    createRunId: () => "host-client-adapter-run",
    transcriptionAdapter: createHostClientTranscriptionAdapter(client),
  });
}

function createRecordingHostClient(response: HostTranscriptionResponse): {
  client: HostRuntimeClient;
  requests: HostTranscriptionRequest[];
} {
  const requests: HostTranscriptionRequest[] = [];

  return {
    requests,
    client: {
      async getReadiness() {
        return {
          configured: true,
          provider: "groq",
          model: "whisper-large-v3",
          artifactRoot: "artifacts/microphone-capture",
          supportsRealProviderCall: true,
        };
      },
      async transcribeCapturedAudio(request) {
        requests.push(request);
        return response;
      },
    },
  };
}

function createCapturedAudioResult(): Extract<CaptureResult, { ok: true }> {
  const artifact = createRuntimeClip({
    relativePath: "artifacts/microphone-capture/audio/host-client-adapter.wav",
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
