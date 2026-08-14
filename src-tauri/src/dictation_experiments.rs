use crate::runtime_transcription::{HostPostProcessPolicy, HostTranscriptionRequest};
use serde::{Deserialize, Serialize};
use std::sync::{LazyLock, Mutex};

pub const PROFILE_DEFAULT_RECIPE_ID: &str = "profile-default-v1";
pub const LITERAL_RECIPE_ID: &str = "daily-literal-v1";
pub const SAFE_CLEANUP_RECIPE_ID: &str = "daily-safe-cleanup-v1";
pub const EXPERIMENTAL_RICH_RECIPE_ID: &str = "daily-experimental-rich-v1";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DictationExperimentScope {
    NextDictation,
    Session,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationExperimentSelection {
    pub recipe_id: String,
    pub recipe_version: String,
    pub scope: DictationExperimentScope,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationExperimentState {
    pub schema_version: u8,
    pub active: Option<DictationExperimentSelection>,
}

static ACTIVE_SELECTION: LazyLock<Mutex<Option<DictationExperimentSelection>>> =
    LazyLock::new(|| Mutex::new(None));

fn active_selection() -> &'static Mutex<Option<DictationExperimentSelection>> {
    &ACTIVE_SELECTION
}

fn validate_selection(
    selection: DictationExperimentSelection,
) -> Result<Option<DictationExperimentSelection>, String> {
    if selection.recipe_version != "v1" {
        return Err("dictation_experiment_recipe_version_unknown".to_string());
    }
    match selection.recipe_id.as_str() {
        PROFILE_DEFAULT_RECIPE_ID => Ok(None),
        LITERAL_RECIPE_ID | SAFE_CLEANUP_RECIPE_ID | EXPERIMENTAL_RICH_RECIPE_ID => {
            Ok(Some(selection))
        }
        _ => Err("dictation_experiment_recipe_unknown".to_string()),
    }
}

#[tauri::command]
pub fn get_dictation_experiment_state() -> DictationExperimentState {
    DictationExperimentState {
        schema_version: 1,
        active: active_selection()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone(),
    }
}

#[tauri::command]
pub fn set_dictation_experiment_selection(
    selection: DictationExperimentSelection,
) -> Result<DictationExperimentState, String> {
    let selection = validate_selection(selection)?;
    *active_selection()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = selection;
    Ok(get_dictation_experiment_state())
}

pub fn apply_dictation_experiment(
    mut request: HostTranscriptionRequest,
) -> (
    HostTranscriptionRequest,
    Option<DictationExperimentSelection>,
) {
    if request.mode != "real" || !request.allow_provider_call || request.post_process.is_some() {
        return (request, None);
    }
    let selection = {
        let mut active = active_selection()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match active.as_ref().map(|selection| selection.scope) {
            Some(DictationExperimentScope::NextDictation) => active.take(),
            Some(DictationExperimentScope::Session) => active.clone(),
            None => None,
        }
    };
    let Some(selection) = selection else {
        return (request, None);
    };
    let source = match selection.scope {
        DictationExperimentScope::NextDictation => "dictation-experiment-next",
        DictationExperimentScope::Session => "dictation-experiment-session",
    };
    if selection.recipe_id == EXPERIMENTAL_RICH_RECIPE_ID {
        request.evaluation_recipe_id = Some("transcription-quality-v1-rich-auto".to_string());
    }
    request.post_process = Some(HostPostProcessPolicy {
        enabled: selection.recipe_id == SAFE_CLEANUP_RECIPE_ID,
        prompt: None,
        provider: None,
        model: None,
        source: Some(source.to_string()),
        policy_id: None,
        voice_routing_profile_id: None,
        experiment_recipe_id: Some(selection.recipe_id.clone()),
        experiment_recipe_version: Some(selection.recipe_version.clone()),
    });
    (request, Some(selection))
}

pub fn complete_dictation_experiment(
    applied: Option<DictationExperimentSelection>,
    attempted: bool,
) {
    let Some(applied) = applied else {
        return;
    };
    if applied.scope != DictationExperimentScope::NextDictation || attempted {
        return;
    }
    let mut active = active_selection()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if active.is_none() {
        *active = Some(applied);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> HostTranscriptionRequest {
        HostTranscriptionRequest {
            run_id: "run-1".to_string(),
            audio_path: "audio.wav".to_string(),
            provider: None,
            model: None,
            language: None,
            evaluation_recipe_id: None,
            mode: "real".to_string(),
            allow_provider_call: true,
            post_process: None,
        }
    }

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn reset() {
        *active_selection()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    }

    #[test]
    fn next_dictation_is_consumed_only_after_an_attempt() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        reset();
        set_dictation_experiment_selection(DictationExperimentSelection {
            recipe_id: LITERAL_RECIPE_ID.to_string(),
            recipe_version: "v1".to_string(),
            scope: DictationExperimentScope::NextDictation,
        })
        .expect("selection should be valid");

        let (first, applied) = apply_dictation_experiment(request());
        assert!(!first.post_process.expect("policy").enabled);
        complete_dictation_experiment(applied.clone(), false);
        assert!(get_dictation_experiment_state().active.is_some());
        let (_, retried) = apply_dictation_experiment(request());
        complete_dictation_experiment(retried, true);
        assert!(get_dictation_experiment_state().active.is_none());
    }

    #[test]
    fn next_dictation_is_reserved_by_only_one_concurrent_request() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        reset();
        set_dictation_experiment_selection(DictationExperimentSelection {
            recipe_id: LITERAL_RECIPE_ID.to_string(),
            recipe_version: "v1".to_string(),
            scope: DictationExperimentScope::NextDictation,
        })
        .expect("selection should be valid");

        let (_, first) = apply_dictation_experiment(request());
        let (second, second_selection) = apply_dictation_experiment(request());
        assert!(first.is_some());
        assert!(second_selection.is_none());
        assert!(second.post_process.is_none());
    }

    #[test]
    fn session_cleanup_remains_active_and_observable() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        reset();
        set_dictation_experiment_selection(DictationExperimentSelection {
            recipe_id: SAFE_CLEANUP_RECIPE_ID.to_string(),
            recipe_version: "v1".to_string(),
            scope: DictationExperimentScope::Session,
        })
        .expect("selection should be valid");

        for _ in 0..2 {
            let (applied, selection) = apply_dictation_experiment(request());
            let policy = applied.post_process.expect("policy");
            assert!(policy.enabled);
            assert_eq!(
                policy.experiment_recipe_id.as_deref(),
                Some(SAFE_CLEANUP_RECIPE_ID)
            );
            assert_eq!(policy.experiment_recipe_version.as_deref(), Some("v1"));
            assert_eq!(
                policy.source.as_deref(),
                Some("dictation-experiment-session")
            );
            complete_dictation_experiment(selection, true);
        }
        assert!(get_dictation_experiment_state().active.is_some());
    }

    #[test]
    fn explicit_route_is_not_overwritten_or_consumed() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        reset();
        set_dictation_experiment_selection(DictationExperimentSelection {
            recipe_id: LITERAL_RECIPE_ID.to_string(),
            recipe_version: "v1".to_string(),
            scope: DictationExperimentScope::NextDictation,
        })
        .expect("selection should be valid");
        let mut explicit = request();
        explicit.post_process = Some(HostPostProcessPolicy {
            enabled: false,
            prompt: None,
            provider: None,
            model: None,
            source: Some("exclusive-transform-route".to_string()),
            policy_id: None,
            voice_routing_profile_id: None,
            experiment_recipe_id: None,
            experiment_recipe_version: None,
        });
        let (result, selection) = apply_dictation_experiment(explicit);
        assert!(selection.is_none());
        assert_eq!(
            result
                .post_process
                .expect("explicit policy")
                .source
                .as_deref(),
            Some("exclusive-transform-route")
        );
        assert!(get_dictation_experiment_state().active.is_some());
    }

    #[test]
    fn experimental_recipe_selects_the_allowlisted_rich_stt_recipe() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        reset();
        set_dictation_experiment_selection(DictationExperimentSelection {
            recipe_id: EXPERIMENTAL_RICH_RECIPE_ID.to_string(),
            recipe_version: "v1".to_string(),
            scope: DictationExperimentScope::Session,
        })
        .expect("selection should be valid");
        let (result, _) = apply_dictation_experiment(request());
        assert_eq!(
            result.evaluation_recipe_id.as_deref(),
            Some("transcription-quality-v1-rich-auto")
        );
        assert!(!result.post_process.expect("policy").enabled);
    }

    #[test]
    fn profile_default_clears_override_and_unknown_recipe_fails_closed() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        reset();
        assert!(
            set_dictation_experiment_selection(DictationExperimentSelection {
                recipe_id: "unknown".to_string(),
                recipe_version: "v1".to_string(),
                scope: DictationExperimentScope::Session,
            })
            .is_err()
        );
        let state = set_dictation_experiment_selection(DictationExperimentSelection {
            recipe_id: PROFILE_DEFAULT_RECIPE_ID.to_string(),
            recipe_version: "v1".to_string(),
            scope: DictationExperimentScope::Session,
        })
        .expect("profile default should clear");
        assert!(state.active.is_none());
    }
}
