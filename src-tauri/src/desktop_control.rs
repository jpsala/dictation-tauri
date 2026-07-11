use crate::tray::{HostCommandPayload, HOST_COMMAND_EVENT};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex, OnceLock,
};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyBackend {
    TauriGlobalShortcut,
    WindowsLowLevelHook,
}

pub const DEFAULT_DESKTOP_CONTROL_HOTKEY: &str = "Alt+Space";
pub const FALLBACK_DESKTOP_CONTROL_HOTKEY: &str = "Ctrl+Shift+F9";
pub const ALT_SPACE_DESKTOP_CONTROL_HOTKEY: &str = "Alt+Space";
pub const ALT_3_DESKTOP_CONTROL_HOTKEY: &str = "Alt+3";
pub const PASTE_LAST_SAFE_HOTKEY: &str = "Alt+Shift+X";
pub const PRESET_PICKER_HOTKEY: &str = "Alt+Q";
pub const DESKTOP_CONTROL_HOTKEY_EVENT: &str = "desktop-control://global-hotkey";
pub const DESKTOP_CONTROL_HOTKEY_CAPTURE_EVENT: &str = "desktop-control://hotkey-capture";
pub const DICTATION_KEY_ENV: &str = "DICTATION_TAURI_DICTATION_KEY";
pub const ALT_SPACE_GATE_ENV: &str = "DICTATION_TAURI_ALLOW_ALT_SPACE";
pub const HOTKEY_PREFERENCE_FILE: &str = "hotkey-preferences.v1.json";
pub const ACTION_HOTKEY_PREFERENCE_FILE: &str = "action-hotkey-preferences.v1.json";

static CURRENT_HOTKEY: OnceLock<Mutex<EffectiveDictationHotkey>> = OnceLock::new();
static HOTKEY_LISTENER_READY: AtomicBool = AtomicBool::new(false);
static PENDING_HOTKEY_EVENTS: OnceLock<Mutex<Vec<DesktopControlHotkeyPayload>>> = OnceLock::new();

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EffectiveDictationHotkey {
    pub shortcut: &'static str,
    pub modifiers: Modifiers,
    pub code: Code,
    pub backend: HotkeyBackend,
    pub requested_shortcut: Option<&'static str>,
    pub alt_space_requested: bool,
    pub alt_space_enabled: bool,
    pub fallback_reason: Option<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlHotkeyConfig {
    pub shortcut: &'static str,
    pub default_shortcut: &'static str,
    pub requested_shortcut: Option<&'static str>,
    pub alt_space_requested: bool,
    pub alt_space_enabled: bool,
    pub backend: HotkeyBackend,
    pub fallback_reason: Option<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlHotkeyPayload {
    pub source: &'static str,
    pub action: &'static str,
    pub shortcut: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_snapshot: Option<crate::desktop_delivery::DesktopDeliveryTarget>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlHotkeyCapturePayload {
    pub source: &'static str,
    pub shortcut: &'static str,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlHotkeyRegistrationPreview {
    pub requested_shortcut: String,
    pub normalized_shortcut: String,
    pub can_apply: bool,
    pub reason: Option<&'static str>,
    pub target_config: Option<DesktopControlHotkeyConfig>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlHotkeyRegistrationApplyResult {
    pub preview: DesktopControlHotkeyRegistrationPreview,
    pub previous_config: DesktopControlHotkeyConfig,
    pub effective_config: DesktopControlHotkeyConfig,
    pub changed: bool,
    pub rolled_back: bool,
    pub preference_persisted: bool,
    pub persistence_error: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredHotkeyPreference {
    schema_version: u8,
    shortcut: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlActionHotkeyConfig {
    pub schema_version: u8,
    pub preset_picker: String,
    pub paste_last_safe: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlActionHotkeyRegistrationPreview {
    pub action_id: String,
    pub requested_shortcut: String,
    pub normalized_shortcut: String,
    pub can_apply: bool,
    pub reason: Option<&'static str>,
    pub effective_config: DesktopControlActionHotkeyConfig,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlActionHotkeyRegistrationApplyResult {
    pub preview: DesktopControlActionHotkeyRegistrationPreview,
    pub effective_config: DesktopControlActionHotkeyConfig,
    pub preference_persisted: bool,
    pub persistence_error: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NativeShortcutChord {
    pub label: &'static str,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub key_vk: u32,
}

#[tauri::command]
pub fn get_desktop_control_hotkey_config() -> DesktopControlHotkeyConfig {
    current_desktop_control_hotkey_config()
}

#[tauri::command]
pub fn set_desktop_control_escape_cancel_enabled(enabled: bool) -> bool {
    native_escape_cancel::set_escape_cancel_enabled(enabled)
}

#[tauri::command]
pub fn set_desktop_control_hotkey_capture_enabled(enabled: bool) -> bool {
    native_alt_space::set_alt_space_capture_enabled(enabled)
}

#[tauri::command]
pub fn set_desktop_control_hotkey_listener_ready(ready: bool) {
    HOTKEY_LISTENER_READY.store(ready, Ordering::SeqCst);
}

#[tauri::command]
pub fn drain_desktop_control_hotkey_events() -> Vec<DesktopControlHotkeyPayload> {
    HOTKEY_LISTENER_READY.store(true, Ordering::SeqCst);
    let events: Vec<DesktopControlHotkeyPayload> = PENDING_HOTKEY_EVENTS
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .map(|mut events| events.drain(..).collect())
        .unwrap_or_default();
    if !events.is_empty() {
        eprintln!(
            "[dictation-tauri][hotkey] drained pending events count={}",
            events.len()
        );
    }
    events
}

#[tauri::command]
pub fn preview_desktop_control_hotkey_registration(
    requested_shortcut: String,
) -> DesktopControlHotkeyRegistrationPreview {
    preview_hotkey_registration_request(&requested_shortcut)
}

#[tauri::command]
pub fn apply_desktop_control_hotkey_registration<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    requested_shortcut: String,
) -> DesktopControlHotkeyRegistrationApplyResult {
    apply_hotkey_registration_request(&app, &requested_shortcut)
}

#[tauri::command]
pub fn get_desktop_control_action_hotkey_config<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> DesktopControlActionHotkeyConfig {
    read_action_hotkey_preferences(&app).unwrap_or_else(|error| {
        eprintln!("[dictation-tauri][hotkey] action preferences unavailable: {error}");
        default_action_hotkey_config()
    })
}

#[tauri::command]
pub fn preview_desktop_control_action_hotkey_registration<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    action_id: String,
    requested_shortcut: String,
) -> DesktopControlActionHotkeyRegistrationPreview {
    preview_action_hotkey_registration_request(&app, &action_id, &requested_shortcut)
}

#[tauri::command]
pub fn apply_desktop_control_action_hotkey_registration<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    action_id: String,
    requested_shortcut: String,
) -> DesktopControlActionHotkeyRegistrationApplyResult {
    apply_action_hotkey_registration_request(&app, &action_id, &requested_shortcut)
}

pub fn desktop_control_hotkey_config(
    hotkey: EffectiveDictationHotkey,
) -> DesktopControlHotkeyConfig {
    DesktopControlHotkeyConfig {
        shortcut: hotkey.shortcut,
        default_shortcut: DEFAULT_DESKTOP_CONTROL_HOTKEY,
        requested_shortcut: hotkey.requested_shortcut,
        alt_space_requested: hotkey.alt_space_requested,
        alt_space_enabled: hotkey.alt_space_enabled,
        backend: hotkey.backend,
        fallback_reason: hotkey.fallback_reason,
    }
}

pub fn current_desktop_control_hotkey_config() -> DesktopControlHotkeyConfig {
    desktop_control_hotkey_config(current_effective_hotkey())
}

fn current_effective_hotkey() -> EffectiveDictationHotkey {
    CURRENT_HOTKEY
        .get()
        .and_then(|lock| lock.lock().ok().map(|guard| *guard))
        .unwrap_or_else(resolve_effective_dictation_hotkey_from_env)
}

fn remember_current_hotkey(hotkey: EffectiveDictationHotkey) {
    let lock = CURRENT_HOTKEY.get_or_init(|| Mutex::new(hotkey));
    if let Ok(mut guard) = lock.lock() {
        *guard = hotkey;
    }
}

pub fn resolve_effective_dictation_hotkey_from_env() -> EffectiveDictationHotkey {
    let requested = std::env::var(DICTATION_KEY_ENV).ok();
    let alt_space_allowed = std::env::var(ALT_SPACE_GATE_ENV)
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false);

    resolve_effective_dictation_hotkey(requested.as_deref(), alt_space_allowed)
}

pub fn resolve_effective_dictation_hotkey_from_app<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> EffectiveDictationHotkey {
    match read_hotkey_preference(app) {
        Ok(Some(shortcut)) => {
            // A stored preference was created by the host-owned Settings apply path,
            // so it is an explicit local opt-in and may restore Alt+Space on Windows
            // even when the legacy env gate is not present.
            resolve_effective_dictation_hotkey(Some(&shortcut), true)
        }
        Ok(None) => resolve_effective_dictation_hotkey_from_env(),
        Err(error) => {
            eprintln!("[dictation-tauri][hotkey] preference unavailable: {error}");
            resolve_effective_dictation_hotkey_from_env()
        }
    }
}

fn hotkey_preference_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<PathBuf> {
    Ok(app.path().app_data_dir()?.join(HOTKEY_PREFERENCE_FILE))
}

fn read_hotkey_preference<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<Option<String>> {
    let path = hotkey_preference_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path)?;
    let Ok(stored) = serde_json::from_str::<StoredHotkeyPreference>(&content) else {
        eprintln!(
            "[dictation-tauri][hotkey] ignoring invalid preference JSON at {}",
            path.display()
        );
        return Ok(None);
    };
    if stored.schema_version != 1 || !is_supported_persistent_shortcut(&stored.shortcut) {
        eprintln!(
            "[dictation-tauri][hotkey] ignoring unsupported preference at {}",
            path.display()
        );
        return Ok(None);
    }

    Ok(Some(stored.shortcut))
}

fn write_hotkey_preference<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    if !is_supported_persistent_shortcut(shortcut) {
        return Err("unsupported_persistent_shortcut".into());
    }

    let path = hotkey_preference_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    fs::write(
        path,
        serde_json::to_string_pretty(&StoredHotkeyPreference {
            schema_version: 1,
            shortcut: shortcut.to_string(),
        })?,
    )?;
    Ok(())
}

fn action_hotkey_preference_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()?
        .join(ACTION_HOTKEY_PREFERENCE_FILE))
}

fn default_action_hotkey_config() -> DesktopControlActionHotkeyConfig {
    DesktopControlActionHotkeyConfig {
        schema_version: 1,
        preset_picker: PRESET_PICKER_HOTKEY.to_string(),
        paste_last_safe: PASTE_LAST_SAFE_HOTKEY.to_string(),
    }
}

fn read_action_hotkey_preferences<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<DesktopControlActionHotkeyConfig, Box<dyn std::error::Error>> {
    let path = action_hotkey_preference_path(app)?;
    if !path.exists() {
        return Ok(default_action_hotkey_config());
    }

    let content = fs::read_to_string(&path)?;
    let stored = serde_json::from_str::<DesktopControlActionHotkeyConfig>(&content)?;
    if stored.schema_version != 1 {
        return Ok(default_action_hotkey_config());
    }

    let mut merged = default_action_hotkey_config();
    if preview_action_shortcut(&stored.preset_picker).is_none() {
        eprintln!("[dictation-tauri][hotkey] ignoring unsupported preset picker shortcut");
    } else {
        merged.preset_picker =
            canonicalize_shortcut(&stored.preset_picker).unwrap_or(stored.preset_picker);
    }
    if preview_action_shortcut(&stored.paste_last_safe).is_none() {
        eprintln!("[dictation-tauri][hotkey] ignoring unsupported paste-last shortcut");
    } else {
        merged.paste_last_safe =
            canonicalize_shortcut(&stored.paste_last_safe).unwrap_or(stored.paste_last_safe);
    }
    Ok(merged)
}

fn write_action_hotkey_preferences<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    config: &DesktopControlActionHotkeyConfig,
) -> Result<(), Box<dyn std::error::Error>> {
    let path = action_hotkey_preference_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(config)?)?;
    Ok(())
}

