import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createDictationKeyEventFromTauriHotkey,
  tauriDefaultGlobalHotkeyShortcut,
  tauriGlobalHotkeyEventName,
  tauriGlobalHotkeyShortcut,
  tauriHostCommandEventName,
  type TauriHostCommandPayload,
} from "../../src/desktop-control/tauri-host-control";

const forbiddenHotkeyBoundaryMarkers = [
  "paste_observed",
  "paste_sent",
  "navigator.clipboard",
  "writeText(",
  "readText(",
  "document.execCommand",
  "@tauri-apps/plugin-global-shortcut",
  "register(",
  "registerAll(",
] as const;

describe("Tauri host-owned global hotkey boundary", () => {
  it("maps Rust-owned pressed and released payloads to dictation key events", () => {
    expect(
      createDictationKeyEventFromTauriHotkey(
        {
          source: "global_hotkey",
          action: "pressed",
          shortcut: tauriGlobalHotkeyShortcut,
          receivedAt: "2026-06-23T12:10:00.000Z",
        },
        {
          createEventId: (receivedAt, action) => `global-hotkey:${action}:${receivedAt}`,
        },
      ),
    ).toEqual({
      eventId: "global-hotkey:pressed:2026-06-23T12:10:00.000Z",
      source: "global_hotkey",
      kind: "pressed",
      shortcut: tauriGlobalHotkeyShortcut,
      receivedAt: "2026-06-23T12:10:00.000Z",
    });

    expect(
      createDictationKeyEventFromTauriHotkey(
        {
          source: "global_hotkey",
          action: "released",
          shortcut: tauriGlobalHotkeyShortcut,
          receivedAt: "2026-06-23T12:10:00.100Z",
        },
        {
          createEventId: (receivedAt, action) => `global-hotkey:${action}:${receivedAt}`,
        },
      ),
    ).toEqual({
      eventId: "global-hotkey:released:2026-06-23T12:10:00.100Z",
      source: "global_hotkey",
      kind: "released",
      shortcut: tauriGlobalHotkeyShortcut,
      receivedAt: "2026-06-23T12:10:00.100Z",
    });
  });

  it("ignores unexpected host shortcut payloads and legacy toggle payloads", () => {
    expect(
      createDictationKeyEventFromTauriHotkey({
        source: "global_hotkey",
        action: "pressed",
      }),
    ).toBeUndefined();

    expect(
      createDictationKeyEventFromTauriHotkey({
        source: "global_hotkey",
        action: "toggle",
        shortcut: tauriGlobalHotkeyShortcut,
      }),
    ).toBeUndefined();
  });

  it("keeps the renderer adapter listen-only with no shortcut registration or paste side effects", () => {
    const source = readFileSync("src/desktop-control/tauri-host-control.ts", "utf8");

    expect(tauriDefaultGlobalHotkeyShortcut).toBe("Ctrl+Shift+F9");
    expect(tauriGlobalHotkeyEventName).toBe("desktop-control://global-hotkey");
    expect(tauriHostCommandEventName).toBe("desktop-control://host-command");
    for (const marker of forbiddenHotkeyBoundaryMarkers) {
      expect(source, `tauri-host-control.ts must not contain ${marker}`).not.toContain(
        marker,
      );
    }
  });

  it("models enriched tray/context host commands without desktop side effects", () => {
    const presetPayload: TauriHostCommandPayload = {
      source: "tray_or_context_menu",
      command: "select_preset",
      presetId: "rewrite",
    };
    const historyPayload: TauriHostCommandPayload = {
      source: "tray_or_context_menu",
      command: "show_result_history",
    };

    expect(presetPayload.presetId).toBe("rewrite");
    expect(historyPayload.command).toBe("show_result_history");
  });

  it("keeps Rust hotkey registration host-owned with a gated Alt+Space path", () => {
    const source = readFileSync("src-tauri/src/desktop_control.rs", "utf8");

    expect(source).toContain("Ctrl+Shift+F9");
    expect(source).toContain("Alt+Space");
    expect(source).toContain("DICTATION_TAURI_ALLOW_ALT_SPACE");
    expect(source).toContain("WH_KEYBOARD_LL");
    expect(source).toContain(tauriGlobalHotkeyEventName);
    expect(source).toContain("global_hotkey");
    expect(source).toContain("pressed");
    expect(source).toContain("released");
    expect(source).not.toContain("paste_observed");
  });
});
