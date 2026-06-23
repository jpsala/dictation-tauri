import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { TauriDesktopDeliveryTarget } from "../delivery/tauri-desktop-delivery";
import type { DictationKeyEvent } from "./dictation-key";

export const tauriPrimaryDictationKeyShortcut = "Alt+Space";
export const tauriFallbackDictationKeyShortcut = "Ctrl+Shift+F9";
export const tauriSupportedDictationKeyShortcuts = [
  tauriPrimaryDictationKeyShortcut,
  tauriFallbackDictationKeyShortcut,
] as const;
export const tauriGlobalHotkeyShortcut = tauriPrimaryDictationKeyShortcut;
export const tauriGlobalHotkeyEventName = "desktop-control://global-hotkey";

export type TauriGlobalHotkeyPayload = {
  source?: "global_hotkey";
  action?: "pressed" | "released" | "toggle";
  shortcut?: string;
  receivedAt?: string;
  targetSnapshot?: TauriDesktopDeliveryTarget;
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

export function createDictationKeyEventFromTauriHotkey(
  payload: TauriGlobalHotkeyPayload | undefined,
  options: TauriGlobalHotkeyListenerOptions = {},
): DictationKeyEvent | undefined {
  if (!payload?.shortcut || !isSupportedDictationKeyShortcut(payload.shortcut)) {
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
    ...(payload.targetSnapshot ? { targetSnapshot: payload.targetSnapshot } : {}),
  };
}

function isSupportedDictationKeyShortcut(
  shortcut: string,
): shortcut is (typeof tauriSupportedDictationKeyShortcuts)[number] {
  return tauriSupportedDictationKeyShortcuts.includes(
    shortcut as (typeof tauriSupportedDictationKeyShortcuts)[number],
  );
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
