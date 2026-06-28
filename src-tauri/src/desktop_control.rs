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
pub const DESKTOP_CONTROL_HOTKEY_EVENT: &str = "desktop-control://global-hotkey";
pub const DESKTOP_CONTROL_HOTKEY_CAPTURE_EVENT: &str = "desktop-control://hotkey-capture";
pub const DICTATION_KEY_ENV: &str = "DICTATION_TAURI_DICTATION_KEY";
pub const ALT_SPACE_GATE_ENV: &str = "DICTATION_TAURI_ALLOW_ALT_SPACE";
pub const HOTKEY_PREFERENCE_FILE: &str = "hotkey-preferences.v1.json";

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
        "escape" | "alt+shift+x"
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

    Ok(())
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
    use crate::tray::{HostCommandPayload, HOST_COMMAND_EVENT};
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

    const VK_X: u32 = 0x58;

    static EVENT_SENDER: OnceLock<Mutex<Option<mpsc::Sender<()>>>> = OnceLock::new();
    static X_DOWN: AtomicBool = AtomicBool::new(false);

    pub fn register_paste_last_hook<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        _shortcut_label: &'static str,
    ) -> Result<(), Box<dyn Error>> {
        let (tx, rx) = mpsc::channel::<()>();
        let sender = EVENT_SENDER.get_or_init(|| Mutex::new(None));
        *sender
            .lock()
            .map_err(|_| "paste-last hook sender poisoned")? = Some(tx);

        let app_handle = app.clone();
        std::thread::spawn(move || {
            while rx.recv().is_ok() {
                let _ = app_handle.emit(
                    HOST_COMMAND_EVENT,
                    HostCommandPayload {
                        source: "global_hotkey",
                        command: "paste_last_safe",
                        preset_id: None,
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
            let is_x = keyboard.vkCode == VK_X;

            if is_x && is_down && exact_alt_shift_combo() {
                X_DOWN.store(true, Ordering::SeqCst);
                return 1;
            }

            if is_x && is_up && X_DOWN.swap(false, Ordering::SeqCst) {
                send_event_when_modifiers_released();
                return 1;
            }
        }

        CallNextHookEx(null_mut(), code, w_param, l_param)
    }

    fn exact_alt_shift_combo() -> bool {
        let alt_down = is_key_down(VK_MENU as i32);
        let shift_down = is_key_down(VK_SHIFT as i32);
        let ctrl_down = is_key_down(VK_CONTROL as i32);
        let win_down = is_key_down(VK_LWIN as i32) || is_key_down(VK_RWIN as i32);

        alt_down && shift_down && !ctrl_down && !win_down
    }

    fn is_key_down(vk: i32) -> bool {
        unsafe { (GetAsyncKeyState(vk) & 0x8000u16 as i16) != 0 }
    }

    fn send_event_when_modifiers_released() {
        std::thread::spawn(|| {
            for _ in 0..50 {
                if !is_key_down(VK_MENU as i32) && !is_key_down(VK_SHIFT as i32) {
                    send_event();
                    return;
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
            }

            synthesize_alt_shift_up();
            std::thread::sleep(std::time::Duration::from_millis(20));
            send_event();
        });
    }

    fn synthesize_alt_shift_up() {
        unsafe {
            keybd_event(VK_SHIFT as u8, 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_MENU as u8, 0, KEYEVENTF_KEYUP, 0);
        }
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
mod native_paste_last {
    use std::error::Error;

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
        desktop_control_hotkey_released_payload, EffectiveDictationHotkey,
        ALT_SPACE_DESKTOP_CONTROL_HOTKEY, DESKTOP_CONTROL_HOTKEY_CAPTURE_EVENT,
        DESKTOP_CONTROL_HOTKEY_EVENT,
    };
    use std::error::Error;
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, Mutex, OnceLock};
    use tauri::Emitter;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, GetAsyncKeyState, KEYEVENTF_KEYUP, VK_MENU, VK_SPACE,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT, MSG,
        WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    #[derive(Clone, Copy, Debug)]
    enum NativeAltSpaceEvent {
        Pressed,
        Released,
        Capture,
    }

    const LLKHF_ALTDOWN: u32 = 0x20;

    static EVENT_SENDER: OnceLock<Mutex<Option<mpsc::Sender<NativeAltSpaceEvent>>>> =
        OnceLock::new();
    static ALT_SPACE_ENABLED: AtomicBool = AtomicBool::new(false);
    static ALT_SPACE_CAPTURE_ENABLED: AtomicBool = AtomicBool::new(false);
    static SPACE_DOWN: AtomicBool = AtomicBool::new(false);

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
                    NativeAltSpaceEvent::Capture => {
                        let _ = app_handle.emit(
                            DESKTOP_CONTROL_HOTKEY_CAPTURE_EVENT,
                            desktop_control_hotkey_capture_payload(
                                ALT_SPACE_DESKTOP_CONTROL_HOTKEY,
                            ),
                        );
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
            let alt_down = (GetAsyncKeyState(VK_MENU as i32) & 0x8000u16 as i16) != 0
                || (keyboard.flags & LLKHF_ALTDOWN) != 0;
            let capture_enabled = ALT_SPACE_CAPTURE_ENABLED.load(Ordering::SeqCst);
            let hotkey_enabled = ALT_SPACE_ENABLED.load(Ordering::SeqCst);

            if is_space && alt_down && is_down && capture_enabled {
                if !SPACE_DOWN.swap(true, Ordering::SeqCst) {
                    send_event(NativeAltSpaceEvent::Capture);
                }
                return 1;
            }

            if is_space && is_up && SPACE_DOWN.swap(false, Ordering::SeqCst) && capture_enabled {
                synthesize_alt_up();
                return 1;
            }

            if is_space && alt_down && is_down && hotkey_enabled {
                if !SPACE_DOWN.swap(true, Ordering::SeqCst) {
                    send_event(NativeAltSpaceEvent::Pressed);
                }
                return 1;
            }

            if is_space && is_up && SPACE_DOWN.swap(false, Ordering::SeqCst) && hotkey_enabled {
                send_event(NativeAltSpaceEvent::Released);
                synthesize_alt_up();
                return 1;
            }
        }

        CallNextHookEx(null_mut(), code, w_param, l_param)
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

    fn synthesize_alt_up() {
        unsafe {
            keybd_event(VK_MENU as u8, 0, KEYEVENTF_KEYUP, 0);
        }
    }
}

#[cfg(not(windows))]
mod native_alt_space {
    use super::EffectiveDictationHotkey;
    use std::error::Error;

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
            }
        );
    }

    #[test]
    fn documents_paste_last_safe_hotkey() {
        assert_eq!(PASTE_LAST_SAFE_HOTKEY, "Alt+Shift+X");
    }
}