fn normalize_action_id(action_id: &str) -> Option<&'static str> {
    match action_id {
        "preset_picker" | "preset-picker" => Some("preset_picker"),
        "paste_last_safe" | "paste-last-safe" => Some("paste_last_safe"),
        _ => None,
    }
}

fn set_shortcut_for_action(
    config: &mut DesktopControlActionHotkeyConfig,
    action_id: &str,
    shortcut: String,
) -> bool {
    match normalize_action_id(action_id) {
        Some("preset_picker") => {
            config.preset_picker = shortcut;
            true
        }
        Some("paste_last_safe") => {
            config.paste_last_safe = shortcut;
            true
        }
        _ => false,
    }
}

fn preview_action_shortcut(requested_shortcut: &str) -> Option<String> {
    let canonical = canonicalize_shortcut(requested_shortcut)?;
    let normalized = normalize_shortcut(&canonical);
    if matches!(normalized.as_str(), "escape" | "alt+space") {
        return None;
    }
    native_shortcut_chord_from_request(&canonical).map(|_| canonical)
}

fn preview_action_hotkey_registration_request<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    action_id: &str,
    requested_shortcut: &str,
) -> DesktopControlActionHotkeyRegistrationPreview {
    let effective_config = read_action_hotkey_preferences(app).unwrap_or_else(|error| {
        eprintln!("[dictation-tauri][hotkey] action preferences unavailable: {error}");
        default_action_hotkey_config()
    });
    let normalized_shortcut = canonicalize_shortcut(requested_shortcut)
        .unwrap_or_else(|| normalize_shortcut(requested_shortcut));
    let action = normalize_action_id(action_id);
    let candidate = preview_action_shortcut(requested_shortcut);
    let reason = if action.is_none() {
        Some("unknown_action_hotkey")
    } else if candidate.is_none() {
        Some("unsupported_shortcut")
    } else if normalized_shortcut == current_desktop_control_hotkey_config().shortcut {
        Some("shortcut_conflicts_with_dictation_key")
    } else {
        let other_conflict = match action.unwrap() {
            "preset_picker" => normalize_shortcut(&effective_config.paste_last_safe),
            "paste_last_safe" => normalize_shortcut(&effective_config.preset_picker),
            _ => String::new(),
        };
        if normalize_shortcut(&normalized_shortcut) == other_conflict {
            Some("shortcut_conflicts_with_action")
        } else {
            None
        }
    };

    DesktopControlActionHotkeyRegistrationPreview {
        action_id: normalize_action_id(action_id)
            .unwrap_or(action_id)
            .to_string(),
        requested_shortcut: requested_shortcut.to_string(),
        normalized_shortcut,
        can_apply: reason.is_none(),
        reason,
        effective_config,
    }
}

fn apply_action_hotkey_registration_request<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    action_id: &str,
    requested_shortcut: &str,
) -> DesktopControlActionHotkeyRegistrationApplyResult {
    let preview = preview_action_hotkey_registration_request(app, action_id, requested_shortcut);
    if !preview.can_apply {
        return DesktopControlActionHotkeyRegistrationApplyResult {
            effective_config: preview.effective_config.clone(),
            preview,
            preference_persisted: false,
            persistence_error: None,
            error: Some("shortcut_not_applicable".to_string()),
        };
    }

    let mut next_config = preview.effective_config.clone();
    if !set_shortcut_for_action(
        &mut next_config,
        action_id,
        preview.normalized_shortcut.clone(),
    ) {
        return DesktopControlActionHotkeyRegistrationApplyResult {
            effective_config: preview.effective_config.clone(),
            preview,
            preference_persisted: false,
            persistence_error: None,
            error: Some("unknown_action_hotkey".to_string()),
        };
    }

    apply_action_hotkeys_to_runtime(&next_config);
    let persistence_error = write_action_hotkey_preferences(app, &next_config)
        .err()
        .map(|error| error.to_string());
    DesktopControlActionHotkeyRegistrationApplyResult {
        preview,
        effective_config: next_config,
        preference_persisted: persistence_error.is_none(),
        persistence_error,
        error: None,
    }
}

fn apply_action_hotkeys_to_runtime(config: &DesktopControlActionHotkeyConfig) {
    if let Some(chord) = native_shortcut_chord_from_request(&config.preset_picker) {
        native_alt_space::set_preset_picker_shortcut(chord);
    }
    if let Some(chord) = native_shortcut_chord_from_request(&config.paste_last_safe) {
        native_paste_last::set_paste_last_shortcut(chord);
    }
}

fn native_shortcut_chord_from_request(requested: &str) -> Option<NativeShortcutChord> {
    let canonical = canonicalize_shortcut(requested)?;
    let parsed = canonical.parse::<Shortcut>().ok()?;
    if parsed.mods == Modifiers::empty() || parsed.mods.intersects(Modifiers::SUPER) {
        return None;
    }
    let key = canonical.split('+').next_back()?;
    let key_vk = virtual_key_from_canonical_key(key)?;
    let label = leak_shortcut(canonical);
    Some(NativeShortcutChord {
        label,
        ctrl: parsed.mods.intersects(Modifiers::CONTROL),
        alt: parsed.mods.intersects(Modifiers::ALT),
        shift: parsed.mods.intersects(Modifiers::SHIFT),
        key_vk,
    })
}

