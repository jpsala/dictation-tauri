// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const index = readFileSync("site/index.html", "utf8");
const runtime = readFileSync("site/src/main.ts", "utf8");
const styles = readFileSync("site/src/styles.css", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};

describe("Fixvox Pages site ownership", () => {
  it("builds from this repository and uses current product assets", () => {
    expect(packageJson.scripts?.["site:build"]).toBe("vite build site");
    expect(index).toContain("/fixvox-mark.png");
    expect(index).toContain("/fixvox-account.png");
    expect(index).toContain("/fixvox-onboarding.png");
    expect(index).toContain("Google sign-in links the computer automatically.");
  });

  it("fails closed until a verified Tauri installer URL is supplied", () => {
    expect(runtime).toContain("VITE_FIXVOX_INSTALLER_URL");
    expect(runtime).toContain("Fixvox-Tauri-Setup\\.exe");
    expect(runtime).not.toContain("Fixvox-Installer.exe");
    expect(index).not.toContain("Fixvox-Installer.exe");
    expect(runtime).toContain('setAttribute("aria-disabled", "true")');
  });

  it("keeps interaction accessible and motion optional", () => {
    expect(index).toContain('role="tablist"');
    expect(index).toContain('role="status"');
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(styles).not.toContain("background-clip: text");
  });
});
