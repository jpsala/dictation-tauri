import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Tauri tray background lifecycle", () => {
  it("enables the Tauri tray feature and registers a Rust tray", () => {
    const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
    const lib = readFileSync("src-tauri/src/lib.rs", "utf8");

    expect(cargo).toContain('features = ["tray-icon"]');
    expect(lib).toContain("mod tray;");
    expect(lib).toContain("tray::register_tray(app)?");
  });

  it("uses stable Fixvox-parity tray IDs and show/hide/quit actions", () => {
    const source = readFileSync("src-tauri/src/tray.rs", "utf8");

    expect(source).toContain('TRAY_ID: &str = "dictation-tray"');
    expect(source).toContain('TRAY_MENU_SHOW_DOCK: &str = "show_dock"');
    expect(source).toContain('TRAY_MENU_HIDE_DOCK: &str = "hide_dock"');
    expect(source).toContain('TRAY_MENU_SETTINGS: &str = "settings"');
    expect(source).toContain('TRAY_MENU_QUIT: &str = "quit"');
    expect(source).toContain("show_menu_on_left_click(false)");
    expect(source).toContain("toggle_dock_window(tray.app_handle())");
    expect(source).toContain("app.exit(0)");
  });
});