fn virtual_key_from_canonical_key(key: &str) -> Option<u32> {
    if key.len() == 1 {
        let ch = key.as_bytes()[0];
        if ch.is_ascii_uppercase() || ch.is_ascii_digit() {
            return Some(ch as u32);
        }
    }
    match key {
        "Space" => Some(0x20),
        "F1" => Some(0x70),
        "F2" => Some(0x71),
        "F3" => Some(0x72),
        "F4" => Some(0x73),
        "F5" => Some(0x74),
        "F6" => Some(0x75),
        "F7" => Some(0x76),
        "F8" => Some(0x77),
        "F9" => Some(0x78),
        "F10" => Some(0x79),
        "F11" => Some(0x7A),
        "F12" => Some(0x7B),
        _ => None,
    }
}

fn is_supported_persistent_shortcut(shortcut: &str) -> bool {
    effective_hotkey_from_request(shortcut, true).is_some()
}

pub fn resolve_effective_dictation_hotkey(
    requested: Option<&str>,
    alt_space_allowed: bool,
) -> EffectiveDictationHotkey {
    match requested {
        None | Some("") if cfg!(windows) => alt_space_hotkey(None),
        None | Some("") => fallback_hotkey(None),
        Some(value) => {
            effective_hotkey_from_request(value, alt_space_allowed).unwrap_or_else(|| {
                let requested_shortcut = canonicalize_shortcut(value)
                    .map(leak_shortcut)
                    .or(Some("unsupported"));
                EffectiveDictationHotkey {
                    requested_shortcut,
                    fallback_reason: Some("unsupported_shortcut"),
                    ..fallback_hotkey(None)
                }
            })
        }
    }
}

fn fallback_hotkey(requested_shortcut: Option<&'static str>) -> EffectiveDictationHotkey {
    EffectiveDictationHotkey {
        shortcut: FALLBACK_DESKTOP_CONTROL_HOTKEY,
        modifiers: Modifiers::CONTROL | Modifiers::SHIFT,
        code: Code::F9,
        backend: HotkeyBackend::TauriGlobalShortcut,
        requested_shortcut,
        alt_space_requested: false,
        alt_space_enabled: false,
        fallback_reason: None,
    }
}

fn alt_space_hotkey(requested_shortcut: Option<&'static str>) -> EffectiveDictationHotkey {
    EffectiveDictationHotkey {
        shortcut: ALT_SPACE_DESKTOP_CONTROL_HOTKEY,
        modifiers: Modifiers::ALT,
        code: Code::Space,
        backend: HotkeyBackend::WindowsLowLevelHook,
        requested_shortcut,
        alt_space_requested: true,
        alt_space_enabled: true,
        fallback_reason: None,
    }
}

fn tauri_global_hotkey(
    shortcut: &'static str,
    modifiers: Modifiers,
    code: Code,
    requested_shortcut: Option<&'static str>,
) -> EffectiveDictationHotkey {
    EffectiveDictationHotkey {
        shortcut,
        modifiers,
        code,
        backend: HotkeyBackend::TauriGlobalShortcut,
        requested_shortcut,
        alt_space_requested: false,
        alt_space_enabled: false,
        fallback_reason: None,
    }
}

fn effective_hotkey_from_request(
    requested: &str,
    alt_space_allowed: bool,
) -> Option<EffectiveDictationHotkey> {
    let normalized = normalize_shortcut(requested);
    if normalized.is_empty() {
        return None;
    }

    if normalized == "alt+space" {
        if alt_space_allowed && cfg!(windows) {
            return Some(alt_space_hotkey(Some(ALT_SPACE_DESKTOP_CONTROL_HOTKEY)));
        }
        if alt_space_allowed {
            return Some(EffectiveDictationHotkey {
                requested_shortcut: Some(ALT_SPACE_DESKTOP_CONTROL_HOTKEY),
                alt_space_requested: true,
                alt_space_enabled: false,
                fallback_reason: Some("alt_space_native_hook_windows_only"),
                ..fallback_hotkey(None)
            });
        }
        return Some(EffectiveDictationHotkey {
            requested_shortcut: Some(ALT_SPACE_DESKTOP_CONTROL_HOTKEY),
            alt_space_requested: true,
            alt_space_enabled: false,
            fallback_reason: Some("alt_space_requires_explicit_gate"),
            ..fallback_hotkey(None)
        });
    }

    let canonical = canonicalize_shortcut(requested)?;
    if is_reserved_shortcut(&canonical) {
        return None;
    }
    let parsed = canonical.parse::<Shortcut>().ok()?;
    if parsed.mods == Modifiers::empty() || parsed.mods.intersects(Modifiers::SUPER) {
        return None;
    }

    let shortcut = leak_shortcut(canonical);
    Some(tauri_global_hotkey(
        shortcut,
        parsed.mods,
        parsed.key,
        Some(shortcut),
    ))
}

fn is_reserved_shortcut(shortcut: &str) -> bool {
    matches!(
        normalize_shortcut(shortcut).as_str(),
        "escape" | "alt+shift+x" | "alt+q"
    )
}

fn leak_shortcut(shortcut: String) -> &'static str {
    match shortcut.as_str() {
        DEFAULT_DESKTOP_CONTROL_HOTKEY => DEFAULT_DESKTOP_CONTROL_HOTKEY,
        FALLBACK_DESKTOP_CONTROL_HOTKEY => FALLBACK_DESKTOP_CONTROL_HOTKEY,
        ALT_3_DESKTOP_CONTROL_HOTKEY => ALT_3_DESKTOP_CONTROL_HOTKEY,
        PASTE_LAST_SAFE_HOTKEY => PASTE_LAST_SAFE_HOTKEY,
        _ => Box::leak(shortcut.into_boxed_str()),
    }
}

fn canonicalize_shortcut(value: &str) -> Option<String> {
    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut key: Option<String> = None;

    for raw in value.split('+') {
        let part = raw.trim();
        if part.is_empty() {
            return None;
        }
        match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => ctrl = true,
            "alt" | "option" => alt = true,
            "shift" => shift = true,
            "cmd" | "command" | "meta" | "super" | "win" | "windows" => return None,
            other => {
                if key.is_some() {
                    return None;
                }
                key = Some(canonical_key(other));
            }
        }
    }

    let key = key?;
    if !ctrl && !alt && !shift {
        return None;
    }

    let mut parts = Vec::new();
    if ctrl {
        parts.push("Ctrl".to_string());
    }
    if alt {
        parts.push("Alt".to_string());
    }
    if shift {
        parts.push("Shift".to_string());
    }
    parts.push(key);
    Some(parts.join("+"))
}

fn canonical_key(key: &str) -> String {
    match key {
        " " | "space" => "Space".to_string(),
        "esc" | "escape" => "Escape".to_string(),
        value if value.len() == 1 => value.to_ascii_uppercase(),
        value if value.starts_with('f') && value[1..].chars().all(|ch| ch.is_ascii_digit()) => {
            value.to_ascii_uppercase()
        }
        value => {
            let mut chars = value.chars();
            match chars.next() {
                Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
                None => String::new(),
            }
        }
    }
}

