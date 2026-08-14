import type { MockTranscriptionAdapter } from "../pipeline/ports";
import type { MockTranscriptionResult } from "../pipeline/types";
import type {
  HostPostProcessPolicy,
  HostRuntimeClient,
  HostRuntimeMode,
  HostTranscriptionResponse,
} from "./types";

export type HostClientTranscriptionAdapterOptions = {
  mode?: HostRuntimeMode;
  allowProviderCall?: boolean;
  postProcess?: HostPostProcessPolicy;
};

export function createHostClientTranscriptionAdapter(
  client: HostRuntimeClient,
  options: HostClientTranscriptionAdapterOptions = {},
): MockTranscriptionAdapter {
  return {
    async transcribe(_fixture, context) {
      const artifact = context?.capture?.artifact;
      const response = await client.transcribeCapturedAudio({
        runId: context?.runId ?? "host-client-run",
        audioPath: artifact?.relativePath ?? artifact?.path ?? "",
        mode: options.mode ?? "dry-run",
        allowProviderCall: options.allowProviderCall ?? false,
        ...(options.postProcess === undefined ? {} : { postProcess: options.postProcess }),
      });

      return mapHostTranscriptionResponse(response);
    },
  };
}

export function mapHostTranscriptionResponse(
  response: HostTranscriptionResponse,
): MockTranscriptionResult {
  if (response.status === "ok") {
    return {
      text: response.text,
      latencyMs: response.latencyMs,
      stt: {
        provider: response.provider,
        model: response.model,
        mode: "dry-run",
        requestId: response.requestId,
      },
      audioTelemetry: response.audioPrep
        ? {
          durationMs: response.audioPrep.audioDurationMs,
          originalBytes: response.audioPrep.originalBytes,
          uploadBytes: response.audioPrep.uploadBytes,
          mimeType: response.audioPrep.uploadMimeType,
          source: response.audioPrep.uploadSource,
          compressionRatio: response.audioPrep.compressionRatio,
          levelNormalization: {
            status: response.audioPrep.levelNormalizationStatus ?? "skipped",
            reason: response.audioPrep.levelNormalizationReason ?? "not_reported",
            gainDb: response.audioPrep.levelNormalizationGainDb,
          },
          voiceActivity: response.audioPrep.voiceActivity,
        }
        : undefined,
      postProcess: response.postProcess
        ? {
          enabled: response.postProcess.enabled,
          ran: response.postProcess.ran,
          fallbackToRaw: response.postProcess.fallbackToRaw,
          recipeId: response.postProcess.experimentRecipeId ?? undefined,
          recipeVersion: response.postProcess.experimentRecipeVersion ?? undefined,
          source: response.postProcess.source ?? undefined,
        }
        : undefined,
    };
  }

  return {
    error: {
      phase: "transcribing",
      message: response.error.message,
    },
    latencyMs: response.latencyMs ?? 0,
  };
}
