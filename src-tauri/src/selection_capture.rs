use serde::Serialize;

pub const SELECTION_CAPTURE_COMMAND: &str = "capture_selection_context";
pub const MAX_SELECTION_CAPTURE_CHARS: usize = 2_000;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SelectionCaptureStatus {
    Ok,
    UnsupportedPlatform,
    NoForegroundTarget,
    UnsupportedTarget,
    NoSelection,
    Timeout,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostSelectionCaptureRoute {
    pub owner: &'static str,
    pub primary_strategy: &'static str,
    pub mutates_clipboard: bool,
    pub sends_keyboard_shortcut: bool,
    pub touches_focus: bool,
    pub persists_selection: bool,
    pub allows_clipboard_roundtrip: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionTargetSnapshot {
    pub captured_at: Option<String>,
    pub app_label: Option<String>,
    pub window_label: Option<String>,
    pub confidence: &'static str,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostSelectionContext {
    pub selection_id: String,
    pub selected_text: Option<String>,
    pub text_length: usize,
    pub source: &'static str,
    pub captured_at: Option<String>,
    pub target_snapshot: Option<SelectionTargetSnapshot>,
    pub confidence: &'static str,
    pub redacted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionCaptureOutcome {
    pub status: SelectionCaptureStatus,
    pub selection: Option<HostSelectionContext>,
    pub target_snapshot: Option<SelectionTargetSnapshot>,
    pub redacted: bool,
    pub truncated: bool,
    pub reason: Option<String>,
}

pub fn host_selection_capture_route() -> HostSelectionCaptureRoute {
    HostSelectionCaptureRoute {
        owner: "tauri_host",
        primary_strategy: "windows_ui_automation_then_clipboard_roundtrip",
        mutates_clipboard: true,
        sends_keyboard_shortcut: true,
        touches_focus: true,
        persists_selection: false,
        allows_clipboard_roundtrip: true,
    }
}

#[tauri::command]
pub fn capture_selection_context() -> SelectionCaptureOutcome {
    platform::capture_selection_context()
}

#[tauri::command]
pub fn capture_selection_context_for_target(frame_hwnd: String) -> SelectionCaptureOutcome {
    platform::capture_selection_context_for_target(frame_hwnd, false)
}

#[tauri::command]
pub fn capture_selection_context_for_target_with_clipboard(
    frame_hwnd: String,
) -> SelectionCaptureOutcome {
    platform::capture_selection_context_for_target(frame_hwnd, true)
}

fn selection_clipboard_roundtrip_allowed(force: bool, configured: bool) -> bool {
    force || configured
}

fn no_selection(
    target_snapshot: Option<SelectionTargetSnapshot>,
    reason: &str,
) -> SelectionCaptureOutcome {
    SelectionCaptureOutcome {
        status: SelectionCaptureStatus::NoSelection,
        selection: None,
        target_snapshot,
        redacted: true,
        truncated: false,
        reason: Some(reason.to_string()),
    }
}

#[cfg(windows)]
mod platform {
    use super::{
        no_selection, HostSelectionContext, SelectionCaptureOutcome, SelectionCaptureStatus,
        SelectionTargetSnapshot, MAX_SELECTION_CAPTURE_CHARS,
    };
    use std::{ptr, thread, time::Duration};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationTextPattern, UIA_TextPatternId,
    };
    use windows_sys::Win32::{
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
                VIRTUAL_KEY, VK_C, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
            },
            WindowsAndMessaging::{
                BringWindowToTop, GetClassNameW, GetForegroundWindow, GetWindowTextLengthW,
                GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible,
                SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW,
            },
        },
    };

    const CF_UNICODETEXT_FORMAT: u32 = 13;

    pub fn capture_selection_context() -> SelectionCaptureOutcome {
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_null() {
            return SelectionCaptureOutcome {
                status: SelectionCaptureStatus::NoForegroundTarget,
                selection: None,
                target_snapshot: None,
                redacted: true,
                truncated: false,
                reason: Some(
                    "No foreground target was available for non-mutating selection capture."
                        .to_string(),
                ),
            };
        }

        let target_snapshot = redacted_target_snapshot(hwnd);
        let uia_outcome = match capture_selected_text(hwnd, target_snapshot.clone()) {
            Ok(outcome) => outcome,
            Err(reason) => SelectionCaptureOutcome {
                status: SelectionCaptureStatus::Failed,
                selection: None,
                target_snapshot: Some(target_snapshot.clone()),
                redacted: true,
                truncated: false,
                reason: Some(reason),
            },
        };

        if uia_outcome.status == SelectionCaptureStatus::Ok {
            log_selection_outcome("foreground_uia", &uia_outcome);
            return uia_outcome;
        }

        let outcome = if selection_clipboard_roundtrip_enabled(false) {
            match capture_selected_text_with_clipboard_roundtrip(hwnd, target_snapshot.clone()) {
                Some(outcome) => outcome,
                None => uia_outcome,
            }
        } else {
            uia_outcome
        };
        log_selection_outcome("foreground", &outcome);
        outcome
    }

    pub fn capture_selection_context_for_target(
        frame_hwnd: String,
        force_clipboard_fallback: bool,
    ) -> SelectionCaptureOutcome {
        let hwnd = match parse_hwnd(&frame_hwnd) {
            Some(hwnd) if unsafe { IsWindow(hwnd) } != 0 => hwnd,
            _ => {
                return SelectionCaptureOutcome {
                    status: SelectionCaptureStatus::NoForegroundTarget,
                    selection: None,
                    target_snapshot: None,
                    redacted: true,
                    truncated: false,
                    reason: Some("Saved selection target was no longer available.".to_string()),
                };
            }
        };
        if unsafe { GetForegroundWindow() } != hwnd {
            focus_window(hwnd);
            thread::sleep(Duration::from_millis(90));
        }
        let target_snapshot = redacted_target_snapshot(hwnd);
        let clipboard_roundtrip_enabled =
            selection_clipboard_roundtrip_enabled(force_clipboard_fallback);
        let outcome = match capture_selected_text(hwnd, target_snapshot.clone()) {
            Ok(outcome) if outcome.status == SelectionCaptureStatus::Ok => outcome,
            Ok(outcome) => {
                if clipboard_roundtrip_enabled {
                    match capture_selected_text_with_clipboard_roundtrip(hwnd, target_snapshot) {
                        Some(clipboard_outcome) => clipboard_outcome,
                        None => outcome,
                    }
                } else {
                    outcome
                }
            }
            Err(reason) => {
                if clipboard_roundtrip_enabled {
                    match capture_selected_text_with_clipboard_roundtrip(
                        hwnd,
                        target_snapshot.clone(),
                    ) {
                        Some(clipboard_outcome) => clipboard_outcome,
                        None => SelectionCaptureOutcome {
                            status: SelectionCaptureStatus::Failed,
                            selection: None,
                            target_snapshot: Some(target_snapshot),
                            redacted: true,
                            truncated: false,
                            reason: Some(reason),
                        },
                    }
                } else {
                    SelectionCaptureOutcome {
                        status: SelectionCaptureStatus::Failed,
                        selection: None,
                        target_snapshot: Some(target_snapshot),
                        redacted: true,
                        truncated: false,
                        reason: Some(reason),
                    }
                }
            }
        };
        log_selection_outcome("saved_target", &outcome);
        outcome
    }

    fn capture_selected_text(
        hwnd: windows_sys::Win32::Foundation::HWND,
        target_snapshot: SelectionTargetSnapshot,
    ) -> Result<SelectionCaptureOutcome, String> {
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(|error| format!("UI Automation COM init failed: {error}"))?;
        }

        let result = unsafe { capture_selected_text_inner(hwnd, target_snapshot) };
        unsafe {
            CoUninitialize();
        }
        result
    }

    unsafe fn capture_selected_text_inner(
        hwnd: windows_sys::Win32::Foundation::HWND,
        target_snapshot: SelectionTargetSnapshot,
    ) -> Result<SelectionCaptureOutcome, String> {
        unsafe {
            let automation: IUIAutomation =
                CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                    .map_err(|error| format!("UI Automation is unavailable: {error}"))?;
            let focused = automation.GetFocusedElement().map_err(|error| {
                format!("Focused UI Automation element is unavailable: {error}")
            })?;

            let mut target_pid = 0u32;
            GetWindowThreadProcessId(hwnd, &mut target_pid);
            let focused_pid = focused.CurrentProcessId().unwrap_or_default().max(0) as u32;
            if target_pid != 0 && focused_pid != 0 && target_pid != focused_pid {
                eprintln!(
                "[dictation-tauri][selection-capture] focused element pid differs from target pid; continuing for multi-process UIA target"
            );
            }

            let text_pattern =
                match focused.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId) {
                    Ok(pattern) => pattern,
                    Err(_) => {
                        return Ok(SelectionCaptureOutcome {
                            status: SelectionCaptureStatus::UnsupportedTarget,
                            selection: None,
                            target_snapshot: Some(target_snapshot),
                            redacted: true,
                            truncated: false,
                            reason: Some(
                                "Foreground target does not expose UI Automation TextPattern."
                                    .to_string(),
                            ),
                        });
                    }
                };

            let ranges = text_pattern.GetSelection().map_err(|error| {
                format!("UI Automation selection range could not be read: {error}")
            })?;
            let range_count = ranges.Length().unwrap_or_default();
            if range_count <= 0 {
                return Ok(no_selection(
                    Some(target_snapshot),
                    "UI Automation reported no selected text ranges.",
                ));
            }

            let mut text = String::new();
            for index in 0..range_count {
                if let Ok(range) = ranges.GetElement(index) {
                    if let Ok(fragment) = range.GetText((MAX_SELECTION_CAPTURE_CHARS + 1) as i32) {
                        text.push_str(&fragment.to_string());
                    }
                }
                if text.chars().count() > MAX_SELECTION_CAPTURE_CHARS {
                    break;
                }
            }

            let normalized = text.trim().to_string();
            if normalized.is_empty() {
                return Ok(no_selection(
                    Some(target_snapshot),
                    "UI Automation selection text was empty.",
                ));
            }

            let truncated = normalized.chars().count() > MAX_SELECTION_CAPTURE_CHARS;
            let selected_text = if truncated {
                normalized
                    .chars()
                    .take(MAX_SELECTION_CAPTURE_CHARS)
                    .collect()
            } else {
                normalized
            };

            Ok(SelectionCaptureOutcome {
            status: SelectionCaptureStatus::Ok,
            selection: Some(HostSelectionContext {
                selection_id: "host-selection-uia".to_string(),
                text_length: selected_text.chars().count(),
                selected_text: Some(selected_text),
                source: "host_capture",
                captured_at: None,
                target_snapshot: Some(target_snapshot.clone()),
                confidence: "medium",
                redacted: true,
            }),
            target_snapshot: Some(target_snapshot),
            redacted: true,
            truncated,
            reason: Some("Selected text captured through UI Automation TextPattern without clipboard, keyboard, focus, or paste side effects.".to_string()),
        })
        }
    }

    fn selection_clipboard_roundtrip_enabled(force: bool) -> bool {
        let configured = matches!(
            std::env::var("DICTATION_TAURI_ALLOW_SELECTION_CLIPBOARD_FALLBACK")
                .unwrap_or_default()
                .trim()
                .to_ascii_lowercase()
                .as_str(),
            "1" | "true" | "yes" | "on"
        );
        super::selection_clipboard_roundtrip_allowed(force, configured)
    }

    fn capture_selected_text_with_clipboard_roundtrip(
        hwnd: windows_sys::Win32::Foundation::HWND,
        target_snapshot: SelectionTargetSnapshot,
    ) -> Option<SelectionCaptureOutcome> {
        let previous_clipboard = read_clipboard_text();
        let sentinel = format!("__fixvox_selection_capture_{}__", std::process::id());
        let mut copied = None;

        for attempt in 0..2 {
            if attempt > 0 {
                focus_window(hwnd);
                thread::sleep(Duration::from_millis(90));
            }
            let _ = write_clipboard_text(&sentinel);
            if release_modifier_keys().is_err()
                || send_ctrl_c().is_err()
                || release_modifier_keys().is_err()
            {
                continue;
            }
            thread::sleep(Duration::from_millis(180));
            let candidate = read_clipboard_text().unwrap_or_default().trim().to_string();
            if !candidate.is_empty() && candidate != sentinel {
                copied = Some(candidate);
                break;
            }
        }

        if let Some(previous) = previous_clipboard {
            let _ = write_clipboard_text(&previous);
        } else {
            let _ = clear_clipboard_text();
        }

        let copied = copied?;
        let truncated = copied.chars().count() > MAX_SELECTION_CAPTURE_CHARS;
        let selected_text = if truncated {
            copied.chars().take(MAX_SELECTION_CAPTURE_CHARS).collect()
        } else {
            copied
        };

        Some(SelectionCaptureOutcome {
            status: SelectionCaptureStatus::Ok,
            selection: Some(HostSelectionContext {
                selection_id: "host-selection-clipboard-roundtrip".to_string(),
                text_length: selected_text.chars().count(),
                selected_text: Some(selected_text),
                source: "host_capture",
                captured_at: None,
                target_snapshot: Some(target_snapshot.clone()),
                confidence: "medium",
                redacted: true,
            }),
            target_snapshot: Some(target_snapshot),
            redacted: true,
            truncated,
            reason: Some("Selected text captured through temporary clipboard roundtrip after UI Automation did not expose selection; previous clipboard restored best-effort.".to_string()),
        })
    }

    fn send_ctrl_c() -> Result<(), String> {
        let mut inputs = [
            key_input(VK_CONTROL, false),
            key_input(VK_C, false),
            key_input(VK_C, true),
            key_input(VK_CONTROL, true),
        ];
        send_keyboard_inputs(
            &mut inputs,
            "Ctrl+C could not be sent for selection fallback.",
        )
    }

    fn release_modifier_keys() -> Result<(), String> {
        let mut inputs = [
            key_input(VK_SHIFT, true),
            key_input(VK_CONTROL, true),
            key_input(VK_MENU, true),
            key_input(VK_LWIN, true),
            key_input(VK_RWIN, true),
        ];
        send_keyboard_inputs(
            &mut inputs,
            "Modifier keys could not be released before selection capture.",
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
        if sent != inputs.len() as u32 {
            return Err(error_message.to_string());
        }
        Ok(())
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

    fn read_clipboard_text() -> Option<String> {
        unsafe {
            if IsClipboardFormatAvailable(CF_UNICODETEXT_FORMAT) == 0
                || OpenClipboard(std::ptr::null_mut()) == 0
            {
                return None;
            }
            let handle = GetClipboardData(CF_UNICODETEXT_FORMAT);
            if handle.is_null() {
                CloseClipboard();
                return None;
            }
            let locked = GlobalLock(handle) as *const u16;
            if locked.is_null() {
                CloseClipboard();
                return None;
            }
            let max_units = GlobalSize(handle) / std::mem::size_of::<u16>();
            let mut len = 0usize;
            while len < max_units && *locked.add(len) != 0 {
                len += 1;
            }
            let text = String::from_utf16_lossy(std::slice::from_raw_parts(locked, len));
            GlobalUnlock(handle);
            CloseClipboard();
            Some(text)
        }
    }

    fn clear_clipboard_text() -> Result<(), String> {
        unsafe {
            if OpenClipboard(std::ptr::null_mut()) == 0 {
                return Err("Clipboard could not be opened for clear.".to_string());
            }
            EmptyClipboard();
            CloseClipboard();
        }
        Ok(())
    }

    fn write_clipboard_text(text: &str) -> Result<(), String> {
        let mut wide: Vec<u16> = text.encode_utf16().collect();
        wide.push(0);
        let bytes = wide.len() * std::mem::size_of::<u16>();
        unsafe {
            if OpenClipboard(std::ptr::null_mut()) == 0 {
                return Err("Clipboard could not be opened for restore.".to_string());
            }
            EmptyClipboard();
            let handle = GlobalAlloc(GMEM_MOVEABLE, bytes);
            if handle.is_null() {
                CloseClipboard();
                return Err("Clipboard restore allocation failed.".to_string());
            }
            let locked = GlobalLock(handle) as *mut u16;
            if locked.is_null() {
                CloseClipboard();
                return Err("Clipboard restore lock failed.".to_string());
            }
            std::ptr::copy_nonoverlapping(wide.as_ptr(), locked, wide.len());
            GlobalUnlock(handle);
            SetClipboardData(CF_UNICODETEXT_FORMAT, handle);
            CloseClipboard();
        }
        Ok(())
    }

    fn log_selection_outcome(scope: &str, outcome: &SelectionCaptureOutcome) {
        let selection_id = outcome
            .selection
            .as_ref()
            .map(|selection| selection.selection_id.as_str())
            .unwrap_or("none");
        let text_len = outcome
            .selection
            .as_ref()
            .and_then(|selection| selection.selected_text.as_ref())
            .map(|text| text.chars().count())
            .unwrap_or(0);
        eprintln!(
            "[dictation-tauri][selection-capture] scope={scope} status={:?} selection_id={selection_id} text_len={text_len} truncated={}",
            outcome.status,
            outcome.truncated
        );
    }

    fn parse_hwnd(value: &str) -> Option<windows_sys::Win32::Foundation::HWND> {
        value
            .parse::<isize>()
            .ok()
            .map(|parsed| parsed as windows_sys::Win32::Foundation::HWND)
    }

    fn focus_window(hwnd: windows_sys::Win32::Foundation::HWND) {
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

    fn redacted_target_snapshot(
        hwnd: windows_sys::Win32::Foundation::HWND,
    ) -> SelectionTargetSnapshot {
        let has_window_label = !get_window_text(hwnd).trim().is_empty();
        let has_app_label = !get_class_name(hwnd).trim().is_empty();
        SelectionTargetSnapshot {
            captured_at: None,
            app_label: if has_app_label {
                Some("[redacted]".to_string())
            } else {
                None
            },
            window_label: if has_window_label {
                Some("[redacted]".to_string())
            } else {
                None
            },
            confidence: "low",
        }
    }

    fn get_window_text(hwnd: windows_sys::Win32::Foundation::HWND) -> String {
        let len = unsafe { GetWindowTextLengthW(hwnd) };
        if len <= 0 {
            return String::new();
        }
        let mut buffer = vec![0u16; len as usize + 1];
        let copied = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
        String::from_utf16_lossy(&buffer[..copied as usize])
    }

    fn get_class_name(hwnd: windows_sys::Win32::Foundation::HWND) -> String {
        let mut buffer = vec![0u16; 256];
        let copied = unsafe { GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
        String::from_utf16_lossy(&buffer[..copied as usize])
    }
}

#[cfg(not(windows))]
mod platform {
    use super::{SelectionCaptureOutcome, SelectionCaptureStatus};

    pub fn capture_selection_context() -> SelectionCaptureOutcome {
        SelectionCaptureOutcome {
            status: SelectionCaptureStatus::UnsupportedPlatform,
            selection: None,
            target_snapshot: None,
            redacted: true,
            truncated: false,
            reason: Some("Host selection capture is only available on Windows.".to_string()),
        }
    }

    pub fn capture_selection_context_for_target(
        _frame_hwnd: String,
        _force_clipboard_fallback: bool,
    ) -> SelectionCaptureOutcome {
        capture_selection_context()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_metadata_declares_clipboard_roundtrip_fallback() {
        assert_eq!(
            host_selection_capture_route(),
            HostSelectionCaptureRoute {
                owner: "tauri_host",
                primary_strategy: "windows_ui_automation_then_clipboard_roundtrip",
                mutates_clipboard: true,
                sends_keyboard_shortcut: true,
                touches_focus: true,
                persists_selection: false,
                allows_clipboard_roundtrip: true,
            }
        );
    }

    #[test]
    fn picker_can_force_clipboard_roundtrip_without_enabling_global_fallback() {
        assert!(!selection_clipboard_roundtrip_allowed(false, false));
        assert!(selection_clipboard_roundtrip_allowed(true, false));
        assert!(selection_clipboard_roundtrip_allowed(false, true));
    }

    #[test]
    fn no_selection_outcome_is_redacted_and_non_persistent() {
        let outcome = no_selection(None, "synthetic no selection");

        assert_eq!(outcome.status, SelectionCaptureStatus::NoSelection);
        assert_eq!(outcome.selection, None);
        assert!(outcome.redacted);
        assert!(!outcome.truncated);
        assert_eq!(outcome.reason.as_deref(), Some("synthetic no selection"));
    }
}
