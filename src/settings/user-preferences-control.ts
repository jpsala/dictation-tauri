import { invoke, isTauri } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

export const userPreferencesChangedEvent = "settings://user-preferences-changed";

export type UserPreferences = {
  schemaVersion: 1;
  showDockOnStartup: boolean;
  reviewBeforeDelivery: boolean;
  pressEnterAfterPaste: boolean;
  autoStopOnSilenceEnabled: boolean;
  autoStopSilenceMs: number;
  muteOutputDuringRecording: boolean;
  dictationSoundCuesEnabled: boolean;
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
  reviewBeforeDelivery: false,
  pressEnterAfterPaste: false,
  autoStopOnSilenceEnabled: false,
  autoStopSilenceMs: defaultAutoStopSilenceMs,
  muteOutputDuringRecording: false,
  dictationSoundCuesEnabled: false,
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
  return {
    ...defaultUserPreferences,
    ...preferences,
    schemaVersion: 1,
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
