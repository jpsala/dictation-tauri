import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  createDesktopControlEvent,
  type DesktopControlEvent,
} from "./types";

export const tauriGlobalHotkeyShortcut = "Ctrl+Shift+F9";
export const tauriGlobalHotkeyEventName = "desktop-control://global-hotkey";

export type TauriGlobalHotkeyPayload = {
  source?: "global_hotkey";
  action?: "toggle";
  shortcut?: string;
  receivedAt?: string;
};

export type TauriGlobalHotkeyListenerOptions = {
  now?: () => string;
  createEventId?: (receivedAt: string) => string;
};

export type TauriGlobalHotkeyHandler = (
  event: DesktopControlEvent,
) => void | Promise<void>;

export function createDesktopControlEventFromTauriHotkey(
  payload: TauriGlobalHotkeyPayload | undefined,
  options: TauriGlobalHotkeyListenerOptions = {},
): DesktopControlEvent | undefined {
  if (payload?.shortcut !== tauriGlobalHotkeyShortcut) {
    return undefined;
  }

  const receivedAt = payload.receivedAt ?? options.now?.() ?? new Date().toISOString();

  return createDesktopControlEvent({
    id: options.createEventId?.(receivedAt),
    source: "global_hotkey",
    action: "toggle",
    receivedAt,
  });
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
      const controlEvent = createDesktopControlEventFromTauriHotkey(
        event.payload,
        options,
      );

      if (!controlEvent) {
        return;
      }

      void handler(controlEvent);
    },
  );
}
