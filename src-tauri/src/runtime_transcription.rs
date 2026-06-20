use std::{env, fs, path::Path, time::Instant};

use reqwest::header;
use serde::{Deserialize, Serialize};

const ARTIFACT_ROOT: &str = "artifacts/microphone-capture";
const AUDIO_ROOT: &str = "artifacts/microphone-capture/audio/";
const TRANSCRIPT_ROOT: &str = "artifacts/microphone-capture/transcripts/";
const REPORT_ROOT: &str = "artifacts/microphone-capture/reports/";
const DEFAULT_PROVIDER: &str = "groq";
const DEFAULT_MODEL: &str = "whisper-large-v3";
const GROQ_TRANSCRIPTION_ENDPOINT: &str = "https://api.groq.com/openai/v1/audio/transcriptions";

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

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HostTranscriptionRequest {
    run_id: String,
    audio_path: String,
    provider: Option<String>,
    model: Option<String>,
    language: Option<String>,
    mode: String,
    allow_provider_call: bool,
}

#[derive(Clone, Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RedactedHostRuntimeError {
    code: String,
    message: String,
    redacted: bool,
}

#[allow(dead_code)]
#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum HostTranscriptionResponse {
    #[serde(rename_all = "camelCase")]
    Ok {
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        transcript_path: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        report_path: Option<String>,
        provider: String,
        model: String,
        latency_ms: u64,
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        redacted: bool,
    },
    #[serde(rename_all = "camelCase")]
    MissingAudio {
        error: RedactedHostRuntimeError,
        retryable: bool,
        redacted: bool,
    },
    #[serde(rename_all = "camelCase")]
    SetupError {
        error: RedactedHostRuntimeError,
        #[serde(skip_serializing_if = "Option::is_none")]
        provider: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        retryable: bool,
        redacted: bool,
    },
    #[serde(rename_all = "camelCase")]
    ProviderError {
        error: RedactedHostRuntimeError,
        #[serde(skip_serializing_if = "Option::is_none")]
        provider: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        latency_ms: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        retryable: bool,
        redacted: bool,
    },
    #[serde(rename_all = "camelCase")]
    Empty {
        error: RedactedHostRuntimeError,
        #[serde(skip_serializing_if = "Option::is_none")]
        report_path: Option<String>,
        provider: String,
        model: String,
        latency_ms: u64,
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        retryable: bool,
        redacted: bool,
    },
    #[serde(rename_all = "camelCase")]
    Cancelled {
        error: RedactedHostRuntimeError,
        retryable: bool,
        redacted: bool,
    },
}

#[derive(Clone)]
struct HostRuntimeConfig {
    api_key: String,
    provider: String,
    model: String,
    language: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug)]
enum ProviderTranscriptionOutcome {
    Ok {
        text: String,
        provider: String,
        model: String,
        latency_ms: u64,
        request_id: Option<String>,
    },
    ProviderError {
        code: String,
        message: String,
        provider: Option<String>,
        model: Option<String>,
        latency_ms: Option<u64>,
        request_id: Option<String>,
    },
    Cancelled,
}

#[derive(Deserialize)]
struct GroqTranscriptionResponseBody {
    text: Option<String>,
}

#[tauri::command]
pub fn get_runtime_transcription_readiness() -> HostRuntimeReadiness {
    create_runtime_transcription_readiness(&read_host_env_value)
}

#[tauri::command]
pub async fn transcribe_captured_audio(
    request: HostTranscriptionRequest,
) -> HostTranscriptionResponse {
    if request.mode == "real" && request.allow_provider_call {
        return transcribe_captured_audio_with_provider_call(request, &read_host_env_value).await;
    }

    transcribe_captured_audio_without_provider_call(request, &read_host_env_value)
}

