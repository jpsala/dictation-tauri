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

  it("uses stable Fixvox-parity tray IDs and show/hide/quit actions", () => {
    const source = readFileSync("src-tauri/src/tray.rs", "utf8");

    expect(source).toContain('TrayIconBuilder::with_id("dictation-tauri-tray")');
    expect(source).toContain('MENU_SHOW_DOCK: &str = "show_dock"');
    expect(source).toContain('MENU_HIDE_DOCK: &str = "hide_dock"');
    expect(source).toContain('MENU_OPEN_SETTINGS: &str = "open_settings"');
    expect(source).toContain('MENU_QUIT: &str = "quit"');
    expect(source).toContain("show_menu_on_left_click(true)");
    expect(source).toContain("dock_shell::show_dock_window(app)");
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
