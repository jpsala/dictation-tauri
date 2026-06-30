import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Settings host window", () => {
  it("reuses or recreates Settings and lets normal window close work", () => {
    const settingsSource = readFileSync("src-tauri/src/settings_window.rs", "utf8");
    const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");
    const tauriConfig = readFileSync("src-tauri/tauri.conf.json", "utf8");

    expect(libSource).toContain("settings_window::configure_settings_window");
    expect(libSource).toContain("settings_window::close_settings_window");
    expect(libSource).toContain("preview_desktop_control_hotkey_registration");
    expect(libSource).toContain("apply_desktop_control_hotkey_registration");
    expect(tauriConfig).toContain('"label": "settings"');
    expect(tauriConfig).toContain('"url": "index.html#settings"');
    expect(settingsSource).toContain("WindowEvent::CloseRequested");
    expect(settingsSource).toContain("reusing configured window");
    expect(settingsSource).toContain("allowing window close");
    expect(settingsSource).toContain("close_settings_window_for_app");
    expect(settingsSource).toContain(".close()");
    expect(settingsSource).toContain("create_fresh_settings_window");
    expect(settingsSource).not.toContain("api.prevent_close()");
    expect(settingsSource).not.toContain("settings_window.hide()");
    expect(settingsSource).toContain("index.html#settings");
    expect(settingsSource).not.toContain("destroying stale window before open");
    expect(settingsSource).not.toContain("window.destroy()?");
  });
});
