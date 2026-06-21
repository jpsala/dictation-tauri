import { redactHostRuntimeText } from "./redaction";
import type { HostRuntimeReadiness } from "./types";

export type HostReadinessUiStatus =
  | "checking"
  | "configured"
  | "unconfigured"
  | "unavailable"
  | "backend-unavailable"
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

  const providerLabel = formatProviderLabel(readiness.provider);
  const modelLabel = formatReadinessLabel(readiness.model, "configured");
  const directByokLabel = formatDirectByokLabel(readiness);
  const managedCloudLabel = formatManagedCloudLabel(readiness);
  const managedDeviceLabel = formatManagedDeviceLabel(readiness);
  const managedBackendUnavailable = isManagedBackendUnavailable(readiness);

  if (readiness.configured) {
    const managedReady = readiness.managedCloudConfigured && readiness.managedDeviceRegistered;
    const statusLabel = managedReady
      ? "Managed cloud ready"
      : readiness.directByokConfigured
        ? "Direct BYOK ready"
        : "Ready";

    return {
      status: "configured",
      statusLabel,
      providerLabel,
      modelLabel,
      detail: describeConfiguredDetail(readiness, managedReady),
      supportsRealProviderCallLabel: readiness.supportsRealProviderCall
        ? "Real provider gated"
        : "Provider calls disabled",
      managedCloudLabel,
      managedDeviceLabel,
      directByokLabel,
    };
  }

  const isHostUnavailable = readiness.reason?.code === "HOST_RUNTIME_UNAVAILABLE";
  const needsManagedDevice =
    readiness.managedCloudConfigured && !readiness.managedDeviceRegistered;

  return {
    status: isHostUnavailable
      ? "unavailable"
      : managedBackendUnavailable
        ? "backend-unavailable"
        : needsManagedDevice
          ? "device-needed"
          : "unconfigured",
    statusLabel: isHostUnavailable
      ? "Unavailable"
      : managedBackendUnavailable
        ? "Backend unavailable"
        : needsManagedDevice
          ? "Device registration needed"
          : "Setup needed",
    providerLabel: "Not configured",
    modelLabel: "Not configured",
    detail: describeUnconfiguredDetail(readiness, {
      managedBackendUnavailable,
      needsManagedDevice,
    }),
    supportsRealProviderCallLabel: "Provider calls disabled",
    managedCloudLabel,
    managedDeviceLabel,
    directByokLabel,
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

function describeConfiguredDetail(
  readiness: HostRuntimeReadiness,
  managedReady: boolean,
): string {
  if (managedReady) {
    return `Fixvox managed cloud is ready for gated transcription. Direct Groq BYOK is ${readiness.directByokConfigured ? "configured as an explicit fallback" : "not configured"} and will not be used silently.`;
  }

  if (readiness.directByokConfigured) {
    return readiness.managedCloudConfigured
      ? "Direct Groq BYOK is ready as an explicit fallback. Fixvox managed cloud still needs device registration."
      : "Direct Groq BYOK is ready as an explicit fallback. Fixvox managed cloud is not ready.";
  }

  return `Host transcription is configured for ${formatProviderLabel(
    readiness.provider,
  )} / ${formatReadinessLabel(readiness.model, "configured")}.`;
}

function describeUnconfiguredDetail(
  readiness: HostRuntimeReadiness,
  options: { managedBackendUnavailable: boolean; needsManagedDevice: boolean },
): string {
  if (options.managedBackendUnavailable) {
    return `Fixvox managed cloud backend is unavailable or misconfigured. Direct Groq BYOK is ${readiness.directByokConfigured ? "configured" : "not configured"}.`;
  }

  if (options.needsManagedDevice) {
    return `Fixvox managed cloud backend is configured, but this device is not registered yet. Direct Groq BYOK is ${readiness.directByokConfigured ? "configured" : "not configured"}.`;
  }

  return readiness.reason?.message
    ? redactHostRuntimeText(readiness.reason.message)
    : "Host transcription is not configured.";
}

function formatProviderLabel(value: string | undefined): string {
  if (value === "fixvox-cloud") {
    return "Fixvox managed cloud";
  }

  return formatReadinessLabel(value, "configured");
}

function formatManagedCloudLabel(readiness: HostRuntimeReadiness): string {
  const backend = formatReadinessLabel(readiness.managedBackendBaseUrl, "configured");

  if (readiness.managedCloudConfigured && readiness.managedDeviceRegistered) {
    return `Ready via ${backend}`;
  }

  if (readiness.managedCloudConfigured) {
    return `Backend configured: ${backend}`;
  }

  if (readiness.managedCloudReason) {
    return "Backend unavailable";
  }

  return "Not configured";
}

function formatManagedDeviceLabel(readiness: HostRuntimeReadiness): string {
  if (readiness.managedDeviceRegistered) {
    return "Registered";
  }

  return readiness.managedCloudConfigured ? "Registration needed" : "Not available";
}

function formatDirectByokLabel(readiness: HostRuntimeReadiness): string {
  return readiness.directByokConfigured
    ? "Direct Groq BYOK ready"
    : "Direct Groq BYOK not configured";
}

function isManagedBackendUnavailable(readiness: HostRuntimeReadiness): boolean {
  return !readiness.managedCloudConfigured && Boolean(readiness.managedCloudReason);
}

function formatReadinessLabel(
  value: string | undefined,
  fallback: "configured" | "unknown",
): string {
  const redacted = redactHostRuntimeText(value ?? fallback, { maxMessageLength: 80 });
  const normalized = redacted.trim();

  return normalized || fallback;
}