fn create_runtime_transcription_readiness(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> HostRuntimeReadiness {
    match read_host_runtime_config(env_lookup) {
        Ok(config) => HostRuntimeReadiness {
            configured: true,
            provider: Some(config.provider),
            model: Some(config.model),
            artifact_root: ARTIFACT_ROOT,
            supports_real_provider_call: true,
            reason: None,
        },
        Err(reason) => HostRuntimeReadiness {
            configured: false,
            provider: None,
            model: None,
            artifact_root: ARTIFACT_ROOT,
            supports_real_provider_call: false,
            reason: Some(reason),
        },
    }
}

fn transcribe_captured_audio_without_provider_call(
    request: HostTranscriptionRequest,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> HostTranscriptionResponse {
    if let Err(validation_error) = validate_audio_path(&request.audio_path) {
        return HostTranscriptionResponse::MissingAudio {
            error: validation_error,
            retryable: true,
            redacted: true,
        };
    }

    if request.mode == "real" && !request.allow_provider_call {
        return HostTranscriptionResponse::SetupError {
            error: error(
                "PROVIDER_CALL_NOT_ALLOWED",
                "Real provider calls require an explicit host runtime approval flag.",
            ),
            provider: request.provider,
            model: request.model,
            retryable: true,
            redacted: true,
        };
    }

    let config = match read_host_runtime_config(env_lookup) {
        Ok(config) => config,
        Err(reason) => {
            return HostTranscriptionResponse::SetupError {
                error: reason,
                provider: request.provider,
                model: request.model,
                retryable: true,
                redacted: true,
            };
        }
    };

    let _run_id = &request.run_id;
    let _language = request.language.or(config.language);

    HostTranscriptionResponse::SetupError {
        error: error(
            "HOST_PROVIDER_NOT_IMPLEMENTED",
            "Native host provider transcription is not implemented yet.",
        ),
        provider: Some(request.provider.unwrap_or(config.provider)),
        model: Some(request.model.unwrap_or(config.model)),
        retryable: true,
        redacted: true,
    }
}

async fn transcribe_captured_audio_with_provider_call(
    request: HostTranscriptionRequest,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> HostTranscriptionResponse {
    if let Err(validation_error) = validate_audio_path(&request.audio_path) {
        return HostTranscriptionResponse::MissingAudio {
            error: validation_error,
            retryable: true,
            redacted: true,
        };
    }

    if request.mode != "real" {
        return HostTranscriptionResponse::SetupError {
            error: error(
                "REAL_MODE_REQUIRED",
                "Native host provider transcription requires real mode.",
            ),
            provider: request.provider,
            model: request.model,
            retryable: true,
            redacted: true,
        };
    }

    if !request.allow_provider_call {
        return HostTranscriptionResponse::SetupError {
            error: error(
                "PROVIDER_CALL_NOT_ALLOWED",
                "Real provider calls require an explicit host runtime approval flag.",
            ),
            provider: request.provider,
            model: request.model,
            retryable: true,
            redacted: true,
        };
    }

    let config = match read_host_runtime_config(env_lookup) {
        Ok(config) => config,
        Err(reason) => {
            return HostTranscriptionResponse::SetupError {
                error: reason,
                provider: request.provider,
                model: request.model,
                retryable: true,
                redacted: true,
            };
        }
    };

    let provider = request
        .provider
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| config.provider.clone());
    if provider.to_ascii_lowercase() != DEFAULT_PROVIDER {
        return HostTranscriptionResponse::SetupError {
            error: error(
                "UNSUPPORTED_PROVIDER",
                "Only the Groq host transcription provider is supported in this build.",
            ),
            provider: Some(redact_host_text(&provider)),
            model: request.model.clone().or_else(|| Some(config.model.clone())),
            retryable: true,
            redacted: true,
        };
    }

    let audio = match fs::read(&request.audio_path) {
        Ok(audio) => audio,
        Err(_) => {
            return HostTranscriptionResponse::MissingAudio {
                error: error(
                    "AUDIO_READ_FAILED",
                    "Captured audio could not be read for host transcription.",
                ),
                retryable: true,
                redacted: true,
            };
        }
    };

    let outcome = transcribe_groq_audio(config, &request, audio).await;
    let response = map_provider_outcome_to_host_response(outcome, &request);

    if let Err(write_error) = write_host_artifacts(&response, &request) {
        return HostTranscriptionResponse::ProviderError {
            error: write_error,
            provider: response_provider(&response),
            model: response_model(&response),
            latency_ms: response_latency_ms(&response),
            request_id: response_request_id(&response),
            retryable: true,
            redacted: true,
        };
    }

    response
}

fn read_host_runtime_config(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<HostRuntimeConfig, RedactedHostRuntimeError> {
    let api_key = first_env_value(env_lookup, &["GROQ_API_KEY", "GROQ-API-KEY"])
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            error(
                "GROQ_API_KEY_MISSING",
                "Groq STT provider is not configured.",
            )
        })?;

    Ok(HostRuntimeConfig {
        api_key,
        provider: DEFAULT_PROVIDER.to_string(),
        model: first_env_value(env_lookup, &["GROQ_STT_MODEL", "GROQ-STT-MODEL"])
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
        language: first_env_value(env_lookup, &["GROQ_STT_LANGUAGE", "GROQ-STT-LANGUAGE"])
            .filter(|value| !value.trim().is_empty()),
    })
}

fn read_host_env_value(key: &str) -> Option<String> {
    env::var(key).ok().or_else(|| read_dot_env_value(key))
}

fn read_dot_env_value(key: &str) -> Option<String> {
    if !is_groq_env_key(key) {
        return None;
    }

    let text = fs::read_to_string(".env").ok()?;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let Some((candidate_key, value)) = trimmed.split_once('=') else {
            continue;
        };

        if candidate_key.trim() == key {
            return Some(
                value
                    .trim()
                    .trim_matches(|character| character == '\'' || character == '"')
                    .to_string(),
            );
        }
    }

    None
}

