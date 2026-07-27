// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("account setup window host boundary", () => {
  it("uses a dedicated onboarding window instead of navigating Settings", () => {
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

    expect(source).toContain('ACCOUNT_SETUP_WINDOW_LABEL: &str = "account-setup"');
    expect(source).toContain('ACCOUNT_SETUP_WINDOW_URL: &str = "index.html?surface=onboarding"');
    expect(accountSetup).toContain("create_fresh_account_setup_window");
    expect(accountSetup).toContain("ACCOUNT_SETUP_WINDOW_LABEL");
    expect(accountSetup).not.toContain("SETTINGS_WINDOW_LABEL");
    expect(normalSettings).toContain("create_fresh_settings_window");
    expect(normalSettings).not.toContain("ACCOUNT_SETUP_WINDOW_LABEL");
    expect(lib).toContain("settings_window::show_account_setup_window");
  });
});
