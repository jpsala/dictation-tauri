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

export type FixvoxCloudHealthTone = "idle" | "success" | "warning" | "danger";

export type FixvoxCloudHealth = {
  tone: FixvoxCloudHealthTone;
  badge: string;
  headline: string;
  detail: string;
  activationLabel: string;
  policyLabel: string;
  managedLabel: string;
  nextAction: string;
};

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

export function deriveFixvoxCloudHealth(status: FixvoxCloudStatus | undefined): FixvoxCloudHealth {
  if (!status) {
    return {
      tone: "warning",
      badge: "Open in Tauri",
      headline: "Host status unavailable",
      detail: "Open Settings inside the Tauri app to read device, activation and policy state.",
      activationLabel: "Unknown",
      policyLabel: "Pending",
      managedLabel: "Unknown",
      nextAction: "Open the native app, then run Refresh local status.",
    };
  }

  if (!status.installIdPresent) {
    return {
      tone: "warning",
      badge: "Local setup",
      headline: "Install identity missing",
      detail: "The host will create a local install identity before cloud activation or policy refresh.",
      activationLabel: "Needs local ID",
      policyLabel: "Pending",
      managedLabel: "Blocked",
      nextAction: "Run Refresh local status or Repair device link.",
    };
  }

  if (!status.deviceRegistered) {
    return {
      tone: "warning",
      badge: "Activation needed",
      headline: "Device is not activated",
      detail: "Enter an invite code to link this install with Fixvox Cloud before managed dictation.",
      activationLabel: "Not activated",
      policyLabel: "Pending",
      managedLabel: "Blocked",
      nextAction: "Paste an invite code and choose Activate device.",
    };
  }

  const errorCode = status.policySnapshot?.error?.code ?? status.lastRegisterErrorCode;
  const stale = Boolean(status.policySnapshot?.stale);
  const managed = Boolean(status.capabilities?.canUseManagedTranscription);
  const policyLabel = status.policyLabel ?? status.policySnapshot?.policyLabel ?? "Policy pending";

  if (errorCode) {
    return {
      tone: "danger",
      badge: "Needs attention",
      headline: "Cloud refresh failed",
      detail: summarizeFixvoxCloudProblem(status),
      activationLabel: "Linked",
      policyLabel,
      managedLabel: managed ? "Managed cached" : "Blocked",
      nextAction: "Retry Refresh policy; if it repeats, check network or invite/account state.",
    };
  }

  if (stale) {
    return {
      tone: "warning",
      badge: "Policy stale",
      headline: "Policy snapshot is stale",
      detail: "The device is linked, but the cached policy should be refreshed before release validation.",
      activationLabel: "Linked",
      policyLabel,
      managedLabel: managed ? "Managed cached" : "Blocked",
      nextAction: "Choose Refresh policy before the next dictation smoke.",
    };
  }

  if (!managed) {
    return {
      tone: "danger",
      badge: "Managed blocked",
      headline: "Managed transcription is blocked",
      detail: "The current policy does not allow managed transcription; the app must not silently fall back to BYOK.",
      activationLabel: "Linked",
      policyLabel,
      managedLabel: "Blocked",
      nextAction: "Refresh policy or activate a plan that allows managed transcription.",
    };
  }

  return {
    tone: "success",
    badge: "Ready",
    headline: "Ready for managed dictation",
    detail: summarizeFixvoxCloudStatus(status),
    activationLabel: "Linked",
    policyLabel,
    managedLabel: "Managed ready",
    nextAction: "Dictate normally; use Refresh policy only when account or quota changes.",
  };
}

export function summarizeFixvoxCloudProblem(status: FixvoxCloudStatus | undefined): string {
  if (!status) {
    return "No host status has been read yet.";
  }

  const policyError = status.policySnapshot?.error;
  if (policyError) {
    return `${policyError.code}: ${policyError.message}`;
  }

  if (status.lastRegisterErrorCode) {
    return `${status.lastRegisterErrorCode}: ${status.lastRegisterErrorMessage ?? "Fixvox Cloud rejected or did not return a usable policy."}`;
  }

  if (!status.deviceRegistered) {
    return "Device not activated yet; managed transcription stays blocked.";
  }

  if (status.policySnapshot?.stale) {
    return "Policy snapshot is stale; refresh before relying on managed runtime.";
  }

  if (!status.capabilities?.canUseManagedTranscription) {
    return "Managed transcription is disabled by the current policy.";
  }

  return "No cloud error.";
}

export function formatFixvoxStateLocation(statePath: string | undefined): string {
  if (!statePath) {
    return "Host-owned app data";
  }

  const fileName = statePath.split(/[\\/]/).filter(Boolean).pop() ?? "fixvox-device-state.json";
  return `${fileName} · host app data`;
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