fn is_groq_env_key(key: &str) -> bool {
    matches!(
        key,
        "GROQ_API_KEY"
            | "GROQ-API-KEY"
            | "GROQ_STT_MODEL"
            | "GROQ-STT-MODEL"
            | "GROQ_STT_LANGUAGE"
            | "GROQ-STT-LANGUAGE"
    )
}

fn first_env_value(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
    keys: &[&str],
) -> Option<String> {
    keys.iter().find_map(|key| env_lookup(key))
}

async fn transcribe_groq_audio(
    config: HostRuntimeConfig,
    request: &HostTranscriptionRequest,
    audio: Vec<u8>,
) -> ProviderTranscriptionOutcome {
    let model = request
        .model
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| config.model.clone());
    let language = request
        .language
        .clone()
        .or_else(|| config.language.clone())
        .filter(|value| !value.trim().is_empty());
    let started_at = Instant::now();
    let file_name = file_name_from_audio_path(&request.audio_path);

    let file_part = reqwest::multipart::Part::bytes(audio).file_name(file_name);
    let mut form = reqwest::multipart::Form::new()
        .text("model", model.clone())
        .text("response_format", "json")
        .part("file", file_part);

    if let Some(language) = language {
        form = form.text("language", language);
    }

    let response = match reqwest::Client::new()
        .post(GROQ_TRANSCRIPTION_ENDPOINT)
        .bearer_auth(config.api_key)
        .multipart(form)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return ProviderTranscriptionOutcome::ProviderError {
                code: "GROQ_REQUEST_FAILED".to_string(),
                message: error.to_string(),
                provider: Some(config.provider),
                model: Some(model),
                latency_ms: Some(elapsed_ms(started_at)),
                request_id: None,
            };
        }
    };

    let latency_ms = elapsed_ms(started_at);
    let status = response.status();
    let status_text = status
        .canonical_reason()
        .unwrap_or("provider error")
        .to_string();
    let request_id = response
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();

    if !status.is_success() {
        return ProviderTranscriptionOutcome::ProviderError {
            code: format!("GROQ_HTTP_{}", status.as_u16()),
            message: format!(
                "Groq STT provider returned HTTP {} {}.",
                status.as_u16(),
                status_text
            ),
            provider: Some(config.provider),
            model: Some(model),
            latency_ms: Some(latency_ms),
            request_id,
        };
    }

    let text = if content_type.contains("application/json") {
        match response.json::<GroqTranscriptionResponseBody>().await {
            Ok(body) => body.text.unwrap_or_default(),
            Err(error) => {
                return ProviderTranscriptionOutcome::ProviderError {
                    code: "GROQ_RESPONSE_PARSE_FAILED".to_string(),
                    message: error.to_string(),
                    provider: Some(config.provider),
                    model: Some(model),
                    latency_ms: Some(latency_ms),
                    request_id,
                };
            }
        }
    } else {
        match response.text().await {
            Ok(text) => text,
            Err(error) => {
                return ProviderTranscriptionOutcome::ProviderError {
                    code: "GROQ_RESPONSE_READ_FAILED".to_string(),
                    message: error.to_string(),
                    provider: Some(config.provider),
                    model: Some(model),
                    latency_ms: Some(latency_ms),
                    request_id,
                };
            }
        }
    };

    ProviderTranscriptionOutcome::Ok {
        text,
        provider: config.provider,
        model,
        latency_ms,
        request_id,
    }
}

