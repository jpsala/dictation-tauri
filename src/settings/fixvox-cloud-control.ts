import { invoke, isTauri } from "@tauri-apps/api/core";

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

  return `Device linked${status.policyLabel ? ` · ${status.policyLabel}` : ""}.`;
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