fn normalize_shortcut(value: &str) -> String {
    value
        .split('+')
        .map(|part| part.trim().to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join("+")
}

pub fn preview_hotkey_registration_request(
    requested_shortcut: &str,
) -> DesktopControlHotkeyRegistrationPreview {
    let normalized_shortcut = canonicalize_shortcut(requested_shortcut)
        .unwrap_or_else(|| normalize_shortcut(requested_shortcut));
    let target_hotkey = effective_hotkey_from_request(requested_shortcut, true);
    let reason = if normalized_shortcut.is_empty() {
        Some("empty_shortcut")
    } else {
        target_hotkey
            .as_ref()
            .and_then(|hotkey| hotkey.fallback_reason)
            .or_else(|| {
                if target_hotkey.is_none() {
                    Some("unsupported_shortcut")
                } else {
                    None
                }
            })
    };

    DesktopControlHotkeyRegistrationPreview {
        requested_shortcut: requested_shortcut.to_string(),
        normalized_shortcut,
        can_apply: target_hotkey.is_some() && reason.is_none(),
        reason,
        target_config: target_hotkey.map(desktop_control_hotkey_config),
    }
}

pub fn apply_hotkey_registration_request<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    requested_shortcut: &str,
) -> DesktopControlHotkeyRegistrationApplyResult {
    let preview = preview_hotkey_registration_request(requested_shortcut);
    let previous_hotkey = current_effective_hotkey();
    let previous_config = desktop_control_hotkey_config(previous_hotkey);
    let Some(target_config) = preview.target_config.clone() else {
        return DesktopControlHotkeyRegistrationApplyResult {
            preview,
            previous_config: previous_config.clone(),
            effective_config: previous_config,
            changed: false,
            rolled_back: false,
            preference_persisted: false,
            persistence_error: None,
            error: Some("shortcut_not_applicable".to_string()),
        };
    };

    if !preview.can_apply {
        return DesktopControlHotkeyRegistrationApplyResult {
            preview,
            previous_config: previous_config.clone(),
            effective_config: previous_config,
            changed: false,
            rolled_back: false,
            preference_persisted: false,
            persistence_error: None,
            error: Some("shortcut_not_applicable".to_string()),
        };
    }

    let Some(target_hotkey) = effective_hotkey_from_request(target_config.shortcut, true) else {
        return DesktopControlHotkeyRegistrationApplyResult {
            preview,
            previous_config: previous_config.clone(),
            effective_config: previous_config,
            changed: false,
            rolled_back: false,
            preference_persisted: false,
            persistence_error: None,
            error: Some("shortcut_not_applicable".to_string()),
        };
    };

    if previous_hotkey.shortcut == target_hotkey.shortcut
        && previous_hotkey.backend == target_hotkey.backend
    {
        if let Err(error) = verify_effective_hotkey(app, target_hotkey) {
            return DesktopControlHotkeyRegistrationApplyResult {
                preview,
                previous_config: previous_config.clone(),
                effective_config: previous_config,
                changed: false,
                rolled_back: false,
                preference_persisted: false,
                persistence_error: None,
                error: Some(error),
            };
        }

        remember_current_hotkey(target_hotkey);
        let persistence_error = write_hotkey_preference(app, target_hotkey.shortcut)
            .err()
            .map(|error| error.to_string());
        return DesktopControlHotkeyRegistrationApplyResult {
            preview,
            previous_config,
            effective_config: desktop_control_hotkey_config(target_hotkey),
            changed: false,
            rolled_back: false,
            preference_persisted: persistence_error.is_none(),
            persistence_error,
            error: None,
        };
    }

    match swap_registered_hotkey(app, previous_hotkey, target_hotkey) {
        Ok(()) => {
            remember_current_hotkey(target_hotkey);
            let persistence_error = write_hotkey_preference(app, target_hotkey.shortcut)
                .err()
                .map(|error| error.to_string());
            DesktopControlHotkeyRegistrationApplyResult {
                preview,
                previous_config,
                effective_config: desktop_control_hotkey_config(target_hotkey),
                changed: true,
                rolled_back: false,
                preference_persisted: persistence_error.is_none(),
                persistence_error,
                error: None,
            }
        }
        Err(error) => {
            let rollback_error = swap_registered_hotkey(app, target_hotkey, previous_hotkey).err();
            remember_current_hotkey(previous_hotkey);
            DesktopControlHotkeyRegistrationApplyResult {
                preview,
                previous_config: previous_config.clone(),
                effective_config: previous_config,
                changed: false,
                rolled_back: true,
                preference_persisted: false,
                persistence_error: None,
                error: Some(match rollback_error {
                    Some(rollback) => format!("{error}; rollback_failed: {rollback}"),
                    None => error,
                }),
            }
        }
    }
}

#[cfg(desktop)]
fn swap_registered_hotkey<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    previous: EffectiveDictationHotkey,
    next: EffectiveDictationHotkey,
) -> Result<(), String> {
    unregister_effective_hotkey(app, previous)?;
    register_effective_hotkey(app, next)?;
    verify_effective_hotkey(app, next)
}

#[cfg(not(desktop))]
fn swap_registered_hotkey<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _previous: EffectiveDictationHotkey,
    _next: EffectiveDictationHotkey,
) -> Result<(), String> {
    Err("desktop_hotkey_registration_unavailable".to_string())
}

pub fn desktop_control_hotkey_pressed_payload(
    hotkey: EffectiveDictationHotkey,
) -> DesktopControlHotkeyPayload {
    desktop_control_hotkey_payload("pressed", hotkey)
}

pub fn desktop_control_hotkey_released_payload(
    hotkey: EffectiveDictationHotkey,
) -> DesktopControlHotkeyPayload {
    desktop_control_hotkey_payload("released", hotkey)
}

pub fn desktop_control_escape_cancel_payload() -> DesktopControlHotkeyPayload {
    DesktopControlHotkeyPayload {
        source: "global_hotkey",
        action: "cancel",
        shortcut: "Escape",
        target_snapshot: None,
    }
}

pub fn desktop_control_hotkey_capture_payload(
    shortcut: &'static str,
) -> DesktopControlHotkeyCapturePayload {
    DesktopControlHotkeyCapturePayload {
        source: "host_capture",
        shortcut,
    }
}

fn desktop_control_hotkey_payload(
    action: &'static str,
    hotkey: EffectiveDictationHotkey,
) -> DesktopControlHotkeyPayload {
    DesktopControlHotkeyPayload {
        source: "global_hotkey",
        action,
        shortcut: hotkey.shortcut,
        target_snapshot: None,
    }
}

#[cfg(desktop)]
fn register_effective_hotkey<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    hotkey: EffectiveDictationHotkey,
) -> Result<(), String> {
    match hotkey.backend {
        HotkeyBackend::WindowsLowLevelHook => {
            native_alt_space::set_alt_space_enabled(true);
            Ok(())
        }
        HotkeyBackend::TauriGlobalShortcut => {
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            app.global_shortcut()
                .register(hotkey.shortcut)
                .map_err(|error| error.to_string())?;
            eprintln!(
                "[dictation-tauri][hotkey] registered global shortcut={}",
                hotkey.shortcut
            );
            Ok(())
        }
    }
}

#[cfg(desktop)]
fn unregister_effective_hotkey<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    hotkey: EffectiveDictationHotkey,
) -> Result<(), String> {
    match hotkey.backend {
        HotkeyBackend::WindowsLowLevelHook => {
            native_alt_space::set_alt_space_enabled(false);
            Ok(())
        }
        HotkeyBackend::TauriGlobalShortcut => {
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            if app.global_shortcut().is_registered(hotkey.shortcut) {
                app.global_shortcut()
                    .unregister(hotkey.shortcut)
                    .map_err(|error| error.to_string())?;
            }
            Ok(())
        }
    }
}

#[cfg(desktop)]
fn verify_effective_hotkey<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    hotkey: EffectiveDictationHotkey,
) -> Result<(), String> {
    match hotkey.backend {
        HotkeyBackend::WindowsLowLevelHook => {
            if native_alt_space::is_alt_space_enabled() {
                Ok(())
            } else {
                Err("alt_space_hook_not_enabled".to_string())
            }
        }
        HotkeyBackend::TauriGlobalShortcut => {
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            if app.global_shortcut().is_registered(hotkey.shortcut) {
                Ok(())
            } else {
                Err("shortcut_not_registered_after_swap".to_string())
            }
        }
    }
}

#[cfg(desktop)]
pub fn register_desktop_control_hotkey<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::ShortcutState;

    let hotkey = resolve_effective_dictation_hotkey_from_app(app);
    eprintln!(
        "[dictation-tauri][hotkey] effective shortcut={} backend={:?} requested={:?} fallback={:?}",
        hotkey.shortcut, hotkey.backend, hotkey.requested_shortcut, hotkey.fallback_reason
    );
    remember_current_hotkey(hotkey);
    let action_hotkeys = read_action_hotkey_preferences(app).unwrap_or_else(|error| {
        eprintln!("[dictation-tauri][hotkey] action preferences unavailable: {error}");
        default_action_hotkey_config()
    });
    apply_action_hotkeys_to_runtime(&action_hotkeys);
    eprintln!(
        "[dictation-tauri][hotkey] action shortcuts preset_picker={} paste_last_safe={}",
        action_hotkeys.preset_picker, action_hotkeys.paste_last_safe
    );
    native_escape_cancel::register_escape_cancel_hook(app)?;
    native_paste_last::register_paste_last_hook(app, PASTE_LAST_SAFE_HOTKEY)?;
    native_alt_space::register_alt_space_hook(
        app,
        alt_space_hotkey(Some(ALT_SPACE_DESKTOP_CONTROL_HOTKEY)),
    )?;
    native_alt_space::set_alt_space_enabled(hotkey.backend == HotkeyBackend::WindowsLowLevelHook);

    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if shortcut.matches(Modifiers::ALT, Code::KeyQ) {
                    if event.state == ShortcutState::Pressed {
                        emit_preset_picker_hotkey_payload(app);
                    }
                    return;
                }

                let active_hotkey = current_effective_hotkey();
                if !shortcut.matches(active_hotkey.modifiers, active_hotkey.code) {
                    eprintln!(
                        "[dictation-tauri][hotkey] ignored shortcut event shortcut={} active={}",
                        shortcut, active_hotkey.shortcut
                    );
                    return;
                }

                eprintln!(
                    "[dictation-tauri][hotkey] event shortcut={} state={:?}",
                    active_hotkey.shortcut, event.state
                );

                let payload = if event.state == ShortcutState::Pressed {
                    Some(desktop_control_hotkey_pressed_payload(active_hotkey))
                } else if event.state == ShortcutState::Released {
                    Some(desktop_control_hotkey_released_payload(active_hotkey))
                } else {
                    None
                };

                if let Some(mut payload) = payload {
                    if event.state == ShortcutState::Pressed {
                        payload.target_snapshot =
                            crate::desktop_delivery::capture_desktop_delivery_target().ok();
                    }
                    emit_desktop_control_hotkey_payload(app, payload);
                }
            })
            .build(),
    )?;

    if hotkey.backend == HotkeyBackend::TauriGlobalShortcut {
        register_effective_hotkey(app, hotkey)?;
    }

    if let Err(error) = register_preset_picker_hotkey(app) {
        eprintln!("[dictation-tauri][hotkey] preset picker registration failed: {error}");
    }

    Ok(())
}

