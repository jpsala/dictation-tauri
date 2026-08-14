import { expect, test } from "@playwright/test";

test("renders Compact 5 as the default fake capture surface", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("capture-surface")).toBeVisible();
  await expect(page.getByTestId("voice-dock")).toBeVisible();
  await expect(page.getByTestId("voice-dock")).toHaveAttribute("data-skin", "compact-5");
  await expect(page.getByTestId("voice-dock-state-chip")).toHaveText("Ready");
  await expect(page.getByTestId("voice-dock-vu-dot")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await expect(page.getByText("paste observed", { exact: false })).toHaveCount(0);
});

test("runs a fake start and stop capture flow from the dock", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByTestId("voice-dock-state-chip")).toHaveText("Recording");

  await page.getByRole("button", { name: "Stop & review" }).click();
  await expect(page.getByTestId("voice-dock-state-chip")).toHaveText("Needs attention");
  await expect(page.getByText("paste observed", { exact: false })).toHaveCount(0);
});

test("keeps developer/provider controls hidden from the compact dock", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Developer evidence")).toBeHidden();
  await expect(page.getByRole("button", { name: "Transcribe with provider" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Paste last (safe)" })).toBeHidden();
});

test("runs a fake cancellation flow from the dock", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByTestId("voice-dock-state-chip")).toHaveText("Ready");
  await expect(page.getByTestId("capture-state")).toHaveText("Ready");
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await expect(page.getByText("Dictation cancelled", { exact: false })).toHaveCount(0);
});

test("resets settings content scroll when switching rail sections", async ({ page }) => {
  await page.goto("/?surface=settings");

  const content = page.locator(".settings-content");
  await expect(content).toBeVisible();
  await page.getByRole("button", { name: /Dictado/ }).click();
  await expect(
    page.getByRole("switch", { name: "Mejorar grabaciones con volumen bajo" }),
  ).toBeChecked();
  await content.evaluate((element) => {
    const owner = element as HTMLElement;
    owner.style.overflowY = "auto";
    owner.style.height = "120px";
    owner.style.maxHeight = "120px";

    const spacer =
      owner.querySelector<HTMLElement>("[data-test-scroll-spacer]") ?? document.createElement("div");
    spacer.dataset.testScrollSpacer = "true";
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.cssText = "height: 1200px; flex: none; pointer-events: none;";
    owner.appendChild(spacer);
    owner.scrollTop = 240;
  });
  await expect.poll(() => content.evaluate((element) => (element as HTMLElement).scrollTop)).toBeGreaterThan(0);
  await page.getByRole("button", { name: /Atajos/ }).click();
  await expect(content).toHaveJSProperty("scrollTop", 0);
});