fn map_provider_outcome_to_host_response(
    outcome: ProviderTranscriptionOutcome,
    request: &HostTranscriptionRequest,
) -> HostTranscriptionResponse {
    match outcome {
        ProviderTranscriptionOutcome::Ok {
            text,
            provider,
            model,
            latency_ms,
            request_id,
        } => {
            let normalized_text = text.trim().to_string();
            if !is_usable_transcript(&normalized_text) {
                return HostTranscriptionResponse::Empty {
                    error: error("EMPTY_TRANSCRIPT", "Transcription returned no usable text."),
                    report_path: Some(create_report_path(&request.run_id)),
                    provider,
                    model,
                    latency_ms,
                    request_id: redact_request_id(request_id),
                    retryable: true,
                    redacted: true,
                };
            }

            HostTranscriptionResponse::Ok {
                text: normalized_text,
                transcript_path: Some(create_transcript_path(&request.run_id)),
                report_path: Some(create_report_path(&request.run_id)),
                provider: redact_host_text(&provider),
                model: redact_host_text(&model),
                latency_ms,
                request_id: redact_request_id(request_id),
                redacted: true,
            }
        }
        ProviderTranscriptionOutcome::ProviderError {
            code,
            message,
            provider,
            model,
            latency_ms,
            request_id,
        } => HostTranscriptionResponse::ProviderError {
            error: error(&code, &message),
            provider: provider.map(|value| redact_host_text(&value)),
            model: model.map(|value| redact_host_text(&value)),
            latency_ms,
            request_id: redact_request_id(request_id),
            retryable: true,
            redacted: true,
        },
        ProviderTranscriptionOutcome::Cancelled => HostTranscriptionResponse::Cancelled {
            error: error("CANCELLED", "Host transcription was cancelled."),
            retryable: false,
            redacted: true,
        },
    }
}

fn create_transcript_path(run_id: &str) -> String {
    format!("{}{}.txt", TRANSCRIPT_ROOT, sanitize_run_id(run_id))
}

fn create_report_path(run_id: &str) -> String {
    format!("{}{}.json", REPORT_ROOT, sanitize_run_id(run_id))
}

