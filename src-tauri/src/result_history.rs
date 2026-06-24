use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const RESULT_HISTORY_FILE: &str = "result-history.v1.jsonl";
pub const RESULT_HISTORY_LIMIT: usize = 50;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultHistoryEvidence {
    pub status: String,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultHistoryEntry {
    pub schema_version: u8,
    pub id: String,
    pub run_id: String,
    pub source: String,
    pub text: String,
    pub text_length: usize,
    pub created_at: String,
    pub delivery_evidence: Option<ResultHistoryEvidence>,
    pub provider: Option<String>,
    pub model: Option<String>,
}

#[tauri::command]
pub fn append_result_history_entry(
    app: AppHandle,
    entry: ResultHistoryEntry,
) -> Result<Vec<ResultHistoryEntry>, String> {
    if entry.schema_version != 1 {
        return Err("Unsupported result history schema version".to_string());
    }

    if entry.text.trim().is_empty() {
        return list_result_history_entries(app);
    }

    if entry.delivery_evidence.as_ref().map(|e| e.status.as_str()) == Some("paste_observed") {
        return Err("paste_observed history entries require a verified observer".to_string());
    }

    let path = history_path(&app).map_err(|error| error.to_string())?;
    let mut entries = read_entries_from_path(&path).map_err(|error| error.to_string())?;
    entries.retain(|existing| existing.id != entry.id);
    entries.push_back(entry);
    while entries.len() > RESULT_HISTORY_LIMIT {
        entries.pop_front();
    }
    write_entries_to_path(&path, &entries).map_err(|error| error.to_string())?;
    Ok(entries.into_iter().collect())
}

#[tauri::command]
pub fn list_result_history_entries(app: AppHandle) -> Result<Vec<ResultHistoryEntry>, String> {
    let path = history_path(&app).map_err(|error| error.to_string())?;
    Ok(read_entries_from_path(&path)
        .map_err(|error| error.to_string())?
        .into_iter()
        .collect())
}

#[tauri::command]
pub fn clear_result_history(app: AppHandle) -> Result<(), String> {
    let path = history_path(&app).map_err(|error| error.to_string())?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn history_path(app: &AppHandle) -> tauri::Result<PathBuf> {
    let dir = app.path().app_data_dir()?;
    Ok(dir.join(RESULT_HISTORY_FILE))
}

fn read_entries_from_path(path: &PathBuf) -> std::io::Result<VecDeque<ResultHistoryEntry>> {
    if !path.exists() {
        return Ok(VecDeque::new());
    }

    let file = fs::File::open(path)?;
    let reader = BufReader::new(file);
    let mut entries = VecDeque::new();
    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(entry) = serde_json::from_str::<ResultHistoryEntry>(&line) {
            if entry.schema_version == 1 && !entry.text.trim().is_empty() {
                entries.push_back(entry);
            }
        }
    }
    while entries.len() > RESULT_HISTORY_LIMIT {
        entries.pop_front();
    }
    Ok(entries)
}

fn write_entries_to_path(
    path: &PathBuf,
    entries: &VecDeque<ResultHistoryEntry>,
) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut file = fs::File::create(path)?;
    for entry in entries {
        let json = serde_json::to_string(entry)?;
        writeln!(file, "{json}")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_bounded_successful_plaintext_entries() {
        let mut entries = VecDeque::new();
        for index in 0..(RESULT_HISTORY_LIMIT + 3) {
            entries.push_back(ResultHistoryEntry {
                schema_version: 1,
                id: format!("entry-{index}"),
                run_id: format!("run-{index}"),
                source: "dictation".to_string(),
                text: "hello".to_string(),
                text_length: 5,
                created_at: "2026-06-24T00:00:00.000Z".to_string(),
                delivery_evidence: Some(ResultHistoryEvidence {
                    status: "paste_sent".to_string(),
                    reason: Some("sent without observation".to_string()),
                }),
                provider: None,
                model: None,
            });
        }

        while entries.len() > RESULT_HISTORY_LIMIT {
            entries.pop_front();
        }

        assert_eq!(entries.len(), RESULT_HISTORY_LIMIT);
        assert_eq!(
            entries.front().map(|entry| entry.id.as_str()),
            Some("entry-3")
        );
        assert!(entries
            .iter()
            .all(|entry| entry.delivery_evidence.as_ref().unwrap().status != "paste_observed"));
    }
}
