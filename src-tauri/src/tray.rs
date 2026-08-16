use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::{OnceLock, RwLock};
use tauri::{
    menu::{
        CheckMenuItem, CheckMenuItemBuilder, ContextMenu, MenuBuilder, MenuEvent, SubmenuBuilder,
    },
    tray::{MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, WindowEvent,
};

use crate::desktop_delivery;
use crate::dock_shell::{self, DOCK_WINDOW_LABEL};
use crate::settings_window;
use crate::user_preferences::{DictationMode, DockSkinId};

pub const HOST_COMMAND_EVENT: &str = "desktop-control://host-command";
pub const HOST_PRESET_MENU_SYNC_EVENT: &str = "desktop-control://preset-menu-sync";
pub const TRAY_ICON_ID: &str = "dictation-tauri-tray";
pub const HOST_PRESET_MENU_SCHEMA_VERSION: u32 = 1;
pub const HOST_PRESET_MENU_MAX_ITEMS: usize = 64;
pub const HOST_PRESET_MENU_MAX_ID_CHARS: usize = 128;
pub const HOST_PRESET_MENU_MAX_NAME_CHARS: usize = 128;
pub const MENU_DICTATION_MODE_PROFILE: &str = "dictation_mode_profile";
pub const MENU_DICTATION_MODE_FAST: &str = "dictation_mode_fast";
pub const MENU_DICTATION_MODE_SAFE_CLEANUP: &str = "dictation_mode_safe_cleanup";
pub const MENU_DICTATION_MODE_COMPLETE: &str = "dictation_mode_complete";

pub const MENU_TOGGLE_DOCK: &str = "toggle_dock";
pub const MENU_PASTE_LAST_SAFE: &str = "paste_last_safe";
pub const MENU_SHOW_RESULT_HISTORY: &str = "show_result_history";
pub const MENU_CLEAR_PRESET: &str = "clear_preset";
pub const MENU_PRESET_ITEM_PREFIX: &str = "preset_item_";
pub const MENU_PRESET_COMO_YO_ES: &str = "preset_como_yo_es";
pub const MENU_PRESET_CORREGIR_TEXTO: &str = "preset_corregir_texto";
pub const MENU_PRESET_FIX_WRITING: &str = "preset_fix_writing";
pub const MENU_PRESET_LIKE_ME_EN: &str = "preset_like_me_en";
pub const MENU_DOCK_SKIN_CLASSIC: &str = "dock_skin_classic_7";
pub const MENU_DOCK_SKIN_COMPACT: &str = "dock_skin_compact_5";
pub const MENU_DOCK_SKIN_WISPR_FLOW: &str = "dock_skin_wispr_flow";
pub const MENU_OPEN_SETTINGS: &str = "open_settings";
pub const MENU_QUIT: &str = "quit";

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostPresetMenuItem {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostPresetMenuSnapshot {
    #[serde(default = "default_host_preset_menu_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub presets: Vec<HostPresetMenuItem>,
    #[serde(default)]
    pub active_preset_id: Option<String>,
}

impl Default for HostPresetMenuSnapshot {
    fn default() -> Self {
        Self {
            schema_version: HOST_PRESET_MENU_SCHEMA_VERSION,
            presets: Vec::new(),
            active_preset_id: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostPresetMenuSyncResult {
    pub snapshot: HostPresetMenuSnapshot,
    pub active_preset_cleared: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feedback_message: Option<String>,
}

static HOST_PRESET_MENU_SNAPSHOT: OnceLock<RwLock<HostPresetMenuSnapshot>> = OnceLock::new();

fn default_host_preset_menu_schema_version() -> u32 {
    HOST_PRESET_MENU_SCHEMA_VERSION
}

fn host_preset_menu_snapshot_store() -> &'static RwLock<HostPresetMenuSnapshot> {
    HOST_PRESET_MENU_SNAPSHOT.get_or_init(|| RwLock::new(HostPresetMenuSnapshot::default()))
}

pub fn current_host_preset_menu_snapshot() -> HostPresetMenuSnapshot {
    host_preset_menu_snapshot_store()
        .read()
        .map(|snapshot| snapshot.clone())
        .unwrap_or_default()
}

pub fn preset_menu_item_id(preset_id: &str) -> String {
    format!("{MENU_PRESET_ITEM_PREFIX}{preset_id}")
}

pub fn preset_id_from_menu_item_id(id: &str) -> Option<String> {
    id.strip_prefix(MENU_PRESET_ITEM_PREFIX)
        .map(str::trim)
        .filter(|preset_id| !preset_id.is_empty())
        .filter(|preset_id| preset_id.chars().count() <= HOST_PRESET_MENU_MAX_ID_CHARS)
        .map(ToOwned::to_owned)
}

pub fn normalize_host_preset_menu_snapshot(
    input: HostPresetMenuSnapshot,
) -> (HostPresetMenuSnapshot, bool) {
    let requested_active_preset_id = input
        .active_preset_id
        .as_deref()
        .map(str::trim)
        .filter(|preset_id| !preset_id.is_empty())
        .map(ToOwned::to_owned);

    if input.schema_version != HOST_PRESET_MENU_SCHEMA_VERSION {
        return (
            HostPresetMenuSnapshot {
                schema_version: HOST_PRESET_MENU_SCHEMA_VERSION,
                presets: Vec::new(),
                active_preset_id: None,
            },
            requested_active_preset_id.is_some(),
        );
    }

    let mut seen_ids = HashSet::new();
    let mut presets = Vec::new();
    for preset in input.presets {
        let id = preset.id.trim();
        if id.is_empty()
            || id.chars().count() > HOST_PRESET_MENU_MAX_ID_CHARS
            || seen_ids.contains(id)
        {
            continue;
        }

        let name = preset.name.trim();
        if name.chars().count() > HOST_PRESET_MENU_MAX_NAME_CHARS {
            continue;
        }

        seen_ids.insert(id.to_owned());
        presets.push(HostPresetMenuItem {
            id: id.to_owned(),
            name: if name.is_empty() {
                id.to_owned()
            } else {
                name.to_owned()
            },
        });
        if presets.len() >= HOST_PRESET_MENU_MAX_ITEMS {
            break;
        }
    }

    let active_preset_was_requested = requested_active_preset_id.is_some();
    let active_preset_id = requested_active_preset_id.filter(|active_id| {
        active_id.chars().count() <= HOST_PRESET_MENU_MAX_ID_CHARS && seen_ids.contains(active_id)
    });
    let active_preset_cleared = active_preset_was_requested && active_preset_id.is_none();

    (
        HostPresetMenuSnapshot {
            schema_version: HOST_PRESET_MENU_SCHEMA_VERSION,
            presets,
            active_preset_id,
        },
        active_preset_cleared,
    )
}

pub fn host_preset_menu_snapshot_from_store(
    store: &Value,
    active_preset_id: Option<String>,
) -> HostPresetMenuSnapshot {
    let presets = store
        .get("presets")
        .and_then(Value::as_object)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|(id, definition)| {
                    let id = id.trim();
                    let enabled = definition
                        .get("enabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(true);
                    if !enabled
                        || id.is_empty()
                        || id.chars().count() > HOST_PRESET_MENU_MAX_ID_CHARS
                    {
                        return None;
                    }

                    let name = definition
                        .get("name")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|name| !name.is_empty())
                        .unwrap_or(id);
                    if name.chars().count() > HOST_PRESET_MENU_MAX_NAME_CHARS {
                        return None;
                    }

                    Some(HostPresetMenuItem {
                        id: id.to_owned(),
                        name: name.to_owned(),
                    })
                })
                .take(HOST_PRESET_MENU_MAX_ITEMS)
                .collect()
        })
        .unwrap_or_default();

    HostPresetMenuSnapshot {
        schema_version: HOST_PRESET_MENU_SCHEMA_VERSION,
        presets,
        active_preset_id,
    }
}

fn apply_host_preset_menu_snapshot(
    app: &AppHandle,
    snapshot: HostPresetMenuSnapshot,
) -> Result<HostPresetMenuSyncResult, String> {
    let (normalized_snapshot, active_preset_cleared) =
        normalize_host_preset_menu_snapshot(snapshot);
    *host_preset_menu_snapshot_store()
        .write()
        .map_err(|_| "Preset menu snapshot lock is poisoned".to_string())? =
        normalized_snapshot.clone();

    let menu = build_host_menu(app).map_err(|error| error.to_string())?;
    if let Some(tray) = app.tray_by_id(TRAY_ICON_ID) {
        tray.set_menu(Some(menu))
            .map_err(|error| error.to_string())?;
    }

    let result = HostPresetMenuSyncResult {
        snapshot: normalized_snapshot,
        active_preset_cleared,
        feedback_message: active_preset_cleared
            .then(|| "The active preset is no longer available; it was cleared.".to_string()),
    };
    let _ = app.emit(HOST_PRESET_MENU_SYNC_EVENT, result.clone());
    Ok(result)
}

pub fn refresh_host_preset_menu_from_store(
    app: &AppHandle,
    store: &Value,
) -> Result<HostPresetMenuSyncResult, String> {
    let active_preset_id = current_host_preset_menu_snapshot().active_preset_id;
    apply_host_preset_menu_snapshot(
        app,
        host_preset_menu_snapshot_from_store(store, active_preset_id),
    )
}

#[tauri::command]
pub fn sync_host_preset_menu_snapshot(
    app: AppHandle,
    snapshot: HostPresetMenuSnapshot,
) -> Result<HostPresetMenuSyncResult, String> {
    apply_host_preset_menu_snapshot(&app, snapshot)
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostCommandPayload {
    pub source: &'static str,
    pub command: &'static str,
    pub preset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dock_skin: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chord_key: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_snapshot: Option<crate::desktop_delivery::DesktopDeliveryTarget>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HostMenuAction {
    ToggleDock,
    PasteLastSafe,
    ShowResultHistory,
    ClearPreset,
    SelectPreset(&'static str),
    SelectPresetOwned(String),
    SelectDictationMode(DictationMode),
    SelectDockSkin(DockSkinId),
    OpenSettings,
    Quit,
    Unknown,
}

pub fn resolve_host_menu_action(id: &str) -> HostMenuAction {
    match id {
        MENU_TOGGLE_DOCK => HostMenuAction::ToggleDock,
        MENU_PASTE_LAST_SAFE => HostMenuAction::PasteLastSafe,
        MENU_SHOW_RESULT_HISTORY => HostMenuAction::ShowResultHistory,
        MENU_CLEAR_PRESET => HostMenuAction::ClearPreset,
        MENU_PRESET_COMO_YO_ES => HostMenuAction::SelectPreset("como-yo-es"),
        MENU_PRESET_CORREGIR_TEXTO => HostMenuAction::SelectPreset("corregir-texto"),
        MENU_PRESET_FIX_WRITING => HostMenuAction::SelectPreset("fix-writing"),
        MENU_PRESET_LIKE_ME_EN => HostMenuAction::SelectPreset("like-me-en"),
        MENU_DICTATION_MODE_PROFILE => HostMenuAction::SelectDictationMode(DictationMode::Profile),
        MENU_DICTATION_MODE_FAST => HostMenuAction::SelectDictationMode(DictationMode::Fast),
        MENU_DICTATION_MODE_SAFE_CLEANUP => {
            HostMenuAction::SelectDictationMode(DictationMode::SafeCleanup)
        }
        MENU_DICTATION_MODE_COMPLETE => {
            HostMenuAction::SelectDictationMode(DictationMode::Complete)
        }
        MENU_DOCK_SKIN_CLASSIC => HostMenuAction::SelectDockSkin(DockSkinId::Classic7),
        MENU_DOCK_SKIN_COMPACT => HostMenuAction::SelectDockSkin(DockSkinId::Compact5),
        MENU_DOCK_SKIN_WISPR_FLOW => HostMenuAction::SelectDockSkin(DockSkinId::WisprFlow),
        MENU_OPEN_SETTINGS => HostMenuAction::OpenSettings,
        MENU_QUIT => HostMenuAction::Quit,
        _ => preset_id_from_menu_item_id(id)
            .map(HostMenuAction::SelectPresetOwned)
            .unwrap_or(HostMenuAction::Unknown),
    }
}

pub fn host_command_payload(action: HostMenuAction) -> Option<HostCommandPayload> {
    let (command, preset_id, dock_skin) = match action {
        HostMenuAction::PasteLastSafe => ("paste_last_safe", None, None),
        HostMenuAction::ShowResultHistory => ("show_result_history", None, None),
        HostMenuAction::ClearPreset => ("clear_preset", None, None),
        HostMenuAction::SelectPreset(preset_id) => {
            ("select_preset", Some((*preset_id).to_owned()), None)
        }
        HostMenuAction::SelectPresetOwned(preset_id) => ("select_preset", Some(preset_id), None),
        HostMenuAction::SelectDockSkin(DockSkinId::Classic7) => {
            ("set_dock_skin", None, Some("classic-7"))
        }
        HostMenuAction::SelectDockSkin(DockSkinId::Compact5) => {
            ("set_dock_skin", None, Some("compact-5"))
        }
        HostMenuAction::SelectDockSkin(DockSkinId::WisprFlow) => {
            ("set_dock_skin", None, Some("wispr-flow"))
        }
        HostMenuAction::SelectDictationMode(_)
        | HostMenuAction::ToggleDock
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

pub fn refresh_host_menu<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let menu = build_host_menu(app).map_err(|error| error.to_string())?;
    if let Some(tray) = app.tray_by_id(TRAY_ICON_ID) {
        tray.set_menu(Some(menu))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
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
    desktop_delivery::cache_current_desktop_delivery_target_for_tray(
        "dock_context_menu_before_popup",
    );
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
    let active_dictation_mode =
        crate::user_preferences::read_user_preferences_for_app(app).dictation_mode;
    let dictation_mode_profile = CheckMenuItem::with_id(
        app,
        MENU_DICTATION_MODE_PROFILE,
        "Según mi perfil",
        true,
        active_dictation_mode == DictationMode::Profile,
        None::<&str>,
    )?;
    let dictation_mode_fast = CheckMenuItem::with_id(
        app,
        MENU_DICTATION_MODE_FAST,
        "Rápido",
        true,
        active_dictation_mode == DictationMode::Fast,
        None::<&str>,
    )?;
    let dictation_mode_safe_cleanup = CheckMenuItem::with_id(
        app,
        MENU_DICTATION_MODE_SAFE_CLEANUP,
        "Limpieza segura",
        true,
        active_dictation_mode == DictationMode::SafeCleanup,
        None::<&str>,
    )?;
    let dictation_mode_complete = CheckMenuItem::with_id(
        app,
        MENU_DICTATION_MODE_COMPLETE,
        "Completo",
        true,
        active_dictation_mode == DictationMode::Complete,
        None::<&str>,
    )?;
    let dictation_mode_menu = SubmenuBuilder::new(app, "Modo de dictado")
        .item(&dictation_mode_profile)
        .item(&dictation_mode_fast)
        .item(&dictation_mode_safe_cleanup)
        .item(&dictation_mode_complete)
        .build()?;

    let preset_snapshot = current_host_preset_menu_snapshot();
    let clear_preset = CheckMenuItem::with_id(
        app,
        MENU_CLEAR_PRESET,
        "Sin preset",
        true,
        preset_snapshot.active_preset_id.is_none(),
        None::<&str>,
    )?;
    let mut preset_items: Vec<CheckMenuItem<R>> = Vec::with_capacity(preset_snapshot.presets.len());
    for preset in &preset_snapshot.presets {
        preset_items.push(CheckMenuItem::with_id(
            app,
            preset_menu_item_id(&preset.id),
            &preset.name,
            true,
            preset_snapshot.active_preset_id.as_deref() == Some(preset.id.as_str()),
            None::<&str>,
        )?);
    }
    let mut presets_menu_builder = SubmenuBuilder::new(app, "Acciones").item(&clear_preset);
    for preset_item in &preset_items {
        presets_menu_builder = presets_menu_builder.item(preset_item);
    }
    let presets_menu = presets_menu_builder.build()?;

    MenuBuilder::new(app)
        .item(&show_dock)
        .separator()
        .text(MENU_PASTE_LAST_SAFE, "Paste last")
        .text(MENU_SHOW_RESULT_HISTORY, "History")
        .separator()
        .item(&dictation_mode_menu)
        .item(&skin_menu)
        .item(&presets_menu)
        .text(MENU_OPEN_SETTINGS, "Settings")
        .separator()
        .text(MENU_QUIT, "Quit Dictation Tauri")
        .build()
}

fn menu_action_uses_cached_delivery_target(action: HostMenuAction) -> bool {
    matches!(
        action,
        HostMenuAction::PasteLastSafe | HostMenuAction::ShowResultHistory
    )
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
        HostMenuAction::SelectDictationMode(mode) => {
            if let Err(error) = crate::user_preferences::set_dictation_mode_for_app(app, mode) {
                eprintln!("failed to set dictation mode: {error}");
            }
        }
        HostMenuAction::Quit => app.exit(0),
        action => {
            if let Some(mut payload) = host_command_payload(action.clone()) {
                if menu_action_uses_cached_delivery_target(action) {
                    payload.target_snapshot =
                        desktop_delivery::get_cached_desktop_delivery_target();
                }
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
            resolve_host_menu_action(MENU_PASTE_LAST_SAFE),
            HostMenuAction::PasteLastSafe
        );
        assert_eq!(
            resolve_host_menu_action(MENU_SHOW_RESULT_HISTORY),
            HostMenuAction::ShowResultHistory
        );
        assert_eq!(
            resolve_host_menu_action(MENU_CLEAR_PRESET),
            HostMenuAction::ClearPreset
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
        for (id, mode) in [
            (MENU_DICTATION_MODE_PROFILE, DictationMode::Profile),
            (MENU_DICTATION_MODE_FAST, DictationMode::Fast),
            (MENU_DICTATION_MODE_SAFE_CLEANUP, DictationMode::SafeCleanup),
            (MENU_DICTATION_MODE_COMPLETE, DictationMode::Complete),
        ] {
            assert_eq!(
                resolve_host_menu_action(id),
                HostMenuAction::SelectDictationMode(mode)
            );
        }
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
    fn dynamic_menu_ids_round_trip_without_colliding_with_clear() {
        let id = preset_menu_item_id("slack reply/v2");
        assert_eq!(id, "preset_item_slack reply/v2");
        assert_eq!(
            preset_id_from_menu_item_id(&id),
            Some("slack reply/v2".to_string())
        );
        assert_eq!(preset_id_from_menu_item_id(MENU_CLEAR_PRESET), None);
        assert_eq!(
            resolve_host_menu_action(&id),
            HostMenuAction::SelectPresetOwned("slack reply/v2".to_string())
        );
    }

    #[test]
    fn snapshot_normalization_filters_invalid_items_and_clears_stale_active() {
        let (snapshot, active_preset_cleared) =
            normalize_host_preset_menu_snapshot(HostPresetMenuSnapshot {
                schema_version: HOST_PRESET_MENU_SCHEMA_VERSION,
                presets: vec![
                    HostPresetMenuItem {
                        id: "  keep  ".to_string(),
                        name: "  Current name  ".to_string(),
                    },
                    HostPresetMenuItem {
                        id: "keep".to_string(),
                        name: "duplicate".to_string(),
                    },
                    HostPresetMenuItem {
                        id: " ".to_string(),
                        name: "empty".to_string(),
                    },
                ],
                active_preset_id: Some("removed".to_string()),
            });

        assert!(active_preset_cleared);
        assert_eq!(
            snapshot,
            HostPresetMenuSnapshot {
                schema_version: HOST_PRESET_MENU_SCHEMA_VERSION,
                presets: vec![HostPresetMenuItem {
                    id: "keep".to_string(),
                    name: "Current name".to_string(),
                }],
                active_preset_id: None,
            }
        );
    }

    #[test]
    fn mixed_snapshot_keeps_valid_items_and_active_check() {
        let too_long_id = "i".repeat(HOST_PRESET_MENU_MAX_ID_CHARS + 1);
        let too_long_name = "n".repeat(HOST_PRESET_MENU_MAX_NAME_CHARS + 1);
        let (snapshot, active_preset_cleared) =
            normalize_host_preset_menu_snapshot(HostPresetMenuSnapshot {
                schema_version: HOST_PRESET_MENU_SCHEMA_VERSION,
                presets: vec![
                    HostPresetMenuItem {
                        id: "valid".to_string(),
                        name: "Valid".to_string(),
                    },
                    HostPresetMenuItem {
                        id: too_long_id,
                        name: "Ignored ID".to_string(),
                    },
                    HostPresetMenuItem {
                        id: "too-long-name".to_string(),
                        name: too_long_name,
                    },
                    HostPresetMenuItem {
                        id: "recover".to_string(),
                        name: "x".repeat(HOST_PRESET_MENU_MAX_NAME_CHARS + 1),
                    },
                    HostPresetMenuItem {
                        id: "recover".to_string(),
                        name: "Recovered".to_string(),
                    },
                    HostPresetMenuItem {
                        id: "active".to_string(),
                        name: " Active name ".to_string(),
                    },
                ],
                active_preset_id: Some("active".to_string()),
            });

        assert!(!active_preset_cleared);
        assert_eq!(snapshot.active_preset_id.as_deref(), Some("active"));
        assert_eq!(
            snapshot.presets,
            vec![
                HostPresetMenuItem {
                    id: "valid".to_string(),
                    name: "Valid".to_string(),
                },
                HostPresetMenuItem {
                    id: "recover".to_string(),
                    name: "Recovered".to_string(),
                },
                HostPresetMenuItem {
                    id: "active".to_string(),
                    name: "Active name".to_string(),
                },
            ]
        );
    }

    #[test]
    fn excessive_snapshot_items_are_capped_before_native_menu_build() {
        let presets = (0..(HOST_PRESET_MENU_MAX_ITEMS + 16))
            .map(|index| HostPresetMenuItem {
                id: format!("preset-{index}"),
                name: format!("Preset {index}"),
            })
            .collect();
        let (snapshot, active_preset_cleared) =
            normalize_host_preset_menu_snapshot(HostPresetMenuSnapshot {
                schema_version: HOST_PRESET_MENU_SCHEMA_VERSION,
                presets,
                active_preset_id: Some(format!("preset-{}", HOST_PRESET_MENU_MAX_ITEMS - 1)),
            });
        let last_id = format!("preset-{}", HOST_PRESET_MENU_MAX_ITEMS - 1);

        assert!(!active_preset_cleared);
        assert_eq!(snapshot.presets.len(), HOST_PRESET_MENU_MAX_ITEMS);
        assert_eq!(snapshot.active_preset_id.as_deref(), Some(last_id.as_str()));
        assert_eq!(
            snapshot.presets.last().map(|preset| preset.id.as_str()),
            Some(last_id.as_str())
        );
        assert!(snapshot.presets.iter().all(|preset| {
            preset.id.chars().count() <= HOST_PRESET_MENU_MAX_ID_CHARS
                && preset.name.chars().count() <= HOST_PRESET_MENU_MAX_NAME_CHARS
        }));
    }

    #[test]
    fn store_projection_omits_disabled_and_deleted_presets() {
        let snapshot = host_preset_menu_snapshot_from_store(
            &serde_json::json!({
                "schemaVersion": 2,
                "presets": {
                    "enabled": { "name": "Renamed", "enabled": true },
                    "disabled": { "name": "Hidden", "enabled": false }
                }
            }),
            Some("enabled".to_string()),
        );

        assert_eq!(
            snapshot,
            HostPresetMenuSnapshot {
                schema_version: HOST_PRESET_MENU_SCHEMA_VERSION,
                presets: vec![HostPresetMenuItem {
                    id: "enabled".to_string(),
                    name: "Renamed".to_string(),
                }],
                active_preset_id: Some("enabled".to_string()),
            }
        );
    }

    #[test]
    fn recovery_menu_actions_preserve_the_target_captured_before_the_menu() {
        assert!(menu_action_uses_cached_delivery_target(
            HostMenuAction::PasteLastSafe
        ));
        assert!(menu_action_uses_cached_delivery_target(
            HostMenuAction::ShowResultHistory
        ));
        assert!(!menu_action_uses_cached_delivery_target(
            HostMenuAction::SelectPreset("como-yo-es")
        ));
    }

    #[test]
    fn emits_renderer_commands_for_recovery_presets_and_skins() {
        assert_eq!(
            host_command_payload(HostMenuAction::PasteLastSafe),
            Some(HostCommandPayload {
                source: "tray_or_context_menu",
                command: "paste_last_safe",
                preset_id: None,
                dock_skin: None,
                chord_key: None,
                target_snapshot: None,
            })
        );
        assert_eq!(
            host_command_payload(HostMenuAction::ShowResultHistory),
            Some(HostCommandPayload {
                source: "tray_or_context_menu",
                command: "show_result_history",
                preset_id: None,
                dock_skin: None,
                chord_key: None,
                target_snapshot: None,
            })
        );
        assert_eq!(
            host_command_payload(HostMenuAction::SelectPreset("como-yo-es")),
            Some(HostCommandPayload {
                source: "tray_or_context_menu",
                command: "select_preset",
                preset_id: Some("como-yo-es".to_string()),
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
        assert_eq!(
            host_command_payload(HostMenuAction::SelectDictationMode(
                DictationMode::SafeCleanup
            )),
            None
        );
        assert_eq!(host_command_payload(HostMenuAction::OpenSettings), None);
        assert_eq!(host_command_payload(HostMenuAction::Quit), None);
        assert_eq!(
            host_command_payload(HostMenuAction::ClearPreset),
            Some(HostCommandPayload {
                source: "tray_or_context_menu",
                command: "clear_preset",
                preset_id: None,
                dock_skin: None,
                chord_key: None,
                target_snapshot: None,
            })
        );
        assert_eq!(
            host_command_payload(HostMenuAction::SelectPresetOwned("custom".to_string()))
                .and_then(|payload| payload.preset_id),
            Some("custom".to_string())
        );
    }
}
