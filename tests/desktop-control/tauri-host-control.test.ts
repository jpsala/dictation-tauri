import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createDictationKeyEventFromTauriHotkey,
  tauriFallbackDictationKeyShortcut,
  tauriGlobalHotkeyEventName,
  tauriGlobalHotkeyShortcut,
  tauriPrimaryDictationKeyShortcut,
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
  it("maps Rust-owned primary Alt+Space pressed payloads to dictation key events", () => {
    expect(tauriGlobalHotkeyShortcut).toBe(tauriPrimaryDictationKeyShortcut);

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

  it("ignores unexpected host shortcut payloads and legacy toggle payloads", () => {
    expect(
      createDictationKeyEventFromTauriHotkey({
        source: "global_hotkey",
        action: "pressed",
        shortcut: "Ctrl+Alt+Delete",
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

    expect(tauriGlobalHotkeyEventName).toBe("desktop-control://global-hotkey");
    for (const marker of forbiddenHotkeyBoundaryMarkers) {
      expect(source, `tauri-host-control.ts must not contain ${marker}`).not.toContain(
        marker,
      );
    }
  });

  it("keeps Rust hotkey registration scoped to the primary dictation key, fallback shortcut, and event", () => {
    const source = readFileSync("src-tauri/src/desktop_control.rs", "utf8");

    expect(source).toContain("Alt+Space");
    expect(source).toContain("Ctrl+Shift+F9");
    expect(source).toContain("Modifiers::ALT");
    expect(source).toContain("Code::Space");
    expect(source).toContain(tauriGlobalHotkeyEventName);
    expect(source).toContain("global_hotkey");
    expect(source).toContain("pressed");
    expect(source).toContain("released");
    expect(source).not.toContain("paste_observed");
  });
});
