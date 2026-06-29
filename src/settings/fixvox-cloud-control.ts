import { invoke, isTauri } from "@tauri-apps/api/core";

export type FixvoxPolicyCapabilities = {
  canUseManagedTranscription: boolean;
  canSeeAdvancedSettings: boolean;
  canUseDebugTools: boolean;
};

export type FixvoxPolicySnapshot = {
  policyId?: string;
  policyLabel?: string;
  features?: unknown;
  capabilities: FixvoxPolicyCapabilities;
  transportPolicy?: unknown;
  fetchedAt: string;
  trust: string;
  stale: boolean;
  error?: { code: string; message: string; redacted: true };
};

export type FixvoxCloudStatus = {
  backendBaseUrl: string;
  statePath: string;
  installIdPresent: boolean;
  installIdRedacted?: string;
  deviceRegistered: boolean;
  deviceIdRedacted?: string;
  lastRegisterOk: boolean;
  lastRegisterErrorCode?: string;
  lastRegisterErrorMessage?: string;
  policyId?: string;
  policyLabel?: string;
  transportPolicy?: unknown;
  policySnapshot?: FixvoxPolicySnapshot;
  capabilities?: FixvoxPolicyCapabilities;
  redacted: boolean;
};

export type FixvoxCloudOperation = "register" | "refresh" | "activate";

export async function getFixvoxCloudStatus(): Promise<FixvoxCloudStatus | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<FixvoxCloudStatus>("get_fixvox_cloud_status");
}

export async function registerFixvoxDevice(): Promise<FixvoxCloudStatus | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<FixvoxCloudStatus>("register_fixvox_device");
}

export async function refreshFixvoxPolicy(): Promise<FixvoxCloudStatus | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<FixvoxCloudStatus>("refresh_fixvox_policy");
}

export async function activateFixvoxDevice(
  inviteCode: string,
): Promise<FixvoxCloudStatus | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<FixvoxCloudStatus>("activate_fixvox_device", { inviteCode });
}

export function summarizeFixvoxCloudStatus(status: FixvoxCloudStatus | undefined): string {
  if (!status) {
    return "Open Settings inside Tauri to read local Fixvox Cloud state.";
  }

  if (!status.installIdPresent) {
    return "Install identity missing; the host will create it locally.";
  }

  if (!status.deviceRegistered) {
    return "Install identity ready; activation is still required.";
  }

  const managedCopy = status.capabilities?.canUseManagedTranscription
    ? "Managed transcription ready"
    : "Managed transcription blocked";
  return `Device linked${status.policyLabel ? ` · ${status.policyLabel}` : ""} · ${managedCopy}.`;
}

export function summarizeFixvoxPolicyCapabilities(status: FixvoxCloudStatus | undefined): string {
  if (!status?.capabilities) {
    return "Capabilities pending policy refresh.";
  }

  const parts = [
    status.capabilities.canUseManagedTranscription ? "managed STT" : "no managed STT",
    status.capabilities.canSeeAdvancedSettings ? "advanced settings" : "basic settings",
    status.capabilities.canUseDebugTools ? "debug tools" : "debug hidden",
  ];
  const trust = status.policySnapshot?.stale ? "stale" : status.policySnapshot?.trust ?? "pending";
  return `${parts.join(" · ")} · ${trust}`;
}

export function shouldConfirmFixvoxCloudOperation(
  operation: FixvoxCloudOperation,
  inviteCode?: string,
): boolean {
  if (operation === "activate") {
    return Boolean(inviteCode?.trim());
  }

  return true;
}
