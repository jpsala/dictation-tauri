use serde::{Deserialize, Serialize};
use std::{
    sync::{Mutex, Once},
    thread,
    time::Duration,
};

static DELIVERY_TARGET_WATCHER: Once = Once::new();

static CACHED_DESKTOP_DELIVERY_TARGET: Mutex<Option<DesktopDeliveryTarget>> = Mutex::new(None);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDeliveryTarget {
    frame_hwnd: String,
    window_title: String,
    window_class: String,
    process_id: u32,
    input_like: bool,
    reason: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDeliveryResult {
    status: &'static str,
    reason: String,
    target: DesktopDeliveryTarget,
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

fn cache_delivery_target_if_editable(reason: &str, target: DesktopDeliveryTarget) {
    if !target.input_like {
        if reason != "foreground_watcher" {
            eprintln!(
                "[dictation-tauri][delivery-target] skipped non-editable target reason={} target_reason={}",
                reason, target.reason
            );
        }
        return;
    }

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

#[tauri::command]
pub fn deliver_text_to_desktop_target(
    text: String,
    target: DesktopDeliveryTarget,
    press_enter_after_paste: Option<bool>,
) -> Result<DesktopDeliveryResult, String> {
    platform::deliver_text_to_desktop_target(text, target, press_enter_after_paste.unwrap_or(false))
}

#[cfg(windows)]
mod platform {
    use super::{DesktopDeliveryResult, DesktopDeliveryTarget};
    use std::{ffi::c_void, ptr, thread, time::Duration};
    use windows_sys::Win32::{
        Foundation::HWND,
        System::{
            DataExchange::{
                CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable,
                OpenClipboard, SetClipboardData,
            },
            Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE},
            Threading::{AttachThreadInput, GetCurrentThreadId},
        },
        UI::{
            Input::KeyboardAndMouse::{
                SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
                VIRTUAL_KEY, VK_CONTROL, VK_RETURN, VK_V,
            },
            WindowsAndMessaging::{
                BringWindowToTop, EnumChildWindows, GetClassNameW, GetForegroundWindow,
                GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic,
                IsWindowVisible, SendMessageW, SetForegroundWindow, ShowWindow, SW_RESTORE,
                SW_SHOW, WM_GETTEXT, WM_GETTEXTLENGTH,
            },
        },
    };

    const CF_UNICODETEXT_FORMAT: u32 = 13;

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
        let probe = format!("{} {}", window_title, window_class).to_lowercase();
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
            input_like,
            reason,
        })
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
        let observable_before = read_observable_window_text(hwnd);
        let previous_clipboard = read_clipboard_text();
        write_clipboard_text(&text)?;

        let paste_result = (|| {
            focus_window(hwnd);
            thread::sleep(Duration::from_millis(80));
            send_ctrl_v()?;
            if press_enter_after_paste {
                thread::sleep(Duration::from_millis(80));
                send_enter()?;
            }
            thread::sleep(Duration::from_millis(160));
            Ok::<(), String>(())
        })();

        if let Some(previous) = previous_clipboard {
            let _ = write_clipboard_text(&previous);
        }

        paste_result?;

        let observable_after = read_observable_window_text(hwnd);
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
            reason: if observed {
                "Paste insertion was verified by a bounded Win32 text observer on the saved target."
                    .to_string()
            } else if press_enter_after_paste {
                "Paste and Enter commands were sent to the saved foreground target without observation."
                    .to_string()
            } else {
                "Paste command was sent to the saved foreground target without observation."
                    .to_string()
            },
            target,
        })
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

    fn send_ctrl_v() -> Result<(), String> {
        let mut inputs = [
            key_input(VK_CONTROL, false),
            key_input(VK_V, false),
            key_input(VK_V, true),
            key_input(VK_CONTROL, true),
        ];
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
            Err("Paste shortcut could not be sent.".to_string())
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

    fn read_clipboard_text() -> Option<String> {
        unsafe {
            if IsClipboardFormatAvailable(CF_UNICODETEXT_FORMAT) == 0
                || OpenClipboard(ptr::null_mut()) == 0
            {
                return None;
            }
            let handle = GetClipboardData(CF_UNICODETEXT_FORMAT);
            if handle.is_null() {
                CloseClipboard();
                return None;
            }
            let ptr = GlobalLock(handle) as *const u16;
            if ptr.is_null() {
                CloseClipboard();
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
            CloseClipboard();
            Some(text)
        }
    }

    fn write_clipboard_text(text: &str) -> Result<(), String> {
        let mut encoded: Vec<u16> = text.encode_utf16().collect();
        encoded.push(0);
        let bytes = encoded.len() * std::mem::size_of::<u16>();

        unsafe {
            if OpenClipboard(ptr::null_mut()) == 0 {
                return Err("Clipboard could not be opened.".to_string());
            }
            EmptyClipboard();
            let handle = GlobalAlloc(GMEM_MOVEABLE, bytes);
            if handle.is_null() {
                CloseClipboard();
                return Err("Clipboard memory could not be allocated.".to_string());
            }
            let destination = GlobalLock(handle) as *mut c_void;
            if destination.is_null() {
                CloseClipboard();
                return Err("Clipboard memory could not be locked.".to_string());
            }
            ptr::copy_nonoverlapping(encoded.as_ptr() as *const c_void, destination, bytes);
            GlobalUnlock(handle);
            if SetClipboardData(CF_UNICODETEXT_FORMAT, handle).is_null() {
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
    use super::{DesktopDeliveryResult, DesktopDeliveryTarget};

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
}
