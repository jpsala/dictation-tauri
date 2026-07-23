import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Companion host window", () => {
  it("has normal window chrome, close/hide lifecycle, and enough room for scrollable history", () => {
    const source = readFileSync("src-tauri/src/companion_window.rs", "utf8");
    const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
    const config = readFileSync("src-tauri/tauri.conf.json", "utf8");

    expect(lib).toContain("companion_window::configure_companion_window");
    expect(source).toContain("WindowEvent::CloseRequested");
    expect(source).toContain("api.prevent_close()");
    expect(source).toContain("companion_window.hide()");
    expect(source).toContain("position_window_above_anchor");
    expect(source).toMatch(/dock\s*\.current_monitor\(\)/);
    expect(source).toContain("monitor.work_area()");
    expect(source).toContain("tauri::PhysicalSize::new");
    expect(source).toContain("tauri::PhysicalPosition::new");
    expect(source).not.toContain("tauri::LogicalPosition::new");
    expect(source).toContain("COMPANION_WINDOW_WIDTH");
    expect(source).toContain("COMPANION_WINDOW_HEIGHT");
    expect(config).toContain('"label": "dock-companion"');
    expect(config).toContain('"height": 420');
    expect(config).toContain('"resizable": true');
    expect(config).toContain('"decorations": true');
    expect(config).toContain('"skipTaskbar": false');
  });

  it("keeps the preset picker compact and hides it when focus moves elsewhere", () => {
    const source = readFileSync("src-tauri/src/companion_window.rs", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");
    const config = readFileSync("src-tauri/tauri.conf.json", "utf8");

    expect(source).toContain("const PRESET_PICKER_WINDOW_WIDTH: i32 = 380");
    expect(source).toContain("const PRESET_PICKER_WINDOW_HEIGHT: i32 = 320");
    expect(source).toContain("watch_preset_picker_focus");
    expect(source).toContain("GetForegroundWindow");
    expect(source).toContain("saw_picker_foreground");
    expect(source).toContain("DOCK_COMPANION_COMMAND_EVENT");
    expect(appSource).not.toContain('window.addEventListener("blur"');
    expect(source).toContain('"command": "close_companion"');
    expect(config).toContain('"label": "preset-picker"');
    expect(config).toContain('"width": 380');
    expect(config).toContain('"height": 320');
  });
});
