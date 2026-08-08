use crate::user_preferences::DeliveryMode;
use serde::{Deserialize, Serialize};
use std::{
    sync::{Mutex, Once},
    thread,
    time::Duration,
};
use tauri::Manager;

static DELIVERY_TARGET_WATCHER: Once = Once::new();

static CACHED_DESKTOP_DELIVERY_TARGET: Mutex<Option<DesktopDeliveryTarget>> = Mutex::new(None);

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDeliveryTarget {
    frame_hwnd: String,
    window_title: String,
    window_class: String,
    process_id: u32,
    #[serde(default)]
    process_name: Option<String>,
    #[serde(default)]
    focus_hwnd: Option<String>,
    #[serde(default)]
    focus_class: Option<String>,
    #[serde(default)]
    focus_process_id: Option<u32>,
    #[serde(default)]
    native_edit_fast_path: bool,
    input_like: bool,
    reason: String,
    #[serde(default)]
    cache_reason: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDeliveryResult {
    status: &'static str,
    reason: String,
    target: DesktopDeliveryTarget,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopTargetSnapshot {
    captured_at: String,
    app_label: String,
    window_label: String,
    confidence: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPasteObservationResult {
    status: &'static str,
    confidence: &'static str,
    reason: String,
    target_after: DesktopTargetSnapshot,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceCapturedSelectionResult {
    pub status: &'static str,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub captured_length: Option<usize>,
}

#[tauri::command]
pub fn capture_desktop_delivery_target() -> Result<DesktopDeliveryTarget, String> {
    let target = platform::capture_desktop_delivery_target()?;
    cache_delivery_target_if_editable("capture_desktop_delivery_target", target.clone());
    Ok(target)
}

#[tauri::command]
pub fn get_cached_desktop_delivery_target() -> Option<DesktopDeliveryTarget> {
    CACHED_DESKTOP_DELIVERY_TARGET
        .lock()
        .ok()
        .and_then(|target| target.clone())
}

pub fn start_delivery_target_watcher() {
    DELIVERY_TARGET_WATCHER.call_once(|| {
        eprintln!("[dictation-tauri][delivery-target] starting foreground watcher");
        thread::spawn(|| loop {
            cache_current_desktop_delivery_target_for_tray("foreground_watcher");
            thread::sleep(Duration::from_millis(350));
        });
    });
}

pub fn cache_current_desktop_delivery_target_for_tray(reason: &str) {
    match platform::capture_desktop_delivery_target() {
        Ok(target) => cache_delivery_target_if_editable(reason, target),
        Err(error) => {
            eprintln!("[dictation-tauri][delivery-target] cache failed reason={reason}: {error}")
        }
    }
}

fn cache_delivery_target_if_editable(reason: &str, mut target: DesktopDeliveryTarget) {
    if !target.input_like {
        if reason != "foreground_watcher" {
            eprintln!(
                "[dictation-tauri][delivery-target] skipped non-editable target reason={} target_reason={}",
                reason, target.reason
            );
        }
        return;
    }

    if should_skip_terminal_like_target_for_cache(reason, &target) {
        return;
    }

    target.cache_reason = Some(reason.to_string());
    let process_id = target.process_id;
    let window_class = target.window_class.clone();
    let title_length = target.window_title.len();
    let mut should_log = reason != "foreground_watcher";
    if let Ok(mut cached) = CACHED_DESKTOP_DELIVERY_TARGET.lock() {
        should_log = should_log
            || cached
                .as_ref()
                .map(|existing| existing.frame_hwnd != target.frame_hwnd)
                .unwrap_or(true);
        *cached = Some(target);
    }
    if should_log {
        eprintln!(
            "[dictation-tauri][delivery-target] cached reason={reason} pid={process_id} class={window_class} title_len={title_length}"
        );
    }
}

fn should_skip_terminal_like_target_for_cache(
    reason: &str,
    target: &DesktopDeliveryTarget,
) -> bool {
    reason == "foreground_watcher" && is_terminal_like_target(target)
}

fn is_terminal_like_target(target: &DesktopDeliveryTarget) -> bool {
    let haystack = format!(
        "{} {} {}",
        target.process_name.as_deref().unwrap_or_default(),
        target.window_class,
        target.window_title
    )
    .to_lowercase();

    haystack.contains("tabby.exe")
        || haystack.contains("windowsterminal.exe")
        || haystack.contains("powershell.exe")
        || haystack.contains("pwsh.exe")
        || haystack.contains("cmd.exe")
        || haystack.contains("cascadia_hosting_window_class")
        || haystack.contains("consolewindowclass")
        || haystack.contains("windows powershell")
        || haystack.contains("powershell")
        || haystack.contains("command prompt")
}

#[tauri::command]
pub fn deliver_text_to_desktop_target(
    app: tauri::AppHandle,
    text: String,
    target: DesktopDeliveryTarget,
    press_enter_after_paste: Option<bool>,
    focus_target_before_paste: Option<bool>,
    restore_saved_target_focus: Option<bool>,
) -> Result<DesktopDeliveryResult, String> {
    let preferences = crate::user_preferences::read_user_preferences_for_app(&app);
    let focus_target_before_paste = resolve_focus_target_before_paste(
        focus_target_before_paste,
        preferences.paste_without_focus_change,
        restore_saved_target_focus.unwrap_or(false),
    );
    let clipboard_owner_hwnd = clipboard_owner_hwnd(&app, preferences.delivery_mode)?;
    platform::deliver_text_to_desktop_target(
        text,
        target,
        press_enter_after_paste.unwrap_or(false),
        focus_target_before_paste,
        preferences.delivery_mode,
        clipboard_owner_hwnd,
    )
}

#[cfg(windows)]
fn clipboard_owner_hwnd(
    app: &tauri::AppHandle,
    delivery_mode: DeliveryMode,
) -> Result<Option<isize>, String> {
    let Some(window) = app.get_webview_window("main") else {
        return if delivery_mode == DeliveryMode::ClipboardPaste {
            Err("Dictation Dock window is unavailable for clipboard ownership.".to_string())
        } else {
            Ok(None)
        };
    };
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    Ok(Some(hwnd.0 as isize))
}

/// Re-captures the saved host selection immediately before replacing it.
///
/// The target is a complete desktop-delivery lease (frame/process/class and
/// the captured focus metadata), not a bare HWND.  We fail closed when the
/// lease no longer identifies the same host window or when the selected text
/// changed/truncated.  A successful vocabulary mutation therefore cannot
/// accidentally replace a different selection after the picker stole focus.
#[tauri::command]
pub fn replace_captured_selection_if_unchanged(
    app: tauri::AppHandle,
    target: DesktopDeliveryTarget,
    selection_id: String,
    expected_selection: String,
    selection_truncated: bool,
    replacement: String,
) -> Result<ReplaceCapturedSelectionResult, String> {
    if selection_id.trim().is_empty() {
        return Ok(ReplaceCapturedSelectionResult {
            status: "selection_changed",
            reason: "The saved selection lease was incomplete; selection was left unchanged."
                .to_string(),
            captured_length: None,
        });
    }
    if !target.input_like
        || target.frame_hwnd.trim().is_empty()
        || target.window_class.trim().is_empty()
        || target.process_id == 0
        || target.reason.trim().is_empty()
        || target
            .focus_hwnd
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .is_empty()
        || target
            .focus_class
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .is_empty()
        || target.focus_process_id.unwrap_or_default() == 0
    {
        return Ok(ReplaceCapturedSelectionResult {
            status: "target_unavailable",
            reason: "The saved delivery lease was incomplete or not editable; selection was left unchanged.".to_string(),
            captured_length: None,
        });
    }
    if expected_selection.is_empty() || replacement.is_empty() {
        return Ok(ReplaceCapturedSelectionResult {
            status: "selection_changed",
            reason: "The saved selection or replacement was empty; selection was left unchanged."
                .to_string(),
            captured_length: None,
        });
    }
    if selection_truncated {
        return Ok(ReplaceCapturedSelectionResult {
            status: "selection_changed",
            reason: "The captured selection was truncated; replacement is disabled to avoid a partial edit.".to_string(),
            captured_length: None,
        });
    }

    if let Err(reason) = platform::validate_target_lease(&target) {
        return Ok(ReplaceCapturedSelectionResult {
            status: "target_unavailable",
            reason,
            captured_length: None,
        });
    }

    let outcome = crate::selection_capture::capture_selection_context_for_target_with_clipboard(
        target.frame_hwnd.clone(),
    );
    let captured_length = outcome
        .selection
        .as_ref()
        .map(|selection| selection.text_length);
    if outcome.truncated {
        return Ok(ReplaceCapturedSelectionResult {
            status: "selection_changed",
            reason: "The current host selection is truncated; replacement was not attempted."
                .to_string(),
            captured_length,
        });
    }

    if let Err(reason) = platform::validate_target_focus(&target) {
        return Ok(ReplaceCapturedSelectionResult {
            status: "selection_changed",
            reason,
            captured_length,
        });
    }

    let selected_text = outcome
        .selection
        .as_ref()
        .and_then(|selection| selection.selected_text.as_deref())
        .filter(|selection| !selection.trim().is_empty());
    if selected_text != Some(expected_selection.as_str()) {
        let target_unavailable = matches!(
            outcome.status,
            crate::selection_capture::SelectionCaptureStatus::NoForegroundTarget
                | crate::selection_capture::SelectionCaptureStatus::UnsupportedPlatform
                | crate::selection_capture::SelectionCaptureStatus::UnsupportedTarget
                | crate::selection_capture::SelectionCaptureStatus::Timeout
                | crate::selection_capture::SelectionCaptureStatus::Failed
        );
        let reason = match outcome.status {
            crate::selection_capture::SelectionCaptureStatus::NoForegroundTarget
            | crate::selection_capture::SelectionCaptureStatus::UnsupportedPlatform => {
                "The saved host target is no longer available; selection was left unchanged."
            }
            crate::selection_capture::SelectionCaptureStatus::NoSelection => {
                "The host no longer reports a selection; selection was left unchanged."
            }
            crate::selection_capture::SelectionCaptureStatus::UnsupportedTarget
            | crate::selection_capture::SelectionCaptureStatus::Timeout
            | crate::selection_capture::SelectionCaptureStatus::Failed => {
                "The saved host target could not be re-captured safely; selection was left unchanged."
            }
            _ => "The host selection changed before save completed; selection was left unchanged.",
        };
        let status = if target_unavailable {
            "target_unavailable"
        } else {
            "selection_changed"
        };
        return Ok(ReplaceCapturedSelectionResult {
            status,
            reason: reason.to_string(),
            captured_length,
        });
    }

    match deliver_text_to_desktop_target(
        app,
        replacement,
        target,
        Some(false),
        Some(true),
        Some(true),
    ) {
        Ok(_) => Ok(ReplaceCapturedSelectionResult {
            status: "replaced",
            reason: "The host selection matched the saved snapshot and was replaced.".to_string(),
            captured_length,
        }),
        Err(reason) => Ok(ReplaceCapturedSelectionResult {
            status: "target_unavailable",
            reason: format!("The host target could not be replaced safely: {reason}"),
            captured_length,
        }),
    }
}

fn resolve_focus_target_before_paste(
    requested_focus: Option<bool>,
    paste_without_focus_change: bool,
    restore_saved_target_focus: bool,
) -> bool {
    restore_saved_target_focus || (requested_focus.unwrap_or(true) && !paste_without_focus_change)
}

#[cfg(test)]
mod target_cache_policy_tests {
    use super::{should_skip_terminal_like_target_for_cache, DesktopDeliveryTarget};

    fn windows_terminal_target() -> DesktopDeliveryTarget {
        DesktopDeliveryTarget {
            frame_hwnd: "terminal-hwnd".to_string(),
            window_title: "PowerShell".to_string(),
            window_class: "CASCADIA_HOSTING_WINDOW_CLASS".to_string(),
            process_id: 42,
            process_name: Some("WindowsTerminal.exe".to_string()),
            focus_hwnd: None,
            focus_class: None,
            focus_process_id: None,
            native_edit_fast_path: false,
            input_like: true,
            reason: "foreground target captured before menu".to_string(),
            cache_reason: None,
        }
    }

    #[test]
    fn foreground_watcher_does_not_replace_an_app_target_with_a_terminal() {
        assert!(should_skip_terminal_like_target_for_cache(
            "foreground_watcher",
            &windows_terminal_target(),
        ));
    }

    #[test]
    fn explicit_menu_capture_accepts_windows_terminal_as_the_requested_target() {
        let terminal = windows_terminal_target();
        assert!(!should_skip_terminal_like_target_for_cache(
            "tray_icon_click_before_menu",
            &terminal,
        ));
        assert!(!should_skip_terminal_like_target_for_cache(
            "dock_context_menu_before_popup",
            &terminal,
        ));
    }
}

#[cfg(test)]
mod focus_policy_tests {
    use super::resolve_focus_target_before_paste;

    #[test]
    fn host_preference_prevents_unrequested_focus_changes() {
        assert!(!resolve_focus_target_before_paste(None, true, false));
        assert!(!resolve_focus_target_before_paste(Some(true), true, false));
        assert!(!resolve_focus_target_before_paste(Some(false), true, false));
    }

    #[test]
    fn explicit_host_menu_restore_returns_focus_to_its_captured_target() {
        assert!(resolve_focus_target_before_paste(Some(true), true, true));
        assert!(resolve_focus_target_before_paste(Some(false), true, true));
    }

    #[test]
    fn legacy_focus_behavior_remains_the_default_when_the_preference_is_disabled() {
        assert!(resolve_focus_target_before_paste(None, false, false));
        assert!(resolve_focus_target_before_paste(Some(true), false, false));
        assert!(!resolve_focus_target_before_paste(
            Some(false),
            false,
            false
        ));
    }
}

#[tauri::command]
pub fn observe_desktop_paste(
    text: String,
    target: DesktopDeliveryTarget,
    timeout_ms: Option<u64>,
) -> Result<DesktopPasteObservationResult, String> {
    platform::observe_desktop_paste(text, target, timeout_ms)
}

#[tauri::command]
pub fn copy_text_to_clipboard(text: String) -> Result<(), String> {
    platform::copy_text_to_clipboard(text)
}

#[cfg(windows)]
mod platform {
    use super::{
        DeliveryMode, DesktopDeliveryResult, DesktopDeliveryTarget, DesktopPasteObservationResult,
        DesktopTargetSnapshot,
    };
    use std::{
        ffi::c_void,
        ptr,
        sync::LazyLock,
        thread,
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, BOOL, HWND, LPARAM},
        Graphics::Gdi::{
            GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BI_RGB, DIB_RGB_COLORS,
        },
        System::{
            DataExchange::{
                CloseClipboard, CountClipboardFormats, EmptyClipboard, EnumClipboardFormats,
                GetClipboardData, GetClipboardFormatNameW, IsClipboardFormatAvailable,
                OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
            },
            Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE},
            Threading::{
                AttachThreadInput, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
        UI::{
            Input::KeyboardAndMouse::{
                IsWindowEnabled, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
                KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_CONTROL, VK_LWIN, VK_MENU,
                VK_RETURN, VK_RWIN, VK_SHIFT, VK_V,
            },
            WindowsAndMessaging::{
                BringWindowToTop, EnumChildWindows, GetAncestor, GetClassNameW,
                GetForegroundWindow, GetGUIThreadInfo, GetWindowLongPtrW, GetWindowTextLengthW,
                GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible,
                SendMessageTimeoutW, SetForegroundWindow, ShowWindow, GA_ROOT, GUITHREADINFO,
                GWL_STYLE, SMTO_ABORTIFHUNG, SMTO_BLOCK, SMTO_ERRORONEXIT, SW_RESTORE, SW_SHOW,
                WM_GETTEXT, WM_GETTEXTLENGTH,
            },
        },
    };

    const CF_TEXT_FORMAT: u32 = 1;
    const CF_BITMAP_FORMAT: u32 = 2;
    const CF_OEMTEXT_FORMAT: u32 = 7;
    const CF_DIB_FORMAT: u32 = 8;
    const CF_PALETTE_FORMAT: u32 = 9;
    const CF_UNICODETEXT_FORMAT: u32 = 13;
    const CF_LOCALE_FORMAT: u32 = 16;
    const CF_DIBV5_FORMAT: u32 = 17;
    const EM_REPLACESEL_MESSAGE: u32 = 0x00c2;
    const ES_PASSWORD_STYLE: u32 = 0x0020;
    const ES_READONLY_STYLE: u32 = 0x0800;
    const NATIVE_EDIT_MESSAGE_TIMEOUT_MS: u32 = 500;
    const RESTORABLE_BITMAP_METADATA_FORMAT_NAMES: [&str; 3] =
        ["DataObject", "System.Drawing.Bitmap", "Ole Private Data"];
    const TRANSIENT_PASTE_FORMAT_NAME: &str = "Fixvox.TransientPaste.v1";
    const TRANSIENT_PASTE_MARKER: &[u8] = b"dictation-tauri/v1\0";

    #[derive(Clone, Debug)]
    struct ClipboardFormatDescriptor {
        id: u32,
        name: Option<String>,
        bytes: Option<Vec<u8>>,
    }

    #[derive(Clone, Debug)]
    struct ClipboardAdditionalFormat {
        id: u32,
        bytes: Vec<u8>,
    }

    #[derive(Clone, Debug, Default)]
    struct ClipboardSnapshot {
        text: Option<String>,
        dib: Option<Vec<u8>>,
        dib_v5: Option<Vec<u8>>,
        additional_formats: Vec<ClipboardAdditionalFormat>,
    }

    #[derive(Clone, Debug)]
    struct FocusedControl {
        hwnd: HWND,
        class_name: String,
        process_id: u32,
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    enum DirectDeliveryMethod {
        NativeEditMessage,
        UnicodeSendInput,
    }

    impl DirectDeliveryMethod {
        fn label(self) -> &'static str {
            match self {
                Self::NativeEditMessage => "native_edit_message",
                Self::UnicodeSendInput => "unicode_send_input",
            }
        }
    }

    enum DirectDeliveryError {
        RetrySafe(String),
        Uncertain(String),
    }

    pub fn copy_text_to_clipboard(text: String) -> Result<(), String> {
        if text.trim().is_empty() {
            return Err("Cannot copy empty text.".to_string());
        }
        write_clipboard_text(&text)
    }

    pub fn capture_desktop_delivery_target() -> Result<DesktopDeliveryTarget, String> {
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_null() {
            return Err("No foreground window is available for delivery.".to_string());
        }

        let window_title = get_window_text(hwnd);
        let window_class = get_class_name(hwnd);
        let mut process_id = 0u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut process_id);
        }
        let process_name = get_process_name(process_id);
        let focused = focused_control_for_frame(hwnd);
        let native_edit_fast_path = focused
            .as_ref()
            .map(is_native_edit_control)
            .unwrap_or(false);
        let probe = format!(
            "{} {} {}",
            window_title,
            window_class,
            process_name.as_deref().unwrap_or_default()
        )
        .to_lowercase();
        let is_own_process = process_id == std::process::id();
        let is_own_surface = is_own_process
            || window_title == "Dictation Dock"
            || window_title == "Dictation Companion"
            || window_title == "Dictation Tauri Settings"
            || probe.contains("tray_icon_app");
        let input_like =
            !is_own_surface && !probe.contains("taskbar") && !probe.contains("shell_traywnd");
        let reason = if is_own_surface {
            "foreground target is a Dictation Tauri surface; preserving previous editable target"
                .to_string()
        } else if probe.contains("taskbar") || probe.contains("shell_traywnd") {
            "foreground target is not an editable app".to_string()
        } else if native_edit_fast_path {
            "foreground native edit control captured before dictation".to_string()
        } else {
            "foreground target captured before dictation".to_string()
        };

        Ok(DesktopDeliveryTarget {
            frame_hwnd: (hwnd as isize).to_string(),
            window_title,
            window_class,
            process_id,
            process_name,
            focus_hwnd: focused
                .as_ref()
                .map(|control| (control.hwnd as isize).to_string()),
            focus_class: focused.as_ref().map(|control| control.class_name.clone()),
            focus_process_id: focused.as_ref().map(|control| control.process_id),
            native_edit_fast_path,
            input_like,
            reason,
            cache_reason: None,
        })
    }

    pub fn validate_target_lease(target: &DesktopDeliveryTarget) -> Result<(), String> {
        let hwnd = parse_hwnd(&target.frame_hwnd)?;
        if hwnd.is_null() || unsafe { IsWindow(hwnd) } == 0 {
            return Err("Saved delivery target window is no longer available.".to_string());
        }

        let mut process_id = 0u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut process_id);
        }
        if process_id == 0 || process_id != target.process_id {
            return Err(
                "Saved delivery target process no longer matches the captured lease.".to_string(),
            );
        }

        let current_class = get_class_name(hwnd);
        if current_class != target.window_class {
            return Err(
                "Saved delivery target class no longer matches the captured lease.".to_string(),
            );
        }

        if let Some(saved_focus) = target.focus_hwnd.as_deref() {
            let focus_hwnd = parse_hwnd(saved_focus)?;
            if focus_hwnd.is_null() || unsafe { IsWindow(focus_hwnd) } == 0 {
                return Err("Saved delivery focus control is no longer available.".to_string());
            }
        }
        Ok(())
    }

    /// Validate the child control after the saved frame has been restored. A
    /// frame can contain multiple inputs; matching only PID/class or selected
    /// text would allow replacement in the wrong control.
    pub fn validate_target_focus(target: &DesktopDeliveryTarget) -> Result<(), String> {
        let frame_hwnd = parse_hwnd(&target.frame_hwnd)?;
        let expected = target
            .focus_hwnd
            .as_deref()
            .and_then(|value| parse_hwnd(value).ok())
            .ok_or_else(|| "Saved delivery focus control is incomplete.".to_string())?;
        let focused = focused_control_for_frame(frame_hwnd)
            .ok_or_else(|| "The saved delivery focus control is no longer focused.".to_string())?;

        if !focused_control_matches_lease(target, &focused) || focused.hwnd != expected {
            return Err(
                "The saved delivery focus control changed before selection replacement."
                    .to_string(),
            );
        }

        Ok(())
    }

    fn focused_control_matches_lease(
        target: &DesktopDeliveryTarget,
        focused: &FocusedControl,
    ) -> bool {
        let Some(saved_hwnd) = target
            .focus_hwnd
            .as_deref()
            .and_then(|value| parse_hwnd(value).ok())
        else {
            return false;
        };
        let Some(saved_class) = target.focus_class.as_deref() else {
            return false;
        };
        let Some(saved_process_id) = target.focus_process_id else {
            return false;
        };

        focused.hwnd == saved_hwnd
            && focused.class_name == saved_class
            && focused.process_id == saved_process_id
    }

    fn focused_control_for_frame(frame_hwnd: HWND) -> Option<FocusedControl> {
        let thread_id = unsafe { GetWindowThreadProcessId(frame_hwnd, ptr::null_mut()) };
        if thread_id == 0 {
            return None;
        }

        let mut info = GUITHREADINFO {
            cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
            ..unsafe { std::mem::zeroed() }
        };
        if unsafe { GetGUIThreadInfo(thread_id, &mut info) } == 0 || info.hwndFocus.is_null() {
            return None;
        }

        let focus_hwnd = info.hwndFocus;
        if unsafe { IsWindow(focus_hwnd) } == 0
            || unsafe { GetAncestor(focus_hwnd, GA_ROOT) } != frame_hwnd
        {
            return None;
        }

        let mut process_id = 0u32;
        unsafe {
            GetWindowThreadProcessId(focus_hwnd, &mut process_id);
        }
        Some(FocusedControl {
            hwnd: focus_hwnd,
            class_name: get_class_name(focus_hwnd),
            process_id,
        })
    }

    fn is_native_edit_class_name(class_name: &str) -> bool {
        let normalized = class_name.trim().to_ascii_lowercase();
        normalized == "edit"
            || normalized.starts_with("richedit")
            || normalized.contains("windowsforms10.edit.")
            || normalized.contains("windowsforms10.richedit")
    }

    fn is_native_edit_control(control: &FocusedControl) -> bool {
        if !is_native_edit_class_name(&control.class_name)
            || unsafe { IsWindowEnabled(control.hwnd) } == 0
        {
            return false;
        }

        let style = unsafe { GetWindowLongPtrW(control.hwnd, GWL_STYLE) } as u32;
        style & (ES_PASSWORD_STYLE | ES_READONLY_STYLE) == 0
    }

    fn matching_native_edit_target(
        target: &DesktopDeliveryTarget,
        focused: Option<&FocusedControl>,
    ) -> Option<HWND> {
        if !target.native_edit_fast_path {
            return None;
        }
        let focused = focused?;
        let saved_hwnd = target.focus_hwnd.as_deref()?.parse::<isize>().ok()? as HWND;
        let saved_class = target.focus_class.as_deref()?;
        let saved_process_id = target.focus_process_id?;
        (focused.hwnd == saved_hwnd
            && focused.process_id == saved_process_id
            && focused.class_name == saved_class
            && is_native_edit_control(focused))
        .then_some(focused.hwnd)
    }

    pub fn observe_desktop_paste(
        text: String,
        target: DesktopDeliveryTarget,
        timeout_ms: Option<u64>,
    ) -> Result<DesktopPasteObservationResult, String> {
        let hwnd = parse_hwnd(&target.frame_hwnd)?;
        let expected = normalize_observed_text(&text);
        if expected.trim().is_empty() {
            return Ok(create_observation(
                "unsupported",
                "none",
                "Observer received empty text.",
                &target,
            ));
        }

        let deadline = Instant::now() + Duration::from_millis(timeout_ms.unwrap_or(750).max(50));
        while Instant::now() <= deadline {
            let observed = read_window_text_surfaces(hwnd)
                .into_iter()
                .map(|value| normalize_observed_text(&value))
                .any(|value| value.contains(&expected));
            if observed {
                return Ok(create_observation(
                    "observed",
                    "high",
                    "Native Windows observer confirmed insertion in the saved target.",
                    &target,
                ));
            }
            thread::sleep(Duration::from_millis(50));
        }

        Ok(create_observation(
            "timeout",
            "low",
            "Native Windows observer did not see inserted text before timeout.",
            &target,
        ))
    }

    pub fn deliver_text_to_desktop_target(
        text: String,
        target: DesktopDeliveryTarget,
        press_enter_after_paste: bool,
        focus_target_before_paste: bool,
        delivery_mode: DeliveryMode,
        clipboard_owner_hwnd: Option<isize>,
    ) -> Result<DesktopDeliveryResult, String> {
        if text.trim().is_empty() {
            return Err("Cannot deliver empty text.".to_string());
        }
        if !target.input_like {
            return Err(target.reason.clone());
        }

        let total_started = Instant::now();
        let hwnd = parse_hwnd(&target.frame_hwnd)?;
        if delivery_mode == DeliveryMode::Direct {
            prepare_direct_delivery_focus(hwnd, focus_target_before_paste)?;
        }
        let prepare_ms = total_started.elapsed().as_millis();

        let focused = focused_control_for_delivery(hwnd, &target);
        let native_edit_hwnd = matching_native_edit_target(&target, focused.as_ref());
        let observer_hwnd = native_edit_hwnd;
        let observable_before = observer_hwnd.and_then(read_window_control_text);

        let input_started = Instant::now();
        let (method, clipboard_kind, delivery_warning) = if delivery_mode
            == DeliveryMode::ClipboardPaste
        {
            let owner_hwnd = clipboard_owner_hwnd
                .map(|value| value as HWND)
                .filter(|value| !value.is_null())
                .ok_or_else(|| {
                    "Clipboard paste mode requires a live Dictation window owner.".to_string()
                })?;
            let warning = deliver_text_with_clipboard(
                &text,
                &target,
                hwnd,
                press_enter_after_paste,
                focus_target_before_paste,
                owner_hwnd,
            )?;
            (
                DirectDeliveryMethod::UnicodeSendInput,
                Some("selected"),
                warning,
            )
        } else {
            let direct_result = deliver_text_without_clipboard(
                &text,
                hwnd,
                native_edit_hwnd,
                press_enter_after_paste,
            );
            match direct_result {
                Ok(outcome) => (outcome.method, None, outcome.warning),
                Err(DirectDeliveryError::RetrySafe(error)) if allow_clipboard_paste_fallback() => {
                    eprintln!(
                            "[dictation-tauri][desktop-delivery] retry-safe direct input failure; using explicit clipboard fallback reason={error}"
                        );
                    let owner_hwnd = clipboard_owner_hwnd
                        .map(|value| value as HWND)
                        .filter(|value| !value.is_null())
                        .ok_or_else(|| {
                            "Clipboard fallback requires a live Dictation window owner.".to_string()
                        })?;
                    let warning = deliver_text_with_clipboard(
                            &text,
                            &target,
                            hwnd,
                            press_enter_after_paste,
                            focus_target_before_paste,
                            owner_hwnd,
                        )
                        .map_err(|fallback_error| {
                            eprintln!(
                                "[dictation-tauri][desktop-delivery] clipboard fallback failed reason={fallback_error}"
                            );
                            fallback_error
                        })?;
                    (
                        DirectDeliveryMethod::UnicodeSendInput,
                        Some("fallback"),
                        warning,
                    )
                }
                Err(DirectDeliveryError::Uncertain(error)) => {
                    eprintln!(
                            "[dictation-tauri][desktop-delivery] native edit delivery is uncertain; no fallback attempted reason={error}"
                        );
                    return Err(format!(
                            "Native edit delivery could not be confirmed: {error}. No fallback was attempted to avoid duplicate text."
                        ));
                }
                Err(DirectDeliveryError::RetrySafe(error)) => {
                    eprintln!(
                            "[dictation-tauri][desktop-delivery] direct delivery failed without clipboard fallback reason={error}"
                        );
                    return Err(format!(
                            "Direct text input failed without using the clipboard: {error}. Temporary clipboard fallback is disabled by default."
                        ));
                }
            }
        };
        let input_ms = input_started.elapsed().as_millis();

        let observable_after = observer_hwnd.and_then(read_window_control_text);
        let observed = did_observe_inserted_text(
            &text,
            observable_before.as_deref(),
            observable_after.as_deref(),
        );
        let total_ms = total_started.elapsed().as_millis();
        let utf16_units = text.encode_utf16().count();
        let method_label = match clipboard_kind {
            Some("selected") => "clipboard_paste",
            Some(_) => "clipboard_fallback",
            None => method.label(),
        };
        eprintln!(
            "[dictation-tauri][desktop-delivery] completed method={method_label} utf16_units={utf16_units} prepare_ms={prepare_ms} input_ms={input_ms} total_ms={total_ms} observed={observed}"
        );

        let target_description = if focus_target_before_paste {
            "saved foreground target"
        } else {
            "current foreground target without changing windows"
        };
        let reason = if clipboard_kind == Some("selected") && observed {
            format!(
                "Selected clipboard paste was verified by a bounded Win32 text observer on the {target_description}."
            )
        } else if clipboard_kind == Some("selected") && press_enter_after_paste {
            format!(
                "Selected clipboard paste and Enter commands were sent to the {target_description} without observation."
            )
        } else if clipboard_kind == Some("selected") {
            format!(
                "Selected clipboard paste was sent to the {target_description} without observation."
            )
        } else if clipboard_kind == Some("fallback") && observed {
            format!(
                "Explicit clipboard fallback was verified by a bounded Win32 text observer on the {target_description}."
            )
        } else if clipboard_kind == Some("fallback") && press_enter_after_paste {
            format!(
                "Explicit clipboard fallback and Enter commands were sent to the {target_description} without observation."
            )
        } else if clipboard_kind == Some("fallback") {
            format!(
                "Explicit clipboard fallback was sent to the {target_description} without observation."
            )
        } else if method == DirectDeliveryMethod::NativeEditMessage && observed {
            "Native Edit insertion was verified on the focused control without using the clipboard."
                .to_string()
        } else if method == DirectDeliveryMethod::NativeEditMessage && press_enter_after_paste {
            "Native Edit insertion and Enter were sent to the focused control without using the clipboard or observation."
                .to_string()
        } else if method == DirectDeliveryMethod::NativeEditMessage {
            "Native Edit insertion was sent to the focused control without using the clipboard or observation."
                .to_string()
        } else if observed {
            format!(
                "Direct Unicode input was verified on the focused control of the {target_description} without using the clipboard."
            )
        } else if press_enter_after_paste {
            format!(
                "Direct Unicode input and Enter were sent to the {target_description} without using the clipboard or observation."
            )
        } else {
            format!(
                "Direct Unicode input was sent to the {target_description} without using the clipboard or observation."
            )
        };
        let reason = delivery_warning
            .map(|warning| format!("{reason} Delivery warning: {warning}"))
            .unwrap_or(reason);

        Ok(DesktopDeliveryResult {
            status: if observed {
                "paste_observed"
            } else {
                "paste_sent"
            },
            reason,
            target,
        })
    }

    struct DirectDeliveryOutcome {
        method: DirectDeliveryMethod,
        warning: Option<String>,
    }

    fn prepare_direct_delivery_focus(
        hwnd: HWND,
        focus_target_before_paste: bool,
    ) -> Result<(), String> {
        if focus_target_before_paste {
            focus_window(hwnd)?;
        } else if !is_expected_foreground(hwnd, unsafe { GetForegroundWindow() }) {
            return Err(
                "Foreground input changed before direct delivery; no window was focused and no keys were sent."
                    .to_string(),
            );
        }

        if is_expected_foreground(hwnd, unsafe { GetForegroundWindow() }) {
            Ok(())
        } else {
            Err("Desktop target lost focus before direct delivery; no text was sent.".to_string())
        }
    }

    fn focused_control_for_delivery(
        hwnd: HWND,
        target: &DesktopDeliveryTarget,
    ) -> Option<FocusedControl> {
        let deadline = Instant::now() + Duration::from_millis(50);
        loop {
            let focused = focused_control_for_frame(hwnd);
            if matching_native_edit_target(target, focused.as_ref()).is_some()
                || !target.native_edit_fast_path
                || Instant::now() >= deadline
            {
                return focused;
            }
            thread::sleep(Duration::from_millis(5));
        }
    }

    fn deliver_text_without_clipboard(
        text: &str,
        hwnd: HWND,
        native_edit_hwnd: Option<HWND>,
        press_enter_after_paste: bool,
    ) -> Result<DirectDeliveryOutcome, DirectDeliveryError> {
        if !is_expected_foreground(hwnd, unsafe { GetForegroundWindow() }) {
            return Err(DirectDeliveryError::RetrySafe(
                "Desktop target lost focus before direct text input; no text was sent.".to_string(),
            ));
        }

        if let Some(edit_hwnd) = native_edit_hwnd {
            send_native_edit_text(edit_hwnd, text).map_err(DirectDeliveryError::Uncertain)?;
            let warning = send_post_delivery_keys(press_enter_after_paste);
            return Ok(DirectDeliveryOutcome {
                method: DirectDeliveryMethod::NativeEditMessage,
                warning,
            });
        }

        release_modifier_keys().map_err(DirectDeliveryError::RetrySafe)?;
        thread::sleep(Duration::from_millis(20));
        if !is_expected_foreground(hwnd, unsafe { GetForegroundWindow() }) {
            return Err(DirectDeliveryError::RetrySafe(
                "Desktop target lost focus before direct Unicode input; no text was sent."
                    .to_string(),
            ));
        }
        send_unicode_text(text).map_err(DirectDeliveryError::RetrySafe)?;
        let warning = send_post_delivery_keys(press_enter_after_paste);
        Ok(DirectDeliveryOutcome {
            method: DirectDeliveryMethod::UnicodeSendInput,
            warning,
        })
    }

    fn send_native_edit_text(hwnd: HWND, text: &str) -> Result<(), String> {
        let wide_text = text
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let mut message_result = 0usize;
        let sent = unsafe {
            SendMessageTimeoutW(
                hwnd,
                EM_REPLACESEL_MESSAGE,
                1,
                wide_text.as_ptr() as isize,
                SMTO_BLOCK | SMTO_ABORTIFHUNG | SMTO_ERRORONEXIT,
                NATIVE_EDIT_MESSAGE_TIMEOUT_MS,
                &mut message_result,
            )
        };
        if sent == 0 {
            Err("the focused native Edit control timed out or rejected EM_REPLACESEL".to_string())
        } else {
            Ok(())
        }
    }

    fn send_post_delivery_keys(press_enter_after_paste: bool) -> Option<String> {
        let mut warnings = Vec::new();
        if press_enter_after_paste {
            thread::sleep(Duration::from_millis(20));
            if let Err(error) = release_modifier_keys().and_then(|_| send_enter()) {
                warnings.push(error);
            }
        }
        if let Err(error) = release_modifier_keys() {
            warnings.push(error);
        }
        (!warnings.is_empty()).then(|| warnings.join(" "))
    }

    fn allow_clipboard_paste_fallback() -> bool {
        std::env::var("DICTATION_TAURI_ALLOW_CLIPBOARD_PASTE_FALLBACK")
            .map(|value| {
                matches!(
                    value.to_ascii_lowercase().as_str(),
                    "1" | "true" | "yes" | "on"
                )
            })
            .unwrap_or(false)
    }

    fn deliver_text_with_clipboard(
        text: &str,
        target: &DesktopDeliveryTarget,
        hwnd: HWND,
        press_enter_after_paste: bool,
        focus_target_before_paste: bool,
        clipboard_owner_hwnd: HWND,
    ) -> Result<Option<String>, String> {
        if focus_target_before_paste {
            focus_window(hwnd)?;
        } else if !is_expected_foreground(hwnd, unsafe { GetForegroundWindow() }) {
            return Err(
                "Foreground input changed before paste; no window was focused and no keys were sent."
                    .to_string(),
            );
        }
        let previous_clipboard = read_clipboard_snapshot()?;
        if let Err(write_error) = write_transient_clipboard_text(text, clipboard_owner_hwnd) {
            return match restore_clipboard_snapshot(previous_clipboard) {
                Ok(()) => Err(write_error),
                Err(restore_error) => Err(format!(
                    "{write_error} Clipboard restoration also failed: {restore_error}"
                )),
            };
        }

        let mut paste_sent = false;
        let paste_result = (|| {
            thread::sleep(Duration::from_millis(80));
            if !is_expected_foreground(hwnd, unsafe { GetForegroundWindow() }) {
                return Err(
                    "Desktop target lost focus before paste; no keys were sent.".to_string()
                );
            }
            release_modifier_keys()?;
            if !is_expected_foreground(hwnd, unsafe { GetForegroundWindow() }) {
                return Err(
                    "Desktop target lost focus before Ctrl+V; no paste keys were sent.".to_string(),
                );
            }
            send_ctrl_v()?;
            paste_sent = true;
            if press_enter_after_paste {
                thread::sleep(Duration::from_millis(80));
                send_enter()?;
            }
            thread::sleep(clipboard_restore_delay(target));
            Ok::<(), String>(())
        })();

        combine_paste_and_restore_results(
            paste_sent,
            paste_result,
            restore_clipboard_snapshot(previous_clipboard),
        )
    }

    fn combine_paste_and_restore_results(
        paste_sent: bool,
        paste_result: Result<(), String>,
        restore_result: Result<(), String>,
    ) -> Result<Option<String>, String> {
        let warning = match (paste_result.err(), restore_result.err()) {
            (None, None) => None,
            (Some(error), None) | (None, Some(error)) => Some(error),
            (Some(paste_error), Some(restore_error)) => Some(format!(
                "{paste_error} Clipboard restoration also failed: {restore_error}"
            )),
        };

        if paste_sent {
            Ok(warning)
        } else if let Some(error) = warning {
            Err(error)
        } else {
            Ok(None)
        }
    }

    fn clear_clipboard_text() -> Result<(), String> {
        unsafe {
            if OpenClipboard(ptr::null_mut()) == 0 {
                return Err("Clipboard could not be opened for clear.".to_string());
            }
            if EmptyClipboard() == 0 {
                CloseClipboard();
                return Err("Clipboard could not be cleared after paste.".to_string());
            }
            if CloseClipboard() == 0 {
                return Err("Clipboard could not be closed after clear.".to_string());
            }
        }
        Ok(())
    }

    fn clipboard_restore_delay(target: &DesktopDeliveryTarget) -> Duration {
        if target
            .window_class
            .to_ascii_lowercase()
            .contains("chrome_widgetwin")
        {
            return Duration::from_millis(700);
        }

        Duration::from_millis(160)
    }

    fn did_observe_inserted_text(text: &str, before: Option<&str>, after: Option<&str>) -> bool {
        let expected = normalize_observer_text(text);
        if expected.trim().is_empty() {
            return false;
        }

        let Some(after) = after else {
            return false;
        };

        let before_count = before
            .map(|value| count_observer_occurrences(&normalize_observer_text(value), &expected))
            .unwrap_or(0);
        let after_count = count_observer_occurrences(&normalize_observer_text(after), &expected);

        after_count > before_count
    }

    fn normalize_observer_text(value: &str) -> String {
        value.trim().replace("\r\n", "\n").replace('\r', "\n")
    }

    fn count_observer_occurrences(haystack: &str, needle: &str) -> usize {
        if needle.is_empty() {
            return 0;
        }
        haystack.match_indices(needle).count()
    }

    fn parse_hwnd(value: &str) -> Result<HWND, String> {
        value
            .parse::<isize>()
            .map(|parsed| parsed as HWND)
            .map_err(|_| "Saved delivery target handle is invalid.".to_string())
    }

    fn is_expected_foreground(expected: HWND, current: HWND) -> bool {
        !expected.is_null() && expected == current
    }

    fn focus_window(hwnd: HWND) -> Result<(), String> {
        unsafe {
            if IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            } else if IsWindowVisible(hwnd) == 0 {
                ShowWindow(hwnd, SW_SHOW);
            }

            let current_thread_id = GetCurrentThreadId();
            let target_thread_id = GetWindowThreadProcessId(hwnd, ptr::null_mut());
            let foreground_hwnd = GetForegroundWindow();
            let foreground_thread_id = if foreground_hwnd.is_null() {
                0
            } else {
                GetWindowThreadProcessId(foreground_hwnd, ptr::null_mut())
            };
            let attached_target = target_thread_id != 0
                && target_thread_id != current_thread_id
                && AttachThreadInput(current_thread_id, target_thread_id, 1) != 0;
            let attached_foreground = foreground_thread_id != 0
                && foreground_thread_id != current_thread_id
                && foreground_thread_id != target_thread_id
                && AttachThreadInput(current_thread_id, foreground_thread_id, 1) != 0;

            BringWindowToTop(hwnd);
            SetForegroundWindow(hwnd);

            if attached_foreground {
                AttachThreadInput(current_thread_id, foreground_thread_id, 0);
            }
            if attached_target {
                AttachThreadInput(current_thread_id, target_thread_id, 0);
            }
        }

        let deadline = Instant::now() + Duration::from_millis(250);
        loop {
            if is_expected_foreground(hwnd, unsafe { GetForegroundWindow() }) {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err("Desktop target could not be focused before paste.".to_string());
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn release_modifier_keys() -> Result<(), String> {
        send_keyboard_inputs(
            &mut [
                key_input(VK_SHIFT, true),
                key_input(VK_CONTROL, true),
                key_input(VK_MENU, true),
                key_input(VK_LWIN, true),
                key_input(VK_RWIN, true),
            ],
            "Modifier keys could not be released before text delivery.",
        )
    }

    fn send_unicode_text(text: &str) -> Result<(), String> {
        for chunk in text.encode_utf16().collect::<Vec<_>>().chunks(512) {
            let mut inputs = Vec::with_capacity(chunk.len() * 2);
            for code_unit in chunk {
                inputs.push(unicode_input(*code_unit, false));
                inputs.push(unicode_input(*code_unit, true));
            }
            send_keyboard_inputs(
                &mut inputs,
                "Direct text input could not be sent without the clipboard.",
            )?;
            thread::sleep(Duration::from_millis(1));
        }
        Ok(())
    }

    fn send_ctrl_v() -> Result<(), String> {
        send_keyboard_inputs(
            &mut [
                key_input(VK_CONTROL, false),
                key_input(VK_V, false),
                key_input(VK_V, true),
                key_input(VK_CONTROL, true),
            ],
            "Paste shortcut could not be sent.",
        )
    }

    fn send_keyboard_inputs(inputs: &mut [INPUT], error_message: &str) -> Result<(), String> {
        let sent = unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_mut_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            )
        };
        if sent == inputs.len() as u32 {
            Ok(())
        } else {
            Err(error_message.to_string())
        }
    }

    fn send_enter() -> Result<(), String> {
        let mut inputs = [key_input(VK_RETURN, false), key_input(VK_RETURN, true)];
        let sent = unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_mut_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            )
        };
        if sent == inputs.len() as u32 {
            Ok(())
        } else {
            Err("Enter key could not be sent after paste.".to_string())
        }
    }

    fn unicode_input(code_unit: u16, key_up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: 0,
                    wScan: code_unit,
                    dwFlags: KEYEVENTF_UNICODE | if key_up { KEYEVENTF_KEYUP } else { 0 },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn key_input(key: VIRTUAL_KEY, key_up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: key,
                    wScan: 0,
                    dwFlags: if key_up { KEYEVENTF_KEYUP } else { 0 },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn get_window_text(hwnd: HWND) -> String {
        let len = unsafe { GetWindowTextLengthW(hwnd) };
        if len <= 0 {
            return String::new();
        }
        let mut buffer = vec![0u16; len as usize + 1];
        let copied = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
        String::from_utf16_lossy(&buffer[..copied as usize])
    }

    fn get_class_name(hwnd: HWND) -> String {
        let mut buffer = vec![0u16; 256];
        let copied = unsafe { GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
        String::from_utf16_lossy(&buffer[..copied as usize])
    }

    fn get_process_name(process_id: u32) -> Option<String> {
        if process_id == 0 {
            return None;
        }

        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
            if handle.is_null() {
                return None;
            }

            let mut buffer = vec![0u16; 1024];
            let mut len = buffer.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut len);
            CloseHandle(handle);
            if ok == 0 || len == 0 {
                return None;
            }

            let path = String::from_utf16_lossy(&buffer[..len as usize]);
            path.rsplit(['\\', '/'])
                .next()
                .map(|value| value.to_string())
        }
    }

    fn read_window_text_surfaces(hwnd: HWND) -> Vec<String> {
        let mut hwnds = Vec::new();
        unsafe {
            EnumChildWindows(
                hwnd,
                Some(enum_child_window),
                &mut hwnds as *mut Vec<HWND> as LPARAM,
            );
        }

        hwnds
            .into_iter()
            .filter_map(read_window_control_text)
            .filter(|value| !value.trim().is_empty())
            .collect()
    }

    unsafe extern "system" fn enum_child_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
        unsafe {
            let hwnds = &mut *(lparam as *mut Vec<HWND>);
            hwnds.push(hwnd);
        }
        1
    }

    fn read_window_control_text(hwnd: HWND) -> Option<String> {
        let length = send_message_timeout(hwnd, WM_GETTEXTLENGTH, 0, 0)? as usize;
        if length == 0 || length > 1_000_000 {
            return None;
        }

        let mut buffer = vec![0u16; length + 1];
        let copied =
            send_message_timeout(hwnd, WM_GETTEXT, buffer.len(), buffer.as_mut_ptr() as isize)?
                as usize;
        if copied == 0 {
            return None;
        }

        Some(String::from_utf16_lossy(&buffer[..copied]))
    }

    fn send_message_timeout(hwnd: HWND, msg: u32, wparam: usize, lparam: isize) -> Option<isize> {
        let mut result = 0usize;
        let sent = unsafe {
            SendMessageTimeoutW(hwnd, msg, wparam, lparam, SMTO_ABORTIFHUNG, 80, &mut result)
        };
        if sent == 0 {
            None
        } else {
            Some(result as isize)
        }
    }

    fn normalize_observed_text(value: &str) -> String {
        value
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase()
    }

    fn create_observation(
        status: &'static str,
        confidence: &'static str,
        reason: &str,
        target: &DesktopDeliveryTarget,
    ) -> DesktopPasteObservationResult {
        DesktopPasteObservationResult {
            status,
            confidence,
            reason: reason.to_string(),
            target_after: DesktopTargetSnapshot {
                captured_at: current_timestamp_millis(),
                app_label: target.window_class.clone(),
                window_label: target.window_title.clone(),
                confidence,
            },
        }
    }

    fn current_timestamp_millis() -> String {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis().to_string())
            .unwrap_or_else(|_| "0".to_string())
    }

    fn classify_clipboard_snapshot(
        format_count: i32,
        formats: &[ClipboardFormatDescriptor],
        mut snapshot: ClipboardSnapshot,
    ) -> Result<Option<ClipboardSnapshot>, String> {
        if format_count == 0 && formats.is_empty() {
            return Ok(None);
        }
        if format_count < 0 || formats.len() != format_count as usize {
            return Err(
                "Clipboard formats could not be enumerated safely and were left unchanged."
                    .to_string(),
            );
        }

        snapshot.additional_formats = formats
            .iter()
            .filter_map(|format| {
                format
                    .bytes
                    .as_ref()
                    .filter(|bytes| !bytes.is_empty())
                    .map(|bytes| ClipboardAdditionalFormat {
                        id: format.id,
                        bytes: bytes.clone(),
                    })
            })
            .collect();

        let has_text = snapshot.text.is_some();
        let has_image = snapshot.dib.is_some() || snapshot.dib_v5.is_some();
        let restorable = formats.iter().all(|format| match format.id {
            CF_TEXT_FORMAT | CF_OEMTEXT_FORMAT | CF_UNICODETEXT_FORMAT | CF_LOCALE_FORMAT => {
                has_text
            }
            CF_BITMAP_FORMAT | CF_DIB_FORMAT | CF_PALETTE_FORMAT | CF_DIBV5_FORMAT => has_image,
            _ if format
                .name
                .as_deref()
                .is_some_and(|name| RESTORABLE_BITMAP_METADATA_FORMAT_NAMES.contains(&name)) =>
            {
                has_image
            }
            _ => snapshot
                .additional_formats
                .iter()
                .any(|additional| additional.id == format.id),
        });
        if restorable && (has_text || has_image || !snapshot.additional_formats.is_empty()) {
            return Ok(Some(snapshot));
        }
        Err("Clipboard contains unsupported data and was left unchanged.".to_string())
    }

    fn should_clone_clipboard_format(id: u32, name: Option<&str>) -> bool {
        if matches!(
            id,
            CF_TEXT_FORMAT
                | CF_OEMTEXT_FORMAT
                | CF_UNICODETEXT_FORMAT
                | CF_LOCALE_FORMAT
                | CF_BITMAP_FORMAT
                | CF_DIB_FORMAT
                | CF_PALETTE_FORMAT
                | CF_DIBV5_FORMAT
        ) {
            return false;
        }

        !name.is_some_and(|value| RESTORABLE_BITMAP_METADATA_FORMAT_NAMES.contains(&value))
    }

    fn clipboard_format_diagnostic(format: &ClipboardFormatDescriptor) -> String {
        let name = format
            .name
            .as_deref()
            .unwrap_or("standard")
            .chars()
            .filter(|character| !character.is_control())
            .take(48)
            .collect::<String>();
        format!(
            "id=0x{:04x},name={:?},cloneable={}",
            format.id,
            name,
            format.bytes.is_some()
        )
    }

    fn read_clipboard_snapshot() -> Result<Option<ClipboardSnapshot>, String> {
        unsafe {
            if OpenClipboard(ptr::null_mut()) == 0 {
                return Err("Clipboard could not be opened before paste.".to_string());
            }
            let format_count = CountClipboardFormats();
            let mut formats = Vec::new();
            let mut format = EnumClipboardFormats(0);
            while format != 0 {
                let name = read_clipboard_format_name_open(format);
                let bytes = should_clone_clipboard_format(format, name.as_deref())
                    .then(|| read_clipboard_format_bytes_open(format))
                    .flatten();
                formats.push(ClipboardFormatDescriptor {
                    id: format,
                    name,
                    bytes,
                });
                format = EnumClipboardFormats(format);
            }
            let snapshot = ClipboardSnapshot {
                text: read_clipboard_text_open(),
                dib: read_clipboard_format_bytes_open(CF_DIB_FORMAT)
                    .or_else(|| read_clipboard_bitmap_as_dib_open()),
                dib_v5: read_clipboard_format_bytes_open(CF_DIBV5_FORMAT),
                additional_formats: Vec::new(),
            };
            if CloseClipboard() == 0 {
                return Err("Clipboard could not be closed after snapshot.".to_string());
            }
            match classify_clipboard_snapshot(format_count, &formats, snapshot) {
                Ok(snapshot) => Ok(snapshot),
                Err(error) => {
                    let diagnostics = formats
                        .iter()
                        .map(clipboard_format_diagnostic)
                        .collect::<Vec<_>>()
                        .join(";");
                    eprintln!(
                        "[dictation-tauri][clipboard] snapshot rejected formats=[{diagnostics}]"
                    );
                    Err(error)
                }
            }
        }
    }

    unsafe fn read_clipboard_format_name_open(format: u32) -> Option<String> {
        unsafe {
            let mut buffer = [0u16; 256];
            let length = GetClipboardFormatNameW(format, buffer.as_mut_ptr(), buffer.len() as i32);
            (length > 0).then(|| String::from_utf16_lossy(&buffer[..length as usize]))
        }
    }

    unsafe fn read_clipboard_text_open() -> Option<String> {
        unsafe {
            if IsClipboardFormatAvailable(CF_UNICODETEXT_FORMAT) == 0 {
                return None;
            }
            let handle = GetClipboardData(CF_UNICODETEXT_FORMAT);
            if handle.is_null() {
                return None;
            }
            let ptr = GlobalLock(handle) as *const u16;
            if ptr.is_null() {
                return None;
            }
            let size = GlobalSize(handle) / 2;
            let slice = std::slice::from_raw_parts(ptr, size);
            let nul = slice
                .iter()
                .position(|value| *value == 0)
                .unwrap_or(slice.len());
            let text = String::from_utf16_lossy(&slice[..nul]);
            GlobalUnlock(handle);
            Some(text)
        }
    }

    unsafe fn read_clipboard_bitmap_as_dib_open() -> Option<Vec<u8>> {
        unsafe {
            if IsClipboardFormatAvailable(CF_BITMAP_FORMAT) == 0 {
                return None;
            }
            let bitmap_handle = GetClipboardData(CF_BITMAP_FORMAT);
            if bitmap_handle.is_null() {
                return None;
            }

            let mut bitmap: BITMAP = std::mem::zeroed();
            if GetObjectW(
                bitmap_handle,
                std::mem::size_of::<BITMAP>() as i32,
                &mut bitmap as *mut BITMAP as *mut c_void,
            ) == 0
            {
                return None;
            }
            let width = usize::try_from(bitmap.bmWidth).ok()?;
            let height = usize::try_from(bitmap.bmHeight.checked_abs()?).ok()?;
            if width == 0 || height == 0 {
                return None;
            }
            let pixel_bytes = width.checked_mul(4)?.checked_mul(height)?;
            if pixel_bytes > 256 * 1024 * 1024 {
                return None;
            }

            let mut info: BITMAPINFO = std::mem::zeroed();
            info.bmiHeader.biSize = std::mem::size_of_val(&info.bmiHeader) as u32;
            info.bmiHeader.biWidth = bitmap.bmWidth;
            info.bmiHeader.biHeight = bitmap.bmHeight;
            info.bmiHeader.biPlanes = 1;
            info.bmiHeader.biBitCount = 32;
            info.bmiHeader.biCompression = BI_RGB;
            info.bmiHeader.biSizeImage = pixel_bytes as u32;

            let mut pixels = vec![0u8; pixel_bytes];
            let screen_dc = GetDC(ptr::null_mut());
            if screen_dc.is_null() {
                return None;
            }
            let copied_lines = GetDIBits(
                screen_dc,
                bitmap_handle,
                0,
                height as u32,
                pixels.as_mut_ptr() as *mut c_void,
                &mut info,
                DIB_RGB_COLORS,
            );
            ReleaseDC(ptr::null_mut(), screen_dc);
            if copied_lines != height as i32 {
                return None;
            }

            let header = std::slice::from_raw_parts(
                &info.bmiHeader as *const _ as *const u8,
                std::mem::size_of_val(&info.bmiHeader),
            );
            let mut dib = Vec::with_capacity(header.len() + pixels.len());
            dib.extend_from_slice(header);
            dib.extend_from_slice(&pixels);
            Some(dib)
        }
    }

    unsafe fn read_clipboard_format_bytes_open(format: u32) -> Option<Vec<u8>> {
        unsafe {
            if IsClipboardFormatAvailable(format) == 0 {
                return None;
            }
            let handle = GetClipboardData(format);
            if handle.is_null() {
                return None;
            }
            let size = GlobalSize(handle);
            if size == 0 {
                return None;
            }
            let source = GlobalLock(handle) as *const u8;
            if source.is_null() {
                return None;
            }
            let bytes = std::slice::from_raw_parts(source, size).to_vec();
            GlobalUnlock(handle);
            Some(bytes)
        }
    }

    fn restore_clipboard_snapshot(snapshot: Option<ClipboardSnapshot>) -> Result<(), String> {
        let Some(snapshot) = snapshot else {
            return clear_clipboard_text();
        };
        if snapshot.text.is_none()
            && snapshot.dib.is_none()
            && snapshot.dib_v5.is_none()
            && snapshot.additional_formats.is_empty()
        {
            return Err("Clipboard snapshot contained no restorable data.".to_string());
        }

        unsafe {
            if OpenClipboard(ptr::null_mut()) == 0 {
                return Err("Clipboard could not be opened for restoration.".to_string());
            }
            if EmptyClipboard() == 0 {
                CloseClipboard();
                return Err("Clipboard could not be cleared for restoration.".to_string());
            }

            let mut restored = true;
            if let Some(text) = snapshot.text.as_deref() {
                restored = write_clipboard_text_open(text) && restored;
            }
            if let Some(dib_v5) = snapshot.dib_v5.as_deref() {
                restored = write_clipboard_format_bytes_open(CF_DIBV5_FORMAT, dib_v5) && restored;
            }
            if let Some(dib) = snapshot.dib.as_deref() {
                restored = write_clipboard_format_bytes_open(CF_DIB_FORMAT, dib) && restored;
            }
            for additional in &snapshot.additional_formats {
                restored =
                    write_clipboard_format_bytes_open(additional.id, &additional.bytes) && restored;
            }
            let closed = CloseClipboard() != 0;
            if !restored {
                return Err("Clipboard restoration was incomplete after paste.".to_string());
            }
            if !closed {
                return Err("Clipboard could not be closed after restoration.".to_string());
            }
        }
        Ok(())
    }

    unsafe fn write_clipboard_text_open(text: &str) -> bool {
        unsafe {
            let mut encoded: Vec<u16> = text.encode_utf16().collect();
            encoded.push(0);
            let bytes = encoded.len() * std::mem::size_of::<u16>();
            let handle = GlobalAlloc(GMEM_MOVEABLE, bytes);
            if handle.is_null() {
                return false;
            }
            let destination = GlobalLock(handle) as *mut c_void;
            if destination.is_null() {
                return false;
            }
            ptr::copy_nonoverlapping(encoded.as_ptr() as *const c_void, destination, bytes);
            GlobalUnlock(handle);
            !SetClipboardData(CF_UNICODETEXT_FORMAT, handle).is_null()
        }
    }

    unsafe fn write_clipboard_format_bytes_open(format: u32, bytes: &[u8]) -> bool {
        unsafe {
            if bytes.is_empty() {
                return false;
            }
            let handle = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
            if handle.is_null() {
                return false;
            }
            let destination = GlobalLock(handle) as *mut c_void;
            if destination.is_null() {
                return false;
            }
            ptr::copy_nonoverlapping(bytes.as_ptr() as *const c_void, destination, bytes.len());
            GlobalUnlock(handle);
            !SetClipboardData(format, handle).is_null()
        }
    }

    fn transient_paste_format() -> Result<u32, String> {
        static FORMAT: LazyLock<u32> = LazyLock::new(|| {
            let encoded: Vec<u16> = TRANSIENT_PASTE_FORMAT_NAME
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            unsafe { RegisterClipboardFormatW(encoded.as_ptr()) }
        });
        if *FORMAT == 0 {
            Err("Transient paste clipboard format could not be registered.".to_string())
        } else {
            Ok(*FORMAT)
        }
    }

    fn write_transient_clipboard_text(text: &str, owner_hwnd: HWND) -> Result<(), String> {
        let marker_format = transient_paste_format()?;
        unsafe {
            if OpenClipboard(owner_hwnd) == 0 {
                return Err("Clipboard could not be opened for transient paste.".to_string());
            }
            if EmptyClipboard() == 0 {
                CloseClipboard();
                return Err("Clipboard could not be cleared for transient paste.".to_string());
            }
            let wrote_text = write_clipboard_text_open(text);
            let wrote_marker =
                write_clipboard_format_bytes_open(marker_format, TRANSIENT_PASTE_MARKER);
            if !wrote_text || !wrote_marker {
                CloseClipboard();
                return Err(
                    "Clipboard text and its trusted transient marker could not be set together."
                        .to_string(),
                );
            }
            if CloseClipboard() == 0 {
                return Err("Clipboard could not be closed after transient paste.".to_string());
            }
        }
        Ok(())
    }
    fn write_clipboard_text(text: &str) -> Result<(), String> {
        unsafe {
            if OpenClipboard(ptr::null_mut()) == 0 {
                return Err("Clipboard could not be opened.".to_string());
            }
            if EmptyClipboard() == 0 {
                CloseClipboard();
                return Err("Clipboard could not be cleared for text delivery.".to_string());
            }
            if !write_clipboard_text_open(text) {
                CloseClipboard();
                return Err("Clipboard text could not be set.".to_string());
            }
            if CloseClipboard() == 0 {
                return Err("Clipboard could not be closed after text delivery.".to_string());
            }
        }

        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::{
            classify_clipboard_snapshot, combine_paste_and_restore_results,
            did_observe_inserted_text, focused_control_matches_lease, is_expected_foreground,
            is_native_edit_class_name, ClipboardFormatDescriptor, ClipboardSnapshot,
            DesktopDeliveryTarget, FocusedControl, HWND,
        };
        use std::ptr;

        fn format(id: u32, name: Option<&str>) -> ClipboardFormatDescriptor {
            ClipboardFormatDescriptor {
                id,
                name: name.map(str::to_string),
                bytes: None,
            }
        }

        fn cloneable_format(id: u32, name: Option<&str>) -> ClipboardFormatDescriptor {
            ClipboardFormatDescriptor {
                id,
                name: name.map(str::to_string),
                bytes: Some(vec![1, 2, 3]),
            }
        }

        #[test]
        fn foreground_guard_requires_the_exact_target_window() {
            let target = 1usize as HWND;
            let other = 2usize as HWND;

            assert!(is_expected_foreground(target, target));
            assert!(!is_expected_foreground(target, other));
            assert!(!is_expected_foreground(target, ptr::null_mut()));
        }

        #[test]
        fn native_edit_fast_path_accepts_only_verified_edit_classes() {
            assert!(is_native_edit_class_name("Edit"));
            assert!(is_native_edit_class_name("RichEdit20W"));
            assert!(is_native_edit_class_name("RICHEDIT50W"));
            assert!(is_native_edit_class_name("RichEditD2DPT"));
            assert!(is_native_edit_class_name(
                "WindowsForms10.EDIT.app.0.83a3ed_r13_ad1"
            ));
            assert!(is_native_edit_class_name(
                "WindowsForms10.RichEdit20W.app.0.83a3ed_r13_ad1"
            ));

            assert!(!is_native_edit_class_name("HwndWrapper[DefaultDomain]"));
            assert!(!is_native_edit_class_name("Chrome_WidgetWin_1"));
            assert!(!is_native_edit_class_name("Chrome_RenderWidgetHostHWND"));
            assert!(!is_native_edit_class_name("ConsoleWindowClass"));
            assert!(!is_native_edit_class_name("Scintilla"));
        }

        #[test]
        fn focus_lease_rejects_a_second_input_in_the_same_frame() {
            let target = DesktopDeliveryTarget {
                frame_hwnd: "100".to_string(),
                window_title: "Editor".to_string(),
                window_class: "Frame".to_string(),
                process_id: 42,
                process_name: None,
                focus_hwnd: Some("200".to_string()),
                focus_class: Some("Edit".to_string()),
                focus_process_id: Some(42),
                native_edit_fast_path: true,
                input_like: true,
                reason: "captured".to_string(),
                cache_reason: None,
            };
            let other_input = FocusedControl {
                hwnd: 201usize as HWND,
                class_name: "Edit".to_string(),
                process_id: 42,
            };

            assert!(!focused_control_matches_lease(&target, &other_input));
            assert!(focused_control_matches_lease(
                &target,
                &FocusedControl {
                    hwnd: 200usize as HWND,
                    class_name: "Edit".to_string(),
                    process_id: 42,
                },
            ));
        }

        #[test]
        fn empty_clipboard_snapshot_is_safe_to_restore_as_empty() {
            let snapshot = classify_clipboard_snapshot(0, &[], ClipboardSnapshot::default())
                .expect("empty clipboard should be supported");

            assert!(snapshot.is_none());
        }

        #[test]
        fn unsupported_nonempty_clipboard_fails_before_overwrite() {
            let error = classify_clipboard_snapshot(
                1,
                &[format(0xc001, Some("Unknown.Custom"))],
                ClipboardSnapshot::default(),
            )
            .expect_err("unsupported clipboard data must fail closed");

            assert_eq!(
                error,
                "Clipboard contains unsupported data and was left unchanged."
            );
        }

        #[test]
        fn synthesized_text_formats_are_retained() {
            let snapshot = classify_clipboard_snapshot(
                4,
                &[
                    format(1, None),
                    format(7, None),
                    format(13, None),
                    format(16, None),
                ],
                ClipboardSnapshot {
                    text: Some("existing clipboard".to_string()),
                    ..ClipboardSnapshot::default()
                },
            )
            .expect("synthesized text formats should be restorable");

            assert_eq!(
                snapshot.and_then(|value| value.text),
                Some("existing clipboard".to_string())
            );
        }

        #[test]
        fn recognized_bitmap_metadata_is_safe_with_restorable_dib() {
            let snapshot = classify_clipboard_snapshot(
                6,
                &[
                    format(0xc009, Some("DataObject")),
                    format(0xc363, Some("System.Drawing.Bitmap")),
                    format(2, None),
                    format(0xc013, Some("Ole Private Data")),
                    format(8, None),
                    format(17, None),
                ],
                ClipboardSnapshot {
                    dib: Some(vec![1, 2, 3]),
                    dib_v5: Some(vec![4, 5, 6]),
                    ..ClipboardSnapshot::default()
                },
            )
            .expect("known bitmap metadata should be accepted with restorable DIB data");

            assert!(snapshot.and_then(|value| value.dib).is_some());
        }

        #[test]
        fn recognized_bitmap_metadata_without_dib_fails_before_overwrite() {
            let error = classify_clipboard_snapshot(
                1,
                &[format(0xc009, Some("DataObject"))],
                ClipboardSnapshot::default(),
            )
            .expect_err("bitmap metadata without restorable image data must fail closed");

            assert_eq!(
                error,
                "Clipboard contains unsupported data and was left unchanged."
            );
        }

        #[test]
        fn mixed_supported_and_uncloneable_custom_formats_fail_before_overwrite() {
            let error = classify_clipboard_snapshot(
                3,
                &[
                    format(8, None),
                    format(13, None),
                    format(0xc001, Some("Unknown.Custom")),
                ],
                ClipboardSnapshot {
                    text: Some("existing clipboard".to_string()),
                    dib: Some(vec![1, 2, 3]),
                    ..ClipboardSnapshot::default()
                },
            )
            .expect_err("uncloneable custom formats must not be discarded during restoration");

            assert_eq!(
                error,
                "Clipboard contains unsupported data and was left unchanged."
            );
        }

        #[test]
        fn cloneable_custom_formats_are_preserved_for_restoration() {
            let snapshot = classify_clipboard_snapshot(
                2,
                &[
                    format(13, None),
                    cloneable_format(0xc001, Some("Unknown.Custom")),
                ],
                ClipboardSnapshot {
                    text: Some("existing clipboard".to_string()),
                    ..ClipboardSnapshot::default()
                },
            )
            .expect("cloneable custom formats should be restorable")
            .expect("nonempty clipboard should produce a snapshot");

            assert_eq!(snapshot.additional_formats.len(), 1);
            assert_eq!(snapshot.additional_formats[0].id, 0xc001);
            assert_eq!(snapshot.additional_formats[0].bytes, vec![1, 2, 3]);
        }

        #[test]
        fn incomplete_format_enumeration_fails_before_overwrite() {
            let error = classify_clipboard_snapshot(
                2,
                &[format(13, None)],
                ClipboardSnapshot {
                    text: Some("existing clipboard".to_string()),
                    ..ClipboardSnapshot::default()
                },
            )
            .expect_err("incomplete enumeration must fail closed");

            assert_eq!(
                error,
                "Clipboard formats could not be enumerated safely and were left unchanged."
            );
        }

        #[test]
        fn pre_paste_failure_remains_retry_safe_error() {
            let result =
                combine_paste_and_restore_results(false, Err("focus lost".to_string()), Ok(()));

            assert_eq!(result, Err("focus lost".to_string()));
        }

        #[test]
        fn post_paste_enter_failure_returns_success_with_warning() {
            let result = combine_paste_and_restore_results(
                true,
                Err("Enter key failed".to_string()),
                Ok(()),
            );

            assert_eq!(result, Ok(Some("Enter key failed".to_string())));
        }

        #[test]
        fn post_paste_restore_failure_returns_success_with_warning() {
            let result = combine_paste_and_restore_results(
                true,
                Ok(()),
                Err("Clipboard restore failed".to_string()),
            );

            assert_eq!(result, Ok(Some("Clipboard restore failed".to_string())));
        }

        #[test]
        fn observer_requires_inserted_text_to_appear_after_paste() {
            assert!(did_observe_inserted_text(
                "fresh dictation result",
                Some("before text"),
                Some("before text\nfresh dictation result")
            ));

            assert!(!did_observe_inserted_text(
                "fresh dictation result",
                Some("before text"),
                Some("before text")
            ));
            assert!(!did_observe_inserted_text(
                "fresh dictation result",
                Some("before text"),
                None
            ));
            assert!(!did_observe_inserted_text(
                "   ",
                Some("before text"),
                Some("before text")
            ));
        }

        #[test]
        fn observer_requires_occurrence_count_to_increase() {
            assert!(did_observe_inserted_text(
                "repeatable dictation result",
                Some("repeatable dictation result"),
                Some("repeatable dictation result\nrepeatable dictation result")
            ));

            assert!(!did_observe_inserted_text(
                "repeatable dictation result",
                Some("repeatable dictation result"),
                Some("repeatable dictation result")
            ));
        }

        #[test]
        fn observer_normalizes_line_endings_for_bounded_text_reads() {
            assert!(did_observe_inserted_text(
                "line one\r\nline two",
                Some("prefix"),
                Some("prefix\nline one\nline two")
            ));
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::{
        DeliveryMode, DesktopDeliveryResult, DesktopDeliveryTarget, DesktopPasteObservationResult,
        DesktopTargetSnapshot,
    };

    pub fn capture_desktop_delivery_target() -> Result<DesktopDeliveryTarget, String> {
        Err("Desktop target capture is only available on Windows.".to_string())
    }

    pub fn validate_target_lease(_target: &DesktopDeliveryTarget) -> Result<(), String> {
        Err("Desktop target validation is only available on Windows.".to_string())
    }

    pub fn validate_target_focus(_target: &DesktopDeliveryTarget) -> Result<(), String> {
        Err("Desktop target focus validation is only available on Windows.".to_string())
    }

    pub fn deliver_text_to_desktop_target(
        _text: String,
        target: DesktopDeliveryTarget,
        _press_enter_after_paste: bool,
        _focus_target_before_paste: bool,
        _delivery_mode: DeliveryMode,
        _clipboard_owner_hwnd: Option<isize>,
    ) -> Result<DesktopDeliveryResult, String> {
        Err(format!(
            "Desktop delivery is only available on Windows for target {}.",
            target.frame_hwnd
        ))
    }

    pub fn copy_text_to_clipboard(_text: String) -> Result<(), String> {
        Err("Clipboard copy is only available on Windows.".to_string())
    }

    pub fn observe_desktop_paste(
        _text: String,
        target: DesktopDeliveryTarget,
        _timeout_ms: Option<u64>,
    ) -> Result<DesktopPasteObservationResult, String> {
        Ok(DesktopPasteObservationResult {
            status: "unsupported",
            confidence: "none",
            reason: "Native paste observation is only available on Windows.".to_string(),
            target_after: DesktopTargetSnapshot {
                captured_at: "0".to_string(),
                app_label: target.window_class,
                window_label: target.window_title,
                confidence: "none",
            },
        })
    }
}
