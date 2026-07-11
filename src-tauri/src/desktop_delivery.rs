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
                CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable,
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

    const CF_BITMAP_FORMAT: u32 = 2;
    const CF_DIB_FORMAT: u32 = 8;
    const CF_UNICODETEXT_FORMAT: u32 = 13;
    const CF_DIBV5_FORMAT: u32 = 17;

    #[derive(Clone, Debug, Default)]
    struct ClipboardSnapshot {
        text: Option<String>,
        dib: Option<Vec<u8>>,
        dib_v5: Option<Vec<u8>>,
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
        deliver_text_with_clipboard(&text, &target, hwnd, press_enter_after_paste)?;
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

        Ok(DesktopDeliveryResult {
            status: if observed {
                "paste_observed"
            } else {
                "paste_sent"
            },
            reason: if observed && used_clipboard_fallback {
                "Fixvox-like clipboard paste was verified by a bounded Win32 text observer on the saved target."
                    .to_string()
            } else if used_clipboard_fallback && press_enter_after_paste {
                "Fixvox-like clipboard paste and Enter commands were sent to the saved foreground target without observation."
                    .to_string()
            } else {
                "Fixvox-like clipboard paste command was sent to the saved foreground target without observation."
                    .to_string()
            },
            target,
        })
    }

    fn deliver_text_with_clipboard(
        text: &str,
        target: &DesktopDeliveryTarget,
        hwnd: HWND,
        press_enter_after_paste: bool,
    ) -> Result<(), String> {
        let previous_clipboard = read_clipboard_snapshot();
        write_clipboard_text(text)?;

        let paste_result = (|| {
            focus_window(hwnd);
            thread::sleep(Duration::from_millis(80));
            release_modifier_keys()?;
            send_ctrl_v()?;
            if press_enter_after_paste {
                thread::sleep(Duration::from_millis(80));
                send_enter()?;
            }
            thread::sleep(clipboard_restore_delay(target));
            Ok::<(), String>(())
        })();

        restore_clipboard_snapshot(previous_clipboard);

        paste_result
    }

    fn clear_clipboard_text() -> Result<(), String> {
        unsafe {
            if OpenClipboard(ptr::null_mut()) == 0 {
                return Err("Clipboard could not be opened for clear.".to_string());
            }
            EmptyClipboard();
            CloseClipboard();
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

    fn focus_window(hwnd: HWND) {
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

    fn read_clipboard_snapshot() -> Option<ClipboardSnapshot> {
        unsafe {
            let has_known_format = IsClipboardFormatAvailable(CF_UNICODETEXT_FORMAT) != 0
                || IsClipboardFormatAvailable(CF_DIB_FORMAT) != 0
                || IsClipboardFormatAvailable(CF_DIBV5_FORMAT) != 0
                || IsClipboardFormatAvailable(CF_BITMAP_FORMAT) != 0;
            if !has_known_format || OpenClipboard(ptr::null_mut()) == 0 {
                return None;
            }

            let snapshot = ClipboardSnapshot {
                text: read_clipboard_text_open(),
                dib: read_clipboard_format_bytes_open(CF_DIB_FORMAT),
                dib_v5: read_clipboard_format_bytes_open(CF_DIBV5_FORMAT),
            };
            CloseClipboard();

            if snapshot.text.is_some() || snapshot.dib.is_some() || snapshot.dib_v5.is_some() {
                Some(snapshot)
            } else {
                None
            }
        }
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

    fn restore_clipboard_snapshot(snapshot: Option<ClipboardSnapshot>) {
        let Some(snapshot) = snapshot else {
            let _ = clear_clipboard_text();
            return;
        };

        unsafe {
            if OpenClipboard(ptr::null_mut()) == 0 {
                return;
            }
            EmptyClipboard();
            let mut restored = false;
            if let Some(text) = snapshot.text {
                restored = write_clipboard_text_open(&text) || restored;
            }
            if let Some(dib_v5) = snapshot.dib_v5 {
                restored = write_clipboard_format_bytes_open(CF_DIBV5_FORMAT, &dib_v5) || restored;
            }
            if let Some(dib) = snapshot.dib {
                restored = write_clipboard_format_bytes_open(CF_DIB_FORMAT, &dib) || restored;
            }
            if !restored {
                EmptyClipboard();
            }
            CloseClipboard();
        }
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
        let mut encoded: Vec<u16> = text.encode_utf16().collect();
        encoded.push(0);
        unsafe {
            if OpenClipboard(ptr::null_mut()) == 0 {
                return Err("Clipboard could not be opened.".to_string());
            }
            EmptyClipboard();
            if !write_clipboard_text_open(text) {
                CloseClipboard();
                return Err("Clipboard text could not be set.".to_string());
            }
            CloseClipboard();
        }

        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::did_observe_inserted_text;

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
