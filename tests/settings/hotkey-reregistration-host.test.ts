import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("host-owned hotkey re-registration", () => {
  it("exposes preview/apply commands with rollback and no renderer-owned shortcut plugin", () => {
    const rustSource = readFileSync("src-tauri/src/desktop_control.rs", "utf8");
    const rendererSource = readFileSync("src/desktop-control/tauri-host-control.ts", "utf8");

    expect(rustSource).toContain("preview_desktop_control_hotkey_registration");
    expect(rustSource).toContain("apply_desktop_control_hotkey_registration");
    expect(rustSource).toContain("preview_hotkey_registration_request");
    expect(rustSource).toContain("apply_hotkey_registration_request");
    expect(rustSource).toContain("swap_registered_hotkey");
    expect(rustSource).toContain("rollback_failed");
    expect(rustSource).toContain("verify_effective_hotkey");
    expect(rustSource).toContain("set_alt_space_enabled");
    expect(rustSource).toContain("is_alt_space_enabled");
    expect(rustSource).toContain("unsupported_shortcut");

    expect(rendererSource).toContain("preview_desktop_control_hotkey_registration");
    expect(rendererSource).toContain("apply_desktop_control_hotkey_registration");
    expect(rendererSource).not.toContain("@tauri-apps/plugin-global-shortcut");
    expect(rendererSource).not.toContain("register(");
    expect(rendererSource).not.toContain("unregister(");
    expect(rendererSource).not.toContain("localStorage");
  });
});