#[cfg(all(desktop, not(windows)))]
fn register_preset_picker_hotkey<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    if !app.global_shortcut().is_registered(PRESET_PICKER_HOTKEY) {
        app.global_shortcut()
            .register(PRESET_PICKER_HOTKEY)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(all(desktop, windows))]
fn register_preset_picker_hotkey<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    let _shortcut = PRESET_PICKER_HOTKEY;
    // Windows routes Alt+Q through the low-level keyboard hook below so the
    // keystroke is swallowed before menu-driven apps like Notepad enter Alt
    // menu mode. The Tauri global-shortcut backend observes Alt+Q but does not
    // reliably suppress the original key sequence for the foreground target.
    Ok(())
}

fn emit_preset_picker_hotkey_payload<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let target_snapshot = crate::desktop_delivery::capture_desktop_delivery_target().ok();
    let payload = HostCommandPayload {
        source: "global_hotkey",
        command: "show_preset_picker",
        preset_id: None,
        chord_key: None,
        target_snapshot,
    };
    let _ = app.emit_to(
        crate::dock_shell::DOCK_WINDOW_LABEL,
        HOST_COMMAND_EVENT,
        payload,
    );
}

fn emit_preset_picker_chord_payload<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    chord_key: &'static str,
) {
    let target_snapshot = crate::desktop_delivery::capture_desktop_delivery_target().ok();
    let payload = HostCommandPayload {
        source: "global_hotkey",
        command: "run_preset_picker_chord",
        preset_id: None,
        chord_key: Some(chord_key),
        target_snapshot,
    };
    let _ = app.emit_to(
        crate::dock_shell::DOCK_WINDOW_LABEL,
        HOST_COMMAND_EVENT,
        payload,
    );
}

fn emit_desktop_control_hotkey_payload<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    payload: DesktopControlHotkeyPayload,
) {
    if !HOTKEY_LISTENER_READY.load(Ordering::SeqCst) {
        if let Ok(mut pending) = PENDING_HOTKEY_EVENTS
            .get_or_init(|| Mutex::new(Vec::new()))
            .lock()
        {
            if pending.len() >= 8 {
                pending.remove(0);
            }
            pending.push(payload.clone());
        }
        eprintln!(
            "[dictation-tauri][hotkey] queued pre-listener event action={} shortcut={}",
            payload.action, payload.shortcut
        );
        if payload.action == "pressed" {
            schedule_wake_dock_window_for_hotkey(app);
        }
    }

    if let Err(error) = app.emit(DESKTOP_CONTROL_HOTKEY_EVENT, payload) {
        eprintln!("[dictation-tauri][hotkey] emit failed: {error}");
    }
}

fn schedule_wake_dock_window_for_hotkey<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let app = app.clone();
    if let Err(error) = app
        .clone()
        .run_on_main_thread(move || wake_dock_window_for_hotkey(&app))
    {
        eprintln!("[dictation-tauri][hotkey] wake scheduling failed: {error}");
    }
}

fn wake_dock_window_for_hotkey<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(crate::dock_shell::DOCK_WINDOW_LABEL) {
        if let Err(error) = focus_dock_window_for_hotkey(&window) {
            eprintln!("[dictation-tauri][hotkey] wake focus failed: {error}");
        } else {
            eprintln!("[dictation-tauri][hotkey] woke dock window for pending listener");
        }
    }
}

#[cfg(windows)]
fn focus_dock_window_for_hotkey<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    use windows_sys::Win32::{
        Foundation::HWND,
        System::Threading::{AttachThreadInput, GetCurrentThreadId},
        UI::WindowsAndMessaging::{
            BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
            ShowWindow, SW_SHOW,
        },
    };

    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    let raw_hwnd = hwnd.0 as HWND;

    unsafe {
        ShowWindow(raw_hwnd, SW_SHOW);
        let current_thread_id = GetCurrentThreadId();
        let target_thread_id = GetWindowThreadProcessId(raw_hwnd, std::ptr::null_mut());
        let foreground_hwnd = GetForegroundWindow();
        let foreground_thread_id = if foreground_hwnd.is_null() {
            0
        } else {
            GetWindowThreadProcessId(foreground_hwnd, std::ptr::null_mut())
        };
        let attached_target = target_thread_id != 0
            && target_thread_id != current_thread_id
            && AttachThreadInput(current_thread_id, target_thread_id, 1) != 0;
        let attached_foreground = foreground_thread_id != 0
            && foreground_thread_id != current_thread_id
            && foreground_thread_id != target_thread_id
            && AttachThreadInput(current_thread_id, foreground_thread_id, 1) != 0;

        BringWindowToTop(raw_hwnd);
        SetForegroundWindow(raw_hwnd);

        if attached_foreground {
            AttachThreadInput(current_thread_id, foreground_thread_id, 0);
        }
        if attached_target {
            AttachThreadInput(current_thread_id, target_thread_id, 0);
        }
    }

    Ok(())
}

#[cfg(not(windows))]
fn focus_dock_window_for_hotkey<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    window.set_focus().map_err(|error| error.to_string())
}

#[cfg(not(desktop))]
pub fn register_desktop_control_hotkey<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg(windows)]
mod native_escape_cancel {
    use super::{desktop_control_escape_cancel_payload, DESKTOP_CONTROL_HOTKEY_EVENT};
    use std::error::Error;
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, Mutex, OnceLock};
    use tauri::Emitter;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_ESCAPE;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT, MSG,
        WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    static EVENT_SENDER: OnceLock<Mutex<Option<mpsc::Sender<()>>>> = OnceLock::new();
    static ESCAPE_CANCEL_ENABLED: AtomicBool = AtomicBool::new(false);
    static ESCAPE_DOWN: AtomicBool = AtomicBool::new(false);

    pub fn set_escape_cancel_enabled(enabled: bool) -> bool {
        ESCAPE_CANCEL_ENABLED.store(enabled, Ordering::SeqCst);
        if !enabled {
            ESCAPE_DOWN.store(false, Ordering::SeqCst);
        }
        enabled
    }

    pub fn register_escape_cancel_hook<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
    ) -> Result<(), Box<dyn Error>> {
        let (tx, rx) = mpsc::channel::<()>();
        let sender = EVENT_SENDER.get_or_init(|| Mutex::new(None));
        *sender
            .lock()
            .map_err(|_| "escape cancel hook sender poisoned")? = Some(tx);

        let app_handle = app.clone();
        std::thread::spawn(move || {
            while rx.recv().is_ok() {
                let _ = app_handle.emit(
                    DESKTOP_CONTROL_HOTKEY_EVENT,
                    desktop_control_escape_cancel_payload(),
                );
            }
        });

        std::thread::spawn(move || unsafe {
            let module = GetModuleHandleW(null_mut());
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0);
            if hook.is_null() {
                return;
            }

            let mut message: MSG = std::mem::zeroed();
            while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {}
        });

        Ok(())
    }

    unsafe extern "system" fn keyboard_proc(
        code: i32,
        w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        if code == HC_ACTION as i32 {
            let event = w_param as u32;
            let is_down = event == WM_KEYDOWN || event == WM_SYSKEYDOWN;
            let is_up = event == WM_KEYUP || event == WM_SYSKEYUP;
            let keyboard = &*(l_param as *const KBDLLHOOKSTRUCT);
            let is_escape = keyboard.vkCode == VK_ESCAPE as u32;
            let enabled = ESCAPE_CANCEL_ENABLED.load(Ordering::SeqCst);

            if is_escape && is_down && enabled {
                if !ESCAPE_DOWN.swap(true, Ordering::SeqCst) {
                    send_event();
                }
                return 1;
            }

            if is_escape && is_up && ESCAPE_DOWN.swap(false, Ordering::SeqCst) && enabled {
                return 1;
            }
        }

        CallNextHookEx(null_mut(), code, w_param, l_param)
    }

    fn send_event() {
        if let Some(lock) = EVENT_SENDER.get() {
            if let Ok(guard) = lock.lock() {
                if let Some(sender) = guard.as_ref() {
                    let _ = sender.send(());
                }
            }
        }
    }
}

#[cfg(not(windows))]
mod native_escape_cancel {
    use std::error::Error;

    pub fn set_escape_cancel_enabled(enabled: bool) -> bool {
        enabled
    }

    pub fn register_escape_cancel_hook<R: tauri::Runtime>(
        _app: &tauri::AppHandle<R>,
    ) -> Result<(), Box<dyn Error>> {
        Ok(())
    }
}

