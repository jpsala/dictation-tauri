#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub(crate) const PREFERRED_FIXVOX_BACKEND_URL: &str = "https://auth-fixvox.jpsala.dev";
pub(crate) const STALE_FIXVOX_BACKEND_URL: &str = "https://fixvox-api.jpsala.dev";

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

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct FixvoxCloudError {
    pub(crate) code: String,
    pub(crate) message: String,
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
}

pub(crate) type DeviceRegisterSnapshot = DeviceRegisterResponseFixture;

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
}

pub(crate) trait DeviceRegisterHttpClient {
    fn post_json(
        &self,
        endpoint: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, FixvoxCloudError>;
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

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ManagedSttInput {
    pub(crate) audio_file_name: String,
    pub(crate) model: String,
    pub(crate) language: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ManagedSttRequestPreview {
    pub(crate) endpoint: String,
    pub(crate) headers: Vec<(String, String)>,
    pub(crate) has_authorization_header: bool,
    pub(crate) multipart_fields: Vec<String>,
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

pub(crate) fn register_device_with_client(
    client: &dyn DeviceRegisterHttpClient,
    config: &FixvoxCloudRuntimeConfig,
    input: DeviceRegisterInput,
) -> Result<DeviceRegisterSnapshot, FixvoxCloudError> {
    let endpoint = join_url(&config.backend_base_url, "/v2/device/register");
    let request = build_device_register_request(input)?;
    let body = serde_json::to_value(request).map_err(|_| {
        error(
            "FIXVOX_DEVICE_REGISTER_SERIALIZE_FAILED",
            "Fixvox device register request could not be serialized.",
        )
    })?;
    let response = client.post_json(&endpoint, body)?;

    serde_json::from_value(response).map_err(|_| {
        error(
            "FIXVOX_DEVICE_REGISTER_RESPONSE_INVALID",
            "Fixvox device register response did not match the expected contract.",
        )
    })
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
    FixvoxDeviceState {
        install_id: config.install_id.clone(),
        device_id: Some(snapshot.device_id.clone()),
        last_register_ok: snapshot.ok,
        last_register_error_code: None,
        last_register_error_message: None,
        policy_id: Some(snapshot.policy_id.clone()),
        policy_label: Some(snapshot.policy_label.clone()),
        transport_policy: Some(snapshot.transport_policy.clone()),
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
    }
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

    let mut multipart_fields = vec![
        "file".to_string(),
        "model".to_string(),
        "response_format".to_string(),
    ];
    if input
        .language
        .as_ref()
        .and_then(|value| clean_env_value(Some(value.clone())))
        .is_some()
    {
        multipart_fields.push("language".to_string());
    }

    Ok(ManagedSttRequestPreview {
        endpoint: join_url(&config.backend_base_url, "/v1/audio/transcriptions"),
        headers: vec![("X-Device-Id".to_string(), device_id)],
        has_authorization_header: false,
        multipart_fields,
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
