use std::{
    collections::hash_map::DefaultHasher,
    env, fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use crate::fixvox_cloud;
use reqwest::header;
use serde::{Deserialize, Serialize};

const ARTIFACT_ROOT: &str = "artifacts/microphone-capture";
const AUDIO_ROOT: &str = "artifacts/microphone-capture/audio/";
const TRANSCRIPT_ROOT: &str = "artifacts/microphone-capture/transcripts/";
const REPORT_ROOT: &str = "artifacts/microphone-capture/reports/";
const DEFAULT_PROVIDER: &str = "groq";
const DEFAULT_MODEL: &str = "whisper-large-v3";
const DEFAULT_PRO_STT_MODEL: &str = "whisper-large-v3-turbo";
const GROQ_TRANSCRIPTION_ENDPOINT: &str = "https://api.groq.com/openai/v1/audio/transcriptions";
const TRANSCRIPTION_PREFLIGHT_CACHE_TTL_MS: u64 = 60_000;
const TRANSCRIPTION_PREFLIGHT_IN_FLIGHT_SOFT_TIMEOUT_MS: u64 = 1_000;
const VAD_FRAME_MS: u64 = 50;
const VAD_MIN_VOICED_MS: u64 = 150;
const VAD_RMS_THRESHOLD: f64 = 0.002;
const VAD_PEAK_THRESHOLD: f64 = 0.006;
const AUDIO_COMPRESSION_MIN_BYTES: usize = 160_000;
const POST_STT_NO_SPEECH_THRESHOLD: f64 = 0.85;
const POST_STT_WEAK_NO_SPEECH_THRESHOLD: f64 = 0.7;
const POST_STT_LOW_LOGPROB_THRESHOLD: f64 = -1.0;

static TRANSCRIPTION_PREFLIGHT_CACHE: OnceLock<Mutex<Option<CachedPreflightDecision>>> =
    OnceLock::new();
static TRANSCRIPTION_PREFLIGHT_IN_FLIGHT: OnceLock<Mutex<Option<InFlightPreflightDecision>>> =
    OnceLock::new();

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
    direct_byok_configured: bool,
    managed_cloud_configured: bool,
    managed_device_registered: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    managed_backend_base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    managed_cloud_reason: Option<RedactedHostRuntimeError>,
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
    post_process: Option<HostPostProcessPolicy>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HostSelectionTransformRequest {
    run_id: String,
    selected_text: String,
    instruction: String,
    preset_id: Option<String>,
    mode: String,
    allow_provider_call: bool,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HostAssistantChatRequest {
    run_id: String,
    prompt: String,
    mode: String,
    allow_provider_call: bool,
    #[serde(default)]
    history: Vec<HostAssistantChatMessage>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HostAssistantChatMessage {
    role: String,
    text: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum HostSelectionTransformResponse {
    #[serde(rename_all = "camelCase")]
    Ok {
        text: String,
        provider: String,
        model: String,
        latency_ms: u64,
        request_id: Option<String>,
        redacted: bool,
    },
    #[serde(rename_all = "camelCase")]
    SetupError {
        error: RedactedHostRuntimeError,
        retryable: bool,
        redacted: bool,
    },
    #[serde(rename_all = "camelCase")]
    ProviderError {
        error: RedactedHostRuntimeError,
        retryable: bool,
        redacted: bool,
    },
}

pub type HostAssistantChatResponse = HostSelectionTransformResponse;

#[derive(Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct HostPostProcessPolicy {
    enabled: bool,
    prompt: Option<String>,
    provider: Option<String>,
    model: Option<String>,
    source: Option<String>,
    policy_id: Option<String>,
    voice_routing_profile_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct DictationRuntimePlan {
    policy_id: Option<String>,
    voice_routing_profile_id: Option<String>,
    route_label: Option<String>,
    stt_provider: String,
    stt_model: String,
    stt_prompt_enabled: bool,
    stt_prompt: Option<String>,
    language: Option<String>,
    post_process: HostPostProcessPolicy,
}

#[derive(Clone, Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RedactedHostRuntimeError {
    code: String,
    message: String,
    redacted: bool,
}

#[derive(Clone, Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HostPostProcessEvidence {
    enabled: bool,
    ran: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    policy_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    voice_routing_profile_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sanitized_changed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sanitizer_reason: Option<String>,
    fallback_to_raw: bool,
    raw_transcript_length: usize,
    final_text_length: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_id: Option<String>,
    redacted: bool,
}

#[derive(Clone, Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RedactedFixvoxResponseMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    fixvox_request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    provider_request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cost_usd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pricing_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    remaining: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reset_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    usage_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy_parse_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy_usage_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy_upstream_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy_engine_binding_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy_prompt_resolution_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy_budget_config_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy_budget_events_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy_multipart_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy_budget_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy_init_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy_total_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    server_timing: Option<String>,
    redacted: bool,
}

#[derive(Clone, Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HostAudioPrepEvidence {
    original_bytes: usize,
    upload_bytes: usize,
    upload_mime_type: String,
    upload_source: String,
    upload_file_name: String,
    compression_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    compression_ratio: Option<String>,
    optimization_status: String,
    optimization_reason: String,
    audio_duration_ms: u64,
    voice_activity: HostVoiceActivityEvidence,
    #[serde(skip_serializing_if = "Option::is_none")]
    no_speech_reason: Option<String>,
    redacted: bool,
}

#[derive(Clone, Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HostVoiceActivityEvidence {
    duration_ms: u64,
    frame_count: u64,
    voiced_frame_count: u64,
    voiced_ms: u64,
    rms_ppm: u64,
    peak_ppm: u64,
    has_speech: bool,
}

#[derive(Clone, Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedPreflightEvidence {
    cached: bool,
    prewarmed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_age_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    in_flight_soft_timed_out: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    trusted_policy_fallback: Option<bool>,
    redacted: bool,
}

#[derive(Clone, Debug)]
struct SpeechUploadPayload {
    bytes: Vec<u8>,
    mime_type: &'static str,
    file_name: String,
    source: String,
    original_bytes: usize,
    compression_ms: u64,
    compression_ratio: Option<String>,
    optimization_status: &'static str,
    optimization_reason: &'static str,
    voice_activity: HostVoiceActivityEvidence,
    audio_duration_ms: u64,
}

impl SpeechUploadPayload {
    fn evidence(&self, no_speech_reason: Option<String>) -> HostAudioPrepEvidence {
        HostAudioPrepEvidence {
            original_bytes: self.original_bytes,
            upload_bytes: self.bytes.len(),
            upload_mime_type: self.mime_type.to_string(),
            upload_source: self.source.clone(),
            upload_file_name: self.file_name.clone(),
            compression_ms: self.compression_ms,
            compression_ratio: self.compression_ratio.clone(),
            optimization_status: self.optimization_status.to_string(),
            optimization_reason: self.optimization_reason.to_string(),
            audio_duration_ms: self.audio_duration_ms,
            voice_activity: self.voice_activity.clone(),
            no_speech_reason,
            redacted: true,
        }
    }
}

