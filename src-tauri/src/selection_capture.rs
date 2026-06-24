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
        primary_strategy: "windows_ui_automation",
        mutates_clipboard: false,
        sends_keyboard_shortcut: false,
        touches_focus: false,
        persists_selection: false,
        allows_clipboard_roundtrip: false,
    }
}

#[tauri::command]
pub fn capture_selection_context() -> SelectionCaptureOutcome {
    platform::capture_selection_context()
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
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationTextPattern, UIA_TextPatternId,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId,
    };

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
        match capture_selected_text(hwnd, target_snapshot.clone()) {
            Ok(outcome) => outcome,
            Err(reason) => SelectionCaptureOutcome {
                status: SelectionCaptureStatus::Failed,
                selection: None,
                target_snapshot: Some(target_snapshot),
                redacted: true,
                truncated: false,
                reason: Some(reason),
            },
        }
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
        let automation: IUIAutomation =
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| format!("UI Automation is unavailable: {error}"))?;
        let focused = automation
            .GetFocusedElement()
            .map_err(|error| format!("Focused UI Automation element is unavailable: {error}"))?;

        let mut foreground_pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut foreground_pid);
        let focused_pid = focused.CurrentProcessId().unwrap_or_default().max(0) as u32;
        if foreground_pid != 0 && focused_pid != 0 && foreground_pid != focused_pid {
            return Ok(SelectionCaptureOutcome {
                status: SelectionCaptureStatus::UnsupportedTarget,
                selection: None,
                target_snapshot: Some(target_snapshot),
                redacted: true,
                truncated: false,
                reason: Some(
                    "Focused element does not belong to the foreground target.".to_string(),
                ),
            });
        }

        let text_pattern = match focused
            .GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
        {
            Ok(pattern) => pattern,
            Err(_) => {
                return Ok(SelectionCaptureOutcome {
                    status: SelectionCaptureStatus::UnsupportedTarget,
                    selection: None,
                    target_snapshot: Some(target_snapshot),
                    redacted: true,
                    truncated: false,
                    reason: Some(
                        "Foreground target does not expose UI Automation TextPattern.".to_string(),
                    ),
                });
            }
        };

        let ranges = text_pattern
            .GetSelection()
            .map_err(|error| format!("UI Automation selection range could not be read: {error}"))?;
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_metadata_stays_host_owned_and_non_mutating() {
        assert_eq!(
            host_selection_capture_route(),
            HostSelectionCaptureRoute {
                owner: "tauri_host",
                primary_strategy: "windows_ui_automation",
                mutates_clipboard: false,
                sends_keyboard_shortcut: false,
                touches_focus: false,
                persists_selection: false,
                allows_clipboard_roundtrip: false,
            }
        );
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
