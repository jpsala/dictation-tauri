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
          shortcut: tauriPrimaryDictationKeyShortcut,
          receivedAt: "2026-06-23T12:09:59.000Z",
          targetSnapshot: {
            frameHwnd: "1234",
            windowTitle: "Smoke target",
            windowClass: "Notepad",
            processId: 42,
            inputLike: true,
            reason: "foreground target captured by native hotkey handler",
          },
        },
        {
          createEventId: (receivedAt, action) => `global-hotkey:${action}:${receivedAt}`,
        },
      ),
    ).toEqual({
      eventId: "global-hotkey:pressed:2026-06-23T12:09:59.000Z",
      source: "global_hotkey",
      kind: "pressed",
      shortcut: tauriPrimaryDictationKeyShortcut,
      receivedAt: "2026-06-23T12:09:59.000Z",
      targetSnapshot: {
        frameHwnd: "1234",
        windowTitle: "Smoke target",
        windowClass: "Notepad",
        processId: 42,
        inputLike: true,
        reason: "foreground target captured by native hotkey handler",
      },
    });
  });

  it("maps fallback Ctrl+Shift+F9 pressed and released payloads to dictation key events", () => {
    expect(
      createDictationKeyEventFromTauriHotkey(
        {
          source: "global_hotkey",
          action: "pressed",
          shortcut: tauriFallbackDictationKeyShortcut,
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
      shortcut: tauriFallbackDictationKeyShortcut,
      receivedAt: "2026-06-23T12:10:00.000Z",
    });

    expect(
      createDictationKeyEventFromTauriHotkey(
        {
          source: "global_hotkey",
          action: "released",
          shortcut: tauriFallbackDictationKeyShortcut,
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
      shortcut: tauriFallbackDictationKeyShortcut,
      receivedAt: "2026-06-23T12:10:00.100Z",
    });
  });

  it("maps Rust-owned Escape payloads to cancel events", () => {
    expect(
      createDictationKeyEventFromTauriHotkey(
        {
          source: "global_hotkey",
          action: "cancel",
          shortcut: "Escape",
          receivedAt: "2026-06-25T15:00:00.000Z",
        },
        {
          createEventId: (receivedAt, action) => `global-hotkey:${action}:${receivedAt}`,
        },
      ),
    ).toEqual({
      eventId: "global-hotkey:cancel:2026-06-25T15:00:00.000Z",
      source: "global_hotkey",
      kind: "cancel",
      shortcut: "Escape",
      receivedAt: "2026-06-25T15:00:00.000Z",
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
        shortcut: tauriFallbackDictationKeyShortcut,
      }),
    ).toBeUndefined();
  });

  it("keeps the renderer adapter listen-only with no shortcut registration or paste side effects", () => {
    const source = readFileSync("src/desktop-control/tauri-host-control.ts", "utf8");

    expect(tauriDefaultGlobalHotkeyShortcut).toBe("Alt+Space");
    expect(tauriGlobalHotkeyEventName).toBe("desktop-control://global-hotkey");
    expect(tauriHostCommandEventName).toBe("desktop-control://host-command");
    for (const marker of forbiddenHotkeyBoundaryMarkers) {
      expect(source, `tauri-host-control.ts must not contain ${marker}`).not.toContain(
        marker,
      );
    }
  });

  it("models enriched tray/context and paste-last host commands without desktop side effects", () => {
    const presetPayload: TauriHostCommandPayload = {
      source: "tray_or_context_menu",
      command: "select_preset",
      presetId: "rewrite",
    };
    const historyPayload: TauriHostCommandPayload = {
      source: "tray_or_context_menu",
      command: "show_result_history",
    };
    const pasteLastPayload: TauriHostCommandPayload = {
      source: "global_hotkey",
      command: "paste_last_safe",
    };

    expect(presetPayload.presetId).toBe("rewrite");
    expect(historyPayload.command).toBe("show_result_history");
    expect(pasteLastPayload.command).toBe("paste_last_safe");
  });

  it("keeps Rust hotkey registration host-owned with a gated Alt+Space path", () => {
    const source = readFileSync("src-tauri/src/desktop_control.rs", "utf8");

    expect(source).toContain("Alt+Space");
    expect(source).toContain("Ctrl+Shift+F9");
    expect(source).toContain("Alt+Space");
    expect(source).toContain("Alt+3");
    expect(source).toContain("Code::Digit3");
    expect(source).toContain("DICTATION_TAURI_ALLOW_ALT_SPACE");
    expect(source).toContain("hotkey-preferences.v1.json");
    expect(source).toContain("resolve_effective_dictation_hotkey_from_app");
    expect(source).toContain("write_hotkey_preference");
    expect(source).toContain("preference_persisted");
    expect(source).toContain("WH_KEYBOARD_LL");
    expect(source).toContain(tauriGlobalHotkeyEventName);
    expect(source).toContain("global_hotkey");
    expect(source).toContain("pressed");
    expect(source).toContain("released");
    expect(source).toContain("Escape");
    expect(source).toContain("Alt+Shift+X");
    expect(source).toContain("paste_last_safe");
    expect(source).toContain("set_desktop_control_escape_cancel_enabled");
    expect(source).toContain("set_desktop_control_hotkey_capture_enabled");
    expect(source).toContain("desktop-control://hotkey-capture");
    expect(source).toContain("VK_ESCAPE");
    expect(source).not.toContain("paste_observed");
  });
});
