import { expect, test } from "@playwright/test";

test("renders the MVP 3 fake capture surface", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("capture-surface")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dictation Tauri" }),
  ).toBeVisible();
  await expect(page.getByText("MVP 3 capture")).toBeVisible();
  await expect(page.getByTestId("capture-state")).toHaveText("Idle");
  await expect(page.getByText("Fake capture")).toBeVisible();
  await expect(page.getByText("Browser unavailable host")).toBeVisible();
  await expect(page.getByRole("button", { name: "Transcribe with provider" })).toBeDisabled();
  await expect(page.getByTestId("host-readiness-state")).toHaveText(
    "Unavailable",
  );
  await expect(page.getByTestId("host-readiness-message")).toHaveText(
    "Host runtime transcription boundary is unavailable.",
  );
});

test("runs a fake start and stop capture flow", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Start capture" }).click();
  await expect(page.getByTestId("capture-state")).toHaveText("Listening");
  await expect(
    page.getByText("Listening through the fake capture gateway."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Stop capture" }).click();
  await expect(page.getByTestId("capture-state")).toHaveText("Captured");
  await expect(page.getByTestId("capture-artifact")).toHaveText(
    "artifacts/microphone-capture/audio/capture-001.webm",
  );
  await expect(page.getByTestId("pipeline-state")).toHaveText("Not submitted");
  await expect(page.getByRole("button", { name: "Transcribe with provider" })).toBeDisabled();
});

test("submits a captured run to the host transcription boundary", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Start capture" }).click();
  await page.getByRole("button", { name: "Stop capture" }).click();
  await page.getByRole("button", { name: "Submit captured run" }).click();

  await expect(page.getByTestId("pipeline-state")).toHaveText("Setup needed");
  await expect(page.getByTestId("pipeline-message")).toHaveText(
    "Host runtime transcription boundary is unavailable.",
  );
});

test("runs a fake cancellation flow", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Start capture" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByTestId("capture-state")).toHaveText("Cancelled");
  await expect(
    page.getByText("Capture cancelled before transcription."),
  ).toBeVisible();
});
