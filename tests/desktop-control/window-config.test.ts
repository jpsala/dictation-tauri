import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type TauriConfig = {
  build: { devUrl?: string };
  app: {
    windows: Array<{
      label: string;
      title?: string;
      width?: number;
      height?: number;
      minWidth?: number;
      minHeight?: number;
      alwaysOnTop?: boolean;
      visible?: boolean;
      resizable?: boolean;
    }>;
  };
};

describe("Tauri dev dock window config", () => {
  it("keeps the main dev surface compact, visible, refreshable, and above normal windows", () => {
    const config = JSON.parse(
      readFileSync("src-tauri/tauri.conf.json", "utf8"),
    ) as TauriConfig;
    const main = config.app.windows.find((window) => window.label === "main");

    expect(config.build.devUrl).toBe("http://127.0.0.1:1420");
    expect(main).toMatchObject({
      title: "Dictation Dock",
      visible: true,
      resizable: false,
      decorations: false,
      transparent: true,
      shadow: false,
      alwaysOnTop: true,
    });
    expect(main?.width).toBeLessThanOrEqual(200);
    expect(main?.height).toBeLessThanOrEqual(96);
    expect(main?.minWidth).toBeGreaterThanOrEqual(164);
    expect(main?.minHeight).toBeGreaterThanOrEqual(64);
  });
});
