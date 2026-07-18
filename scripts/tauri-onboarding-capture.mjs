#!/usr/bin/env node
import { chromium } from "@playwright/test";
import path from "node:path";

const [rawPort, screenshotPath] = process.argv.slice(2);
const port = Number.parseInt(rawPort, 10);

if (!Number.isInteger(port) || port <= 0 || !screenshotPath) {
  process.stderr.write("Usage: node scripts/tauri-onboarding-capture.mjs <remote-debug-port> <screenshot-path>\n");
  process.exit(64);
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
try {
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => {
    try {
      const url = new URL(candidate.url());
      return url.hostname === "127.0.0.1" && url.pathname === "/";
    } catch {
      return false;
    }
  });
  if (!page) {
    throw new Error("No Tauri WebView2 page was available through CDP.");
  }

  await page.setViewportSize({ width: 780, height: 600 });
  const onboardingUrl = new URL("/?surface=onboarding", page.url()).toString();
  await page.goto(onboardingUrl, { waitUntil: "networkidle" });
  const surface = page.getByTestId("account-first-onboarding");
  const welcome = page.getByRole("heading", { name: "Empezá a dictar con tu cuenta" });
  const primary = page.getByRole("button", { name: "Continuar con Google" });
  await surface.waitFor({ state: "visible", timeout: 20_000 });
  await welcome.waitFor({ state: "visible", timeout: 20_000 });
  await primary.waitFor({ state: "visible", timeout: 20_000 });
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  await page.screenshot({ path: path.resolve(screenshotPath) });
  process.stdout.write(`${JSON.stringify({ pageUrl: page.url(), welcomeVisible: true, primaryVisible: true, ...viewport })}\n`);
} finally {
  await browser.close();
}
