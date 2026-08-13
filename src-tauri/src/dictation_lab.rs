use serde::Deserialize;

use crate::fixvox_cloud::{request_authenticated_product_json, FixvoxCloudError};

const CONTROL_ROOM_PREFIX: &str = "/product/v1/control-room";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum DictationLabRequest {
    Session,
    Profiles,
    Configuration,
    EngineCatalog,
    Accounts,
    Devices,
    Audit,
    Usage,
    Pricing,
    ValidateProfile {
        profile_id: String,
        expected_revision: u64,
        definition: serde_json::Value,
    },
    PreviewProfile {
        profile_id: String,
        expected_revision: u64,
        base_version: Option<u64>,
        definition: serde_json::Value,
    },
    ApplyProfile {
        profile_id: String,
        expected_revision: u64,
        definition: serde_json::Value,
        confirmation: serde_json::Value,
    },
    RollbackProfile {
        profile_id: String,
        expected_revision: u64,
        target_version: u64,
        confirmation: serde_json::Value,
    },
    AssignAccount {
        account_handle: String,
        policy_id: String,
        policy_label: Option<String>,
    },
}

fn profile_id(value: &str) -> Result<&str, FixvoxCloudError> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 64
        || !value.as_bytes()[0].is_ascii_lowercase() && !value.as_bytes()[0].is_ascii_digit()
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(FixvoxCloudError {
            code: "DICTATION_LAB_PROFILE_INVALID".to_string(),
            message: "The laboratory profile identifier is invalid.".to_string(),
            redacted: true,
        });
    }
    Ok(value)
}

fn account_handle(value: &str) -> Result<&str, FixvoxCloudError> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 64
        || !value.bytes().all(|byte| {
            byte.is_ascii_lowercase()
                || byte.is_ascii_digit()
                || byte == b'-'
                || byte == b'_'
        })
    {
        return Err(FixvoxCloudError {
            code: "DICTATION_LAB_ACCOUNT_INVALID".to_string(),
            message: "The laboratory account identifier is invalid.".to_string(),
            redacted: true,
        });
    }
    Ok(value)
}

#[tauri::command]
pub async fn request_dictation_lab(
    request: DictationLabRequest,
) -> Result<serde_json::Value, FixvoxCloudError> {
    let (method, path, body) = match request {
        DictationLabRequest::Session => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/session"), None),
        DictationLabRequest::Profiles => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/profiles"), None),
        DictationLabRequest::Configuration => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/configuration"), None),
        DictationLabRequest::EngineCatalog => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/engine-catalog"), None),
        DictationLabRequest::Accounts => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/accounts"), None),
        DictationLabRequest::Devices => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/devices"), None),
        DictationLabRequest::Audit => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/audit"), None),
        DictationLabRequest::Usage => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/usage"), None),
        DictationLabRequest::Pricing => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/pricing"), None),
        DictationLabRequest::ValidateProfile { profile_id: id, expected_revision, definition } => {
            let id = profile_id(&id)?;
            (
                reqwest::Method::POST,
                format!("{CONTROL_ROOM_PREFIX}/profiles/{id}/validate"),
                Some(serde_json::json!({
                    "expectedRevision": expected_revision,
                    "definition": definition,
                })),
            )
        }
        DictationLabRequest::PreviewProfile { profile_id: id, expected_revision, base_version, definition } => {
            let id = profile_id(&id)?;
            let mut body = serde_json::json!({
                "expectedRevision": expected_revision,
                "definition": definition,
            });
            if let Some(version) = base_version {
                body["baseVersion"] = serde_json::json!(version);
            }
            (
                reqwest::Method::POST,
                format!("{CONTROL_ROOM_PREFIX}/profiles/{id}/preview"),
                Some(body),
            )
        }
        DictationLabRequest::ApplyProfile { profile_id: id, expected_revision, definition, confirmation } => {
            let id = profile_id(&id)?;
            (
                reqwest::Method::POST,
                format!("{CONTROL_ROOM_PREFIX}/profiles/{id}/apply"),
                Some(serde_json::json!({
                    "expectedRevision": expected_revision,
                    "definition": definition,
                    "confirmation": confirmation,
                })),
            )
        }
        DictationLabRequest::RollbackProfile { profile_id: id, expected_revision, target_version, confirmation } => {
            let id = profile_id(&id)?;
            (
                reqwest::Method::POST,
                format!("{CONTROL_ROOM_PREFIX}/profiles/{id}/rollback"),
                Some(serde_json::json!({
                    "expectedRevision": expected_revision,
                    "targetVersion": target_version,
                    "confirmation": confirmation,
                })),
            )
        }
        DictationLabRequest::AssignAccount { account_handle: handle, policy_id: id, policy_label } => {
            let handle = account_handle(&handle)?;
            let id = profile_id(&id)?;
            (
                reqwest::Method::POST,
                "/admin/control-plane/accounts/policy".to_string(),
                Some(serde_json::json!({
                    "accountHandle": handle,
                    "policyId": id,
                    "policyLabel": policy_label,
                })),
            )
        }
    };

    request_authenticated_product_json(method, &path, body).await
}
