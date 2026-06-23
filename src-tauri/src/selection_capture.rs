use serde::Serialize;

pub const SELECTION_CAPTURE_COMMAND: &str = "capture_selection_context";

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
