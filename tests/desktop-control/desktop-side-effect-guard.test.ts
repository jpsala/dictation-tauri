import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenDefaultSideEffectMarkers = [
  "@tauri-apps/plugin-global-shortcut",
  "@tauri-apps/plugin-clipboard-manager",
  "globalShortcut",
  "registerShortcut",
  "navigator.clipboard",
  "writeText(",
  "readText(",
  "document.execCommand",
  "robotjs",
  "enigo",
] as const;

describe("desktop side-effect guardrails", () => {
  it("keeps foundation desktop-control and delivery contracts free of real desktop adapters", () => {
    const files = collectFiles(["src/desktop-control", "src/delivery"]);

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const marker of forbiddenDefaultSideEffectMarkers) {
        expect(source, `${file} must not contain ${marker}`).not.toContain(marker);
      }
    }
  });

  it("does not add hotkey or clipboard plugins to default package manifests", () => {
    const manifests = ["package.json", "src-tauri/Cargo.toml"];

    for (const manifest of manifests) {
      const source = readFileSync(manifest, "utf8");
      for (const marker of forbiddenDefaultSideEffectMarkers) {
        expect(source, `${manifest} must not contain ${marker}`).not.toContain(marker);
      }
    }
  });
});

function collectFiles(paths: readonly string[]): string[] {
  return paths.flatMap((path) => collectFilesUnder(path));
}

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
