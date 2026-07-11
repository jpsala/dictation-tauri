use serde::Serialize;
use tauri::{
    menu::{ContextMenu, MenuBuilder, MenuEvent},
    tray::{MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, WindowEvent,
};

use crate::desktop_delivery;
use crate::dock_shell::{self, DOCK_WINDOW_LABEL};
use crate::settings_window;

pub const HOST_COMMAND_EVENT: &str = "desktop-control://host-command";

pub const MENU_SHOW_DOCK: &str = "show_dock";
pub const MENU_HIDE_DOCK: &str = "hide_dock";
pub const MENU_START: &str = "start_dictation";
pub const MENU_STOP: &str = "stop_dictation";
pub const MENU_CANCEL: &str = "cancel_dictation";
pub const MENU_PASTE_LAST_SAFE: &str = "paste_last_safe";
pub const MENU_PRESET_TRANSLATE: &str = "preset_translate";
pub const MENU_PRESET_REWRITE: &str = "preset_rewrite";
pub const MENU_PRESET_SHORTEN: &str = "preset_shorten";
pub const MENU_PRESET_PROFESSIONAL: &str = "preset_professional";
pub const MENU_CLEAR_PRESET: &str = "clear_preset";
pub const MENU_SHOW_RESULT_HISTORY: &str = "show_result_history";
pub const MENU_SHOW_PRESET_PICKER: &str = "show_preset_picker";
pub const MENU_OPEN_SETTINGS: &str = "open_settings";
pub const MENU_QUIT: &str = "quit";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostCommandPayload {
    pub source: &'static str,
    pub command: &'static str,
    pub preset_id: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chord_key: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_snapshot: Option<crate::desktop_delivery::DesktopDeliveryTarget>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HostMenuAction {
    ShowDock,
    HideDock,
    StartDictation,
    StopDictation,
    CancelDictation,
    PasteLastSafe,
    SelectPreset(&'static str),
    ClearPreset,
    ShowResultHistory,
    ShowPresetPicker,
    OpenSettings,
    Quit,
    Unknown,
}

pub fn resolve_host_menu_action(id: &str) -> HostMenuAction {
    match id {
        MENU_SHOW_DOCK => HostMenuAction::ShowDock,
        MENU_HIDE_DOCK => HostMenuAction::HideDock,
        MENU_START => HostMenuAction::StartDictation,
        MENU_STOP => HostMenuAction::StopDictation,
        MENU_CANCEL => HostMenuAction::CancelDictation,
        MENU_PASTE_LAST_SAFE => HostMenuAction::PasteLastSafe,
        MENU_PRESET_TRANSLATE => HostMenuAction::SelectPreset("translate"),
        MENU_PRESET_REWRITE => HostMenuAction::SelectPreset("rewrite"),
        MENU_PRESET_SHORTEN => HostMenuAction::SelectPreset("shorten"),
        MENU_PRESET_PROFESSIONAL => HostMenuAction::SelectPreset("professional"),
        MENU_CLEAR_PRESET => HostMenuAction::ClearPreset,
        MENU_SHOW_RESULT_HISTORY => HostMenuAction::ShowResultHistory,
        MENU_SHOW_PRESET_PICKER => HostMenuAction::ShowPresetPicker,
        MENU_OPEN_SETTINGS => HostMenuAction::OpenSettings,
        MENU_QUIT => HostMenuAction::Quit,
        _ => HostMenuAction::Unknown,
    }
}

pub fn host_command_payload(action: HostMenuAction) -> Option<HostCommandPayload> {
    let (command, preset_id) = match action {
        HostMenuAction::StartDictation => ("start", None),
        HostMenuAction::StopDictation => ("stop", None),
        HostMenuAction::CancelDictation => ("cancel", None),
        HostMenuAction::PasteLastSafe => ("paste_last_safe", None),
        HostMenuAction::SelectPreset(preset_id) => ("select_preset", Some(preset_id)),
        HostMenuAction::ClearPreset => ("clear_preset", None),
        HostMenuAction::ShowResultHistory => ("show_result_history", None),
        HostMenuAction::ShowPresetPicker => ("show_preset_picker", None),
        HostMenuAction::ShowDock
        | HostMenuAction::OpenSettings
        | HostMenuAction::HideDock
        | HostMenuAction::Quit
        | HostMenuAction::Unknown => return None,
    };

    Some(HostCommandPayload {
        source: "tray_or_context_menu",
        command,
        preset_id,
        chord_key: None,
        target_snapshot: None,
    })
}

pub fn configure_tray_and_background<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_host_menu(app)?;
    let mut tray = TrayIconBuilder::with_id("dictation-tauri-tray")
        .tooltip("Dictation Tauri")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_tray_icon_event(|_tray, event| {
            cache_delivery_target_before_tray_menu(event);
        })
        .on_menu_event(|app, event| {
            handle_menu_event(app, event);
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;

    if let Some(window) = app.get_webview_window(DOCK_WINDOW_LABEL) {
        let app_handle = app.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = dock_shell::hide_dock_window(&app_handle);
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub fn show_dock_context_menu(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_window(DOCK_WINDOW_LABEL)
        .ok_or_else(|| "Dictation Dock window is not available".to_string())?;
    let menu = build_host_menu(&app).map_err(|error| error.to_string())?;
    menu.popup(window).map_err(|error| error.to_string())
}

fn cache_delivery_target_before_tray_menu(event: TrayIconEvent) {
    if matches!(
        event,
        TrayIconEvent::Click {
            button_state: MouseButtonState::Down,
            ..
        }
    ) {
        desktop_delivery::cache_current_desktop_delivery_target_for_tray(
            "tray_icon_click_before_menu",
        );
    }
}

fn build_host_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    MenuBuilder::new(app)
        .text(MENU_SHOW_DOCK, "Show dock")
        .text(MENU_HIDE_DOCK, "Hide dock")
        .separator()
        .text(MENU_START, "Start dictation")
        .text(MENU_STOP, "Stop / review")
        .text(MENU_CANCEL, "Cancel dictation")
        .separator()
        .text(MENU_PASTE_LAST_SAFE, "Paste last (safe)")
        .text(MENU_SHOW_RESULT_HISTORY, "Result history")
        .text(MENU_SHOW_PRESET_PICKER, "Action picker (Alt+Q)")
        .separator()
        .text(MENU_PRESET_TRANSLATE, "Preset: Translate")
        .text(MENU_PRESET_REWRITE, "Preset: Rewrite")
        .text(MENU_PRESET_SHORTEN, "Preset: Shorten")
        .text(MENU_PRESET_PROFESSIONAL, "Preset: Professional")
        .text(MENU_CLEAR_PRESET, "Clear preset")
        .separator()
        .text(MENU_OPEN_SETTINGS, "Settings")
        .separator()
        .text(MENU_QUIT, "Quit Dictation Tauri")
        .build()
}

fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let action = resolve_host_menu_action(event.id().as_ref());
    eprintln!(
        "[dictation-tauri][tray] menu event id={} action={:?}",
        event.id().as_ref(),
        action
    );

    match action {
        HostMenuAction::ShowDock => {
            if let Err(error) = dock_shell::show_dock_window(app) {
                eprintln!("failed to show dock window: {error}");
            }
        }
        HostMenuAction::HideDock => {
            if let Err(error) = dock_shell::hide_dock_window(app) {
                eprintln!("failed to hide dock window: {error}");
            }
        }
        HostMenuAction::OpenSettings => {
            if let Err(error) = settings_window::show_settings_window_for_app(app) {
                eprintln!("failed to open settings window: {error}");
            }
        }
        HostMenuAction::Quit => app.exit(0),
        action => {
            if let Some(payload) = host_command_payload(action) {
                let _ = app.emit_to(DOCK_WINDOW_LABEL, HOST_COMMAND_EVENT, payload.clone());
                let _ = app.emit(HOST_COMMAND_EVENT, payload);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_host_menu_actions_from_stable_ids() {
        assert_eq!(
            resolve_host_menu_action(MENU_SHOW_DOCK),
            HostMenuAction::ShowDock
        );
        assert_eq!(
            resolve_host_menu_action(MENU_HIDE_DOCK),
            HostMenuAction::HideDock
        );
        assert_eq!(
            resolve_host_menu_action(MENU_START),
            HostMenuAction::StartDictation
        );
        assert_eq!(
            resolve_host_menu_action(MENU_STOP),
            HostMenuAction::StopDictation
        );
        assert_eq!(
            resolve_host_menu_action(MENU_CANCEL),
            HostMenuAction::CancelDictation
        );
        assert_eq!(
            resolve_host_menu_action(MENU_PASTE_LAST_SAFE),
            HostMenuAction::PasteLastSafe
        );
        assert_eq!(
            resolve_host_menu_action(MENU_PRESET_TRANSLATE),
            HostMenuAction::SelectPreset("translate")
        );
        assert_eq!(
            resolve_host_menu_action(MENU_PRESET_REWRITE),
            HostMenuAction::SelectPreset("rewrite")
        );
        assert_eq!(
            resolve_host_menu_action(MENU_PRESET_SHORTEN),
            HostMenuAction::SelectPreset("shorten")
        );
        assert_eq!(
            resolve_host_menu_action(MENU_PRESET_PROFESSIONAL),
            HostMenuAction::SelectPreset("professional")
        );
        assert_eq!(
            resolve_host_menu_action(MENU_CLEAR_PRESET),
            HostMenuAction::ClearPreset
        );
        assert_eq!(
            resolve_host_menu_action(MENU_SHOW_RESULT_HISTORY),
            HostMenuAction::ShowResultHistory
        );
        assert_eq!(
            resolve_host_menu_action(MENU_SHOW_PRESET_PICKER),
            HostMenuAction::ShowPresetPicker
        );
        assert_eq!(
            resolve_host_menu_action(MENU_OPEN_SETTINGS),
            HostMenuAction::OpenSettings
        );
        assert_eq!(resolve_host_menu_action(MENU_QUIT), HostMenuAction::Quit);
        assert_eq!(resolve_host_menu_action("unknown"), HostMenuAction::Unknown);
    }

    #[test]
    fn emits_only_renderer_safe_host_commands() {
        assert_eq!(
            host_command_payload(HostMenuAction::StartDictation),
            Some(HostCommandPayload {
                source: "tray_or_context_menu",
                command: "start",
                preset_id: None,
                chord_key: None,
                target_snapshot: None,
            })
        );
        assert_eq!(
            host_command_payload(HostMenuAction::StopDictation),
            Some(HostCommandPayload {
                source: "tray_or_context_menu",
                command: "stop",
                preset_id: None,
                chord_key: None,
                target_snapshot: None,
            })
        );
        assert_eq!(
            host_command_payload(HostMenuAction::SelectPreset("translate")),
            Some(HostCommandPayload {
                source: "tray_or_context_menu",
                command: "select_preset",
                preset_id: Some("translate"),
                chord_key: None,
                target_snapshot: None,
            })
        );
        assert_eq!(
            host_command_payload(HostMenuAction::ShowPresetPicker),
            Some(HostCommandPayload {
                source: "tray_or_context_menu",
                command: "show_preset_picker",
                preset_id: None,
                chord_key: None,
                target_snapshot: None,
            })
        );
        assert_eq!(host_command_payload(HostMenuAction::ShowDock), None);
        assert_eq!(host_command_payload(HostMenuAction::HideDock), None);
        assert_eq!(host_command_payload(HostMenuAction::OpenSettings), None);
        assert_eq!(host_command_payload(HostMenuAction::Quit), None);
    }
}
