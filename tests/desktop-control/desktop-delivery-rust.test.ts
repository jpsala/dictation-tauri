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
    expect(source).toContain("deliver_text_with_clipboard(");
    expect(source).toContain("press_enter_after_paste,");
    expect(source).toContain("focus_target_before_paste,");
    expect(source).toContain("[dictation-tauri][desktop-delivery] failed reason={error}");
  });

  it("snapshots and restores text and image clipboard formats around Ctrl+V paste", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).toContain("struct ClipboardSnapshot");
    expect(source).toContain("CF_DIB_FORMAT");
    expect(source).toContain("CF_DIBV5_FORMAT");
    expect(source).toContain("read_clipboard_snapshot()");
    expect(source).toContain("read_clipboard_bitmap_as_dib_open");
    expect(source).toContain("GetDIBits");
    expect(source).toContain(".or_else(|| read_clipboard_bitmap_as_dib_open())");
    expect(source).toContain("restore_clipboard_snapshot(previous_clipboard)");
    expect(source).toContain("send_ctrl_v()?");
    const focusIndex = source.indexOf("focus_window(hwnd)?");
    const snapshotIndex = source.indexOf("let previous_clipboard = read_clipboard_snapshot()?");
    const writeIndex = source.indexOf("if let Err(write_error) = write_clipboard_text(text)");
    const pasteIndex = source.indexOf("send_ctrl_v()?");
    const restoreIndex = source.lastIndexOf("restore_clipboard_snapshot(previous_clipboard)");
    expect(focusIndex).toBeLessThan(snapshotIndex);
    expect(snapshotIndex).toBeLessThan(writeIndex);
    expect(writeIndex).toBeLessThan(pasteIndex);
    expect(pasteIndex).toBeLessThan(restoreIndex);
    expect(source).toContain("if focus_target_before_paste");
    expect(source).toContain("read_user_preferences_for_app(&app)");
    expect(source).toContain("resolve_focus_target_before_paste(");
    expect(source).toContain("requested_focus.unwrap_or(true) && !paste_without_focus_change");
    expect(source).toContain("restore_saved_target_focus");
    expect(source).toContain("explicit_host_menu_restore_returns_focus_to_its_captured_target");
    expect(source).toContain("Foreground input changed before paste; no window was focused and no keys were sent.");
    expect(source).toContain("Desktop target lost focus before paste; no keys were sent.");
    expect(source).toContain("Desktop target lost focus before Ctrl+V; no paste keys were sent.");
    expect(source).toContain("Clipboard contains unsupported data and was left unchanged.");
    expect(source).toContain("RESTORABLE_BITMAP_METADATA_FORMAT_NAMES");
    expect(source).toContain('"System.Drawing.Bitmap"');
    expect(source).toContain("struct ClipboardAdditionalFormat");
    expect(source).toContain("snapshot.additional_formats");
    expect(source).toContain("clipboard_format_diagnostic");
    expect(source).toContain("GetClipboardFormatNameW");
    expect(source).toContain("combine_paste_and_restore_results");
    expect(source).toContain("Delivery warning:");
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

  it("keeps watcher terminals from replacing app targets but accepts explicit menu terminals", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).toContain("fn is_terminal_like_target");
    expect(source).toContain("fn should_skip_terminal_like_target_for_cache");
    expect(source).toContain('reason == "foreground_watcher" && is_terminal_like_target(target)');
    expect(source).toContain("windowsterminal.exe");
    expect(source).toContain("tabby.exe");
    expect(source).toContain('"tray_icon_click_before_menu"');
    expect(source).toContain('"dock_context_menu_before_popup"');
    expect(source.indexOf("if should_skip_terminal_like_target_for_cache(reason, &target)")).toBeLessThan(
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
