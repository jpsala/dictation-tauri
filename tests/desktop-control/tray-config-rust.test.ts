// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Tauri tray background lifecycle", () => {
  it("enables the Tauri tray feature and registers a Rust tray", () => {
    const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
    const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
    const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(cargo).toContain('"tray-icon"');
    expect(lib).toContain("mod tray;");
    expect(lib).toContain("tray::configure_tray_and_background(app.handle())?");
    expect(tauriConfig.app.windows[0]).toMatchObject({
      label: "main",
      title: "Dictation Dock",
      skipTaskbar: true,
    });
    expect(packageJson.scripts["dev:desktop:refresh"]).toContain("-Refresh");
    expect(packageJson.scripts["dev:desktop:restart"]).toContain("-Refresh");
  });

  it("uses one dock toggle, nested skins/presets, settings, and quit", () => {
    const source = readFileSync("src-tauri/src/tray.rs", "utf8");

    expect(source).toContain('TrayIconBuilder::with_id("dictation-tauri-tray")');
    expect(source).toContain('MENU_TOGGLE_DOCK: &str = "toggle_dock"');
    expect(source).toContain('MENU_PASTE_LAST_SAFE: &str = "paste_last_safe"');
    expect(source).toContain('MENU_SHOW_RESULT_HISTORY: &str = "show_result_history"');
    expect(source).toContain('CheckMenuItemBuilder::with_id(MENU_TOGGLE_DOCK, "Show dock")');
    expect(source).toContain('.text(MENU_PASTE_LAST_SAFE, "Paste last")');
    expect(source).toContain('.text(MENU_SHOW_RESULT_HISTORY, "History")');
    expect(source.match(/CheckMenuItemBuilder::with_id/g)).toHaveLength(1);
    expect(source).toContain('SubmenuBuilder::new(app, "Dock skin")');
    expect(source).toContain('SubmenuBuilder::new(app, "Presets")');
    expect(source).toContain('MENU_PRESET_COMO_YO_ES: &str = "preset_como_yo_es"');
    expect(source).toContain('MENU_PRESET_CORREGIR_TEXTO: &str = "preset_corregir_texto"');
    expect(source).toContain('MENU_PRESET_FIX_WRITING: &str = "preset_fix_writing"');
    expect(source).toContain('MENU_PRESET_LIKE_ME_EN: &str = "preset_like_me_en"');
    expect(source).toContain('MENU_OPEN_SETTINGS: &str = "open_settings"');
    expect(source).toContain('MENU_QUIT: &str = "quit"');
    expect(source).toContain("show_menu_on_left_click(true)");
    expect(source).toContain("dock_shell::show_dock_window(app)");
    expect(source).toContain("dock_shell::hide_dock_window(app)");
    expect(source).toContain('HostMenuAction::PasteLastSafe => ("paste_last_safe", None, None)');
    expect(source).toContain('HostMenuAction::ShowResultHistory => ("show_result_history", None, None)');
    expect(source).toContain("app.exit(0)");
  });

  it("keeps a refresh helper for restoring the instantiated dock window", () => {
    const source = readFileSync("scripts/dev-dock.ps1", "utf8");

    expect(source).toContain("[switch]$Refresh");
    expect(source).toContain("function Refresh-DevDockWindow");
    expect(source).toContain("dockWindow=refreshed");
    expect(source).toContain("SWP_SHOWWINDOW");
  });
});