#[cfg(windows)]
mod native_paste_last {
    use super::{NativeShortcutChord, PASTE_LAST_SAFE_HOTKEY};
    use crate::{
        desktop_delivery::{self, DesktopDeliveryTarget},
        tray::{HostCommandPayload, HOST_COMMAND_EVENT},
    };
    use std::error::Error;
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, Mutex, OnceLock};
    use tauri::Emitter;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, GetAsyncKeyState, KEYEVENTF_KEYUP, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN,
        VK_SHIFT,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT, MSG,
        WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    static EVENT_SENDER: OnceLock<Mutex<Option<mpsc::Sender<Option<DesktopDeliveryTarget>>>>> =
        OnceLock::new();
    static PASTE_LAST_SHORTCUT: Mutex<NativeShortcutChord> = Mutex::new(NativeShortcutChord {
        label: PASTE_LAST_SAFE_HOTKEY,
        ctrl: false,
        alt: true,
        shift: true,
        key_vk: 0x58,
    });
    static SHORTCUT_DOWN: AtomicBool = AtomicBool::new(false);
    static PENDING_TARGET: OnceLock<Mutex<Option<DesktopDeliveryTarget>>> = OnceLock::new();

    pub fn set_paste_last_shortcut(shortcut: NativeShortcutChord) -> bool {
        if let Ok(mut guard) = PASTE_LAST_SHORTCUT.lock() {
            *guard = shortcut;
        }
        SHORTCUT_DOWN.store(false, Ordering::SeqCst);
        true
    }

    pub fn register_paste_last_hook<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        _shortcut_label: &'static str,
    ) -> Result<(), Box<dyn Error>> {
        let (tx, rx) = mpsc::channel::<Option<DesktopDeliveryTarget>>();
        let sender = EVENT_SENDER.get_or_init(|| Mutex::new(None));
        *sender
            .lock()
            .map_err(|_| "paste-last hook sender poisoned")? = Some(tx);

        let app_handle = app.clone();
        std::thread::spawn(move || {
            while let Ok(target_snapshot) = rx.recv() {
                let _ = app_handle.emit(
                    HOST_COMMAND_EVENT,
                    HostCommandPayload {
                        source: "global_hotkey",
                        command: "paste_last_safe",
                        preset_id: None,
                        chord_key: None,
                        target_snapshot,
                    },
                );
            }
        });

        std::thread::spawn(move || unsafe {
            let module = GetModuleHandleW(null_mut());
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0);
            if hook.is_null() {
                return;
            }

            let mut message: MSG = std::mem::zeroed();
            while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {}
        });

        Ok(())
    }

    unsafe extern "system" fn keyboard_proc(
        code: i32,
        w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        if code == HC_ACTION as i32 {
            let event = w_param as u32;
            let is_down = event == WM_KEYDOWN || event == WM_SYSKEYDOWN;
            let is_up = event == WM_KEYUP || event == WM_SYSKEYUP;
            let keyboard = &*(l_param as *const KBDLLHOOKSTRUCT);
            let shortcut = current_shortcut();
            let is_shortcut_key = keyboard.vkCode == shortcut.key_vk;

            if is_shortcut_key && is_down && exact_shortcut_combo(shortcut) {
                let target = desktop_delivery::capture_desktop_delivery_target().ok();
                if let Ok(mut pending) = PENDING_TARGET.get_or_init(|| Mutex::new(None)).lock() {
                    *pending = target;
                }
                SHORTCUT_DOWN.store(true, Ordering::SeqCst);
                send_event_immediately_after_releasing_modifiers(shortcut);
                return 1;
            }

            if is_shortcut_key && is_up && SHORTCUT_DOWN.swap(false, Ordering::SeqCst) {
                return 1;
            }
        }

        CallNextHookEx(null_mut(), code, w_param, l_param)
    }

    fn current_shortcut() -> NativeShortcutChord {
        PASTE_LAST_SHORTCUT
            .lock()
            .map(|guard| *guard)
            .unwrap_or(NativeShortcutChord {
                label: PASTE_LAST_SAFE_HOTKEY,
                ctrl: false,
                alt: true,
                shift: true,
                key_vk: 0x58,
            })
    }

    fn exact_shortcut_combo(shortcut: NativeShortcutChord) -> bool {
        let alt_down = is_key_down(VK_MENU as i32);
        let shift_down = is_key_down(VK_SHIFT as i32);
        let ctrl_down = is_key_down(VK_CONTROL as i32);
        let win_down = is_key_down(VK_LWIN as i32) || is_key_down(VK_RWIN as i32);

        alt_down == shortcut.alt
            && shift_down == shortcut.shift
            && ctrl_down == shortcut.ctrl
            && !win_down
    }

    fn is_key_down(vk: i32) -> bool {
        unsafe { (GetAsyncKeyState(vk) & 0x8000u16 as i16) != 0 }
    }

    fn send_event_immediately_after_releasing_modifiers(shortcut: NativeShortcutChord) {
        std::thread::spawn(move || {
            synthesize_modifier_up(shortcut);
            std::thread::sleep(std::time::Duration::from_millis(20));
            send_event();
        });
    }

    fn synthesize_modifier_up(shortcut: NativeShortcutChord) {
        unsafe {
            if shortcut.shift {
                keybd_event(VK_SHIFT as u8, 0, KEYEVENTF_KEYUP, 0);
            }
            if shortcut.alt {
                keybd_event(VK_MENU as u8, 0, KEYEVENTF_KEYUP, 0);
            }
            if shortcut.ctrl {
                keybd_event(VK_CONTROL as u8, 0, KEYEVENTF_KEYUP, 0);
            }
        }
    }

    fn send_event() {
        let target_snapshot = PENDING_TARGET
            .get_or_init(|| Mutex::new(None))
            .lock()
            .ok()
            .and_then(|mut pending| pending.take());
        if let Some(lock) = EVENT_SENDER.get() {
            if let Ok(guard) = lock.lock() {
                if let Some(sender) = guard.as_ref() {
                    let _ = sender.send(target_snapshot);
                }
            }
        }
    }
}

#[cfg(not(windows))]
mod native_paste_last {
    use super::NativeShortcutChord;
    use std::error::Error;

    pub fn set_paste_last_shortcut(_shortcut: NativeShortcutChord) -> bool {
        true
    }

    pub fn register_paste_last_hook<R: tauri::Runtime>(
        _app: &tauri::AppHandle<R>,
        _shortcut_label: &'static str,
    ) -> Result<(), Box<dyn Error>> {
        Ok(())
    }
}

