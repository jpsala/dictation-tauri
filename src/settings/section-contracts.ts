import type { FixvoxAuthSessionStatus, FixvoxCloudStatus } from "./fixvox-cloud-control";
import type { VocabularyClient } from "../personal-vocabulary/teach-correction";
import type { UserPreferencesController } from "./controllers/use-user-preferences-controller";
import type { SettingsSectionId } from "./settings-registry";

export type SettingSource = "default" | "local" | "cloud" | "managed" | "unavailable";
export type SettingScope = "device" | "account" | "profile";
export type SettingEffect = "immediate" | "next-dictation" | "restart";

export type SettingProvenance = {
  source: SettingSource;
  scope?: SettingScope;
  effect?: SettingEffect;
  detail?: string;
};

export type SettingAvailability =
  | { state: "available" }
  | { state: "disabled"; reason: string }
  | { state: "managed"; reason: string };

export type SettingsPersistenceState =
  | { status: "idle" }
  | { status: "loading"; target: string }
  | { status: "saving"; target: string; scope?: SettingScope }
  | { status: "saved"; target: string; scope: SettingScope }
  | { status: "dirty"; count: number }
  | { status: "error"; message: string; rolledBack: boolean };

export type SettingRelation = {
  label: string;
  sectionId: SettingsSectionId;
  targetId: string;
};

export type EffectiveSettingState = "configured" | "not-configured" | "unavailable" | "disabled" | "managed";

export type EffectiveSettingItem = {
  label: string;
  value: string;
  provenance?: SettingProvenance;
  state: EffectiveSettingState;
};

export type EffectiveSettingsSnapshot = {
  account: readonly EffectiveSettingItem[];
  dictation: readonly EffectiveSettingItem[];
  hotkeys: readonly EffectiveSettingItem[];
  application: readonly EffectiveSettingItem[];
};

export const settingSourceLabels: Record<SettingSource, string> = {
  default: "Valor predeterminado",
  local: "Configuración local",
  cloud: "Configuración de la cuenta",
  managed: "Administrado",
  unavailable: "Origen no disponible",
};

export const settingScopeLabels: Record<SettingScope, string> = {
  device: "Esta computadora",
  account: "Cuenta",
  profile: "Perfil",
};

export const settingEffectLabels: Record<SettingEffect, string> = {
  immediate: "Se aplica de inmediato",
  "next-dictation": "Se aplica en el próximo dictado",
  restart: "Se aplica al reiniciar",
};

export type SettingsRuntimeProps = {
  tauriRuntime: boolean;
};

export type SettingsNavigationHandler = (sectionId: SettingsSectionId, targetId: string) => void;

export type SettingsNavigationProps = {
  onNavigate?: SettingsNavigationHandler;
};

export type AccountSettingsProps = SettingsRuntimeProps & {
  initialCloudStatus?: FixvoxCloudStatus;
  initialAuthSessionStatus?: FixvoxAuthSessionStatus;
  onAccountReadyChange?: (ready: boolean) => void;
  onCloudStatusChange?: (status: FixvoxCloudStatus | undefined) => void;
};

export type DictationSettingsProps = SettingsRuntimeProps & SettingsNavigationProps & {
  preferences: UserPreferencesController;
};

export type HotkeySettingsProps = SettingsRuntimeProps & SettingsNavigationProps & {
  onDirtyChange?: (dirty: boolean) => void;
};

export type ActionSettingsProps = SettingsRuntimeProps & SettingsNavigationProps & {
  cloudStatus?: FixvoxCloudStatus;
  onDirtyChange?: (dirty: boolean) => void;
};

export type VocabularySettingsProps = {
  vocabularyClient?: VocabularyClient;
};

export type ApplicationSettingsProps = SettingsRuntimeProps & SettingsNavigationProps & {
  preferences: UserPreferencesController;
};

export type PrivacySettingsProps = SettingsRuntimeProps & SettingsNavigationProps;

export type HelpSettingsProps = SettingsRuntimeProps & SettingsNavigationProps & {
  cloudStatus?: FixvoxCloudStatus;
};

export type AdvancedSettingsProps = SettingsRuntimeProps & SettingsNavigationProps & {
  cloudStatus?: FixvoxCloudStatus;
  preferences: UserPreferencesController;
};

export type SettingsDirtyGuard = {
  dirty: boolean;
  message: string;
};
