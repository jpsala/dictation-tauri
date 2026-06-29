import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Windows desktop delivery native paste", () => {
  it("uses direct Unicode input before any clipboard fallback", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).not.toContain("VK_ESCAPE");
    expect(source).not.toContain("dismiss_transient_menu_before_paste");
    expect(source).not.toContain("should_dismiss_transient_menu_before_paste");
    expect(source).toContain("send_unicode_text(&text)?");
    expect(source).toContain("KEYEVENTF_UNICODE");
    expect(source).toContain("without using the clipboard");
    expect(source.indexOf("send_unicode_text(&text)?")).toBeLessThan(
      source.indexOf("deliver_text_with_clipboard"),
    );
  });

  it("keeps clipboard paste as an explicit opt-in fallback", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).toContain("DICTATION_TAURI_ALLOW_CLIPBOARD_PASTE_FALLBACK");
    expect(source).toContain("fn allow_clipboard_paste_fallback");
    expect(source).toContain("fn clipboard_restore_delay");
    expect(source).toContain("chrome_widgetwin");
    expect(source).toContain("Duration::from_millis(700)");
    expect(source.indexOf("write_clipboard_text(text)?")).toBeGreaterThan(
      source.indexOf("fn deliver_text_with_clipboard"),
    );
    expect(source.indexOf("thread::sleep(clipboard_restore_delay(target))"))
      .toBeLessThan(source.indexOf("write_clipboard_text(&previous)"));
  });

  it("skips the bounded Win32 observer on Chromium targets", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).toContain("fn should_skip_bounded_observer");
    expect(source).toContain("chrome_widgetwin");
    expect(source).toContain("chrome_renderwidgethosthwnd");
    expect(source).toContain("let skip_bounded_observer = should_skip_bounded_observer(&target)");
    expect(source.indexOf("let skip_bounded_observer")).toBeLessThan(
      source.indexOf("let observable_before"),
    );
  });

  it("keeps paste observation native, gated, and redaction-safe", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");
    const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");

    expect(source).toContain("pub fn observe_desktop_paste(");
    expect(source).toContain("read_window_text_surfaces");
    expect(source).toContain("SendMessageTimeoutW");
    expect(source).toContain("verified by a bounded Win32 text observer");
    expect(source).not.toContain("observedContents");
    expect(source).not.toContain("targetContents");
    expect(libSource).toContain("desktop_delivery::observe_desktop_paste");
  });
});
