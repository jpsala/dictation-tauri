import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DictationKeyEvent } from "./dictation-key";

export const tauriDefaultGlobalHotkeyShortcut = "Ctrl+Shift+F9";
export const tauriGlobalHotkeyShortcut = tauriDefaultGlobalHotkeyShortcut;
export const tauriGlobalHotkeyEventName = "desktop-control://global-hotkey";
export const tauriHostCommandEventName = "desktop-control://host-command";

export type TauriGlobalHotkeyPayload = {
  source?: "global_hotkey";
  action?: "pressed" | "released" | "toggle";
  shortcut?: string;
  receivedAt?: string;
};

export type TauriGlobalHotkeyConfig = {
  shortcut: string;
  defaultShortcut: string;
  requestedShortcut?: string;
  altSpaceRequested: boolean;
  altSpaceEnabled: boolean;
  fallbackReason?: string;
};

export type TauriHostCommand = "start" | "stop" | "cancel" | "paste_last_safe";

export type TauriHostCommandPayload = {
  source?: "tray_or_context_menu";
  command?: TauriHostCommand;
};

export type TauriGlobalHotkeyListenerOptions = {
  now?: () => string;
  createEventId?: (
    receivedAt: string,
    action: Extract<TauriGlobalHotkeyPayload["action"], "pressed" | "released">,
  ) => string;
};

export type TauriGlobalHotkeyHandler = (
  event: DictationKeyEvent,
) => void | Promise<void>;

export type TauriHostCommandHandler = (
  command: TauriHostCommand,
) => void | Promise<void>;

export function createDictationKeyEventFromTauriHotkey(
  payload: TauriGlobalHotkeyPayload | undefined,
  options: TauriGlobalHotkeyListenerOptions = {},
): DictationKeyEvent | undefined {
  if (!payload?.shortcut) {
    return undefined;
  }

  if (payload.action !== "pressed" && payload.action !== "released") {
    return undefined;
  }

  const receivedAt = payload.receivedAt ?? options.now?.() ?? new Date().toISOString();

  return {
    eventId: options.createEventId?.(receivedAt, payload.action),
    source: "global_hotkey",
    kind: payload.action,
    shortcut: payload.shortcut,
    receivedAt,
  };
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

      void handler(command);
    },
  );
}
