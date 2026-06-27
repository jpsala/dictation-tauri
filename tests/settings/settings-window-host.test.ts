import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Settings host window", () => {
  it("reopens settings after the window is closed by hiding or recreating it", () => {
    const settingsSource = readFileSync("src-tauri/src/settings_window.rs", "utf8");
    const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");

    expect(libSource).toContain("settings_window::configure_settings_window");
    expect(libSource).toContain("preview_desktop_control_hotkey_registration");
    expect(libSource).toContain("apply_desktop_control_hotkey_registration");
    expect(settingsSource).toContain("WindowEvent::CloseRequested");
    expect(settingsSource).toContain("api.prevent_close()");
    expect(settingsSource).toContain("settings_window.hide()");
    expect(settingsSource).toContain("WebviewWindowBuilder::new");
    expect(settingsSource).toContain("index.html?surface=settings");
    expect(settingsSource).toContain("get_or_create_settings_window");
  });
});
