import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    isTauri?: boolean;
    __TAURI_INTERNALS__?: { invoke: (cmd: string) => Promise<unknown> };
  }
}

test("logged-in shows a small closable confirmation", async ({ page }) => {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      invoke(cmd: string): Promise<unknown> {
        if (cmd === "get_fixvox_setup_readiness") {
          return Promise.resolve({
            schemaVersion: 1,
            phase: "ready",
            ready: true,
            redacted: true,
          });
        }
        return Promise.reject(new Error(`unexpected command ${cmd}`));
      },
    };
  });

  await page.setViewportSize({ width: 440, height: 400 });
  await page.goto("/?surface=onboarding");

  const confirm = page.getByText("Ya está logueado");
  await expect(confirm).toBeVisible();
  await expect(page.getByRole("button", { name: "Cerrar" })).toBeVisible();
  await page.screenshot({ path: "artifacts/account-gate/logged-in-confirmation.png" });
});
