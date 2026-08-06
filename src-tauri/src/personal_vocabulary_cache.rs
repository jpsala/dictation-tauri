use serde::{Deserialize, Serialize};
use std::{
    cmp::Ordering,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering as AtomicOrdering},
    time::{SystemTime, UNIX_EPOCH},
};

const CACHE_SCHEMA_VERSION: u8 = 1;
const MAX_RULES: usize = 500;
const MAX_CANDIDATES: usize = 8;
const MAX_TEXT_LENGTH: usize = 256;
const MAX_NOTE_LENGTH: usize = 280;
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PersonalVocabularyCandidate {
    pub(crate) id: String,
    pub(crate) written: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PersonalVocabularyRule {
    pub(crate) id: String,
    pub(crate) revision: String,
    pub(crate) spoken: String,
    pub(crate) candidates: Vec<PersonalVocabularyCandidate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) default_candidate_id: Option<String>,
    pub(crate) mode: String,
    pub(crate) enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) note: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PersonalVocabularySnapshot {
    pub(crate) revision: String,
    pub(crate) rules: Vec<PersonalVocabularyRule>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) scope: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PersonalVocabularyCacheFile {
    pub(crate) schema_version: u8,
    pub(crate) scope: String,
    pub(crate) snapshot: PersonalVocabularySnapshot,
    pub(crate) etag: String,
    pub(crate) fetched_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct PersonalVocabularyCacheError {
    pub(crate) code: String,
}

impl PersonalVocabularyCacheError {
    fn new(code: &str) -> Self {
        Self {
            code: code.to_string(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum PersonalVocabularyRefreshOutcome {
    Updated,
    NotModified,
    UsedLastKnownGood,
    NoUsableSnapshot,
}

pub(crate) enum PersonalVocabularyHttpResponse {
    NotModified,
    Snapshot {
        etag: String,
        body: serde_json::Value,
    },
}

pub(crate) trait PersonalVocabularyHttpClient {
    fn get_vocabulary(
        &self,
        etag: Option<&str>,
    ) -> Result<PersonalVocabularyHttpResponse, PersonalVocabularyCacheError>;
}

pub(crate) fn resolve_personal_vocabulary_cache_path(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<PathBuf, PersonalVocabularyCacheError> {
    let base = ["APPDATA", "LOCALAPPDATA", "XDG_DATA_HOME", "HOME"]
        .iter()
        .find_map(|key| env_lookup(key).filter(|value| !value.trim().is_empty()))
        .ok_or_else(|| PersonalVocabularyCacheError::new("cache_root_missing"))?;
    Ok(PathBuf::from(base)
        .join("dictation-tauri")
        .join("fixvox-personal-vocabulary.v1.json"))
}

pub(crate) fn read_personal_vocabulary_cache(
    path: &Path,
    expected_scope: &str,
) -> Result<Option<PersonalVocabularyCacheFile>, PersonalVocabularyCacheError> {
    if expected_scope.trim().is_empty() {
        return Err(PersonalVocabularyCacheError::new("scope_missing"));
    }
    for candidate in [path.to_path_buf(), backup_path(path)] {
        if !candidate.exists() {
            continue;
        }
        let bytes = match fs::read(&candidate) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        let parsed = match serde_json::from_slice::<PersonalVocabularyCacheFile>(&bytes) {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };
        if parsed.scope != expected_scope || parsed.schema_version != CACHE_SCHEMA_VERSION {
            continue;
        }
        if validate_cache_file(&parsed).is_ok() {
            return Ok(Some(parsed));
        }
    }
    Ok(None)
}

pub(crate) fn write_personal_vocabulary_cache_atomic(
    path: &Path,
    scope: &str,
    snapshot: PersonalVocabularySnapshot,
    etag: &str,
    fetched_at: &str,
) -> Result<PersonalVocabularyCacheFile, PersonalVocabularyCacheError> {
    let file = PersonalVocabularyCacheFile {
        schema_version: CACHE_SCHEMA_VERSION,
        scope: scope.to_string(),
        snapshot,
        etag: etag.to_string(),
        fetched_at: fetched_at.to_string(),
    };
    validate_cache_file(&file)?;
    let body = serde_json::to_vec_pretty(&file)
        .map_err(|_| PersonalVocabularyCacheError::new("cache_serialize_failed"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| PersonalVocabularyCacheError::new("cache_directory_failed"))?;
    }
    if let Ok(bytes) = fs::read(path) {
        if let Ok(current) = serde_json::from_slice::<PersonalVocabularyCacheFile>(&bytes) {
            if current.scope == scope
                && validate_cache_file(&current).is_ok()
                && compare_decimal_revisions(&file.snapshot.revision, &current.snapshot.revision)
                    != Ordering::Greater
            {
                return Err(PersonalVocabularyCacheError::new("cache_snapshot_stale"));
            }
        }
    }
    let temp = temp_path(path);
    let temp_guard = TempFileGuard::new(temp.clone());
    let mut handle = fs::File::create(&temp)
        .map_err(|_| PersonalVocabularyCacheError::new("cache_temp_create_failed"))?;
    handle
        .write_all(&body)
        .map_err(|_| PersonalVocabularyCacheError::new("cache_temp_write_failed"))?;
    handle
        .sync_all()
        .map_err(|_| PersonalVocabularyCacheError::new("cache_temp_sync_failed"))?;
    let backup = backup_path(path);
    if path.exists() {
        let preserve_last_known_good = fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<PersonalVocabularyCacheFile>(&bytes).ok())
            .is_some_and(|current| current.scope == scope && validate_cache_file(&current).is_ok());
        if preserve_last_known_good {
            let _ = fs::copy(path, &backup);
        }
    }
    if fs::rename(&temp, path).is_err() {
        let _ = fs::remove_file(path);
        fs::rename(&temp, path)
            .map_err(|_| PersonalVocabularyCacheError::new("cache_replace_failed"))?;
    }
    temp_guard.keep();
    Ok(file)
}

pub(crate) fn refresh_personal_vocabulary<C: PersonalVocabularyHttpClient>(
    path: &Path,
    expected_scope: &str,
    client: &C,
) -> Result<PersonalVocabularyRefreshOutcome, PersonalVocabularyCacheError> {
    let existing = read_personal_vocabulary_cache(path, expected_scope)?;
    let response = match client.get_vocabulary(existing.as_ref().map(|cache| cache.etag.as_str())) {
        Ok(response) => response,
        Err(error) if existing.is_some() => {
            let _ = error;
            return Ok(PersonalVocabularyRefreshOutcome::UsedLastKnownGood);
        }
        Err(error) => return Err(error),
    };
    match response {
        PersonalVocabularyHttpResponse::NotModified => {
            if existing.is_some() {
                Ok(PersonalVocabularyRefreshOutcome::NotModified)
            } else {
                Ok(PersonalVocabularyRefreshOutcome::NoUsableSnapshot)
            }
        }
        PersonalVocabularyHttpResponse::Snapshot { etag, body } => {
            let parsed = serde_json::from_value::<PersonalVocabularySnapshot>(body);
            let snapshot = match parsed {
                Ok(snapshot) if snapshot.scope.as_deref() == Some(expected_scope) => snapshot,
                _ => {
                    return Ok(if existing.is_some() {
                        PersonalVocabularyRefreshOutcome::UsedLastKnownGood
                    } else {
                        PersonalVocabularyRefreshOutcome::NoUsableSnapshot
                    });
                }
            };
            if existing
                .as_ref()
                .is_some_and(|cache| cache.etag == etag && cache.snapshot == snapshot)
            {
                return Ok(PersonalVocabularyRefreshOutcome::NotModified);
            }
            if existing.as_ref().is_some_and(|cache| {
                compare_decimal_revisions(&snapshot.revision, &cache.snapshot.revision)
                    != Ordering::Greater
            }) {
                return Ok(PersonalVocabularyRefreshOutcome::UsedLastKnownGood);
            }
            match write_personal_vocabulary_cache_atomic(
                path,
                expected_scope,
                snapshot,
                &etag,
                &current_timestamp(),
            ) {
                Ok(_) => Ok(PersonalVocabularyRefreshOutcome::Updated),
                Err(_) if existing.is_some() => {
                    Ok(PersonalVocabularyRefreshOutcome::UsedLastKnownGood)
                }
                Err(error) => Err(error),
            }
        }
    }
}

fn validate_cache_file(
    file: &PersonalVocabularyCacheFile,
) -> Result<(), PersonalVocabularyCacheError> {
    if file.schema_version != CACHE_SCHEMA_VERSION
        || !safe_scope(&file.scope)
        || file.etag.trim().is_empty()
        || file.fetched_at.trim().is_empty()
    {
        return Err(PersonalVocabularyCacheError::new("cache_contract_invalid"));
    }
    if !decimal_revision(&file.snapshot.revision)
        || file.snapshot.scope.as_deref() != Some(file.scope.as_str())
    {
        return Err(PersonalVocabularyCacheError::new(
            "snapshot_contract_invalid",
        ));
    }
    if file.snapshot.rules.len() > MAX_RULES {
        return Err(PersonalVocabularyCacheError::new("rules_limit"));
    }
    let mut ids = std::collections::HashSet::new();
    for rule in &file.snapshot.rules {
        if !ids.insert(rule.id.clone())
            || !decimal_revision(&rule.revision)
            || !safe_id(&rule.id)
            || !safe_text(&rule.spoken, MAX_TEXT_LENGTH)
            || rule.created_at.trim().is_empty()
            || rule.updated_at.trim().is_empty()
        {
            return Err(PersonalVocabularyCacheError::new("rule_contract_invalid"));
        }
        if rule.mode != "automatic" && rule.mode != "ask"
            || rule.candidates.is_empty()
            || rule.candidates.len() > MAX_CANDIDATES
            || rule.mode == "automatic" && rule.candidates.len() != 1
        {
            return Err(PersonalVocabularyCacheError::new("rule_mode_invalid"));
        }
        let mut candidate_ids = std::collections::HashSet::new();
        for candidate in &rule.candidates {
            if !candidate_ids.insert(candidate.id.clone())
                || !safe_id(&candidate.id)
                || !safe_text(&candidate.written, MAX_TEXT_LENGTH)
            {
                return Err(PersonalVocabularyCacheError::new(
                    "candidate_contract_invalid",
                ));
            }
        }
        if rule
            .default_candidate_id
            .as_ref()
            .is_some_and(|id| !candidate_ids.contains(id))
        {
            return Err(PersonalVocabularyCacheError::new(
                "default_candidate_invalid",
            ));
        }
        if rule
            .note
            .as_ref()
            .is_some_and(|note| !safe_text(note, MAX_NOTE_LENGTH))
        {
            return Err(PersonalVocabularyCacheError::new("note_invalid"));
        }
    }
    Ok(())
}

fn safe_scope(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
}

fn safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .next()
            .is_some_and(|byte| byte.is_ascii_alphanumeric())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
}

fn safe_text(value: &str, max_len: usize) -> bool {
    !value.is_empty()
        && value.encode_utf16().count() <= max_len
        && !value
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\t' | '\n' | '\r'))
        && !value.contains("{{")
        && !value.contains("}}")
        && !value.contains("${")
        && !value.contains("[[")
        && !value.contains("]]")
}

fn decimal_revision(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 24
        && value.bytes().all(|byte| byte.is_ascii_digit())
        && (value == "0" || !value.starts_with('0'))
}

fn backup_path(path: &Path) -> PathBuf {
    let mut backup = path.as_os_str().to_os_string();
    backup.push(".bak");
    PathBuf::from(backup)
}

fn temp_path(path: &Path) -> PathBuf {
    let mut temp = path.as_os_str().to_os_string();
    let sequence = TEMP_COUNTER.fetch_add(1, AtomicOrdering::Relaxed);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    temp.push(format!(
        ".tmp-{}-{}-{}",
        std::process::id(),
        timestamp,
        sequence
    ));
    PathBuf::from(temp)
}

struct TempFileGuard {
    path: PathBuf,
    retained: bool,
}

impl TempFileGuard {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            retained: false,
        }
    }

    fn keep(mut self) {
        self.retained = true;
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if !self.retained {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn compare_decimal_revisions(left: &str, right: &str) -> Ordering {
    let left = left.trim_start_matches('0');
    let right = right.trim_start_matches('0');
    let left = if left.is_empty() { "0" } else { left };
    let right = if right.is_empty() { "0" } else { right };
    left.len().cmp(&right.len()).then_with(|| left.cmp(right))
}

fn current_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| format!("{}", duration.as_secs()))
        .unwrap_or_else(|_| "0".to_string())
}
