use serde::{Deserialize, Serialize};

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
    platform::capture_desktop_delivery_target()
}

#[tauri::command]
pub fn deliver_text_to_desktop_target(
    text: String,
    target: DesktopDeliveryTarget,
) -> Result<DesktopDeliveryResult, String> {
    platform::deliver_text_to_desktop_target(text, target)
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
                SendInput, SetFocus, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
                KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL, VK_V,
            },
            WindowsAndMessaging::{
                BringWindowToTop, GetClassNameW, GetForegroundWindow, GetWindowTextLengthW,
                GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
                SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW,
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
        let is_own_dock = window_title == "Dictation Dock";
        let input_like = !is_own_dock;
        let reason = if is_own_dock {
            "foreground target is the dictation dock; paste is blocked".to_string()
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
    ) -> Result<DesktopDeliveryResult, String> {
        if text.trim().is_empty() {
            return Err("Cannot deliver empty text.".to_string());
        }
        if !target.input_like {
            return Err(target.reason.clone());
        }

        let hwnd = parse_hwnd(&target.frame_hwnd)?;
        let previous_clipboard = read_clipboard_text();
        write_clipboard_text(&text)?;

        let paste_result = (|| {
            focus_window(hwnd);
            thread::sleep(Duration::from_millis(80));
            send_ctrl_v()?;
            thread::sleep(Duration::from_millis(160));
            Ok::<(), String>(())
        })();

        if let Some(previous) = previous_clipboard {
            let _ = write_clipboard_text(&previous);
        }

        paste_result?;

        Ok(DesktopDeliveryResult {
            status: "paste_sent",
            reason: "Paste command was sent to the saved foreground target without observation."
                .to_string(),
            target,
        })
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
            let attached_target = target_thread_id != 0 && target_thread_id != current_thread_id
                && AttachThreadInput(current_thread_id, target_thread_id, 1) != 0;
            let attached_foreground = foreground_thread_id != 0
                && foreground_thread_id != current_thread_id
                && foreground_thread_id != target_thread_id
                && AttachThreadInput(current_thread_id, foreground_thread_id, 1) != 0;

            BringWindowToTop(hwnd);
            SetForegroundWindow(hwnd);
            SetFocus(hwnd);

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
            if IsClipboardFormatAvailable(CF_UNICODETEXT_FORMAT) == 0 || OpenClipboard(ptr::null_mut()) == 0 {
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
            let nul = slice.iter().position(|value| *value == 0).unwrap_or(slice.len());
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
    ) -> Result<DesktopDeliveryResult, String> {
        Err(format!(
            "Desktop delivery is only available on Windows for target {}.",
            target.frame_hwnd
        ))
    }
}
