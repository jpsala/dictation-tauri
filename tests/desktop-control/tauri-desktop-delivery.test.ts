import { describe, expect, it } from "vitest";
import { captureTauriDesktopDeliveryTarget } from "../../src/delivery/tauri-desktop-delivery";

describe("Tauri desktop delivery target capture", () => {
  it("prefers the current foreground editable target over a stale cached target", async () => {
    const calls: string[] = [];
    const target = await captureTauriDesktopDeliveryTarget(async (command) => {
      calls.push(command);
      if (command === "capture_desktop_delivery_target") {
        return {
          frameHwnd: "browser-hwnd",
          windowTitle: "Browser input",
          windowClass: "Chrome_WidgetWin_1",
          processId: 100,
          inputLike: true,
          reason: "foreground target captured before dictation",
        };
      }
      if (command === "get_cached_desktop_delivery_target") {
        return {
          frameHwnd: "stale-terminal-hwnd",
          windowTitle: "Terminal",
          windowClass: "Chrome_WidgetWin_1",
          processId: 200,
          inputLike: true,
          reason: "stale cached target",
        };
      }
      throw new Error(`unexpected command ${command}`);
    });

    expect(target?.frameHwnd).toBe("browser-hwnd");
    expect(calls).toEqual(["capture_desktop_delivery_target"]);
  });

  it("falls back to cached target when the current foreground is not editable", async () => {
    const calls: string[] = [];
    const target = await captureTauriDesktopDeliveryTarget(async (command) => {
      calls.push(command);
      if (command === "capture_desktop_delivery_target") {
        return {
          frameHwnd: "dock-hwnd",
          windowTitle: "Dictation Dock",
          windowClass: "WebView",
          processId: 300,
          inputLike: false,
          reason: "foreground target is a Dictation Tauri surface; preserving previous editable target",
        };
      }
      if (command === "get_cached_desktop_delivery_target") {
        return {
          frameHwnd: "cached-browser-hwnd",
          windowTitle: "Browser input",
          windowClass: "Chrome_WidgetWin_1",
          processId: 100,
          inputLike: true,
          reason: "previous editable target",
        };
      }
      throw new Error(`unexpected command ${command}`);
    });

    expect(target?.frameHwnd).toBe("cached-browser-hwnd");
    expect(calls).toEqual(["capture_desktop_delivery_target", "get_cached_desktop_delivery_target"]);
  });
});
