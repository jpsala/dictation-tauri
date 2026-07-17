use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

pub const USER_PREFERENCES_FILE: &str = "user-preferences.v1.json";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    pub schema_version: u8,
    #[serde(default = "default_show_dock_on_startup")]
    pub show_dock_on_startup: bool,
    #[serde(default)]
    pub review_before_delivery: bool,
    #[serde(default)]
    pub press_enter_after_paste: bool,
    #[serde(default = "default_follow_focus_until_delivery")]
    pub follow_focus_until_delivery: bool,
    #[serde(default)]
    pub auto_stop_on_silence_enabled: bool,
    #[serde(default = "default_auto_stop_silence_ms")]
    pub auto_stop_silence_ms: u64,
    #[serde(default)]
    pub mute_output_during_recording: bool,
    #[serde(default)]
    pub dictation_sound_cues_enabled: bool,
}

#[tauri::command]
pub fn get_user_preferences(app: AppHandle) -> Result<UserPreferences, String> {
    read_user_preferences(&app)
}

#[tauri::command]
pub fn set_user_preferences(
    app: AppHandle,
    preferences: UserPreferences,
) -> Result<UserPreferences, String> {
    let next = UserPreferences {
        schema_version: 1,
        show_dock_on_startup: preferences.show_dock_on_startup,
        review_before_delivery: preferences.review_before_delivery,
        press_enter_after_paste: preferences.press_enter_after_paste,
        follow_focus_until_delivery: preferences.follow_focus_until_delivery,
        auto_stop_on_silence_enabled: preferences.auto_stop_on_silence_enabled,
        auto_stop_silence_ms: normalize_auto_stop_silence_ms(preferences.auto_stop_silence_ms),
        mute_output_during_recording: preferences.mute_output_during_recording,
        dictation_sound_cues_enabled: preferences.dictation_sound_cues_enabled,
    };
    let path = preferences_path(&app).map_err(|error| error.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(
        path,
        serde_json::to_string_pretty(&next).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(next)
}

pub fn read_user_preferences_for_app<R: Runtime>(app: &AppHandle<R>) -> UserPreferences {
    read_user_preferences(app).unwrap_or_else(|error| {
        eprintln!("[dictation-tauri][preferences] unavailable: {error}");
        default_user_preferences()
    })
}

fn read_user_preferences<R: Runtime>(app: &AppHandle<R>) -> Result<UserPreferences, String> {
    let path = preferences_path(app).map_err(|error| error.to_string())?;
    if !path.exists() {
        return Ok(default_user_preferences());
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let parsed: UserPreferences = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    if parsed.schema_version != 1 {
        return Ok(default_user_preferences());
    }
    Ok(parsed)
}

fn preferences_path<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<PathBuf> {
    Ok(app.path().app_data_dir()?.join(USER_PREFERENCES_FILE))
}

pub fn default_user_preferences() -> UserPreferences {
    UserPreferences {
        schema_version: 1,
        show_dock_on_startup: default_show_dock_on_startup(),
        review_before_delivery: false,
        press_enter_after_paste: false,
        follow_focus_until_delivery: default_follow_focus_until_delivery(),
        auto_stop_on_silence_enabled: false,
        auto_stop_silence_ms: default_auto_stop_silence_ms(),
        mute_output_during_recording: false,
        dictation_sound_cues_enabled: false,
    }
}

fn default_show_dock_on_startup() -> bool {
    true
}

fn default_follow_focus_until_delivery() -> bool {
    true
}

fn default_auto_stop_silence_ms() -> u64 {
    1_200
}

fn normalize_auto_stop_silence_ms(value: u64) -> u64 {
    value.clamp(500, 10_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_safe_for_delivery() {
        let defaults = default_user_preferences();
        assert!(defaults.show_dock_on_startup);
        assert!(!defaults.review_before_delivery);
        assert!(!defaults.press_enter_after_paste);
        assert!(defaults.follow_focus_until_delivery);
        assert!(!defaults.auto_stop_on_silence_enabled);
        assert_eq!(defaults.auto_stop_silence_ms, 1_200);
        assert!(!defaults.mute_output_during_recording);
        assert!(!defaults.dictation_sound_cues_enabled);
    }

    #[test]
    fn auto_stop_silence_duration_is_clamped() {
        assert_eq!(normalize_auto_stop_silence_ms(100), 500);
        assert_eq!(normalize_auto_stop_silence_ms(1_500), 1_500);
        assert_eq!(normalize_auto_stop_silence_ms(60_000), 10_000);
    }
}
