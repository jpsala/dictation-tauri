use serde::{Deserialize, Serialize};
use std::{
    sync::{Mutex, Once},
    thread,
    time::Duration,
};

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

    if is_terminal_like_target(&target) {
        if reason != "foreground_watcher" {
            eprintln!(
                "[dictation-tauri][delivery-target] skipped terminal-like target reason={} target_reason={}",
                reason, target.reason
            );
        }
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
    text: String,
    target: DesktopDeliveryTarget,
    press_enter_after_paste: Option<bool>,
) -> Result<DesktopDeliveryResult, String> {
    platform::deliver_text_to_desktop_target(text, target, press_enter_after_paste.unwrap_or(false))
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
        DesktopDeliveryResult, DesktopDeliveryTarget, DesktopPasteObservationResult,
        DesktopTargetSnapshot,
    };
    use std::{
        ffi::c_void,
        ptr, thread,
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, BOOL, HWND, LPARAM},
        System::{
            DataExchange::{
                CloseClipboard, CountClipboardFormats, EmptyClipboard, EnumClipboardFormats,
                GetClipboardData, GetClipboardFormatNameW, IsClipboardFormatAvailable,
                OpenClipboard, SetClipboardData,
            },
            Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE},
            Threading::{
                AttachThreadInput, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
        UI::{
            Input::KeyboardAndMouse::{
                SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
                VIRTUAL_KEY, VK_CONTROL, VK_LWIN, VK_MENU, VK_RETURN, VK_RWIN, VK_SHIFT, VK_V,
            },
            WindowsAndMessaging::{
                BringWindowToTop, EnumChildWindows, GetClassNameW, GetForegroundWindow,
                GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic,
                IsWindowVisible, SendMessageTimeoutW, SendMessageW, SetForegroundWindow,
                ShowWindow, SMTO_ABORTIFHUNG, SW_RESTORE, SW_SHOW, WM_GETTEXT, WM_GETTEXTLENGTH,
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
    const RESTORABLE_BITMAP_METADATA_FORMAT_NAMES: [&str; 3] =
        ["DataObject", "System.Drawing.Bitmap", "Ole Private Data"];

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
        } else {
            "foreground target captured before dictation".to_string()
        };

        Ok(DesktopDeliveryTarget {
            frame_hwnd: (hwnd as isize).to_string(),
            window_title,
            window_class,
            process_id,
            process_name,
            input_like,
            reason,
            cache_reason: None,
        })
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
    ) -> Result<DesktopDeliveryResult, String> {
        if text.trim().is_empty() {
            return Err("Cannot deliver empty text.".to_string());
        }
        if !target.input_like {
            return Err(target.reason.clone());
        }

        let hwnd = parse_hwnd(&target.frame_hwnd)?;
        let skip_bounded_observer = should_skip_bounded_observer(&target);
        let observable_before = if skip_bounded_observer {
            None
        } else {
            read_observable_window_text(hwnd)
        };
        eprintln!("[dictation-tauri][desktop-delivery] using Fixvox-like clipboard paste delivery");
        let clipboard_warning =
            deliver_text_with_clipboard(&text, &target, hwnd, press_enter_after_paste).map_err(
                |error| {
                    eprintln!("[dictation-tauri][desktop-delivery] failed reason={error}");
                    error
                },
            )?;
        let used_clipboard_fallback = true;

        let observable_after = if skip_bounded_observer {
            None
        } else {
            read_observable_window_text(hwnd)
        };
        let observed = did_observe_inserted_text(
            &text,
            observable_before.as_deref(),
            observable_after.as_deref(),
        );

        let reason = if observed && used_clipboard_fallback {
            "Fixvox-like clipboard paste was verified by a bounded Win32 text observer on the saved target."
                .to_string()
        } else if used_clipboard_fallback && press_enter_after_paste {
            "Fixvox-like clipboard paste and Enter commands were sent to the saved foreground target without observation."
                .to_string()
        } else {
            "Fixvox-like clipboard paste command was sent to the saved foreground target without observation."
                .to_string()
        };
        let reason = clipboard_warning
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

    fn deliver_text_with_clipboard(
        text: &str,
        target: &DesktopDeliveryTarget,
        hwnd: HWND,
        press_enter_after_paste: bool,
    ) -> Result<Option<String>, String> {
        focus_window(hwnd)?;
        let previous_clipboard = read_clipboard_snapshot()?;
        if let Err(write_error) = write_clipboard_text(text) {
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

    fn should_skip_bounded_observer(target: &DesktopDeliveryTarget) -> bool {
        let class_name = target.window_class.to_ascii_lowercase();
        class_name.contains("chrome_widgetwin")
            || class_name.contains("chrome_renderwidgethosthwnd")
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

    fn read_observable_window_text(hwnd: HWND) -> Option<String> {
        let mut values = Vec::<String>::new();
        push_window_text(hwnd, &mut values);
        unsafe {
            EnumChildWindows(
                hwnd,
                Some(enum_child_text_proc),
                &mut values as *mut _ as isize,
            );
        }
        let joined = values
            .into_iter()
            .filter(|value| !value.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        if joined.trim().is_empty() {
            None
        } else {
            Some(joined)
        }
    }

    unsafe extern "system" fn enum_child_text_proc(hwnd: HWND, lparam: isize) -> i32 {
        let values = &mut *(lparam as *mut Vec<String>);
        push_window_text(hwnd, values);
        1
    }

    fn push_window_text(hwnd: HWND, values: &mut Vec<String>) {
        let len = unsafe { SendMessageW(hwnd, WM_GETTEXTLENGTH, 0, 0) } as usize;
        if len == 0 || len > 200_000 {
            return;
        }
        let mut buffer = vec![0u16; len + 1];
        let copied =
            unsafe { SendMessageW(hwnd, WM_GETTEXT, buffer.len(), buffer.as_mut_ptr() as isize) }
                as usize;
        if copied > 0 && copied <= len {
            values.push(String::from_utf16_lossy(&buffer[..copied]));
        }
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
        let hwnds = &mut *(lparam as *mut Vec<HWND>);
        hwnds.push(hwnd);
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
                dib: read_clipboard_format_bytes_open(CF_DIB_FORMAT),
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
        let mut buffer = [0u16; 256];
        let length = GetClipboardFormatNameW(format, buffer.as_mut_ptr(), buffer.len() as i32);
        (length > 0).then(|| String::from_utf16_lossy(&buffer[..length as usize]))
    }

    unsafe fn read_clipboard_text_open() -> Option<String> {
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

    unsafe fn read_clipboard_format_bytes_open(format: u32) -> Option<Vec<u8>> {
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

    unsafe fn write_clipboard_format_bytes_open(format: u32, bytes: &[u8]) -> bool {
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
            did_observe_inserted_text, is_expected_foreground, ClipboardFormatDescriptor,
            ClipboardSnapshot, HWND,
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
        DesktopDeliveryResult, DesktopDeliveryTarget, DesktopPasteObservationResult,
        DesktopTargetSnapshot,
    };

    pub fn capture_desktop_delivery_target() -> Result<DesktopDeliveryTarget, String> {
        Err("Desktop target capture is only available on Windows.".to_string())
    }

    pub fn deliver_text_to_desktop_target(
        _text: String,
        target: DesktopDeliveryTarget,
        _press_enter_after_paste: bool,
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
