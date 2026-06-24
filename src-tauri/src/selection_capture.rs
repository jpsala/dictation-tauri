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
        no_selection, SelectionCaptureOutcome, SelectionCaptureStatus, SelectionTargetSnapshot,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
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

        let has_window_label = !get_window_text(hwnd).trim().is_empty();
        let has_app_label = !get_class_name(hwnd).trim().is_empty();
        let target_snapshot = SelectionTargetSnapshot {
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
        };

        // This first host-owned boundary intentionally performs no clipboard roundtrip,
        // keyboard shortcut, focus change, or persistence. A future approved UI Automation
        // implementation can replace this no-selection outcome with redacted selected text.
        no_selection(
            Some(target_snapshot),
            "Host selection capture boundary is available; selected text capture remains gated.",
        )
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
