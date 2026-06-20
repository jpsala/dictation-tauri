import type { MockTranscriptionAdapter } from "../pipeline/ports";
import type { MockTranscriptionResult } from "../pipeline/types";
import type {
  HostRuntimeClient,
  HostRuntimeMode,
  HostTranscriptionResponse,
} from "./types";

export type HostClientTranscriptionAdapterOptions = {
  mode?: HostRuntimeMode;
  allowProviderCall?: boolean;
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
