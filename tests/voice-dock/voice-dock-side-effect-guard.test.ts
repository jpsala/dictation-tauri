import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenRendererSideEffectMarkers = [
  "@tauri-apps/api",
  "@tauri-apps/plugin-global-shortcut",
  "@tauri-apps/plugin-clipboard-manager",
  "globalShortcut",
  "registerShortcut",
  "navigator.clipboard",
  "writeText(",
  "readText(",
  "document.execCommand",
  "Groq",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
] as const;

const forbiddenDictationKeyMarkers = ["paste_observed"] as const;

describe("voice dock and dictation-key side-effect guardrails", () => {
  it("keeps Checkpoint A renderer helpers provider-free and desktop-side-effect free", () => {
    const files = collectFiles(["src/voice-dock", "src/desktop-control/dictation-key.ts"]);

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const marker of forbiddenRendererSideEffectMarkers) {
        expect(source, `${file} must not contain ${marker}`).not.toContain(marker);
      }
      if (file.endsWith("dictation-key.ts")) {
        for (const marker of forbiddenDictationKeyMarkers) {
          expect(source, `${file} must not contain ${marker}`).not.toContain(marker);
        }
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
