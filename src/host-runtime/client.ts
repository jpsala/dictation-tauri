import type {
  HostRuntimeClient,
  HostRuntimeReadiness,
  HostTranscriptionRequest,
  HostTranscriptionResponse,
} from "./types";

const defaultArtifactRoot = "artifacts/microphone-capture" as const;

export function createUnavailableHostRuntimeClient(
  readiness: Partial<HostRuntimeReadiness> = {},
): HostRuntimeClient {
  return {
    async getReadiness() {
      return {
        configured: false,
        artifactRoot: defaultArtifactRoot,
        supportsRealProviderCall: false,
        reason: {
          code: "HOST_RUNTIME_UNAVAILABLE",
          message: "Host runtime transcription boundary is unavailable.",
          redacted: true,
        },
        ...readiness,
      };
    },
    async transcribeCapturedAudio(_request: HostTranscriptionRequest) {
      return createUnavailableTranscriptionResponse();
    },
  };
}

export function createFakeHostRuntimeClient(options: {
  readiness: HostRuntimeReadiness;
  transcribe?: (
    request: HostTranscriptionRequest,
  ) => Promise<HostTranscriptionResponse> | HostTranscriptionResponse;
}): HostRuntimeClient {
  return {
    async getReadiness() {
      return options.readiness;
    },
    async transcribeCapturedAudio(request) {
      return options.transcribe?.(request) ?? createUnavailableTranscriptionResponse();
    },
  };
}

function createUnavailableTranscriptionResponse(): HostTranscriptionResponse {
  return {
    status: "setup-error",
    error: {
      code: "HOST_RUNTIME_UNAVAILABLE",
      message: "Host runtime transcription boundary is unavailable.",
      redacted: true,
    },
    retryable: false,
    redacted: true,
  };
}