fn create_redacted_report(
    response: &HostTranscriptionResponse,
    request: &HostTranscriptionRequest,
) -> String {
    let status = match response {
        HostTranscriptionResponse::Ok { .. } => "ok",
        HostTranscriptionResponse::MissingAudio { .. } => "missing-audio",
        HostTranscriptionResponse::SetupError { .. } => "setup-error",
        HostTranscriptionResponse::ProviderError { .. } => "provider-error",
        HostTranscriptionResponse::Empty { .. } => "empty",
        HostTranscriptionResponse::Cancelled { .. } => "cancelled",
    };
    let transcript_length = match response {
        HostTranscriptionResponse::Ok { text, .. } => text.len(),
        _ => 0,
    };

    format!(
        "{{\"runId\":\"{}\",\"status\":\"{}\",\"audioPath\":\"{}\",\"transcriptLength\":{},\"rawProviderPayloadStored\":false,\"redacted\":true}}",
        redact_host_text(&request.run_id),
        status,
        redact_host_text(&request.audio_path),
        transcript_length,
    )
}

fn is_usable_transcript(text: &str) -> bool {
    let normalized = text.trim().to_ascii_lowercase();
    !normalized.is_empty()
        && !matches!(
            normalized.as_str(),
            "[blank_audio]" | "[silence]" | "(silence)" | "silence" | "no speech detected"
        )
}

fn write_host_artifacts(
    response: &HostTranscriptionResponse,
    request: &HostTranscriptionRequest,
) -> Result<(), RedactedHostRuntimeError> {
    if let HostTranscriptionResponse::Ok {
        text,
        transcript_path: Some(transcript_path),
        ..
    } = response
    {
        validate_transcript_path(transcript_path)?;
        if let Some(parent) = Path::new(transcript_path).parent() {
            fs::create_dir_all(parent).map_err(|_| {
                error(
                    "ARTIFACT_WRITE_FAILED",
                    "Host runtime transcript directory could not be created.",
                )
            })?;
        }
        fs::write(transcript_path, text).map_err(|_| {
            error(
                "ARTIFACT_WRITE_FAILED",
                "Host runtime transcript could not be written.",
            )
        })?;
    }

    let report_path =
        response_report_path(response).unwrap_or_else(|| create_report_path(&request.run_id));
    validate_report_path(&report_path)?;
    if let Some(parent) = Path::new(&report_path).parent() {
        fs::create_dir_all(parent).map_err(|_| {
            error(
                "ARTIFACT_WRITE_FAILED",
                "Host runtime report directory could not be created.",
            )
        })?;
    }
    fs::write(&report_path, create_redacted_report(response, request)).map_err(|_| {
        error(
            "ARTIFACT_WRITE_FAILED",
            "Host runtime redacted report could not be written.",
        )
    })?;

    Ok(())
}

fn response_provider(response: &HostTranscriptionResponse) -> Option<String> {
    match response {
        HostTranscriptionResponse::Ok { provider, .. }
        | HostTranscriptionResponse::Empty { provider, .. } => Some(provider.clone()),
        HostTranscriptionResponse::SetupError { provider, .. }
        | HostTranscriptionResponse::ProviderError { provider, .. } => provider.clone(),
        HostTranscriptionResponse::MissingAudio { .. }
        | HostTranscriptionResponse::Cancelled { .. } => None,
    }
}

fn response_model(response: &HostTranscriptionResponse) -> Option<String> {
    match response {
        HostTranscriptionResponse::Ok { model, .. }
        | HostTranscriptionResponse::Empty { model, .. } => Some(model.clone()),
        HostTranscriptionResponse::SetupError { model, .. }
        | HostTranscriptionResponse::ProviderError { model, .. } => model.clone(),
        HostTranscriptionResponse::MissingAudio { .. }
        | HostTranscriptionResponse::Cancelled { .. } => None,
    }
}

fn response_latency_ms(response: &HostTranscriptionResponse) -> Option<u64> {
    match response {
        HostTranscriptionResponse::Ok { latency_ms, .. }
        | HostTranscriptionResponse::Empty { latency_ms, .. } => Some(*latency_ms),
        HostTranscriptionResponse::ProviderError { latency_ms, .. } => *latency_ms,
        HostTranscriptionResponse::SetupError { .. }
        | HostTranscriptionResponse::MissingAudio { .. }
        | HostTranscriptionResponse::Cancelled { .. } => None,
    }
}

