#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub(crate) const PREFERRED_FIXVOX_BACKEND_URL: &str = "https://auth-fixvox.jpsala.dev";
pub(crate) const STALE_FIXVOX_BACKEND_URL: &str = "https://fixvox-api.jpsala.dev";
pub(crate) const FIXVOX_TAURI_USER_AGENT: &str =
    concat!("fixvox-tauri/", env!("CARGO_PKG_VERSION"));

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct FixvoxCloudConfig {
    pub(crate) backend_base_url: String,
    pub(crate) device_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct FixvoxCloudRuntimeConfig {
    pub(crate) backend_base_url: String,
    pub(crate) install_id: String,
    pub(crate) device_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixvoxCloudError {
    pub(crate) code: String,
    pub(crate) message: String,
    pub(crate) redacted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixvoxPolicyCapabilities {
    pub(crate) can_use_managed_transcription: bool,
    pub(crate) can_see_advanced_settings: bool,
    pub(crate) can_use_debug_tools: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixvoxPolicySnapshot {
    pub(crate) policy_id: Option<String>,
    pub(crate) policy_label: Option<String>,
    pub(crate) features: Option<serde_json::Value>,
    pub(crate) capabilities: FixvoxPolicyCapabilities,
    pub(crate) transport_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) runtime_policy: Option<serde_json::Value>,
    pub(crate) fetched_at: String,
    pub(crate) trust: String,
    pub(crate) stale: bool,
    pub(crate) error: Option<FixvoxCloudError>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixvoxCloudStatus {
    pub(crate) backend_base_url: String,
    pub(crate) state_path: String,
    pub(crate) install_id_present: bool,
    pub(crate) install_id_redacted: Option<String>,
    pub(crate) device_registered: bool,
    pub(crate) device_id_redacted: Option<String>,
    pub(crate) last_register_ok: bool,
    pub(crate) last_register_error_code: Option<String>,
    pub(crate) last_register_error_message: Option<String>,
    pub(crate) policy_id: Option<String>,
    pub(crate) policy_label: Option<String>,
    pub(crate) transport_policy: Option<serde_json::Value>,
    pub(crate) policy_snapshot: Option<FixvoxPolicySnapshot>,
    pub(crate) capabilities: FixvoxPolicyCapabilities,
    pub(crate) redacted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeviceRegisterRequest {
    pub(crate) install_id: String,
    pub(crate) device_id: Option<String>,
    pub(crate) version: String,
    pub(crate) platform: String,
    pub(crate) arch: String,
    pub(crate) hostname: String,
    pub(crate) ts: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct DeviceRegisterInput {
    pub(crate) install_id: String,
    pub(crate) device_id: Option<String>,
    pub(crate) version: String,
    pub(crate) platform: String,
    pub(crate) arch: String,
    pub(crate) hostname: String,
    pub(crate) ts: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeviceActivateRequest {
    pub(crate) install_id: String,
    pub(crate) device_id: Option<String>,
    pub(crate) invite_code: String,
    pub(crate) version: String,
    pub(crate) platform: String,
    pub(crate) arch: String,
    pub(crate) hostname: String,
    pub(crate) ts: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct DeviceActivateInput {
    pub(crate) install_id: String,
    pub(crate) device_id: Option<String>,
    pub(crate) invite_code: String,
    pub(crate) version: String,
    pub(crate) platform: String,
    pub(crate) arch: String,
    pub(crate) hostname: String,
    pub(crate) ts: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeviceRegisterResponseFixture {
    pub(crate) ok: bool,
    pub(crate) device_id: String,
    pub(crate) activated: bool,
    pub(crate) policy_id: String,
    pub(crate) policy_label: String,
    pub(crate) auth: serde_json::Value,
    pub(crate) features: serde_json::Value,
    pub(crate) defaults: serde_json::Value,
    pub(crate) limits: serde_json::Value,
    pub(crate) telemetry: serde_json::Value,
    pub(crate) transport_policy: serde_json::Value,
    #[serde(default)]
    pub(crate) transcript: Option<serde_json::Value>,
    #[serde(default)]
    pub(crate) voice_policy: Option<serde_json::Value>,
    #[serde(default)]
    pub(crate) voice_routing: Option<serde_json::Value>,
    #[serde(default)]
    pub(crate) speech: Option<serde_json::Value>,
    #[serde(default)]
    pub(crate) prompts: Option<serde_json::Value>,
    #[serde(default)]
    pub(crate) user_settings_defaults: Option<serde_json::Value>,
}

pub(crate) type DeviceRegisterSnapshot = DeviceRegisterResponseFixture;

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeviceActivateResponseFixture {
    pub(crate) ok: bool,
    pub(crate) device_id: String,
    pub(crate) activated: bool,
    pub(crate) policy_id: String,
    pub(crate) policy_label: String,
}

pub(crate) type DeviceActivateSnapshot = DeviceActivateResponseFixture;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixvoxDeviceState {
    pub(crate) install_id: String,
    pub(crate) device_id: Option<String>,
    pub(crate) last_register_ok: bool,
    pub(crate) last_register_error_code: Option<String>,
    pub(crate) last_register_error_message: Option<String>,
    pub(crate) policy_id: Option<String>,
    pub(crate) policy_label: Option<String>,
    pub(crate) transport_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) policy_snapshot: Option<FixvoxPolicySnapshot>,
}

pub(crate) trait DeviceRegisterHttpClient {
    fn post_json(
        &self,
        endpoint: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, FixvoxCloudError>;
}

pub(crate) fn fixvox_http_client() -> Result<reqwest::Client, FixvoxCloudError> {
    reqwest::Client::builder()
        .user_agent(FIXVOX_TAURI_USER_AGENT)
        .build()
        .map_err(|_| {
            error(
                "FIXVOX_HTTP_CLIENT_FAILED",
                "Fixvox HTTP client could not be initialized.",
            )
        })
}

pub(crate) trait PreflightHttpClient {
    fn post_json(
        &self,
        endpoint: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, FixvoxCloudError>;
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreflightRequest {
    pub(crate) mode: String,
    pub(crate) device_id: String,
    pub(crate) install_id: String,
    pub(crate) usage_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) estimate: Option<serde_json::Value>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct PreflightInput {
    pub(crate) install_id: String,
    pub(crate) device_id: String,
    pub(crate) usage_kind: String,
    pub(crate) estimated_audio_seconds: Option<u64>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PreflightDecision {
    pub(crate) ok: bool,
    pub(crate) allowed: bool,
    pub(crate) mode: Option<String>,
    pub(crate) usage_kind: Option<String>,
    pub(crate) request_id: Option<String>,
    pub(crate) deny_code: Option<String>,
    pub(crate) deny_message: Option<String>,
    pub(crate) limits: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreflightResponseFixture {
    pub(crate) ok: bool,
    pub(crate) allowed: bool,
    pub(crate) mode: String,
    pub(crate) usage_kind: String,
    pub(crate) request_id: String,
    pub(crate) limits: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SttResponseFixture {
    pub(crate) text: String,
    pub(crate) model: String,
    pub(crate) usage: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ChatCompletionResponseFixture {
    pub(crate) model: String,
    pub(crate) choices: Vec<ChatCompletionChoiceFixture>,
    pub(crate) usage: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ChatCompletionChoiceFixture {
    pub(crate) message: ChatCompletionMessageFixture,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ChatCompletionMessageFixture {
    pub(crate) content: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ManagedSttParsedResponse {
    pub(crate) text: String,
    pub(crate) model: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedSttResponseBody {
    text: Option<String>,
    model: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ManagedSttInput {
    pub(crate) audio_file_name: String,
    pub(crate) model: String,
    pub(crate) language: Option<String>,
    pub(crate) prompt: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ManagedSttRequestPreview {
    pub(crate) endpoint: String,
    pub(crate) headers: Vec<(String, String)>,
    pub(crate) has_authorization_header: bool,
    pub(crate) multipart_fields: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ManagedChatInput {
    pub(crate) transcript: String,
    pub(crate) system_prompt: String,
    pub(crate) model: String,
    pub(crate) max_tokens: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ManagedChatRequestPreview {
    pub(crate) endpoint: String,
    pub(crate) headers: Vec<(String, String)>,
    pub(crate) has_authorization_header: bool,
    pub(crate) body: serde_json::Value,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ManagedChatParsedResponse {
    pub(crate) output: String,
    pub(crate) model: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ManagedChatResponseBody {
    model: Option<String>,
    choices: Vec<ManagedChatChoiceBody>,
}

#[derive(Debug, Deserialize)]
struct ManagedChatChoiceBody {
    message: ManagedChatMessageBody,
}

#[derive(Debug, Deserialize)]
struct ManagedChatMessageBody {
    content: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct TranscriptionTransportRequest {
    pub(crate) requested_mode: String,
    pub(crate) managed_ready: bool,
    pub(crate) direct_ready: bool,
    pub(crate) direct_fallback_requested: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum TranscriptionTransport {
    ManagedCloud,
    DirectByok,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct FixvoxResponseMetadata {
    pub(crate) fixvox_request_id: Option<String>,
    pub(crate) provider_request_id: Option<String>,
    pub(crate) cost_usd: Option<String>,
    pub(crate) pricing_source: Option<String>,
    pub(crate) limit: Option<u64>,
    pub(crate) remaining: Option<u64>,
    pub(crate) reset_at: Option<String>,
    pub(crate) usage_key: Option<String>,
    pub(crate) proxy_parse_ms: Option<u64>,
    pub(crate) proxy_usage_ms: Option<u64>,
    pub(crate) proxy_upstream_ms: Option<u64>,
    pub(crate) proxy_init_ms: Option<u64>,
    pub(crate) proxy_total_ms: Option<u64>,
    pub(crate) server_timing: Option<String>,
}

pub(crate) fn resolve_backend_base_url(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<String, FixvoxCloudError> {
    for key in [
        "FIXVOX_BACKEND_URL",
        "FIXVOX_API_BASE_URL",
        "PROXY_BASE_URL",
    ] {
        if let Some(value) = clean_env_value(env_lookup(key)) {
            let normalized = trim_trailing_slashes(&value);
            if normalized == STALE_FIXVOX_BACKEND_URL {
                return Err(error(
                    "FIXVOX_BACKEND_URL_STALE",
                    "Configured Fixvox backend URL is stale; use the current auth/proxy backend.",
                ));
            }
            return Ok(normalized);
        }
    }

    Ok(PREFERRED_FIXVOX_BACKEND_URL.to_string())
}

pub(crate) fn resolve_cloud_runtime_config(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<FixvoxCloudRuntimeConfig, FixvoxCloudError> {
    let backend_base_url = resolve_backend_base_url(env_lookup)?;
    let install_id = clean_env_value(env_lookup("FIXVOX_INSTALL_ID")).ok_or_else(|| {
        error(
            "FIXVOX_INSTALL_ID_MISSING",
            "Fixvox cloud install id is required for device registration.",
        )
    })?;
    let device_id = clean_env_value(env_lookup("FIXVOX_DEVICE_ID"));

    Ok(FixvoxCloudRuntimeConfig {
        backend_base_url,
        install_id,
        device_id,
    })
}

pub(crate) fn build_device_register_request(
    input: DeviceRegisterInput,
) -> Result<DeviceRegisterRequest, FixvoxCloudError> {
    if input.install_id.trim().is_empty() {
        return Err(error(
            "FIXVOX_INSTALL_ID_MISSING",
            "Fixvox device registration requires an install id.",
        ));
    }

    Ok(DeviceRegisterRequest {
        install_id: input.install_id.trim().to_string(),
        device_id: input
            .device_id
            .and_then(|value| clean_env_value(Some(value))),
        version: input.version.trim().to_string(),
        platform: input.platform.trim().to_string(),
        arch: input.arch.trim().to_string(),
        hostname: input.hostname.trim().to_string(),
        ts: input.ts.trim().to_string(),
    })
}

pub(crate) fn build_device_activate_request(
    input: DeviceActivateInput,
) -> Result<DeviceActivateRequest, FixvoxCloudError> {
    let invite_code = clean_env_value(Some(input.invite_code)).ok_or_else(|| {
        error(
            "FIXVOX_INVITE_CODE_MISSING",
            "Fixvox activation requires an invite code.",
        )
    })?;

    if input.install_id.trim().is_empty() {
        return Err(error(
            "FIXVOX_INSTALL_ID_MISSING",
            "Fixvox activation requires an install id.",
        ));
    }

    Ok(DeviceActivateRequest {
        install_id: input.install_id.trim().to_string(),
        device_id: input
            .device_id
            .and_then(|value| clean_env_value(Some(value))),
        invite_code,
        version: input.version.trim().to_string(),
        platform: input.platform.trim().to_string(),
        arch: input.arch.trim().to_string(),
        hostname: input.hostname.trim().to_string(),
        ts: input.ts.trim().to_string(),
    })
}

pub(crate) fn register_device_with_client(
    client: &dyn DeviceRegisterHttpClient,
    config: &FixvoxCloudRuntimeConfig,
    input: DeviceRegisterInput,
) -> Result<DeviceRegisterSnapshot, FixvoxCloudError> {
    post_device_snapshot_with_client(
        client,
        &join_url(&config.backend_base_url, "/v2/device/register"),
        serde_json::to_value(build_device_register_request(input)?).map_err(|_| {
            error(
                "FIXVOX_DEVICE_REGISTER_SERIALIZE_FAILED",
                "Fixvox device register request could not be serialized.",
            )
        })?,
        "FIXVOX_DEVICE_REGISTER_RESPONSE_INVALID",
    )
}

pub(crate) fn activate_device_with_client(
    client: &dyn DeviceRegisterHttpClient,
    config: &FixvoxCloudRuntimeConfig,
    input: DeviceActivateInput,
) -> Result<DeviceActivateSnapshot, FixvoxCloudError> {
    post_device_activation_with_client(
        client,
        &join_url(&config.backend_base_url, "/v2/device/activate"),
        serde_json::to_value(build_device_activate_request(input)?).map_err(|_| {
            error(
                "FIXVOX_DEVICE_ACTIVATE_SERIALIZE_FAILED",
                "Fixvox device activation request could not be serialized.",
            )
        })?,
    )
}

fn post_device_snapshot_with_client(
    client: &dyn DeviceRegisterHttpClient,
    endpoint: &str,
    body: serde_json::Value,
    invalid_code: &str,
) -> Result<DeviceRegisterSnapshot, FixvoxCloudError> {
    let response = client.post_json(endpoint, body)?;

    serde_json::from_value(response).map_err(|_| {
        error(
            invalid_code,
            "Fixvox device response did not match the expected contract.",
        )
    })
}

fn post_device_activation_with_client(
    client: &dyn DeviceRegisterHttpClient,
    endpoint: &str,
    body: serde_json::Value,
) -> Result<DeviceActivateSnapshot, FixvoxCloudError> {
    let response = client.post_json(endpoint, body)?;

    serde_json::from_value(response).map_err(|_| {
        error(
            "FIXVOX_DEVICE_ACTIVATE_RESPONSE_INVALID",
            "Fixvox device activation response did not match the expected contract.",
        )
    })
}

pub(crate) fn build_preflight_request(
    input: PreflightInput,
) -> Result<PreflightRequest, FixvoxCloudError> {
    let install_id = clean_env_value(Some(input.install_id)).ok_or_else(|| {
        error(
            "FIXVOX_INSTALL_ID_MISSING",
            "Fixvox managed preflight requires an install id.",
        )
    })?;
    let device_id = clean_env_value(Some(input.device_id)).ok_or_else(|| {
        error(
            "FIXVOX_DEVICE_ID_MISSING",
            "Fixvox managed preflight requires a registered device id.",
        )
    })?;
    let usage_kind =
        clean_env_value(Some(input.usage_kind)).unwrap_or_else(|| "transcription".to_string());
    let estimate = input.estimated_audio_seconds.map(|seconds| {
        serde_json::json!({
            "audioSeconds": seconds,
        })
    });

    Ok(PreflightRequest {
        mode: "managed".to_string(),
        device_id,
        install_id,
        usage_kind,
        estimate,
    })
}

pub(crate) fn preflight_endpoint(base_url: &str) -> String {
    join_url(base_url, "/v2/execution/preflight")
}

pub(crate) fn preflight_with_client(
    client: &dyn PreflightHttpClient,
    config: &FixvoxCloudRuntimeConfig,
    input: PreflightInput,
) -> Result<PreflightDecision, FixvoxCloudError> {
    let endpoint = preflight_endpoint(&config.backend_base_url);
    let request = build_preflight_request(input)?;
    let body = serde_json::to_value(request).map_err(|_| {
        error(
            "FIXVOX_PREFLIGHT_SERIALIZE_FAILED",
            "Fixvox preflight request could not be serialized.",
        )
    })?;
    let response = client.post_json(&endpoint, body)?;

    parse_preflight_decision(response)
}

pub(crate) fn parse_preflight_decision(
    value: serde_json::Value,
) -> Result<PreflightDecision, FixvoxCloudError> {
    Ok(PreflightDecision {
        ok: value
            .get("ok")
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
        allowed: value
            .get("allowed")
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
        mode: value
            .get("mode")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()),
        usage_kind: value
            .get("usageKind")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()),
        request_id: value
            .get("requestId")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()),
        deny_code: value
            .get("denyCode")
            .or_else(|| value.get("code"))
            .or_else(|| value.get("reason"))
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()),
        deny_message: value
            .get("message")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()),
        limits: value.get("limits").cloned(),
    })
}

pub(crate) fn preflight_denial_error_code(decision: &PreflightDecision) -> String {
    match decision
        .deny_code
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "device_not_registered" => "FIXVOX_DEVICE_NOT_REGISTERED".to_string(),
        "auth_required" => "FIXVOX_AUTH_REQUIRED".to_string(),
        "policy_blocked" => "FIXVOX_POLICY_BLOCKED".to_string(),
        "quota_exceeded" => "FIXVOX_QUOTA_EXCEEDED".to_string(),
        "service_unavailable" => "FIXVOX_SERVICE_UNAVAILABLE".to_string(),
        _ => "FIXVOX_PREFLIGHT_DENIED".to_string(),
    }
}

pub(crate) fn resolve_device_state_path(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<PathBuf, FixvoxCloudError> {
    let base = clean_env_value(env_lookup("APPDATA"))
        .or_else(|| clean_env_value(env_lookup("LOCALAPPDATA")))
        .or_else(|| clean_env_value(env_lookup("XDG_DATA_HOME")))
        .or_else(|| clean_env_value(env_lookup("HOME")))
        .ok_or_else(|| {
            error(
                "FIXVOX_DEVICE_STATE_ROOT_MISSING",
                "No local app data directory is available for Fixvox device state.",
            )
        })?;

    Ok(PathBuf::from(base)
        .join("dictation-tauri")
        .join("fixvox-device-state.json"))
}

pub(crate) fn build_device_state_from_register(
    config: &FixvoxCloudRuntimeConfig,
    snapshot: &DeviceRegisterSnapshot,
) -> FixvoxDeviceState {
    let policy_snapshot = build_policy_snapshot_from_register(snapshot);
    FixvoxDeviceState {
        install_id: config.install_id.clone(),
        device_id: Some(snapshot.device_id.clone()),
        last_register_ok: snapshot.ok,
        last_register_error_code: None,
        last_register_error_message: None,
        policy_id: Some(snapshot.policy_id.clone()),
        policy_label: Some(snapshot.policy_label.clone()),
        transport_policy: Some(snapshot.transport_policy.clone()),
        policy_snapshot: Some(policy_snapshot),
    }
}

pub(crate) fn build_device_state_from_register_error(
    config: &FixvoxCloudRuntimeConfig,
    register_error: &FixvoxCloudError,
) -> FixvoxDeviceState {
    FixvoxDeviceState {
        install_id: config.install_id.clone(),
        device_id: config.device_id.clone(),
        last_register_ok: false,
        last_register_error_code: Some(register_error.code.clone()),
        last_register_error_message: Some(register_error.message.clone()),
        policy_id: None,
        policy_label: None,
        transport_policy: None,
        policy_snapshot: Some(build_policy_snapshot_from_error(register_error)),
    }
}

pub(crate) fn build_device_state_from_activate(
    config: &FixvoxCloudRuntimeConfig,
    snapshot: &DeviceActivateSnapshot,
) -> FixvoxDeviceState {
    FixvoxDeviceState {
        install_id: config.install_id.clone(),
        device_id: Some(snapshot.device_id.clone()),
        last_register_ok: snapshot.ok,
        last_register_error_code: None,
        last_register_error_message: None,
        policy_id: Some(snapshot.policy_id.clone()),
        policy_label: Some(snapshot.policy_label.clone()),
        transport_policy: None,
        policy_snapshot: Some(build_policy_snapshot_from_activation(snapshot)),
    }
}

pub(crate) fn build_initial_device_state(
    config: &FixvoxCloudRuntimeConfig,
    previous: Option<FixvoxDeviceState>,
) -> FixvoxDeviceState {
    let previous_policy = previous.as_ref();
    let policy_id = previous_policy.and_then(|state| state.policy_id.clone());
    let policy_label = previous_policy.and_then(|state| state.policy_label.clone());
    let transport_policy = previous_policy.and_then(|state| state.transport_policy.clone());
    let policy_snapshot = previous_policy
        .and_then(|state| state.policy_snapshot.clone())
        .or_else(|| {
            build_policy_snapshot_from_legacy_state(
                policy_id.clone(),
                policy_label.clone(),
                transport_policy.clone(),
                previous_policy
                    .map(|state| state.last_register_ok)
                    .unwrap_or(false),
                previous_policy.and_then(|state| {
                    state
                        .last_register_error_code
                        .clone()
                        .zip(state.last_register_error_message.clone())
                }),
            )
        });

    FixvoxDeviceState {
        install_id: config.install_id.clone(),
        device_id: config
            .device_id
            .clone()
            .or_else(|| previous_policy.and_then(|state| state.device_id.clone())),
        last_register_ok: previous_policy
            .map(|state| state.last_register_ok)
            .unwrap_or(false),
        last_register_error_code: previous_policy
            .and_then(|state| state.last_register_error_code.clone()),
        last_register_error_message: previous_policy
            .and_then(|state| state.last_register_error_message.clone()),
        policy_id,
        policy_label,
        transport_policy,
        policy_snapshot,
    }
}

pub(crate) fn build_policy_snapshot_from_register(
    snapshot: &DeviceRegisterSnapshot,
) -> FixvoxPolicySnapshot {
    let policy_id = clean_env_value(Some(snapshot.policy_id.clone()));
    let policy_label = clean_env_value(Some(snapshot.policy_label.clone()));
    let features = Some(snapshot.features.clone());
    let transport_policy = Some(snapshot.transport_policy.clone());
    FixvoxPolicySnapshot {
        capabilities: derive_policy_capabilities(
            policy_id.as_deref(),
            features.as_ref(),
            transport_policy.as_ref(),
        ),
        runtime_policy: Some(build_runtime_policy_from_register(snapshot)),
        policy_id,
        policy_label,
        features,
        transport_policy,
        fetched_at: current_unix_timestamp_string(),
        trust: if snapshot.ok { "fresh" } else { "error" }.to_string(),
        stale: false,
        error: None,
    }
}

fn build_runtime_policy_from_register(snapshot: &DeviceRegisterSnapshot) -> serde_json::Value {
    let mut policy = serde_json::Map::new();
    policy.insert(
        "policyId".to_string(),
        serde_json::Value::String(snapshot.policy_id.clone()),
    );
    policy.insert(
        "policyLabel".to_string(),
        serde_json::Value::String(snapshot.policy_label.clone()),
    );
    policy.insert("features".to_string(), snapshot.features.clone());
    policy.insert("defaults".to_string(), snapshot.defaults.clone());
    policy.insert(
        "transportPolicy".to_string(),
        snapshot.transport_policy.clone(),
    );

    if let Some(value) = snapshot.transcript.clone() {
        policy.insert("transcript".to_string(), value);
    }
    if let Some(value) = snapshot.voice_policy.clone() {
        policy.insert("voicePolicy".to_string(), value);
    }
    if let Some(value) = snapshot.voice_routing.clone() {
        policy.insert("voiceRouting".to_string(), value);
    }
    if let Some(value) = snapshot.speech.clone() {
        policy.insert("speech".to_string(), value);
    }
    if let Some(value) = snapshot.prompts.clone() {
        policy.insert("prompts".to_string(), value);
    }
    if let Some(value) = snapshot.user_settings_defaults.clone() {
        policy.insert("userSettingsDefaults".to_string(), value);
    }

    serde_json::Value::Object(policy)
}

pub(crate) fn build_policy_snapshot_from_activation(
    snapshot: &DeviceActivateSnapshot,
) -> FixvoxPolicySnapshot {
    let policy_id = clean_env_value(Some(snapshot.policy_id.clone()));
    let policy_label = clean_env_value(Some(snapshot.policy_label.clone()));
    FixvoxPolicySnapshot {
        capabilities: derive_policy_capabilities(policy_id.as_deref(), None, None),
        policy_id,
        policy_label,
        features: None,
        transport_policy: None,
        runtime_policy: None,
        fetched_at: current_unix_timestamp_string(),
        trust: "activation-pending-refresh".to_string(),
        stale: true,
        error: None,
    }
}

pub(crate) fn build_policy_snapshot_from_error(
    register_error: &FixvoxCloudError,
) -> FixvoxPolicySnapshot {
    FixvoxPolicySnapshot {
        policy_id: None,
        policy_label: None,
        features: None,
        capabilities: default_policy_capabilities(),
        transport_policy: None,
        runtime_policy: None,
        fetched_at: current_unix_timestamp_string(),
        trust: "error".to_string(),
        stale: true,
        error: Some(register_error.clone()),
    }
}

fn build_policy_snapshot_from_legacy_state(
    policy_id: Option<String>,
    policy_label: Option<String>,
    transport_policy: Option<serde_json::Value>,
    last_register_ok: bool,
    register_error: Option<(String, String)>,
) -> Option<FixvoxPolicySnapshot> {
    if policy_id.is_none() && transport_policy.is_none() && register_error.is_none() {
        return None;
    }

    let error = register_error.map(|(code, message)| FixvoxCloudError {
        code,
        message,
        redacted: true,
    });

    Some(FixvoxPolicySnapshot {
        capabilities: if last_register_ok {
            derive_policy_capabilities(policy_id.as_deref(), None, transport_policy.as_ref())
        } else {
            default_policy_capabilities()
        },
        policy_id,
        policy_label,
        features: None,
        runtime_policy: transport_policy.clone(),
        transport_policy,
        fetched_at: current_unix_timestamp_string(),
        trust: if last_register_ok { "legacy" } else { "error" }.to_string(),
        stale: !last_register_ok,
        error,
    })
}

pub(crate) fn default_policy_capabilities() -> FixvoxPolicyCapabilities {
    FixvoxPolicyCapabilities {
        can_use_managed_transcription: false,
        can_see_advanced_settings: false,
        can_use_debug_tools: false,
    }
}

pub(crate) fn derive_policy_capabilities(
    policy_id: Option<&str>,
    features: Option<&serde_json::Value>,
    transport_policy: Option<&serde_json::Value>,
) -> FixvoxPolicyCapabilities {
    let normalized_policy = policy_id.unwrap_or_default().trim().to_ascii_lowercase();
    let explicit_managed =
        feature_bool(features, &["managedTranscription", "managed_transcription"]).or_else(|| {
            feature_bool(
                features,
                &[
                    "canUseManagedTranscription",
                    "can_use_managed_transcription",
                ],
            )
        });
    let managed_by_transport = transport_policy
        .map(|policy| policy_mentions(policy, &["proxied", "managed", "fixvox-cloud", "groq"]))
        .unwrap_or(false)
        && !transport_policy
            .map(|policy| policy_mentions(policy, &["disabled", "deny", "blocked"]))
            .unwrap_or(false);
    let can_use_managed_transcription = explicit_managed.unwrap_or_else(|| {
        managed_by_transport
            || matches!(
                normalized_policy.as_str(),
                "alpha-basic" | "alpha-full" | "pro"
            )
    });

    let can_see_advanced_settings =
        feature_bool(features, &["advancedSettings", "advanced_settings"])
            .unwrap_or_else(|| matches!(normalized_policy.as_str(), "alpha-full" | "pro"));
    let can_use_debug_tools =
        feature_bool(features, &["debugTools", "debug_tools"]).unwrap_or(false);

    FixvoxPolicyCapabilities {
        can_use_managed_transcription,
        can_see_advanced_settings,
        can_use_debug_tools,
    }
}

pub(crate) fn policy_allows_managed_transcription(
    state: &FixvoxDeviceState,
) -> Result<(), FixvoxCloudError> {
    if !state.last_register_ok {
        return Err(error(
            "FIXVOX_POLICY_UNTRUSTED",
            "Fixvox policy is not confirmed; refresh or activate the device before managed transcription.",
        ));
    }

    let Some(snapshot) = state.policy_snapshot.as_ref() else {
        let legacy_capabilities = derive_policy_capabilities(
            state.policy_id.as_deref(),
            None,
            state.transport_policy.as_ref(),
        );
        if legacy_capabilities.can_use_managed_transcription {
            return Ok(());
        }
        return Err(error(
            "FIXVOX_POLICY_MISSING",
            "Fixvox policy snapshot is missing; refresh policy before managed transcription.",
        ));
    };

    if snapshot.stale || snapshot.error.is_some() || snapshot.trust == "error" {
        return Err(error(
            "FIXVOX_POLICY_STALE",
            "Fixvox policy snapshot is stale or failed; refresh policy before managed transcription.",
        ));
    }

    if !snapshot.capabilities.can_use_managed_transcription {
        return Err(error(
            "FIXVOX_MANAGED_TRANSCRIPTION_DISABLED",
            "Fixvox policy does not allow managed transcription for this device.",
        ));
    }

    Ok(())
}

fn feature_bool(features: Option<&serde_json::Value>, keys: &[&str]) -> Option<bool> {
    let features = features?;
    for key in keys {
        if let Some(value) = features.get(*key).and_then(|value| value.as_bool()) {
            return Some(value);
        }
        if let Some(value) = features
            .get("capabilities")
            .and_then(|capabilities| capabilities.get(*key))
            .and_then(|value| value.as_bool())
        {
            return Some(value);
        }
    }
    None
}

fn policy_mentions(value: &serde_json::Value, needles: &[&str]) -> bool {
    let haystack = value.to_string().to_ascii_lowercase();
    needles.iter().any(|needle| haystack.contains(needle))
}

pub(crate) fn persist_device_state(
    path: &Path,
    state: &FixvoxDeviceState,
) -> Result<(), FixvoxCloudError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| {
            error(
                "FIXVOX_DEVICE_STATE_WRITE_FAILED",
                "Fixvox device state directory could not be created.",
            )
        })?;
    }

    let body = serde_json::to_string_pretty(state).map_err(|_| {
        error(
            "FIXVOX_DEVICE_STATE_SERIALIZE_FAILED",
            "Fixvox device state could not be serialized.",
        )
    })?;

    std::fs::write(path, body).map_err(|_| {
        error(
            "FIXVOX_DEVICE_STATE_WRITE_FAILED",
            "Fixvox device state could not be written.",
        )
    })
}

pub(crate) fn read_device_state(
    path: &Path,
) -> Result<Option<FixvoxDeviceState>, FixvoxCloudError> {
    if !path.exists() {
        return Ok(None);
    }

    let body = std::fs::read_to_string(path).map_err(|_| {
        error(
            "FIXVOX_DEVICE_STATE_READ_FAILED",
            "Fixvox device state could not be read.",
        )
    })?;

    serde_json::from_str(&body).map(Some).map_err(|_| {
        error(
            "FIXVOX_DEVICE_STATE_INVALID",
            "Fixvox device state did not match the expected contract.",
        )
    })
}

pub(crate) fn get_fixvox_cloud_status_with_env(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    let (path, state, backend_base_url) = resolve_or_create_device_state(env_lookup)?;
    Ok(build_cloud_status(path, state, backend_base_url))
}

pub(crate) fn register_fixvox_device_with_client_and_env(
    client: &dyn DeviceRegisterHttpClient,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    register_or_refresh_device_with_client(client, env_lookup)
}

pub(crate) fn refresh_fixvox_policy_with_client_and_env(
    client: &dyn DeviceRegisterHttpClient,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    register_or_refresh_device_with_client(client, env_lookup)
}

pub(crate) fn activate_fixvox_device_with_client_and_env(
    client: &dyn DeviceRegisterHttpClient,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
    invite_code: String,
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    activate_device_with_client_and_env(client, env_lookup, invite_code)
}

#[tauri::command]
pub fn get_fixvox_cloud_status() -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    get_fixvox_cloud_status_with_env(&read_env_value)
}

#[tauri::command]
pub async fn register_fixvox_device() -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    register_or_refresh_device_with_reqwest(&read_env_value).await
}

#[tauri::command]
pub async fn refresh_fixvox_policy() -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    register_or_refresh_device_with_reqwest(&read_env_value).await
}

#[tauri::command]
pub async fn activate_fixvox_device(
    invite_code: String,
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    activate_device_with_reqwest(&read_env_value, invite_code).await
}

fn register_or_refresh_device_with_client(
    client: &dyn DeviceRegisterHttpClient,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    let (path, state, backend_base_url) = resolve_or_create_device_state(env_lookup)?;
    let config = FixvoxCloudRuntimeConfig {
        backend_base_url,
        install_id: state.install_id.clone(),
        device_id: state.device_id.clone(),
    };
    let input = build_device_register_input(&config, env_lookup);
    let snapshot = match register_device_with_client(client, &config, input) {
        Ok(snapshot) => snapshot,
        Err(register_error) => {
            let error_state = build_device_state_from_register_error(&config, &register_error);
            persist_device_state(&path, &error_state)?;
            return Err(register_error);
        }
    };
    let next_state = build_device_state_from_register(&config, &snapshot);
    persist_device_state(&path, &next_state)?;

    Ok(build_cloud_status(
        path,
        next_state,
        config.backend_base_url.clone(),
    ))
}

fn activate_device_with_client_and_env(
    client: &dyn DeviceRegisterHttpClient,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
    invite_code: String,
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    let (path, state, backend_base_url) = resolve_or_create_device_state(env_lookup)?;
    let config = FixvoxCloudRuntimeConfig {
        backend_base_url,
        install_id: state.install_id.clone(),
        device_id: state.device_id.clone(),
    };
    let input = build_device_activate_input(&config, env_lookup, invite_code);
    let activation = activate_device_with_client(client, &config, input)?;
    let activated_config = FixvoxCloudRuntimeConfig {
        backend_base_url: config.backend_base_url.clone(),
        install_id: config.install_id.clone(),
        device_id: Some(activation.device_id.clone()),
    };
    let activation_state = build_device_state_from_activate(&activated_config, &activation);
    persist_device_state(&path, &activation_state)?;

    let register_input = build_device_register_input(&activated_config, env_lookup);
    let snapshot = match register_device_with_client(client, &activated_config, register_input) {
        Ok(snapshot) => snapshot,
        Err(register_error) => {
            let error_state =
                build_device_state_from_register_error(&activated_config, &register_error);
            persist_device_state(&path, &error_state)?;
            return Err(register_error);
        }
    };
    let next_state = build_device_state_from_register(&activated_config, &snapshot);
    persist_device_state(&path, &next_state)?;

    Ok(build_cloud_status(
        path,
        next_state,
        activated_config.backend_base_url.clone(),
    ))
}

async fn register_or_refresh_device_with_reqwest(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    let (path, state, backend_base_url) = resolve_or_create_device_state(env_lookup)?;
    let config = FixvoxCloudRuntimeConfig {
        backend_base_url,
        install_id: state.install_id.clone(),
        device_id: state.device_id.clone(),
    };
    let input = build_device_register_input(&config, env_lookup);
    let snapshot = match register_device_with_reqwest(&config, input).await {
        Ok(snapshot) => snapshot,
        Err(register_error) => {
            let error_state = build_device_state_from_register_error(&config, &register_error);
            persist_device_state(&path, &error_state)?;
            return Err(register_error);
        }
    };
    let next_state = build_device_state_from_register(&config, &snapshot);
    persist_device_state(&path, &next_state)?;

    Ok(build_cloud_status(
        path,
        next_state,
        config.backend_base_url.clone(),
    ))
}

async fn activate_device_with_reqwest(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
    invite_code: String,
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    let (path, state, backend_base_url) = resolve_or_create_device_state(env_lookup)?;
    let config = FixvoxCloudRuntimeConfig {
        backend_base_url,
        install_id: state.install_id.clone(),
        device_id: state.device_id.clone(),
    };
    let input = build_device_activate_input(&config, env_lookup, invite_code);
    let activation = activate_device_with_reqwest_request(&config, input).await?;
    let activated_config = FixvoxCloudRuntimeConfig {
        backend_base_url: config.backend_base_url.clone(),
        install_id: config.install_id.clone(),
        device_id: Some(activation.device_id.clone()),
    };
    let activation_state = build_device_state_from_activate(&activated_config, &activation);
    persist_device_state(&path, &activation_state)?;

    let register_input = build_device_register_input(&activated_config, env_lookup);
    let snapshot = match register_device_with_reqwest(&activated_config, register_input).await {
        Ok(snapshot) => snapshot,
        Err(register_error) => {
            let error_state =
                build_device_state_from_register_error(&activated_config, &register_error);
            persist_device_state(&path, &error_state)?;
            return Err(register_error);
        }
    };
    let next_state = build_device_state_from_register(&activated_config, &snapshot);
    persist_device_state(&path, &next_state)?;

    Ok(build_cloud_status(
        path,
        next_state,
        activated_config.backend_base_url.clone(),
    ))
}

async fn register_device_with_reqwest(
    config: &FixvoxCloudRuntimeConfig,
    input: DeviceRegisterInput,
) -> Result<DeviceRegisterSnapshot, FixvoxCloudError> {
    let endpoint = join_url(&config.backend_base_url, "/v2/device/register");
    let body = serde_json::to_value(build_device_register_request(input)?).map_err(|_| {
        error(
            "FIXVOX_REGISTER_REQUEST_SERIALIZE_FAILED",
            "Fixvox device registration request could not be serialized.",
        )
    })?;

    post_device_snapshot_with_reqwest(
        endpoint,
        body,
        "FIXVOX_BACKEND_UNAVAILABLE",
        "Fixvox Cloud is unavailable for device registration.",
        "FIXVOX_REGISTER_FAILED",
        "Fixvox Cloud rejected device registration.",
        "FIXVOX_REGISTER_RESPONSE_INVALID",
    )
    .await
}

async fn activate_device_with_reqwest_request(
    config: &FixvoxCloudRuntimeConfig,
    input: DeviceActivateInput,
) -> Result<DeviceActivateSnapshot, FixvoxCloudError> {
    let endpoint = join_url(&config.backend_base_url, "/v2/device/activate");
    let body = serde_json::to_value(build_device_activate_request(input)?).map_err(|_| {
        error(
            "FIXVOX_ACTIVATE_REQUEST_SERIALIZE_FAILED",
            "Fixvox device activation request could not be serialized.",
        )
    })?;

    post_device_activation_with_reqwest(
        endpoint,
        body,
        "FIXVOX_BACKEND_UNAVAILABLE",
        "Fixvox Cloud is unavailable for device activation.",
        "FIXVOX_ACTIVATE_FAILED",
        "Fixvox Cloud rejected device activation.",
    )
    .await
}

async fn post_device_snapshot_with_reqwest(
    endpoint: String,
    body: serde_json::Value,
    unavailable_code: &str,
    unavailable_message: &str,
    rejected_code: &str,
    rejected_message: &str,
    invalid_response_code: &str,
) -> Result<DeviceRegisterSnapshot, FixvoxCloudError> {
    let response = fixvox_http_client()?
        .post(endpoint)
        .json(&body)
        .send()
        .await
        .map_err(|_| error(unavailable_code, unavailable_message))?;

    if !response.status().is_success() {
        return Err(error_from_response(response, rejected_code, rejected_message).await);
    }

    response
        .json::<DeviceRegisterSnapshot>()
        .await
        .map_err(|_| {
            error(
                invalid_response_code,
                "Fixvox Cloud device response was invalid.",
            )
        })
}

async fn post_device_activation_with_reqwest(
    endpoint: String,
    body: serde_json::Value,
    unavailable_code: &str,
    unavailable_message: &str,
    rejected_code: &str,
    rejected_message: &str,
) -> Result<DeviceActivateSnapshot, FixvoxCloudError> {
    let response = fixvox_http_client()?
        .post(endpoint)
        .json(&body)
        .send()
        .await
        .map_err(|_| error(unavailable_code, unavailable_message))?;

    if !response.status().is_success() {
        return Err(error_from_response(response, rejected_code, rejected_message).await);
    }

    response
        .json::<DeviceActivateSnapshot>()
        .await
        .map_err(|_| {
            error(
                "FIXVOX_ACTIVATE_RESPONSE_INVALID",
                "Fixvox Cloud device activation response was invalid.",
            )
        })
}

async fn error_from_response(
    response: reqwest::Response,
    code: &str,
    fallback_message: &str,
) -> FixvoxCloudError {
    let message = response
        .text()
        .await
        .ok()
        .and_then(|body| extract_cloud_error_message(&body))
        .unwrap_or_else(|| fallback_message.to_string());

    error(code, &message)
}

fn extract_cloud_error_message(body: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(body).ok()?;
    let message = parsed
        .pointer("/error/message")
        .and_then(|value| value.as_str())
        .or_else(|| parsed.get("error").and_then(|value| value.as_str()))?;
    clean_env_value(Some(message.to_string()))
}

fn resolve_or_create_device_state(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<(PathBuf, FixvoxDeviceState, String), FixvoxCloudError> {
    let path = resolve_device_state_path(env_lookup)?;
    let existing = read_device_state(&path)?;
    let backend_base_url = resolve_backend_base_url(env_lookup)?;
    let env_install_id = first_clean_env_value(env_lookup, &["FIXVOX_INSTALL_ID"]);
    let env_device_id = first_clean_env_value(env_lookup, &["FIXVOX_DEVICE_ID"]);

    let install_id = env_install_id
        .or_else(|| {
            existing
                .as_ref()
                .map(|state| state.install_id.clone())
                .filter(|value| !value.trim().is_empty())
        })
        .unwrap_or_else(generate_install_id);

    let config = FixvoxCloudRuntimeConfig {
        backend_base_url: backend_base_url.clone(),
        install_id,
        device_id: env_device_id
            .or_else(|| existing.as_ref().and_then(|state| state.device_id.clone())),
    };
    let state = build_initial_device_state(&config, existing);
    persist_device_state(&path, &state)?;

    Ok((path, state, backend_base_url))
}

fn build_cloud_status(
    path: PathBuf,
    state: FixvoxDeviceState,
    backend_base_url: String,
) -> FixvoxCloudStatus {
    let capabilities = state
        .policy_snapshot
        .as_ref()
        .map(|snapshot| snapshot.capabilities.clone())
        .unwrap_or_else(default_policy_capabilities);

    FixvoxCloudStatus {
        backend_base_url,
        state_path: path.to_string_lossy().to_string(),
        install_id_present: !state.install_id.trim().is_empty(),
        install_id_redacted: redact_identifier(Some(&state.install_id)),
        device_registered: state
            .device_id
            .as_ref()
            .map(|device_id| !device_id.trim().is_empty())
            .unwrap_or(false),
        device_id_redacted: redact_identifier(state.device_id.as_deref()),
        last_register_ok: state.last_register_ok,
        last_register_error_code: state.last_register_error_code,
        last_register_error_message: state.last_register_error_message,
        policy_id: state.policy_id,
        policy_label: state.policy_label,
        transport_policy: state.transport_policy,
        policy_snapshot: state.policy_snapshot,
        capabilities,
        redacted: true,
    }
}

fn build_device_register_input(
    config: &FixvoxCloudRuntimeConfig,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> DeviceRegisterInput {
    DeviceRegisterInput {
        install_id: config.install_id.clone(),
        device_id: config.device_id.clone(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        hostname: first_clean_env_value(env_lookup, &["COMPUTERNAME", "HOSTNAME"])
            .unwrap_or_else(|| "unknown".to_string()),
        ts: current_unix_timestamp_string(),
    }
}

fn build_device_activate_input(
    config: &FixvoxCloudRuntimeConfig,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
    invite_code: String,
) -> DeviceActivateInput {
    DeviceActivateInput {
        install_id: config.install_id.clone(),
        device_id: config.device_id.clone(),
        invite_code,
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        hostname: first_clean_env_value(env_lookup, &["COMPUTERNAME", "HOSTNAME"])
            .unwrap_or_else(|| "unknown".to_string()),
        ts: current_unix_timestamp_string(),
    }
}

fn generate_install_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("install_{now:x}_{:x}", std::process::id())
}

fn current_unix_timestamp_string() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("unix:{seconds}")
}

fn first_clean_env_value(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
    keys: &[&str],
) -> Option<String> {
    keys.iter().find_map(|key| clean_env_value(env_lookup(key)))
}

fn read_env_value(key: &str) -> Option<String> {
    std::env::var(key).ok()
}

fn redact_identifier(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }

    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= 8 {
        return Some("[redacted]".to_string());
    }

    let prefix: String = chars.iter().take(6).collect();
    let suffix: String = chars
        .iter()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    Some(format!("{prefix}…{suffix}"))
}

pub(crate) fn build_managed_stt_request_preview(
    config: FixvoxCloudConfig,
    input: ManagedSttInput,
) -> Result<ManagedSttRequestPreview, FixvoxCloudError> {
    let device_id = config
        .device_id
        .and_then(|value| clean_env_value(Some(value)))
        .ok_or_else(|| {
            error(
                "FIXVOX_DEVICE_ID_MISSING",
                "Managed Fixvox transcription requires a registered device id.",
            )
        })?;

    let mut multipart_fields = vec!["file".to_string(), "model".to_string()];
    if input
        .language
        .as_ref()
        .and_then(|value| clean_env_value(Some(value.clone())))
        .filter(|value| !value.eq_ignore_ascii_case("auto"))
        .is_some()
    {
        multipart_fields.push("language".to_string());
    }
    if input
        .prompt
        .as_ref()
        .and_then(|value| clean_env_value(Some(value.clone())))
        .is_some()
    {
        multipart_fields.push("prompt".to_string());
    }
    multipart_fields.push("response_format".to_string());
    multipart_fields.push("timestamp_granularities[]".to_string());
    multipart_fields.push("timestamp_granularities[]".to_string());
    multipart_fields.push("temperature".to_string());

    Ok(ManagedSttRequestPreview {
        endpoint: join_url(&config.backend_base_url, "/v1/audio/transcriptions"),
        headers: vec![("X-Device-Id".to_string(), device_id)],
        has_authorization_header: false,
        multipart_fields,
    })
}

pub(crate) fn build_managed_chat_completion_request_preview(
    config: FixvoxCloudConfig,
    input: ManagedChatInput,
) -> Result<ManagedChatRequestPreview, FixvoxCloudError> {
    let device_id = config
        .device_id
        .and_then(|value| clean_env_value(Some(value)))
        .ok_or_else(|| {
            error(
                "FIXVOX_DEVICE_ID_MISSING",
                "Managed Fixvox post-processing requires a registered device id.",
            )
        })?;
    let transcript = clean_env_value(Some(input.transcript)).ok_or_else(|| {
        error(
            "FIXVOX_CHAT_TRANSCRIPT_MISSING",
            "Managed Fixvox post-processing requires transcript text.",
        )
    })?;
    let system_prompt = clean_env_value(Some(input.system_prompt)).ok_or_else(|| {
        error(
            "FIXVOX_CHAT_PROMPT_MISSING",
            "Managed Fixvox post-processing requires a system prompt.",
        )
    })?;
    let model = clean_env_value(Some(input.model)).ok_or_else(|| {
        error(
            "FIXVOX_CHAT_MODEL_MISSING",
            "Managed Fixvox post-processing requires a model.",
        )
    })?;

    let mut body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": transcript }
        ],
        "stream": false
    });

    if let Some(max_tokens) = input.max_tokens.filter(|value| *value > 0) {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    Ok(ManagedChatRequestPreview {
        endpoint: join_url(&config.backend_base_url, "/v1/chat/completions"),
        headers: vec![
            ("Content-Type".to_string(), "application/json".to_string()),
            ("X-Device-Id".to_string(), device_id),
        ],
        has_authorization_header: false,
        body,
    })
}

pub(crate) fn choose_transcription_transport(
    request: TranscriptionTransportRequest,
) -> Result<TranscriptionTransport, FixvoxCloudError> {
    match request.requested_mode.trim().to_ascii_lowercase().as_str() {
        "managed" | "cloud" => {
            if request.managed_ready {
                Ok(TranscriptionTransport::ManagedCloud)
            } else {
                Err(error(
                    "FIXVOX_MANAGED_NOT_READY",
                    "Managed Fixvox cloud transcription is not ready.",
                ))
            }
        }
        "direct" | "byok" => {
            if request.direct_ready && request.direct_fallback_requested {
                Ok(TranscriptionTransport::DirectByok)
            } else {
                Err(error(
                    "FIXVOX_DIRECT_NOT_EXPLICIT",
                    "Direct BYOK transcription requires explicit selection.",
                ))
            }
        }
        _ => Err(error(
            "FIXVOX_TRANSPORT_MODE_UNSUPPORTED",
            "Requested transcription transport mode is unsupported.",
        )),
    }
}

pub(crate) fn parse_managed_stt_json_response(
    body: &str,
) -> Result<ManagedSttParsedResponse, FixvoxCloudError> {
    let parsed: ManagedSttResponseBody = serde_json::from_str(body).map_err(|_| {
        error(
            "FIXVOX_STT_RESPONSE_PARSE_FAILED",
            "Fixvox managed transcription response did not match the expected JSON contract.",
        )
    })?;

    let text = parsed
        .text
        .and_then(|value| clean_env_value(Some(value)))
        .ok_or_else(|| {
            error(
                "FIXVOX_STT_RESPONSE_TEXT_MISSING",
                "Fixvox managed transcription response did not include transcript text.",
            )
        })?;

    Ok(ManagedSttParsedResponse {
        text,
        model: parsed.model.and_then(|value| clean_env_value(Some(value))),
    })
}

pub(crate) fn parse_managed_chat_json_response(
    body: &str,
) -> Result<ManagedChatParsedResponse, FixvoxCloudError> {
    let parsed: ManagedChatResponseBody = serde_json::from_str(body).map_err(|_| {
        error(
            "FIXVOX_CHAT_RESPONSE_PARSE_FAILED",
            "Fixvox managed chat response did not match the expected JSON contract.",
        )
    })?;

    let output = parsed
        .choices
        .first()
        .and_then(|choice| choice.message.content.clone())
        .and_then(|value| clean_env_value(Some(value)))
        .ok_or_else(|| {
            error(
                "FIXVOX_CHAT_RESPONSE_TEXT_MISSING",
                "Fixvox managed chat response did not include output text.",
            )
        })?;

    Ok(ManagedChatParsedResponse {
        output,
        model: parsed.model.and_then(|value| clean_env_value(Some(value))),
    })
}

pub(crate) fn parse_fixvox_response_metadata(headers: &[(&str, &str)]) -> FixvoxResponseMetadata {
    let header = |name: &str| -> Option<String> {
        headers
            .iter()
            .find(|(candidate, _)| candidate.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.trim().to_string())
            .filter(|value| !value.is_empty())
    };
    let parse_u64 =
        |name: &str| -> Option<u64> { header(name).and_then(|value| value.parse().ok()) };

    FixvoxResponseMetadata {
        fixvox_request_id: header("X-Fixvox-Request-Id"),
        provider_request_id: header("X-Provider-Request-Id"),
        cost_usd: header("X-Fixvox-Cost-Usd"),
        pricing_source: header("X-Fixvox-Pricing-Source"),
        limit: parse_u64("X-Fixvox-Limit"),
        remaining: parse_u64("X-Fixvox-Remaining"),
        reset_at: header("X-Fixvox-Reset-At"),
        usage_key: header("X-Fixvox-Usage-Key"),
        proxy_parse_ms: parse_u64("X-Fixvox-Proxy-Parse-Ms"),
        proxy_usage_ms: parse_u64("X-Fixvox-Proxy-Usage-Ms"),
        proxy_upstream_ms: parse_u64("X-Fixvox-Proxy-Upstream-Ms"),
        proxy_init_ms: parse_u64("X-Fixvox-Proxy-Init-Ms"),
        proxy_total_ms: parse_u64("X-Fixvox-Proxy-Total-Ms"),
        server_timing: header("Server-Timing"),
    }
}

fn clean_env_value(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn trim_trailing_slashes(value: &str) -> String {
    let trimmed = value.trim_end_matches('/');
    if trimmed.is_empty() {
        value.to_string()
    } else {
        trimmed.to_string()
    }
}

fn join_url(base_url: &str, path: &str) -> String {
    format!("{}{}", trim_trailing_slashes(base_url), path)
}

fn error(code: &str, message: &str) -> FixvoxCloudError {
    FixvoxCloudError {
        code: code.to_string(),
        message: message.to_string(),
        redacted: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn alpha_basic_policy_snapshot_allows_managed_but_keeps_advanced_hidden() {
        let snapshot = DeviceRegisterSnapshot {
            ok: true,
            device_id: "dev_test_alpha".to_string(),
            activated: true,
            policy_id: "alpha-basic".to_string(),
            policy_label: "Alpha Basic".to_string(),
            auth: json!({ "required": false }),
            features: json!({ "managedTranscription": true }),
            defaults: json!({}),
            limits: json!({}),
            telemetry: json!({}),
            transport_policy: json!({ "speech": { "mode": "proxied", "provider": "groq" } }),
            transcript: None,
            voice_policy: None,
            voice_routing: None,
            speech: None,
            prompts: None,
            user_settings_defaults: None,
        };

        let policy = build_policy_snapshot_from_register(&snapshot);

        assert!(policy.capabilities.can_use_managed_transcription);
        assert!(!policy.capabilities.can_see_advanced_settings);
        assert!(!policy.capabilities.can_use_debug_tools);
        assert_eq!(policy.trust, "fresh");
        assert!(!policy.stale);
    }

    #[test]
    fn pro_policy_snapshot_exposes_advanced_capabilities() {
        let snapshot = DeviceRegisterSnapshot {
            ok: true,
            device_id: "dev_test_pro".to_string(),
            activated: true,
            policy_id: "pro".to_string(),
            policy_label: "Pro".to_string(),
            auth: json!({ "required": false }),
            features: json!({ "managedTranscription": true, "debugTools": true }),
            defaults: json!({}),
            limits: json!({}),
            telemetry: json!({}),
            transport_policy: json!({ "speech": { "mode": "proxied", "provider": "groq" } }),
            transcript: None,
            voice_policy: None,
            voice_routing: None,
            speech: None,
            prompts: None,
            user_settings_defaults: None,
        };

        let policy = build_policy_snapshot_from_register(&snapshot);

        assert!(policy.capabilities.can_use_managed_transcription);
        assert!(policy.capabilities.can_see_advanced_settings);
        assert!(policy.capabilities.can_use_debug_tools);
    }

    #[test]
    fn failed_policy_refresh_is_not_treated_as_confirmed_policy() {
        let state = FixvoxDeviceState {
            install_id: "install_test".to_string(),
            device_id: Some("dev_test".to_string()),
            last_register_ok: false,
            last_register_error_code: Some("FIXVOX_REGISTER_FAILED".to_string()),
            last_register_error_message: Some("redacted".to_string()),
            policy_id: None,
            policy_label: None,
            transport_policy: None,
            policy_snapshot: Some(build_policy_snapshot_from_error(&error(
                "FIXVOX_REGISTER_FAILED",
                "redacted",
            ))),
        };

        let denied = policy_allows_managed_transcription(&state)
            .expect_err("failed assignment should fail closed");

        assert_eq!(denied.code, "FIXVOX_POLICY_UNTRUSTED");
    }
}
