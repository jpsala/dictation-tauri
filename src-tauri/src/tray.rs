use serde::Serialize;
use tauri::{
    menu::{CheckMenuItemBuilder, ContextMenu, MenuBuilder, MenuEvent, SubmenuBuilder},
    tray::{MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, WindowEvent,
};

use crate::desktop_delivery;
use crate::dock_shell::{self, DOCK_WINDOW_LABEL};
use crate::settings_window;
use crate::user_preferences::DockSkinId;

pub const HOST_COMMAND_EVENT: &str = "desktop-control://host-command";

pub const MENU_TOGGLE_DOCK: &str = "toggle_dock";
pub const MENU_PRESET_COMO_YO_ES: &str = "preset_como_yo_es";
pub const MENU_PRESET_CORREGIR_TEXTO: &str = "preset_corregir_texto";
pub const MENU_PRESET_FIX_WRITING: &str = "preset_fix_writing";
pub const MENU_PRESET_LIKE_ME_EN: &str = "preset_like_me_en";
pub const MENU_DOCK_SKIN_CLASSIC: &str = "dock_skin_classic_7";
pub const MENU_DOCK_SKIN_COMPACT: &str = "dock_skin_compact_5";
pub const MENU_DOCK_SKIN_WISPR_FLOW: &str = "dock_skin_wispr_flow";
pub const MENU_OPEN_SETTINGS: &str = "open_settings";
pub const MENU_QUIT: &str = "quit";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostCommandPayload {
    pub source: &'static str,
    pub command: &'static str,
    pub preset_id: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dock_skin: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chord_key: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_snapshot: Option<crate::desktop_delivery::DesktopDeliveryTarget>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HostMenuAction {
    ToggleDock,
    SelectPreset(&'static str),
    SelectDockSkin(DockSkinId),
    OpenSettings,
    Quit,
    Unknown,
}

pub fn resolve_host_menu_action(id: &str) -> HostMenuAction {
    match id {
        MENU_TOGGLE_DOCK => HostMenuAction::ToggleDock,
        MENU_PRESET_COMO_YO_ES => HostMenuAction::SelectPreset("como-yo-es"),
        MENU_PRESET_CORREGIR_TEXTO => HostMenuAction::SelectPreset("corregir-texto"),
        MENU_PRESET_FIX_WRITING => HostMenuAction::SelectPreset("fix-writing"),
        MENU_PRESET_LIKE_ME_EN => HostMenuAction::SelectPreset("like-me-en"),
        MENU_DOCK_SKIN_CLASSIC => HostMenuAction::SelectDockSkin(DockSkinId::Classic7),
        MENU_DOCK_SKIN_COMPACT => HostMenuAction::SelectDockSkin(DockSkinId::Compact5),
        MENU_DOCK_SKIN_WISPR_FLOW => HostMenuAction::SelectDockSkin(DockSkinId::WisprFlow),
        MENU_OPEN_SETTINGS => HostMenuAction::OpenSettings,
        MENU_QUIT => HostMenuAction::Quit,
        _ => HostMenuAction::Unknown,
    }
}

pub fn host_command_payload(action: HostMenuAction) -> Option<HostCommandPayload> {
    let (command, preset_id, dock_skin) = match action {
        HostMenuAction::SelectPreset(preset_id) => ("select_preset", Some(preset_id), None),
        HostMenuAction::SelectDockSkin(DockSkinId::Classic7) => {
            ("set_dock_skin", None, Some("classic-7"))
        }
        HostMenuAction::SelectDockSkin(DockSkinId::Compact5) => {
            ("set_dock_skin", None, Some("compact-5"))
        }
        HostMenuAction::SelectDockSkin(DockSkinId::WisprFlow) => {
            ("set_dock_skin", None, Some("wispr-flow"))
        }
        HostMenuAction::ToggleDock
        | HostMenuAction::OpenSettings
        | HostMenuAction::Quit
        | HostMenuAction::Unknown => return None,
    };

    Some(HostCommandPayload {
        source: "tray_or_context_menu",
        command,
        preset_id,
        dock_skin,
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
    let show_dock = CheckMenuItemBuilder::with_id(MENU_TOGGLE_DOCK, "Show dock")
        .checked(dock_shell::is_dock_visible())
        .build(app)?;

    let skin_menu = SubmenuBuilder::new(app, "Dock skin")
        .text(MENU_DOCK_SKIN_CLASSIC, "Classic 7")
        .text(MENU_DOCK_SKIN_COMPACT, "Compact 5")
        .text(MENU_DOCK_SKIN_WISPR_FLOW, "Wispr Flow")
        .build()?;

    let presets_menu = SubmenuBuilder::new(app, "Presets")
        .text(MENU_PRESET_COMO_YO_ES, "Como yo (español)")
        .text(MENU_PRESET_CORREGIR_TEXTO, "Corregir texto")
        .text(MENU_PRESET_FIX_WRITING, "Fix Writing")
        .text(MENU_PRESET_LIKE_ME_EN, "Like me (English)")
        .build()?;

    MenuBuilder::new(app)
        .item(&show_dock)
        .item(&skin_menu)
        .item(&presets_menu)
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
        HostMenuAction::ToggleDock => {
            let result = if dock_shell::is_dock_visible() {
                dock_shell::hide_dock_window(app)
            } else {
                dock_shell::show_dock_window(app)
            };
            if let Err(error) = result {
                eprintln!("failed to toggle dock window: {error}");
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
    fn resolves_the_reduced_menu_actions_from_stable_ids() {
        assert_eq!(
            resolve_host_menu_action(MENU_TOGGLE_DOCK),
            HostMenuAction::ToggleDock
        );
        assert_eq!(
            resolve_host_menu_action(MENU_PRESET_COMO_YO_ES),
            HostMenuAction::SelectPreset("como-yo-es")
        );
        assert_eq!(
            resolve_host_menu_action(MENU_PRESET_CORREGIR_TEXTO),
            HostMenuAction::SelectPreset("corregir-texto")
        );
        assert_eq!(
            resolve_host_menu_action(MENU_PRESET_FIX_WRITING),
            HostMenuAction::SelectPreset("fix-writing")
        );
        assert_eq!(
            resolve_host_menu_action(MENU_PRESET_LIKE_ME_EN),
            HostMenuAction::SelectPreset("like-me-en")
        );
        assert_eq!(
            resolve_host_menu_action(MENU_DOCK_SKIN_CLASSIC),
            HostMenuAction::SelectDockSkin(DockSkinId::Classic7)
        );
        assert_eq!(
            resolve_host_menu_action(MENU_DOCK_SKIN_COMPACT),
            HostMenuAction::SelectDockSkin(DockSkinId::Compact5)
        );
        assert_eq!(
            resolve_host_menu_action(MENU_DOCK_SKIN_WISPR_FLOW),
            HostMenuAction::SelectDockSkin(DockSkinId::WisprFlow)
        );
        assert_eq!(
            resolve_host_menu_action(MENU_OPEN_SETTINGS),
            HostMenuAction::OpenSettings
        );
        assert_eq!(resolve_host_menu_action(MENU_QUIT), HostMenuAction::Quit);
        assert_eq!(resolve_host_menu_action("unknown"), HostMenuAction::Unknown);
    }

    #[test]
    fn emits_renderer_commands_only_for_presets_and_skins() {
        assert_eq!(
            host_command_payload(HostMenuAction::SelectPreset("como-yo-es")),
            Some(HostCommandPayload {
                source: "tray_or_context_menu",
                command: "select_preset",
                preset_id: Some("como-yo-es"),
                dock_skin: None,
                chord_key: None,
                target_snapshot: None,
            })
        );
        assert_eq!(
            host_command_payload(HostMenuAction::SelectDockSkin(DockSkinId::Compact5)),
            Some(HostCommandPayload {
                source: "tray_or_context_menu",
                command: "set_dock_skin",
                preset_id: None,
                dock_skin: Some("compact-5"),
                chord_key: None,
                target_snapshot: None,
            })
        );
        assert_eq!(host_command_payload(HostMenuAction::ToggleDock), None);
        assert_eq!(host_command_payload(HostMenuAction::OpenSettings), None);
        assert_eq!(host_command_payload(HostMenuAction::Quit), None);
    }
}
