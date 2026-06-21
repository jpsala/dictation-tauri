import { describe, expect, it } from "vitest";
import {
  createFakeHostRuntimeClient,
  createUnavailableHostRuntimeClient,
} from "../../src/host-runtime/client";

describe("host runtime client", () => {
  it("provides a provider-free unavailable client for browser/dev fallback", async () => {
    const client = createUnavailableHostRuntimeClient();

    await expect(client.getReadiness()).resolves.toEqual({
      configured: false,
      artifactRoot: "artifacts/microphone-capture",
      supportsRealProviderCall: false,
      directByokConfigured: false,
      managedCloudConfigured: false,
      managedDeviceRegistered: false,
      reason: {
        code: "HOST_RUNTIME_UNAVAILABLE",
        message: "Host runtime transcription boundary is unavailable.",
        redacted: true,
      },
    });

    await expect(
      client.transcribeCapturedAudio({
        runId: "host-runtime-unavailable",
        audioPath: "artifacts/microphone-capture/audio/capture.wav",
        mode: "dry-run",
        allowProviderCall: false,
      }),
    ).resolves.toMatchObject({
      status: "setup-error",
      error: {
        code: "HOST_RUNTIME_UNAVAILABLE",
        redacted: true,
      },
      retryable: false,
      redacted: true,
    });
  });

  it("supports fake clients without importing provider-specific modules", async () => {
    const client = createFakeHostRuntimeClient({
      readiness: {
        configured: true,
        provider: "groq",
        model: "whisper-large-v3",
        artifactRoot: "artifacts/microphone-capture",
        supportsRealProviderCall: true,
        directByokConfigured: true,
        managedCloudConfigured: false,
        managedDeviceRegistered: false,
      },
      transcribe: (request) => ({
        status: "ok",
        text: `transcribed:${request.runId}`,
        provider: "fake-host",
        model: "fake-model",
        latencyMs: 1,
        redacted: true,
      }),
    });

    await expect(client.getReadiness()).resolves.toMatchObject({
      configured: true,
      provider: "groq",
    });
    await expect(
      client.transcribeCapturedAudio({
        runId: "fake-run",
        audioPath: "artifacts/microphone-capture/audio/capture.wav",
        mode: "dry-run",
        allowProviderCall: false,
      }),
    ).resolves.toMatchObject({
      status: "ok",
      text: "transcribed:fake-run",
      provider: "fake-host",
    });
  });
});
