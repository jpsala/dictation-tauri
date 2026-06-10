import { expect, test } from "@playwright/test";

test("renders the MVP 0 foundation surface", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("mvp0-foundation")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dictation Tauri" }),
  ).toBeVisible();
  await expect(page.getByText("MVP 0 foundation")).toBeVisible();
  await expect(page.getByText("No audio yet")).toBeVisible();
});
