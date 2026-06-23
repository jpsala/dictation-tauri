import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createDesktopControlEventFromTauriHotkey,
  tauriGlobalHotkeyEventName,
  tauriGlobalHotkeyShortcut,
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
  it("maps the fixed Rust-owned hotkey payload to a toggle control event", () => {
    expect(
      createDesktopControlEventFromTauriHotkey(
        {
          source: "global_hotkey",
          action: "toggle",
          shortcut: tauriGlobalHotkeyShortcut,
          receivedAt: "2026-06-23T12:10:00.000Z",
        },
        {
          createEventId: (receivedAt) => `global-hotkey:${receivedAt}`,
        },
      ),
    ).toEqual({
      id: "global-hotkey:2026-06-23T12:10:00.000Z",
      source: "global_hotkey",
      action: "toggle",
      receivedAt: "2026-06-23T12:10:00.000Z",
    });
  });

  it("ignores unexpected host shortcut payloads", () => {
    expect(
      createDesktopControlEventFromTauriHotkey({
        source: "global_hotkey",
        action: "toggle",
        shortcut: "Ctrl+Alt+Delete",
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

  it("keeps Rust hotkey registration scoped to the approved fixed shortcut and event", () => {
    const source = readFileSync("src-tauri/src/desktop_control.rs", "utf8");

    expect(source).toContain("Ctrl+Shift+F9");
    expect(source).toContain(tauriGlobalHotkeyEventName);
    expect(source).toContain("global_hotkey");
    expect(source).toContain("toggle");
    expect(source).not.toContain("paste_observed");
  });
});
