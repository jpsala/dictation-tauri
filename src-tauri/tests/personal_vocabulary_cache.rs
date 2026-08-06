#[path = "../src/personal_vocabulary_cache.rs"]
mod personal_vocabulary_cache;

use personal_vocabulary_cache::{
    read_personal_vocabulary_cache, refresh_personal_vocabulary,
    write_personal_vocabulary_cache_atomic, PersonalVocabularyCandidate,
    PersonalVocabularyHttpClient, PersonalVocabularyHttpResponse, PersonalVocabularyRefreshOutcome,
    PersonalVocabularyRule, PersonalVocabularySnapshot,
};
use std::{fs, path::PathBuf, sync::Mutex};

fn temp_path(label: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "fixvox-vocabulary-cache-{label}-{}-{}.json",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let _ = fs::remove_file(&path);
    let mut backup = path.as_os_str().to_os_string();
    backup.push(".bak");
    let _ = fs::remove_file(PathBuf::from(backup));
    path
}

fn snapshot(scope: &str, revision: &str, written: &str) -> PersonalVocabularySnapshot {
    PersonalVocabularySnapshot {
        revision: revision.to_string(),
        scope: Some(scope.to_string()),
        rules: vec![PersonalVocabularyRule {
            id: "rule-1".to_string(),
            revision: revision.to_string(),
            spoken: "app punto svelte".to_string(),
            candidates: vec![PersonalVocabularyCandidate {
                id: "candidate-1".to_string(),
                written: written.to_string(),
            }],
            default_candidate_id: Some("candidate-1".to_string()),
            mode: "automatic".to_string(),
            enabled: true,
            note: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }],
    }
}

struct FixtureClient {
    response: Mutex<
        Option<
            Result<
                PersonalVocabularyHttpResponse,
                personal_vocabulary_cache::PersonalVocabularyCacheError,
            >,
        >,
    >,
}

impl PersonalVocabularyHttpClient for FixtureClient {
    fn get_vocabulary(
        &self,
        _etag: Option<&str>,
    ) -> Result<
        PersonalVocabularyHttpResponse,
        personal_vocabulary_cache::PersonalVocabularyCacheError,
    > {
        self.response.lock().unwrap().take().unwrap()
    }
}

#[test]
fn atomic_cache_keeps_last_known_good_when_current_file_is_corrupt() {
    let path = temp_path("corrupt");
    write_personal_vocabulary_cache_atomic(
        &path,
        "scope-a",
        snapshot("scope-a", "1", "app.svelte"),
        "\"vocabulary-1\"",
        "now",
    )
    .unwrap();
    write_personal_vocabulary_cache_atomic(
        &path,
        "scope-a",
        snapshot("scope-a", "2", "app.svelte"),
        "\"vocabulary-2\"",
        "now",
    )
    .unwrap();
    fs::write(&path, b"not-json").unwrap();
    let cached = read_personal_vocabulary_cache(&path, "scope-a")
        .unwrap()
        .unwrap();
    assert_eq!(cached.snapshot.revision, "1");
    assert_eq!(cached.snapshot.rules[0].candidates[0].written, "app.svelte");
    assert!(read_personal_vocabulary_cache(&path, "scope-b")
        .unwrap()
        .is_none());
    let _ = fs::remove_file(path);
}

#[test]
fn refresh_is_conditional_deduped_and_offline_safe() {
    let path = temp_path("refresh");
    write_personal_vocabulary_cache_atomic(
        &path,
        "scope-a",
        snapshot("scope-a", "1", "app.svelte"),
        "\"vocabulary-1\"",
        "now",
    )
    .unwrap();
    let not_modified = FixtureClient {
        response: Mutex::new(Some(Ok(PersonalVocabularyHttpResponse::NotModified))),
    };
    assert_eq!(
        refresh_personal_vocabulary(&path, "scope-a", &not_modified).unwrap(),
        PersonalVocabularyRefreshOutcome::NotModified
    );

    let duplicate = FixtureClient {
        response: Mutex::new(Some(Ok(PersonalVocabularyHttpResponse::Snapshot {
            etag: "\"vocabulary-1\"".to_string(),
            body: serde_json::to_value(snapshot("scope-a", "1", "app.svelte")).unwrap(),
        }))),
    };
    assert_eq!(
        refresh_personal_vocabulary(&path, "scope-a", &duplicate).unwrap(),
        PersonalVocabularyRefreshOutcome::NotModified
    );

    let invalid = FixtureClient {
        response: Mutex::new(Some(Ok(PersonalVocabularyHttpResponse::Snapshot {
            etag: "\"future\"".to_string(),
            body: serde_json::json!({ "revision": "2", "rules": [{ "spoken": "raw" }] }),
        }))),
    };
    assert_eq!(
        refresh_personal_vocabulary(&path, "scope-a", &invalid).unwrap(),
        PersonalVocabularyRefreshOutcome::UsedLastKnownGood
    );

    let stale = FixtureClient {
        response: Mutex::new(Some(Ok(PersonalVocabularyHttpResponse::Snapshot {
            etag: "\"vocabulary-old\"".to_string(),
            body: serde_json::to_value(snapshot("scope-a", "0", "old.svelte")).unwrap(),
        }))),
    };
    assert_eq!(
        refresh_personal_vocabulary(&path, "scope-a", &stale).unwrap(),
        PersonalVocabularyRefreshOutcome::UsedLastKnownGood
    );

    let offline = FixtureClient {
        response: Mutex::new(Some(Err(
            personal_vocabulary_cache::PersonalVocabularyCacheError {
                code: "offline".to_string(),
            },
        ))),
    };
    assert_eq!(
        refresh_personal_vocabulary(&path, "scope-a", &offline).unwrap(),
        PersonalVocabularyRefreshOutcome::UsedLastKnownGood
    );
    let _ = fs::remove_file(path);
}

#[test]
fn atomic_cache_uses_unique_temporaries_and_rejects_old_revisions() {
    let path = temp_path("ordering");
    write_personal_vocabulary_cache_atomic(
        &path,
        "scope-a",
        snapshot("scope-a", "2", "new.svelte"),
        "\"vocabulary-2\"",
        "now",
    )
    .unwrap();
    let stale = write_personal_vocabulary_cache_atomic(
        &path,
        "scope-a",
        snapshot("scope-a", "1", "old.svelte"),
        "\"vocabulary-1\"",
        "now",
    )
    .expect_err("an older response must not replace the current snapshot");
    assert_eq!(stale.code, "cache_snapshot_stale");
    let current = read_personal_vocabulary_cache(&path, "scope-a")
        .unwrap()
        .unwrap();
    assert_eq!(current.snapshot.revision, "2");
    let file_name = path.file_name().unwrap().to_string_lossy().to_string();
    let temporary_count = fs::read_dir(path.parent().unwrap())
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            name.starts_with(&format!("{file_name}.tmp-"))
        })
        .count();
    assert_eq!(temporary_count, 0);
    let _ = fs::remove_file(path);
}
