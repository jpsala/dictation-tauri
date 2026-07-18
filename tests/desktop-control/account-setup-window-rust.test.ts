// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("account setup Settings window host boundary", () => {
  it("waits for the configured window without invoking the normal fallback", () => {
    const source = readFileSync("src-tauri/src/settings_window.rs", "utf8");
    const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
    const accountSetup = source.slice(
      source.indexOf("pub fn show_account_setup_window_for_app"),
      source.indexOf("pub fn show_admin_control_room_for_app"),
    );
    const normalSettings = source.slice(
      source.indexOf("pub fn show_settings_window_for_app"),
      source.indexOf("pub fn show_account_setup_window_for_app"),
    );

    expect(accountSetup).toContain("poll_for_value");
    expect(accountSetup).toContain("settings_startup_timeout");
    expect(accountSetup).not.toContain("create_fresh_settings_window");
    expect(normalSettings).toContain("create_fresh_settings_window");
    expect(lib).toContain("settings_window::show_account_setup_window");
  });
});
