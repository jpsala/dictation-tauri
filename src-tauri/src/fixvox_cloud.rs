#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

pub(crate) const PREFERRED_FIXVOX_BACKEND_URL: &str = "https://auth-fixvox.jpsala.dev";
pub(crate) const STALE_FIXVOX_BACKEND_URL: &str = "https://fixvox-api.jpsala.dev";
pub(crate) const FIXVOX_TAURI_USER_AGENT: &str =
    concat!("fixvox-tauri/", env!("CARGO_PKG_VERSION"));
const FIXVOX_SETUP_READINESS_SCHEMA_VERSION: u8 = 1;

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

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixvoxAuthPolicyStatus {
    pub(crate) access_mode: String,
    pub(crate) user_redacted: Option<String>,
    pub(crate) group_label: Option<String>,
    pub(crate) policy_template_id: Option<String>,
    pub(crate) policy_template_label: Option<String>,
    pub(crate) capabilities: Vec<String>,
    pub(crate) limits: Option<serde_json::Value>,
    pub(crate) redacted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixvoxAuthSessionState {
    pub(crate) status: String,
    pub(crate) flow: String,
    pub(crate) session_id: String,
    pub(crate) state_nonce: String,
    pub(crate) user_id: Option<String>,
    pub(crate) user_email: Option<String>,
    pub(crate) session_secret: Option<String>,
    pub(crate) refresh_secret: Option<String>,
    pub(crate) issued_at: String,
    pub(crate) expires_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixvoxSetupReadinessState {
    schema_version: u8,
    phase: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixvoxSetupReadiness {
    pub(crate) schema_version: u8,
    pub(crate) phase: String,
    pub(crate) ready: bool,
    pub(crate) redacted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixvoxCloudLoginPollStatus {
    pub(crate) status: String,
    pub(crate) flow: Option<String>,
    pub(crate) provider: Option<String>,
    pub(crate) state_redacted: Option<String>,
    pub(crate) user_redacted: Option<String>,
    pub(crate) completed_at: Option<String>,
    pub(crate) expires_at: Option<String>,
    pub(crate) error: Option<String>,
    pub(crate) error_description: Option<String>,
    pub(crate) redacted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixvoxAuthSessionStatus {
    pub(crate) status: String,
    pub(crate) flow: Option<String>,
    pub(crate) user_redacted: Option<String>,
    pub(crate) session_id_redacted: Option<String>,
    pub(crate) state_redacted: Option<String>,
    pub(crate) expires_at: Option<String>,
    pub(crate) secrets_present: bool,
    pub(crate) session_path: String,
    pub(crate) redacted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FixvoxCloudLoginStartStatus {
    pub(crate) flow: String,
    pub(crate) verification_url_redacted: String,
    pub(crate) browser_opened: bool,
    pub(crate) polling_interval_seconds: u64,
    pub(crate) expires_in_seconds: u64,
    pub(crate) session_id_redacted: String,
    pub(crate) state_redacted: String,
    pub(crate) redacted: bool,
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
    pub(crate) auth_policy: Option<FixvoxAuthPolicyStatus>,
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopLoginDeviceLinkRequest {
    pub(crate) state: String,
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
struct ProductEnvelope<T> {
    ok: bool,
    data: T,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProductDesktopBinding {
    device_id: String,
    status: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
struct ProductDesktopBootstrapData {
    binding: ProductDesktopBinding,
    context: serde_json::Value,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProductAuthSessionStartData {
    handoff_id: String,
    verification_uri: String,
    expires_at: String,
    poll_after_seconds: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProductAuthSessionStatusData {
    status: String,
    claim_proof: Option<String>,
    expires_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProductNativeSession {
    token: String,
    expires_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
struct ProductAuthSessionClaimData {
    session: ProductNativeSession,
    context: serde_json::Value,
}

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) auth_policy: Option<FixvoxAuthPolicyStatus>,
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ManagedChatEngineKind {
    Postprocess,
    SelectionTransform,
    Assistant,
}

impl ManagedChatEngineKind {
    pub(crate) fn as_header_value(self) -> &'static str {
        match self {
            Self::Postprocess => "postprocess",
            Self::SelectionTransform => "selectionTransform",
            Self::Assistant => "assistant",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ManagedChatInput {
    pub(crate) transcript: String,
    pub(crate) instruction: Option<String>,
    pub(crate) preset_key: Option<String>,
    pub(crate) conversation_summary: Option<String>,
    pub(crate) engine_kind: Option<ManagedChatEngineKind>,
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
    pub(crate) proxy_engine_binding_ms: Option<u64>,
    pub(crate) proxy_prompt_resolution_ms: Option<u64>,
    pub(crate) proxy_budget_config_ms: Option<u64>,
    pub(crate) proxy_budget_events_ms: Option<u64>,
    pub(crate) proxy_multipart_ms: Option<u64>,
    pub(crate) proxy_budget_ms: Option<u64>,
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

fn build_product_bootstrap_body(
    input: DeviceRegisterInput,
    invite_code: Option<String>,
) -> Result<serde_json::Value, FixvoxCloudError> {
    let register = build_device_register_request(input)?;
    let mut body = serde_json::json!({
        "installId": register.install_id,
        "device": {
            "platform": "windows",
            "appVersion": register.version,
        }
    });
    if let Some(invite_code) = invite_code.and_then(|value| clean_env_value(Some(value))) {
        body["inviteCode"] = serde_json::Value::String(invite_code);
    }
    Ok(body)
}

fn parse_product_bootstrap(
    value: serde_json::Value,
) -> Result<ProductDesktopBootstrapData, FixvoxCloudError> {
    let envelope: ProductEnvelope<ProductDesktopBootstrapData> = serde_json::from_value(value)
        .map_err(|_| {
            error(
                "FIXVOX_PRODUCT_BOOTSTRAP_RESPONSE_INVALID",
                "Fixvox product bootstrap response did not match the expected contract.",
            )
        })?;
    if !envelope.ok
        || envelope.data.binding.device_id.trim().is_empty()
        || !matches!(
            envelope.data.binding.status.as_str(),
            "active" | "login_required" | "blocked"
        )
    {
        return Err(error(
            "FIXVOX_PRODUCT_BOOTSTRAP_RESPONSE_INVALID",
            "Fixvox product bootstrap response did not match the expected contract.",
        ));
    }
    Ok(envelope.data)
}

fn bootstrap_device_with_client(
    client: &dyn DeviceRegisterHttpClient,
    config: &FixvoxCloudRuntimeConfig,
    input: DeviceRegisterInput,
    invite_code: Option<String>,
) -> Result<ProductDesktopBootstrapData, FixvoxCloudError> {
    let response = client.post_json(
        &join_url(&config.backend_base_url, "/product/v1/desktop/bootstrap"),
        build_product_bootstrap_body(input, invite_code)?,
    )?;
    parse_product_bootstrap(response)
}

pub(crate) fn build_desktop_login_device_link_request(
    state: &FixvoxAuthSessionState,
    input: DeviceRegisterInput,
) -> Result<DesktopLoginDeviceLinkRequest, FixvoxCloudError> {
    let register = build_device_register_request(input)?;
    let state_nonce = clean_env_value(Some(state.state_nonce.clone())).ok_or_else(|| {
        error(
            "FIXVOX_LOGIN_STATE_MISSING",
            "Fixvox login device link requires a signed-in login state.",
        )
    })?;

    Ok(DesktopLoginDeviceLinkRequest {
        state: state_nonce,
        install_id: register.install_id,
        device_id: register.device_id,
        version: register.version,
        platform: register.platform,
        arch: register.arch,
        hostname: register.hostname,
        ts: register.ts,
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

fn resolve_fixvox_app_data_dir(
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

    Ok(PathBuf::from(base).join("dictation-tauri"))
}

pub(crate) fn resolve_device_state_path(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<PathBuf, FixvoxCloudError> {
    Ok(resolve_fixvox_app_data_dir(env_lookup)?.join("fixvox-device-state.json"))
}

pub(crate) fn resolve_auth_session_state_path(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<PathBuf, FixvoxCloudError> {
    Ok(resolve_fixvox_app_data_dir(env_lookup)?.join("fixvox-auth-session.v1.json"))
}

fn resolve_setup_readiness_path(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<PathBuf, FixvoxCloudError> {
    Ok(resolve_fixvox_app_data_dir(env_lookup)?.join("fixvox-setup-readiness.v1.json"))
}

pub(crate) fn build_device_state_from_register(
    config: &FixvoxCloudRuntimeConfig,
    snapshot: &DeviceRegisterSnapshot,
) -> FixvoxDeviceState {
    let policy_snapshot = build_policy_snapshot_from_register(snapshot);
    let auth_policy = build_auth_policy_status_from_register(snapshot, &policy_snapshot);
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
        auth_policy,
    }
}

fn build_device_state_from_product_context(
    config: &FixvoxCloudRuntimeConfig,
    device_id: &str,
    context: &serde_json::Value,
    signed_in: bool,
) -> Result<FixvoxDeviceState, FixvoxCloudError> {
    let profile_key = context
        .pointer("/profile/key")
        .and_then(serde_json::Value::as_str)
        .and_then(|value| clean_env_value(Some(value.to_string())))
        .ok_or_else(|| {
            error(
                "FIXVOX_PRODUCT_CONTEXT_INVALID",
                "Fixvox product context did not include a profile key.",
            )
        })?;
    let capability = |key: &str| {
        context
            .get("capabilities")
            .and_then(|value| value.get(key))
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false)
    };
    let transcription = capability("transcription");
    let postprocess = capability("postprocess");
    let selection_transform = capability("selectionTransform");
    let assistant = capability("assistant");
    let feedback = capability("feedback");
    let admin_settings = capability("adminSettings");
    let mut capabilities = Vec::new();
    if transcription {
        capabilities.extend(["dictation".to_string(), "managed_stt".to_string()]);
    }
    if postprocess {
        capabilities.push("postprocess".to_string());
    }
    if postprocess || selection_transform || assistant {
        capabilities.push("managed_llm".to_string());
    }
    if selection_transform {
        capabilities.push("selection_transform".to_string());
    }
    if assistant {
        capabilities.push("assistant_actions".to_string());
    }
    if feedback {
        capabilities.push("feedback".to_string());
    }
    if admin_settings {
        capabilities.push("admin_settings".to_string());
    }
    let product_capabilities = FixvoxPolicyCapabilities {
        can_use_managed_transcription: transcription,
        can_see_advanced_settings: postprocess
            || selection_transform
            || assistant
            || admin_settings,
        can_use_debug_tools: false,
    };
    let transport_policy = serde_json::json!({ "mode": "managed", "contract": "product-v1" });
    let policy_snapshot = FixvoxPolicySnapshot {
        policy_id: Some(profile_key.clone()),
        policy_label: Some(profile_key.clone()),
        features: context.get("capabilities").cloned(),
        capabilities: product_capabilities.clone(),
        transport_policy: Some(transport_policy.clone()),
        runtime_policy: Some(context.clone()),
        fetched_at: current_unix_timestamp_string(),
        trust: "confirmed".to_string(),
        stale: false,
        error: None,
    };
    Ok(FixvoxDeviceState {
        install_id: config.install_id.clone(),
        device_id: Some(device_id.to_string()),
        last_register_ok: true,
        last_register_error_code: None,
        last_register_error_message: None,
        policy_id: Some(profile_key.clone()),
        policy_label: Some(profile_key.clone()),
        transport_policy: Some(transport_policy),
        policy_snapshot: Some(policy_snapshot),
        auth_policy: Some(FixvoxAuthPolicyStatus {
            access_mode: if signed_in { "signed_in" } else { "device" }.to_string(),
            user_redacted: None,
            group_label: None,
            policy_template_id: Some(profile_key.clone()),
            policy_template_label: Some(profile_key),
            capabilities,
            limits: context.get("limits").cloned(),
            redacted: true,
        }),
    })
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
        auth_policy: None,
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
        auth_policy: None,
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
        auth_policy: previous_policy.and_then(|state| state.auth_policy.clone()),
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

fn build_auth_policy_status_from_register(
    snapshot: &DeviceRegisterSnapshot,
    policy_snapshot: &FixvoxPolicySnapshot,
) -> Option<FixvoxAuthPolicyStatus> {
    let access_mode =
        json_string(&snapshot.auth, &["accessMode", "access_mode", "mode"]).or_else(|| {
            if json_string(&snapshot.auth, &["userId", "user_id", "userEmail", "email"]).is_some() {
                Some("signed_in".to_string())
            } else {
                None
            }
        });
    let user_value = json_string(&snapshot.auth, &["userId", "user_id", "userEmail", "email"]);
    let group_label = json_string(
        &snapshot.auth,
        &["groupLabel", "group_label", "groupName", "group"],
    );
    let policy_template_id =
        json_string(&snapshot.auth, &["policyTemplateId", "policy_template_id"])
            .or_else(|| clean_env_value(Some(snapshot.policy_id.clone())));
    let policy_template_label = json_string(
        &snapshot.auth,
        &["policyTemplateLabel", "policy_template_label"],
    )
    .or_else(|| clean_env_value(Some(snapshot.policy_label.clone())));

    if access_mode.is_none() && user_value.is_none() && group_label.is_none() {
        return None;
    }

    let access_mode = match access_mode
        .unwrap_or_else(|| "signed_in".to_string())
        .replace('-', "_")
        .to_ascii_lowercase()
        .as_str()
    {
        "signedin" | "signed_in" => "signed_in".to_string(),
        "anonymous" | "signed_out" => "anonymous".to_string(),
        _ if user_value.is_some() => "signed_in".to_string(),
        _ => "anonymous".to_string(),
    };
    let capabilities = json_string_array(
        &snapshot.auth,
        &[
            "capabilities",
            "productCapabilities",
            "product_capabilities",
        ],
    )
    .unwrap_or_else(|| {
        policy_template_id
            .as_deref()
            .map(product_capabilities_for_policy_template)
            .filter(|capabilities| !capabilities.is_empty())
            .unwrap_or_else(|| {
                product_capabilities_from_policy_capabilities(&policy_snapshot.capabilities)
            })
    });
    let limits = if snapshot.limits.is_null()
        || snapshot
            .limits
            .as_object()
            .map(|object| object.is_empty())
            .unwrap_or(false)
    {
        None
    } else {
        Some(snapshot.limits.clone())
    };

    Some(FixvoxAuthPolicyStatus {
        access_mode,
        user_redacted: redact_user_identifier(user_value.as_deref()),
        group_label,
        policy_template_id,
        policy_template_label,
        capabilities,
        limits,
        redacted: true,
    })
}

fn product_capabilities_for_policy_template(policy_id: &str) -> Vec<String> {
    match policy_id.trim().to_ascii_lowercase().as_str() {
        "basic-anonymous" => vec![],
        "translate-only" => vec!["translate", "managed_llm"],
        "dictation-basic" | "alpha-basic" => {
            vec!["dictation", "postprocess", "managed_stt", "managed_llm"]
        }
        "pro" | "alpha-full" => vec![
            "translate",
            "dictation",
            "postprocess",
            "selection_transform",
            "assistant_actions",
            "custom_prompts",
            "advanced_settings",
            "managed_stt",
            "managed_llm",
        ],
        "power-admin" | "power" | "admin" => vec![
            "translate",
            "dictation",
            "postprocess",
            "selection_transform",
            "assistant_actions",
            "custom_prompts",
            "advanced_settings",
            "debug_tools",
            "managed_stt",
            "managed_llm",
            "admin_settings",
        ],
        _ => vec![],
    }
    .into_iter()
    .map(|value| value.to_string())
    .collect()
}

fn product_capabilities_from_policy_capabilities(
    capabilities: &FixvoxPolicyCapabilities,
) -> Vec<String> {
    let mut product_capabilities = Vec::new();
    if capabilities.can_use_managed_transcription {
        product_capabilities.push("dictation".to_string());
        product_capabilities.push("managed_stt".to_string());
    }
    if capabilities.can_see_advanced_settings {
        product_capabilities.push("advanced_settings".to_string());
    }
    if capabilities.can_use_debug_tools {
        product_capabilities.push("debug_tools".to_string());
    }
    product_capabilities
}

fn json_string(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(|entry| entry.as_str())
            .and_then(|entry| clean_env_value(Some(entry.to_string())))
    })
}

fn json_string_array(value: &serde_json::Value, keys: &[&str]) -> Option<Vec<String>> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|entry| {
            entry.as_array().map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str())
                    .filter_map(|item| clean_env_value(Some(item.to_string())))
                    .collect::<Vec<_>>()
            })
        })
    })
}

fn redact_user_identifier(value: Option<&str>) -> Option<String> {
    value.and_then(|value| {
        if value.contains('@') {
            Some("user redacted".to_string())
        } else {
            redact_identifier(Some(value))
        }
    })
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
    policy.insert("auth".to_string(), snapshot.auth.clone());
    policy.insert("limits".to_string(), snapshot.limits.clone());
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
    policy_allows_managed_operation(state, "dictation")
}

pub(crate) fn policy_allows_managed_operation(
    state: &FixvoxDeviceState,
    operation: &str,
) -> Result<(), FixvoxCloudError> {
    if !state.last_register_ok {
        return Err(error(
            "FIXVOX_POLICY_UNTRUSTED",
            "Fixvox policy is not confirmed; refresh or activate the device before managed runtime.",
        ));
    }

    let Some(snapshot) = state.policy_snapshot.as_ref() else {
        let legacy_capabilities = derive_policy_capabilities(
            state.policy_id.as_deref(),
            None,
            state.transport_policy.as_ref(),
        );
        if operation == "dictation" && legacy_capabilities.can_use_managed_transcription {
            return Ok(());
        }
        return Err(error(
            "FIXVOX_POLICY_MISSING",
            "Fixvox policy snapshot is missing; refresh policy before managed runtime.",
        ));
    };

    if snapshot.stale || snapshot.error.is_some() || snapshot.trust == "error" {
        return Err(error(
            "FIXVOX_POLICY_STALE",
            "Fixvox policy snapshot is stale or failed; refresh policy before managed runtime.",
        ));
    }

    if let Some(auth_policy) = state.auth_policy.as_ref() {
        return auth_policy_allows_operation(auth_policy, operation);
    }

    if operation == "dictation" && snapshot.capabilities.can_use_managed_transcription {
        return Ok(());
    }
    if operation == "dictation" && !snapshot.capabilities.can_use_managed_transcription {
        return Err(error(
            "FIXVOX_MANAGED_TRANSCRIPTION_DISABLED",
            "Fixvox policy does not allow managed transcription for this device.",
        ));
    }

    Err(error(
        "FIXVOX_CAPABILITY_NOT_ALLOWED",
        "Fixvox policy does not allow the required managed capability for this device.",
    ))
}

fn auth_policy_allows_operation(
    auth_policy: &FixvoxAuthPolicyStatus,
    operation: &str,
) -> Result<(), FixvoxCloudError> {
    let required = required_product_capabilities(operation);
    let missing = required
        .iter()
        .filter(|capability| {
            !auth_policy
                .capabilities
                .iter()
                .any(|allowed| allowed == **capability)
        })
        .copied()
        .collect::<Vec<_>>();

    if missing.is_empty() {
        return Ok(());
    }

    Err(error(
        "FIXVOX_CAPABILITY_NOT_ALLOWED",
        "Fixvox policy does not allow the required managed capability for this device.",
    ))
}

fn required_product_capabilities(operation: &str) -> Vec<&'static str> {
    match operation.trim().to_ascii_lowercase().as_str() {
        "dictation" | "managed_stt" => vec!["dictation", "managed_stt"],
        "postprocess" | "managed_llm" => vec!["postprocess", "managed_llm"],
        "translate" => vec!["translate", "managed_llm"],
        "selection_transform" => vec!["selection_transform", "managed_llm"],
        "assistant_action" | "assistant_actions" => vec!["assistant_actions", "managed_llm"],
        _ => vec!["managed_llm"],
    }
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

pub(crate) fn persist_auth_session_state(
    path: &Path,
    state: &FixvoxAuthSessionState,
) -> Result<(), FixvoxCloudError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| {
            error(
                "FIXVOX_AUTH_SESSION_STATE_DIR_FAILED",
                "Fixvox auth session directory could not be created.",
            )
        })?;
    }

    let body = serde_json::to_string_pretty(state).map_err(|_| {
        error(
            "FIXVOX_AUTH_SESSION_STATE_SERIALIZE_FAILED",
            "Fixvox auth session state could not be serialized.",
        )
    })?;

    std::fs::write(path, body).map_err(|_| {
        error(
            "FIXVOX_AUTH_SESSION_STATE_WRITE_FAILED",
            "Fixvox auth session state could not be written.",
        )
    })
}

pub(crate) fn read_auth_session_state(
    path: &Path,
) -> Result<Option<FixvoxAuthSessionState>, FixvoxCloudError> {
    if !path.exists() {
        return Ok(None);
    }

    let body = std::fs::read_to_string(path).map_err(|_| {
        error(
            "FIXVOX_AUTH_SESSION_STATE_READ_FAILED",
            "Fixvox auth session state could not be read.",
        )
    })?;

    serde_json::from_str(&body).map(Some).map_err(|_| {
        error(
            "FIXVOX_AUTH_SESSION_STATE_INVALID",
            "Fixvox auth session state did not match the expected contract.",
        )
    })
}

fn is_valid_setup_phase(phase: &str) -> bool {
    matches!(
        phase,
        "welcome"
            | "oauth_handoff"
            | "account_linking"
            | "microphone_setup"
            | "shortcut_setup"
            | "ready"
            | "offline"
            | "oauth_cancelled"
            | "oauth_expired"
            | "account_not_authorized"
            | "binding_conflict"
            | "policy_unavailable"
            | "microphone_denied"
            | "service_unavailable"
    )
}

fn persist_setup_readiness_state(
    path: &Path,
    state: &FixvoxSetupReadinessState,
) -> Result<(), FixvoxCloudError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| {
            error(
                "FIXVOX_SETUP_STATE_WRITE_FAILED",
                "Setup state could not be saved.",
            )
        })?;
    }
    let body = serde_json::to_string(state).map_err(|_| {
        error(
            "FIXVOX_SETUP_STATE_SERIALIZE_FAILED",
            "Setup state could not be saved.",
        )
    })?;
    std::fs::write(path, body).map_err(|_| {
        error(
            "FIXVOX_SETUP_STATE_WRITE_FAILED",
            "Setup state could not be saved.",
        )
    })
}

fn read_setup_readiness_state(
    path: &Path,
) -> Result<Option<FixvoxSetupReadinessState>, FixvoxCloudError> {
    if !path.exists() {
        return Ok(None);
    }
    let body = std::fs::read_to_string(path).map_err(|_| {
        error(
            "FIXVOX_SETUP_STATE_READ_FAILED",
            "Setup state could not be read.",
        )
    })?;
    serde_json::from_str(&body).map(Some).map_err(|_| {
        error(
            "FIXVOX_SETUP_STATE_INVALID",
            "Setup state could not be restored.",
        )
    })
}

fn has_signed_in_local_context(
    device_state: Option<&FixvoxDeviceState>,
    auth_session: Option<&FixvoxAuthSessionState>,
) -> bool {
    device_state
        .and_then(|state| state.device_id.as_ref().map(|value| (state, value)))
        .map(|(state, device_id)| {
            !device_id.trim().is_empty()
                && state.last_register_ok
                && state
                    .auth_policy
                    .as_ref()
                    .map(|policy| policy.access_mode == "signed_in")
                    .unwrap_or(false)
        })
        .unwrap_or(false)
        && auth_session
            .map(|session| session.status == "signed_in")
            .unwrap_or(false)
}

fn build_setup_readiness(phase: &str) -> FixvoxSetupReadiness {
    FixvoxSetupReadiness {
        schema_version: FIXVOX_SETUP_READINESS_SCHEMA_VERSION,
        phase: phase.to_string(),
        ready: phase == "ready",
        redacted: true,
    }
}

pub(crate) fn get_fixvox_setup_readiness_with_env(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<FixvoxSetupReadiness, FixvoxCloudError> {
    let path = resolve_setup_readiness_path(env_lookup)?;
    let device_state = read_device_state(&resolve_device_state_path(env_lookup)?)
        .ok()
        .flatten();
    let auth_session = read_auth_session_state(&resolve_auth_session_state_path(env_lookup)?)
        .ok()
        .flatten();
    let has_signed_in_context =
        has_signed_in_local_context(device_state.as_ref(), auth_session.as_ref());

    let phase = match read_setup_readiness_state(&path) {
        Ok(Some(state))
            if state.schema_version == FIXVOX_SETUP_READINESS_SCHEMA_VERSION
                && is_valid_setup_phase(&state.phase) =>
        {
            if state.phase == "ready" && !has_signed_in_context {
                "service_unavailable".to_string()
            } else {
                state.phase
            }
        }
        Ok(Some(_)) | Err(_) => "service_unavailable".to_string(),
        Ok(None) if has_signed_in_context => "ready".to_string(),
        Ok(None) => "welcome".to_string(),
    };

    persist_setup_readiness_state(
        &path,
        &FixvoxSetupReadinessState {
            schema_version: FIXVOX_SETUP_READINESS_SCHEMA_VERSION,
            phase: phase.clone(),
        },
    )?;
    Ok(build_setup_readiness(&phase))
}

pub(crate) fn get_fixvox_auth_session_status_with_env(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<FixvoxAuthSessionStatus, FixvoxCloudError> {
    let path = resolve_auth_session_state_path(env_lookup)?;
    let state = read_auth_session_state(&path)?;
    Ok(build_auth_session_status(path, state.as_ref()))
}

pub(crate) async fn poll_fixvox_cloud_login_with_env(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<FixvoxAuthSessionStatus, FixvoxCloudError> {
    let backend_base_url = resolve_backend_base_url(env_lookup)?;
    let path = resolve_auth_session_state_path(env_lookup)?;
    let Some(mut state) = read_auth_session_state(&path)? else {
        return Ok(build_auth_session_status(path, None));
    };
    if state.status != "pending" {
        return Ok(build_auth_session_status(path, Some(&state)));
    }

    let status_url = join_url(
        &backend_base_url,
        &format!("/product/v1/desktop/auth/sessions/{}", state.state_nonce),
    );
    let client = fixvox_http_client()?;
    let response = client.get(status_url).send().await.map_err(|_| {
        error(
            "FIXVOX_LOGIN_STATUS_FAILED",
            "Fixvox product login status could not be reached.",
        )
    })?;
    if response.status().as_u16() == 404 {
        state.status = "expired".to_string();
        persist_auth_session_state(&path, &state)?;
        return Ok(build_auth_session_status(path, Some(&state)));
    }
    if !response.status().is_success() {
        return Err(error(
            "FIXVOX_LOGIN_STATUS_FAILED",
            "Fixvox product login status returned an error.",
        ));
    }
    let envelope: ProductEnvelope<ProductAuthSessionStatusData> =
        response.json().await.map_err(|_| {
            error(
                "FIXVOX_LOGIN_STATUS_INVALID",
                "Fixvox product login status did not match the expected contract.",
            )
        })?;
    if !envelope.ok {
        return Err(error(
            "FIXVOX_LOGIN_STATUS_INVALID",
            "Fixvox product login status did not match the expected contract.",
        ));
    }
    state.expires_at = Some(envelope.data.expires_at.clone());
    match envelope.data.status.as_str() {
        "approved" => {
            let claim_proof = envelope.data.claim_proof.ok_or_else(|| {
                error(
                    "FIXVOX_LOGIN_CLAIM_MISSING",
                    "Fixvox product login approval did not include a claim proof.",
                )
            })?;
            let (device_path, device_state, _) = resolve_or_create_device_state(env_lookup)?;
            let device_id = device_state.device_id.clone().ok_or_else(|| {
                error(
                    "FIXVOX_DEVICE_ID_MISSING",
                    "Fixvox product login requires a bootstrapped device.",
                )
            })?;
            let claim_url = join_url(
                &backend_base_url,
                &format!(
                    "/product/v1/desktop/auth/sessions/{}/claim",
                    state.state_nonce
                ),
            );
            let claim_response = client
                .post(claim_url)
                .header("X-Fixvox-Install-Id", device_state.install_id.clone())
                .json(&serde_json::json!({
                    "deviceId": device_id,
                    "claimProof": claim_proof,
                }))
                .send()
                .await
                .map_err(|_| {
                    error(
                        "FIXVOX_LOGIN_CLAIM_FAILED",
                        "Fixvox product login claim could not be reached.",
                    )
                })?;
            if !claim_response.status().is_success() {
                return Err(error(
                    "FIXVOX_LOGIN_CLAIM_REJECTED",
                    "Fixvox product login claim was rejected.",
                ));
            }
            let claim: ProductEnvelope<ProductAuthSessionClaimData> =
                claim_response.json().await.map_err(|_| {
                    error(
                        "FIXVOX_LOGIN_CLAIM_INVALID",
                        "Fixvox product login claim did not match the expected contract.",
                    )
                })?;
            if !claim.ok || claim.data.session.token.trim().is_empty() {
                return Err(error(
                    "FIXVOX_LOGIN_CLAIM_INVALID",
                    "Fixvox product login claim did not match the expected contract.",
                ));
            }
            let config = FixvoxCloudRuntimeConfig {
                backend_base_url: backend_base_url.clone(),
                install_id: device_state.install_id,
                device_id: Some(device_id.clone()),
            };
            let next_device_state = build_device_state_from_product_context(
                &config,
                &device_id,
                &claim.data.context,
                true,
            )?;
            persist_device_state(&device_path, &next_device_state)?;
            state.status = "signed_in".to_string();
            state.user_id = None;
            state.user_email = None;
            state.session_secret = Some(claim.data.session.token);
            state.expires_at = Some(claim.data.session.expires_at);
            persist_auth_session_state(&path, &state)?;
        }
        "denied" => {
            state.status = "error".to_string();
            persist_auth_session_state(&path, &state)?;
        }
        "expired" => {
            state.status = "expired".to_string();
            persist_auth_session_state(&path, &state)?;
        }
        "pending" => {}
        _ => {
            return Err(error(
                "FIXVOX_LOGIN_STATUS_INVALID",
                "Fixvox product login status did not match the expected contract.",
            ));
        }
    }
    Ok(build_auth_session_status(path, Some(&state)))
}

pub(crate) fn get_fixvox_cloud_status_with_env(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    let (path, state, backend_base_url) = resolve_or_create_device_state(env_lookup)?;
    Ok(build_cloud_status(path, state, backend_base_url))
}

pub(crate) fn link_fixvox_cloud_login_device_with_client_and_env(
    client: &dyn DeviceRegisterHttpClient,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    let auth_path = resolve_auth_session_state_path(env_lookup)?;
    let Some(state) = read_auth_session_state(&auth_path)? else {
        return Err(error(
            "FIXVOX_LOGIN_SESSION_MISSING",
            "Fixvox Cloud login must complete before linking this device.",
        ));
    };
    if state.status != "signed_in" {
        return Err(error(
            "FIXVOX_LOGIN_SESSION_NOT_SIGNED_IN",
            "Fixvox Cloud login is not signed in yet.",
        ));
    }

    link_signed_in_session_device_with_client(client, env_lookup, &state)
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

pub(crate) async fn start_fixvox_cloud_login_with_env(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
    open_external_browser: bool,
) -> Result<FixvoxCloudLoginStartStatus, FixvoxCloudError> {
    let (.., device_state, backend_base_url) = resolve_or_create_device_state(env_lookup)?;
    let device_id = device_state.device_id.ok_or_else(|| {
        error(
            "FIXVOX_DEVICE_ID_MISSING",
            "Fixvox product login requires a bootstrapped device.",
        )
    })?;
    let response = fixvox_http_client()?
        .post(join_url(
            &backend_base_url,
            "/product/v1/desktop/auth/sessions",
        ))
        .json(&serde_json::json!({
            "deviceId": device_id,
            "returnTo": "fixvox-tauri",
        }))
        .send()
        .await
        .map_err(|_| {
            error(
                "FIXVOX_LOGIN_START_FAILED",
                "Fixvox product login could not be reached.",
            )
        })?;
    if !response.status().is_success() {
        return Err(error(
            "FIXVOX_LOGIN_START_REJECTED",
            "Fixvox product login start was rejected.",
        ));
    }
    let envelope: ProductEnvelope<ProductAuthSessionStartData> =
        response.json().await.map_err(|_| {
            error(
                "FIXVOX_LOGIN_START_INVALID",
                "Fixvox product login start did not match the expected contract.",
            )
        })?;
    let data = envelope.data;
    let verification_url =
        validate_product_verification_uri(&backend_base_url, &data.verification_uri)?;
    if !envelope.ok || data.handoff_id.trim().is_empty() {
        return Err(error(
            "FIXVOX_LOGIN_START_INVALID",
            "Fixvox product login start did not match the expected contract.",
        ));
    }
    let session_path = resolve_auth_session_state_path(env_lookup)?;
    let session_state = FixvoxAuthSessionState {
        status: "pending".to_string(),
        flow: "product_auth_handoff".to_string(),
        session_id: data.handoff_id.clone(),
        state_nonce: data.handoff_id.clone(),
        user_id: None,
        user_email: None,
        session_secret: None,
        refresh_secret: None,
        issued_at: current_unix_timestamp_string(),
        expires_at: Some(data.expires_at),
    };
    persist_auth_session_state(&session_path, &session_state)?;
    if open_external_browser {
        open_external_browser_url(&verification_url)?;
    }
    let mut status =
        build_fixvox_login_start_status(&data.handoff_id, &data.handoff_id, open_external_browser);
    status.polling_interval_seconds = data.poll_after_seconds.max(1);
    Ok(status)
}

pub(crate) fn policy_allows_admin_settings() -> bool {
    get_fixvox_cloud_status_with_env(&read_env_value)
        .ok()
        .and_then(|status| status.auth_policy)
        .is_some_and(|policy| {
            policy
                .capabilities
                .iter()
                .any(|capability| capability == "admin_settings")
        })
}

#[tauri::command]
pub fn get_fixvox_cloud_status() -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    get_fixvox_cloud_status_with_env(&read_env_value)
}

#[tauri::command]
pub fn get_fixvox_setup_readiness() -> Result<FixvoxSetupReadiness, FixvoxCloudError> {
    get_fixvox_setup_readiness_with_env(&read_env_value)
}

#[tauri::command]
pub fn get_fixvox_auth_session_status() -> Result<FixvoxAuthSessionStatus, FixvoxCloudError> {
    get_fixvox_auth_session_status_with_env(&read_env_value)
}

#[tauri::command]
pub async fn poll_fixvox_cloud_login() -> Result<FixvoxAuthSessionStatus, FixvoxCloudError> {
    poll_fixvox_cloud_login_with_env(&read_env_value).await
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

#[tauri::command]
pub async fn start_fixvox_cloud_login(
    open_external_browser: Option<bool>,
) -> Result<FixvoxCloudLoginStartStatus, FixvoxCloudError> {
    start_fixvox_cloud_login_with_env(&read_env_value, open_external_browser.unwrap_or(false)).await
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
    let product = match bootstrap_device_with_client(client, &config, input, None) {
        Ok(product) => product,
        Err(register_error) => {
            let error_state = build_device_state_from_register_error(&config, &register_error);
            persist_device_state(&path, &error_state)?;
            return Err(register_error);
        }
    };
    let next_state = build_device_state_from_product_context(
        &config,
        &product.binding.device_id,
        &product.context,
        false,
    )?;
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
    let product =
        match bootstrap_device_with_client(client, &activated_config, register_input, None) {
            Ok(product) => product,
            Err(register_error) => {
                let error_state =
                    build_device_state_from_register_error(&activated_config, &register_error);
                persist_device_state(&path, &error_state)?;
                return Err(register_error);
            }
        };
    let next_state = build_device_state_from_product_context(
        &activated_config,
        &product.binding.device_id,
        &product.context,
        false,
    )?;
    persist_device_state(&path, &next_state)?;

    Ok(build_cloud_status(
        path,
        next_state,
        activated_config.backend_base_url.clone(),
    ))
}

fn link_signed_in_session_device_with_client(
    client: &dyn DeviceRegisterHttpClient,
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
    session_state: &FixvoxAuthSessionState,
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    let (path, state, backend_base_url) = resolve_or_create_device_state(env_lookup)?;
    let config = FixvoxCloudRuntimeConfig {
        backend_base_url,
        install_id: state.install_id.clone(),
        device_id: state.device_id.clone(),
    };
    let input = build_device_register_input(&config, env_lookup);
    let body = serde_json::to_value(build_desktop_login_device_link_request(
        session_state,
        input,
    )?)
    .map_err(|_| {
        error(
            "FIXVOX_LOGIN_DEVICE_LINK_SERIALIZE_FAILED",
            "Fixvox login device link request could not be serialized.",
        )
    })?;
    let endpoint = join_url(&config.backend_base_url, "/desktop/login/link-device");
    let snapshot = match post_device_snapshot_with_client(
        client,
        &endpoint,
        body,
        "FIXVOX_LOGIN_DEVICE_LINK_RESPONSE_INVALID",
    ) {
        Ok(snapshot) => snapshot,
        Err(link_error) => {
            let error_state = build_device_state_from_register_error(&config, &link_error);
            persist_device_state(&path, &error_state)?;
            return Err(link_error);
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

async fn bootstrap_device_with_reqwest(
    config: &FixvoxCloudRuntimeConfig,
    input: DeviceRegisterInput,
    invite_code: Option<String>,
) -> Result<ProductDesktopBootstrapData, FixvoxCloudError> {
    let response = fixvox_http_client()?
        .post(join_url(
            &config.backend_base_url,
            "/product/v1/desktop/bootstrap",
        ))
        .json(&build_product_bootstrap_body(input, invite_code)?)
        .send()
        .await
        .map_err(|_| {
            error(
                "FIXVOX_PRODUCT_BOOTSTRAP_UNAVAILABLE",
                "Fixvox product bootstrap could not be reached.",
            )
        })?;
    if !response.status().is_success() {
        return Err(error(
            "FIXVOX_PRODUCT_BOOTSTRAP_REJECTED",
            "Fixvox product bootstrap rejected the device request.",
        ));
    }
    let value = response.json::<serde_json::Value>().await.map_err(|_| {
        error(
            "FIXVOX_PRODUCT_BOOTSTRAP_RESPONSE_INVALID",
            "Fixvox product bootstrap response did not match the expected contract.",
        )
    })?;
    parse_product_bootstrap(value)
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
    let product = match bootstrap_device_with_reqwest(&config, input, None).await {
        Ok(product) => product,
        Err(register_error) => {
            let error_state = build_device_state_from_register_error(&config, &register_error);
            persist_device_state(&path, &error_state)?;
            return Err(register_error);
        }
    };
    let next_state = build_device_state_from_product_context(
        &config,
        &product.binding.device_id,
        &product.context,
        false,
    )?;
    persist_device_state(&path, &next_state)?;

    Ok(build_cloud_status(
        path,
        next_state,
        config.backend_base_url.clone(),
    ))
}

async fn link_signed_in_session_device_with_reqwest(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
    session_state: &FixvoxAuthSessionState,
) -> Result<FixvoxCloudStatus, FixvoxCloudError> {
    let (path, state, backend_base_url) = resolve_or_create_device_state(env_lookup)?;
    let config = FixvoxCloudRuntimeConfig {
        backend_base_url,
        install_id: state.install_id.clone(),
        device_id: state.device_id.clone(),
    };
    let input = build_device_register_input(&config, env_lookup);
    let body = serde_json::to_value(build_desktop_login_device_link_request(
        session_state,
        input,
    )?)
    .map_err(|_| {
        error(
            "FIXVOX_LOGIN_DEVICE_LINK_SERIALIZE_FAILED",
            "Fixvox login device link request could not be serialized.",
        )
    })?;
    let endpoint = join_url(&config.backend_base_url, "/desktop/login/link-device");
    let snapshot = match post_device_snapshot_with_reqwest(
        endpoint,
        body,
        "FIXVOX_LOGIN_DEVICE_LINK_UNAVAILABLE",
        "Fixvox Cloud login device link could not be reached.",
        "FIXVOX_LOGIN_DEVICE_LINK_REJECTED",
        "Fixvox Cloud rejected login device link.",
        "FIXVOX_LOGIN_DEVICE_LINK_RESPONSE_INVALID",
    )
    .await
    {
        Ok(snapshot) => snapshot,
        Err(link_error) => {
            let error_state = build_device_state_from_register_error(&config, &link_error);
            persist_device_state(&path, &error_state)?;
            return Err(link_error);
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
    let product = match bootstrap_device_with_reqwest(&activated_config, register_input, None).await
    {
        Ok(product) => product,
        Err(register_error) => {
            let error_state =
                build_device_state_from_register_error(&activated_config, &register_error);
            persist_device_state(&path, &error_state)?;
            return Err(register_error);
        }
    };
    let next_state = build_device_state_from_product_context(
        &activated_config,
        &product.binding.device_id,
        &product.context,
        false,
    )?;
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
        auth_policy: state.auth_policy,
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

fn current_unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn current_unix_timestamp_string() -> String {
    let seconds = current_unix_timestamp();
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

    let cloudflare_authority =
        trim_trailing_slashes(&config.backend_base_url) == PREFERRED_FIXVOX_BACKEND_URL;
    let (endpoint_path, multipart_fields) = if cloudflare_authority {
        let mut fields = vec!["file".to_string(), "model".to_string()];
        if input
            .language
            .as_ref()
            .and_then(|value| clean_env_value(Some(value.clone())))
            .filter(|value| !value.eq_ignore_ascii_case("auto"))
            .is_some()
        {
            fields.push("language".to_string());
        }
        if input
            .prompt
            .as_ref()
            .and_then(|value| clean_env_value(Some(value.clone())))
            .is_some()
        {
            fields.push("prompt".to_string());
        }
        fields.push("response_format".to_string());
        fields.push("timestamp_granularities[]".to_string());
        fields.push("timestamp_granularities[]".to_string());
        fields.push("temperature".to_string());
        ("/v1/audio/transcriptions", fields)
    } else {
        // The self-hosted product boundary owns provider/model/prompt selection.
        (
            "/product/v1/runtime/transcriptions",
            vec!["metadata".to_string(), "audio".to_string()],
        )
    };

    Ok(ManagedSttRequestPreview {
        endpoint: join_url(&config.backend_base_url, endpoint_path),
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
    let engine_kind = input
        .engine_kind
        .unwrap_or(ManagedChatEngineKind::Assistant);
    let uses_cloudflare_compat = config
        .backend_base_url
        .trim_end_matches('/')
        .eq_ignore_ascii_case(PREFERRED_FIXVOX_BACKEND_URL);

    if uses_cloudflare_compat {
        let (system_prompt, user_message) = match engine_kind {
            ManagedChatEngineKind::Postprocess => (
                "Apply the server-owned post-processing policy. Output only the final text."
                    .to_string(),
                transcript,
            ),
            ManagedChatEngineKind::SelectionTransform => {
                let instruction = clean_env_value(input.instruction).ok_or_else(|| {
                    error(
                        "FIXVOX_SELECTION_TRANSFORM_INSTRUCTION_MISSING",
                        "Managed Fixvox selection transform requires an instruction.",
                    )
                })?;
                let preset = input
                    .preset_key
                    .and_then(|value| clean_env_value(Some(value)))
                    .unwrap_or_else(|| "natural_instruction".to_string());
                (
                    "Transform the selected text according to the instruction. Output only the replacement text."
                        .to_string(),
                    format!(
                        "Preset: {preset}\nInstruction:\n{instruction}\n\nSelected text:\n{transcript}"
                    ),
                )
            }
            ManagedChatEngineKind::Assistant => {
                let summary = input
                    .conversation_summary
                    .and_then(|value| clean_env_value(Some(value)))
                    .unwrap_or_default();
                (
                    "Answer as the server-owned Fixvox assistant.".to_string(),
                    if summary.is_empty() {
                        transcript
                    } else {
                        format!("Conversation summary:\n{summary}\n\nUser:\n{transcript}")
                    },
                )
            }
        };
        let headers = vec![
            ("Content-Type".to_string(), "application/json".to_string()),
            ("X-Device-Id".to_string(), device_id),
            (
                "X-Fixvox-Engine-Kind".to_string(),
                engine_kind.as_header_value().to_string(),
            ),
        ];
        return Ok(ManagedChatRequestPreview {
            endpoint: join_url(&config.backend_base_url, "/v1/chat/completions"),
            headers,
            has_authorization_header: false,
            body: serde_json::json!({
                "model": "server-owned",
                "messages": [
                    { "role": "system", "content": system_prompt },
                    { "role": "user", "content": user_message }
                ],
                "stream": false
            }),
        });
    }

    let kind = match engine_kind {
        ManagedChatEngineKind::Postprocess => "postprocess",
        ManagedChatEngineKind::SelectionTransform => "selection_transform",
        ManagedChatEngineKind::Assistant => "assistant",
    };
    let input_body = match engine_kind {
        ManagedChatEngineKind::Postprocess => serde_json::json!({ "transcript": transcript }),
        ManagedChatEngineKind::SelectionTransform => {
            let instruction = clean_env_value(input.instruction).ok_or_else(|| {
                error(
                    "FIXVOX_SELECTION_TRANSFORM_INSTRUCTION_MISSING",
                    "Managed Fixvox selection transform requires an instruction.",
                )
            })?;
            serde_json::json!({
                "selectedText": transcript,
                "instruction": instruction,
                "presetKey": input.preset_key.and_then(|value| clean_env_value(Some(value)))
            })
        }
        ManagedChatEngineKind::Assistant => serde_json::json!({
            "utterance": transcript,
            "conversationSummary": input.conversation_summary.and_then(|value| clean_env_value(Some(value)))
        }),
    };
    let body = serde_json::json!({
        "operationId": format!("desktop-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos()),
        "kind": kind,
        "input": input_body
    });
    let headers = vec![
        ("Content-Type".to_string(), "application/json".to_string()),
        ("X-Device-Id".to_string(), device_id),
    ];

    Ok(ManagedChatRequestPreview {
        endpoint: join_url(&config.backend_base_url, "/product/v1/runtime/actions"),
        headers,
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
    let parsed: serde_json::Value = serde_json::from_str(body).map_err(|_| {
        error(
            "FIXVOX_STT_RESPONSE_PARSE_FAILED",
            "Fixvox managed transcription response did not match the expected JSON contract.",
        )
    })?;
    let data = parsed.get("data").unwrap_or(&parsed);
    let text = data
        .get("text")
        .and_then(|value| value.as_str())
        .and_then(|value| clean_env_value(Some(value.to_string())))
        .ok_or_else(|| {
            error(
                "FIXVOX_STT_RESPONSE_TEXT_MISSING",
                "Fixvox managed transcription response did not include transcript text.",
            )
        })?;
    Ok(ManagedSttParsedResponse { text, model: None })
}

pub(crate) fn parse_managed_chat_json_response(
    body: &str,
) -> Result<ManagedChatParsedResponse, FixvoxCloudError> {
    let parsed: serde_json::Value = serde_json::from_str(body).map_err(|_| {
        error(
            "FIXVOX_CHAT_RESPONSE_PARSE_FAILED",
            "Fixvox managed chat response did not match the expected JSON contract.",
        )
    })?;
    let canonical = parsed.get("data").and_then(|data| data.get("output"));
    let output = canonical
        .and_then(|value| value.get("text").or_else(|| value.get("reply")))
        .and_then(|value| value.as_str())
        .or_else(|| {
            parsed
                .get("choices")
                .and_then(|value| value.get(0))
                .and_then(|value| value.get("message"))
                .and_then(|value| value.get("content"))
                .and_then(|value| value.as_str())
        })
        .and_then(|value| clean_env_value(Some(value.to_string())))
        .ok_or_else(|| {
            error(
                "FIXVOX_CHAT_RESPONSE_TEXT_MISSING",
                "Fixvox managed chat response did not include output text.",
            )
        })?;
    Ok(ManagedChatParsedResponse {
        output,
        model: None,
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
    let parse_timing_ms = |name: &str| -> Option<u64> {
        header(name)
            .and_then(|value| value.parse::<f64>().ok())
            .filter(|value| value.is_finite() && *value >= 0.0 && *value <= u64::MAX as f64)
            .map(|value| value.round() as u64)
    };

    FixvoxResponseMetadata {
        fixvox_request_id: header("X-Fixvox-Request-Id"),
        provider_request_id: header("X-Provider-Request-Id"),
        cost_usd: header("X-Fixvox-Cost-Usd"),
        pricing_source: header("X-Fixvox-Pricing-Source"),
        limit: parse_u64("X-Fixvox-Limit"),
        remaining: parse_u64("X-Fixvox-Remaining"),
        reset_at: header("X-Fixvox-Reset-At"),
        usage_key: header("X-Fixvox-Usage-Key"),
        proxy_parse_ms: parse_timing_ms("X-Fixvox-Proxy-Parse-Ms"),
        proxy_usage_ms: parse_timing_ms("X-Fixvox-Proxy-Usage-Ms"),
        proxy_upstream_ms: parse_timing_ms("X-Fixvox-Proxy-Upstream-Ms"),
        proxy_engine_binding_ms: parse_timing_ms("X-Fixvox-Proxy-Engine-Binding-Ms"),
        proxy_prompt_resolution_ms: parse_timing_ms("X-Fixvox-Proxy-Prompt-Resolution-Ms"),
        proxy_budget_config_ms: parse_timing_ms("X-Fixvox-Proxy-Budget-Config-Ms"),
        proxy_budget_events_ms: parse_timing_ms("X-Fixvox-Proxy-Budget-Events-Ms"),
        proxy_multipart_ms: parse_timing_ms("X-Fixvox-Proxy-Multipart-Ms"),
        proxy_budget_ms: parse_timing_ms("X-Fixvox-Proxy-Budget-Ms"),
        proxy_init_ms: parse_timing_ms("X-Fixvox-Proxy-Init-Ms"),
        proxy_total_ms: parse_timing_ms("X-Fixvox-Proxy-Total-Ms"),
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

fn validate_product_verification_uri(
    base_url: &str,
    verification_uri: &str,
) -> Result<String, FixvoxCloudError> {
    let base = reqwest::Url::parse(base_url).map_err(|_| {
        error(
            "FIXVOX_LOGIN_START_INVALID",
            "Fixvox product login origin was invalid.",
        )
    })?;
    let verification = reqwest::Url::parse(verification_uri).map_err(|_| {
        error(
            "FIXVOX_LOGIN_START_INVALID",
            "Fixvox product login verification URI was invalid.",
        )
    })?;
    let same_origin = base.scheme() == verification.scheme()
        && base.host_str() == verification.host_str()
        && base.port_or_known_default() == verification.port_or_known_default();
    if !same_origin
        || !verification
            .path()
            .starts_with("/product/v1/desktop/auth/browser/")
        || !verification.username().is_empty()
        || verification.password().is_some()
    {
        return Err(error(
            "FIXVOX_LOGIN_START_INVALID",
            "Fixvox product login verification URI was not trusted.",
        ));
    }
    Ok(verification.to_string())
}

fn build_fixvox_login_verification_url(base_url: &str, state_nonce: &str) -> String {
    format!(
        "{}?flow=device-code&client=fixvox-tauri&state={}",
        join_url(base_url, "/desktop/login"),
        state_nonce,
    )
}

fn build_fixvox_login_status_url(base_url: &str, state_nonce: &str) -> String {
    format!(
        "{}?state={}",
        join_url(base_url, "/desktop/login/status"),
        state_nonce,
    )
}

fn device_state_has_signed_in_auth_policy(
    env_lookup: &(dyn Fn(&str) -> Option<String> + Sync),
) -> Result<bool, FixvoxCloudError> {
    let path = resolve_device_state_path(env_lookup)?;
    let Some(state) = read_device_state(&path)? else {
        return Ok(false);
    };
    Ok(state
        .auth_policy
        .as_ref()
        .map(|auth| auth.access_mode == "signed_in")
        .unwrap_or(false))
}

fn build_auth_session_status(
    path: PathBuf,
    state: Option<&FixvoxAuthSessionState>,
) -> FixvoxAuthSessionStatus {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("fixvox-auth-session.v1.json");

    match state {
        Some(state) => FixvoxAuthSessionStatus {
            status: state.status.clone(),
            flow: Some(state.flow.clone()),
            user_redacted: redact_identifier(
                state.user_id.as_deref().or(state.user_email.as_deref()),
            ),
            session_id_redacted: redact_identifier(Some(&state.session_id)),
            state_redacted: redact_identifier(Some(&state.state_nonce)),
            expires_at: state.expires_at.clone(),
            secrets_present: state.session_secret.is_some() || state.refresh_secret.is_some(),
            session_path: format!("{} · host app data", file_name),
            redacted: true,
        },
        None => FixvoxAuthSessionStatus {
            status: "signed_out".to_string(),
            flow: None,
            user_redacted: None,
            session_id_redacted: None,
            state_redacted: None,
            expires_at: None,
            secrets_present: false,
            session_path: format!("{} · host app data", file_name),
            redacted: true,
        },
    }
}

fn build_fixvox_login_start_status(
    session_id: &str,
    state_nonce: &str,
    browser_opened: bool,
) -> FixvoxCloudLoginStartStatus {
    FixvoxCloudLoginStartStatus {
        flow: "product_auth_handoff".to_string(),
        verification_url_redacted: join_url(
            PREFERRED_FIXVOX_BACKEND_URL,
            "/product/v1/desktop/auth/browser/redacted",
        ),
        browser_opened,
        polling_interval_seconds: 3,
        expires_in_seconds: 600,
        session_id_redacted: redact_identifier(Some(session_id))
            .unwrap_or_else(|| "redacted".to_string()),
        state_redacted: redact_identifier(Some(state_nonce))
            .unwrap_or_else(|| "redacted".to_string()),
        redacted: true,
    }
}

fn generate_login_state_nonce() -> String {
    format!(
        "fxv_{}_{}",
        current_unix_timestamp_string(),
        std::process::id(),
    )
}

fn generate_login_session_id() -> String {
    format!(
        "fxv_session_{}_{}",
        current_unix_timestamp_string(),
        std::process::id(),
    )
}

pub(crate) fn open_external_browser_url(url: &str) -> Result<(), FixvoxCloudError> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler").arg(url);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(url);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };

    command.spawn().map(|_| ()).map_err(|_| {
        error(
            "FIXVOX_LOGIN_BROWSER_OPEN_FAILED",
            "Fixvox login could not open the external browser.",
        )
    })
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
    fn policy_template_aliases_and_admin_settings_capability_stay_aligned() {
        let alpha_basic = product_capabilities_for_policy_template("alpha-basic");
        let alpha_full = product_capabilities_for_policy_template("alpha-full");
        let power_admin = product_capabilities_for_policy_template("power-admin");

        assert!(alpha_basic.contains(&"dictation".to_string()));
        assert!(!alpha_basic.contains(&"selection_transform".to_string()));
        assert!(alpha_full.contains(&"selection_transform".to_string()));
        assert!(!alpha_full.contains(&"admin_settings".to_string()));
        assert!(power_admin.contains(&"admin_settings".to_string()));
    }

    #[test]
    fn signed_in_policy_refresh_links_user_group_template_and_limits_redacted() {
        let snapshot = DeviceRegisterSnapshot {
            ok: true,
            device_id: "dev_test_pro".to_string(),
            activated: true,
            policy_id: "pro".to_string(),
            policy_label: "Pro".to_string(),
            auth: json!({
                "accessMode": "signed_in",
                "userId": "user_sensitive_1234567890",
                "userEmail": "jp@example.invalid",
                "groupLabel": "Founders",
                "policyTemplateId": "pro",
                "policyTemplateLabel": "Pro"
            }),
            features: json!({ "managedTranscription": true, "debugTools": false }),
            defaults: json!({}),
            limits: json!({ "monthlyMinutes": 1500, "maxAudioSeconds": 180 }),
            telemetry: json!({}),
            transport_policy: json!({ "speech": { "mode": "proxied", "provider": "groq" } }),
            transcript: None,
            voice_policy: None,
            voice_routing: None,
            speech: None,
            prompts: None,
            user_settings_defaults: None,
        };

        let config = FixvoxCloudRuntimeConfig {
            backend_base_url: PREFERRED_FIXVOX_BACKEND_URL.to_string(),
            install_id: "install_test".to_string(),
            device_id: None,
        };
        let state = build_device_state_from_register(&config, &snapshot);
        let status = build_cloud_status(
            PathBuf::from("C:/Users/JP/AppData/Roaming/dictation-tauri/fixvox-device-state.json"),
            state,
            PREFERRED_FIXVOX_BACKEND_URL.to_string(),
        );
        let auth_policy = status
            .auth_policy
            .expect("signed-in policy is exposed redacted");
        let serialized = serde_json::to_string(&auth_policy).expect("auth policy serializes");

        assert_eq!(auth_policy.access_mode, "signed_in");
        assert_eq!(auth_policy.user_redacted, Some("user_s…7890".to_string()));
        assert_eq!(auth_policy.group_label, Some("Founders".to_string()));
        assert_eq!(auth_policy.policy_template_id, Some("pro".to_string()));
        assert!(auth_policy
            .capabilities
            .contains(&"managed_stt".to_string()));
        assert_eq!(
            auth_policy.limits,
            Some(json!({ "monthlyMinutes": 1500, "maxAudioSeconds": 180 }))
        );
        assert!(!serialized.contains("user_sensitive_1234567890"));
        assert!(!serialized.contains("jp@example.invalid"));
    }

    #[test]
    fn auth_policy_honors_explicit_empty_capabilities() {
        let snapshot = DeviceRegisterSnapshot {
            ok: true,
            device_id: "dev_auth_basic".to_string(),
            activated: true,
            policy_id: "alpha-basic".to_string(),
            policy_label: "Alpha Basic".to_string(),
            auth: json!({
                "accessMode": "signed_in",
                "userRedacted": "user redacted",
                "policyTemplateId": "alpha-basic",
                "policyTemplateLabel": "Alpha Basic",
                "capabilities": []
            }),
            features: json!({ "managedTranscription": true }),
            defaults: json!({}),
            limits: json!({}),
            telemetry: json!({}),
            transport_policy: json!({ "speech": { "mode": "proxied" } }),
            transcript: None,
            voice_policy: None,
            voice_routing: None,
            speech: None,
            prompts: None,
            user_settings_defaults: None,
        };
        let config = FixvoxCloudRuntimeConfig {
            backend_base_url: PREFERRED_FIXVOX_BACKEND_URL.to_string(),
            install_id: "install_test".to_string(),
            device_id: None,
        };
        let state = build_device_state_from_register(&config, &snapshot);
        let auth_policy = state.auth_policy.expect("signed-in auth policy");
        assert!(auth_policy.capabilities.is_empty());
    }

    #[test]
    fn auth_policy_required_capabilities_fail_closed_by_operation() {
        let mut state = FixvoxDeviceState {
            install_id: "install_test".to_string(),
            device_id: Some("dev_test".to_string()),
            last_register_ok: true,
            last_register_error_code: None,
            last_register_error_message: None,
            policy_id: Some("translate-only".to_string()),
            policy_label: Some("Translate only".to_string()),
            transport_policy: Some(json!({ "speech": { "mode": "proxied" } })),
            policy_snapshot: Some(FixvoxPolicySnapshot {
                policy_id: Some("translate-only".to_string()),
                policy_label: Some("Translate only".to_string()),
                features: Some(json!({ "managedTranscription": true })),
                capabilities: FixvoxPolicyCapabilities {
                    can_use_managed_transcription: true,
                    can_see_advanced_settings: false,
                    can_use_debug_tools: false,
                },
                transport_policy: Some(json!({ "speech": { "mode": "proxied" } })),
                runtime_policy: None,
                fetched_at: "test".to_string(),
                trust: "fresh".to_string(),
                stale: false,
                error: None,
            }),
            auth_policy: Some(FixvoxAuthPolicyStatus {
                access_mode: "signed_in".to_string(),
                user_redacted: Some("user_t…7890".to_string()),
                group_label: Some("Translators".to_string()),
                policy_template_id: Some("translate-only".to_string()),
                policy_template_label: Some("Translate only".to_string()),
                capabilities: vec!["translate".to_string(), "managed_llm".to_string()],
                limits: None,
                redacted: true,
            }),
        };

        let denied = policy_allows_managed_operation(&state, "dictation")
            .expect_err("translate-only must not unlock dictation/STT");
        assert_eq!(denied.code, "FIXVOX_CAPABILITY_NOT_ALLOWED");
        policy_allows_managed_operation(&state, "translate").expect("translate lane is allowed");

        state
            .auth_policy
            .as_mut()
            .expect("auth policy")
            .capabilities = vec![
            "dictation".to_string(),
            "managed_stt".to_string(),
            "postprocess".to_string(),
        ];
        let denied = policy_allows_managed_operation(&state, "postprocess")
            .expect_err("postprocess also requires managed_llm");
        assert_eq!(denied.code, "FIXVOX_CAPABILITY_NOT_ALLOWED");
    }

    #[test]
    fn auth_session_status_never_exposes_host_owned_secrets() {
        let state = FixvoxAuthSessionState {
            status: "signed_in".to_string(),
            flow: "device_code_polling".to_string(),
            session_id: "fxv_session_sensitive_1234567890".to_string(),
            state_nonce: "fxv_state_sensitive_1234567890".to_string(),
            user_id: Some("user_sensitive_1234567890".to_string()),
            user_email: Some("jp@example.invalid".to_string()),
            session_secret: Some("secret-session-material".to_string()),
            refresh_secret: Some("secret-refresh-material".to_string()),
            issued_at: "unix:1".to_string(),
            expires_at: Some("unix:2".to_string()),
        };

        let status = build_auth_session_status(
            PathBuf::from(
                "C:/Users/JP/AppData/Roaming/dictation-tauri/fixvox-auth-session.v1.json",
            ),
            Some(&state),
        );
        let serialized = serde_json::to_string(&status).expect("status serializes");

        assert!(status.redacted);
        assert!(status.secrets_present);
        assert_eq!(
            status.session_path,
            "fixvox-auth-session.v1.json · host app data"
        );
        assert!(!serialized.contains("secret-session-material"));
        assert!(!serialized.contains("secret-refresh-material"));
        assert!(!serialized.contains("jp@example.invalid"));
        assert!(!serialized.contains("user_sensitive_1234567890"));
        assert!(!serialized.contains("fxv_session_sensitive_1234567890"));
        assert!(!serialized.contains("fxv_state_sensitive_1234567890"));
    }

    #[test]
    fn product_auth_verification_uri_requires_the_configured_origin() {
        let trusted = validate_product_verification_uri(
            "https://auth.fixture.test",
            "https://auth.fixture.test/product/v1/desktop/auth/browser/handoff",
        )
        .expect("same-origin product auth URI should be accepted");
        assert_eq!(
            trusted,
            "https://auth.fixture.test/product/v1/desktop/auth/browser/handoff"
        );
        let rejected = validate_product_verification_uri(
            "https://auth.fixture.test",
            "https://evil.fixture.test/product/v1/desktop/auth/browser/handoff",
        )
        .expect_err("cross-origin auth URI must fail closed");
        assert_eq!(rejected.code, "FIXVOX_LOGIN_START_INVALID");
        let status = build_fixvox_login_start_status("session", "handoff", false);
        assert_eq!(status.flow, "product_auth_handoff");
        assert!(status
            .verification_url_redacted
            .ends_with("/product/v1/desktop/auth/browser/redacted"));
    }

    fn setup_test_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "dictation-tauri-setup-readiness-{label}-{}-{}",
            std::process::id(),
            current_unix_timestamp()
        ));
        std::fs::create_dir_all(&root).expect("setup test root");
        root
    }

    fn setup_env(root: PathBuf) -> impl Fn(&str) -> Option<String> + Sync {
        move |key| (key == "APPDATA").then(|| root.to_string_lossy().to_string())
    }

    #[test]
    fn setup_readiness_persists_welcome_for_a_clean_install() {
        let root = setup_test_root("clean");
        let env = setup_env(root.clone());

        let readiness = get_fixvox_setup_readiness_with_env(&env).expect("clean install readiness");
        let persisted =
            read_setup_readiness_state(&resolve_setup_readiness_path(&env).expect("setup path"))
                .expect("persisted setup state")
                .expect("setup state exists");

        assert_eq!(readiness, build_setup_readiness("welcome"));
        assert_eq!(persisted.phase, "welcome");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn setup_readiness_restores_a_persisted_phase() {
        let root = setup_test_root("resume");
        let env = setup_env(root.clone());
        let path = resolve_setup_readiness_path(&env).expect("setup path");
        persist_setup_readiness_state(
            &path,
            &FixvoxSetupReadinessState {
                schema_version: FIXVOX_SETUP_READINESS_SCHEMA_VERSION,
                phase: "shortcut_setup".to_string(),
            },
        )
        .expect("persist phase");

        assert_eq!(
            get_fixvox_setup_readiness_with_env(&env).expect("resumed readiness"),
            build_setup_readiness("shortcut_setup")
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn setup_readiness_migrates_legacy_signed_in_context_to_ready() {
        let root = setup_test_root("legacy");
        let env = setup_env(root.clone());
        let device_path = resolve_device_state_path(&env).expect("device path");
        let auth_path = resolve_auth_session_state_path(&env).expect("auth path");
        persist_device_state(
            &device_path,
            &FixvoxDeviceState {
                install_id: "install_sensitive".to_string(),
                device_id: Some("device_sensitive".to_string()),
                last_register_ok: true,
                last_register_error_code: None,
                last_register_error_message: None,
                policy_id: None,
                policy_label: None,
                transport_policy: None,
                policy_snapshot: None,
                auth_policy: Some(FixvoxAuthPolicyStatus {
                    access_mode: "signed_in".to_string(),
                    user_redacted: None,
                    group_label: None,
                    policy_template_id: None,
                    policy_template_label: None,
                    capabilities: vec![],
                    limits: None,
                    redacted: true,
                }),
            },
        )
        .expect("legacy device state");
        persist_auth_session_state(
            &auth_path,
            &FixvoxAuthSessionState {
                status: "signed_in".to_string(),
                flow: "desktop_login".to_string(),
                session_id: "session_sensitive".to_string(),
                state_nonce: "nonce_sensitive".to_string(),
                user_id: None,
                user_email: None,
                session_secret: Some("secret".to_string()),
                refresh_secret: None,
                issued_at: "0".to_string(),
                expires_at: None,
            },
        )
        .expect("legacy auth state");

        assert_eq!(
            get_fixvox_setup_readiness_with_env(&env).expect("legacy readiness"),
            build_setup_readiness("ready")
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn stale_ready_and_corrupt_state_fail_closed_without_leaking_content() {
        let root = setup_test_root("closed");
        let env = setup_env(root.clone());
        let path = resolve_setup_readiness_path(&env).expect("setup path");
        persist_setup_readiness_state(
            &path,
            &FixvoxSetupReadinessState {
                schema_version: FIXVOX_SETUP_READINESS_SCHEMA_VERSION,
                phase: "ready".to_string(),
            },
        )
        .expect("persist stale ready");
        assert_eq!(
            get_fixvox_setup_readiness_with_env(&env).expect("stale readiness"),
            build_setup_readiness("service_unavailable")
        );

        std::fs::write(&path, "raw-token-and-device-sensitive").expect("corrupt setup state");
        let serialized = serde_json::to_string(
            &get_fixvox_setup_readiness_with_env(&env).expect("corrupt readiness"),
        )
        .expect("serialize projection");
        assert_eq!(
            serialized,
            r#"{"schemaVersion":1,"phase":"service_unavailable","ready":false,"redacted":true}"#
        );
        assert!(!serialized.contains("token"));
        assert!(!serialized.contains("device"));
        let _ = std::fs::remove_dir_all(root);
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
            auth_policy: None,
        };

        let denied = policy_allows_managed_transcription(&state)
            .expect_err("failed assignment should fail closed");

        assert_eq!(denied.code, "FIXVOX_POLICY_UNTRUSTED");
    }
}
