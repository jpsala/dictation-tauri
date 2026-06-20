import { redactHostRuntimeText } from "./redaction";
import type { HostRuntimeReadiness } from "./types";

export type HostReadinessUiStatus =
  | "checking"
  | "configured"
  | "unconfigured"
  | "unavailable"
  | "failed";

export type HostReadinessUiState = {
  status: HostReadinessUiStatus;
  statusLabel: string;
  providerLabel: string;
  modelLabel: string;
  detail: string;
  supportsRealProviderCallLabel: string;
};

export function describeHostReadiness(
  readiness?: HostRuntimeReadiness,
): HostReadinessUiState {
  if (!readiness) {
    return {
      status: "checking",
      statusLabel: "Checking",
      providerLabel: "Unknown",
      modelLabel: "Unknown",
      detail: "Checking host transcription readiness.",
      supportsRealProviderCallLabel: "Provider calls disabled",
    };
  }

  if (readiness.configured) {
    const providerLabel = formatReadinessLabel(readiness.provider, "configured");
    const modelLabel = formatReadinessLabel(readiness.model, "configured");

    return {
      status: "configured",
      statusLabel: "Ready",
      providerLabel,
      modelLabel,
      detail: `Host transcription is configured for ${providerLabel} / ${modelLabel}.`,
      supportsRealProviderCallLabel: readiness.supportsRealProviderCall
        ? "Real provider gated"
        : "Provider calls disabled",
    };
  }

  const isUnavailable = readiness.reason?.code === "HOST_RUNTIME_UNAVAILABLE";

  return {
    status: isUnavailable ? "unavailable" : "unconfigured",
    statusLabel: isUnavailable ? "Unavailable" : "Setup needed",
    providerLabel: "Not configured",
    modelLabel: "Not configured",
    detail: readiness.reason?.message
      ? redactHostRuntimeText(readiness.reason.message)
      : "Host transcription is not configured.",
    supportsRealProviderCallLabel: "Provider calls disabled",
  };
}

export function describeHostReadinessFailure(_error: unknown): HostReadinessUiState {
  return {
    status: "failed",
    statusLabel: "Readiness unknown",
    providerLabel: "Unknown",
    modelLabel: "Unknown",
    detail: "Host readiness check failed. Capture remains available.",
    supportsRealProviderCallLabel: "Provider calls disabled",
  };
}

function formatReadinessLabel(
  value: string | undefined,
  fallback: "configured" | "unknown",
): string {
  const redacted = redactHostRuntimeText(value ?? fallback, { maxMessageLength: 80 });
  const normalized = redacted.trim();

  return normalized || fallback;
}
