import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Settings host window", () => {
  it("reopens settings from a fresh WebView to avoid stale white windows", () => {
    const settingsSource = readFileSync("src-tauri/src/settings_window.rs", "utf8");
    const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");

    expect(libSource).toContain("settings_window::configure_settings_window");
    expect(libSource).toContain("preview_desktop_control_hotkey_registration");
    expect(libSource).toContain("apply_desktop_control_hotkey_registration");
    expect(settingsSource).toContain("WindowEvent::CloseRequested");
    expect(settingsSource).toContain("destroying stale window before open");
    expect(settingsSource).toContain("window.destroy()?");
    expect(settingsSource).toContain("WebviewWindowBuilder::new");
    expect(settingsSource).toContain("index.html?surface=settings");
    expect(settingsSource).toContain("create_fresh_settings_window");
    expect(settingsSource).not.toContain("api.prevent_close()");
    expect(settingsSource).not.toContain("settings_window.hide()");
  });
});
