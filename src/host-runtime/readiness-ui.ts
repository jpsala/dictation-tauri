import { redactHostRuntimeText } from "./redaction";
import type { HostRuntimeReadiness } from "./types";

export type HostReadinessUiStatus =
  | "checking"
  | "configured"
  | "unconfigured"
  | "unavailable"
  | "device-needed"
  | "failed";

export type HostReadinessUiState = {
  status: HostReadinessUiStatus;
  statusLabel: string;
  providerLabel: string;
  modelLabel: string;
  detail: string;
  supportsRealProviderCallLabel: string;
  managedCloudLabel: string;
  managedDeviceLabel: string;
  directByokLabel: string;
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
      managedCloudLabel: "Checking",
      managedDeviceLabel: "Unknown",
      directByokLabel: "Unknown",
    };
  }

  if (readiness.configured) {
    const providerLabel = formatReadinessLabel(readiness.provider, "configured");
    const modelLabel = formatReadinessLabel(readiness.model, "configured");
    const managedBackendLabel = formatReadinessLabel(
      readiness.managedBackendBaseUrl,
      "configured",
    );

    return {
      status: "configured",
      statusLabel: readiness.managedDeviceRegistered
        ? "Managed cloud ready"
        : "Ready",
      providerLabel,
      modelLabel,
      detail: readiness.managedDeviceRegistered
        ? `Managed cloud is ready through ${managedBackendLabel}; direct BYOK is also ${readiness.directByokConfigured ? "configured" : "not configured"}.`
        : `Host transcription is configured for ${providerLabel} / ${modelLabel}.`,
      supportsRealProviderCallLabel: readiness.supportsRealProviderCall
        ? "Real provider gated"
        : "Provider calls disabled",
      managedCloudLabel: readiness.managedCloudConfigured
        ? managedBackendLabel
        : "Not configured",
      managedDeviceLabel: readiness.managedDeviceRegistered
        ? "Registered"
        : "Registration needed",
      directByokLabel: readiness.directByokConfigured ? "Configured" : "Not configured",
    };
  }

  const isUnavailable = readiness.reason?.code === "HOST_RUNTIME_UNAVAILABLE";
  const needsManagedDevice =
    readiness.managedCloudConfigured && !readiness.managedDeviceRegistered;

  return {
    status: isUnavailable
      ? "unavailable"
      : needsManagedDevice
        ? "device-needed"
        : "unconfigured",
    statusLabel: isUnavailable
      ? "Unavailable"
      : needsManagedDevice
        ? "Device registration needed"
        : "Setup needed",
    providerLabel: "Not configured",
    modelLabel: "Not configured",
    detail: needsManagedDevice
      ? "Managed cloud backend is configured, but this device is not registered yet."
      : readiness.reason?.message
        ? redactHostRuntimeText(readiness.reason.message)
        : "Host transcription is not configured.",
    supportsRealProviderCallLabel: "Provider calls disabled",
    managedCloudLabel: readiness.managedCloudConfigured
      ? formatReadinessLabel(readiness.managedBackendBaseUrl, "configured")
      : "Not configured",
    managedDeviceLabel: readiness.managedDeviceRegistered
      ? "Registered"
      : "Registration needed",
    directByokLabel: readiness.directByokConfigured ? "Configured" : "Not configured",
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
    managedCloudLabel: "Unknown",
    managedDeviceLabel: "Unknown",
    directByokLabel: "Unknown",
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
