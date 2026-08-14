import { invoke, isTauri } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import {
  defaultDockSkinId,
  normalizeDockSkinId,
  type DockSkinId,
} from "../voice-dock/skins";

export const userPreferencesChangedEvent = "settings://user-preferences-changed";

export type DeliveryMode = "direct" | "clipboardPaste";

export type UserPreferences = {
  schemaVersion: 1;
  showDockOnStartup: boolean;
  dockSkin: DockSkinId;
  deliveryMode: DeliveryMode;
  reviewBeforeDelivery: boolean;
  pressEnterAfterPaste: boolean;
  pasteWithoutFocusChange: boolean;
  followFocusUntilDelivery: boolean;
  autoStopOnSilenceEnabled: boolean;
  autoStopSilenceMs: number;
  muteOutputDuringRecording: boolean;
  dictationSoundCuesEnabled: boolean;
  enhanceLowVolumeEnabled: boolean;
};

export const minAutoStopSilenceMs = 500;
export const maxAutoStopSilenceMs = 10_000;
export const defaultAutoStopSilenceMs = 1_200;

export type AutoStopSilencePolicy = {
  enabled: boolean;
  silenceMs: number;
};

export type MuteOutputPolicy = {
  enabled: boolean;
};

export const defaultUserPreferences: UserPreferences = {
  schemaVersion: 1,
  showDockOnStartup: true,
  dockSkin: defaultDockSkinId,
  deliveryMode: "direct",
  reviewBeforeDelivery: false,
  pressEnterAfterPaste: false,
  pasteWithoutFocusChange: false,
  followFocusUntilDelivery: true,
  autoStopOnSilenceEnabled: false,
  autoStopSilenceMs: defaultAutoStopSilenceMs,
  muteOutputDuringRecording: false,
  dictationSoundCuesEnabled: false,
  enhanceLowVolumeEnabled: true,
};

export function normalizeAutoStopSilenceMs(value: number): number {
  if (!Number.isFinite(value)) {
    return defaultAutoStopSilenceMs;
  }

  return Math.round(
    Math.max(minAutoStopSilenceMs, Math.min(maxAutoStopSilenceMs, value)),
  );
}

export function normalizeUserPreferences(
  preferences: Partial<UserPreferences> | undefined,
): UserPreferences {
  const deliveryMode = preferences?.deliveryMode === "clipboardPaste"
    ? "clipboardPaste"
    : "direct";
  return {
    ...defaultUserPreferences,
    ...preferences,
    schemaVersion: 1,
    dockSkin: normalizeDockSkinId(preferences?.dockSkin),
    deliveryMode,
    autoStopSilenceMs: normalizeAutoStopSilenceMs(
      preferences?.autoStopSilenceMs ?? defaultAutoStopSilenceMs,
    ),
  };
}

export function createAutoStopSilencePolicy(
  preferences: Partial<UserPreferences> | undefined,
): AutoStopSilencePolicy {
  const normalized = normalizeUserPreferences(preferences);
  return {
    enabled: normalized.autoStopOnSilenceEnabled,
    silenceMs: normalized.autoStopSilenceMs,
  };
}

export function createMuteOutputPolicy(
  preferences: Partial<UserPreferences> | undefined,
): MuteOutputPolicy {
  const normalized = normalizeUserPreferences(preferences);
  return {
    enabled: normalized.muteOutputDuringRecording,
  };
}

export async function getUserPreferences(): Promise<UserPreferences> {
  if (!isTauri()) {
    return defaultUserPreferences;
  }

  return normalizeUserPreferences(await invoke<UserPreferences>("get_user_preferences"));
}

export async function setUserPreferences(preferences: UserPreferences): Promise<UserPreferences> {
  const normalized = normalizeUserPreferences(preferences);
  if (!isTauri()) {
    return normalized;
  }

  const saved = await invoke<UserPreferences>("set_user_preferences", { preferences: normalized });
  const next = normalizeUserPreferences(saved);
  await emit(userPreferencesChangedEvent, next);
  return next;
}
