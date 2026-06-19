import { createFakeCaptureArtifact } from "../../src/capture/fake-gateway";
import type { CapturedAudioArtifact } from "../../src/capture/types";
import type { TranscriptionResult } from "../../src/model-gateway/types";

export function createRuntimeClip(
  overrides: Partial<CapturedAudioArtifact> = {},
): CapturedAudioArtifact {
  return {
    ...createFakeCaptureArtifact(),
    ...overrides,
  };
}

export function createSetupFailure(
  message = "Provider setup failed for key sk-secret-123.",
): Extract<TranscriptionResult, { status: "setup-error" }> {
  return {
    status: "setup-error",
    provider: "groq",
    model: "whisper-large-v3",
    latencyMs: 0,
    error: {
      code: "PROVIDER_SETUP_MISSING",
      message,
      redacted: true,
    },
  };
}
