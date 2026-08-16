use crate::{
    runtime_transcription::{HostPostProcessPolicy, HostTranscriptionRequest},
    user_preferences::DictationMode,
};
use serde::{Deserialize, Serialize};
use std::sync::{LazyLock, Mutex};

pub const PROFILE_DEFAULT_RECIPE_ID: &str = "profile-default-v1";
pub const LITERAL_RECIPE_ID: &str = "daily-literal-v1";
pub const SAFE_CLEANUP_RECIPE_ID: &str = "daily-safe-cleanup-v1";
pub const EXPERIMENTAL_RICH_RECIPE_ID: &str = "daily-experimental-rich-v1";
const RECIPE_VERSION: &str = "v1";
const CANONICAL_POST_PROCESS_POLICY_ID: &str = "canonical-conservative-v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationModeCatalogItem {
    pub mode: DictationMode,
    pub label: &'static str,
    pub summary: &'static str,
    pub post_process_enabled: bool,
    pub experimental: bool,
    pub literal: bool,
}

const DICTATION_MODE_CATALOG: [DictationModeCatalogItem; 4] = [
    DictationModeCatalogItem {
        mode: DictationMode::Profile,
        label: "Según mi perfil",
        summary: "Usa el comportamiento publicado para tu cuenta o dispositivo.",
        post_process_enabled: false,
        experimental: false,
        literal: false,
    },
    DictationModeCatalogItem {
        mode: DictationMode::Fast,
        label: "Rápido",
        summary: "Entrega el texto reconocido sin limpieza adicional.",
        post_process_enabled: false,
        experimental: false,
        literal: true,
    },
    DictationModeCatalogItem {
        mode: DictationMode::SafeCleanup,
        label: "Limpieza segura",
        summary: "Limpia el dictado con una revisión conservadora y vuelve al texto reconocido si hace falta.",
        post_process_enabled: true,
        experimental: false,
        literal: false,
    },
    DictationModeCatalogItem {
        mode: DictationMode::Complete,
        label: "Completo",
        summary: "Combina reconocimiento y limpieza conservadora para dictados con más estructura.",
        post_process_enabled: true,
        experimental: true,
        literal: false,
    },
];

pub fn dictation_mode_catalog() -> &'static [DictationModeCatalogItem] {
    &DICTATION_MODE_CATALOG
}

#[tauri::command]
pub fn get_dictation_mode_catalog() -> Vec<DictationModeCatalogItem> {
    dictation_mode_catalog().to_vec()
}

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

fn canonical_post_process_policy(
    source: &'static str,
    recipe_id: &str,
    enabled: bool,
) -> HostPostProcessPolicy {
    HostPostProcessPolicy {
        enabled,
        prompt: None,
        provider: None,
        model: None,
        source: Some(source.to_string()),
        policy_id: enabled.then(|| CANONICAL_POST_PROCESS_POLICY_ID.to_string()),
        voice_routing_profile_id: None,
        experiment_recipe_id: Some(recipe_id.to_string()),
        experiment_recipe_version: Some(RECIPE_VERSION.to_string()),
    }
}

fn apply_global_dictation_mode(
    request: &mut HostTranscriptionRequest,
    dictation_mode: DictationMode,
) {
    match dictation_mode {
        DictationMode::Profile => {}
        DictationMode::Fast => {
            request.post_process = Some(canonical_post_process_policy(
                "dictation-mode-fast-v1",
                LITERAL_RECIPE_ID,
                false,
            ));
        }
        DictationMode::SafeCleanup => {
            request.post_process = Some(canonical_post_process_policy(
                "dictation-mode-safe-cleanup-v1",
                SAFE_CLEANUP_RECIPE_ID,
                true,
            ));
        }
        DictationMode::Complete => {
            request.post_process = Some(canonical_post_process_policy(
                "dictation-mode-complete-v1",
                EXPERIMENTAL_RICH_RECIPE_ID,
                true,
            ));
        }
    }
}

