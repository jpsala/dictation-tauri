// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Settings host window", () => {
  it("reuses or recreates Settings and lets normal window close work", () => {
    const settingsSource = readFileSync("src-tauri/src/settings_window.rs", "utf8");
    const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");
    const tauriConfig = readFileSync("src-tauri/tauri.conf.json", "utf8");
    const settingsFunction = settingsSource.slice(
      settingsSource.indexOf("pub fn show_settings_window_for_app"),
      settingsSource.indexOf("pub fn show_dictation_lab_window_for_app"),
    );

    expect(libSource).toContain("settings_window::configure_settings_window");
    expect(libSource).not.toContain("settings_window::close_settings_window");
    expect(libSource).toContain("preview_desktop_control_hotkey_registration");
    expect(libSource).toContain("apply_desktop_control_hotkey_registration");
    expect(tauriConfig).toContain('"label": "settings"');
    expect(tauriConfig).toContain('"url": "index.html#settings"');
    expect(settingsSource).toContain("WindowEvent::CloseRequested");
    expect(settingsFunction).toContain("reusing configured window");
    expect(settingsSource).toContain("allowing window close");
    expect(settingsFunction).toContain("create_fresh_settings_window");
    expect(settingsSource).not.toContain("close_settings_window_for_app");
    expect(settingsSource).not.toContain("api.prevent_close()");
    expect(settingsSource).not.toContain("settings_window.hide()");
    expect(settingsSource).toContain("index.html#settings");
    expect(settingsFunction).toContain("show_existing_settings_window(window)");
    expect(settingsFunction).not.toContain(".eval(");
    expect(settingsFunction).not.toContain("window.location.replace");
    const laboratoryFunction = settingsSource.slice(
      settingsSource.indexOf("pub fn show_dictation_lab_window_for_app"),
      settingsSource.indexOf("pub fn show_account_setup_window_for_app"),
    );
    expect(laboratoryFunction).toContain("create_fresh_dictation_lab_window");
    expect(laboratoryFunction).toContain("show_existing_settings_window(window)");
    expect(laboratoryFunction).not.toContain(".eval(");
    expect(laboratoryFunction).not.toContain("location.replace");
    expect(libSource).toContain("DICTATION_LAB_SMOKE_OFFLINE");
    expect(libSource).toContain("DICTATION_LAB_SMOKE_AUTO_SHOW");
    expect(libSource).toContain("DICTATION_LAB_SMOKE_REPLAY");
    expect(settingsSource).toContain('ACCOUNT_SETUP_WINDOW_LABEL: &str = "account-setup"');
    expect(settingsSource).toContain("create_fresh_account_setup_window");
    expect(settingsSource).not.toContain("destroying stale window before open");
    expect(settingsSource).not.toContain("window.destroy()?");
  });

  it("keeps the laboratory fallback dimensions in parity with the configured native floor", () => {
    const settingsSource = readFileSync("src-tauri/src/settings_window.rs", "utf8");
    const tauriConfig = JSON.parse(
      readFileSync("src-tauri/tauri.conf.json", "utf8"),
    ) as {
      app: {
        windows: Array<{
          label: string;
          width?: number;
          height?: number;
          minWidth?: number;
          minHeight?: number;
        }>;
      };
    };
    const laboratoryFallback = settingsSource.slice(
      settingsSource.indexOf("fn create_fresh_dictation_lab_window"),
      settingsSource.indexOf("fn create_fresh_account_setup_window"),
    );
    const fallback = laboratoryFallback.match(
      /\.inner_size\(([\d.]+), ([\d.]+)\)\s*\.min_inner_size\(([\d.]+), ([\d.]+)\)/s,
    );
    const laboratory = tauriConfig.app.windows.find(
      (window) => window.label === "dictation-lab",
    );

    expect(laboratory).toMatchObject({
      width: 720,
      height: 620,
      minWidth: 720,
      minHeight: 620,
    });
    expect(fallback?.slice(1)).toEqual(["720.0", "620.0", "720.0", "620.0"]);
  });

  it("opens the authenticated Control Room only through a host-owned admin boundary", () => {
    const settingsSource = readFileSync("src-tauri/src/settings_window.rs", "utf8");
    const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");
    const capabilities = readFileSync("src-tauri/capabilities/default.json", "utf8");

    expect(libSource).toContain("settings_window::show_admin_control_room");
    expect(settingsSource).toContain("policy_allows_admin_settings");
    expect(settingsSource).toContain("open_external_browser_url(url.as_str())");
    expect(settingsSource).toContain("admin control room browser open failed");
    expect(settingsSource).toContain("FIXVOX_ADMIN_CONTROL_ROOM_URL");
    expect(settingsSource).toContain("https://fixvox.jpsala.dev/admin/pi");
    expect(settingsSource).not.toContain("ADMIN_API_KEY");
    expect(capabilities).not.toContain("admin-control-room");
  });
});
