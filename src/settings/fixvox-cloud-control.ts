import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  getFixvoxPolicyTemplate,
  type FixvoxPolicyTemplate,
  type FixvoxPolicyTemplateId,
  type FixvoxProductCapability,
  type FixvoxUserAccessMode,
} from "../fixvox-auth/policy-groups";

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
  runtimePolicy?: unknown;
  userSettingsDefaults?: unknown;
  fetchedAt: string;
  trust: string;
  stale: boolean;
  error?: { code: string; message: string; redacted: true };
};

export type FixvoxAuthPolicyStatus = {
  accessMode: FixvoxUserAccessMode;
  userRedacted?: string;
  groupLabel?: string;
  policyTemplateId?: FixvoxPolicyTemplateId;
  policyTemplateLabel?: string;
  capabilities?: FixvoxProductCapability[];
  limits?: FixvoxPolicyTemplate["limits"];
  redacted: true;
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
  authPolicy?: FixvoxAuthPolicyStatus;
  redacted: boolean;
};

export type SettingsAccess = {
  canViewPresets: boolean;
  canEditPresets: boolean;
  canOpenAdmin: boolean;
};

export function isFixvoxAccountReady(status: FixvoxCloudStatus | undefined): boolean {
  return status?.deviceRegistered === true &&
    status.authPolicy?.accessMode === "signed_in" &&
    status.capabilities?.canUseManagedTranscription === true;
}

export function resolveSettingsAccess(status: FixvoxCloudStatus | undefined): SettingsAccess {
  const auth = status?.authPolicy;
  const capabilities = new Set<FixvoxProductCapability>(
    auth?.capabilities ?? (
      auth?.policyTemplateId
        ? [...getFixvoxPolicyTemplate(auth.policyTemplateId).capabilities]
        : []
    ),
  );
  const canViewPresets = capabilities.has("selection_transform") && capabilities.has("managed_llm");

  return {
    canViewPresets,
    canEditPresets: canViewPresets && capabilities.has("custom_prompts"),
    canOpenAdmin: capabilities.has("admin_settings"),
  };
}

export type FixvoxCloudOperation = "register" | "refresh" | "activate";

export type FixvoxCloudLoginStartStatus = {
  flow: "device_code_polling";
  verificationUrlRedacted: string;
  browserOpened: boolean;
  pollingIntervalSeconds: number;
  expiresInSeconds: number;
  sessionIdRedacted: string;
  stateRedacted: string;
  redacted: true;
};

export type FixvoxAuthSessionStatus = {
  status: "signed_out" | "pending" | "signed_in" | "expired" | string;
  flow?: "device_code_polling" | string;
  userRedacted?: string;
  sessionIdRedacted?: string;
  stateRedacted?: string;
  expiresAt?: string;
  secretsPresent: boolean;
  sessionPath: string;
  redacted: true;
};

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

export type FixvoxAuthPolicyView = {
  tone: FixvoxCloudHealthTone;
  accessLabel: string;
  headline: string;
  detail: string;
  userLabel: string;
  groupLabel: string;
  templateLabel: string;
  capabilityLabel: string;
  limitsLabel: string;
  actionLabel: string;
  actionHint: string;
};

export async function getFixvoxCloudStatus(): Promise<FixvoxCloudStatus | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<FixvoxCloudStatus>("get_fixvox_cloud_status");
}

export async function getFixvoxAuthSessionStatus(): Promise<FixvoxAuthSessionStatus | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<FixvoxAuthSessionStatus>("get_fixvox_auth_session_status");
}

export async function pollFixvoxCloudLogin(): Promise<FixvoxAuthSessionStatus | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<FixvoxAuthSessionStatus>("poll_fixvox_cloud_login");
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

