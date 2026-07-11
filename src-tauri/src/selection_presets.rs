use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const SELECTION_PRESETS_FILE: &str = "selection-presets.v1.json";

#[tauri::command]
pub fn get_selection_presets_store(app: AppHandle) -> Result<Value, String> {
    let path = selection_presets_path(&app).map_err(|error| error.to_string())?;
    if !path.exists() {
        return Ok(empty_store());
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let parsed: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    if parsed
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .unwrap_or_default()
        != 1
    {
        return Ok(empty_store());
    }

    Ok(parsed)
}

#[tauri::command]
pub fn save_selection_presets_store(app: AppHandle, store: Value) -> Result<Value, String> {
    let normalized = normalize_store(store);
    let path = selection_presets_path(&app).map_err(|error| error.to_string())?;
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

fn selection_presets_path(app: &AppHandle) -> tauri::Result<PathBuf> {
    let dir = app.path().app_data_dir()?;
    Ok(dir.join(SELECTION_PRESETS_FILE))
}

fn empty_store() -> Value {
    json!({
        "schemaVersion": 1,
        "starterCustomizations": {},
        "customPresets": {},
    })
}

fn normalize_store(store: Value) -> Value {
    json!({
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
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_unknown_store_shape() {
        let normalized = normalize_store(
            json!({ "schemaVersion": 99, "customPresets": { "custom-a": { "name": "A" } } }),
        );
        assert_eq!(normalized["schemaVersion"], 1);
        assert!(normalized["starterCustomizations"]
            .as_object()
            .unwrap()
            .is_empty());
        assert!(normalized["customPresets"]
            .as_object()
            .unwrap()
            .contains_key("custom-a"));
    }
}