#[cfg(windows)]
mod native_alt_space {
    use super::{
        desktop_control_hotkey_capture_payload, desktop_control_hotkey_pressed_payload,
        desktop_control_hotkey_released_payload, EffectiveDictationHotkey, NativeShortcutChord,
        ALT_SPACE_DESKTOP_CONTROL_HOTKEY, DESKTOP_CONTROL_HOTKEY_CAPTURE_EVENT,
        DESKTOP_CONTROL_HOTKEY_EVENT, PRESET_PICKER_HOTKEY,
    };
    use std::error::Error;
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, Mutex, OnceLock};
    use std::time::{Duration, Instant};
    use tauri::Emitter;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, GetAsyncKeyState, KEYEVENTF_KEYUP, VK_CONTROL, VK_LCONTROL, VK_LMENU,
        VK_LSHIFT, VK_LWIN, VK_MENU, VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT, VK_SPACE,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT, MSG,
        WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    #[derive(Clone, Copy, Debug)]
    enum NativeAltSpaceEvent {
        Pressed,
        Released,
        Capture(&'static str),
        PresetPicker,
        PresetPickerChord(&'static str),
    }

    const LLKHF_ALTDOWN: u32 = 0x20;
    const PRESET_CHORD_TIMEOUT: Duration = Duration::from_millis(2500);

    static EVENT_SENDER: OnceLock<Mutex<Option<mpsc::Sender<NativeAltSpaceEvent>>>> =
        OnceLock::new();
    static PRESET_CHORD_ARMED_AT: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
    static PRESET_PICKER_SHORTCUT: Mutex<NativeShortcutChord> = Mutex::new(NativeShortcutChord {
        label: PRESET_PICKER_HOTKEY,
        ctrl: false,
        alt: true,
        shift: false,
        key_vk: 0x51,
    });
    static ALT_SPACE_ENABLED: AtomicBool = AtomicBool::new(false);
    static ALT_SPACE_CAPTURE_ENABLED: AtomicBool = AtomicBool::new(false);
    static SPACE_DOWN: AtomicBool = AtomicBool::new(false);
    static CAPTURE_DOWN: AtomicBool = AtomicBool::new(false);
    static PRESET_PICKER_DOWN: AtomicBool = AtomicBool::new(false);
    static SUPPRESS_NEXT_ALT_UP: AtomicBool = AtomicBool::new(false);
    static SUPPRESS_NEXT_ALT_UP_ONLY: AtomicBool = AtomicBool::new(false);

    pub fn set_preset_picker_shortcut(shortcut: NativeShortcutChord) -> bool {
        if let Ok(mut guard) = PRESET_PICKER_SHORTCUT.lock() {
            *guard = shortcut;
        }
        PRESET_PICKER_DOWN.store(false, Ordering::SeqCst);
        true
    }

    pub fn set_alt_space_enabled(enabled: bool) -> bool {
        ALT_SPACE_ENABLED.store(enabled, Ordering::SeqCst);
        if !enabled {
            SPACE_DOWN.store(false, Ordering::SeqCst);
        }
        enabled
    }

    pub fn is_alt_space_enabled() -> bool {
        ALT_SPACE_ENABLED.load(Ordering::SeqCst)
    }

    pub fn set_alt_space_capture_enabled(enabled: bool) -> bool {
        ALT_SPACE_CAPTURE_ENABLED.store(enabled, Ordering::SeqCst);
        if !enabled {
            SPACE_DOWN.store(false, Ordering::SeqCst);
            CAPTURE_DOWN.store(false, Ordering::SeqCst);
        }
        enabled
    }

    pub fn register_alt_space_hook<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        hotkey: EffectiveDictationHotkey,
    ) -> Result<(), Box<dyn Error>> {
        let (tx, rx) = mpsc::channel::<NativeAltSpaceEvent>();
        let sender = EVENT_SENDER.get_or_init(|| Mutex::new(None));
        *sender
            .lock()
            .map_err(|_| "alt-space hook sender poisoned")? = Some(tx);

        let app_handle = app.clone();
        std::thread::spawn(move || {
            while let Ok(event) = rx.recv() {
                match event {
                    NativeAltSpaceEvent::Pressed => {
                        let _ = app_handle.emit(
                            DESKTOP_CONTROL_HOTKEY_EVENT,
                            desktop_control_hotkey_pressed_payload(hotkey),
                        );
                    }
                    NativeAltSpaceEvent::Released => {
                        let _ = app_handle.emit(
                            DESKTOP_CONTROL_HOTKEY_EVENT,
                            desktop_control_hotkey_released_payload(hotkey),
                        );
                    }
                    NativeAltSpaceEvent::Capture(shortcut) => {
                        let _ = app_handle.emit(
                            DESKTOP_CONTROL_HOTKEY_CAPTURE_EVENT,
                            desktop_control_hotkey_capture_payload(shortcut),
                        );
                    }
                    NativeAltSpaceEvent::PresetPicker => {
                        super::emit_preset_picker_hotkey_payload(&app_handle);
                    }
                    NativeAltSpaceEvent::PresetPickerChord(chord_key) => {
                        super::emit_preset_picker_chord_payload(&app_handle, chord_key);
                    }
                }
            }
        });

        std::thread::spawn(move || unsafe {
            let module = GetModuleHandleW(null_mut());
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0);
            if hook.is_null() {
                return;
            }

            let mut message: MSG = std::mem::zeroed();
            while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {}
        });

        Ok(())
    }

    unsafe extern "system" fn keyboard_proc(
        code: i32,
        w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        if code == HC_ACTION as i32 {
            let event = w_param as u32;
            let is_down = event == WM_KEYDOWN || event == WM_SYSKEYDOWN;
            let is_up = event == WM_KEYUP || event == WM_SYSKEYUP;
            let keyboard = &*(l_param as *const KBDLLHOOKSTRUCT);
            let is_space = keyboard.vkCode == VK_SPACE as u32;
            let is_alt = keyboard.vkCode == VK_MENU as u32
                || keyboard.vkCode == 0xA4
                || keyboard.vkCode == 0xA5;
            let alt_down = (GetAsyncKeyState(VK_MENU as i32) & 0x8000u16 as i16) != 0
                || (keyboard.flags & LLKHF_ALTDOWN) != 0;
            let capture_enabled = ALT_SPACE_CAPTURE_ENABLED.load(Ordering::SeqCst);
            let hotkey_enabled = ALT_SPACE_ENABLED.load(Ordering::SeqCst);

            if capture_enabled {
                if is_down {
                    if let Some(shortcut) =
                        capture_shortcut_from_keyboard(keyboard.vkCode, alt_down)
                    {
                        if !CAPTURE_DOWN.swap(true, Ordering::SeqCst) {
                            send_event(NativeAltSpaceEvent::Capture(shortcut));
                        }
                        return 1;
                    }
                }
                if is_up && CAPTURE_DOWN.swap(false, Ordering::SeqCst) {
                    release_modifiers();
                    return 1;
                }
            }

            if is_down && !alt_down && !modifier_key_down() {
                if let Some(chord_key) = take_armed_preset_chord(keyboard.vkCode) {
                    send_event(NativeAltSpaceEvent::PresetPickerChord(chord_key));
                    return 1;
                }
            }

            let preset_shortcut = current_preset_picker_shortcut();
            let is_preset_key = keyboard.vkCode == preset_shortcut.key_vk;

            if is_preset_key && is_down && exact_shortcut_combo(preset_shortcut, alt_down) {
                if !PRESET_PICKER_DOWN.swap(true, Ordering::SeqCst) {
                    if preset_shortcut.alt {
                        // Delay opening Alt-based picker shortcuts until the matching Alt-up. Alt
                        // down has already reached the foreground app; if we focus the picker on
                        // key-down, Notepad/WinUI can still show Alt keytips when the gesture
                        // completes. Swallow the key and Alt-up, then open the picker.
                        SUPPRESS_NEXT_ALT_UP.store(true, Ordering::SeqCst);
                    } else {
                        release_modifiers();
                        arm_preset_chord();
                        send_event(NativeAltSpaceEvent::PresetPicker);
                    }
                }
                return 1;
            }

            if is_preset_key && is_up && PRESET_PICKER_DOWN.swap(false, Ordering::SeqCst) {
                return 1;
            }

            if is_alt && is_up && SUPPRESS_NEXT_ALT_UP_ONLY.swap(false, Ordering::SeqCst) {
                release_modifiers();
                return 1;
            }

            if is_alt && is_up && SUPPRESS_NEXT_ALT_UP.swap(false, Ordering::SeqCst) {
                release_modifiers();
                arm_preset_chord();
                send_event(NativeAltSpaceEvent::PresetPicker);
                return 1;
            }

            if is_space && alt_down && is_down && capture_enabled {
                if !SPACE_DOWN.swap(true, Ordering::SeqCst) {
                    SUPPRESS_NEXT_ALT_UP_ONLY.store(true, Ordering::SeqCst);
                    send_event(NativeAltSpaceEvent::Capture(
                        ALT_SPACE_DESKTOP_CONTROL_HOTKEY,
                    ));
                }
                return 1;
            }

            if is_space && is_up && SPACE_DOWN.swap(false, Ordering::SeqCst) && capture_enabled {
                return 1;
            }

            if is_space && alt_down && is_down && hotkey_enabled {
                if !SPACE_DOWN.swap(true, Ordering::SeqCst) {
                    SUPPRESS_NEXT_ALT_UP_ONLY.store(true, Ordering::SeqCst);
                    send_event(NativeAltSpaceEvent::Pressed);
                }
                return 1;
            }

            if is_space && is_up && SPACE_DOWN.swap(false, Ordering::SeqCst) && hotkey_enabled {
                send_event(NativeAltSpaceEvent::Released);
                return 1;
            }
        }

        CallNextHookEx(null_mut(), code, w_param, l_param)
    }

    fn arm_preset_chord() {
        if let Ok(mut guard) = PRESET_CHORD_ARMED_AT
            .get_or_init(|| Mutex::new(None))
            .lock()
        {
            *guard = Some(Instant::now());
        }
    }

    fn take_armed_preset_chord(vk_code: u32) -> Option<&'static str> {
        let mut guard = PRESET_CHORD_ARMED_AT
            .get_or_init(|| Mutex::new(None))
            .lock()
            .ok()?;
        let armed_at = guard.take()?;
        if armed_at.elapsed() > PRESET_CHORD_TIMEOUT {
            return None;
        }
        let chord_key = canonical_key_from_vk(vk_code)?;
        Some(super::leak_shortcut(chord_key))
    }

    fn modifier_key_down() -> bool {
        is_key_down(VK_SHIFT as i32)
            || is_key_down(VK_CONTROL as i32)
            || is_key_down(VK_LWIN as i32)
            || is_key_down(VK_RWIN as i32)
    }

    fn capture_shortcut_from_keyboard(vk_code: u32, alt_down: bool) -> Option<&'static str> {
        let shift_down = is_key_down(VK_SHIFT as i32);
        let ctrl_down = is_key_down(VK_CONTROL as i32);
        let win_down = is_key_down(VK_LWIN as i32) || is_key_down(VK_RWIN as i32);
        if win_down || (!ctrl_down && !alt_down && !shift_down) {
            return None;
        }
        let key = canonical_key_from_vk(vk_code)?;
        let mut parts = Vec::new();
        if ctrl_down {
            parts.push("Ctrl".to_string());
        }
        if alt_down {
            parts.push("Alt".to_string());
        }
        if shift_down {
            parts.push("Shift".to_string());
        }
        parts.push(key);
        Some(super::leak_shortcut(parts.join("+")))
    }

    fn canonical_key_from_vk(vk_code: u32) -> Option<String> {
        match vk_code {
            0x30..=0x39 | 0x41..=0x5A => Some(char::from_u32(vk_code)?.to_string()),
            0x70..=0x7B => Some(format!("F{}", vk_code - 0x6F)),
            value if value == VK_SPACE as u32 => Some("Space".to_string()),
            _ => None,
        }
    }

    fn current_preset_picker_shortcut() -> NativeShortcutChord {
        PRESET_PICKER_SHORTCUT
            .lock()
            .map(|guard| *guard)
            .unwrap_or(NativeShortcutChord {
                label: PRESET_PICKER_HOTKEY,
                ctrl: false,
                alt: true,
                shift: false,
                key_vk: 0x51,
            })
    }

    fn exact_shortcut_combo(shortcut: NativeShortcutChord, alt_down: bool) -> bool {
        let shift_down = is_key_down(VK_SHIFT as i32);
        let ctrl_down = is_key_down(VK_CONTROL as i32);
        let win_down = is_key_down(VK_LWIN as i32) || is_key_down(VK_RWIN as i32);

        alt_down == shortcut.alt
            && shift_down == shortcut.shift
            && ctrl_down == shortcut.ctrl
            && !win_down
    }

    fn is_key_down(vk: i32) -> bool {
        unsafe { (GetAsyncKeyState(vk) & 0x8000u16 as i16) != 0 }
    }

    fn send_event(event: NativeAltSpaceEvent) {
        if let Some(lock) = EVENT_SENDER.get() {
            if let Ok(guard) = lock.lock() {
                if let Some(sender) = guard.as_ref() {
                    let _ = sender.send(event);
                }
            }
        }
    }

    fn release_modifiers() {
        let modifiers = [
            VK_SHIFT,
            VK_LSHIFT,
            VK_RSHIFT,
            VK_CONTROL,
            VK_LCONTROL,
            VK_RCONTROL,
            VK_MENU,
            VK_LMENU,
            VK_RMENU,
            VK_LWIN,
            VK_RWIN,
        ];
        unsafe {
            for vk in modifiers {
                keybd_event(vk as u8, 0, KEYEVENTF_KEYUP, 0);
            }
        }
    }
}

