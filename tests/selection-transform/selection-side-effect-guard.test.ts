import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenSelectionSideEffectMarkers = [
  "navigator.clipboard",
  "document.execCommand",
  "getSelection(",
  "window.getSelection",
  "sendKeys",
  "paste_observed",
  "UIAutomation",
  "@tauri-apps/plugin-global-shortcut",
  "@tauri-apps/plugin-clipboard-manager",
] as const;

describe("selection transform side-effect guardrails", () => {
  it("keeps default selection-transform code fixture-backed and desktop-side-effect free", () => {
    const files = collectFilesUnder("src/selection-transform");

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const marker of forbiddenSelectionSideEffectMarkers) {
        expect(source, `${file} must not contain ${marker}`).not.toContain(marker);
      }
    }
  });
});

function collectFilesUnder(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }

  const stats = statSync(path);
  if (stats.isFile()) {
    return [path];
  }

  return readdirSync(path).flatMap((entry) => collectFilesUnder(join(path, entry)));
}
