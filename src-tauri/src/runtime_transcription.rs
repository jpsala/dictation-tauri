use serde::{Deserialize, Serialize};

const ARTIFACT_ROOT: &str = "artifacts/microphone-capture";
const AUDIO_ROOT: &str = "artifacts/microphone-capture/audio/";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRuntimeReadiness {
    configured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    artifact_root: &'static str,
    supports_real_provider_call: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<RedactedHostRuntimeError>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostTranscriptionRequest {
    run_id: String,
    audio_path: String,
    #[allow(dead_code)]
    provider: Option<String>,
    #[allow(dead_code)]
    model: Option<String>,
    #[allow(dead_code)]
    language: Option<String>,
    #[allow(dead_code)]
    mode: String,
    #[allow(dead_code)]
    allow_provider_call: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedactedHostRuntimeError {
    code: &'static str,
    message: &'static str,
    redacted: bool,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum HostTranscriptionResponse {
    #[serde(rename_all = "camelCase")]
    MissingAudio {
        error: RedactedHostRuntimeError,
        retryable: bool,
        redacted: bool,
    },
    #[serde(rename_all = "camelCase")]
    SetupError {
        error: RedactedHostRuntimeError,
        retryable: bool,
        redacted: bool,
    },
}

#[tauri::command]
pub fn get_runtime_transcription_readiness() -> HostRuntimeReadiness {
    HostRuntimeReadiness {
        configured: false,
        provider: None,
        model: None,
        artifact_root: ARTIFACT_ROOT,
        supports_real_provider_call: false,
        reason: Some(error(
            "HOST_RUNTIME_UNAVAILABLE",
            "Host runtime transcription boundary is unavailable.",
        )),
    }
}

#[tauri::command]
pub async fn transcribe_captured_audio(
    request: HostTranscriptionRequest,
) -> HostTranscriptionResponse {
    if let Err(validation_error) = validate_audio_path(&request.audio_path) {
        return HostTranscriptionResponse::MissingAudio {
            error: validation_error,
            retryable: true,
            redacted: true,
        };
    }

    let _run_id = request.run_id;

    HostTranscriptionResponse::SetupError {
        error: error(
            "HOST_RUNTIME_UNAVAILABLE",
            "Host runtime transcription boundary is unavailable.",
        ),
        retryable: false,
        redacted: true,
    }
}

fn validate_audio_path(audio_path: &str) -> Result<(), RedactedHostRuntimeError> {
    if audio_path.trim().is_empty() {
        return Err(error(
            "ARTIFACT_PATH_EMPTY",
            "Host runtime artifact paths must be non-empty.",
        ));
    }

    if audio_path.contains('\0') {
        return Err(error(
            "ARTIFACT_PATH_INVALID",
            "Host runtime artifact paths must not contain NUL bytes.",
        ));
    }

    if is_absolute_path(audio_path) {
        return Err(error(
            "ARTIFACT_PATH_ABSOLUTE",
            "Host runtime artifact paths must be workspace-relative.",
        ));
    }

    let normalized = normalize_path(audio_path);
    if has_traversal(&normalized) {
        return Err(error(
            "ARTIFACT_PATH_TRAVERSAL",
            "Host runtime artifact paths must not contain traversal.",
        ));
    }

    if !normalized.starts_with(AUDIO_ROOT) {
        return Err(error(
            "ARTIFACT_PATH_OUT_OF_ROOT",
            "Host runtime artifact paths must stay under artifacts/microphone-capture/audio/.",
        ));
    }

    Ok(())
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/").trim_start_matches("./").to_string()
}

fn has_traversal(path: &str) -> bool {
    path.split('/')
        .any(|segment| segment == ".." || segment.eq_ignore_ascii_case("%2e%2e"))
}

fn is_absolute_path(path: &str) -> bool {
    path.starts_with('/')
        || path.starts_with('\\')
        || path.starts_with("file://")
        || path
            .as_bytes()
            .get(1)
            .is_some_and(|byte| *byte == b':')
}

fn error(code: &'static str, message: &'static str) -> RedactedHostRuntimeError {
    RedactedHostRuntimeError {
        code,
        message,
        redacted: true,
    }
}