pub fn apply_dictation_experiment(
    mut request: HostTranscriptionRequest,
    dictation_mode: DictationMode,
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
        apply_global_dictation_mode(&mut request, dictation_mode);
        return (request, None);
    };
    let source = match selection.scope {
        DictationExperimentScope::NextDictation => "dictation-experiment-next",
        DictationExperimentScope::Session => "dictation-experiment-session",
    };
    request.post_process = Some(canonical_post_process_policy(
        source,
        &selection.recipe_id,
        selection.recipe_id == SAFE_CLEANUP_RECIPE_ID,
    ));
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

        let (first, applied) = apply_dictation_experiment(request(), DictationMode::Profile);
        assert!(!first.post_process.expect("policy").enabled);
        complete_dictation_experiment(applied.clone(), false);
        assert!(get_dictation_experiment_state().active.is_some());
        let (_, retried) = apply_dictation_experiment(request(), DictationMode::Profile);
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

        let (_, first) = apply_dictation_experiment(request(), DictationMode::Profile);
        let (second, second_selection) =
            apply_dictation_experiment(request(), DictationMode::Profile);
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
            let (applied, selection) =
                apply_dictation_experiment(request(), DictationMode::Profile);
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
        let (result, selection) = apply_dictation_experiment(explicit, DictationMode::Profile);
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
        let (result, _) = apply_dictation_experiment(request(), DictationMode::Profile);
        assert!(
            result.evaluation_recipe_id.is_none(),
            "interactive experiments do not carry laboratory-only execution recipes"
        );
        assert!(!result.post_process.expect("policy").enabled);
    }

    #[test]
    fn global_modes_resolve_to_allowlisted_routes() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        reset();

        let (profile, _) = apply_dictation_experiment(request(), DictationMode::Profile);
        assert!(profile.post_process.is_none());
        assert!(profile.evaluation_recipe_id.is_none());

        let (fast, _) = apply_dictation_experiment(request(), DictationMode::Fast);
        let fast_policy = fast.post_process.expect("fast mode policy");
        assert!(!fast_policy.enabled);
        assert_eq!(
            fast_policy.experiment_recipe_id.as_deref(),
            Some(LITERAL_RECIPE_ID)
        );

        let (safe, _) = apply_dictation_experiment(request(), DictationMode::SafeCleanup);
        let safe_policy = safe.post_process.expect("safe cleanup policy");
        assert!(safe_policy.enabled);
        assert_eq!(
            safe_policy.experiment_recipe_id.as_deref(),
            Some(SAFE_CLEANUP_RECIPE_ID)
        );
        assert_eq!(
            safe_policy.policy_id.as_deref(),
            Some(CANONICAL_POST_PROCESS_POLICY_ID)
        );

        let (complete, _) = apply_dictation_experiment(request(), DictationMode::Complete);
        let complete_policy = complete.post_process.expect("complete mode policy");
        assert!(complete_policy.enabled);
        assert!(
            complete.evaluation_recipe_id.is_none(),
            "global dictation modes must not require a laboratory execution grant"
        );
        assert_eq!(
            complete_policy.experiment_recipe_id.as_deref(),
            Some(EXPERIMENTAL_RICH_RECIPE_ID)
        );
    }

    #[test]
    fn catalog_is_presentational_and_covers_all_global_modes() {
        let modes: Vec<_> = dictation_mode_catalog()
            .iter()
            .map(|entry| entry.mode)
            .collect();
        assert_eq!(
            modes,
            vec![
                DictationMode::Profile,
                DictationMode::Fast,
                DictationMode::SafeCleanup,
                DictationMode::Complete,
            ]
        );
        assert_eq!(get_dictation_mode_catalog().len(), 4);
        assert!(dictation_mode_catalog()
            .iter()
            .all(|entry| !entry.label.is_empty() && !entry.summary.is_empty()));
    }

    #[test]
    fn complete_mode_enables_the_canonical_postprocess_route() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        reset();
        let (result, selection) = apply_dictation_experiment(request(), DictationMode::Complete);
        let policy = result.post_process.expect("complete mode policy");
        assert!(policy.enabled);
        assert_eq!(policy.source.as_deref(), Some("dictation-mode-complete-v1"));
        assert!(policy.prompt.is_none());
        assert!(policy.provider.is_none());
        assert!(policy.model.is_none());
        assert!(selection.is_none());
    }

    #[test]
    fn temporary_recipe_overrides_the_persistent_complete_mode() {
        let _guard = TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        reset();
        set_dictation_experiment_selection(DictationExperimentSelection {
            recipe_id: LITERAL_RECIPE_ID.to_string(),
            recipe_version: "v1".to_string(),
            scope: DictationExperimentScope::Session,
        })
        .expect("selection should be valid");
        let (result, selection) = apply_dictation_experiment(request(), DictationMode::Complete);
        let policy = result.post_process.expect("literal override policy");
        assert!(!policy.enabled);
        assert_eq!(
            policy.source.as_deref(),
            Some("dictation-experiment-session")
        );
        assert!(selection.is_some());
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
