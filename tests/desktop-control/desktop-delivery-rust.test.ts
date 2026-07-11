// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Windows desktop delivery native paste", () => {
  it("uses Fixvox-like clipboard paste delivery instead of direct Unicode input", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).not.toContain("VK_ESCAPE");
    expect(source).not.toContain("dismiss_transient_menu_before_paste");
    expect(source).not.toContain("should_dismiss_transient_menu_before_paste");
    expect(source).not.toContain("KEYEVENTF_UNICODE");
    expect(source).not.toContain("send_unicode_text");
    expect(source).not.toContain("DICTATION_TAURI_ALLOW_CLIPBOARD_PASTE_FALLBACK");
    expect(source).toContain("using Fixvox-like clipboard paste delivery");
    expect(source).toContain("deliver_text_with_clipboard(&text, &target, hwnd, press_enter_after_paste)?");
  });

  it("snapshots and restores text and image clipboard formats around Ctrl+V paste", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).toContain("struct ClipboardSnapshot");
    expect(source).toContain("CF_DIB_FORMAT");
    expect(source).toContain("CF_DIBV5_FORMAT");
    expect(source).toContain("read_clipboard_snapshot()");
    expect(source).toContain("restore_clipboard_snapshot(previous_clipboard)");
    expect(source).toContain("send_ctrl_v()?");
    expect(source.indexOf("let previous_clipboard = read_clipboard_snapshot()"))
      .toBeLessThan(source.indexOf("write_clipboard_text(text)?"));
    expect(source.indexOf("write_clipboard_text(text)?"))
      .toBeLessThan(source.indexOf("send_ctrl_v()?"));
    expect(source.indexOf("send_ctrl_v()?")).toBeLessThan(
      source.indexOf("restore_clipboard_snapshot(previous_clipboard)"),
    );
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

  it("does not let terminal-like foreground windows overwrite the cached app target", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).toContain("fn is_terminal_like_target");
    expect(source).toContain("skipped terminal-like target");
    expect(source).toContain("windowsterminal.exe");
    expect(source).toContain("tabby.exe");
    expect(source.indexOf("if is_terminal_like_target(&target)")).toBeLessThan(
      source.indexOf("*cached = Some(target)"),
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
