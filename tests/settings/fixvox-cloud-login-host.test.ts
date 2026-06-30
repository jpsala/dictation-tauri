import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { startFixvoxCloudLogin } from "../../src/settings/fixvox-cloud-control";

describe("Fixvox Cloud host-owned login start", () => {
  it("exposes a device-code polling command without exposing session secrets to React", async () => {
    await expect(startFixvoxCloudLogin()).resolves.toBeUndefined();

    const rustSource = readFileSync("src-tauri/src/fixvox_cloud.rs", "utf8");
    const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");
    const rendererSource = readFileSync("src/settings/fixvox-cloud-control.ts", "utf8");

    expect(rustSource).toContain("start_fixvox_cloud_login");
    expect(rustSource).toContain("get_fixvox_auth_session_status");
    expect(rustSource).toContain("device_code_polling");
    expect(rustSource).toContain("build_fixvox_login_verification_url");
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
    expect(rendererSource).toContain("start_fixvox_cloud_login");
    expect(rendererSource).toContain("get_fixvox_auth_session_status");
    expect(rendererSource).toContain("verificationUrlRedacted");
    expect(rendererSource).not.toContain("sessionSecret");
    expect(rendererSource).not.toContain("refreshSecret");
    expect(rendererSource).not.toContain("localStorage");
    expect(rendererSource).not.toContain("sessionStorage");
  });
});
