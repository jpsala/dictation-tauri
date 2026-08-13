// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
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
      decorations?: boolean;
      transparent?: boolean;
      shadow?: boolean;
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


  it("keeps the Dictation Laboratory at the shared 720x620 native floor", () => {
    const config = JSON.parse(
      readFileSync("src-tauri/tauri.conf.json", "utf8"),
    ) as TauriConfig;
    const laboratory = config.app.windows.find(
      (window) => window.label === "dictation-lab",
    );

    expect(laboratory).toMatchObject({
      title: "Dictation Laboratory",
      url: "index.html?surface=dictation-lab",
      width: 720,
      height: 620,
      minWidth: 720,
      minHeight: 620,
      resizable: true,
      decorations: true,
      transparent: false,
      alwaysOnTop: false,
      visible: false,
    });
  });
  it("keeps the transient companion transparent so only the notice chrome is visible", () => {
    const config = JSON.parse(
      readFileSync("src-tauri/tauri.conf.json", "utf8"),
    ) as TauriConfig;
    const companion = config.app.windows.find(
      (window) => window.label === "dock-companion",
    );

    expect(companion).toMatchObject({
      visible: false,
      transparent: true,
      shadow: false,
      alwaysOnTop: true,
    });
  });
});
