import type {
  HostRuntimeClient,
  HostRuntimeReadiness,
  HostTranscriptionRequest,
  HostTranscriptionResponse,
} from "./types";

export type TauriInvokeImpl = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export const getRuntimeTranscriptionReadinessCommand =
  "get_runtime_transcription_readiness";

export const transcribeCapturedAudioCommand = "transcribe_captured_audio";

export function createTauriHostRuntimeClient(
  invokeImpl: TauriInvokeImpl,
): HostRuntimeClient {
  return {
    async getReadiness() {
      return invokeImpl<HostRuntimeReadiness>(
        getRuntimeTranscriptionReadinessCommand,
      );
    },
    async transcribeCapturedAudio(request) {
      return invokeImpl<HostTranscriptionResponse>(transcribeCapturedAudioCommand, {
        request: createSafeTranscriptionPayload(request),
      });
    },
  };
}

function createSafeTranscriptionPayload(
  request: HostTranscriptionRequest,
): HostTranscriptionRequest {
  return {
    runId: request.runId,
    audioPath: request.audioPath,
    ...(request.provider === undefined ? {} : { provider: request.provider }),
    ...(request.model === undefined ? {} : { model: request.model }),
    ...(request.language === undefined ? {} : { language: request.language }),
    mode: request.mode,
    allowProviderCall: request.allowProviderCall,
    ...(request.postProcess === undefined ? {} : { postProcess: request.postProcess }),
  };
}
