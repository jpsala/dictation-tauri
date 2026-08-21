use crate::tray::{HostCommandPayload, HOST_COMMAND_EVENT};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
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
pub const STOP_SUBMIT_HOTKEY: &str = "Win+Space";
pub const PRESET_PICKER_HOTKEY: &str = "Alt+Q";
pub const DESKTOP_CONTROL_HOTKEY_EVENT: &str = "desktop-control://global-hotkey";
pub const DESKTOP_CONTROL_HOTKEY_CAPTURE_EVENT: &str = "desktop-control://hotkey-capture";
pub const DICTATION_KEY_ENV: &str = "DICTATION_TAURI_DICTATION_KEY";
pub const ALT_SPACE_GATE_ENV: &str = "DICTATION_TAURI_ALLOW_ALT_SPACE";
pub const HOTKEY_PREFERENCE_FILE: &str = "hotkey-preferences.v1.json";
pub const ACTION_HOTKEY_PREFERENCE_FILE: &str = "action-hotkey-preferences.v1.json";

const WIN_SPACE_MASK_KEY_VK: u32 = 0xE8;
const WIN_SPACE_OWN_INJECTED_EXTRA_INFO: usize = 0x4454_5753;

fn win_space_mask_applies(shortcut: NativeShortcutChord) -> bool {
    shortcut.win && !shortcut.ctrl && !shortcut.alt && !shortcut.shift && shortcut.key_vk == 0x20
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WinSpaceKey {
    LeftWin,
    RightWin,
    Space,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WinSpaceEventKind {
    Down,
    Up,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WinSpaceEventSource {
    Physical,
    ForeignInjected,
    OwnInjected,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct WinSpaceModifiers {
    ctrl: bool,
    alt: bool,
    shift: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WinSpaceInput {
    key: WinSpaceKey,
    kind: WinSpaceEventKind,
    modifiers: WinSpaceModifiers,
    source: WinSpaceEventSource,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WinSpaceDecision {
    PassThrough,
    Suppress,
    SuppressAndEmitReleased,
    SuppressAndMaskWin,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WinSpaceTransition {
    decision: WinSpaceDecision,
    emit_pressed: bool,
    emit_released: bool,
    inject_mask: bool,
}

impl WinSpaceTransition {
    const fn pass_through() -> Self {
        Self {
            decision: WinSpaceDecision::PassThrough,
            emit_pressed: false,
            emit_released: false,
            inject_mask: false,
        }
    }

    const fn suppress() -> Self {
        Self {
            decision: WinSpaceDecision::Suppress,
            emit_pressed: false,
            emit_released: false,
            inject_mask: false,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct WinSpaceState {
    left_win_physical_down: bool,
    right_win_physical_down: bool,
    space_physical_down: bool,
    chord_active: bool,
    win_masked: bool,
}

impl WinSpaceState {
    fn handle(&mut self, input: WinSpaceInput) -> WinSpaceTransition {
        if input.source == WinSpaceEventSource::OwnInjected {
            return WinSpaceTransition::pass_through();
        }

        match (input.key, input.kind) {
            (WinSpaceKey::LeftWin, WinSpaceEventKind::Down) => {
                self.left_win_physical_down = true;
                WinSpaceTransition::pass_through()
            }
            (WinSpaceKey::LeftWin, WinSpaceEventKind::Up) => {
                self.left_win_physical_down = false;
                WinSpaceTransition::pass_through()
            }
            (WinSpaceKey::RightWin, WinSpaceEventKind::Down) => {
                self.right_win_physical_down = true;
                WinSpaceTransition::pass_through()
            }
            (WinSpaceKey::RightWin, WinSpaceEventKind::Up) => {
                self.right_win_physical_down = false;
                WinSpaceTransition::pass_through()
            }
            (WinSpaceKey::Space, WinSpaceEventKind::Down) => {
                self.space_physical_down = true;
                if self.win_is_physical_down()
                    && !input.modifiers.ctrl
                    && !input.modifiers.alt
                    && !input.modifiers.shift
                {
                    if self.chord_active && self.space_physical_down && self.win_masked {
                        return WinSpaceTransition::suppress();
                    }

                    self.chord_active = true;
                    self.win_masked = true;
                    return WinSpaceTransition {
                        decision: WinSpaceDecision::SuppressAndMaskWin,
                        emit_pressed: true,
                        emit_released: false,
                        inject_mask: true,
                    };
                }
                WinSpaceTransition::pass_through()
            }
            (WinSpaceKey::Space, WinSpaceEventKind::Up) => {
                self.space_physical_down = false;
                if self.chord_active {
                    self.chord_active = false;
                    self.win_masked = false;
                    return WinSpaceTransition {
                        decision: WinSpaceDecision::SuppressAndEmitReleased,
                        emit_pressed: false,
                        emit_released: true,
                        inject_mask: false,
                    };
                }
                WinSpaceTransition::pass_through()
            }
            (WinSpaceKey::Other, _) => WinSpaceTransition::pass_through(),
        }
    }

    fn win_is_physical_down(self) -> bool {
        self.left_win_physical_down || self.right_win_physical_down
    }
}

static CURRENT_HOTKEY: OnceLock<Mutex<EffectiveDictationHotkey>> = OnceLock::new();
static HOST_COMMAND_LISTENER_READY: AtomicBool = AtomicBool::new(false);
static PENDING_HOST_COMMANDS: OnceLock<Mutex<Vec<HostCommandPayload>>> = OnceLock::new();

const MAX_PENDING_HOTKEY_EVENTS: usize = 8;

/// The native hotkey listener uses one mutex for readiness and the pending queue.
/// This is the exactly-once boundary: an event is either queued while the
/// listener is not ready, or emitted live after the atomic ready/drain
/// transition. It is never both.
#[derive(Default)]
struct HotkeyListenerQueueState {
    ready: bool,
    pending: Vec<DesktopControlHotkeyPayload>,
}

impl HotkeyListenerQueueState {
    fn queue_or_emit_live(&mut self, payload: DesktopControlHotkeyPayload) -> bool {
        if self.ready {
            return false;
        }

        if self.pending.len() >= MAX_PENDING_HOTKEY_EVENTS {
            self.pending.remove(0);
        }
        self.pending.push(payload);
        true
    }

    fn mark_ready_and_drain(&mut self) -> Vec<DesktopControlHotkeyPayload> {
        self.ready = true;
        std::mem::take(&mut self.pending)
    }
}

static HOTKEY_LISTENER_QUEUE: OnceLock<Mutex<HotkeyListenerQueueState>> = OnceLock::new();

fn hotkey_listener_queue() -> &'static Mutex<HotkeyListenerQueueState> {
    HOTKEY_LISTENER_QUEUE.get_or_init(|| Mutex::new(HotkeyListenerQueueState::default()))
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EffectiveDictationHotkey {
    pub shortcut: Cow<'static, str>,
    pub modifiers: Modifiers,
    pub code: Code,
    pub backend: HotkeyBackend,
    pub requested_shortcut: Option<Cow<'static, str>>,
    pub alt_space_requested: bool,
    pub alt_space_enabled: bool,
    pub fallback_reason: Option<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlHotkeyConfig {
    pub shortcut: Cow<'static, str>,
    pub default_shortcut: &'static str,
    pub requested_shortcut: Option<Cow<'static, str>>,
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
    pub shortcut: Cow<'static, str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_snapshot: Option<crate::desktop_delivery::DesktopDeliveryTarget>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlHotkeyCapturePayload {
    pub source: &'static str,
    pub shortcut: Cow<'static, str>,
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
    #[serde(default = "default_stop_submit_hotkey")]
    pub stop_submit: String,
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
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub win: bool,
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
pub fn restart_desktop_control_hook<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> bool {
    let hotkey = alt_space_hotkey(Some(Cow::Borrowed(ALT_SPACE_DESKTOP_CONTROL_HOTKEY)));
    match native_alt_space::restart_alt_space_hook(&app, hotkey) {
        Ok(()) => true,
        Err(error) => {
            eprintln!("[dictation-tauri][hotkey] win-space hook restart failed: {error}");
            false
        }
    }
}

pub fn shutdown_desktop_control_hooks() {
    native_alt_space::shutdown_alt_space_hook();
}

#[tauri::command]
pub fn set_desktop_control_hotkey_listener_ready(ready: bool) {
    if let Ok(mut state) = hotkey_listener_queue().lock() {
        state.ready = ready;
    }
}

#[tauri::command]
pub fn drain_desktop_control_hotkey_events() -> Vec<DesktopControlHotkeyPayload> {
    // Holding the same mutex while flipping ready and taking the queue closes
    // the listener-before-drain gap: concurrent native events choose exactly
    // one side of this transition.
    let events = hotkey_listener_queue()
        .lock()
        .map(|mut state| state.mark_ready_and_drain())
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
pub fn drain_desktop_control_host_commands() -> Vec<HostCommandPayload> {
    HOST_COMMAND_LISTENER_READY.store(true, Ordering::SeqCst);
    let commands: Vec<HostCommandPayload> = PENDING_HOST_COMMANDS
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .map(|mut commands| commands.drain(..).collect())
        .unwrap_or_default();
    if !commands.is_empty() {
        eprintln!(
            "[dictation-tauri][host-command] drained pending commands count={}",
            commands.len()
        );
    }
    commands
}

#[tauri::command]
pub fn set_desktop_control_host_command_listener_ready(ready: bool) {
    HOST_COMMAND_LISTENER_READY.store(ready, Ordering::SeqCst);
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
        .and_then(|lock| lock.lock().ok().map(|guard| guard.clone()))
        .unwrap_or_else(resolve_effective_dictation_hotkey_from_env)
}

fn remember_current_hotkey(hotkey: EffectiveDictationHotkey) {
    let lock = CURRENT_HOTKEY.get_or_init(|| Mutex::new(hotkey.clone()));
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
fn default_stop_submit_hotkey() -> String {
    STOP_SUBMIT_HOTKEY.to_string()
}

fn default_action_hotkey_config() -> DesktopControlActionHotkeyConfig {
    DesktopControlActionHotkeyConfig {
        schema_version: 1,
        preset_picker: PRESET_PICKER_HOTKEY.to_string(),
        paste_last_safe: PASTE_LAST_SAFE_HOTKEY.to_string(),
        stop_submit: default_stop_submit_hotkey(),
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
    if preview_action_shortcut(&stored.preset_picker, false).is_none() {
        eprintln!("[dictation-tauri][hotkey] ignoring unsupported preset picker shortcut");
    } else {
        merged.preset_picker =
            canonicalize_shortcut(&stored.preset_picker).unwrap_or(stored.preset_picker);
    }
    if preview_action_shortcut(&stored.paste_last_safe, false).is_none() {
        eprintln!("[dictation-tauri][hotkey] ignoring unsupported paste-last shortcut");
    } else {
        merged.paste_last_safe =
            canonicalize_shortcut(&stored.paste_last_safe).unwrap_or(stored.paste_last_safe);
    }
    if preview_action_shortcut(&stored.stop_submit, true).is_none() {
        eprintln!("[dictation-tauri][hotkey] ignoring unsupported stop-submit shortcut");
    } else {
        merged.stop_submit =
            canonicalize_shortcut(&stored.stop_submit).unwrap_or(stored.stop_submit);
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
        "stop_submit" | "stop-submit" => Some("stop_submit"),
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
        Some("stop_submit") => {
            config.stop_submit = shortcut;
            true
        }
        _ => false,
    }
}

fn preview_action_shortcut(
    requested_shortcut: &str,
    allow_windows_modifier: bool,
) -> Option<String> {
    let canonical = canonicalize_shortcut(requested_shortcut)?;
    let normalized = normalize_shortcut(&canonical);
    if matches!(normalized.as_str(), "escape" | "alt+space") {
        return None;
    }
    let chord = native_shortcut_chord_from_request(&canonical)?;
    if chord.win && !allow_windows_modifier {
        return None;
    }
    Some(canonical)
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
    let candidate = preview_action_shortcut(requested_shortcut, action == Some("stop_submit"));
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
            "stop_submit" => {
                if normalize_shortcut(&effective_config.preset_picker)
                    == normalize_shortcut(&normalized_shortcut)
                {
                    normalize_shortcut(&effective_config.preset_picker)
                } else {
                    normalize_shortcut(&effective_config.paste_last_safe)
                }
            }
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
    if let Some(chord) = native_shortcut_chord_from_request(&config.stop_submit) {
        native_alt_space::set_stop_submit_shortcut(chord);
    }
}

fn native_shortcut_chord_from_request(requested: &str) -> Option<NativeShortcutChord> {
    let canonical = canonicalize_shortcut(requested)?;
    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut win = false;
    let mut key: Option<&str> = None;

    for part in canonical.split('+') {
        match part {
            "Ctrl" => ctrl = true,
            "Alt" => alt = true,
            "Shift" => shift = true,
            "Win" => win = true,
            value => {
                if key.replace(value).is_some() {
                    return None;
                }
            }
        }
    }

    if !ctrl && !alt && !shift && !win {
        return None;
    }

    let key_vk = virtual_key_from_canonical_key(key?)?;
    Some(NativeShortcutChord {
        ctrl,
        alt,
        shift,
        win,
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
                    .map(shortcut_value)
                    .or(Some(Cow::Borrowed("unsupported")));
                EffectiveDictationHotkey {
                    requested_shortcut,
                    fallback_reason: Some("unsupported_shortcut"),
                    ..fallback_hotkey(None)
                }
            })
        }
    }
}

fn fallback_hotkey(requested_shortcut: Option<Cow<'static, str>>) -> EffectiveDictationHotkey {
    EffectiveDictationHotkey {
        shortcut: Cow::Borrowed(FALLBACK_DESKTOP_CONTROL_HOTKEY),
        modifiers: Modifiers::CONTROL | Modifiers::SHIFT,
        code: Code::F9,
        backend: HotkeyBackend::TauriGlobalShortcut,
        requested_shortcut,
        alt_space_requested: false,
        alt_space_enabled: false,
        fallback_reason: None,
    }
}

fn alt_space_hotkey(requested_shortcut: Option<Cow<'static, str>>) -> EffectiveDictationHotkey {
    EffectiveDictationHotkey {
        shortcut: Cow::Borrowed(ALT_SPACE_DESKTOP_CONTROL_HOTKEY),
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
    shortcut: Cow<'static, str>,
    modifiers: Modifiers,
    code: Code,
    requested_shortcut: Option<Cow<'static, str>>,
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
            return Some(alt_space_hotkey(Some(Cow::Borrowed(
                ALT_SPACE_DESKTOP_CONTROL_HOTKEY,
            ))));
        }
        if alt_space_allowed {
            return Some(EffectiveDictationHotkey {
                requested_shortcut: Some(Cow::Borrowed(ALT_SPACE_DESKTOP_CONTROL_HOTKEY)),
                alt_space_requested: true,
                alt_space_enabled: false,
                fallback_reason: Some("alt_space_native_hook_windows_only"),
                ..fallback_hotkey(None)
            });
        }
        return Some(EffectiveDictationHotkey {
            requested_shortcut: Some(Cow::Borrowed(ALT_SPACE_DESKTOP_CONTROL_HOTKEY)),
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

    let shortcut = shortcut_value(canonical);
    Some(tauri_global_hotkey(
        shortcut.clone(),
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

fn shortcut_value(shortcut: String) -> Cow<'static, str> {
    match shortcut.as_str() {
        DEFAULT_DESKTOP_CONTROL_HOTKEY => Cow::Borrowed(DEFAULT_DESKTOP_CONTROL_HOTKEY),
        FALLBACK_DESKTOP_CONTROL_HOTKEY => Cow::Borrowed(FALLBACK_DESKTOP_CONTROL_HOTKEY),
        ALT_3_DESKTOP_CONTROL_HOTKEY => Cow::Borrowed(ALT_3_DESKTOP_CONTROL_HOTKEY),
        PASTE_LAST_SAFE_HOTKEY => Cow::Borrowed(PASTE_LAST_SAFE_HOTKEY),
        STOP_SUBMIT_HOTKEY => Cow::Borrowed(STOP_SUBMIT_HOTKEY),
        _ => Cow::Owned(shortcut),
    }
}

fn canonicalize_shortcut(value: &str) -> Option<String> {
    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut win = false;
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
            "win" | "windows" | "super" | "cmd" | "command" | "meta" => win = true,
            other => {
                if key.is_some() {
                    return None;
                }
                key = Some(canonical_key(other));
            }
        }
    }

    let key = key?;
    if !ctrl && !alt && !shift && !win {
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
    if win {
        parts.push("Win".to_string());
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
    let previous_config = desktop_control_hotkey_config(previous_hotkey.clone());
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

    let Some(target_hotkey) = effective_hotkey_from_request(&target_config.shortcut, true) else {
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
        if let Err(error) = verify_effective_hotkey(app, target_hotkey.clone()) {
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

        remember_current_hotkey(target_hotkey.clone());
        let persistence_error = write_hotkey_preference(app, &target_hotkey.shortcut)
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

    match swap_registered_hotkey(app, previous_hotkey.clone(), target_hotkey.clone()) {
        Ok(()) => {
            remember_current_hotkey(target_hotkey.clone());
            let persistence_error = write_hotkey_preference(app, &target_hotkey.shortcut)
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
            let rollback_error =
                swap_registered_hotkey(app, target_hotkey.clone(), previous_hotkey.clone()).err();
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
    register_effective_hotkey(app, next.clone())?;
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
    desktop_control_hotkey_payload("pressed", &hotkey)
}

pub fn desktop_control_hotkey_released_payload(
    hotkey: EffectiveDictationHotkey,
) -> DesktopControlHotkeyPayload {
    desktop_control_hotkey_payload("released", &hotkey)
}

pub fn desktop_control_escape_cancel_payload() -> DesktopControlHotkeyPayload {
    DesktopControlHotkeyPayload {
        source: "global_hotkey",
        action: "cancel",
        shortcut: Cow::Borrowed("Escape"),
        target_snapshot: None,
    }
}

pub fn desktop_control_hotkey_capture_payload(
    shortcut: Cow<'static, str>,
) -> DesktopControlHotkeyCapturePayload {
    DesktopControlHotkeyCapturePayload {
        source: "host_capture",
        shortcut,
    }
}

fn desktop_control_hotkey_payload(
    action: &'static str,
    hotkey: &EffectiveDictationHotkey,
) -> DesktopControlHotkeyPayload {
    DesktopControlHotkeyPayload {
        source: "global_hotkey",
        action,
        shortcut: hotkey.shortcut.clone(),
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
                .register(hotkey.shortcut.as_ref())
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
            if app
                .global_shortcut()
                .is_registered(hotkey.shortcut.as_ref())
            {
                app.global_shortcut()
                    .unregister(hotkey.shortcut.as_ref())
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
            if app
                .global_shortcut()
                .is_registered(hotkey.shortcut.as_ref())
            {
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
    remember_current_hotkey(hotkey.clone());
    let action_hotkeys = read_action_hotkey_preferences(app).unwrap_or_else(|error| {
        eprintln!("[dictation-tauri][hotkey] action preferences unavailable: {error}");
        default_action_hotkey_config()
    });
    apply_action_hotkeys_to_runtime(&action_hotkeys);
    eprintln!(
        "[dictation-tauri][hotkey] action shortcuts preset_picker={} paste_last_safe={} stop_submit={}",
        action_hotkeys.preset_picker, action_hotkeys.paste_last_safe, action_hotkeys.stop_submit
    );
    native_escape_cancel::register_escape_cancel_hook(app)?;
    native_paste_last::register_paste_last_hook(app, PASTE_LAST_SAFE_HOTKEY)?;
    native_alt_space::register_alt_space_hook(
        app,
        alt_space_hotkey(Some(Cow::Borrowed(ALT_SPACE_DESKTOP_CONTROL_HOTKEY))),
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
                    Some(desktop_control_hotkey_pressed_payload(
                        active_hotkey.clone(),
                    ))
                } else if event.state == ShortcutState::Released {
                    Some(desktop_control_hotkey_released_payload(
                        active_hotkey.clone(),
                    ))
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
        dock_skin: None,
        chord_key: None,
        target_snapshot,
    };
    emit_host_command_payload(app, payload);
}

fn emit_preset_picker_chord_payload<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    chord_key: Cow<'static, str>,
) {
    let target_snapshot = crate::desktop_delivery::capture_desktop_delivery_target().ok();
    let payload = HostCommandPayload {
        source: "global_hotkey",
        command: "run_preset_picker_chord",
        preset_id: None,
        dock_skin: None,
        chord_key: Some(chord_key.into_owned()),
        target_snapshot,
    };
    emit_host_command_payload(app, payload);
}

fn emit_host_command_payload<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    payload: HostCommandPayload,
) {
    if !HOST_COMMAND_LISTENER_READY.load(Ordering::SeqCst) {
        let command = payload.command;
        let mut queued = false;
        if let Ok(mut pending) = PENDING_HOST_COMMANDS
            .get_or_init(|| Mutex::new(Vec::new()))
            .lock()
        {
            if !HOST_COMMAND_LISTENER_READY.load(Ordering::SeqCst) {
                if pending.len() >= 8 {
                    pending.remove(0);
                }
                pending.push(payload.clone());
                queued = true;
            }
        }
        if queued {
            eprintln!(
                "[dictation-tauri][host-command] queued pre-listener command={}",
                command
            );
            return;
        }
    }

    if let Err(error) = app.emit_to(
        crate::dock_shell::DOCK_WINDOW_LABEL,
        HOST_COMMAND_EVENT,
        payload,
    ) {
        eprintln!("[dictation-tauri][host-command] emit failed: {error}");
    }
}

fn emit_desktop_control_hotkey_payload<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    payload: DesktopControlHotkeyPayload,
) {
    let queued = hotkey_listener_queue()
        .lock()
        .map(|mut state| state.queue_or_emit_live(payload.clone()))
        .unwrap_or(false);
    if queued {
        eprintln!(
            "[dictation-tauri][hotkey] queued pre-listener event action={} shortcut={}",
            payload.action, payload.shortcut
        );
        if payload.action == "pressed" {
            schedule_wake_dock_window_for_hotkey(app);
        }
        // Queue-only until the atomic ready/drain transition. Emitting here
        // as well would deliver the same physical key once live and once from
        // the drained queue.
        return;
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
    use super::NativeShortcutChord;
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
        ctrl: false,
        alt: true,
        shift: true,
        win: false,
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
                        dock_skin: None,
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
                ctrl: false,
                alt: true,
                shift: true,
                win: false,
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
            && win_down == shortcut.win
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
        WinSpaceDecision, WinSpaceEventKind, WinSpaceEventSource, WinSpaceInput, WinSpaceKey,
        WinSpaceModifiers, WinSpaceState, ALT_SPACE_DESKTOP_CONTROL_HOTKEY,
        DESKTOP_CONTROL_HOTKEY_CAPTURE_EVENT, DESKTOP_CONTROL_HOTKEY_EVENT, WIN_SPACE_MASK_KEY_VK,
        WIN_SPACE_OWN_INJECTED_EXTRA_INFO,
    };
    use crate::tray::{HostCommandPayload, HOST_COMMAND_EVENT};
    use std::borrow::Cow;
    use std::error::Error;
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, LazyLock, Mutex, OnceLock};
    use std::thread::JoinHandle;
    use std::time::{Duration, Instant};
    use tauri::Emitter;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput as WindowsSendInput, INPUT as WindowsInput, INPUT_0 as WindowsInput0,
        INPUT_KEYBOARD as WINDOWS_INPUT_KEYBOARD, KEYBDINPUT as WindowsKeybdInput,
        KEYEVENTF_KEYUP as WINDOWS_KEYEVENTF_KEYUP, VIRTUAL_KEY,
    };
    use windows_sys::Win32::Foundation::{GetLastError, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, GetAsyncKeyState, KEYEVENTF_KEYUP, VK_CONTROL, VK_LCONTROL, VK_LMENU,
        VK_LSHIFT, VK_LWIN, VK_MENU, VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT, VK_SPACE,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, PeekMessageW, PostThreadMessageW, SetWindowsHookExW,
        UnhookWindowsHookEx, HC_ACTION, KBDLLHOOKSTRUCT, MSG, PM_NOREMOVE, WH_KEYBOARD_LL,
        WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    #[derive(Clone, Debug)]
    enum NativeAltSpaceEvent {
        Pressed,
        Released,
        StopSubmitPressed,
        StopSubmit,
        Capture(Cow<'static, str>),
        PresetPicker,
        PresetPickerChord(Cow<'static, str>),
    }

    const LLKHF_ALTDOWN: u32 = 0x20;
    const PRESET_CHORD_TIMEOUT: Duration = Duration::from_millis(2500);
    const LLKHF_INJECTED: u32 = 0x10;

    struct HookRuntime {
        thread_id: u32,
        hook: usize,
        thread: JoinHandle<()>,
    }

    static HOOK_RUNTIME: LazyLock<Mutex<Option<HookRuntime>>> = LazyLock::new(|| Mutex::new(None));
    static WIN_SPACE_STATE: LazyLock<Mutex<WinSpaceState>> =
        LazyLock::new(|| Mutex::new(WinSpaceState::default()));

    fn hook_runtime() -> &'static Mutex<Option<HookRuntime>> {
        &HOOK_RUNTIME
    }

    fn win_space_state() -> &'static Mutex<WinSpaceState> {
        &WIN_SPACE_STATE
    }

    fn reset_win_space_state() {
        if let Ok(mut state) = win_space_state().lock() {
            *state = WinSpaceState::default();
        }
    }

    static EVENT_SENDER: OnceLock<Mutex<Option<mpsc::Sender<NativeAltSpaceEvent>>>> =
        OnceLock::new();
    static PRESET_CHORD_ARMED_AT: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
    static PRESET_PICKER_SHORTCUT: Mutex<NativeShortcutChord> = Mutex::new(NativeShortcutChord {
        ctrl: false,
        alt: true,
        shift: false,
        win: false,
        key_vk: 0x51,
    });
    static STOP_SUBMIT_SHORTCUT: Mutex<NativeShortcutChord> = Mutex::new(NativeShortcutChord {
        ctrl: false,
        alt: false,
        shift: false,
        win: true,
        key_vk: VK_SPACE as u32,
    });
    static STOP_SUBMIT_DOWN: AtomicBool = AtomicBool::new(false);
    static LEFT_WIN_DOWN: AtomicBool = AtomicBool::new(false);
    static RIGHT_WIN_DOWN: AtomicBool = AtomicBool::new(false);
    static SUPPRESS_STOP_SUBMIT_WIN_UP: AtomicBool = AtomicBool::new(false);
    static ALT_SPACE_ENABLED: AtomicBool = AtomicBool::new(false);
    static ALT_SPACE_CAPTURE_ENABLED: AtomicBool = AtomicBool::new(false);
    static SPACE_DOWN: AtomicBool = AtomicBool::new(false);
    static CAPTURE_DOWN: AtomicBool = AtomicBool::new(false);
    static PRESET_PICKER_DOWN: AtomicBool = AtomicBool::new(false);
    static SUPPRESS_NEXT_ALT_UP: AtomicBool = AtomicBool::new(false);
    static SUPPRESS_NEXT_ALT_UP_ONLY: AtomicBool = AtomicBool::new(false);
    pub fn set_stop_submit_shortcut(shortcut: NativeShortcutChord) -> bool {
        if let Ok(mut guard) = STOP_SUBMIT_SHORTCUT.lock() {
            *guard = shortcut;
        }
        STOP_SUBMIT_DOWN.store(false, Ordering::SeqCst);
        SUPPRESS_STOP_SUBMIT_WIN_UP.store(false, Ordering::SeqCst);
        reset_win_space_state();
        true
    }

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
    fn stop_installed_hook() {
        let runtime = hook_runtime()
            .lock()
            .ok()
            .and_then(|mut guard| guard.take());
        if let Some(runtime) = runtime {
            let posted = unsafe { PostThreadMessageW(runtime.thread_id, WM_QUIT, 0, 0) };
            if posted == 0 {
                eprintln!(
                    "[dictation-tauri][hotkey] win-space hook stop message failed error={}",
                    unsafe { GetLastError() }
                );
                unsafe {
                    let _ = UnhookWindowsHookEx(runtime.hook as _);
                    let _ = PostThreadMessageW(runtime.thread_id, WM_QUIT, 0, 0);
                }
            }
            let _ = runtime.thread.join();
            eprintln!("[dictation-tauri][hotkey] win-space hook uninstalled");
        }
        reset_win_space_state();
        STOP_SUBMIT_DOWN.store(false, Ordering::SeqCst);
        SUPPRESS_STOP_SUBMIT_WIN_UP.store(false, Ordering::SeqCst);
        LEFT_WIN_DOWN.store(false, Ordering::SeqCst);
        RIGHT_WIN_DOWN.store(false, Ordering::SeqCst);
    }

    pub fn shutdown_alt_space_hook() {
        stop_installed_hook();
        if let Some(sender) = EVENT_SENDER.get() {
            if let Ok(mut guard) = sender.lock() {
                *guard = None;
            }
        }
    }

    pub fn restart_alt_space_hook<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        hotkey: EffectiveDictationHotkey,
    ) -> Result<(), Box<dyn Error>> {
        register_alt_space_hook(app, hotkey)?;
        eprintln!("[dictation-tauri][hotkey] win-space hook restarted");
        Ok(())
    }

    pub fn register_alt_space_hook<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        hotkey: EffectiveDictationHotkey,
    ) -> Result<(), Box<dyn Error>> {
        stop_installed_hook();

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
                            desktop_control_hotkey_pressed_payload(hotkey.clone()),
                        );
                    }
                    NativeAltSpaceEvent::Released => {
                        let _ = app_handle.emit(
                            DESKTOP_CONTROL_HOTKEY_EVENT,
                            desktop_control_hotkey_released_payload(hotkey.clone()),
                        );
                    }
                    NativeAltSpaceEvent::StopSubmitPressed => {
                        let _ = app_handle.emit(
                            HOST_COMMAND_EVENT,
                            HostCommandPayload {
                                source: "global_hotkey",
                                command: "stop_submit_pressed",
                                preset_id: None,
                                dock_skin: None,
                                chord_key: None,
                                target_snapshot: None,
                            },
                        );
                    }
                    NativeAltSpaceEvent::StopSubmit => {
                        let _ = app_handle.emit(
                            HOST_COMMAND_EVENT,
                            HostCommandPayload {
                                source: "global_hotkey",
                                command: "stop_submit",
                                preset_id: None,
                                dock_skin: None,
                                chord_key: None,
                                target_snapshot: None,
                            },
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

        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let thread = std::thread::spawn(move || unsafe {
            let thread_id = GetCurrentThreadId();
            let mut queue_message: MSG = std::mem::zeroed();
            PeekMessageW(&mut queue_message, null_mut(), 0, 0, PM_NOREMOVE);

            let module = GetModuleHandleW(null_mut());
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0);
            if hook.is_null() {
                let _ = ready_tx.send(Err(GetLastError()));
                return;
            }

            let _ = ready_tx.send(Ok((thread_id, hook as usize)));
            let mut message: MSG = std::mem::zeroed();
            let result = loop {
                let result = GetMessageW(&mut message, null_mut(), 0, 0);
                if result <= 0 {
                    break result;
                }
            };
            if result < 0 {
                eprintln!(
                    "[dictation-tauri][hotkey] win-space hook message loop failed error={}",
                    GetLastError()
                );
            }
            if UnhookWindowsHookEx(hook) == 0 {
                eprintln!(
                    "[dictation-tauri][hotkey] win-space hook uninstall failed error={}",
                    GetLastError()
                );
            }
        });

        let (thread_id, hook) = match ready_rx.recv_timeout(Duration::from_secs(2)) {
            Ok(Ok(runtime)) => runtime,
            Ok(Err(error)) => {
                let _ = thread.join();
                if let Some(sender) = EVENT_SENDER.get() {
                    if let Ok(mut guard) = sender.lock() {
                        *guard = None;
                    }
                }
                return Err(format!("SetWindowsHookExW failed: {error}").into());
            }
            Err(error) => {
                let _ = thread.join();
                if let Some(sender) = EVENT_SENDER.get() {
                    if let Ok(mut guard) = sender.lock() {
                        *guard = None;
                    }
                }
                return Err(format!("keyboard hook installation timed out: {error}").into());
            }
        };

        hook_runtime()
            .lock()
            .map_err(|_| "keyboard hook runtime poisoned")?
            .replace(HookRuntime {
                thread_id,
                hook,
                thread,
            });
        eprintln!("[dictation-tauri][hotkey] win-space hook installed");
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
            let own_injected_event = (keyboard.flags & LLKHF_INJECTED) != 0
                && keyboard.dwExtraInfo == WIN_SPACE_OWN_INJECTED_EXTRA_INFO;
            if own_injected_event {
                eprintln!("[dictation-tauri][hotkey] win-space own injected event ignored");
                return CallNextHookEx(null_mut(), code, w_param, l_param);
            }
            let is_space = keyboard.vkCode == VK_SPACE as u32;
            let is_left_win = keyboard.vkCode == VK_LWIN as u32;
            let is_right_win = keyboard.vkCode == VK_RWIN as u32;
            let is_win = is_left_win || is_right_win;
            let is_alt = keyboard.vkCode == VK_MENU as u32
                || keyboard.vkCode == 0xA4
                || keyboard.vkCode == 0xA5;
            let alt_down = (GetAsyncKeyState(VK_MENU as i32) & 0x8000u16 as i16) != 0
                || (keyboard.flags & LLKHF_ALTDOWN) != 0;
            if is_win {
                if is_down {
                    if is_left_win {
                        LEFT_WIN_DOWN.store(true, Ordering::SeqCst);
                    }
                    if is_right_win {
                        RIGHT_WIN_DOWN.store(true, Ordering::SeqCst);
                    }
                } else if is_up {
                    let suppress = SUPPRESS_STOP_SUBMIT_WIN_UP.swap(false, Ordering::SeqCst);
                    if is_left_win {
                        LEFT_WIN_DOWN.store(false, Ordering::SeqCst);
                    }
                    if is_right_win {
                        RIGHT_WIN_DOWN.store(false, Ordering::SeqCst);
                    }
                    if suppress {
                        // Win down passed through to the system, but this Win up
                        // is swallowed so the shell never sees a lone release of
                        // a stop-submit chord. Re-inject a synthetic release so
                        // the Windows key is not treated as still held down.
                        release_modifiers();
                        return 1;
                    }
                }
            }
            let stop_submit_shortcut = current_stop_submit_shortcut();
            let mask_win_space = super::win_space_mask_applies(stop_submit_shortcut);
            if mask_win_space && (is_win || is_space) && (is_down || is_up) {
                let input = WinSpaceInput {
                    key: win_space_key_from_vk(keyboard.vkCode),
                    kind: if is_down {
                        WinSpaceEventKind::Down
                    } else {
                        WinSpaceEventKind::Up
                    },
                    modifiers: WinSpaceModifiers {
                        ctrl: is_key_down(VK_CONTROL as i32),
                        alt: alt_down,
                        shift: is_key_down(VK_SHIFT as i32),
                    },
                    source: if (keyboard.flags & LLKHF_INJECTED) != 0 {
                        WinSpaceEventSource::ForeignInjected
                    } else {
                        WinSpaceEventSource::Physical
                    },
                };
                let transition = win_space_state()
                    .lock()
                    .map(|mut state| state.handle(input))
                    .unwrap_or_else(|_| super::WinSpaceTransition::pass_through());

                if transition.emit_pressed {
                    eprintln!("[dictation-tauri][hotkey] win-space physical chord activated");
                }
                if transition.inject_mask {
                    inject_win_space_menu_mask();
                }
                if transition.emit_pressed {
                    send_event(NativeAltSpaceEvent::StopSubmitPressed);
                }
                if transition.emit_released {
                    eprintln!("[dictation-tauri][hotkey] win-space space-up suppressed");
                    send_event(NativeAltSpaceEvent::StopSubmit);
                    eprintln!("[dictation-tauri][hotkey] win-space released");
                }

                if transition.decision != WinSpaceDecision::PassThrough {
                    return 1;
                }
            }
            let win_down =
                LEFT_WIN_DOWN.load(Ordering::SeqCst) || RIGHT_WIN_DOWN.load(Ordering::SeqCst);
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
            let is_stop_submit_key = keyboard.vkCode == stop_submit_shortcut.key_vk;
            if is_stop_submit_key
                && is_down
                && exact_shortcut_combo(stop_submit_shortcut, alt_down, win_down)
            {
                eprintln!(
                    "[dictation-tauri][hotkey] native stop-submit captured keydown win_down={win_down}"
                );
                STOP_SUBMIT_DOWN.store(true, Ordering::SeqCst);
                if stop_submit_shortcut.win {
                    SUPPRESS_STOP_SUBMIT_WIN_UP.store(true, Ordering::SeqCst);
                }
                send_event(NativeAltSpaceEvent::StopSubmitPressed);
                return 1;
            }

            if is_stop_submit_key && is_up && STOP_SUBMIT_DOWN.swap(false, Ordering::SeqCst) {
                eprintln!("[dictation-tauri][hotkey] native stop-submit captured keyup");
                send_event(NativeAltSpaceEvent::StopSubmit);
                return 1;
            }

            if is_stop_submit_key && is_down && STOP_SUBMIT_DOWN.load(Ordering::SeqCst) {
                return 1;
            }

            if is_down && !alt_down && !modifier_key_down() {
                if let Some(chord_key) = take_armed_preset_chord(keyboard.vkCode) {
                    send_event(NativeAltSpaceEvent::PresetPickerChord(chord_key));
                    return 1;
                }
            }

            let preset_shortcut = current_preset_picker_shortcut();
            let is_preset_key = keyboard.vkCode == preset_shortcut.key_vk;
            if is_preset_key && is_down && exact_shortcut_combo(preset_shortcut, alt_down, win_down)
            {
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
                    send_event(NativeAltSpaceEvent::Capture(Cow::Borrowed(
                        ALT_SPACE_DESKTOP_CONTROL_HOTKEY,
                    )));
                }
                return 1;
            }

            if capture_enabled && is_space && is_up && SPACE_DOWN.swap(false, Ordering::SeqCst) {
                return 1;
            }

            if is_space && alt_down && is_down && hotkey_enabled {
                if !SPACE_DOWN.swap(true, Ordering::SeqCst) {
                    SUPPRESS_NEXT_ALT_UP_ONLY.store(true, Ordering::SeqCst);
                    eprintln!("[dictation-tauri][hotkey] native Alt+Space captured keydown");
                    send_event(NativeAltSpaceEvent::Pressed);
                }
                return 1;
            }

            if is_space && is_up && SPACE_DOWN.swap(false, Ordering::SeqCst) && hotkey_enabled {
                eprintln!("[dictation-tauri][hotkey] native Alt+Space captured keyup");
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

    fn take_armed_preset_chord(vk_code: u32) -> Option<Cow<'static, str>> {
        let mut guard = PRESET_CHORD_ARMED_AT
            .get_or_init(|| Mutex::new(None))
            .lock()
            .ok()?;
        let armed_at = guard.take()?;
        if armed_at.elapsed() > PRESET_CHORD_TIMEOUT {
            return None;
        }
        let chord_key = canonical_key_from_vk(vk_code)?;
        Some(super::shortcut_value(chord_key))
    }

    fn modifier_key_down() -> bool {
        is_key_down(VK_SHIFT as i32)
            || is_key_down(VK_CONTROL as i32)
            || is_key_down(VK_LWIN as i32)
            || is_key_down(VK_RWIN as i32)
    }

    fn capture_shortcut_from_keyboard(vk_code: u32, alt_down: bool) -> Option<Cow<'static, str>> {
        let shift_down = is_key_down(VK_SHIFT as i32);
        let ctrl_down = is_key_down(VK_CONTROL as i32);
        let win_down = is_key_down(VK_LWIN as i32) || is_key_down(VK_RWIN as i32);
        if !win_down && !ctrl_down && !alt_down && !shift_down {
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
        if win_down {
            parts.push("Win".to_string());
        }
        parts.push(key);
        Some(super::shortcut_value(parts.join("+")))
    }

    fn canonical_key_from_vk(vk_code: u32) -> Option<String> {
        match vk_code {
            0x30..=0x39 | 0x41..=0x5A => Some(char::from_u32(vk_code)?.to_string()),
            0x70..=0x7B => Some(format!("F{}", vk_code - 0x6F)),
            value if value == VK_SPACE as u32 => Some("Space".to_string()),
            _ => None,
        }
    }

    fn current_stop_submit_shortcut() -> NativeShortcutChord {
        STOP_SUBMIT_SHORTCUT
            .lock()
            .map(|guard| *guard)
            .unwrap_or(NativeShortcutChord {
                ctrl: false,
                alt: false,
                shift: false,
                win: true,
                key_vk: VK_SPACE as u32,
            })
    }

    fn current_preset_picker_shortcut() -> NativeShortcutChord {
        PRESET_PICKER_SHORTCUT
            .lock()
            .map(|guard| *guard)
            .unwrap_or(NativeShortcutChord {
                ctrl: false,
                alt: true,
                shift: false,
                win: false,
                key_vk: 0x51,
            })
    }

    fn exact_shortcut_combo(shortcut: NativeShortcutChord, alt_down: bool, win_down: bool) -> bool {
        let shift_down = is_key_down(VK_SHIFT as i32);
        let ctrl_down = is_key_down(VK_CONTROL as i32);

        alt_down == shortcut.alt
            && shift_down == shortcut.shift
            && ctrl_down == shortcut.ctrl
            && win_down == shortcut.win
    }

    fn is_key_down(vk: i32) -> bool {
        unsafe { (GetAsyncKeyState(vk) & 0x8000u16 as i16) != 0 }
    }
    fn win_space_key_from_vk(vk_code: u32) -> WinSpaceKey {
        match vk_code {
            value if value == VK_LWIN as u32 => WinSpaceKey::LeftWin,
            value if value == VK_RWIN as u32 => WinSpaceKey::RightWin,
            value if value == VK_SPACE as u32 => WinSpaceKey::Space,
            _ => WinSpaceKey::Other,
        }
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

    fn win_space_menu_mask_input(key_up: bool) -> WindowsInput {
        WindowsInput {
            r#type: WINDOWS_INPUT_KEYBOARD,
            Anonymous: WindowsInput0 {
                ki: WindowsKeybdInput {
                    wVk: VIRTUAL_KEY(WIN_SPACE_MASK_KEY_VK as u16),
                    wScan: 0,
                    dwFlags: if key_up {
                        WINDOWS_KEYEVENTF_KEYUP
                    } else {
                        Default::default()
                    },
                    time: 0,
                    dwExtraInfo: WIN_SPACE_OWN_INJECTED_EXTRA_INFO,
                },
            },
        }
    }

    fn inject_win_space_menu_mask() {
        let inputs = [
            win_space_menu_mask_input(false),
            win_space_menu_mask_input(true),
        ];
        let sent = unsafe { WindowsSendInput(&inputs, std::mem::size_of::<WindowsInput>() as i32) };
        if sent == inputs.len() as u32 {
            eprintln!("[dictation-tauri][hotkey] win-space menu mask injected");
        } else {
            eprintln!(
                "[dictation-tauri][hotkey] win-space menu mask injection failed sent={} expected={}",
                sent,
                inputs.len()
            );
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
    #[cfg(test)]
    mod tests {
        use super::{exact_shortcut_combo, NativeShortcutChord};

        #[test]
        fn win_space_requires_tracked_windows_modifier() {
            let shortcut = NativeShortcutChord {
                ctrl: false,
                alt: false,
                shift: false,
                win: true,
                key_vk: 0x20,
            };

            assert!(exact_shortcut_combo(shortcut, false, true));
            assert!(!exact_shortcut_combo(shortcut, false, false));
        }

        #[test]
        fn non_windows_shortcut_rejects_tracked_windows_modifier() {
            let shortcut = NativeShortcutChord {
                ctrl: false,
                alt: true,
                shift: false,
                win: false,
                key_vk: 0x51,
            };

            assert!(!exact_shortcut_combo(shortcut, true, true));
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
    pub fn set_stop_submit_shortcut(_shortcut: NativeShortcutChord) -> bool {
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
    pub fn shutdown_alt_space_hook() {}

    pub fn restart_alt_space_hook<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        hotkey: EffectiveDictationHotkey,
    ) -> Result<(), Box<dyn Error>> {
        register_alt_space_hook(app, hotkey)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win_space_input(
        key: WinSpaceKey,
        kind: WinSpaceEventKind,
        modifiers: WinSpaceModifiers,
        source: WinSpaceEventSource,
    ) -> WinSpaceInput {
        WinSpaceInput {
            key,
            kind,
            modifiers,
            source,
        }
    }

    fn win_down(key: WinSpaceKey, source: WinSpaceEventSource) -> WinSpaceInput {
        win_space_input(
            key,
            WinSpaceEventKind::Down,
            WinSpaceModifiers::default(),
            source,
        )
    }

    fn win_up(key: WinSpaceKey) -> WinSpaceInput {
        win_space_input(
            key,
            WinSpaceEventKind::Up,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::Physical,
        )
    }

    fn space_event(
        kind: WinSpaceEventKind,
        modifiers: WinSpaceModifiers,
        source: WinSpaceEventSource,
    ) -> WinSpaceInput {
        win_space_input(WinSpaceKey::Space, kind, modifiers, source)
    }

    #[test]
    fn win_space_machine_emits_once_and_returns_to_clean_state() {
        let mut state = WinSpaceState::default();

        assert_eq!(
            state
                .handle(win_down(
                    WinSpaceKey::LeftWin,
                    WinSpaceEventSource::Physical
                ))
                .decision,
            WinSpaceDecision::PassThrough
        );
        let activated = state.handle(space_event(
            WinSpaceEventKind::Down,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::Physical,
        ));
        assert_eq!(activated.decision, WinSpaceDecision::SuppressAndMaskWin);
        assert!(activated.emit_pressed);
        assert!(activated.inject_mask);

        let repeated = state.handle(space_event(
            WinSpaceEventKind::Down,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::Physical,
        ));
        assert_eq!(repeated.decision, WinSpaceDecision::Suppress);
        assert!(!repeated.emit_pressed);
        assert!(!repeated.emit_released);

        let released = state.handle(space_event(
            WinSpaceEventKind::Up,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::Physical,
        ));
        assert_eq!(released.decision, WinSpaceDecision::SuppressAndEmitReleased);
        assert!(released.emit_released);
        assert!(!released.emit_pressed);
        assert_eq!(
            state.handle(win_up(WinSpaceKey::LeftWin)).decision,
            WinSpaceDecision::PassThrough
        );
        assert_eq!(state, WinSpaceState::default());
    }

    #[test]
    fn right_win_activates_the_same_machine_path() {
        let mut state = WinSpaceState::default();

        state.handle(win_down(
            WinSpaceKey::RightWin,
            WinSpaceEventSource::Physical,
        ));
        let pressed = state.handle(space_event(
            WinSpaceEventKind::Down,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::Physical,
        ));
        let released = state.handle(space_event(
            WinSpaceEventKind::Up,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::Physical,
        ));
        state.handle(win_up(WinSpaceKey::RightWin));
        assert!(pressed.emit_pressed);
        assert!(released.emit_released);
        assert!(!state.right_win_physical_down);
        assert!(!state.chord_active);
    }

    #[test]
    fn releasing_win_before_space_keeps_release_exactly_once() {
        let mut state = WinSpaceState::default();

        state.handle(win_down(
            WinSpaceKey::LeftWin,
            WinSpaceEventSource::Physical,
        ));
        let pressed = state.handle(space_event(
            WinSpaceEventKind::Down,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::Physical,
        ));
        let win_released = state.handle(win_up(WinSpaceKey::LeftWin));
        let space_released = state.handle(space_event(
            WinSpaceEventKind::Up,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::Physical,
        ));

        assert!(pressed.emit_pressed);
        assert_eq!(win_released.decision, WinSpaceDecision::PassThrough);
        assert!(space_released.emit_released);
        assert_eq!(state, WinSpaceState::default());
    }

    #[test]
    fn releasing_space_before_win_suppresses_space_only() {
        let mut state = WinSpaceState::default();

        state.handle(win_down(
            WinSpaceKey::LeftWin,
            WinSpaceEventSource::Physical,
        ));
        state.handle(space_event(
            WinSpaceEventKind::Down,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::Physical,
        ));
        let space_released = state.handle(space_event(
            WinSpaceEventKind::Up,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::Physical,
        ));
        let win_released = state.handle(win_up(WinSpaceKey::LeftWin));

        assert_eq!(
            space_released.decision,
            WinSpaceDecision::SuppressAndEmitReleased
        );
        assert_eq!(win_released.decision, WinSpaceDecision::PassThrough);
        assert_eq!(state, WinSpaceState::default());
    }

    #[test]
    fn own_injected_event_passes_without_changing_physical_state() {
        let mut state = WinSpaceState::default();
        state.handle(win_down(
            WinSpaceKey::LeftWin,
            WinSpaceEventSource::Physical,
        ));

        let own = state.handle(space_event(
            WinSpaceEventKind::Down,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::OwnInjected,
        ));

        assert_eq!(own.decision, WinSpaceDecision::PassThrough);
        assert!(!state.space_physical_down);
        assert!(!state.chord_active);
        assert!(!state.win_masked);
    }

    #[test]
    fn foreign_injected_event_uses_normal_hotkey_state() {
        let mut state = WinSpaceState::default();
        state.handle(win_down(
            WinSpaceKey::LeftWin,
            WinSpaceEventSource::ForeignInjected,
        ));
        let pressed = state.handle(space_event(
            WinSpaceEventKind::Down,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::ForeignInjected,
        ));
        let released = state.handle(space_event(
            WinSpaceEventKind::Up,
            WinSpaceModifiers::default(),
            WinSpaceEventSource::ForeignInjected,
        ));

        assert!(pressed.emit_pressed);
        assert!(released.emit_released);
    }

    #[test]
    fn win_only_win_e_and_extra_modifiers_pass_through() {
        let mut state = WinSpaceState::default();
        assert_eq!(
            state
                .handle(win_down(
                    WinSpaceKey::LeftWin,
                    WinSpaceEventSource::Physical
                ))
                .decision,
            WinSpaceDecision::PassThrough
        );
        assert_eq!(
            state
                .handle(win_space_input(
                    WinSpaceKey::Other,
                    WinSpaceEventKind::Down,
                    WinSpaceModifiers::default(),
                    WinSpaceEventSource::Physical,
                ))
                .decision,
            WinSpaceDecision::PassThrough
        );
        assert_eq!(
            state
                .handle(space_event(
                    WinSpaceEventKind::Down,
                    WinSpaceModifiers {
                        ctrl: true,
                        alt: false,
                        shift: false,
                    },
                    WinSpaceEventSource::Physical,
                ))
                .decision,
            WinSpaceDecision::PassThrough
        );
        assert!(!state.chord_active);
    }

    #[test]
    fn win_space_masking_applies_only_to_the_exact_stop_submit_chord() {
        let mut state = WinSpaceState::default();
        let alt_space = state.handle(space_event(
            WinSpaceEventKind::Down,
            WinSpaceModifiers {
                ctrl: false,
                alt: true,
                shift: false,
            },
            WinSpaceEventSource::Physical,
        ));
        assert_eq!(alt_space.decision, WinSpaceDecision::PassThrough);
        assert!(!win_space_mask_applies(NativeShortcutChord {
            ctrl: false,
            alt: true,
            shift: false,
            win: false,
            key_vk: 0x20,
        }));
        assert!(!win_space_mask_applies(NativeShortcutChord {
            ctrl: false,
            alt: false,
            shift: false,
            win: true,
            key_vk: 0x45,
        }));
        assert!(win_space_mask_applies(NativeShortcutChord {
            ctrl: false,
            alt: false,
            shift: false,
            win: true,
            key_vk: 0x20,
        }));
    }

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
                shortcut: Cow::Borrowed("Alt+Space"),
                target_snapshot: None,
            }
        );

        assert_eq!(
            desktop_control_hotkey_released_payload(fallback_hotkey(None)),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "released",
                shortcut: Cow::Borrowed("Ctrl+Shift+F9"),
                target_snapshot: None,
            }
        );
    }

    #[test]
    fn hotkey_queue_only_delivers_events_once_across_ready_drain_transition() {
        let payload = desktop_control_hotkey_pressed_payload(fallback_hotkey(None));
        let mut state = HotkeyListenerQueueState::default();

        // This represents the deterministic listen-before-drain gap. The
        // event is queued and has no live delivery decision at this point.
        assert!(state.queue_or_emit_live(payload.clone()));
        assert_eq!(state.pending, vec![payload.clone()]);

        // Ready=true and queue drain are one critical-section transition.
        assert_eq!(state.mark_ready_and_drain(), vec![payload.clone()]);
        assert!(state.pending.is_empty());
        assert!(state.ready);

        // Once ready, a later event is live-only and cannot be reintroduced by
        // a second drain.
        assert!(!state.queue_or_emit_live(payload));
        assert!(state.mark_ready_and_drain().is_empty());
    }

    #[test]
    fn hotkey_queue_is_bounded_while_listener_is_not_ready() {
        let mut state = HotkeyListenerQueueState::default();
        for _ in 0..(MAX_PENDING_HOTKEY_EVENTS + 2) {
            assert!(
                state.queue_or_emit_live(desktop_control_hotkey_pressed_payload(fallback_hotkey(
                    None
                ),))
            );
        }

        assert_eq!(state.pending.len(), MAX_PENDING_HOTKEY_EVENTS);
    }

    #[test]
    fn escape_cancel_payload_uses_existing_hotkey_event_channel() {
        assert_eq!(
            desktop_control_escape_cancel_payload(),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "cancel",
                shortcut: Cow::Borrowed("Escape"),
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
        let picker = preview_action_shortcut("Ctrl+Alt+P", false);
        assert_eq!(picker.as_deref(), Some("Ctrl+Alt+P"));

        let chord = native_shortcut_chord_from_request("Ctrl+Alt+P").unwrap();
        assert!(chord.ctrl);
        assert!(chord.alt);
        assert!(!chord.shift);
        assert!(!chord.win);
        assert_eq!(chord.key_vk, 0x50);

        assert!(preview_action_shortcut("Alt+Space", false).is_none());
        assert!(preview_action_shortcut("P", false).is_none());
    }

    #[test]
    fn stop_submit_accepts_win_space_and_defaults_to_it() {
        assert_eq!(STOP_SUBMIT_HOTKEY, "Win+Space");
        assert_eq!(
            preview_action_shortcut(STOP_SUBMIT_HOTKEY, true).as_deref(),
            Some(STOP_SUBMIT_HOTKEY)
        );
        assert!(preview_action_shortcut(STOP_SUBMIT_HOTKEY, false).is_none());

        let chord = native_shortcut_chord_from_request(STOP_SUBMIT_HOTKEY).unwrap();
        assert!(chord.win);
        assert_eq!(chord.key_vk, 0x20);
        assert_eq!(
            default_action_hotkey_config().stop_submit,
            STOP_SUBMIT_HOTKEY
        );
    }

    #[test]
    fn documents_preset_picker_hotkey() {
        assert_eq!(PRESET_PICKER_HOTKEY, "Alt+Q");
        let picker = preview_hotkey_registration_request(PRESET_PICKER_HOTKEY);
        assert!(!picker.can_apply);
        assert_eq!(picker.reason, Some("unsupported_shortcut"));
    }
}
