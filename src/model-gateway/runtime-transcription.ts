import type { CapturedAudioArtifact } from "../capture/types";
import type {
  ModelGatewayMode,
  RedactedModelGatewayError,
  TranscriptionResult,
} from "./types";
import { createRedactedModelGatewayError } from "./types";

export type RuntimeTranscriptionStatus =
  | "ok"
  | "setup-error"
  | "provider-error"
  | "empty"
  | "unusable"
  | "cancelled";

export type RuntimeTranscriptionInput = {
  runId: string;
  clip: CapturedAudioArtifact;
  language?: string;
  provider?: string;
  model?: string;
  mode: ModelGatewayMode;
};

export type RuntimeTranscriptionOutput =
  | {
      status: "ok";
      text: string;
      provider: string;
      model: string;
      latencyMs: number;
      requestId?: string;
      requestEvidence?: "present" | "redacted";
    }
  | {
      status: Exclude<RuntimeTranscriptionStatus, "ok">;
      error: RedactedModelGatewayError;
      provider?: string;
      model?: string;
      latencyMs?: number;
      requestId?: string;
      retryable: boolean;
    };

export type RuntimeTranscriptClassification =
  | {
      status: "available";
      text: string;
    }
  | {
      status: "empty" | "unusable";
      reason: string;
    };

export type RuntimeRecoveryAction = {
  kind:
    | "retry_transcription"
    | "inspect_setup"
    | "copy_manually"
    | "record_again"
    | "view_local_artifact"
    | "none";
  label: string;
  reason: string;
  clipAvailable: boolean;
};

export type RuntimeRecoveryInput = {
  status: RuntimeTranscriptionStatus;
  clipAvailable: boolean;
  transcriptAvailable?: boolean;
  deliveryStatus?:
    | "available"
    | "copied"
    | "paste_sent"
    | "paste_observed"
    | "failed"
    | "uncertain";
};

const nonSpeechPlaceholders = new Set([
  "[blank_audio]",
  "[silence]",
  "(silence)",
  "silence",
  "no speech detected",
]);

export function mapModelGatewayTranscriptionResult(
  result: TranscriptionResult,
  _clip: CapturedAudioArtifact,
): RuntimeTranscriptionOutput {
  if (result.status === "ok") {
    const classification = classifyRuntimeTranscript(result.text);

    if (classification.status !== "available") {
      return {
        status: classification.status,
        error: createRuntimeRedactedError(
          classification.status === "empty"
            ? "EMPTY_TRANSCRIPT"
            : "UNUSABLE_TRANSCRIPT",
          classification.reason,
        ),
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        requestId: result.requestId,
        retryable: true,
      };
    }

    return {
      status: "ok",
      text: classification.text,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      requestId: result.requestId,
      requestEvidence: result.requestId ? "present" : undefined,
    };
  }

  return {
    status: result.status,
    error: createRuntimeRedactedError(result.error.code, result.error.message),
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    requestId: result.requestId,
    retryable: result.status !== "cancelled",
  };
}

export function classifyRuntimeTranscript(
  text: string | undefined,
): RuntimeTranscriptClassification {
  const normalized = text?.trim() ?? "";

  if (!normalized) {
    return {
      status: "empty",
      reason: "Transcription returned no usable text.",
    };
  }

  if (nonSpeechPlaceholders.has(normalized.toLowerCase())) {
    return {
      status: "unusable",
      reason: "Transcription looks like a non-speech placeholder.",
    };
  }

  return {
    status: "available",
    text: normalized,
  };
}

export function createRuntimeRedactedError(
  code: string,
  message: string,
): RedactedModelGatewayError {
  return createRedactedModelGatewayError(code, redactSensitiveText(message));
}

export function redactSensitiveText(message: string): string {
  return message
    .replace(/Bearer\s+[^\s;]+/gi, "Bearer [REDACTED]")
    .replace(/((?:[A-Z0-9_]*API[_-]?KEY|TOKEN|SECRET)\s*=\s*)[^\s;]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|token|secret)\s*:\s*)[^\s;]+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|gsk|xoxb|ghp)[_-][A-Za-z0-9_-]+\b/g, "[REDACTED]");
}

export function deriveRuntimeRecoveryAction(
  input: RuntimeRecoveryInput,
): RuntimeRecoveryAction {
  if (input.status === "ok" && input.transcriptAvailable) {
    return {
      kind: "copy_manually",
      label: "Copy transcript manually",
      reason: "Transcript is available even if automatic delivery is not verified.",
      clipAvailable: input.clipAvailable,
    };
  }

  if (input.status === "setup-error") {
    return {
      kind: "inspect_setup",
      label: "Inspect provider setup",
      reason: "Provider configuration must be fixed before retrying transcription.",
      clipAvailable: input.clipAvailable,
    };
  }

  if (input.status === "provider-error") {
    if (input.clipAvailable) {
      return {
        kind: "retry_transcription",
        label: "Retry transcription",
        reason: "The captured clip is still available for another provider attempt.",
        clipAvailable: true,
      };
    }

    return {
      kind: "record_again",
      label: "Record again",
      reason: "Provider transcription failed and the original clip is unavailable.",
      clipAvailable: false,
    };
  }

  if (input.status === "empty" || input.status === "unusable") {
    if (input.clipAvailable) {
      return {
        kind: "retry_transcription",
        label: "Retry transcription",
        reason: "No usable transcript text was produced, but the clip is still available.",
        clipAvailable: true,
      };
    }

    return {
      kind: "record_again",
      label: "Record again",
      reason: "No usable transcript text was produced and the clip is unavailable.",
      clipAvailable: false,
    };
  }

  if (input.status === "cancelled") {
    return {
      kind: input.clipAvailable ? "retry_transcription" : "record_again",
      label: input.clipAvailable ? "Retry transcription" : "Record again",
      reason: input.clipAvailable
        ? "The run was cancelled and the captured clip is still available."
        : "The run was cancelled and no reusable clip is available.",
      clipAvailable: input.clipAvailable,
    };
  }

  return {
    kind: "none",
    label: "No action needed",
    reason: "No recovery action is required.",
    clipAvailable: input.clipAvailable,
  };
}
