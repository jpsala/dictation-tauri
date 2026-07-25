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
      focus?: boolean;
      skipTaskbar?: boolean;
      visible?: boolean;
      resizable?: boolean;
    }>;
  };
};

describe("Tauri dev dock window config", () => {
  it("keeps the main dev surface skin-compatible, hidden-until-native-show, refreshable, and above normal windows", () => {
    const config = JSON.parse(
      readFileSync("src-tauri/tauri.conf.json", "utf8"),
    ) as TauriConfig;
    const main = config.app.windows.find((window) => window.label === "main");

    expect(config.build.devUrl).toBe("http://127.0.0.1:1420");
    expect(main).toMatchObject({
      title: "Dictation Dock",
      visible: false,
      focus: false,
      skipTaskbar: true,
      resizable: false,
      decorations: false,
      transparent: true,
      shadow: false,
      alwaysOnTop: true,
    });
    expect(main?.width).toBe(132);
    expect(main?.height).toBe(36);
    expect(main?.minWidth).toBe(98);
    expect(main?.minHeight).toBe(32);
  });
});