#[cfg(not(windows))]
mod native_alt_space {
    use super::{EffectiveDictationHotkey, NativeShortcutChord};
    use std::error::Error;

    pub fn set_preset_picker_shortcut(_shortcut: NativeShortcutChord) -> bool {
        true
    }

    pub fn set_alt_space_enabled(_enabled: bool) -> bool {
        false
    }

    pub fn is_alt_space_enabled() -> bool {
        false
    }

    pub fn set_alt_space_capture_enabled(enabled: bool) -> bool {
        enabled
    }

    pub fn register_alt_space_hook<R: tauri::Runtime>(
        _app: &tauri::AppHandle<R>,
        _hotkey: EffectiveDictationHotkey,
    ) -> Result<(), Box<dyn Error>> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_alt_space_on_windows() {
        let hotkey = resolve_effective_dictation_hotkey(None, false);

        assert_eq!(hotkey.shortcut, DEFAULT_DESKTOP_CONTROL_HOTKEY);
        assert_eq!(hotkey.modifiers, Modifiers::ALT);
        assert_eq!(hotkey.code, Code::Space);
        assert_eq!(hotkey.backend, HotkeyBackend::WindowsLowLevelHook);
        assert!(hotkey.alt_space_enabled);
        assert_eq!(hotkey.fallback_reason, None);
    }

    #[test]
    fn keeps_ctrl_shift_f9_as_explicit_fallback() {
        let hotkey = resolve_effective_dictation_hotkey(Some("Ctrl+Shift+F9"), false);

        assert_eq!(hotkey.shortcut, FALLBACK_DESKTOP_CONTROL_HOTKEY);
        assert_eq!(hotkey.modifiers, Modifiers::CONTROL | Modifiers::SHIFT);
        assert_eq!(hotkey.code, Code::F9);
        assert_eq!(hotkey.backend, HotkeyBackend::TauriGlobalShortcut);
    }

    #[test]
    fn supports_alt_3_as_tauri_global_shortcut_candidate() {
        let hotkey = resolve_effective_dictation_hotkey(Some("Alt+3"), false);

        assert_eq!(hotkey.shortcut, ALT_3_DESKTOP_CONTROL_HOTKEY);
        assert_eq!(hotkey.modifiers, Modifiers::ALT);
        assert_eq!(hotkey.code, Code::Digit3);
        assert_eq!(hotkey.backend, HotkeyBackend::TauriGlobalShortcut);
    }

    #[test]
    fn supports_normal_recorded_tauri_global_shortcuts() {
        let alt_a = preview_hotkey_registration_request("Alt+A");
        assert!(alt_a.can_apply);
        assert_eq!(alt_a.normalized_shortcut, "Alt+A");
        assert_eq!(alt_a.target_config.unwrap().shortcut, "Alt+A");

        let ctrl_alt_p = preview_hotkey_registration_request("Ctrl+Alt+P");
        assert!(ctrl_alt_p.can_apply);
        assert_eq!(ctrl_alt_p.normalized_shortcut, "Ctrl+Alt+P");
        assert_eq!(ctrl_alt_p.target_config.unwrap().shortcut, "Ctrl+Alt+P");
    }

    #[test]
    fn rejects_plain_or_reserved_recorded_shortcuts() {
        let plain = preview_hotkey_registration_request("A");
        assert!(!plain.can_apply);
        assert_eq!(plain.reason, Some("unsupported_shortcut"));

        let paste_last = preview_hotkey_registration_request("Alt+Shift+X");
        assert!(!paste_last.can_apply);
        assert_eq!(paste_last.reason, Some("unsupported_shortcut"));
    }

    #[test]
    fn gates_alt_space_behind_explicit_allow_flag() {
        let blocked = resolve_effective_dictation_hotkey(Some("Alt+Space"), false);
        assert_eq!(blocked.shortcut, FALLBACK_DESKTOP_CONTROL_HOTKEY);
        assert!(blocked.alt_space_requested);
        assert!(!blocked.alt_space_enabled);
        assert_eq!(
            blocked.fallback_reason,
            Some("alt_space_requires_explicit_gate")
        );

        let enabled = resolve_effective_dictation_hotkey(Some("Alt+Space"), true);
        assert_eq!(enabled.shortcut, ALT_SPACE_DESKTOP_CONTROL_HOTKEY);
        assert_eq!(enabled.modifiers, Modifiers::ALT);
        assert_eq!(enabled.code, Code::Space);
        assert_eq!(enabled.backend, HotkeyBackend::WindowsLowLevelHook);
        assert!(enabled.alt_space_enabled);
        assert_eq!(enabled.fallback_reason, None);
    }

    #[test]
    fn payload_uses_effective_shortcut() {
        let hotkey = resolve_effective_dictation_hotkey(Some("Alt+Space"), true);

        assert_eq!(
            desktop_control_hotkey_pressed_payload(hotkey),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "pressed",
                shortcut: "Alt+Space",
                target_snapshot: None,
            }
        );

        assert_eq!(
            desktop_control_hotkey_released_payload(fallback_hotkey(None)),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "released",
                shortcut: "Ctrl+Shift+F9",
                target_snapshot: None,
            }
        );
    }

    #[test]
    fn escape_cancel_payload_uses_existing_hotkey_event_channel() {
        assert_eq!(
            desktop_control_escape_cancel_payload(),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "cancel",
                shortcut: "Escape",
                target_snapshot: None,
            }
        );
    }

    #[test]
    fn documents_paste_last_safe_hotkey() {
        assert_eq!(PASTE_LAST_SAFE_HOTKEY, "Alt+Shift+X");
    }

    #[test]
    fn action_hotkeys_accept_host_owned_recorded_shortcuts() {
        let picker = preview_action_shortcut("Ctrl+Alt+P");
        assert_eq!(picker.as_deref(), Some("Ctrl+Alt+P"));

        let chord = native_shortcut_chord_from_request("Ctrl+Alt+P").unwrap();
        assert!(chord.ctrl);
        assert!(chord.alt);
        assert!(!chord.shift);
        assert_eq!(chord.key_vk, 0x50);

        assert!(preview_action_shortcut("Alt+Space").is_none());
        assert!(preview_action_shortcut("P").is_none());
    }

    #[test]
    fn documents_preset_picker_hotkey() {
        assert_eq!(PRESET_PICKER_HOTKEY, "Alt+Q");
        let picker = preview_hotkey_registration_request(PRESET_PICKER_HOTKEY);
        assert!(!picker.can_apply);
        assert_eq!(picker.reason, Some("unsupported_shortcut"));
    }
}
