import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    isTauri?: boolean;
    __TAURI_INTERNALS__?: { invoke: (cmd: string) => Promise<unknown> };
    __testInvokeCalls?: string[];
  }
}

test("not-signed-in dock shows an actionable connect pill", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      invoke(cmd: string): Promise<unknown> {
        calls.push(cmd);
        if (cmd === "get_fixvox_setup_readiness") {
          return Promise.resolve({
            schemaVersion: 1,
            phase: "service_unavailable",
            ready: false,
            redacted: true,
          });
        }
        if (cmd === "hide_dock" || cmd === "show_account_setup_window") {
          return Promise.resolve(null);
        }
        return Promise.reject(new Error(`unexpected command ${cmd}`));
      },
    };
    window.__testInvokeCalls = calls;
  });

  await page.setViewportSize({ width: 132, height: 36 });
  await page.goto("/");

  const connect = page.getByRole("button", { name: /Conectá tu cuenta/ });
  await expect(connect).toBeVisible();
  await expect(page.getByText("Verificando", { exact: false })).toHaveCount(0);

  await page.screenshot({ path: "artifacts/account-gate/not-logged-in.png" });

  await connect.click();
  await expect(page.getByText("Abriendo configuración", { exact: false })).toBeVisible();
  const calls = await page.evaluate(() => window.__testInvokeCalls ?? []);
  expect(calls).toContain("hide_dock");
  expect(calls).toContain("show_account_setup_window");
});
