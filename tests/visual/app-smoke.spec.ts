import { expect, test } from "@playwright/test";

test("renders the Fixvox-like seven-dot dock as the primary fake capture surface", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("capture-surface")).toBeVisible();
  await expect(page.getByTestId("voice-dock")).toBeVisible();
  await expect(page.getByTestId("voice-dock-state-chip")).toHaveText("Ready");
  await expect(page.getByTestId("voice-dock-vu-dot")).toHaveCount(7);
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
