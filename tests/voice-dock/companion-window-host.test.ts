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
    expect(source).toContain("window.set_size(tauri::LogicalSize::new(width as f64, height as f64))");
    expect(source).toContain("COMPANION_WINDOW_WIDTH");
    expect(source).toContain("COMPANION_WINDOW_HEIGHT");
    expect(config).toContain('"label": "dock-companion"');
    expect(config).toContain('"height": 420');
    expect(config).toContain('"resizable": true');
    expect(config).toContain('"decorations": true');
    expect(config).toContain('"skipTaskbar": false');
  });
});
