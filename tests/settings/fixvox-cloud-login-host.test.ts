// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pollFixvoxCloudLogin, startFixvoxCloudLogin } from "../../src/settings/fixvox-cloud-control";

describe("Fixvox Cloud host-owned login start", () => {
  it("exposes a device-code polling command without exposing session secrets to React", async () => {
    await expect(startFixvoxCloudLogin()).resolves.toBeUndefined();
    await expect(pollFixvoxCloudLogin()).resolves.toBeUndefined();

    const rustSource = readFileSync("src-tauri/src/fixvox_cloud.rs", "utf8");
    const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");
    const rendererSource = readFileSync("src/settings/fixvox-cloud-control.ts", "utf8");
    const settingsSurfaceSource = readFileSync("src/settings/SettingsSurface.tsx", "utf8");

    expect(rustSource).toContain("start_fixvox_cloud_login");
    expect(rustSource).toContain("get_fixvox_auth_session_status");
    expect(rustSource).toContain("poll_fixvox_cloud_login");
    expect(rustSource).toContain("device_code_polling");
    expect(rustSource).toContain("build_fixvox_login_verification_url");
    expect(rustSource).toContain("/desktop/login/link-device");
    expect(rustSource).toContain("build_desktop_login_device_link_request");
    expect(rustSource).toContain("link_signed_in_session_device_with_reqwest");
    expect(rustSource).toContain("device_state_has_signed_in_auth_policy");
    expect(rustSource).toContain("open_external_browser_url");
    expect(rustSource).toContain("state_redacted");
    expect(rustSource).toContain("session_id_redacted");
    expect(rustSource).toContain("fixvox-auth-session.v1.json");
    expect(rustSource).toContain("session_secret");
    expect(rustSource).toContain("refresh_secret");
    expect(rustSource).not.toContain("refresh_token");
    expect(rustSource).not.toContain("access_token");

    expect(libSource).toContain("fixvox_cloud::start_fixvox_cloud_login");
    expect(libSource).toContain("fixvox_cloud::get_fixvox_auth_session_status");
    expect(libSource).toContain("fixvox_cloud::poll_fixvox_cloud_login");
    expect(rendererSource).toContain("start_fixvox_cloud_login");
    expect(rendererSource).toContain("get_fixvox_auth_session_status");
    expect(rendererSource).toContain("poll_fixvox_cloud_login");
    expect(rendererSource).toContain("verificationUrlRedacted");
    expect(settingsSurfaceSource).toContain("Cuenta conectada. Esta computadora ya está lista para dictar.");
    expect(settingsSurfaceSource).toContain("Esta pantalla se actualizará automáticamente");
    expect(settingsSurfaceSource).not.toContain("Comprobar estado");
    expect(rendererSource).not.toContain("sessionSecret");
    expect(rendererSource).not.toContain("refreshSecret");
    expect(rendererSource).not.toContain("localStorage");
    expect(rendererSource).not.toContain("sessionStorage");
  });
});