struct ManagedPreflightCheck {
    outcome: Option<ProviderTranscriptionOutcome>,
    evidence: ManagedPreflightEvidence,
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
        #[serde(skip_serializing_if = "Option::is_none")]
        fixvox_metadata: Option<RedactedFixvoxResponseMetadata>,
        #[serde(skip_serializing_if = "Option::is_none")]
        audio_prep: Option<HostAudioPrepEvidence>,
        #[serde(skip_serializing_if = "Option::is_none")]
        preflight: Option<ManagedPreflightEvidence>,
        #[serde(skip_serializing_if = "Option::is_none")]
        post_process: Option<HostPostProcessEvidence>,
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
        #[serde(skip_serializing_if = "Option::is_none")]
        fixvox_metadata: Option<RedactedFixvoxResponseMetadata>,
        #[serde(skip_serializing_if = "Option::is_none")]
        audio_prep: Option<HostAudioPrepEvidence>,
        #[serde(skip_serializing_if = "Option::is_none")]
        preflight: Option<ManagedPreflightEvidence>,
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
        #[serde(skip_serializing_if = "Option::is_none")]
        fixvox_metadata: Option<RedactedFixvoxResponseMetadata>,
        #[serde(skip_serializing_if = "Option::is_none")]
        audio_prep: Option<HostAudioPrepEvidence>,
        #[serde(skip_serializing_if = "Option::is_none")]
        preflight: Option<ManagedPreflightEvidence>,
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

#[derive(Clone, Debug)]
struct ManagedHostRuntimeConfig {
    backend_base_url: String,
    install_id: String,
    device_id: String,
    provider: String,
    model: String,
    language: Option<String>,
    stt_prompt: Option<String>,
    post_process: Option<HostPostProcessPolicy>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct PreflightCacheKey {
    backend_base_url: String,
    install_id: String,
    device_id: String,
    usage_kind: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct CachedPreflightDecision {
    key: PreflightCacheKey,
    allowed: bool,
    cached_at_ms: u64,
    request_id: Option<String>,
    prewarmed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct InFlightPreflightDecision {
    key: PreflightCacheKey,
    started_at_ms: u64,
    prewarmed: bool,
}

#[derive(Debug)]
struct PreflightInFlightOwner {
    key: PreflightCacheKey,
    started_at_ms: u64,
}

impl Drop for PreflightInFlightOwner {
    fn drop(&mut self) {
        clear_preflight_in_flight_if_owner(&self.key, self.started_at_ms);
    }
}

enum PreflightInFlightAction {
    Start(PreflightInFlightOwner),
    Wait(InFlightPreflightDecision),
    Bypass(ManagedPreflightEvidence),
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
        fixvox_metadata: Option<fixvox_cloud::FixvoxResponseMetadata>,
    },
    NoSpeech {
        reason: String,
        no_speech_probability: Option<String>,
        average_log_probability: Option<String>,
        provider: String,
        model: String,
        latency_ms: u64,
        request_id: Option<String>,
        fixvox_metadata: Option<fixvox_cloud::FixvoxResponseMetadata>,
    },
    ProviderError {
        code: String,
        message: String,
        provider: Option<String>,
        model: Option<String>,
        latency_ms: Option<u64>,
        request_id: Option<String>,
        fixvox_metadata: Option<fixvox_cloud::FixvoxResponseMetadata>,
    },
    Cancelled,
}

#[derive(Deserialize)]
struct GroqTranscriptionResponseBody {
    text: Option<String>,
    segments: Option<Vec<WhisperSegmentBody>>,
}

#[derive(Deserialize)]
struct WhisperSegmentBody {
    avg_logprob: Option<f64>,
    no_speech_prob: Option<f64>,
}

struct ManagedCloudReadiness {
    configured: bool,
    device_registered: bool,
    backend_base_url: Option<String>,
    reason: Option<RedactedHostRuntimeError>,
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

#[tauri::command]
pub async fn transform_selected_text(
    request: HostSelectionTransformRequest,
) -> HostSelectionTransformResponse {
    if request.mode != "real" || !request.allow_provider_call {
        return HostSelectionTransformResponse::SetupError {
            error: error(
                "FIXVOX_SELECTION_TRANSFORM_PROVIDER_DISABLED",
                "Selection transform requires managed Fixvox Cloud access.",
            ),
            retryable: false,
            redacted: true,
        };
    }

    transform_selected_text_with_managed_chat(request, &read_host_env_value).await
}

#[tauri::command]
pub async fn run_assistant_chat(request: HostAssistantChatRequest) -> HostAssistantChatResponse {
    if request.mode != "real" || !request.allow_provider_call {
        return HostAssistantChatResponse::SetupError {
            error: error(
                "FIXVOX_ASSISTANT_PROVIDER_DISABLED",
                "Assistant chat requires managed Fixvox Cloud access.",
            ),
            retryable: false,
            redacted: true,
        };
    }

    run_assistant_chat_with_managed_chat(request, &read_host_env_value).await
}

#[tauri::command]
pub async fn prewarm_fixvox_managed_transcription() -> Result<(), RedactedHostRuntimeError> {
    // Canonical runtime admission is authoritative immediately before dispatch;
    // desktop preflight/prewarm is intentionally a no-op.
    Ok(())
}

async fn run_assistant_chat_with_managed_chat(
    request: HostAssistantChatRequest,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> HostAssistantChatResponse {
    let _run_id = request.run_id.trim();
    let prompt = request.prompt.trim();
    if prompt.is_empty() {
        return HostAssistantChatResponse::SetupError {
            error: error(
                "FIXVOX_ASSISTANT_PROMPT_MISSING",
                "Assistant chat requires a prompt.",
            ),
            retryable: true,
            redacted: true,
        };
    }

    let persisted_device_state = read_persisted_fixvox_device_state(env_lookup);
    if let Some(state) = persisted_device_state.as_ref() {
        if let Err(reason) =
            fixvox_cloud::policy_allows_managed_operation(state, "assistant_action")
        {
            return HostAssistantChatResponse::SetupError {
                error: error(&reason.code, &reason.message),
                retryable: false,
                redacted: true,
            };
        }
    }

    let backend_base_url = match fixvox_cloud::resolve_backend_base_url(env_lookup) {
        Ok(value) => value,
        Err(reason) => {
            return HostAssistantChatResponse::SetupError {
                error: error(&reason.code, &reason.message),
                retryable: true,
                redacted: true,
            };
        }
    };
    let Some(device_id) = resolve_fixvox_device_id(env_lookup) else {
        return HostAssistantChatResponse::SetupError {
            error: error(
                "FIXVOX_DEVICE_ID_MISSING",
                "Assistant chat requires a registered Fixvox Cloud device.",
            ),
            retryable: true,
            redacted: true,
        };
    };
    let started_at = Instant::now();
    let preview = match fixvox_cloud::build_managed_chat_completion_request_preview(
        fixvox_cloud::FixvoxCloudConfig {
            backend_base_url,
            device_id: Some(device_id.clone()),
        },
        fixvox_cloud::ManagedChatInput {
            transcript: prompt.to_string(),
            instruction: None,
            preset_key: None,
            conversation_summary: Some(build_assistant_chat_history_block(&request.history)),
            engine_kind: Some(fixvox_cloud::ManagedChatEngineKind::Assistant),
        },
    ) {
        Ok(preview) => preview,
        Err(reason) => {
            return HostAssistantChatResponse::SetupError {
                error: error(&reason.code, &reason.message),
                retryable: true,
                redacted: true,
            };
        }
    };

    let client = match fixvox_cloud::fixvox_http_client() {
        Ok(client) => client,
        Err(_) => {
            return HostAssistantChatResponse::ProviderError {
                error: error(
                    "FIXVOX_ASSISTANT_HTTP_CLIENT_FAILED",
                    "Fixvox assistant chat HTTP client could not be created.",
                ),
                retryable: true,
                redacted: true,
            };
        }
    };
    let http_response = match client
        .post(&preview.endpoint)
        .header(header::CONTENT_TYPE, "application/json")
        .header("X-Device-Id", device_id)
        .header("X-Fixvox-Request-Context", "assistant.quick-chat")
        .json(&preview.body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => {
            return HostAssistantChatResponse::ProviderError {
                error: error(
                    "FIXVOX_ASSISTANT_REQUEST_FAILED",
                    "Fixvox managed assistant chat request failed.",
                ),
                retryable: true,
                redacted: true,
            };
        }
    };
    let status = http_response.status();
    let request_id = redact_request_id(
        http_response
            .headers()
            .get("X-Fixvox-Request-Id")
            .or_else(|| http_response.headers().get("x-request-id"))
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string()),
    );
    let body = match http_response.text().await {
        Ok(body) => body,
        Err(_) => {
            return HostAssistantChatResponse::ProviderError {
                error: error(
                    "FIXVOX_ASSISTANT_RESPONSE_READ_FAILED",
                    "Fixvox managed assistant chat response could not be read.",
                ),
                retryable: true,
                redacted: true,
            };
        }
    };
    if !status.is_success() {
        return HostAssistantChatResponse::ProviderError {
            error: error(
                "FIXVOX_ASSISTANT_REQUEST_REJECTED",
                "Fixvox managed assistant chat was rejected by the cloud service.",
            ),
            retryable: status.is_server_error(),
            redacted: true,
        };
    }
    let parsed = match fixvox_cloud::parse_managed_chat_json_response(&body) {
        Ok(parsed) => parsed,
        Err(reason) => {
            return HostAssistantChatResponse::ProviderError {
                error: error(&reason.code, &reason.message),
                retryable: true,
                redacted: true,
            };
        }
    };
    let text = sanitize_selection_transform_output(&parsed.output);
    if text.is_empty() {
        return HostAssistantChatResponse::ProviderError {
            error: error(
                "FIXVOX_ASSISTANT_EMPTY_OUTPUT",
                "Fixvox managed assistant chat returned empty output.",
            ),
            retryable: true,
            redacted: true,
        };
    }

    HostAssistantChatResponse::Ok {
        text,
        provider: "fixvox-cloud".to_string(),
        model: parsed.model.unwrap_or_else(|| "server-owned".to_string()),
        latency_ms: started_at.elapsed().as_millis() as u64,
        request_id,
        redacted: true,
    }
}

async fn transform_selected_text_with_managed_chat(
    request: HostSelectionTransformRequest,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> HostSelectionTransformResponse {
    let _run_id = request.run_id.trim();
    let selected_text = request.selected_text.trim();
    let instruction = request.instruction.trim();
    if selected_text.is_empty() || instruction.is_empty() {
        return HostSelectionTransformResponse::SetupError {
            error: error(
                "FIXVOX_SELECTION_TRANSFORM_INPUT_MISSING",
                "Selection transform requires both selected text and dictated instruction.",
            ),
            retryable: true,
            redacted: true,
        };
    }

    let backend_base_url = match fixvox_cloud::resolve_backend_base_url(env_lookup) {
        Ok(value) => value,
        Err(reason) => {
            eprintln!(
                "[dictation-tauri][selection-transform] setup_error code={}",
                reason.code
            );
            return HostSelectionTransformResponse::SetupError {
                error: error(&reason.code, &reason.message),
                retryable: true,
                redacted: true,
            };
        }
    };
    let Some(device_id) = resolve_fixvox_device_id(env_lookup) else {
        eprintln!(
            "[dictation-tauri][selection-transform] setup_error code=FIXVOX_DEVICE_ID_MISSING"
        );
        return HostSelectionTransformResponse::SetupError {
            error: error(
                "FIXVOX_DEVICE_ID_MISSING",
                "Selection transform requires a registered Fixvox Cloud device.",
            ),
            retryable: true,
            redacted: true,
        };
    };

    let preset = request
        .preset_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("natural_instruction");
    eprintln!(
        "[dictation-tauri][selection-transform] request selected_len={} instruction_len={} preset={}",
        selected_text.chars().count(),
        instruction.chars().count(),
        preset
    );
    let started_at = Instant::now();
    let preview = match fixvox_cloud::build_managed_chat_completion_request_preview(
        fixvox_cloud::FixvoxCloudConfig {
            backend_base_url,
            device_id: Some(device_id.clone()),
        },
        fixvox_cloud::ManagedChatInput {
            transcript: selected_text.to_string(),
            instruction: Some(instruction.to_string()),
            preset_key: Some(preset.to_string()),
            conversation_summary: None,
            engine_kind: Some(fixvox_cloud::ManagedChatEngineKind::SelectionTransform),
        },
    ) {
        Ok(preview) => preview,
        Err(reason) => {
            return HostSelectionTransformResponse::SetupError {
                error: error(&reason.code, &reason.message),
                retryable: true,
                redacted: true,
            };
        }
    };

    let client = match fixvox_cloud::fixvox_http_client() {
        Ok(client) => client,
        Err(_) => {
            return HostSelectionTransformResponse::ProviderError {
                error: error(
                    "FIXVOX_SELECTION_TRANSFORM_HTTP_CLIENT_FAILED",
                    "Fixvox selection transform HTTP client could not be created.",
                ),
                retryable: true,
                redacted: true,
            };
        }
    };
    let http_response = match client
        .post(&preview.endpoint)
        .header(header::CONTENT_TYPE, "application/json")
        .header("X-Device-Id", device_id)
        .header(
            "X-Fixvox-Engine-Kind",
            fixvox_cloud::ManagedChatEngineKind::SelectionTransform.as_header_value(),
        )
        .header("X-Fixvox-Request-Context", format!("preset.{preset}"))
        .json(&preview.body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => {
            return HostSelectionTransformResponse::ProviderError {
                error: error(
                    "FIXVOX_SELECTION_TRANSFORM_REQUEST_FAILED",
                    "Fixvox managed selection transform request failed.",
                ),
                retryable: true,
                redacted: true,
            };
        }
    };
    let request_id = redact_request_id(
        http_response
            .headers()
            .get("X-Fixvox-Request-Id")
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string()),
    );
    let status = http_response.status();
    let body = match http_response.text().await {
        Ok(body) => body,
        Err(_) => {
            return HostSelectionTransformResponse::ProviderError {
                error: error(
                    "FIXVOX_SELECTION_TRANSFORM_RESPONSE_READ_FAILED",
                    "Fixvox managed selection transform response could not be read.",
                ),
                retryable: true,
                redacted: true,
            };
        }
    };
    if !status.is_success() {
        eprintln!(
            "[dictation-tauri][selection-transform] rejected status={}",
            status.as_u16()
        );
        return HostSelectionTransformResponse::ProviderError {
            error: error(
                "FIXVOX_SELECTION_TRANSFORM_REQUEST_REJECTED",
                "Fixvox managed selection transform was rejected by the cloud service.",
            ),
            retryable: status.as_u16() >= 500,
            redacted: true,
        };
    }

    let parsed = match fixvox_cloud::parse_managed_chat_json_response(&body) {
        Ok(parsed) => parsed,
        Err(reason) => {
            return HostSelectionTransformResponse::ProviderError {
                error: error(&reason.code, &reason.message),
                retryable: true,
                redacted: true,
            };
        }
    };
    let text = sanitize_selection_transform_output(&parsed.output);
    if text.is_empty() {
        eprintln!("[dictation-tauri][selection-transform] empty output");
        return HostSelectionTransformResponse::ProviderError {
            error: error(
                "FIXVOX_SELECTION_TRANSFORM_EMPTY_OUTPUT",
                "Fixvox managed selection transform returned empty output.",
            ),
            retryable: true,
            redacted: true,
        };
    }

    eprintln!(
        "[dictation-tauri][selection-transform] ok output_len={}",
        text.chars().count()
    );

    HostSelectionTransformResponse::Ok {
        text,
        provider: "fixvox-cloud".to_string(),
        model: parsed.model.unwrap_or_else(|| "server-owned".to_string()),
        latency_ms: elapsed_ms(started_at),
        request_id,
        redacted: true,
    }
}

fn build_assistant_chat_history_block(history: &[HostAssistantChatMessage]) -> String {
    let lines: Vec<String> = history
        .iter()
        .filter_map(|message| {
            let role = match message.role.trim() {
                "user" => "user",
                "assistant" => "assistant",
                _ => return None,
            };
            let text = message.text.trim();
            if text.is_empty() {
                return None;
            }
            Some(format!("{role}: {text}"))
        })
        .rev()
        .take(8)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();

    if lines.is_empty() {
        return String::new();
    }

    format!(
        "Recent local Quick Chat context (oldest to newest, redacted UI text only):\n<ASSISTANT_HISTORY>\n{}\n</ASSISTANT_HISTORY>\n\n",
        lines.join("\n")
    )
}

fn sanitize_selection_transform_output(output: &str) -> String {
    output.trim().trim_matches('`').trim().to_string()
}

fn prewarm_transcription_request() -> HostTranscriptionRequest {
    HostTranscriptionRequest {
        run_id: "prewarm-managed-transcription".to_string(),
        audio_path: format!("{}prewarm.wav", AUDIO_ROOT),
        provider: None,
        model: None,
        language: None,
        mode: "real".to_string(),
        allow_provider_call: true,
        post_process: None,
    }
}

fn create_runtime_transcription_readiness(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> HostRuntimeReadiness {
    let managed = create_managed_cloud_readiness(env_lookup);

    match read_host_runtime_config(env_lookup) {
        Ok(config) => HostRuntimeReadiness {
            configured: true,
            provider: Some(config.provider),
            model: Some(config.model),
            artifact_root: ARTIFACT_ROOT,
            supports_real_provider_call: true,
            direct_byok_configured: true,
            managed_cloud_configured: managed.configured,
            managed_device_registered: managed.device_registered,
            managed_backend_base_url: managed.backend_base_url,
            managed_cloud_reason: managed.reason,
            reason: None,
        },
        Err(reason) => {
            if managed.configured && managed.device_registered {
                return HostRuntimeReadiness {
                    configured: true,
                    provider: Some("fixvox-cloud".to_string()),
                    model: Some(resolve_dictation_runtime_plan(env_lookup).stt_model),
                    artifact_root: ARTIFACT_ROOT,
                    supports_real_provider_call: true,
                    direct_byok_configured: false,
                    managed_cloud_configured: managed.configured,
                    managed_device_registered: managed.device_registered,
                    managed_backend_base_url: managed.backend_base_url,
                    managed_cloud_reason: managed.reason,
                    reason: None,
                };
            }

            HostRuntimeReadiness {
                configured: false,
                provider: None,
                model: None,
                artifact_root: ARTIFACT_ROOT,
                supports_real_provider_call: false,
                direct_byok_configured: false,
                managed_cloud_configured: managed.configured,
                managed_device_registered: managed.device_registered,
                managed_backend_base_url: managed.backend_base_url,
                managed_cloud_reason: managed.reason,
                reason: Some(reason),
            }
        }
    }
}

fn create_managed_cloud_readiness(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> ManagedCloudReadiness {
    match fixvox_cloud::resolve_backend_base_url(env_lookup) {
        Ok(backend_base_url) => ManagedCloudReadiness {
            configured: true,
            device_registered: resolve_fixvox_device_id(env_lookup).is_some(),
            backend_base_url: Some(backend_base_url),
            reason: None,
        },
        Err(reason) => ManagedCloudReadiness {
            configured: false,
            device_registered: false,
            backend_base_url: None,
            reason: Some(error(&reason.code, &reason.message)),
        },
    }
}

fn resolve_fixvox_device_id(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Option<String> {
    read_persisted_fixvox_device_id(env_lookup)
        .or_else(|| first_env_value(env_lookup, &["FIXVOX_DEVICE_ID"]))
        .or_else(|| {
            ensure_persisted_fixvox_device_state(env_lookup)
                .and_then(|state| state.device_id)
                .filter(|device_id| !device_id.trim().is_empty())
        })
}

fn resolve_fixvox_install_id(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Option<String> {
    read_persisted_fixvox_install_id(env_lookup)
        .or_else(|| first_env_value(env_lookup, &["FIXVOX_INSTALL_ID"]))
        .or_else(|| {
            ensure_persisted_fixvox_device_state(env_lookup)
                .map(|state| state.install_id)
                .filter(|install_id| !install_id.trim().is_empty())
        })
}

fn read_persisted_fixvox_device_id(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Option<String> {
    read_persisted_fixvox_device_state(env_lookup)
        .and_then(|state| state.device_id)
        .filter(|device_id| !device_id.trim().is_empty())
}

fn read_persisted_fixvox_install_id(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Option<String> {
    read_persisted_fixvox_device_state(env_lookup)
        .map(|state| state.install_id)
        .filter(|install_id| !install_id.trim().is_empty())
}

fn read_persisted_fixvox_device_state(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Option<fixvox_cloud::FixvoxDeviceState> {
    let path = fixvox_cloud::resolve_device_state_path(env_lookup).ok()?;
    fixvox_cloud::read_device_state(&path).ok().flatten()
}

fn ensure_persisted_fixvox_device_state(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Option<fixvox_cloud::FixvoxDeviceState> {
    if let Some(state) = read_persisted_fixvox_device_state(env_lookup) {
        return Some(state);
    }

    fixvox_cloud::get_fixvox_cloud_status_with_env(env_lookup).ok()?;
    read_persisted_fixvox_device_state(env_lookup)
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

    let requested_provider = request
        .provider
        .clone()
        .filter(|value| !value.trim().is_empty());
    let use_direct_byok = requested_provider
        .as_deref()
        .map(|provider| {
            matches!(
                provider.trim().to_ascii_lowercase().as_str(),
                "groq" | "direct" | "byok"
            )
        })
        .unwrap_or(false);

    let direct_config = if use_direct_byok {
        match read_host_runtime_config(env_lookup) {
            Ok(config) => Some(config),
            Err(reason) => {
                return HostTranscriptionResponse::SetupError {
                    error: reason,
                    provider: request.provider,
                    model: request.model,
                    retryable: true,
                    redacted: true,
                };
            }
        }
    } else {
        None
    };

    if let Some(provider) = requested_provider.as_deref() {
        let normalized = provider.trim().to_ascii_lowercase();
        if !matches!(normalized.as_str(), "groq" | "direct" | "byok") {
            return HostTranscriptionResponse::SetupError {
                error: error(
                    "UNSUPPORTED_PROVIDER",
                    "Only managed Fixvox cloud or explicit direct BYOK transcription is supported in this build.",
                ),
                provider: Some(redact_host_text(provider)),
                model: request.model.clone(),
                retryable: true,
                redacted: true,
            };
        }
    }

    let managed_config = if use_direct_byok {
        None
    } else {
        match read_managed_runtime_config(env_lookup, &request) {
            Ok(config) => Some(config),
            Err(reason) => {
                return HostTranscriptionResponse::SetupError {
                    error: reason,
                    provider: Some("fixvox-cloud".to_string()),
                    model: request
                        .model
                        .clone()
                        .or_else(|| Some(DEFAULT_MODEL.to_string())),
                    retryable: true,
                    redacted: true,
                };
            }
        }
    };

    let audio_file_path = match resolve_existing_artifact_file_path(&request.audio_path) {
        Some(path) => path,
        None => {
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

    let audio = match fs::read(&audio_file_path) {
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

    let upload_payload = prepare_speech_upload_payload(Path::new(&audio_file_path), audio);
    let audio_prep = upload_payload.evidence(None);
    if !upload_payload.voice_activity.has_speech {
        let response = HostTranscriptionResponse::Empty {
            error: error("NO_SPEECH_DETECTED", "No speech detected in recording."),
            report_path: Some(create_report_path(&request.run_id)),
            provider: managed_config
                .as_ref()
                .map(|config| config.provider.clone())
                .or_else(|| direct_config.as_ref().map(|config| config.provider.clone()))
                .unwrap_or_else(|| DEFAULT_PROVIDER.to_string()),
            model: managed_config
                .as_ref()
                .map(|config| config.model.clone())
                .or_else(|| direct_config.as_ref().map(|config| config.model.clone()))
                .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            latency_ms: 0,
            request_id: None,
            fixvox_metadata: None,
            audio_prep: Some(
                upload_payload.evidence(Some("local_voice_activity_no_speech".to_string())),
            ),
            preflight: None,
            retryable: true,
            redacted: true,
        };
        if let Err(write_error) = write_host_artifacts(&response, &request) {
            return HostTranscriptionResponse::ProviderError {
                error: write_error,
                provider: response_provider(&response),
                model: response_model(&response),
                latency_ms: response_latency_ms(&response),
                request_id: response_request_id(&response),
                fixvox_metadata: response_fixvox_metadata(&response).cloned(),
                audio_prep: response_audio_prep(&response).cloned(),
                preflight: response_preflight(&response).cloned(),
                retryable: true,
                redacted: true,
            };
        }
        return response;
    }

    // No separate preflight: the canonical API reserves authoritatively at the
    // provider boundary as part of this single request.
    let preflight_evidence = None;
    let managed_config_for_postprocess = managed_config.clone();
    let outcome = if let Some(config) = managed_config {
        transcribe_fixvox_managed_audio(config, &request, upload_payload).await
    } else {
        transcribe_groq_audio(
            direct_config.expect("direct config should be present for direct BYOK"),
            &request,
            upload_payload,
        )
        .await
    };
    let response = apply_fixvox_managed_postprocess(
        map_provider_outcome_to_host_response(
            outcome,
            &request,
            Some(audio_prep),
            preflight_evidence,
        ),
        managed_config_for_postprocess.as_ref(),
        &request,
    )
    .await;

    if let Err(write_error) = write_host_artifacts(&response, &request) {
        return HostTranscriptionResponse::ProviderError {
            error: write_error,
            provider: response_provider(&response),
            model: response_model(&response),
            latency_ms: response_latency_ms(&response),
            request_id: response_request_id(&response),
            fixvox_metadata: response_fixvox_metadata(&response).cloned(),
            audio_prep: response_audio_prep(&response).cloned(),
            preflight: response_preflight(&response).cloned(),
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

fn read_managed_runtime_config(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
    request: &HostTranscriptionRequest,
) -> Result<ManagedHostRuntimeConfig, RedactedHostRuntimeError> {
    let backend_base_url = fixvox_cloud::resolve_backend_base_url(env_lookup)
        .map_err(|reason| error(&reason.code, &reason.message))?;
    let install_id = resolve_fixvox_install_id(env_lookup).ok_or_else(|| {
        error(
            "FIXVOX_INSTALL_ID_MISSING",
            "Managed Fixvox transcription preflight requires an install id.",
        )
    })?;
    let device_id = resolve_fixvox_device_id(env_lookup).ok_or_else(|| {
        error(
            "FIXVOX_DEVICE_ID_MISSING",
            "Managed Fixvox transcription requires a registered device id.",
        )
    })?;
    let persisted_device_state = read_persisted_fixvox_device_state(env_lookup);
    if let Some(state) = persisted_device_state.as_ref() {
        fixvox_cloud::policy_allows_managed_transcription(state)
            .map_err(|reason| error(&reason.code, &reason.message))?;
    }

    let runtime_plan = resolve_dictation_runtime_plan(env_lookup);
    let model = request
        .model
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| Some(runtime_plan.stt_model.clone()))
        .or_else(|| {
            first_env_value(
                env_lookup,
                &["FIXVOX_STT_MODEL", "GROQ_STT_MODEL", "GROQ-STT-MODEL"],
            )
        })
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());
    let language = request
        .language
        .clone()
        .or_else(|| runtime_plan.language.clone())
        .or_else(|| {
            first_env_value(
                env_lookup,
                &[
                    "FIXVOX_STT_LANGUAGE",
                    "GROQ_STT_LANGUAGE",
                    "GROQ-STT-LANGUAGE",
                ],
            )
        })
        .filter(|value| !value.trim().is_empty());
    let stt_prompt = runtime_plan
        .stt_prompt
        .clone()
        .or_else(|| first_env_value(env_lookup, &["FIXVOX_STT_PROMPT", "GROQ_STT_PROMPT"]))
        .filter(|value| !value.trim().is_empty());
    let post_process = request
        .post_process
        .clone()
        .or_else(|| Some(runtime_plan.post_process.clone()));
    if post_process
        .as_ref()
        .map(|policy| policy.enabled)
        .unwrap_or(false)
    {
        if let Some(state) = persisted_device_state.as_ref() {
            fixvox_cloud::policy_allows_managed_operation(state, "postprocess")
                .map_err(|reason| error(&reason.code, &reason.message))?;
        }
    }

    Ok(ManagedHostRuntimeConfig {
        backend_base_url,
        install_id,
        device_id,
        provider: "fixvox-cloud".to_string(),
        model,
        language,
        stt_prompt,
        post_process,
    })
}

fn resolve_dictation_runtime_plan(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> DictationRuntimePlan {
    read_dictation_policy_json(env_lookup)
        .as_ref()
        .map(resolve_dictation_runtime_plan_from_policy_json)
        .unwrap_or_else(|| {
            let policy_id = read_persisted_fixvox_device_state(env_lookup)
                .and_then(|state| state.policy_id)
                .filter(|value| !value.trim().is_empty());
            fallback_dictation_runtime_plan(policy_id)
        })
}

fn read_dictation_policy_json(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Option<serde_json::Value> {
    if let Some(raw_json) = first_env_value(env_lookup, &["FIXVOX_CACHED_POLICY_JSON"])
        .filter(|value| !value.trim().is_empty())
    {
        return serde_json::from_str(&raw_json).ok();
    }

    if let Some(path) = first_env_value(env_lookup, &["FIXVOX_CACHED_POLICY_PATH"])
        .filter(|value| !value.trim().is_empty())
    {
        return fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok());
    }

    read_persisted_fixvox_device_state(env_lookup).and_then(|state| {
        state
            .policy_snapshot
            .and_then(|snapshot| snapshot.runtime_policy.or(snapshot.transport_policy))
            .or(state.transport_policy)
    })
}

fn resolve_dictation_runtime_plan_from_policy_json(
    policy: &serde_json::Value,
) -> DictationRuntimePlan {
    let policy_id = first_json_string(policy, &[&["policyId"], &["policy_id"]]);
    let voice_runtime_stt_prompt_enabled = first_json_bool(
        policy,
        &[
            &["voiceRouting", "runtime", "sttPromptEnabled"],
            &["voice_routing", "runtime", "stt_prompt_enabled"],
            &["voicePolicy", "enableSttPrompt"],
            &["voice_policy", "enable_stt_prompt"],
        ],
    )
    .unwrap_or(true);
    let voice_runtime_post_process_enabled = first_json_bool(
        policy,
        &[
            &["voiceRouting", "runtime", "postProcessEnabled"],
            &["voice_routing", "runtime", "post_process_enabled"],
            &["voicePolicy", "enableRawPostProcess"],
            &["voice_policy", "enable_raw_post_process"],
        ],
    )
    .unwrap_or(false);
    let model = first_json_string(
        policy,
        &[
            &["voiceRouting", "speech", "model"],
            &["voice_routing", "speech", "model"],
            &["speech", "transcription", "model"],
            &["transcript", "model"],
            &["defaults", "sttModel"],
            &["defaults", "stt_model"],
        ],
    )
    .unwrap_or_else(|| {
        if policy_id.as_deref() == Some("pro") {
            DEFAULT_PRO_STT_MODEL.to_string()
        } else {
            DEFAULT_MODEL.to_string()
        }
    });
    let provider = first_json_string(
        policy,
        &[
            &["voiceRouting", "speech", "provider"],
            &["voice_routing", "speech", "provider"],
            &["speech", "transcription", "provider"],
            &["transcript", "provider"],
            &["transportPolicy", "speechProvider"],
            &["transport_policy", "speechProvider"],
        ],
    )
    .unwrap_or_else(|| DEFAULT_PROVIDER.to_string());
    let stt_prompt = if voice_runtime_stt_prompt_enabled {
        first_json_string(
            policy,
            &[
                &["prompts", "transcriptBase", "text"],
                &["prompts", "transcript_base", "text"],
                &["transcript", "prompt"],
            ],
        )
    } else {
        None
    };
    let language = first_json_string(
        policy,
        &[
            &["speech", "language", "value"],
            &["transcript", "language"],
            &["userSettingsDefaults", "transcript", "language"],
            &["user_settings_defaults", "transcript", "language"],
        ],
    );
    let route_label = first_json_string(
        policy,
        &[&["voiceRouting", "label"], &["voice_routing", "label"]],
    )
    .or_else(|| {
        resolve_voice_routing_profile_id(policy_id.as_deref(), voice_runtime_post_process_enabled)
    });
    let voice_routing_profile_id =
        resolve_voice_routing_profile_id(policy_id.as_deref(), voice_runtime_post_process_enabled);
    let post_process_prompt = if voice_runtime_post_process_enabled {
        first_json_string(
            policy,
            &[
                &["prompts", "postProcessBase", "text"],
                &["prompts", "post_process_base", "text"],
                &["voicePolicy", "postProcessPrompt"],
                &["voice_policy", "post_process_prompt"],
            ],
        )
    } else {
        None
    };

    DictationRuntimePlan {
        policy_id: policy_id.clone(),
        voice_routing_profile_id: voice_routing_profile_id.clone(),
        route_label,
        stt_provider: provider,
        stt_model: model,
        stt_prompt_enabled: voice_runtime_stt_prompt_enabled,
        stt_prompt,
        language,
        post_process: HostPostProcessPolicy {
            enabled: voice_runtime_post_process_enabled,
            prompt: post_process_prompt,
            provider: if voice_runtime_post_process_enabled {
                Some(DEFAULT_PROVIDER.to_string())
            } else {
                None
            },
            model: if voice_runtime_post_process_enabled {
                Some("openai/gpt-oss-120b".to_string())
            } else {
                None
            },
            source: Some(if voice_runtime_post_process_enabled {
                "policy".to_string()
            } else {
                "disabled".to_string()
            }),
            policy_id,
            voice_routing_profile_id,
        },
    }
}

fn fallback_dictation_runtime_plan(policy_id: Option<String>) -> DictationRuntimePlan {
    let post_process_enabled = false;
    let voice_routing_profile_id =
        resolve_voice_routing_profile_id(policy_id.as_deref(), post_process_enabled);
    DictationRuntimePlan {
        policy_id: policy_id.clone(),
        voice_routing_profile_id: voice_routing_profile_id.clone(),
        route_label: voice_routing_profile_id.clone(),
        stt_provider: DEFAULT_PROVIDER.to_string(),
        stt_model: if policy_id.as_deref() == Some("pro") {
            DEFAULT_PRO_STT_MODEL.to_string()
        } else {
            DEFAULT_MODEL.to_string()
        },
        stt_prompt_enabled: false,
        stt_prompt: None,
        language: None,
        post_process: HostPostProcessPolicy {
            enabled: false,
            prompt: None,
            provider: None,
            model: None,
            source: Some("disabled".to_string()),
            policy_id,
            voice_routing_profile_id,
        },
    }
}

fn resolve_voice_routing_profile_id(
    policy_id: Option<&str>,
    post_process_enabled: bool,
) -> Option<String> {
    if policy_id == Some("pro") {
        return Some(if post_process_enabled {
            "pro-post-process".to_string()
        } else {
            "pro-stt-only".to_string()
        });
    }
    None
}

fn first_json_string(value: &serde_json::Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        let text = lookup_json_path(value, path)?.as_str()?.trim().to_string();
        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    })
}

fn first_json_bool(value: &serde_json::Value, paths: &[&[&str]]) -> Option<bool> {
    paths
        .iter()
        .find_map(|path| lookup_json_path(value, path)?.as_bool())
}

fn lookup_json_path<'a>(
    value: &'a serde_json::Value,
    path: &[&str],
) -> Option<&'a serde_json::Value> {
    path.iter()
        .try_fold(value, |current, segment| current.get(*segment))
}

#[allow(dead_code)]
fn redacted_text_hash(value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn read_host_env_value(key: &str) -> Option<String> {
    env::var(key).ok().or_else(|| read_dot_env_value(key))
}

fn read_dot_env_value(key: &str) -> Option<String> {
    if !is_allowed_host_dot_env_key(key) {
        return None;
    }

    [".env", "../.env"]
        .iter()
        .find_map(|path| read_dot_env_value_from_path(path, key))
}

fn read_dot_env_value_from_path(path: &str, key: &str) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
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

fn is_allowed_host_dot_env_key(key: &str) -> bool {
    matches!(
        key,
        "GROQ_API_KEY"
            | "GROQ-API-KEY"
            | "GROQ_STT_MODEL"
            | "GROQ-STT-MODEL"
            | "GROQ_STT_LANGUAGE"
            | "GROQ-STT-LANGUAGE"
            | "FIXVOX_BACKEND_URL"
            | "FIXVOX_API_BASE_URL"
            | "PROXY_BASE_URL"
            | "FIXVOX_DEVICE_ID"
            | "FIXVOX_INSTALL_ID"
            | "FIXVOX_STT_MODEL"
            | "FIXVOX_STT_LANGUAGE"
            | "FIXVOX_STT_PROMPT"
            | "GROQ_STT_PROMPT"
            | "FIXVOX_CACHED_POLICY_JSON"
            | "FIXVOX_CACHED_POLICY_PATH"
    )
}

fn first_env_value(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
    keys: &[&str],
) -> Option<String> {
    keys.iter().find_map(|key| env_lookup(key))
}

fn resolve_ffmpeg_executable() -> PathBuf {
    #[cfg(windows)]
    if let Ok(executable) = env::current_exe() {
        if let Some(directory) = executable.parent() {
            let sidecar = directory.join("ffmpeg.exe");
            if sidecar.is_file() {
                return sidecar;
            }
        }
    }

    PathBuf::from("ffmpeg")
}

fn prepare_speech_upload_payload(audio_file_path: &Path, audio: Vec<u8>) -> SpeechUploadPayload {
    let original_bytes = audio.len();
    let voice_activity = analyze_wav_voice_activity(&audio);
    let audio_duration_ms = voice_activity.duration_ms;
    if original_bytes < AUDIO_COMPRESSION_MIN_BYTES {
        return SpeechUploadPayload {
            bytes: audio,
            mime_type: "audio/wav",
            file_name: "recording.wav".to_string(),
            source: "wav".to_string(),
            original_bytes,
            compression_ms: 0,
            compression_ratio: None,
            optimization_status: "skipped",
            optimization_reason: "below_optimization_threshold",
            voice_activity,
            audio_duration_ms,
        };
    }

    let started_at = Instant::now();
    let mp3_path = audio_file_path.with_extension(format!(
        "{}.stt.mp3",
        audio_file_path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("wav")
    ));

    let mut ffmpeg = Command::new(resolve_ffmpeg_executable());
    ffmpeg
        .arg("-y")
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(audio_file_path)
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg("16000")
        .arg("-codec:a")
        .arg("libmp3lame")
        .arg("-b:a")
        .arg("48k")
        .arg(&mp3_path);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        ffmpeg.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let compression_result = ffmpeg.output();

    if let Ok(output) = compression_result {
        if output.status.success() {
            if let Ok(mp3_bytes) = fs::read(&mp3_path) {
                if !mp3_bytes.is_empty() && mp3_bytes.len() < original_bytes {
                    let _ = fs::remove_file(&mp3_path);
                    return SpeechUploadPayload {
                        compression_ms: elapsed_ms(started_at),
                        compression_ratio: Some(format_ratio(mp3_bytes.len(), original_bytes)),
                        bytes: mp3_bytes,
                        mime_type: "audio/mpeg",
                        file_name: "recording.mp3".to_string(),
                        source: "ffmpeg-mp3".to_string(),
                        original_bytes,
                        optimization_status: "applied",
                        optimization_reason: "optimized_audio_smaller",
                        voice_activity,
                        audio_duration_ms,
                    };
                }
            }
        }
    }
    let _ = fs::remove_file(&mp3_path);

    SpeechUploadPayload {
        bytes: audio,
        mime_type: "audio/wav",
        file_name: "recording.wav".to_string(),
        source: "wav".to_string(),
        original_bytes,
        compression_ms: elapsed_ms(started_at),
        compression_ratio: None,
        optimization_status: "fallback",
        optimization_reason: "conversion_failed_original_audio_used",
        voice_activity,
        audio_duration_ms,
    }
}

fn format_ratio(upload_bytes: usize, original_bytes: usize) -> String {
    if original_bytes == 0 {
        return "0.0000".to_string();
    }
    format!("{:.4}", upload_bytes as f64 / original_bytes as f64)
}

fn analyze_wav_voice_activity(wav_bytes: &[u8]) -> HostVoiceActivityEvidence {
    let Some(pcm) = read_wav_pcm_data(wav_bytes) else {
        let duration_ms = estimate_wav_duration_ms(wav_bytes);
        return HostVoiceActivityEvidence {
            duration_ms,
            frame_count: 0,
            voiced_frame_count: 0,
            voiced_ms: 0,
            rms_ppm: 0,
            peak_ppm: 0,
            has_speech: !wav_bytes.is_empty(),
        };
    };

    let bytes_per_sample = (pcm.bits_per_sample / 8).max(1) as usize;
    let min_frame_bytes = bytes_per_sample * pcm.channels.max(1) as usize;
    let frame_bytes = min_frame_bytes.max(
        ((pcm.sample_rate as u64
            * pcm.channels.max(1) as u64
            * bytes_per_sample as u64
            * VAD_FRAME_MS)
            / 1000) as usize,
    );
    let mut total_squares = 0.0_f64;
    let mut total_samples = 0_u64;
    let mut peak = 0.0_f64;
    let mut frame_count = 0_u64;
    let mut voiced_frame_count = 0_u64;

    let data_end = pcm
        .data_offset
        .saturating_add(pcm.data_size)
        .min(wav_bytes.len());
    let mut frame_offset = 0_usize;
    while frame_offset < pcm.data_size {
        let frame_end = pcm.data_size.min(frame_offset.saturating_add(frame_bytes));
        let mut frame_squares = 0.0_f64;
        let mut frame_samples = 0_u64;
        let mut frame_peak = 0.0_f64;
        let mut offset = pcm.data_offset.saturating_add(frame_offset);
        let absolute_frame_end = pcm.data_offset.saturating_add(frame_end).min(data_end);
        while offset + 1 < absolute_frame_end {
            let sample =
                i16::from_le_bytes([wav_bytes[offset], wav_bytes[offset + 1]]) as f64 / 32768.0;
            let abs = sample.abs();
            frame_peak = frame_peak.max(abs);
            frame_squares += sample * sample;
            frame_samples += 1;
            offset += bytes_per_sample;
        }
        if frame_samples > 0 {
            let frame_rms = (frame_squares / frame_samples as f64).sqrt();
            if frame_rms >= VAD_RMS_THRESHOLD || frame_peak >= VAD_PEAK_THRESHOLD {
                voiced_frame_count += 1;
            }
            frame_count += 1;
            total_squares += frame_squares;
            total_samples += frame_samples;
            peak = peak.max(frame_peak);
        }
        frame_offset = frame_offset.saturating_add(frame_bytes);
    }

    let voiced_ms = voiced_frame_count.saturating_mul(VAD_FRAME_MS);
    let rms = if total_samples > 0 {
        (total_squares / total_samples as f64).sqrt()
    } else {
        0.0
    };
    HostVoiceActivityEvidence {
        duration_ms: estimate_wav_duration_ms(wav_bytes),
        frame_count,
        voiced_frame_count,
        voiced_ms,
        rms_ppm: float_to_ppm(rms),
        peak_ppm: float_to_ppm(peak),
        has_speech: voiced_ms >= VAD_MIN_VOICED_MS,
    }
}

struct WavPcmData {
    data_offset: usize,
    data_size: usize,
    sample_rate: u32,
    bits_per_sample: u16,
    channels: u16,
}

fn read_wav_pcm_data(wav_bytes: &[u8]) -> Option<WavPcmData> {
    if wav_bytes.len() < 44
        || read_ascii(wav_bytes, 0, 4)? != "RIFF"
        || read_ascii(wav_bytes, 8, 4)? != "WAVE"
    {
        return None;
    }

    let mut offset = 12_usize;
    let mut sample_rate = 0_u32;
    let mut bits_per_sample = 0_u16;
    let mut channels = 0_u16;
    let mut data_offset = 0_usize;
    let mut data_size = 0_usize;
    while offset + 8 <= wav_bytes.len() {
        let chunk_id = read_ascii(wav_bytes, offset, 4)?;
        let chunk_size = read_u32_le(wav_bytes, offset + 4)? as usize;
        let chunk_data_offset = offset + 8;
        if chunk_data_offset.saturating_add(chunk_size) > wav_bytes.len() {
            break;
        }
        if chunk_id == "fmt " {
            channels = read_u16_le(wav_bytes, chunk_data_offset + 2)?;
            sample_rate = read_u32_le(wav_bytes, chunk_data_offset + 4)?;
            bits_per_sample = read_u16_le(wav_bytes, chunk_data_offset + 14)?;
        } else if chunk_id == "data" {
            data_offset = chunk_data_offset;
            data_size = chunk_size;
        }
        offset = offset
            .saturating_add(8)
            .saturating_add(chunk_size)
            .saturating_add(chunk_size % 2);
    }

    if data_offset == 0
        || data_size == 0
        || sample_rate == 0
        || bits_per_sample != 16
        || channels == 0
    {
        return None;
    }

    Some(WavPcmData {
        data_offset,
        data_size,
        sample_rate,
        bits_per_sample,
        channels,
    })
}

fn estimate_wav_duration_ms(wav_bytes: &[u8]) -> u64 {
    if wav_bytes.is_empty() {
        return 0;
    }
    if wav_bytes.len() >= 44
        && read_ascii(wav_bytes, 0, 4).as_deref() == Some("RIFF")
        && read_ascii(wav_bytes, 8, 4).as_deref() == Some("WAVE")
    {
        let byte_rate = read_u32_le(wav_bytes, 28).unwrap_or(0);
        if byte_rate > 0 {
            let mut offset = 12_usize;
            while offset + 8 <= wav_bytes.len() {
                let Some(chunk_id) = read_ascii(wav_bytes, offset, 4) else {
                    break;
                };
                let Some(chunk_size_u32) = read_u32_le(wav_bytes, offset + 4) else {
                    break;
                };
                let chunk_size = chunk_size_u32 as usize;
                if chunk_id == "data" {
                    return ((chunk_size as u64).saturating_mul(1000)) / byte_rate as u64;
                }
                offset = offset
                    .saturating_add(8)
                    .saturating_add(chunk_size)
                    .saturating_add(chunk_size % 2);
            }
            let payload_bytes = wav_bytes.len().saturating_sub(44) as u64;
            return payload_bytes.saturating_mul(1000) / byte_rate as u64;
        }
    }
    let payload_bytes = wav_bytes.len().saturating_sub(44) as u64;
    payload_bytes.saturating_mul(1000) / 32_000
}

fn read_ascii(bytes: &[u8], offset: usize, length: usize) -> Option<String> {
    if offset.checked_add(length)? > bytes.len() {
        return None;
    }
    Some(String::from_utf8_lossy(&bytes[offset..offset + length]).to_string())
}

fn read_u16_le(bytes: &[u8], offset: usize) -> Option<u16> {
    if offset + 2 > bytes.len() {
        return None;
    }
    Some(u16::from_le_bytes([bytes[offset], bytes[offset + 1]]))
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Option<u32> {
    if offset + 4 > bytes.len() {
        return None;
    }
    Some(u32::from_le_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ]))
}

fn float_to_ppm(value: f64) -> u64 {
    (value.max(0.0) * 1_000_000.0).round() as u64
}

fn should_discard_provider_no_speech(
    text: &str,
    no_speech_probability: Option<f64>,
    average_log_probability: Option<f64>,
) -> Option<&'static str> {
    let short_text = text.replace(char::is_whitespace, " ").trim().len() <= 40;
    if no_speech_probability.is_some_and(|value| value >= POST_STT_NO_SPEECH_THRESHOLD)
        && short_text
    {
        return Some("high_no_speech_probability");
    }
    if no_speech_probability.is_some_and(|value| value >= POST_STT_WEAK_NO_SPEECH_THRESHOLD)
        && average_log_probability.is_some_and(|value| value <= POST_STT_LOW_LOGPROB_THRESHOLD)
        && short_text
    {
        return Some("weak_no_speech_low_confidence");
    }
    None
}

fn average_segment_number(segments: Option<&[WhisperSegmentBody]>, key: &str) -> Option<f64> {
    let values: Vec<f64> = segments
        .unwrap_or(&[])
        .iter()
        .filter_map(|segment| match key {
            "no_speech_prob" => segment.no_speech_prob,
            "avg_logprob" => segment.avg_logprob,
            _ => None,
        })
        .filter(|value| value.is_finite())
        .collect();
    if values.is_empty() {
        return None;
    }
    Some(values.iter().sum::<f64>() / values.len() as f64)
}

fn format_optional_probability(value: Option<f64>) -> Option<String> {
    value.map(|value| format!("{value:.4}"))
}

async fn transcribe_groq_audio(
    config: HostRuntimeConfig,
    request: &HostTranscriptionRequest,
    upload_payload: SpeechUploadPayload,
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
    let file_name = upload_payload.file_name.clone();

    let file_part = match reqwest::multipart::Part::bytes(upload_payload.bytes)
        .file_name(file_name)
        .mime_str(upload_payload.mime_type)
    {
        Ok(part) => part,
        Err(error) => {
            return ProviderTranscriptionOutcome::ProviderError {
                code: "GROQ_AUDIO_PART_FAILED".to_string(),
                message: error.to_string(),
                provider: Some(config.provider),
                model: Some(model),
                latency_ms: Some(elapsed_ms(started_at)),
                request_id: None,
                fixvox_metadata: None,
            };
        }
    };
    let mut form = reqwest::multipart::Form::new()
        .text("model", model.clone())
        .text("response_format", "verbose_json")
        .text("timestamp_granularities[]", "word")
        .text("timestamp_granularities[]", "segment")
        .text("temperature", "0")
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
                fixvox_metadata: None,
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
            fixvox_metadata: None,
        };
    }

    let text = if content_type.contains("application/json") {
        match response.json::<GroqTranscriptionResponseBody>().await {
            Ok(body) => {
                let text = body.text.unwrap_or_default();
                let no_speech_probability =
                    average_segment_number(body.segments.as_deref(), "no_speech_prob");
                let average_log_probability =
                    average_segment_number(body.segments.as_deref(), "avg_logprob");
                if let Some(reason) = should_discard_provider_no_speech(
                    &text,
                    no_speech_probability,
                    average_log_probability,
                ) {
                    return ProviderTranscriptionOutcome::NoSpeech {
                        reason: reason.to_string(),
                        no_speech_probability: format_optional_probability(no_speech_probability),
                        average_log_probability: format_optional_probability(
                            average_log_probability,
                        ),
                        provider: config.provider,
                        model,
                        latency_ms,
                        request_id,
                        fixvox_metadata: None,
                    };
                }
                text
            }
            Err(error) => {
                return ProviderTranscriptionOutcome::ProviderError {
                    code: "GROQ_RESPONSE_PARSE_FAILED".to_string(),
                    message: error.to_string(),
                    provider: Some(config.provider),
                    model: Some(model),
                    latency_ms: Some(latency_ms),
                    request_id,
                    fixvox_metadata: None,
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
                    fixvox_metadata: None,
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
        fixvox_metadata: None,
    }
}

fn preflight_cache_key(config: &ManagedHostRuntimeConfig) -> PreflightCacheKey {
    PreflightCacheKey {
        backend_base_url: config.backend_base_url.clone(),
        install_id: config.install_id.clone(),
        device_id: config.device_id.clone(),
        usage_kind: "transcription".to_string(),
    }
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().try_into().unwrap_or(u64::MAX))
        .unwrap_or(0)
}

#[cfg(test)]
fn preflight_cache_allows_at(key: &PreflightCacheKey, now_ms: u64) -> bool {
    preflight_cache_hit_at(key, now_ms).is_some()
}

fn preflight_cache_hit_at(
    key: &PreflightCacheKey,
    now_ms: u64,
) -> Option<ManagedPreflightEvidence> {
    let cache = TRANSCRIPTION_PREFLIGHT_CACHE.get_or_init(|| Mutex::new(None));
    let Ok(guard) = cache.lock() else {
        return None;
    };
    let cached = guard.as_ref()?;
    let cache_age_ms = now_ms.saturating_sub(cached.cached_at_ms);
    if !cached.allowed || &cached.key != key || cache_age_ms > TRANSCRIPTION_PREFLIGHT_CACHE_TTL_MS
    {
        return None;
    }

    Some(ManagedPreflightEvidence {
        cached: true,
        prewarmed: cached.prewarmed,
        latency_ms: None,
        cache_age_ms: Some(cache_age_ms),
        request_id: redact_request_id(cached.request_id.clone()),
        in_flight_soft_timed_out: None,
        trusted_policy_fallback: None,
        redacted: true,
    })
}

fn remember_preflight_decision_at(
    key: PreflightCacheKey,
    decision: &fixvox_cloud::PreflightDecision,
    now_ms: u64,
    prewarmed: bool,
) {
    if !decision.ok || !decision.allowed {
        return;
    }

    let cache = TRANSCRIPTION_PREFLIGHT_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = cache.lock() {
        *guard = Some(CachedPreflightDecision {
            key,
            allowed: true,
            cached_at_ms: now_ms,
            request_id: decision.request_id.clone(),
            prewarmed,
        });
    }
}

#[cfg(test)]
fn clear_preflight_cache_for_tests() {
    let cache = TRANSCRIPTION_PREFLIGHT_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = cache.lock() {
        *guard = None;
    }
}

#[cfg(test)]
fn clear_preflight_in_flight_for_tests() {
    let in_flight = TRANSCRIPTION_PREFLIGHT_IN_FLIGHT.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = in_flight.lock() {
        *guard = None;
    }
}

fn begin_or_join_preflight_in_flight_at(
    key: &PreflightCacheKey,
    now_ms: u64,
    prewarm: bool,
    allow_trusted_policy_fallback: bool,
) -> PreflightInFlightAction {
    let in_flight = TRANSCRIPTION_PREFLIGHT_IN_FLIGHT.get_or_init(|| Mutex::new(None));
    let Ok(mut guard) = in_flight.lock() else {
        return PreflightInFlightAction::Start(PreflightInFlightOwner {
            key: key.clone(),
            started_at_ms: now_ms,
        });
    };

    if let Some(existing) = guard.as_ref() {
        if &existing.key == key {
            if allow_trusted_policy_fallback {
                let age_ms = now_ms.saturating_sub(existing.started_at_ms);
                if age_ms > TRANSCRIPTION_PREFLIGHT_IN_FLIGHT_SOFT_TIMEOUT_MS {
                    return PreflightInFlightAction::Bypass(
                        preflight_in_flight_soft_timeout_evidence(existing, age_ms, prewarm),
                    );
                }
            }
            return PreflightInFlightAction::Wait(existing.clone());
        }
    }

    *guard = Some(InFlightPreflightDecision {
        key: key.clone(),
        started_at_ms: now_ms,
        prewarmed: prewarm,
    });
    PreflightInFlightAction::Start(PreflightInFlightOwner {
        key: key.clone(),
        started_at_ms: now_ms,
    })
}

fn wait_for_preflight_in_flight_or_soft_timeout(
    existing: &InFlightPreflightDecision,
    allow_trusted_policy_fallback: bool,
) -> Option<ManagedPreflightEvidence> {
    loop {
        let now_ms = current_time_ms();
        if let Some(evidence) = preflight_cache_hit_at(&existing.key, now_ms) {
            return Some(evidence);
        }

        if allow_trusted_policy_fallback {
            let age_ms = now_ms.saturating_sub(existing.started_at_ms);
            if age_ms > TRANSCRIPTION_PREFLIGHT_IN_FLIGHT_SOFT_TIMEOUT_MS {
                return Some(preflight_in_flight_soft_timeout_evidence(
                    existing, age_ms, false,
                ));
            }
        }

        if !preflight_in_flight_matches(existing) {
            return None;
        }

        thread::sleep(Duration::from_millis(25));
    }
}

fn preflight_in_flight_matches(existing: &InFlightPreflightDecision) -> bool {
    let in_flight = TRANSCRIPTION_PREFLIGHT_IN_FLIGHT.get_or_init(|| Mutex::new(None));
    let Ok(guard) = in_flight.lock() else {
        return false;
    };
    guard.as_ref() == Some(existing)
}

fn preflight_in_flight_soft_timeout_evidence(
    existing: &InFlightPreflightDecision,
    age_ms: u64,
    current_call_prewarm: bool,
) -> ManagedPreflightEvidence {
    ManagedPreflightEvidence {
        cached: false,
        prewarmed: existing.prewarmed || current_call_prewarm,
        latency_ms: None,
        cache_age_ms: Some(age_ms),
        request_id: None,
        in_flight_soft_timed_out: Some(true),
        trusted_policy_fallback: Some(true),
        redacted: true,
    }
}

fn clear_preflight_in_flight_if_owner(key: &PreflightCacheKey, started_at_ms: u64) {
    let in_flight = TRANSCRIPTION_PREFLIGHT_IN_FLIGHT.get_or_init(|| Mutex::new(None));
    let Ok(mut guard) = in_flight.lock() else {
        return;
    };
    let is_owner = guard
        .as_ref()
        .map(|existing| &existing.key == key && existing.started_at_ms == started_at_ms)
        .unwrap_or(false);
    if is_owner {
        *guard = None;
    }
}

async fn preflight_fixvox_managed_transcription(
    config: &ManagedHostRuntimeConfig,
    prewarm: bool,
) -> ManagedPreflightCheck {
    let cache_key = preflight_cache_key(config);
    if let Some(evidence) = preflight_cache_hit_at(&cache_key, current_time_ms()) {
        return ManagedPreflightCheck {
            outcome: None,
            evidence,
        };
    }

    let _in_flight_owner = loop {
        match begin_or_join_preflight_in_flight_at(&cache_key, current_time_ms(), prewarm, true) {
            PreflightInFlightAction::Start(owner) => break owner,
            PreflightInFlightAction::Bypass(evidence) => {
                return ManagedPreflightCheck {
                    outcome: None,
                    evidence,
                };
            }
            PreflightInFlightAction::Wait(existing) => {
                if let Some(evidence) =
                    wait_for_preflight_in_flight_or_soft_timeout(&existing, true)
                {
                    return ManagedPreflightCheck {
                        outcome: None,
                        evidence,
                    };
                }
            }
        }
    };

    let started_at = Instant::now();
    let request = match fixvox_cloud::build_preflight_request(fixvox_cloud::PreflightInput {
        install_id: config.install_id.clone(),
        device_id: config.device_id.clone(),
        usage_kind: "transcription".to_string(),
        estimated_audio_seconds: None,
    }) {
        Ok(request) => request,
        Err(reason) => {
            return preflight_error_check(
                ProviderTranscriptionOutcome::ProviderError {
                    code: reason.code,
                    message: reason.message,
                    provider: Some(config.provider.clone()),
                    model: Some(config.model.clone()),
                    latency_ms: Some(elapsed_ms(started_at)),
                    request_id: None,
                    fixvox_metadata: None,
                },
                prewarm,
                Some(elapsed_ms(started_at)),
                None,
            );
        }
    };
    let body = match serde_json::to_value(request) {
        Ok(body) => body,
        Err(_) => {
            return preflight_error_check(
                ProviderTranscriptionOutcome::ProviderError {
                    code: "FIXVOX_PREFLIGHT_SERIALIZE_FAILED".to_string(),
                    message: "Fixvox managed preflight request could not be serialized."
                        .to_string(),
                    provider: Some(config.provider.clone()),
                    model: Some(config.model.clone()),
                    latency_ms: Some(elapsed_ms(started_at)),
                    request_id: None,
                    fixvox_metadata: None,
                },
                prewarm,
                Some(elapsed_ms(started_at)),
                None,
            );
        }
    };

    let client = match fixvox_cloud::fixvox_http_client() {
        Ok(client) => client,
        Err(error) => {
            return preflight_error_check(
                ProviderTranscriptionOutcome::ProviderError {
                    code: error.code,
                    message: error.message,
                    provider: Some(config.provider.clone()),
                    model: Some(config.model.clone()),
                    latency_ms: Some(elapsed_ms(started_at)),
                    request_id: None,
                    fixvox_metadata: None,
                },
                prewarm,
                Some(elapsed_ms(started_at)),
                None,
            );
        }
    };
    let response = match client
        .post(fixvox_cloud::preflight_endpoint(&config.backend_base_url))
        .header("X-Device-Id", config.device_id.clone())
        .json(&body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return preflight_error_check(
                ProviderTranscriptionOutcome::ProviderError {
                    code: "FIXVOX_PREFLIGHT_REQUEST_FAILED".to_string(),
                    message: error.to_string(),
                    provider: Some(config.provider.clone()),
                    model: Some(config.model.clone()),
                    latency_ms: Some(elapsed_ms(started_at)),
                    request_id: None,
                    fixvox_metadata: None,
                },
                prewarm,
                Some(elapsed_ms(started_at)),
                None,
            );
        }
    };

    let latency_ms = elapsed_ms(started_at);
    let status = response.status();
    let status_text = status
        .canonical_reason()
        .unwrap_or("preflight error")
        .to_string();
    let response_body = match response.text().await {
        Ok(body) => body,
        Err(error) => {
            return preflight_error_check(
                ProviderTranscriptionOutcome::ProviderError {
                    code: "FIXVOX_PREFLIGHT_RESPONSE_READ_FAILED".to_string(),
                    message: error.to_string(),
                    provider: Some(config.provider.clone()),
                    model: Some(config.model.clone()),
                    latency_ms: Some(latency_ms),
                    request_id: None,
                    fixvox_metadata: None,
                },
                prewarm,
                Some(latency_ms),
                None,
            );
        }
    };

    let decision = match serde_json::from_str::<serde_json::Value>(&response_body)
        .ok()
        .and_then(|value| fixvox_cloud::parse_preflight_decision(value).ok())
    {
        Some(decision) => decision,
        None => {
            return preflight_error_check(
                ProviderTranscriptionOutcome::ProviderError {
                    code: "FIXVOX_PREFLIGHT_RESPONSE_PARSE_FAILED".to_string(),
                    message:
                        "Fixvox managed preflight response did not match the expected contract."
                            .to_string(),
                    provider: Some(config.provider.clone()),
                    model: Some(config.model.clone()),
                    latency_ms: Some(latency_ms),
                    request_id: None,
                    fixvox_metadata: None,
                },
                prewarm,
                Some(latency_ms),
                None,
            );
        }
    };
    let redacted_request_id = redact_request_id(decision.request_id.clone());

    if !status.is_success() {
        return preflight_error_check(
            ProviderTranscriptionOutcome::ProviderError {
                code: format!("FIXVOX_PREFLIGHT_HTTP_{}", status.as_u16()),
                message: format!(
                    "Fixvox managed preflight returned HTTP {} {}.",
                    status.as_u16(),
                    status_text
                ),
                provider: Some(config.provider.clone()),
                model: Some(config.model.clone()),
                latency_ms: Some(latency_ms),
                request_id: decision.request_id,
                fixvox_metadata: None,
            },
            prewarm,
            Some(latency_ms),
            redacted_request_id,
        );
    }

    if !decision.ok || !decision.allowed {
        return preflight_error_check(
            ProviderTranscriptionOutcome::ProviderError {
                code: fixvox_cloud::preflight_denial_error_code(&decision),
                message: "Fixvox managed preflight denied transcription before provider execution."
                    .to_string(),
                provider: Some(config.provider.clone()),
                model: Some(config.model.clone()),
                latency_ms: Some(latency_ms),
                request_id: decision.request_id,
                fixvox_metadata: None,
            },
            prewarm,
            Some(latency_ms),
            redacted_request_id,
        );
    }

    remember_preflight_decision_at(cache_key, &decision, current_time_ms(), prewarm);

    ManagedPreflightCheck {
        outcome: None,
        evidence: ManagedPreflightEvidence {
            cached: false,
            prewarmed: prewarm,
            latency_ms: Some(latency_ms),
            cache_age_ms: None,
            request_id: redacted_request_id,
            in_flight_soft_timed_out: None,
            trusted_policy_fallback: None,
            redacted: true,
        },
    }
}

fn preflight_error_check(
    outcome: ProviderTranscriptionOutcome,
    prewarmed: bool,
    latency_ms: Option<u64>,
    request_id: Option<String>,
) -> ManagedPreflightCheck {
    ManagedPreflightCheck {
        outcome: Some(outcome),
        evidence: ManagedPreflightEvidence {
            cached: false,
            prewarmed,
            latency_ms,
            cache_age_ms: None,
            request_id,
            in_flight_soft_timed_out: None,
            trusted_policy_fallback: None,
            redacted: true,
        },
    }
}

async fn transcribe_fixvox_managed_audio(
    config: ManagedHostRuntimeConfig,
    request: &HostTranscriptionRequest,
    upload_payload: SpeechUploadPayload,
) -> ProviderTranscriptionOutcome {
    let started_at = Instant::now();
    let file_name = upload_payload.file_name.clone();
    let preview = match fixvox_cloud::build_managed_stt_request_preview(
        fixvox_cloud::FixvoxCloudConfig {
            backend_base_url: config.backend_base_url.clone(),
            device_id: Some(config.device_id.clone()),
        },
        fixvox_cloud::ManagedSttInput {
            audio_file_name: file_name.clone(),
            model: config.model.clone(),
            language: config.language.clone(),
            prompt: config.stt_prompt.clone(),
        },
    ) {
        Ok(preview) => preview,
        Err(reason) => {
            return ProviderTranscriptionOutcome::ProviderError {
                code: reason.code,
                message: reason.message,
                provider: Some(config.provider),
                model: Some(config.model),
                latency_ms: Some(elapsed_ms(started_at)),
                request_id: None,
                fixvox_metadata: None,
            };
        }
    };

    let legacy_cloudflare_transport = preview.endpoint.ends_with("/v1/audio/transcriptions");
    let file_part = match reqwest::multipart::Part::bytes(upload_payload.bytes)
        .file_name(file_name)
        .mime_str(upload_payload.mime_type)
    {
        Ok(part) => part,
        Err(error) => {
            return ProviderTranscriptionOutcome::ProviderError {
                code: "FIXVOX_AUDIO_PART_FAILED".to_string(),
                message: error.to_string(),
                provider: Some(config.provider),
                model: Some(config.model),
                latency_ms: Some(elapsed_ms(started_at)),
                request_id: None,
                fixvox_metadata: None,
            };
        }
    };
    let form = if legacy_cloudflare_transport {
        let mut form = reqwest::multipart::Form::new()
            .text("model", config.model.clone())
            .part("file", file_part);
        if let Some(language) = config
            .language
            .clone()
            .filter(|value| !value.eq_ignore_ascii_case("auto"))
        {
            form = form.text("language", language);
        }
        if let Some(prompt) = config.stt_prompt.clone() {
            form = form.text("prompt", prompt);
        }
        form.text("response_format", "verbose_json")
            .text("timestamp_granularities[]", "word")
            .text("timestamp_granularities[]", "segment")
            .text("temperature", "0")
    } else {
        let metadata = serde_json::json!({
            "operationId": request.run_id.trim(),
            "durationMs": 0,
            "language": config.language.clone().filter(|value| !value.eq_ignore_ascii_case("auto"))
        });
        reqwest::multipart::Form::new()
            .text("metadata", metadata.to_string())
            .part("audio", file_part)
    };

    let client = match fixvox_cloud::fixvox_http_client() {
        Ok(client) => client,
        Err(error) => {
            return ProviderTranscriptionOutcome::ProviderError {
                code: error.code,
                message: error.message,
                provider: Some(config.provider),
                model: Some(config.model),
                latency_ms: Some(elapsed_ms(started_at)),
                request_id: None,
                fixvox_metadata: None,
            };
        }
    };
    let response = match client
        .post(&preview.endpoint)
        .header("X-Device-Id", config.device_id.clone())
        .multipart(form)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return ProviderTranscriptionOutcome::ProviderError {
                code: "FIXVOX_REQUEST_FAILED".to_string(),
                message: error.to_string(),
                provider: Some(config.provider),
                model: Some(config.model),
                latency_ms: Some(elapsed_ms(started_at)),
                request_id: None,
                fixvox_metadata: None,
            };
        }
    };

    let latency_ms = elapsed_ms(started_at);
    let status = response.status();
    let status_text = status
        .canonical_reason()
        .unwrap_or("provider error")
        .to_string();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let header_pairs: Vec<(String, String)> = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.as_str().to_string(), value.to_string()))
        })
        .collect();
    let header_refs: Vec<(&str, &str)> = header_pairs
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    let metadata = fixvox_cloud::parse_fixvox_response_metadata(&header_refs);
    let request_id = metadata
        .fixvox_request_id
        .clone()
        .or_else(|| metadata.provider_request_id.clone());

    if !status.is_success() {
        return ProviderTranscriptionOutcome::ProviderError {
            code: format!("FIXVOX_HTTP_{}", status.as_u16()),
            message: format!(
                "Fixvox managed transcription returned HTTP {} {}.",
                status.as_u16(),
                status_text
            ),
            provider: Some(config.provider),
            model: Some(config.model),
            latency_ms: Some(latency_ms),
            request_id,
            fixvox_metadata: Some(metadata),
        };
    }

    let text_body = match response.text().await {
        Ok(body) => body,
        Err(error) => {
            return ProviderTranscriptionOutcome::ProviderError {
                code: "FIXVOX_RESPONSE_READ_FAILED".to_string(),
                message: error.to_string(),
                provider: Some(config.provider),
                model: Some(config.model),
                latency_ms: Some(latency_ms),
                request_id,
                fixvox_metadata: Some(metadata),
            };
        }
    };

    let parsed = if content_type.contains("application/json") {
        match fixvox_cloud::parse_managed_stt_json_response(&text_body) {
            Ok(parsed) => parsed,
            Err(reason) => {
                return ProviderTranscriptionOutcome::ProviderError {
                    code: reason.code,
                    message: reason.message,
                    provider: Some(config.provider),
                    model: Some(config.model),
                    latency_ms: Some(latency_ms),
                    request_id,
                    fixvox_metadata: Some(metadata),
                };
            }
        }
    } else {
        fixvox_cloud::ManagedSttParsedResponse {
            text: text_body.clone(),
            model: None,
        }
    };

    let parsed_segments = if content_type.contains("application/json") {
        serde_json::from_str::<GroqTranscriptionResponseBody>(&text_body)
            .ok()
            .and_then(|body| body.segments)
    } else {
        None
    };
    let no_speech_probability =
        average_segment_number(parsed_segments.as_deref(), "no_speech_prob");
    let average_log_probability = average_segment_number(parsed_segments.as_deref(), "avg_logprob");
    let resolved_model = parsed.model.unwrap_or_else(|| {
        if legacy_cloudflare_transport {
            config.model.clone()
        } else {
            "server-owned".to_string()
        }
    });
    if let Some(reason) = should_discard_provider_no_speech(
        &parsed.text,
        no_speech_probability,
        average_log_probability,
    ) {
        return ProviderTranscriptionOutcome::NoSpeech {
            reason: reason.to_string(),
            no_speech_probability: format_optional_probability(no_speech_probability),
            average_log_probability: format_optional_probability(average_log_probability),
            provider: config.provider,
            model: resolved_model,
            latency_ms,
            request_id,
            fixvox_metadata: Some(metadata),
        };
    }

    ProviderTranscriptionOutcome::Ok {
        text: parsed.text,
        provider: config.provider,
        model: resolved_model,
        latency_ms,
        request_id,
        fixvox_metadata: Some(metadata),
    }
}

async fn apply_fixvox_managed_postprocess(
    response: HostTranscriptionResponse,
    config: Option<&ManagedHostRuntimeConfig>,
    request: &HostTranscriptionRequest,
) -> HostTranscriptionResponse {
    let policy_from_config = config.and_then(|managed| managed.post_process.as_ref());
    let Some(policy) = request.post_process.as_ref().or(policy_from_config) else {
        return response;
    };

    let HostTranscriptionResponse::Ok { text, .. } = &response else {
        return response;
    };

    let raw_text = text.clone();
    let base_evidence =
        |ran: bool,
         fallback_to_raw: bool,
         final_text_length: usize,
         request_id: Option<String>,
         sanitized_changed: Option<bool>,
         sanitizer_reason: Option<String>| HostPostProcessEvidence {
            enabled: policy.enabled,
            ran,
            provider: policy
                .provider
                .clone()
                .map(|value| redact_host_text(&value)),
            model: policy.model.clone().map(|value| redact_host_text(&value)),
            source: policy.source.clone().map(|value| redact_host_text(&value)),
            policy_id: policy
                .policy_id
                .clone()
                .map(|value| redact_host_text(&value)),
            voice_routing_profile_id: policy
                .voice_routing_profile_id
                .clone()
                .map(|value| redact_host_text(&value)),
            sanitized_changed,
            sanitizer_reason,
            fallback_to_raw,
            raw_transcript_length: raw_text.len(),
            final_text_length,
            request_id: redact_request_id(request_id),
            redacted: true,
        };

    if !policy.enabled {
        return with_post_process_evidence(
            response,
            base_evidence(false, true, raw_text.len(), None, None, None),
        );
    }

    let Some(config) = config else {
        return with_post_process_evidence(
            response,
            base_evidence(false, true, raw_text.len(), None, None, None),
        );
    };

    let started_at = Instant::now();
    let preview = match fixvox_cloud::build_managed_chat_completion_request_preview(
        fixvox_cloud::FixvoxCloudConfig {
            backend_base_url: config.backend_base_url.clone(),
            device_id: Some(config.device_id.clone()),
        },
        fixvox_cloud::ManagedChatInput {
            transcript: raw_text.clone(),
            instruction: None,
            preset_key: None,
            conversation_summary: None,
            engine_kind: Some(fixvox_cloud::ManagedChatEngineKind::Postprocess),
        },
    ) {
        Ok(preview) => preview,
        Err(_) => {
            return with_post_process_evidence(
                response,
                base_evidence(false, true, raw_text.len(), None, None, None),
            );
        }
    };

    let client = match fixvox_cloud::fixvox_http_client() {
        Ok(client) => client,
        Err(_) => {
            return with_post_process_evidence(
                response,
                base_evidence(true, true, raw_text.len(), None, None, None),
            );
        }
    };
    let http_response = match client
        .post(&preview.endpoint)
        .header(header::CONTENT_TYPE, "application/json")
        .header("X-Device-Id", config.device_id.clone())
        .header(
            "X-Fixvox-Engine-Kind",
            fixvox_cloud::ManagedChatEngineKind::Postprocess.as_header_value(),
        )
        .json(&preview.body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => {
            return with_post_process_evidence(
                response,
                base_evidence(true, true, raw_text.len(), None, None, None),
            );
        }
    };

    let status = http_response.status();
    let header_pairs: Vec<(String, String)> = http_response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.as_str().to_string(), value.to_string()))
        })
        .collect();
    let header_refs: Vec<(&str, &str)> = header_pairs
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    let metadata = fixvox_cloud::parse_fixvox_response_metadata(&header_refs);
    let request_id = metadata
        .fixvox_request_id
        .clone()
        .or_else(|| metadata.provider_request_id.clone());

