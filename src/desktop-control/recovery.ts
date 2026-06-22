import { redactHostRuntimeText } from "../host-runtime/redaction";
import type { DeliveryEvidence, DeliveryRequest } from "../delivery/types";
import type { DesktopDictationError, DesktopRecoveryAction } from "./types";

export type DesktopFailureKind =
  | "capture_setup"
  | "runtime_transcription"
  | "managed_preflight"
  | "desktop_control"
  | "delivery";

export type DesktopFailureRecoveryInput = {
  kind: DesktopFailureKind;
  cause?: unknown;
  clipAvailable: boolean;
  transcriptAvailable?: boolean;
  code?: string;
};

export type DesktopFailureRecovery = {
  error: DesktopDictationError;
  recoveryAction: DesktopRecoveryAction;
};

export function mapDesktopFailureToRecovery(
  input: DesktopFailureRecoveryInput,
): DesktopFailureRecovery {
  const message = redactDesktopFailureMessage(input.cause, defaultFailureMessage(input.kind));

  switch (input.kind) {
    case "capture_setup":
      return {
        error: {
          code: input.code ?? "capture-start-failed",
          message,
        },
        recoveryAction: recordAgainRecovery({
          label: "Check microphone setup",
          reason: "Check microphone permission or device setup, then record again.",
        }),
      };
    case "managed_preflight":
      return {
        error: {
          code: input.code ?? "managed-preflight-failed",
          message,
        },
        recoveryAction: inspectSetupRecovery({
          label: "Inspect managed cloud setup",
          reason:
            "Fix managed cloud, quota, or backend readiness before retrying; direct BYOK fallback is never automatic.",
          clipAvailable: input.clipAvailable,
        }),
      };
    case "desktop_control":
      return {
        error: {
          code: input.code ?? "desktop-control-unavailable",
          message,
        },
        recoveryAction: inspectSetupRecovery({
          label: "Inspect desktop control setup",
          reason:
            "Use in-window controls and resolve hotkey or desktop-control setup before trying the shortcut again.",
          clipAvailable: input.clipAvailable,
        }),
      };
    case "delivery":
      return {
        error: {
          code: input.code ?? "delivery-failed",
          message,
        },
        recoveryAction: input.transcriptAvailable
          ? copyManuallyRecovery({
              reason:
                "Transcript text is still available in review even though automatic delivery failed.",
              clipAvailable: input.clipAvailable,
            })
          : retryOrRecordRecovery(input.clipAvailable),
      };
    case "runtime_transcription":
      return {
        error: {
          code: input.code ?? "runtime-failed",
          message,
        },
        recoveryAction: retryOrRecordRecovery(input.clipAvailable),
      };
  }
}

export function isManagedPreflightFailure(cause: unknown): boolean {
  const text = redactDesktopFailureMessage(cause, "").toLowerCase();

  return (
    text.includes("preflight") ||
    text.includes("quota") ||
    text.includes("backend") ||
    text.includes("device policy") ||
    text.includes("managed cloud")
  );
}

export function createFailedDeliveryEvidence(
  request: DeliveryRequest,
  reason: string,
): DeliveryEvidence {
  return {
    status: "failed",
    output: request.text,
    strategy: request.strategy,
    message: "Delivery failed; transcript remains available for review.",
    reason,
    targetBefore: request.targetSnapshot,
  };
}

export function redactDesktopFailureMessage(
  cause: unknown,
  fallback: string,
): string {
  const message = redactHostRuntimeText(cause ?? fallback, {
    maxMessageLength: 220,
  }).trim();

  return message || fallback;
}

export function copyManuallyRecovery(
  input: {
    reason?: string;
    clipAvailable?: boolean;
  } = {},
): DesktopRecoveryAction {
  return {
    kind: "copy_manually",
    label: "Copy transcript manually",
    reason:
      input.reason ??
      "Transcript is available even if automatic delivery is not verified.",
    clipAvailable: input.clipAvailable ?? true,
  };
}

export function retryFromClipRecovery(
  input: { reason?: string } = {},
): DesktopRecoveryAction {
  return {
    kind: "retry_from_clip",
    label: "Retry from captured clip",
    reason:
      input.reason ??
      "The captured clip is still available; retry after the runtime issue is resolved.",
    clipAvailable: true,
  };
}

export function recordAgainRecovery(
  input: { label?: string; reason?: string } = {},
): DesktopRecoveryAction {
  return {
    kind: "record_again",
    label: input.label ?? "Record again",
    reason:
      input.reason ??
      "No reusable clip is available; record a fresh dictation attempt.",
    clipAvailable: false,
  };
}

export function inspectSetupRecovery(input: {
  label: string;
  reason: string;
  clipAvailable: boolean;
}): DesktopRecoveryAction {
  return {
    kind: "inspect_setup",
    label: input.label,
    reason: input.reason,
    clipAvailable: input.clipAvailable,
  };
}

export function dismissRecovery(): DesktopRecoveryAction {
  return {
    kind: "dismiss",
    label: "Dismiss",
    reason: "No further automatic action is required for this control event.",
    clipAvailable: false,
  };
}

function retryOrRecordRecovery(clipAvailable: boolean): DesktopRecoveryAction {
  return clipAvailable ? retryFromClipRecovery() : recordAgainRecovery();
}

function defaultFailureMessage(kind: DesktopFailureKind): string {
  switch (kind) {
    case "capture_setup":
      return "Capture setup failed.";
    case "runtime_transcription":
      return "Dictation processing failed.";
    case "managed_preflight":
      return "Managed preflight failed.";
    case "desktop_control":
      return "Desktop control setup failed.";
    case "delivery":
      return "Delivery failed.";
  }
}
