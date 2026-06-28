import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { TauriDesktopDeliveryTarget } from "../delivery/tauri-desktop-delivery";
import type { DictationKeyEvent } from "./dictation-key";

export const tauriDefaultGlobalHotkeyShortcut = "Alt+Space";
export const tauriPrimaryDictationKeyShortcut = tauriDefaultGlobalHotkeyShortcut;
export const tauriFallbackDictationKeyShortcut = "Ctrl+Shift+F9";
export const tauriGlobalHotkeyShortcut = tauriDefaultGlobalHotkeyShortcut;
export const tauriGlobalHotkeyEventName = "desktop-control://global-hotkey";
export const tauriHostCommandEventName = "desktop-control://host-command";

export type TauriGlobalHotkeyPayload = {
  source?: "global_hotkey";
  action?: "pressed" | "released" | "cancel" | "toggle";
  shortcut?: string;
  receivedAt?: string;
  targetSnapshot?: TauriDesktopDeliveryTarget;
};

export type TauriGlobalHotkeyConfig = {
  shortcut: string;
  defaultShortcut: string;
  requestedShortcut?: string;
  altSpaceRequested: boolean;
  altSpaceEnabled: boolean;
  backend?: "tauri_global_shortcut" | "windows_low_level_hook";
  fallbackReason?: string;
};

export type TauriHotkeyRegistrationPreview = {
  requestedShortcut: string;
  normalizedShortcut: string;
  canApply: boolean;
  reason?: string;
  targetConfig?: TauriGlobalHotkeyConfig;
};

export type TauriHotkeyRegistrationApplyResult = {
  preview: TauriHotkeyRegistrationPreview;
  previousConfig: TauriGlobalHotkeyConfig;
  effectiveConfig: TauriGlobalHotkeyConfig;
  changed: boolean;
  rolledBack: boolean;
  preferencePersisted: boolean;
  persistenceError?: string;
  error?: string;
};

export type TauriHostCommand =
  | "start"
  | "stop"
  | "cancel"
  | "paste_last_safe"
  | "select_preset"
  | "clear_preset"
  | "show_result_history"
  | "open_settings";

export type TauriHostCommandPayload = {
  source?: "tray_or_context_menu" | "global_hotkey";
  command?: TauriHostCommand;
  presetId?: "rewrite" | "shorten" | "bulletize";
};

export type TauriGlobalHotkeyListenerOptions = {
  now?: () => string;
  createEventId?: (
    receivedAt: string,
    action: Extract<TauriGlobalHotkeyPayload["action"], "pressed" | "released" | "cancel">,
  ) => string;
};

export type TauriGlobalHotkeyHandler = (
  event: DictationKeyEvent,
) => void | Promise<void>;

export type TauriHostCommandHandler = (
  payload: Required<Pick<TauriHostCommandPayload, "command">> &
    Omit<TauriHostCommandPayload, "command">,
) => void | Promise<void>;

export function createDictationKeyEventFromTauriHotkey(
  payload: TauriGlobalHotkeyPayload | undefined,
  options: TauriGlobalHotkeyListenerOptions = {},
): DictationKeyEvent | undefined {
  if (!payload?.shortcut) {
    return undefined;
  }

  if (
    payload.action !== "pressed" &&
    payload.action !== "released" &&
    payload.action !== "cancel"
  ) {
    return undefined;
  }

  const receivedAt = payload.receivedAt ?? options.now?.() ?? new Date().toISOString();

  return {
    eventId: options.createEventId?.(receivedAt, payload.action),
    source: "global_hotkey",
    kind: payload.action,
    shortcut: payload.shortcut,
    receivedAt,
    ...(payload.targetSnapshot ? { targetSnapshot: payload.targetSnapshot } : {}),
  };
}

export async function previewTauriHotkeyRegistration(
  requestedShortcut: string,
): Promise<TauriHotkeyRegistrationPreview | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<TauriHotkeyRegistrationPreview>(
    "preview_desktop_control_hotkey_registration",
    { requestedShortcut },
  );
}

export async function applyTauriHotkeyRegistration(
  requestedShortcut: string,
): Promise<TauriHotkeyRegistrationApplyResult | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<TauriHotkeyRegistrationApplyResult>(
    "apply_desktop_control_hotkey_registration",
    { requestedShortcut },
  );
}

export async function drainTauriGlobalHotkeyEvents(
  handler: TauriGlobalHotkeyHandler,
  options: TauriGlobalHotkeyListenerOptions = {},
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  const pending = await invoke<TauriGlobalHotkeyPayload[]>(
    "drain_desktop_control_hotkey_events",
  );
  for (const payload of pending) {
    const dictationKeyEvent = createDictationKeyEventFromTauriHotkey(payload, options);
    if (dictationKeyEvent) {
      await handler(dictationKeyEvent);
    }
  }
}

export async function setTauriGlobalHotkeyListenerReady(
  ready: boolean,
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("set_desktop_control_hotkey_listener_ready", { ready });
}

export async function listenForTauriGlobalHotkey(
  handler: TauriGlobalHotkeyHandler,
  options: TauriGlobalHotkeyListenerOptions = {},
): Promise<UnlistenFn | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return listen<TauriGlobalHotkeyPayload>(
    tauriGlobalHotkeyEventName,
    (event) => {
      const dictationKeyEvent = createDictationKeyEventFromTauriHotkey(
        event.payload,
        options,
      );

      if (!dictationKeyEvent) {
        return;
      }

      void handler(dictationKeyEvent);
    },
  );
}

export async function listenForTauriHostCommands(
  handler: TauriHostCommandHandler,
): Promise<UnlistenFn | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return listen<TauriHostCommandPayload>(
    tauriHostCommandEventName,
    (event) => {
      const command = event.payload?.command;
      if (!command) {
        return;
      }

      void handler({ ...event.payload, command });
    },
  );
}
