import { describe, expect, test } from "bun:test";
import { buildControlPlaneAdminPage } from "./control-plane-admin-page";

describe("control-plane-admin-page", () => {
  test("renders simplified admin access labels and hides endpoint in advanced settings", async () => {
    const response = buildControlPlaneAdminPage(new Request("http://127.0.0.1:8787/control-plane-admin"));
    const html = await response.text();

    expect(html).toContain("Admin Access");
    expect(html).toContain("Unlock Admin");
    expect(html).toContain("Reload from Server");
    expect(html).toContain("Advanced connection settings");
    expect(html).not.toContain('<span class="conn-label">Endpoint</span>');
  });

  test("loads persisted policies on startup only when a saved token exists", async () => {
    const response = buildControlPlaneAdminPage(new Request("http://127.0.0.1:8787/control-plane-admin"));
    const html = await response.text();
    const startupBlock = html.slice(
      html.indexOf('window.addEventListener("DOMContentLoaded", () => {'),
      html.indexOf("});\n  </script>"),
    );

    expect(startupBlock).toContain("if (state.token) {");
    expect(startupBlock).toContain("unlockAdmin().catch(() => {});");
    expect(startupBlock).not.toContain("applyAlphaTemplate();");
  });

  test("renders explicit admin error mapping for missing worker auth config", async () => {
    const response = buildControlPlaneAdminPage(new Request("http://127.0.0.1:8787/control-plane-admin"));
    const html = await response.text();

    expect(html).toContain("Worker admin auth is not configured. Set ADMIN_API_KEY in proxy/.dev.vars and restart wrangler dev.");
    expect(html).toContain("Admin token is missing or invalid.");
    expect(html).toContain("Cannot reach the saved admin endpoint:");
  });

  test("renders endpoint-aware connectivity guidance", async () => {
    const response = buildControlPlaneAdminPage(new Request("http://127.0.0.1:8787/control-plane-admin"));
    const html = await response.text();

    expect(html).toContain("Cannot reach the saved admin endpoint:");
    expect(html).toContain("function messageFromAdminError(error, baseUrl)");
  });

  test("renders dirty-state script markers and unload protection", async () => {
    const response = buildControlPlaneAdminPage(new Request("http://127.0.0.1:8787/control-plane-admin"));
    const html = await response.text();

    expect(html).toContain("Unsaved changes");
    expect(html).toContain("window.addEventListener(\"beforeunload\"");
    expect(html).toContain("setDirtyState(true)");
  });

  test("renders runtime speech route preview and compatibility warning hooks", async () => {
    const response = buildControlPlaneAdminPage(new Request("http://127.0.0.1:8787/control-plane-admin"));
    const html = await response.text();

    expect(html).toContain("Default speech route preview");
    expect(html).toContain("runtime-health-msg");
    expect(html).toContain("function updateRuntimeHealthNotice(policy)");
  });

  test("renders assistant chat and quick chat prompt editors", async () => {
    const response = buildControlPlaneAdminPage(new Request("http://127.0.0.1:8787/control-plane-admin"));
    const html = await response.text();

    expect(html).toContain("Assistant Prompt");
    expect(html).toContain("assistant-chat-prompt");
    expect(html).toContain("Assistant Quick Chat Prompt");
  });

  test("renders read-only devices admin page", async () => {
    const response = buildControlPlaneAdminPage(new Request("http://127.0.0.1:8787/control-plane-admin"));
    const html = await response.text();

    expect(html).toContain('data-page="devices"');
    expect(html).toContain('id="page-devices"');
    expect(html).toContain("manual policy assignment");
    expect(html).toContain("/admin/control-plane/devices?limit=50");
    expect(html).toContain("/admin/control-plane/devices/policy");
    expect(html).toContain("function renderDevicesTable(devices)");
  });
});