fn response_request_id(response: &HostTranscriptionResponse) -> Option<String> {
    match response {
        HostTranscriptionResponse::Ok { request_id, .. }
        | HostTranscriptionResponse::Empty { request_id, .. }
        | HostTranscriptionResponse::ProviderError { request_id, .. } => request_id.clone(),
        HostTranscriptionResponse::SetupError { .. }
        | HostTranscriptionResponse::MissingAudio { .. }
        | HostTranscriptionResponse::Cancelled { .. } => None,
    }
}

fn response_report_path(response: &HostTranscriptionResponse) -> Option<String> {
    match response {
        HostTranscriptionResponse::Ok { report_path, .. }
        | HostTranscriptionResponse::Empty { report_path, .. } => report_path.clone(),
        HostTranscriptionResponse::SetupError { .. }
        | HostTranscriptionResponse::ProviderError { .. }
        | HostTranscriptionResponse::MissingAudio { .. }
        | HostTranscriptionResponse::Cancelled { .. } => None,
    }
}

fn file_name_from_audio_path(audio_path: &str) -> String {
    normalize_path(audio_path)
        .split('/')
        .filter(|segment| !segment.is_empty())
        .last()
        .unwrap_or("captured-audio.wav")
        .to_string()
}

fn elapsed_ms(started_at: Instant) -> u64 {
    started_at
        .elapsed()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn validate_audio_path(audio_path: &str) -> Result<(), RedactedHostRuntimeError> {
    validate_artifact_path(
        audio_path,
        AUDIO_ROOT,
        "artifacts/microphone-capture/audio/",
    )
}

fn validate_transcript_path(transcript_path: &str) -> Result<(), RedactedHostRuntimeError> {
    validate_artifact_path(
        transcript_path,
        TRANSCRIPT_ROOT,
        "artifacts/microphone-capture/transcripts/",
    )
}

fn validate_report_path(report_path: &str) -> Result<(), RedactedHostRuntimeError> {
    validate_artifact_path(
        report_path,
        REPORT_ROOT,
        "artifacts/microphone-capture/reports/",
    )
}

fn validate_artifact_path(
    artifact_path: &str,
    allowed_root: &str,
    allowed_label: &'static str,
) -> Result<(), RedactedHostRuntimeError> {
    if artifact_path.trim().is_empty() {
        return Err(error(
            "ARTIFACT_PATH_EMPTY",
            "Host runtime artifact paths must be non-empty.",
        ));
    }

    if artifact_path.contains('\0') {
        return Err(error(
            "ARTIFACT_PATH_INVALID",
            "Host runtime artifact paths must not contain NUL bytes.",
        ));
    }

    if is_absolute_path(artifact_path) {
        return Err(error(
            "ARTIFACT_PATH_ABSOLUTE",
            "Host runtime artifact paths must be workspace-relative.",
        ));
    }

    let normalized = normalize_path(artifact_path);
    if has_traversal(&normalized) {
        return Err(error(
            "ARTIFACT_PATH_TRAVERSAL",
            "Host runtime artifact paths must not contain traversal.",
        ));
    }

    if !normalized.starts_with(allowed_root) {
        return Err(error(
            "ARTIFACT_PATH_OUT_OF_ROOT",
            &format!(
                "Host runtime artifact paths must stay under {}.",
                allowed_label
            ),
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
        || path.to_ascii_lowercase().starts_with("file://")
        || path.as_bytes().get(1).is_some_and(|byte| *byte == b':')
}

fn error(code: &str, message: &str) -> RedactedHostRuntimeError {
    RedactedHostRuntimeError {
        code: normalize_error_code(code),
        message: redact_host_text(message),
        redacted: true,
    }
}

fn normalize_error_code(code: &str) -> String {
    let normalized = code
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect::<String>();

    if normalized.is_empty() {
        "HOST_RUNTIME_ERROR".to_string()
    } else {
        normalized
    }
}

fn redact_request_id(request_id: Option<String>) -> Option<String> {
    let request_id = request_id?;
    let redacted = redact_host_text(&request_id);
    if redacted.contains("[REDACTED]") {
        return Some("redacted-request-id".to_string());
    }

    let normalized = redacted.trim();
    if normalized.is_empty() {
        return None;
    }

    if normalized.len() > 128
        || !normalized
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ". _:-".contains(character))
    {
        return Some("redacted-request-id".to_string());
    }

    Some(normalized.to_string())
}

fn redact_host_text(message: &str) -> String {
    message
        .split_whitespace()
        .map(|token| {
            let lower = token.to_ascii_lowercase();
            let upper = token.to_ascii_uppercase();
            if lower.starts_with("sk_")
                || lower.starts_with("sk-")
                || lower.starts_with("gsk_")
                || lower.starts_with("gsk-")
                || lower.starts_with("ghp_")
                || lower.starts_with("xoxb-")
                || lower.starts_with("xoxb_")
                || lower.starts_with("github_pat")
                || upper.contains("API_KEY=")
                || upper.contains("TOKEN=")
                || upper.contains("SECRET=")
                || lower.starts_with("bearer")
            {
                "[REDACTED]".to_string()
            } else {
                token.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn sanitize_run_id(run_id: &str) -> String {
    let sanitized = run_id
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();

    if sanitized.is_empty() {
        "host-runtime-run".to_string()
    } else {
        sanitized
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn readiness_reports_missing_and_configured_groq_without_secret_leakage() {
        let missing = create_runtime_transcription_readiness(&|_key| None);
        assert!(!missing.configured);
        assert!(!missing.supports_real_provider_call);
        assert_eq!(
            missing.reason.as_ref().map(|reason| reason.code.as_str()),
            Some("GROQ_API_KEY_MISSING"),
        );

        let secret = "gsk_test_secret_must_not_leak";
        let configured = create_runtime_transcription_readiness(&|key| match key {
            "GROQ-API-KEY" => Some(secret.to_string()),
            "GROQ-STT-MODEL" => Some("whisper-large-v3-turbo".to_string()),
            _ => None,
        });

        assert!(configured.configured);
        assert_eq!(configured.provider.as_deref(), Some("groq"));
        assert_eq!(configured.model.as_deref(), Some("whisper-large-v3-turbo"));
        assert!(format!("{:?}", configured.reason).contains("None"));
    }

    #[test]
    fn real_mode_requires_explicit_provider_gate_before_setup_or_provider_work() {
        let response = transcribe_captured_audio_without_provider_call(
            HostTranscriptionRequest {
                run_id: "gate-test".to_string(),
                audio_path: "artifacts/microphone-capture/audio/capture.wav".to_string(),
                provider: None,
                model: None,
                language: None,
                mode: "real".to_string(),
                allow_provider_call: false,
            },
            &|key| match key {
                "GROQ_API_KEY" => Some("gsk_test_secret_must_not_leak".to_string()),
                _ => None,
            },
        );

        assert!(matches!(
            response,
            HostTranscriptionResponse::SetupError { ref error, .. }
                if error.code == "PROVIDER_CALL_NOT_ALLOWED"
        ));
        assert!(!format!("{response:?}").contains("gsk_test_secret_must_not_leak"));
    }

    #[test]
    fn rejects_missing_absolute_traversal_and_out_of_root_audio_paths() {
        for (path, code) in [
            ("", "ARTIFACT_PATH_EMPTY"),
            ("C:/private/capture.wav", "ARTIFACT_PATH_ABSOLUTE"),
            (
                "artifacts/microphone-capture/audio/../reports/leak.json",
                "ARTIFACT_PATH_TRAVERSAL",
            ),
            (
                "artifacts/microphone-capture/audio/%2e%2e/reports/leak.json",
                "ARTIFACT_PATH_TRAVERSAL",
            ),
            (
                "artifacts/synthetic-audio-stt/audio/sample.wav",
                "ARTIFACT_PATH_OUT_OF_ROOT",
            ),
        ] {
            let error = validate_audio_path(path).expect_err("path should be rejected");
            assert_eq!(error.code, code);
        }
    }

    #[test]
    fn maps_empty_and_provider_error_outcomes_with_redacted_diagnostics() {
        let request = test_request("provider-map-run");

        let empty = map_provider_outcome_to_host_response(
            ProviderTranscriptionOutcome::Ok {
                text: "[BLANK_AUDIO]".to_string(),
                provider: "groq".to_string(),
                model: "whisper-large-v3".to_string(),
                latency_ms: 7,
                request_id: None,
            },
            &request,
        );
        assert!(matches!(
            empty,
            HostTranscriptionResponse::Empty { ref error, retryable: true, .. }
                if error.code == "EMPTY_TRANSCRIPT"
        ));

        let provider_error = map_provider_outcome_to_host_response(
            ProviderTranscriptionOutcome::ProviderError {
                code: "GROQ_HTTP_401".to_string(),
                message: "bad key gsk_test_secret_must_not_leak xoxb-secret-token".to_string(),
                provider: Some("groq".to_string()),
                model: Some("whisper-large-v3".to_string()),
                latency_ms: Some(7),
                request_id: Some("Bearer gsk_request_secret".to_string()),
            },
            &request,
        );

        assert!(matches!(
            provider_error,
            HostTranscriptionResponse::ProviderError {
                ref error,
                request_id: Some(ref request_id),
                retryable: true,
                ..
            } if error.code == "GROQ_HTTP_401" && request_id == "redacted-request-id"
        ));
        assert!(!format!("{provider_error:?}").contains("gsk_"));
    }

    #[test]
    fn generated_transcript_and_report_paths_stay_under_allowed_roots() {
        let request = test_request("run:with/unsafe chars");
        let response = map_provider_outcome_to_host_response(
            ProviderTranscriptionOutcome::Ok {
                text: " host transcript ".to_string(),
                provider: "groq".to_string(),
                model: "whisper-large-v3".to_string(),
                latency_ms: 42,
                request_id: Some("req_safe_123".to_string()),
            },
            &request,
        );

        let HostTranscriptionResponse::Ok {
            ref text,
            transcript_path: Some(ref transcript_path),
            report_path: Some(ref report_path),
            ..
        } = response
        else {
            panic!("expected ok response");
        };

        assert_eq!(text, "host transcript");
        assert_eq!(
            transcript_path,
            "artifacts/microphone-capture/transcripts/run-with-unsafe-chars.txt",
        );
        assert_eq!(
            report_path,
            "artifacts/microphone-capture/reports/run-with-unsafe-chars.json",
        );
        validate_transcript_path(transcript_path).expect("transcript path should be valid");
        validate_report_path(report_path).expect("report path should be valid");

        let report = create_redacted_report(&response, &request);
        assert!(report.contains("\"rawProviderPayloadStored\":false"));
        assert!(report.contains("\"transcriptLength\":15"));
        assert!(!report.contains("host transcript"));
    }

    #[test]
    fn cancelled_provider_outcome_maps_without_retry() {
        let response = map_provider_outcome_to_host_response(
            ProviderTranscriptionOutcome::Cancelled,
            &test_request("cancelled-run"),
        );

        assert!(matches!(
            response,
            HostTranscriptionResponse::Cancelled {
                retryable: false,
                ..
            }
        ));
    }

    fn test_request(run_id: &str) -> HostTranscriptionRequest {
        HostTranscriptionRequest {
            run_id: run_id.to_string(),
            audio_path: "artifacts/microphone-capture/audio/capture.wav".to_string(),
            provider: None,
            model: None,
            language: None,
            mode: "real".to_string(),
            allow_provider_call: true,
        }
    }
}
