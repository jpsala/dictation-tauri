use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const SELECTION_PRESETS_FILE: &str = "selection-presets.v2.json";
const LEGACY_SELECTION_PRESETS_FILE: &str = "selection-presets.v1.json";

#[tauri::command]
pub fn get_selection_presets_store(app: AppHandle) -> Result<Value, String> {
    let current_path = selection_presets_path(&app, SELECTION_PRESETS_FILE)
        .map_err(|error| error.to_string())?;
    if current_path.exists() {
        return read_store(current_path);
    }

    let legacy_path = selection_presets_path(&app, LEGACY_SELECTION_PRESETS_FILE)
        .map_err(|error| error.to_string())?;
    if legacy_path.exists() {
        return read_store(legacy_path);
    }

    Ok(seed_request())
}

#[tauri::command]
pub fn save_selection_presets_store(app: AppHandle, store: Value) -> Result<Value, String> {
    let normalized = normalize_v2_store(store);
    let path = selection_presets_path(&app, SELECTION_PRESETS_FILE)
        .map_err(|error| error.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::write(
        path,
        serde_json::to_string_pretty(&normalized).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(normalized)
}

fn read_store(path: PathBuf) -> Result<Value, String> {
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let parsed: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(normalize_store_for_read(parsed))
}

fn selection_presets_path(app: &AppHandle, file_name: &str) -> tauri::Result<PathBuf> {
    let dir = app.path().app_data_dir()?;
    Ok(dir.join(file_name))
}

fn seed_request() -> Value {
    json!({
        "schemaVersion": 2,
        "presets": {},
        "seedRequired": true,
    })
}

fn normalize_store_for_read(store: Value) -> Value {
    match store
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .unwrap_or_default()
    {
        2 => normalize_v2_store(store),
        1 => json!({
            "schemaVersion": 1,
            "starterCustomizations": store
                .get("starterCustomizations")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default(),
            "customPresets": store
                .get("customPresets")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default(),
        }),
        _ => seed_request(),
    }
}

fn normalize_v2_store(store: Value) -> Value {
    json!({
        "schemaVersion": 2,
        "presets": store
            .get("presets")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_an_empty_initialized_v2_store() {
        let normalized = normalize_store_for_read(json!({ "schemaVersion": 2, "presets": {} }));
        assert_eq!(normalized["schemaVersion"], 2);
        assert!(normalized["presets"].as_object().unwrap().is_empty());
        assert!(normalized.get("seedRequired").is_none());
    }

    #[test]
    fn preserves_v1_fields_for_renderer_migration() {
        let normalized = normalize_store_for_read(json!({
            "schemaVersion": 1,
            "starterCustomizations": { "corregir-texto": { "enabled": false } },
            "customPresets": { "custom-a": { "name": "A" } },
        }));
        assert_eq!(normalized["schemaVersion"], 1);
        assert!(normalized["starterCustomizations"]["corregir-texto"].is_object());
        assert!(normalized["customPresets"]["custom-a"].is_object());
    }

    #[test]
    fn unknown_store_shape_requests_first_install_seed() {
        let normalized = normalize_store_for_read(json!({ "schemaVersion": 99 }));
        assert_eq!(normalized["schemaVersion"], 2);
        assert_eq!(normalized["seedRequired"], true);
    }
}