    if !status.is_success() {
        return with_post_process_evidence(
            response,
            base_evidence(true, true, raw_text.len(), request_id, None, None),
        );
    }

    let body = match http_response.text().await {
        Ok(body) => body,
        Err(_) => {
            return with_post_process_evidence(
                response,
                base_evidence(true, true, raw_text.len(), request_id, None, None),
            );
        }
    };
    let parsed = match fixvox_cloud::parse_managed_chat_json_response(&body) {
        Ok(parsed) => parsed,
        Err(_) => {
            return with_post_process_evidence(
                response,
                base_evidence(true, true, raw_text.len(), request_id, None, None),
            );
        }
    };

    let sanitized = sanitize_raw_voice_postprocess_output(&parsed.output, &raw_text);
    let final_text = if sanitized.text.trim().is_empty() {
        raw_text.clone()
    } else {
        sanitized.text
    };
    let fallback_to_raw = final_text == raw_text;
    let evidence = base_evidence(
        true,
        fallback_to_raw,
        final_text.len(),
        request_id,
        Some(sanitized.changed),
        sanitized.reason,
    );

    with_ok_text_and_post_process_evidence(response, final_text, evidence, elapsed_ms(started_at))
}

fn with_post_process_evidence(
    response: HostTranscriptionResponse,
    evidence: HostPostProcessEvidence,
) -> HostTranscriptionResponse {
    with_ok_text_and_post_process_evidence(response, String::new(), evidence, 0)
}

fn with_ok_text_and_post_process_evidence(
    response: HostTranscriptionResponse,
    replacement_text: String,
    evidence: HostPostProcessEvidence,
    _postprocess_latency_ms: u64,
) -> HostTranscriptionResponse {
    match response {
        HostTranscriptionResponse::Ok {
            text,
            transcript_path,
            report_path,
            provider,
            model,
            latency_ms,
            request_id,
            fixvox_metadata,
            audio_prep,
            preflight,
            ..
        } => HostTranscriptionResponse::Ok {
            text: if replacement_text.is_empty() {
                text
            } else {
                replacement_text
            },
            transcript_path,
            report_path,
            provider,
            model,
            latency_ms,
            request_id,
            fixvox_metadata,
            audio_prep,
            preflight,
            post_process: Some(evidence),
            redacted: true,
        },
        other => other,
    }
}

struct SanitizedPostProcessOutput {
    text: String,
    changed: bool,
    reason: Option<String>,
}

fn sanitize_raw_voice_postprocess_output(
    raw_output: &str,
    transcript: &str,
) -> SanitizedPostProcessOutput {
    let raw = raw_output.trim();
    if raw.is_empty() {
        return SanitizedPostProcessOutput {
            text: String::new(),
            changed: false,
            reason: None,
        };
    }

    if let Some(index) = find_final_marker_index(raw) {
        let text = raw[index..].trim().to_string();
        if !text.is_empty() {
            return SanitizedPostProcessOutput {
                text,
                changed: true,
                reason: Some("final_marker".to_string()),
            };
        }
    }

    let lower = raw.to_ascii_lowercase();
    let looks_like_explanation = [
        " -> ",
        "removing ",
        "before:",
        "after:",
        "reasoning:",
        "output:",
    ]
    .iter()
    .any(|marker| lower.contains(marker));
    let too_long = raw.len() > std::cmp::max(transcript.len() * 3, transcript.len() + 600);
    if looks_like_explanation || too_long {
        return SanitizedPostProcessOutput {
            text: transcript.trim().to_string(),
            changed: true,
            reason: Some(if looks_like_explanation {
                "explanation_marker".to_string()
            } else {
                "too_long".to_string()
            }),
        };
    }

    SanitizedPostProcessOutput {
        text: raw.to_string(),
        changed: false,
        reason: None,
    }
}

fn find_final_marker_index(raw: &str) -> Option<usize> {
    for marker in ["\nFinal\n", "\nfinal\n", "Final\n", "final\n"] {
        if let Some(index) = raw.find(marker) {
            return Some(index + marker.len());
        }
    }
    None
}

fn map_provider_outcome_to_host_response(
    outcome: ProviderTranscriptionOutcome,
    request: &HostTranscriptionRequest,
    audio_prep: Option<HostAudioPrepEvidence>,
    preflight: Option<ManagedPreflightEvidence>,
) -> HostTranscriptionResponse {
    match outcome {
        ProviderTranscriptionOutcome::Ok {
            text,
            provider,
            model,
            latency_ms,
            request_id,
            fixvox_metadata,
        } => {
            let normalized_text = text.trim().to_string();
            let fixvox_metadata = fixvox_metadata
                .as_ref()
                .map(redact_fixvox_response_metadata);
            if !is_usable_transcript(&normalized_text) {
                return HostTranscriptionResponse::Empty {
                    error: error("EMPTY_TRANSCRIPT", "Transcription returned no usable text."),
                    report_path: Some(create_report_path(&request.run_id)),
                    provider,
                    model,
                    latency_ms,
                    request_id: redact_request_id(request_id),
                    fixvox_metadata,
                    audio_prep,
                    preflight,
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
                fixvox_metadata,
                audio_prep,
                preflight,
                post_process: None,
                redacted: true,
            }
        }
        ProviderTranscriptionOutcome::NoSpeech {
            reason,
            no_speech_probability,
            average_log_probability,
            provider,
            model,
            latency_ms,
            request_id,
            fixvox_metadata,
        } => {
            let detail = match (no_speech_probability, average_log_probability) {
                (Some(no_speech), Some(logprob)) => format!(
                    "Speech provider marked recording as no speech ({reason}; no_speech_prob={no_speech}; avg_logprob={logprob})."
                ),
                (Some(no_speech), None) => format!(
                    "Speech provider marked recording as no speech ({reason}; no_speech_prob={no_speech})."
                ),
                _ => "Speech provider marked recording as no speech.".to_string(),
            };
            HostTranscriptionResponse::Empty {
                error: error("PROVIDER_NO_SPEECH_DETECTED", &detail),
                report_path: Some(create_report_path(&request.run_id)),
                provider: redact_host_text(&provider),
                model: redact_host_text(&model),
                latency_ms,
                request_id: redact_request_id(request_id),
                fixvox_metadata: fixvox_metadata
                    .as_ref()
                    .map(redact_fixvox_response_metadata),
                audio_prep,
                preflight,
                retryable: true,
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
            fixvox_metadata,
        } => HostTranscriptionResponse::ProviderError {
            error: error(&code, &message),
            provider: provider.map(|value| redact_host_text(&value)),
            model: model.map(|value| redact_host_text(&value)),
            latency_ms,
            request_id: redact_request_id(request_id),
            fixvox_metadata: fixvox_metadata
                .as_ref()
                .map(redact_fixvox_response_metadata),
            audio_prep,
            preflight,
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

    let mut report = serde_json::json!({
        "runId": redact_host_text(&request.run_id),
        "status": status,
        "audioPath": redact_host_text(&request.audio_path),
        "transcriptLength": transcript_length,
        "rawProviderPayloadStored": false,
        "redacted": true,
    });

    if let Some(metadata) = response_fixvox_metadata(response) {
        report["fixvoxMetadata"] =
            serde_json::to_value(metadata).unwrap_or(serde_json::Value::Null);
    }

    if let Some(audio_prep) = response_audio_prep(response) {
        report["audioPrep"] = serde_json::to_value(audio_prep).unwrap_or(serde_json::Value::Null);
    }

    if let Some(preflight) = response_preflight(response) {
        report["preflight"] = serde_json::to_value(preflight).unwrap_or(serde_json::Value::Null);
    }

    if let Some(post_process) = response_post_process(response) {
        report["postProcess"] =
            serde_json::to_value(post_process).unwrap_or(serde_json::Value::Null);
    }

    serde_json::to_string(&report).unwrap_or_else(|_| {
        "{\"status\":\"report-error\",\"rawProviderPayloadStored\":false,\"redacted\":true}"
            .to_string()
    })
}

fn response_post_process(response: &HostTranscriptionResponse) -> Option<&HostPostProcessEvidence> {
    match response {
        HostTranscriptionResponse::Ok { post_process, .. } => post_process.as_ref(),
        HostTranscriptionResponse::MissingAudio { .. }
        | HostTranscriptionResponse::SetupError { .. }
        | HostTranscriptionResponse::ProviderError { .. }
        | HostTranscriptionResponse::Empty { .. }
        | HostTranscriptionResponse::Cancelled { .. } => None,
    }
}

fn response_audio_prep(response: &HostTranscriptionResponse) -> Option<&HostAudioPrepEvidence> {
    match response {
        HostTranscriptionResponse::Ok { audio_prep, .. }
        | HostTranscriptionResponse::ProviderError { audio_prep, .. }
        | HostTranscriptionResponse::Empty { audio_prep, .. } => audio_prep.as_ref(),
        HostTranscriptionResponse::MissingAudio { .. }
        | HostTranscriptionResponse::SetupError { .. }
        | HostTranscriptionResponse::Cancelled { .. } => None,
    }
}

fn response_preflight(response: &HostTranscriptionResponse) -> Option<&ManagedPreflightEvidence> {
    match response {
        HostTranscriptionResponse::Ok { preflight, .. }
        | HostTranscriptionResponse::ProviderError { preflight, .. }
        | HostTranscriptionResponse::Empty { preflight, .. } => preflight.as_ref(),
        HostTranscriptionResponse::MissingAudio { .. }
        | HostTranscriptionResponse::SetupError { .. }
        | HostTranscriptionResponse::Cancelled { .. } => None,
    }
}

fn response_fixvox_metadata(
    response: &HostTranscriptionResponse,
) -> Option<&RedactedFixvoxResponseMetadata> {
    match response {
        HostTranscriptionResponse::Ok {
            fixvox_metadata, ..
        }
        | HostTranscriptionResponse::ProviderError {
            fixvox_metadata, ..
        }
        | HostTranscriptionResponse::Empty {
            fixvox_metadata, ..
        } => fixvox_metadata.as_ref(),
        HostTranscriptionResponse::MissingAudio { .. }
        | HostTranscriptionResponse::SetupError { .. }
        | HostTranscriptionResponse::Cancelled { .. } => None,
    }
}

fn redact_fixvox_response_metadata(
    metadata: &fixvox_cloud::FixvoxResponseMetadata,
) -> RedactedFixvoxResponseMetadata {
    RedactedFixvoxResponseMetadata {
        fixvox_request_id: redact_request_id(metadata.fixvox_request_id.clone()),
        provider_request_id: redact_request_id(metadata.provider_request_id.clone()),
        cost_usd: metadata
            .cost_usd
            .clone()
            .map(|value| redact_host_text(&value)),
        pricing_source: metadata
            .pricing_source
            .clone()
            .map(|value| redact_host_text(&value)),
        limit: metadata.limit,
        remaining: metadata.remaining,
        reset_at: metadata
            .reset_at
            .clone()
            .map(|value| redact_host_text(&value)),
        usage_key: metadata
            .usage_key
            .as_ref()
            .map(|_| "redacted-usage-key".to_string()),
        proxy_parse_ms: metadata.proxy_parse_ms,
        proxy_usage_ms: metadata.proxy_usage_ms,
        proxy_upstream_ms: metadata.proxy_upstream_ms,
        proxy_engine_binding_ms: metadata.proxy_engine_binding_ms,
        proxy_prompt_resolution_ms: metadata.proxy_prompt_resolution_ms,
        proxy_budget_config_ms: metadata.proxy_budget_config_ms,
        proxy_budget_events_ms: metadata.proxy_budget_events_ms,
        proxy_multipart_ms: metadata.proxy_multipart_ms,
        proxy_budget_ms: metadata.proxy_budget_ms,
        proxy_init_ms: metadata.proxy_init_ms,
        proxy_total_ms: metadata.proxy_total_ms,
        server_timing: metadata
            .server_timing
            .clone()
            .map(|value| redact_host_text(&value)),
        redacted: true,
    }
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
        let transcript_file_path = writable_artifact_file_path(transcript_path);
        if let Some(parent) = Path::new(&transcript_file_path).parent() {
            fs::create_dir_all(parent).map_err(|_| {
                error(
                    "ARTIFACT_WRITE_FAILED",
                    "Host runtime transcript directory could not be created.",
                )
            })?;
        }
        fs::write(&transcript_file_path, text).map_err(|_| {
            error(
                "ARTIFACT_WRITE_FAILED",
                "Host runtime transcript could not be written.",
            )
        })?;
    }

    let report_path =
        response_report_path(response).unwrap_or_else(|| create_report_path(&request.run_id));
    validate_report_path(&report_path)?;
    let report_file_path = writable_artifact_file_path(&report_path);
    if let Some(parent) = Path::new(&report_file_path).parent() {
        fs::create_dir_all(parent).map_err(|_| {
            error(
                "ARTIFACT_WRITE_FAILED",
                "Host runtime report directory could not be created.",
            )
        })?;
    }
    fs::write(&report_file_path, create_redacted_report(response, request)).map_err(|_| {
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

fn resolve_existing_artifact_file_path(artifact_path: &str) -> Option<String> {
    artifact_file_path_candidates(artifact_path)
        .into_iter()
        .find(|path| Path::new(path).is_file())
}

fn writable_artifact_file_path(artifact_path: &str) -> String {
    resolve_writable_artifact_file_path(
        artifact_path,
        cfg!(debug_assertions),
        local_app_data_root().as_deref(),
        compile_time_repo_root().as_deref(),
    )
    .to_string_lossy()
    .to_string()
}

fn resolve_writable_artifact_file_path(
    artifact_path: &str,
    debug_assertions: bool,
    app_data_root: Option<&Path>,
    repo_root: Option<&Path>,
) -> PathBuf {
    let normalized = normalize_path(artifact_path);
    let preferred_root = if debug_assertions {
        repo_root
    } else {
        app_data_root.or(repo_root)
    };

    preferred_root
        .map(|root| root.join(&normalized))
        .unwrap_or_else(|| PathBuf::from(normalized))
}

fn artifact_file_path_candidates(artifact_path: &str) -> Vec<String> {
    let normalized = normalize_path(artifact_path);
    let mut candidates = vec![normalized.clone(), format!("../{}", normalized)];

    if let Some(app_data_root) = local_app_data_root() {
        candidates.push(
            app_data_root
                .join(&normalized)
                .to_string_lossy()
                .to_string(),
        );
    }

    if let Some(repo_root) = compile_time_repo_root() {
        candidates.push(repo_root.join(&normalized).to_string_lossy().to_string());
    }

    candidates
}

fn local_app_data_root() -> Option<PathBuf> {
    ["APPDATA", "LOCALAPPDATA", "XDG_DATA_HOME", "HOME"]
        .iter()
        .find_map(|key| std::env::var(key).ok())
        .map(|base| PathBuf::from(base).join("dictation-tauri"))
}

fn compile_time_repo_root() -> Option<PathBuf> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|path| path.to_path_buf())
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
    if request_id.trim().is_empty() {
        return None;
    }

    Some("redacted-request-id".to_string())
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

    static PREFLIGHT_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    fn preflight_test_guard() -> std::sync::MutexGuard<'static, ()> {
        PREFLIGHT_TEST_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .expect("preflight test lock should not be poisoned")
    }

    #[test]
    fn readiness_reports_missing_and_configured_groq_without_secret_leakage() {
        let missing = create_runtime_transcription_readiness(&|_key| None);
        assert!(!missing.configured);
        assert!(!missing.supports_real_provider_call);
        assert!(!missing.direct_byok_configured);
        assert!(missing.managed_cloud_configured);
        assert!(!missing.managed_device_registered);
        assert_eq!(
            missing.managed_backend_base_url.as_deref(),
            Some(fixvox_cloud::PREFERRED_FIXVOX_BACKEND_URL),
        );
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
        assert!(configured.direct_byok_configured);
        assert_eq!(configured.provider.as_deref(), Some("groq"));
        assert_eq!(configured.model.as_deref(), Some("whisper-large-v3-turbo"));
        assert!(format!("{:?}", configured.reason).contains("None"));
    }

    #[test]
    fn readiness_reports_managed_cloud_and_device_state_without_secret_leakage() {
        let secret = "gsk_test_secret_must_not_leak";
        let readiness = create_runtime_transcription_readiness(&|key| match key {
            "GROQ_API_KEY" => Some(secret.to_string()),
            "FIXVOX_BACKEND_URL" => Some(" https://auth-fixvox.jpsala.dev/ ".to_string()),
            "FIXVOX_DEVICE_ID" => Some("dev_test_1234567890abcdef".to_string()),
            _ => None,
        });

        assert!(readiness.configured);
        assert!(readiness.direct_byok_configured);
        assert!(readiness.managed_cloud_configured);
        assert!(readiness.managed_device_registered);
        assert_eq!(
            readiness.managed_backend_base_url.as_deref(),
            Some("https://auth-fixvox.jpsala.dev"),
        );
        assert!(!serde_json::to_string(&readiness)
            .expect("readiness should serialize")
            .contains(secret));
    }

    #[test]
    fn readiness_allows_managed_cloud_without_direct_byok_secret() {
        let readiness = create_runtime_transcription_readiness(&|key| match key {
            "FIXVOX_BACKEND_URL" => Some(" https://auth-fixvox.jpsala.dev/ ".to_string()),
            "FIXVOX_DEVICE_ID" => Some("dev_test_1234567890abcdef".to_string()),
            "FIXVOX_STT_MODEL" => Some("whisper-large-v3".to_string()),
            _ => None,
        });

        assert!(readiness.configured);
        assert!(readiness.supports_real_provider_call);
        assert!(!readiness.direct_byok_configured);
        assert!(readiness.managed_cloud_configured);
        assert!(readiness.managed_device_registered);
        assert_eq!(readiness.provider.as_deref(), Some("fixvox-cloud"));
        assert_eq!(readiness.model.as_deref(), Some("whisper-large-v3"));
        assert!(readiness.reason.is_none());
    }

    #[test]
    fn managed_runtime_requires_install_id_for_preflight_without_direct_groq_fallback() {
        let request = test_request("managed-preflight-config");
        let denied = read_managed_runtime_config(
            &|key| match key {
                "GROQ_API_KEY" => Some("gsk_test_secret_must_not_leak".to_string()),
                "FIXVOX_BACKEND_URL" => Some("https://auth-fixvox.jpsala.dev".to_string()),
                "FIXVOX_DEVICE_ID" => Some("dev_test_1234567890abcdef".to_string()),
                _ => None,
            },
            &request,
        )
        .expect_err("managed mode should fail closed before direct Groq fallback");

        assert_eq!(denied.code, "FIXVOX_INSTALL_ID_MISSING");
        assert!(!denied.message.to_ascii_lowercase().contains("groq"));
    }

    #[test]
    fn resolves_redacted_fixvox_pro_policy_into_managed_runtime_plan() {
        let policy_json = serde_json::json!({
            "policyId": "pro",
            "transcript": {
                "provider": "groq",
                "model": "whisper-large-v3-turbo",
                "prompt": "Transcribí en español. [fixture redacted] Conservá comandos, modelos, paquetes, archivos, URLs, emails, números y mayúsculas técnicas."
            },
            "voicePolicy": {
                "enableSttPrompt": true,
                "enableRawPostProcess": false,
                "postProcessPrompt": "[redacted postprocess prompt fixture]"
            },
            "voiceRouting": {
                "label": "pro-stt-only",
                "runtime": {
                    "sttPromptEnabled": true,
                    "postProcessEnabled": false
                },
                "speech": {
                    "provider": "groq",
                    "model": "whisper-large-v3-turbo"
                }
            }
        });
        let plan = resolve_dictation_runtime_plan_from_policy_json(&policy_json);

        assert_eq!(plan.policy_id.as_deref(), Some("pro"));
        assert_eq!(
            plan.voice_routing_profile_id.as_deref(),
            Some("pro-stt-only")
        );
        assert_eq!(plan.stt_provider, "groq");
        assert_eq!(plan.stt_model, "whisper-large-v3-turbo");
        assert!(plan.stt_prompt_enabled);
        assert_eq!(
            plan.stt_prompt.as_ref().map(|prompt| prompt.len()),
            Some(140)
        );
        assert!(!plan.post_process.enabled);
        assert_eq!(plan.post_process.source.as_deref(), Some("disabled"));
    }

    #[test]
    fn managed_runtime_config_resolves_install_and_device_for_preflight() {
        let request = test_request("managed-preflight-config-ready");
        let config = read_managed_runtime_config(
            &|key| match key {
                "FIXVOX_BACKEND_URL" => Some("https://auth-fixvox.jpsala.dev".to_string()),
                "FIXVOX_INSTALL_ID" => Some("install_test_123".to_string()),
                "FIXVOX_DEVICE_ID" => Some("dev_test_1234567890abcdef".to_string()),
                _ => None,
            },
            &request,
        )
        .expect("managed runtime config should resolve preflight identity");

        assert_eq!(config.install_id, "install_test_123");
        assert_eq!(config.device_id, "dev_test_1234567890abcdef");
        assert_eq!(config.provider, "fixvox-cloud");
    }

    #[test]
    fn managed_runtime_config_prefers_persisted_runtime_policy_over_legacy_transport_policy() {
        let appdata = "target/runtime-transcription-runtime-policy";
        let _ = fs::remove_dir_all(appdata);
        let state = fixvox_cloud::FixvoxDeviceState {
            install_id: "install_runtime_policy".to_string(),
            device_id: Some("dev_runtime_policy".to_string()),
            last_register_ok: true,
            last_register_error_code: None,
            last_register_error_message: None,
            policy_id: Some("pro".to_string()),
            policy_label: Some("Pro".to_string()),
            transport_policy: Some(serde_json::json!({
                "mode": "managed",
                "speechProvider": "groq",
                "defaults": { "sttModel": "whisper-large-v3" }
            })),
            policy_snapshot: Some(fixvox_cloud::FixvoxPolicySnapshot {
                policy_id: Some("pro".to_string()),
                policy_label: Some("Pro".to_string()),
                features: Some(serde_json::json!({ "managedTranscription": true })),
                capabilities: fixvox_cloud::FixvoxPolicyCapabilities {
                    can_use_managed_transcription: true,
                    can_see_advanced_settings: true,
                    can_use_debug_tools: false,
                },
                transport_policy: Some(serde_json::json!({ "mode": "managed" })),
                runtime_policy: Some(serde_json::json!({
                    "policyId": "pro",
                    "transcript": {
                        "provider": "groq",
                        "model": "whisper-large-v3-turbo",
                        "prompt": "persisted technical Spanish prompt"
                    },
                    "voicePolicy": {
                        "enableSttPrompt": true,
                        "enableRawPostProcess": false
                    }
                })),
                fetched_at: "test".to_string(),
                trust: "fresh".to_string(),
                stale: false,
                error: None,
            }),
            auth_policy: None,
        };
        let path = Path::new(appdata)
            .join("dictation-tauri")
            .join("fixvox-device-state.json");
        fixvox_cloud::persist_device_state(&path, &state)
            .expect("test device state should persist");

        let config = read_managed_runtime_config(
            &|key| match key {
                "APPDATA" => Some(appdata.to_string()),
                "FIXVOX_BACKEND_URL" => Some("https://auth-fixvox.jpsala.dev".to_string()),
                _ => None,
            },
            &test_request("runtime-policy-state"),
        )
        .expect("managed runtime should use persisted runtime policy");

        assert_eq!(config.model, "whisper-large-v3-turbo");
        assert_eq!(
            config.stt_prompt.as_deref(),
            Some("persisted technical Spanish prompt")
        );
        assert_eq!(
            config.post_process.as_ref().map(|policy| policy.enabled),
            Some(false)
        );
    }

    #[test]
    fn managed_runtime_config_uses_policy_plan_for_stt_and_postprocess() {
        let request = test_request("managed-policy-runtime-plan");
        let policy_json = serde_json::json!({
            "policyId": "pro",
            "transcript": {
                "provider": "groq",
                "model": "whisper-large-v3-turbo",
                "prompt": "technical Spanish STT prompt fixture"
            },
            "voicePolicy": {
                "enableSttPrompt": true,
                "enableRawPostProcess": false,
                "postProcessPrompt": "postprocess fixture"
            }
        })
        .to_string();
        let config = read_managed_runtime_config(
            &|key| match key {
                "FIXVOX_BACKEND_URL" => Some("https://auth-fixvox.jpsala.dev".to_string()),
                "FIXVOX_INSTALL_ID" => Some("install_test_123".to_string()),
                "FIXVOX_DEVICE_ID" => Some("dev_test_1234567890abcdef".to_string()),
                "FIXVOX_STT_MODEL" => Some("whisper-large-v3".to_string()),
                "FIXVOX_CACHED_POLICY_JSON" => Some(policy_json.clone()),
                _ => None,
            },
            &request,
        )
        .expect("managed runtime config should resolve from policy cache");

        assert_eq!(config.model, "whisper-large-v3-turbo");
        assert_eq!(
            config.stt_prompt.as_deref(),
            Some("technical Spanish STT prompt fixture")
        );
        assert_eq!(
            config.post_process.as_ref().map(|policy| policy.enabled),
            Some(false),
        );
    }

    #[test]
    fn managed_runtime_creates_durable_install_id_before_reporting_missing_device_id() {
        let appdata = "target/runtime-transcription-auto-install-id";
        let _ = fs::remove_dir_all(appdata);

        let request = test_request("managed-auto-install-id");
        let denied = read_managed_runtime_config(
            &|key| match key {
                "APPDATA" => Some(appdata.to_string()),
                "FIXVOX_BACKEND_URL" => Some("https://auth-fixvox.jpsala.dev".to_string()),
                _ => None,
            },
            &request,
        )
        .expect_err(
            "first packaged dictation should create install id before requiring activation",
        );

        assert_eq!(denied.code, "FIXVOX_DEVICE_ID_MISSING");
        let path = fixvox_cloud::resolve_device_state_path(&|key| match key {
            "APPDATA" => Some(appdata.to_string()),
            _ => None,
        })
        .expect("test appdata should resolve device state path");
        let state = fixvox_cloud::read_device_state(&path)
            .expect("device state should be readable")
            .expect("device state should be created");
        assert!(state.install_id.starts_with("install_"));
        assert!(state.device_id.is_none());
    }

    #[test]
    fn managed_runtime_prefers_persisted_device_identity_over_env_manual_values() {
        let appdata = "target/runtime-transcription-persisted-identity";
        let _ = fs::remove_dir_all(appdata);
        write_policy_state(appdata, "install_persisted", "dev_persisted", true);

        let request = test_request("managed-persisted-identity");
        let config = read_managed_runtime_config(
            &|key| match key {
                "APPDATA" => Some(appdata.to_string()),
                "FIXVOX_BACKEND_URL" => Some("https://auth-fixvox.jpsala.dev".to_string()),
                "FIXVOX_INSTALL_ID" => Some("install_env_should_not_win".to_string()),
                "FIXVOX_DEVICE_ID" => Some("dev_env_should_not_win".to_string()),
                _ => None,
            },
            &request,
        )
        .expect("persisted device state should configure managed runtime");

        assert_eq!(config.install_id, "install_persisted");
        assert_eq!(config.device_id, "dev_persisted");
    }

    #[test]
    fn managed_runtime_fails_closed_when_policy_disables_managed_even_with_byok_available() {
        let appdata = "target/runtime-transcription-policy-denied";
        let _ = fs::remove_dir_all(appdata);
        write_policy_state(appdata, "install_denied", "dev_denied", false);

        let request = test_request("managed-policy-denied");
        let denied = read_managed_runtime_config(
            &|key| match key {
                "APPDATA" => Some(appdata.to_string()),
                "FIXVOX_BACKEND_URL" => Some("https://auth-fixvox.jpsala.dev".to_string()),
                "GROQ_API_KEY" => Some("gsk_test_secret_must_not_leak".to_string()),
                _ => None,
            },
            &request,
        )
        .expect_err("managed runtime should fail closed instead of falling back to BYOK");

        assert_eq!(denied.code, "FIXVOX_MANAGED_TRANSCRIPTION_DISABLED");
        assert!(!denied.message.to_ascii_lowercase().contains("gsk"));
    }

    #[test]
    fn managed_runtime_fails_closed_when_postprocess_lacks_managed_llm_capability() {
        let appdata = "target/runtime-transcription-postprocess-capability-denied";
        let _ = fs::remove_dir_all(appdata);
        let mut request = test_request("managed-postprocess-denied");
        request.post_process = Some(HostPostProcessPolicy {
            enabled: true,
            prompt: Some("[redacted postprocess prompt fixture]".to_string()),
            provider: Some("fixvox-cloud".to_string()),
            model: Some("openai/gpt-oss-120b".to_string()),
            source: Some("test".to_string()),
            policy_id: Some("dictation-basic-without-llm".to_string()),
            voice_routing_profile_id: None,
        });
        let state = fixvox_cloud::FixvoxDeviceState {
            install_id: "install_postprocess_denied".to_string(),
            device_id: Some("dev_postprocess_denied".to_string()),
            last_register_ok: true,
            last_register_error_code: None,
            last_register_error_message: None,
            policy_id: Some("dictation-basic".to_string()),
            policy_label: Some("Dictation Basic".to_string()),
            transport_policy: Some(serde_json::json!({ "speech": { "mode": "proxied" } })),
            policy_snapshot: Some(fixvox_cloud::FixvoxPolicySnapshot {
                policy_id: Some("dictation-basic".to_string()),
                policy_label: Some("Dictation Basic".to_string()),
                features: Some(serde_json::json!({ "managedTranscription": true })),
                capabilities: fixvox_cloud::FixvoxPolicyCapabilities {
                    can_use_managed_transcription: true,
                    can_see_advanced_settings: false,
                    can_use_debug_tools: false,
                },
                transport_policy: Some(serde_json::json!({ "speech": { "mode": "proxied" } })),
                runtime_policy: None,
                fetched_at: "test".to_string(),
                trust: "fresh".to_string(),
                stale: false,
                error: None,
            }),
            auth_policy: Some(fixvox_cloud::FixvoxAuthPolicyStatus {
                access_mode: "signed_in".to_string(),
                user_redacted: Some("user_t…7890".to_string()),
                group_label: Some("Dictation".to_string()),
                policy_template_id: Some("dictation-basic".to_string()),
                policy_template_label: Some("Dictation Basic".to_string()),
                capabilities: vec![
                    "dictation".to_string(),
                    "managed_stt".to_string(),
                    "postprocess".to_string(),
                ],
                limits: None,
                redacted: true,
            }),
        };
        let path = Path::new(appdata)
            .join("dictation-tauri")
            .join("fixvox-device-state.json");
        fixvox_cloud::persist_device_state(&path, &state)
            .expect("test device state should be persisted");

        let denied = read_managed_runtime_config(
            &|key| match key {
                "APPDATA" => Some(appdata.to_string()),
                "FIXVOX_BACKEND_URL" => Some("https://auth-fixvox.jpsala.dev".to_string()),
                "GROQ_API_KEY" => Some("gsk_test_secret_must_not_leak".to_string()),
                _ => None,
            },
            &request,
        )
        .expect_err("postprocess must require managed_llm and not fall back to BYOK");

        assert_eq!(denied.code, "FIXVOX_CAPABILITY_NOT_ALLOWED");
        assert!(!denied.message.to_ascii_lowercase().contains("gsk"));
    }

    #[test]
    fn resolves_artifact_files_from_repo_root_or_tauri_cwd() {
        let candidates =
            artifact_file_path_candidates("artifacts/microphone-capture/audio/capture.wav");
        assert_eq!(
            &candidates[..2],
            &[
                "artifacts/microphone-capture/audio/capture.wav".to_string(),
                "../artifacts/microphone-capture/audio/capture.wav".to_string(),
            ],
        );
        assert!(
            candidates
                .iter()
                .all(|candidate| candidate
                    .ends_with("artifacts/microphone-capture/audio/capture.wav"))
        );
    }

    #[test]
    fn reads_dot_env_values_from_allowed_relative_locations() {
        let path = "target/runtime-transcription-dotenv-test.env";
        if let Some(parent) = Path::new(path).parent() {
            fs::create_dir_all(parent).expect("test dotenv parent should be created");
        }
        fs::write(
            path,
            "GROQ-API-KEY='gsk_test_secret_must_not_leak'\nFIXVOX_DEVICE_ID='dev_test_1234567890abcdef'\nOTHER_KEY=ignored\n",
        )
        .expect("test dotenv should be written");

        assert_eq!(
            read_dot_env_value_from_path(path, "GROQ-API-KEY"),
            Some("gsk_test_secret_must_not_leak".to_string()),
        );
        assert_eq!(
            read_dot_env_value_from_path(path, "FIXVOX_DEVICE_ID"),
            Some("dev_test_1234567890abcdef".to_string()),
        );
        assert_eq!(read_dot_env_value_from_path(path, "MISSING_GROQ_KEY"), None,);

        let _ = fs::remove_file(path);
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
                post_process: None,
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
                fixvox_metadata: None,
            },
            &request,
            None,
            None,
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
                fixvox_metadata: None,
            },
            &request,
            None,
            None,
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
    fn preflight_cache_reuses_allowed_decision_for_matching_key_within_ttl() {
        let _guard = preflight_test_guard();
        clear_preflight_cache_for_tests();
        clear_preflight_in_flight_for_tests();
        let config = test_managed_config();
        let key = preflight_cache_key(&config);
        let decision = fixvox_cloud::PreflightDecision {
            ok: true,
            allowed: true,
            mode: Some("managed".to_string()),
            usage_kind: Some("transcription".to_string()),
            request_id: Some("preflight_req_123".to_string()),
            deny_code: None,
            deny_message: None,
            limits: None,
        };

        remember_preflight_decision_at(key.clone(), &decision, 1_000, true);

        let hit = preflight_cache_hit_at(&key, 1_100).expect("prewarmed cache should hit");
        assert!(hit.cached);
        assert!(hit.prewarmed);
        assert_eq!(hit.cache_age_ms, Some(100));
        assert_eq!(hit.request_id.as_deref(), Some("redacted-request-id"));
        assert!(preflight_cache_allows_at(
            &key,
            1_000 + TRANSCRIPTION_PREFLIGHT_CACHE_TTL_MS
        ));
        assert!(!preflight_cache_allows_at(
            &key,
            1_001 + TRANSCRIPTION_PREFLIGHT_CACHE_TTL_MS
        ));
        assert!(!preflight_cache_allows_at(
            &PreflightCacheKey {
                device_id: "dev_other".to_string(),
                ..key
            },
            1_100,
        ));
        clear_preflight_cache_for_tests();
    }

    #[test]
    fn preflight_cache_does_not_remember_denials() {
        let _guard = preflight_test_guard();
        clear_preflight_cache_for_tests();
        clear_preflight_in_flight_for_tests();
        let key = preflight_cache_key(&test_managed_config());
        let decision = fixvox_cloud::PreflightDecision {
            ok: true,
            allowed: false,
            mode: Some("managed".to_string()),
            usage_kind: Some("transcription".to_string()),
            request_id: Some("preflight_req_denied".to_string()),
            deny_code: Some("quota_exceeded".to_string()),
            deny_message: Some("quota exceeded".to_string()),
            limits: None,
        };

        remember_preflight_decision_at(key.clone(), &decision, 1_000, false);

        assert!(!preflight_cache_allows_at(&key, 1_001));
        clear_preflight_cache_for_tests();
    }

    #[test]
    fn preflight_in_flight_reuses_cached_prewarm_before_soft_timeout() {
        let _guard = preflight_test_guard();
        clear_preflight_cache_for_tests();
        clear_preflight_in_flight_for_tests();
        let key = preflight_cache_key(&test_managed_config());
        let owner = match begin_or_join_preflight_in_flight_at(&key, 1_000, true, true) {
            PreflightInFlightAction::Start(owner) => owner,
            _ => panic!("first preflight should own in-flight marker"),
        };
        let waiting = match begin_or_join_preflight_in_flight_at(&key, 1_050, false, true) {
            PreflightInFlightAction::Wait(existing) => existing,
            _ => panic!("matching preflight should join in-flight marker before timeout"),
        };
        let decision = fixvox_cloud::PreflightDecision {
            ok: true,
            allowed: true,
            mode: Some("managed".to_string()),
            usage_kind: Some("transcription".to_string()),
            request_id: Some("preflight_req_cached".to_string()),
            deny_code: None,
            deny_message: None,
            limits: None,
        };
        remember_preflight_decision_at(key.clone(), &decision, current_time_ms(), true);

        let evidence = wait_for_preflight_in_flight_or_soft_timeout(&waiting, true)
            .expect("waiting preflight should reuse the completed prewarm cache");
        assert!(evidence.cached);
        assert!(evidence.prewarmed);
        assert_eq!(evidence.in_flight_soft_timed_out, None);
        assert_eq!(evidence.trusted_policy_fallback, None);
        drop(owner);
        clear_preflight_cache_for_tests();
        clear_preflight_in_flight_for_tests();
    }

    #[test]
    fn preflight_in_flight_soft_timeout_uses_trusted_policy_fallback() {
        let _guard = preflight_test_guard();
        clear_preflight_cache_for_tests();
        clear_preflight_in_flight_for_tests();
        let key = preflight_cache_key(&test_managed_config());
        let owner = match begin_or_join_preflight_in_flight_at(&key, 1_000, true, true) {
            PreflightInFlightAction::Start(owner) => owner,
            _ => panic!("first preflight should own in-flight marker"),
        };

        let evidence = match begin_or_join_preflight_in_flight_at(
            &key,
            1_000 + TRANSCRIPTION_PREFLIGHT_IN_FLIGHT_SOFT_TIMEOUT_MS + 1,
            false,
            true,
        ) {
            PreflightInFlightAction::Bypass(evidence) => evidence,
            _ => panic!("stale in-flight preflight should be bypassed with trusted policy"),
        };

        assert!(!evidence.cached);
        assert!(evidence.prewarmed);
        assert_eq!(evidence.cache_age_ms, Some(1_001));
        assert_eq!(evidence.in_flight_soft_timed_out, Some(true));
        assert_eq!(evidence.trusted_policy_fallback, Some(true));
        drop(owner);
        clear_preflight_in_flight_for_tests();
    }

    #[test]
    fn release_artifact_writes_use_app_data_instead_of_the_process_cwd() {
        let app_data_root = Path::new("user-app-data/dictation-tauri");
        let repo_root = Path::new("repo-root");
        let artifact_path = "artifacts/microphone-capture/transcripts/run-1.txt";

        assert_eq!(
            resolve_writable_artifact_file_path(
                artifact_path,
                false,
                Some(app_data_root),
                Some(repo_root),
            ),
            app_data_root.join(artifact_path),
        );
        assert_eq!(
            resolve_writable_artifact_file_path(
                artifact_path,
                true,
                Some(app_data_root),
                Some(repo_root),
            ),
            repo_root.join(artifact_path),
        );
    }

    #[test]
    fn generated_transcript_and_report_paths_stay_under_allowed_roots() {
        let request = test_request("run:with/unsafe chars");
        let response = map_provider_outcome_to_host_response(
            ProviderTranscriptionOutcome::Ok {
                text: " host transcript ".to_string(),
                provider: "fixvox-cloud".to_string(),
                model: "whisper-large-v3".to_string(),
                latency_ms: 42,
                request_id: Some("req_safe_123".to_string()),
                fixvox_metadata: Some(fixvox_cloud::FixvoxResponseMetadata {
                    fixvox_request_id: Some("fx_req_safe_123".to_string()),
                    cost_usd: Some("0.000042".to_string()),
                    usage_key: Some("transcription:dev_test_1234567890abcdef".to_string()),
                    proxy_engine_binding_ms: Some(91),
                    proxy_prompt_resolution_ms: Some(2),
                    proxy_budget_config_ms: Some(3),
                    proxy_budget_events_ms: Some(47),
                    proxy_multipart_ms: Some(5),
                    proxy_total_ms: Some(140),
                    ..Default::default()
                }),
            },
            &request,
            None,
            None,
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
        assert!(report.contains("\"fixvoxMetadata\""));
        assert!(report.contains("\"proxyEngineBindingMs\":91"));
        assert!(report.contains("\"proxyPromptResolutionMs\":2"));
        assert!(report.contains("\"proxyBudgetConfigMs\":3"));
        assert!(report.contains("\"proxyBudgetEventsMs\":47"));
        assert!(report.contains("\"proxyMultipartMs\":5"));
        assert!(report.contains("\"proxyTotalMs\":140"));
        assert!(report.contains("redacted-usage-key"));
        assert!(report.contains("redacted-request-id"));
        assert!(!report.contains("dev_test_1234567890abcdef"));
        assert!(!report.contains("fx_req_safe_123"));
        assert!(!report.contains("req_safe_123"));
        assert!(!report.contains("host transcript"));
    }

    #[test]
    fn cancelled_provider_outcome_maps_without_retry() {
        let response = map_provider_outcome_to_host_response(
            ProviderTranscriptionOutcome::Cancelled,
            &test_request("cancelled-run"),
            None,
            None,
        );

        assert!(matches!(
            response,
            HostTranscriptionResponse::Cancelled {
                retryable: false,
                ..
            }
        ));
    }

    #[test]
    fn local_voice_activity_matches_fixvox_thresholds() {
        let silent = create_test_wav_bytes(1_000, 0.0);
        let silent_activity = analyze_wav_voice_activity(&silent);
        assert_eq!(silent_activity.duration_ms, 1_000);
        assert_eq!(silent_activity.voiced_ms, 0);
        assert!(!silent_activity.has_speech);

        let quiet_speech = create_test_wav_bytes(1_000, 0.008);
        let quiet_activity = analyze_wav_voice_activity(&quiet_speech);
        assert!(quiet_activity.voiced_ms >= VAD_MIN_VOICED_MS);
        assert!(quiet_activity.has_speech);
    }

    #[test]
    fn audio_prep_keeps_short_wav_and_records_redacted_evidence() {
        let wav = create_test_wav_bytes(1_000, 0.008);
        let payload = prepare_speech_upload_payload(Path::new("recording.wav"), wav);
        let evidence = payload.evidence(None);

        assert_eq!(payload.source, "wav");
        assert_eq!(payload.mime_type, "audio/wav");
        assert_eq!(payload.file_name, "recording.wav");
        assert_eq!(evidence.upload_bytes, evidence.original_bytes);
        assert_eq!(evidence.compression_ratio, None);
        assert_eq!(evidence.optimization_status, "skipped");
        assert_eq!(evidence.optimization_reason, "below_optimization_threshold");
        assert_eq!(evidence.audio_duration_ms, 1_000);
        assert!(evidence.voice_activity.has_speech);
        assert!(evidence.redacted);
    }

    #[test]
    fn audio_prep_uses_ffmpeg_mp3_for_long_audio_when_available() {
        if Command::new("ffmpeg").arg("-version").output().is_err() {
            return;
        }
        let temp_path = std::env::temp_dir().join(format!(
            "dictation-tauri-audio-prep-{}.wav",
            current_time_ms()
        ));
        let wav = create_test_wav_bytes(5_000, 0.02);
        fs::write(&temp_path, &wav).expect("test wav should be writable");
        let payload = prepare_speech_upload_payload(&temp_path, wav.clone());
        let _ = fs::remove_file(&temp_path);
        let _ = fs::remove_file(temp_path.with_extension("wav.stt.mp3"));

        assert_eq!(payload.source, "ffmpeg-mp3");
        assert_eq!(payload.mime_type, "audio/mpeg");
        assert_eq!(payload.file_name, "recording.mp3");
        assert!(payload.bytes.len() < wav.len());
        assert_eq!(payload.optimization_status, "applied");
        assert_eq!(payload.optimization_reason, "optimized_audio_smaller");
        assert!(payload.compression_ratio.is_some());
    }

    #[test]
    fn audio_prep_falls_back_to_original_when_conversion_cannot_run() {
        let temp_path = std::env::temp_dir().join(format!(
            "dictation-tauri-audio-prep-missing-input-{}.wav",
            current_time_ms()
        ));
        let wav = create_test_wav_bytes(5_000, 0.02);
        let payload = prepare_speech_upload_payload(&temp_path, wav.clone());
        let evidence = payload.evidence(None);

        assert_eq!(payload.source, "wav");
        assert_eq!(payload.mime_type, "audio/wav");
        assert_eq!(payload.bytes.len(), wav.len());
        assert_eq!(payload.optimization_status, "fallback");
        assert_eq!(
            payload.optimization_reason,
            "conversion_failed_original_audio_used"
        );
        assert_eq!(evidence.upload_bytes, evidence.original_bytes);
        assert_eq!(evidence.optimization_status, "fallback");
        assert!(evidence.redacted);
    }

    #[test]
    fn provider_no_speech_response_maps_to_empty_with_reason() {
        let response = map_provider_outcome_to_host_response(
            ProviderTranscriptionOutcome::NoSpeech {
                reason: "high_no_speech_probability".to_string(),
                no_speech_probability: Some("0.9100".to_string()),
                average_log_probability: Some("-0.2000".to_string()),
                provider: "fixvox-cloud".to_string(),
                model: "whisper-large-v3-turbo".to_string(),
                latency_ms: 123,
                request_id: Some("provider_req_123".to_string()),
                fixvox_metadata: None,
            },
            &test_request("provider-no-speech"),
            None,
            None,
        );

        assert!(matches!(
            response,
            HostTranscriptionResponse::Empty { ref error, provider, model, .. }
                if error.code == "PROVIDER_NO_SPEECH_DETECTED"
                    && provider == "fixvox-cloud"
                    && model == "whisper-large-v3-turbo"
        ));
    }

    fn write_policy_state(appdata: &str, install_id: &str, device_id: &str, managed_allowed: bool) {
        let state = fixvox_cloud::FixvoxDeviceState {
            install_id: install_id.to_string(),
            device_id: Some(device_id.to_string()),
            last_register_ok: true,
            last_register_error_code: None,
            last_register_error_message: None,
            policy_id: Some(
                if managed_allowed {
                    "alpha-basic"
                } else {
                    "blocked"
                }
                .to_string(),
            ),
            policy_label: Some(
                if managed_allowed {
                    "Alpha Basic"
                } else {
                    "Blocked"
                }
                .to_string(),
            ),
            transport_policy: Some(serde_json::json!({
                "speech": { "mode": if managed_allowed { "proxied" } else { "disabled" } }
            })),
            policy_snapshot: Some(fixvox_cloud::FixvoxPolicySnapshot {
                policy_id: Some(
                    if managed_allowed {
                        "alpha-basic"
                    } else {
                        "blocked"
                    }
                    .to_string(),
                ),
                policy_label: Some(
                    if managed_allowed {
                        "Alpha Basic"
                    } else {
                        "Blocked"
                    }
                    .to_string(),
                ),
                features: Some(serde_json::json!({ "managedTranscription": managed_allowed })),
                capabilities: fixvox_cloud::FixvoxPolicyCapabilities {
                    can_use_managed_transcription: managed_allowed,
                    can_see_advanced_settings: false,
                    can_use_debug_tools: false,
                },
                transport_policy: Some(serde_json::json!({
                    "speech": { "mode": if managed_allowed { "proxied" } else { "disabled" } }
                })),
                runtime_policy: None,
                fetched_at: "test".to_string(),
                trust: "fresh".to_string(),
                stale: false,
                error: None,
            }),
            auth_policy: None,
        };
        let path = Path::new(appdata)
            .join("dictation-tauri")
            .join("fixvox-device-state.json");
        fixvox_cloud::persist_device_state(&path, &state)
            .expect("test device state should be persisted");
    }

    fn test_managed_config() -> ManagedHostRuntimeConfig {
        ManagedHostRuntimeConfig {
            backend_base_url: "https://auth-fixvox.jpsala.dev".to_string(),
            install_id: "install_test_123".to_string(),
            device_id: "dev_test_1234567890abcdef".to_string(),
            provider: "fixvox-cloud".to_string(),
            model: "whisper-large-v3-turbo".to_string(),
            language: None,
            stt_prompt: None,
            post_process: None,
        }
    }

    fn create_test_wav_bytes(duration_ms: u64, amplitude: f32) -> Vec<u8> {
        let sample_rate = 16_000_u32;
        let channels = 1_u16;
        let bits_per_sample = 16_u16;
        let sample_count = (sample_rate as u64 * duration_ms / 1_000) as usize;
        let byte_rate = sample_rate * channels as u32 * (bits_per_sample as u32 / 8);
        let block_align = channels * (bits_per_sample / 8);
        let data_size = sample_count * block_align as usize;
        let mut bytes = Vec::with_capacity(44 + data_size);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_size as u32).to_le_bytes());
        bytes.extend_from_slice(b"WAVE");
        bytes.extend_from_slice(b"fmt ");
        bytes.extend_from_slice(&16_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&channels.to_le_bytes());
        bytes.extend_from_slice(&sample_rate.to_le_bytes());
        bytes.extend_from_slice(&byte_rate.to_le_bytes());
        bytes.extend_from_slice(&block_align.to_le_bytes());
        bytes.extend_from_slice(&bits_per_sample.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&(data_size as u32).to_le_bytes());
        let sample_value = (amplitude.clamp(0.0, 1.0) * i16::MAX as f32) as i16;
        for index in 0..sample_count {
            let value = if index % 2 == 0 {
                sample_value
            } else {
                -sample_value
            };
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes
    }

    #[test]
    #[ignore]
    fn fixvox_audio_prep_managed_smoke_real_redacted() {
        if std::env::var("DICTATION_TAURI_FIXVOX_AUDIO_PREP_SMOKE")
            .ok()
            .as_deref()
            != Some("1")
        {
            panic!(
                "set DICTATION_TAURI_FIXVOX_AUDIO_PREP_SMOKE=1 for the gated real managed smoke"
            );
        }
        let audio_path = std::env::var("DICTATION_TAURI_FIXVOX_AUDIO_PREP_SMOKE_AUDIO")
            .unwrap_or_else(|_| {
                "artifacts/microphone-capture/audio/fixvox-audio-prep-smoke.wav".to_string()
            });
        let run_id = format!("fixvox-audio-prep-smoke-{}", current_time_ms());
        let request = HostTranscriptionRequest {
            run_id: run_id.clone(),
            audio_path,
            provider: None,
            model: None,
            language: None,
            mode: "real".to_string(),
            allow_provider_call: true,
            post_process: None,
        };
        let config = read_managed_runtime_config(&read_host_env_value, &request)
            .expect("managed runtime config should resolve for smoke");
        let _ =
            tauri::async_runtime::block_on(preflight_fixvox_managed_transcription(&config, true));
        let started_at = Instant::now();
        let response = tauri::async_runtime::block_on(
            transcribe_captured_audio_with_provider_call(request.clone(), &read_host_env_value),
        );
        let total_ms = elapsed_ms(started_at);
        let status = match &response {
            HostTranscriptionResponse::Ok { .. } => "ok",
            HostTranscriptionResponse::MissingAudio { .. } => "missing-audio",
            HostTranscriptionResponse::SetupError { .. } => "setup-error",
            HostTranscriptionResponse::ProviderError { .. } => "provider-error",
            HostTranscriptionResponse::Empty { .. } => "empty",
            HostTranscriptionResponse::Cancelled { .. } => "cancelled",
        };
        let prompt = config.stt_prompt.as_deref().unwrap_or("");
        let summary = serde_json::json!({
            "ok": matches!(response, HostTranscriptionResponse::Ok { .. }),
            "status": status,
            "runId": run_id,
            "model": response_model(&response),
            "prompt": {
                "length": prompt.len(),
                "hash": if prompt.is_empty() { None } else { Some(redacted_text_hash(prompt)) },
                "redacted": true
            },
            "preflight": response_preflight(&response),
            "audioPrep": response_audio_prep(&response),
            "sttLatencyMs": response_latency_ms(&response),
            "postProcess": response_post_process(&response),
            "totalMs": total_ms,
            "transcriptLength": match &response { HostTranscriptionResponse::Ok { text, .. } => text.len(), _ => 0 },
            "hostReportPath": response_report_path(&response),
            "rawProviderPayloadStored": false,
            "redacted": true
        });
        let summary_path = format!("{}{}-summary.json", REPORT_ROOT, sanitize_run_id(&run_id));
        let summary_file_path = writable_artifact_file_path(&summary_path);
        if let Some(parent) = Path::new(&summary_file_path).parent() {
            fs::create_dir_all(parent).expect("summary directory should be writable");
        }
        fs::write(
            &summary_file_path,
            serde_json::to_string_pretty(&summary).expect("summary should serialize"),
        )
        .expect("summary should be writable");
        println!(
            "fixvox_audio_prep_smoke_summary={}",
            normalize_path(&summary_path)
        );
        assert!(matches!(response, HostTranscriptionResponse::Ok { .. }));
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
            post_process: None,
        }
    }
}
