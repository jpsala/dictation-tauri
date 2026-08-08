// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Windows desktop delivery native paste", () => {
  it("uses a verified native Edit fast path before direct Unicode fallback", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).not.toContain("VK_ESCAPE");
    expect(source).not.toContain("dismiss_transient_menu_before_paste");
    expect(source).not.toContain("should_dismiss_transient_menu_before_paste");
    expect(source).toContain("GetGUIThreadInfo");
    expect(source).toContain("focus_hwnd");
    expect(source).toContain("native_edit_fast_path");
    expect(source).toContain("fn is_native_edit_class_name");
    expect(source).toContain("EM_REPLACESEL_MESSAGE");
    expect(source).toContain("SendMessageTimeoutW(");
    expect(source).toContain("SMTO_ABORTIFHUNG | SMTO_ERRORONEXIT");
    expect(source).toContain("No fallback was attempted to avoid duplicate text");
    expect(source).toContain("Native Edit insertion");
    expect(source).toContain("KEYEVENTF_UNICODE");
    expect(source).toContain("send_unicode_text(text)");
    expect(source).toContain("Direct Unicode input was sent");
    expect(source).toContain("without using the clipboard");
    expect(source).toContain("completed method={method_label} utf16_units={utf16_units}");
    expect(source.indexOf("matching_native_edit_target(&target")).toBeLessThan(
      source.indexOf("send_unicode_text(text)"),
    );
    expect(source.indexOf("delivery_mode == DeliveryMode::ClipboardPaste")).toBeLessThan(
      source.indexOf("let direct_result = deliver_text_without_clipboard("),
    );
  });

  it("supports selected clipboard paste and explicit fallback with restoration", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).toContain("DICTATION_TAURI_ALLOW_CLIPBOARD_PASTE_FALLBACK");
    expect(source).toContain("fn allow_clipboard_paste_fallback");
    expect(source).toContain("Temporary clipboard fallback is disabled by default");
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
    const writeIndex = source.indexOf("write_transient_clipboard_text(text, clipboard_owner_hwnd)");
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
    expect(source).toContain('TRANSIENT_PASTE_FORMAT_NAME: &str = "Fixvox.TransientPaste.v1"');
    expect(source).toContain('TRANSIENT_PASTE_MARKER: &[u8] = b"dictation-tauri/v1\\0"');
    expect(source).toContain("OpenClipboard(owner_hwnd)");
    expect(source).toContain("delivery_mode == DeliveryMode::ClipboardPaste");
  });

  it("scopes inline observation to the focused control with bounded messages", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).toContain("let observer_hwnd = native_edit_hwnd");
    expect(source).toContain("observer_hwnd.and_then(read_window_control_text)");
    expect(source).toContain("SendMessageTimeoutW(hwnd, msg");
    expect(source).not.toContain("fn read_observable_window_text");
    expect(source).not.toContain("fn push_window_text");
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