export async function startFixvoxCloudLogin(
  openExternalBrowser = true,
): Promise<FixvoxCloudLoginStartStatus | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<FixvoxCloudLoginStartStatus>("start_fixvox_cloud_login", { openExternalBrowser });
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
      badge: "No disponible",
      headline: "No pudimos leer el diagnóstico local",
      detail: "Abrí estos ajustes desde la aplicación para volver a comprobar el estado.",
      activationLabel: "Desconocido",
      policyLabel: "Pendiente",
      managedLabel: "Desconocido",
      nextAction: "Volvé a comprobar desde la aplicación.",
    };
  }

  if (!status.installIdPresent) {
    return {
      tone: "warning",
      badge: "Configuración pendiente",
      headline: "La configuración inicial todavía no comenzó",
      detail: "Cerrá y volvé a abrir la aplicación para continuar.",
      activationLabel: "Pendiente",
      policyLabel: "Pendiente",
      managedLabel: "Bloqueado",
      nextAction: "Volvé a abrir la aplicación.",
    };
  }

  if (!status.deviceRegistered) {
    return {
      tone: "warning",
      badge: "Cuenta pendiente",
      headline: "Falta conectar tu cuenta",
      detail: "Iniciá sesión con Google para terminar de configurar esta computadora.",
      activationLabel: "Pendiente",
      policyLabel: "Pendiente",
      managedLabel: "Bloqueado",
      nextAction: "Abrí Cuenta y continuá con Google.",
    };
  }

  const errorCode = status.policySnapshot?.error?.code ?? status.lastRegisterErrorCode;
  const stale = Boolean(status.policySnapshot?.stale);
  const managed = Boolean(status.capabilities?.canUseManagedTranscription);
  const policyLabel = status.policyLabel ?? status.policySnapshot?.policyLabel ?? "Pendiente";

  if (errorCode) {
    return {
      tone: "danger",
      badge: "Requiere atención",
      headline: "No pudimos actualizar el acceso",
      detail: "La última comprobación no terminó correctamente.",
      activationLabel: "Conectada",
      policyLabel,
      managedLabel: managed ? "Disponible con datos guardados" : "Bloqueado",
      nextAction: "Volvé a comprobar. Si continúa, revisá la conexión.",
    };
  }

  if (stale) {
    return {
      tone: "warning",
      badge: "Datos desactualizados",
      headline: "Conviene volver a comprobar el acceso",
      detail: "La cuenta está conectada, pero el diagnóstico local puede estar desactualizado.",
      activationLabel: "Conectada",
      policyLabel,
      managedLabel: managed ? "Disponible con datos guardados" : "Bloqueado",
      nextAction: "Volvé a comprobar antes del próximo dictado.",
    };
  }

  if (!managed) {
    return {
      tone: "danger",
      badge: "Dictado no disponible",
      headline: "Esta cuenta todavía no puede dictar",
      detail: "Volvé a comprobar el acceso o consultá con la persona que administra tu cuenta.",
      activationLabel: "Conectada",
      policyLabel,
      managedLabel: "Bloqueado",
      nextAction: "Volvé a comprobar el acceso.",
    };
  }

  return {
    tone: "success",
    badge: "Listo",
    headline: "Todo listo para dictar",
    detail: "La cuenta y esta computadora están preparadas.",
    activationLabel: "Conectada",
    policyLabel,
    managedLabel: "Listo",
    nextAction: "Podés dictar normalmente.",
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

function summarizeAuthPolicyCapabilities(capabilities: FixvoxProductCapability[]): string {
  const enabled = new Set(capabilities);
  const parts = [
    enabled.has("dictation") && enabled.has("managed_stt") ? "managed dictation" : "no managed dictation",
    enabled.has("postprocess") && enabled.has("managed_llm") ? "postprocess" : "no postprocess",
    enabled.has("translate") && enabled.has("managed_llm") ? "translate" : "no translate",
    enabled.has("advanced_settings") ? "advanced settings" : "basic settings",
    enabled.has("debug_tools") ? "debug tools" : "debug hidden",
  ];
  return parts.join(" · ");
}

function summarizeFixvoxAuthLimits(limits: FixvoxPolicyTemplate["limits"] | undefined): string {
  if (!limits) {
    return "Limits pending";
  }

  const parts = [
    typeof limits.monthlyMinutes === "number" ? `${limits.monthlyMinutes} min/month` : undefined,
    typeof limits.maxAudioSeconds === "number" ? `${limits.maxAudioSeconds}s max audio` : undefined,
    typeof limits.dailyTranslations === "number" ? `${limits.dailyTranslations} translations/day` : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "No elevated limits";
}

function safeRedactedLabel(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  if (value.includes("@") || /\b(?:user|usr|dev|device|token|sess|session)_[A-Za-z0-9_-]{8,}\b/i.test(value)) {
    return fallback;
  }

  return value;
}

export function deriveFixvoxAuthPolicyView(status: FixvoxCloudStatus | undefined): FixvoxAuthPolicyView {
  if (!status) {
    return {
      tone: "warning",
      accessLabel: "Open in Tauri",
      headline: "Auth status unavailable",
      detail: "Open Settings inside the Tauri app to read signed-in state from host-owned storage.",
      userLabel: "host-owned",
      groupLabel: "Pending",
      templateLabel: "Pending",
      capabilityLabel: "Capabilities pending host status.",
      limitsLabel: "Limits pending",
      actionLabel: "Sign in to unlock",
      actionHint: "Login will be started by the host in a browser, not by React.",
    };
  }

  const auth = status.authPolicy;
  const template = auth?.policyTemplateId ? getFixvoxPolicyTemplate(auth.policyTemplateId) : undefined;
  const templateLabel = auth?.policyTemplateLabel ?? template?.label ?? status.policyLabel ?? "Policy pending";
  const capabilities = auth?.capabilities ?? (template ? [...template.capabilities] : []);
  const limits = auth?.limits ?? template?.limits;

  if (auth?.accessMode === "signed_in") {
    return {
      tone: "success",
      accessLabel: "Signed in",
      headline: "Signed in policy active",
      detail: "Fixvox Cloud can assign this user to a group/template; host and cloud still enforce capabilities.",
      userLabel: safeRedactedLabel(auth.userRedacted, "user redacted"),
      groupLabel: auth.groupLabel ?? "Group pending",
      templateLabel,
      capabilityLabel: summarizeAuthPolicyCapabilities(capabilities),
      limitsLabel: summarizeFixvoxAuthLimits(limits),
      actionLabel: "Account linked",
      actionHint: "Session secrets stay host-owned; React only receives redacted policy state.",
    };
  }

  return {
    tone: "warning",
    accessLabel: "Anonymous basic",
    headline: "Signed out: basic mode only",
    detail: "Anonymous/basic mode is intentionally limited; managed dictation, postprocess, transforms, assistant actions, advanced settings and higher limits require Fixvox Cloud login.",
    userLabel: "no user",
    groupLabel: "No user group",
    templateLabel: "Basic anonymous",
    capabilityLabel: summarizeAuthPolicyCapabilities([...getFixvoxPolicyTemplate("basic-anonymous").capabilities]),
    limitsLabel: summarizeFixvoxAuthLimits(getFixvoxPolicyTemplate("basic-anonymous").limits),
    actionLabel: "Sign in to unlock",
    actionHint: "Browser sign-in is host-owned; Settings only receives redacted session status.",
  };
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
