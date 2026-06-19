import { describe, expect, it } from "vitest";
import {
  createTauriHostRuntimeClient,
  getRuntimeTranscriptionReadinessCommand,
  transcribeCapturedAudioCommand,
  type TauriInvokeImpl,
} from "../../src/host-runtime/tauri-client";
import type {
  HostRuntimeReadiness,
  HostTranscriptionRequest,
  HostTranscriptionResponse,
} from "../../src/host-runtime/types";

describe("tauri host runtime client", () => {
  it("calls the fixed readiness invoke command and propagates redacted readiness", async () => {
    const readiness: HostRuntimeReadiness = {
      configured: false,
      artifactRoot: "artifacts/microphone-capture",
      supportsRealProviderCall: false,
      reason: {
        code: "HOST_RUNTIME_UNAVAILABLE",
        message: "Host runtime transcription boundary is unavailable.",
        redacted: true,
      },
    };
    const calls: InvokeCall[] = [];
    const client = createTauriHostRuntimeClient(createInvoke(calls, readiness));

    await expect(client.getReadiness()).resolves.toEqual(readiness);
    expect(calls).toEqual([
      {
        command: getRuntimeTranscriptionReadinessCommand,
        args: undefined,
      },
    ]);
  });

  it("sends only the safe transcription request payload to Tauri invoke", async () => {
    const response: HostTranscriptionResponse = {
      status: "ok",
      text: "redacted host transcript",
      provider: "groq",
      model: "whisper-large-v3",
      latencyMs: 12,
      requestId: "req_redacted_safe",
      redacted: true,
    };
    const calls: InvokeCall[] = [];
    const client = createTauriHostRuntimeClient(createInvoke(calls, response));
    const unsafeRequest = {
      runId: "safe-run",
      audioPath: "artifacts/microphone-capture/audio/capture.wav",
      provider: "groq",
      model: "whisper-large-v3",
      language: "es",
      mode: "real",
      allowProviderCall: true,
      apiKey: "gsk_secret_should_not_cross_renderer_boundary",
      Authorization: "Bearer secret_should_not_cross_renderer_boundary",
      ".env": "GROQ_API_KEY=gsk_secret_should_not_cross_renderer_boundary",
      env: {
        GROQ_API_KEY: "gsk_secret_should_not_cross_renderer_boundary",
      },
      providerPayload: {
        raw: "provider payload should not be sent by the client",
      },
      rawProviderPayload: "provider payload should not be sent by the client",
    } satisfies HostTranscriptionRequest & Record<string, unknown>;

    await expect(client.transcribeCapturedAudio(unsafeRequest)).resolves.toBe(
      response,
    );

    expect(calls).toEqual([
      {
        command: transcribeCapturedAudioCommand,
        args: {
          request: {
            runId: "safe-run",
            audioPath: "artifacts/microphone-capture/audio/capture.wav",
            provider: "groq",
            model: "whisper-large-v3",
            language: "es",
            mode: "real",
            allowProviderCall: true,
          },
        },
      },
    ]);
    const serializedPayload = JSON.stringify(calls[0]?.args);
    expect(serializedPayload).not.toContain("apiKey");
    expect(serializedPayload).not.toContain("Authorization");
    expect(serializedPayload).not.toContain(".env");
    expect(serializedPayload).not.toContain("GROQ_API_KEY");
    expect(serializedPayload).not.toContain("providerPayload");
    expect(serializedPayload).not.toContain("rawProviderPayload");
    expect(serializedPayload).not.toContain("gsk_secret");
  });

  it("propagates redacted transcription errors without provider calls", async () => {
    const response: HostTranscriptionResponse = {
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
    };
    const calls: InvokeCall[] = [];
    const client = createTauriHostRuntimeClient(createInvoke(calls, response));

    await expect(
      client.transcribeCapturedAudio({
        runId: "setup-error-run",
        audioPath: "artifacts/microphone-capture/audio/missing.wav",
        mode: "dry-run",
        allowProviderCall: false,
      }),
    ).resolves.toEqual(response);

    expect(response.redacted).toBe(true);
    expect(response.error.redacted).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

type InvokeCall = {
  command: string;
  args?: Record<string, unknown>;
};

function createInvoke<T>(calls: InvokeCall[], result: T): TauriInvokeImpl {
  return async <TResult>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    return result as TResult;
  };
}
