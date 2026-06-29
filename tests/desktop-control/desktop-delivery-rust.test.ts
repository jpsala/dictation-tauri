import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Windows desktop delivery native paste", () => {
  it("pastes without sending Escape first", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).not.toContain("VK_ESCAPE");
    expect(source).not.toContain("dismiss_transient_menu_before_paste");
    expect(source).not.toContain("should_dismiss_transient_menu_before_paste");
    expect(source).toContain("send_ctrl_v()?");
    expect(source.indexOf("focus_window(hwnd)")).toBeLessThan(
      source.indexOf("send_ctrl_v()?"),
    );
  });

  it("waits longer before restoring the clipboard for Chromium hosts", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).toContain("fn clipboard_restore_delay");
    expect(source).toContain("chrome_widgetwin");
    expect(source).toContain("Duration::from_millis(700)");
    expect(source.indexOf("send_ctrl_v()?")).toBeLessThan(
      source.indexOf("thread::sleep(clipboard_restore_delay(&target))"),
    );
    expect(source.indexOf("thread::sleep(clipboard_restore_delay(&target))"))
      .toBeLessThan(source.indexOf("write_clipboard_text(&previous)"));
  });

  it("keeps paste observation native, gated, and redaction-safe", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");
    const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");

    expect(source).toContain("pub fn observe_desktop_paste(");
    expect(source).toContain("read_window_text_surfaces");
    expect(source).toContain("SendMessageTimeoutW");
    expect(source).toContain("Paste insertion was verified by a bounded Win32 text observer");
    expect(source).not.toContain("observedContents");
    expect(source).not.toContain("targetContents");
    expect(libSource).toContain("desktop_delivery::observe_desktop_paste");
  });
});
