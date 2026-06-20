import type { MockTranscriptionAdapter } from "../pipeline/ports";
import type { MockTranscriptionResult } from "../pipeline/types";
import type {
  HostRuntimeClient,
  HostTranscriptionResponse,
} from "./types";

export function createHostClientTranscriptionAdapter(
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
