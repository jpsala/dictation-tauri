use std::{
    fs,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

use crate::{
    dictation_lab::{LabExperimentDefinition, LabExperimentEstimate, LabJobSnapshot},
    fixvox_cloud::request_authenticated_product_json,
};

const PROVIDER_FREE_MODE: &str = "provider-free-replay";
const PROVIDER_REAL_MODE: &str = "provider-real";
const PROVIDER_REAL_GATE_B_MODE: &str = "provider-real-gate-b";
const PROVIDER_FREE_CORPUS: &str = "synthetic-audio-stt";
const PROVIDER_FREE_STT_RECIPE: &str = "provider-free-manifest-replay";
const PROVIDER_FREE_SAMPLE_IDS: &[&str] = &["en-clean-note", "es-short-reminder"];
const MATERIALIZATION_IDENTITY: &str = "identity";
const POSTPROCESS_PLAIN: &str = "transcription-quality-v1-postprocess-120b-plain";
const REAL_CORPUS: &str = "transcription-quality-local-human";
const REAL_SAMPLE_IDS: &[&str] = &[
    "jp-quality-bilingual-technical-20260812",
    "jp-quality-punctuation-list-20260812",
    "jp-quality-model-comparison-20260812",
];
const REAL_STT_RECIPES: &[&str] = &[STT_SHORT_AUTO, STT_RICH_AUTO, STT_SHORT_ES, STT_RICH_ES];
const REAL_COST_CAP_USD: f64 = 0.005;
const POSTPROCESS_PROSODY: &str = "transcription-quality-v1-postprocess-120b-prosody";
const STT_SHORT_AUTO: &str = "transcription-quality-v1-short-auto";
const STT_RICH_AUTO: &str = "transcription-quality-v1-rich-auto";
const STT_SHORT_ES: &str = "transcription-quality-v1-short-es";
const STT_RICH_ES: &str = "transcription-quality-v1-rich-es";
const PRIVATE_EXECUTION_ROOT: &str = "artifacts/transcription-quality/laboratory-executions";
const MAX_PRIVATE_EVIDENCE_BYTES: u64 = 1024 * 1024;
pub(crate) fn now_iso() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = seconds / 86_400;
    let day_seconds = seconds % 86_400;
    let z = days as i64 + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let month_part = (5 * doy + 2) / 153;
    let day = doy - (153 * month_part + 2) / 5 + 1;
    let month = month_part + if month_part < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        day_seconds / 3_600,
        (day_seconds % 3_600) / 60,
        day_seconds % 60
    )
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabExecutionGrant {
    pub schema_version: u32,
    pub grant_token: String,
}

impl LabExecutionGrant {
    fn is_opaque_valid(&self) -> bool {
        self.schema_version == 1
            && !self.grant_token.trim().is_empty()
            && self.grant_token.len() <= 4096
            && !self.grant_token.chars().any(char::is_whitespace)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaboratoryExecutionStartData {
    execution_id: String,
    definition_hash: String,
    estimate_hash: String,
    bounds: LaboratoryExecutionBounds,
    expires_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaboratoryExecutionBounds {
    max_requests: usize,
    max_cost_usd: f64,
}

#[derive(Debug, Clone)]
struct AuthoritativeExecution {
    execution_id: String,
    definition_hash: String,
    estimate_hash: String,
    max_requests: usize,
    max_cost_usd: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CanonicalRawMapping {
    sample_id: String,
    candidate_id: String,
    raw_ref: String,
    local_ref: String,
    sha256: String,
    byte_length: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PrivateExecutionBinding {
    schema_version: u8,
    execution_id: String,
    local_evidence_run_id: String,
    kind: String,
    definition_hash: String,
    estimate_hash: String,
    source_gate_a_execution_id: Option<String>,
    status: String,
    canonical_raw_mappings: Vec<CanonicalRawMapping>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompletionResponseData {
    execution_id: String,
    status: String,
    completed_request_count: usize,
    canonical_raw_refs: Vec<CanonicalRawRefResponse>,
    idempotent_replay: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CanonicalRawRefResponse {
    sample_id: String,
    candidate_id: String,
    raw_ref: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabGateSource {
    execution_id: String,
    kind: String,
    status: String,
    completed_request_count: usize,
    canonical_raw_ref_count: usize,
}
pub(crate) fn sha256_hex(input: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut message = input.to_vec();
    let bit_len = (message.len() as u64).saturating_mul(8);
    message.push(0x80);
    while message.len() % 64 != 56 {
        message.push(0);
    }
    message.extend_from_slice(&bit_len.to_be_bytes());
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    for chunk in message.chunks_exact(64) {
        let mut w = [0u32; 64];
        for (index, bytes) in chunk.chunks_exact(4).take(16).enumerate() {
            w[index] = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        }
        for index in 16..64 {
            let s0 = w[index - 15].rotate_right(7)
                ^ w[index - 15].rotate_right(18)
                ^ (w[index - 15] >> 3);
            let s1 = w[index - 2].rotate_right(17)
                ^ w[index - 2].rotate_right(19)
                ^ (w[index - 2] >> 10);
            w[index] = w[index - 16]
                .wrapping_add(s0)
                .wrapping_add(w[index - 7])
                .wrapping_add(s1);
        }
        let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) =
            (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);
        for index in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[index])
                .wrapping_add(w[index]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);
            (hh, g, f, e, d, c, b, a) = (
                g,
                f,
                e,
                d.wrapping_add(temp1),
                c,
                b,
                a,
                temp1.wrapping_add(temp2),
            );
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }
    h.iter().map(|word| format!("{word:08x}")).collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationLabJobError {
    pub code: String,
}

impl DictationLabJobError {
    fn new(code: &'static str) -> Self {
        Self {
            code: code.to_string(),
        }
    }
}

#[derive(Debug)]
struct ActiveJob {
    snapshot: LabJobSnapshot,
    child: Option<Arc<Mutex<Child>>>,
    execution: Option<AuthoritativeExecution>,
}

static ACTIVE_JOB: OnceLock<Mutex<Option<ActiveJob>>> = OnceLock::new();

fn active_job() -> &'static Mutex<Option<ActiveJob>> {
    ACTIVE_JOB.get_or_init(|| Mutex::new(None))
}

fn is_nonempty_unique(values: &[String]) -> bool {
    !values.is_empty()
        && values.iter().all(|value| !value.trim().is_empty())
        && values.windows(2).all(|pair| pair[0] != pair[1])
}

fn all_in(values: &[String], allowed: &[&str]) -> bool {
    values.iter().all(|value| allowed.contains(&value.as_str()))
}
fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub(crate) fn stable_json(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Array(values) => {
            format!(
                "[{}]",
                values.iter().map(stable_json).collect::<Vec<_>>().join(",")
            )
        }
        serde_json::Value::Object(values) => {
            let mut keys = values.keys().collect::<Vec<_>>();
            keys.sort_unstable();
            format!(
                "{{{}}}",
                keys.into_iter()
                    .map(|key| format!(
                        "{}:{}",
                        serde_json::to_string(key).unwrap_or_default(),
                        stable_json(&values[key])
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        _ => serde_json::to_string(value).unwrap_or_default(),
    }
}

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn valid_execution_id(value: &str) -> bool {
    value.len() == 36
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
}

fn binding_path(execution_id: &str) -> Result<PathBuf, DictationLabJobError> {
    if !valid_execution_id(execution_id) {
        return Err(DictationLabJobError::new(
            "laboratory_execution_source_invalid",
        ));
    }
    Ok(workspace_root()
        .join(PRIVATE_EXECUTION_ROOT)
        .join(format!("{execution_id}.json")))
}

fn persist_binding(binding: &PrivateExecutionBinding) -> Result<(), DictationLabJobError> {
    let path = binding_path(&binding.execution_id)?;
    let parent = path
        .parent()
        .ok_or_else(|| DictationLabJobError::new("laboratory_execution_binding_unavailable"))?;
    fs::create_dir_all(parent)
        .map_err(|_| DictationLabJobError::new("laboratory_execution_binding_unavailable"))?;
    let encoded = serde_json::to_vec_pretty(binding)
        .map_err(|_| DictationLabJobError::new("laboratory_execution_binding_invalid"))?;
    let temporary = path.with_extension(format!("tmp-{}", std::process::id()));
    fs::write(&temporary, encoded)
        .map_err(|_| DictationLabJobError::new("laboratory_execution_binding_unavailable"))?;
    fs::rename(&temporary, &path)
        .map_err(|_| DictationLabJobError::new("laboratory_execution_binding_unavailable"))
}

fn read_binding(execution_id: &str) -> Result<PrivateExecutionBinding, DictationLabJobError> {
    let bytes = fs::read(binding_path(execution_id)?)
        .map_err(|_| DictationLabJobError::new("laboratory_execution_source_invalid"))?;
    if bytes.len() as u64 > MAX_PRIVATE_EVIDENCE_BYTES {
        return Err(DictationLabJobError::new(
            "laboratory_execution_source_invalid",
        ));
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| DictationLabJobError::new("laboratory_execution_source_invalid"))
}

fn read_private_evidence(relative: &str) -> Result<Vec<u8>, DictationLabJobError> {
    if relative.contains('\\')
        || relative
            .split('/')
            .any(|part| part == ".." || part.is_empty())
    {
        return Err(DictationLabJobError::new(
            "laboratory_execution_source_invalid",
        ));
    }
    let root = fs::canonicalize(workspace_root())
        .map_err(|_| DictationLabJobError::new("laboratory_execution_source_invalid"))?;
    let path = fs::canonicalize(root.join(relative))
        .map_err(|_| DictationLabJobError::new("laboratory_execution_source_invalid"))?;
    if !path.starts_with(&root) {
        return Err(DictationLabJobError::new(
            "laboratory_execution_source_invalid",
        ));
    }
    let metadata = fs::metadata(&path)
        .map_err(|_| DictationLabJobError::new("laboratory_execution_source_invalid"))?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_PRIVATE_EVIDENCE_BYTES {
        return Err(DictationLabJobError::new(
            "laboratory_execution_source_invalid",
        ));
    }
    fs::read(path).map_err(|_| DictationLabJobError::new("laboratory_execution_source_invalid"))
}

fn gate_a_evidence(run_id: &str) -> Result<Vec<CanonicalRawMapping>, DictationLabJobError> {
    if !run_id.starts_with("lab-")
        || !run_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err(DictationLabJobError::new(
            "laboratory_execution_source_invalid",
        ));
    }
    let results_path = workspace_root()
        .join("artifacts/transcription-quality")
        .join(run_id)
        .join("results.jsonl");
    let bytes = fs::read(&results_path)
        .map_err(|_| DictationLabJobError::new("laboratory_execution_source_invalid"))?;
    if bytes.len() as u64 > MAX_PRIVATE_EVIDENCE_BYTES * 4 {
        return Err(DictationLabJobError::new(
            "laboratory_execution_source_invalid",
        ));
    }
    let mut all_rows = 0usize;
    let mut evidence = Vec::new();
    for line in String::from_utf8(bytes)
        .map_err(|_| DictationLabJobError::new("laboratory_execution_source_invalid"))?
        .lines()
    {
        let value: serde_json::Value = serde_json::from_str(line)
            .map_err(|_| DictationLabJobError::new("laboratory_execution_source_invalid"))?;
        all_rows += 1;
        if value.get("candidateId").and_then(serde_json::Value::as_str) != Some(STT_SHORT_AUTO) {
            continue;
        }
        let sample_id = value
            .get("sampleId")
            .and_then(serde_json::Value::as_str)
            .filter(|sample_id| REAL_SAMPLE_IDS.contains(sample_id))
            .ok_or_else(|| DictationLabJobError::new("laboratory_execution_source_invalid"))?;
        let local_ref = value
            .get("text")
            .and_then(|text| text.get("rawTranscriptRef"))
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| DictationLabJobError::new("laboratory_execution_source_invalid"))?;
        let raw = read_private_evidence(local_ref)?;
        evidence.push(CanonicalRawMapping {
            sample_id: sample_id.to_string(),
            candidate_id: STT_SHORT_AUTO.to_string(),
            raw_ref: String::new(),
            local_ref: local_ref.to_string(),
            sha256: sha256_hex(&raw),
            byte_length: raw.len() as u64,
        });
    }
    if all_rows != 12
        || evidence.len() != 3
        || !REAL_SAMPLE_IDS
            .iter()
            .enumerate()
            .all(|(index, sample_id)| {
                evidence
                    .get(index)
                    .is_some_and(|item| item.sample_id == *sample_id)
            })
    {
        return Err(DictationLabJobError::new(
            "laboratory_execution_source_invalid",
        ));
    }
    Ok(evidence)
}

async fn complete_gate_a_binding(
    execution: &AuthoritativeExecution,
    run_id: &str,
) -> Result<(), DictationLabJobError> {
    let mut binding = read_binding(&execution.execution_id)?;
    if binding.kind != "gate-a"
        || binding.local_evidence_run_id != run_id
        || binding.definition_hash != execution.definition_hash
        || binding.estimate_hash != execution.estimate_hash
    {
        return Err(DictationLabJobError::new(
            "laboratory_execution_binding_invalid",
        ));
    }
    let evidence = gate_a_evidence(run_id)?;
    let response = request_authenticated_product_json(
        reqwest::Method::POST,
        &format!(
            "/product/v1/control-room/laboratory/executions/{}/completion",
            execution.execution_id
        ),
        Some(serde_json::json!({
            "schemaVersion": 1,
            "kind": "gate-a",
            "definitionHash": execution.definition_hash,
            "estimateHash": execution.estimate_hash,
            "completedRequestCount": 12,
            "rawEvidence": evidence.iter().map(|item| serde_json::json!({
                "sampleId": item.sample_id,
                "candidateId": item.candidate_id,
                "sha256": item.sha256,
                "byteLength": item.byte_length,
            })).collect::<Vec<_>>(),
        })),
    )
    .await
    .map_err(|error| DictationLabJobError { code: error.code })?;
    let completed: CompletionResponseData = serde_json::from_value(
        response
            .get("data")
            .cloned()
            .unwrap_or(serde_json::Value::Null),
    )
    .map_err(|_| DictationLabJobError::new("laboratory_execution_completion_invalid"))?;
    if completed.execution_id != execution.execution_id
        || completed.status != "completed"
        || completed.completed_request_count != 12
        || completed.canonical_raw_refs.len() != 3
    {
        return Err(DictationLabJobError::new(
            "laboratory_execution_completion_invalid",
        ));
    }
    let _ = completed.idempotent_replay;
    for (index, canonical) in completed.canonical_raw_refs.iter().enumerate() {
        let local = evidence
            .get(index)
            .ok_or_else(|| DictationLabJobError::new("laboratory_execution_completion_invalid"))?;
        if canonical.sample_id != local.sample_id
            || canonical.candidate_id != STT_SHORT_AUTO
            || canonical.raw_ref.len() != 69
            || !canonical.raw_ref.starts_with("lraw_")
            || !canonical.raw_ref[5..]
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err(DictationLabJobError::new(
                "laboratory_execution_completion_invalid",
            ));
        }
    }
    binding.status = "completed".to_string();
    binding.canonical_raw_mappings = evidence
        .into_iter()
        .zip(completed.canonical_raw_refs)
        .map(|(mut local, canonical)| {
            local.raw_ref = canonical.raw_ref;
            local
        })
        .collect();
    persist_binding(&binding)
}

async fn complete_gate_b_binding(
    execution: &AuthoritativeExecution,
) -> Result<(), DictationLabJobError> {
    let response = request_authenticated_product_json(
        reqwest::Method::POST,
        &format!(
            "/product/v1/control-room/laboratory/executions/{}/completion",
            execution.execution_id
        ),
        Some(serde_json::json!({
            "schemaVersion": 1,
            "kind": "gate-b",
            "definitionHash": execution.definition_hash,
            "estimateHash": execution.estimate_hash,
            "completedRequestCount": 6,
        })),
    )
    .await
    .map_err(|error| DictationLabJobError { code: error.code })?;
    let data = response
        .get("data")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| DictationLabJobError::new("laboratory_execution_completion_invalid"))?;
    if data.get("executionId").and_then(serde_json::Value::as_str) != Some(&execution.execution_id)
        || data.get("status").and_then(serde_json::Value::as_str) != Some("completed")
        || data
            .get("completedRequestCount")
            .and_then(serde_json::Value::as_u64)
            != Some(6)
    {
        return Err(DictationLabJobError::new(
            "laboratory_execution_completion_invalid",
        ));
    }
    let mut binding = read_binding(&execution.execution_id)?;
    binding.status = "completed".to_string();
    persist_binding(&binding)
}

async fn abort_execution(
    execution: &AuthoritativeExecution,
    reason: &str,
) -> Result<(), DictationLabJobError> {
    if !matches!(
        reason,
        "spawn-failed" | "runner-failed" | "cancelled" | "source-invalid"
    ) {
        return Err(DictationLabJobError::new(
            "laboratory_execution_abort_invalid",
        ));
    }
    request_authenticated_product_json(
        reqwest::Method::POST,
        &format!(
            "/product/v1/control-room/laboratory/executions/{}/abort",
            execution.execution_id
        ),
        Some(serde_json::json!({ "schemaVersion": 1, "reason": reason })),
    )
    .await
    .map_err(|error| DictationLabJobError { code: error.code })?;
    if let Ok(mut binding) = read_binding(&execution.execution_id) {
        binding.status = "aborted".to_string();
        persist_binding(&binding)?;
    }
    Ok(())
}

pub(crate) fn gate_a_wire_definition() -> serde_json::Value {
    serde_json::json!({
        "schemaVersion": 1,
        "id": "transcription-quality-gate-a-v1",
        "sampleIds": REAL_SAMPLE_IDS,
        "sttRecipeIds": REAL_STT_RECIPES,
        "responseText": "kept",
        "postprocessRecipeIds": [],
        "prosodyMode": "off",
        "vocabularyMode": "off",
        "materializationId": "raw-provider-response-v1",
        "estimate": {
            "sampleCount": 3,
            "candidateCount": 4,
            "sttCalls": 12,
            "postprocessCalls": 0,
            "maxRequests": 12,
            "maxCostUsd": 0.005
        }
    })
}

fn hash_definition(definition: &LabExperimentDefinition) -> String {
    let value = if definition.mode == PROVIDER_REAL_MODE {
        gate_a_wire_definition()
    } else {
        serde_json::to_value(definition).unwrap_or(serde_json::Value::Null)
    };
    sha256_hex(stable_json(&value).as_bytes())
}

fn hash_estimate(estimate: &LabExperimentEstimate) -> String {
    let value = serde_json::json!({
        "maxRequests": estimate.max_requests,
        "maxCostUsd": estimate.max_cost_usd,
        "sttCalls": estimate.stt_calls,
        "postprocessCalls": estimate.postprocess_calls
    });
    sha256_hex(stable_json(&value).as_bytes())
}

async fn consume_execution_grant(
    grant: &LabExecutionGrant,
    estimate: &LabExperimentEstimate,
    mode: &str,
) -> Result<AuthoritativeExecution, DictationLabJobError> {
    let response = request_authenticated_product_json(
        reqwest::Method::POST,
        "/product/v1/control-room/laboratory/executions",
        Some(serde_json::json!({
            "schemaVersion": grant.schema_version,
            "grantToken": grant.grant_token,
        })),
    )
    .await
    .map_err(|error| DictationLabJobError { code: error.code })?;
    let data = response
        .get("data")
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let consumed: LaboratoryExecutionStartData = serde_json::from_value(data)
        .map_err(|_| DictationLabJobError::new("laboratory_execution_grant_mismatch"))?;
    if (mode == PROVIDER_REAL_MODE && consumed.definition_hash != estimate.definition_hash)
        || consumed.estimate_hash != hash_estimate(estimate)
        || consumed.bounds.max_requests != estimate.max_requests
        || (consumed.bounds.max_cost_usd - estimate.max_cost_usd).abs() > f64::EPSILON
        || !valid_execution_id(&consumed.execution_id)
        || consumed.expires_at.is_empty()
    {
        return Err(DictationLabJobError::new(
            "laboratory_execution_grant_mismatch",
        ));
    }
    Ok(AuthoritativeExecution {
        execution_id: consumed.execution_id,
        definition_hash: consumed.definition_hash,
        estimate_hash: consumed.estimate_hash,
        max_requests: consumed.bounds.max_requests,
        max_cost_usd: consumed.bounds.max_cost_usd,
    })
}
fn new_job_id(definition_hash: &str) -> String {
    format!(
        "lab-{}-{}",
        &definition_hash[..12.min(definition_hash.len())],
        now_epoch()
    )
}
fn validate_definition(definition: &LabExperimentDefinition) -> Result<(), DictationLabJobError> {
    if definition.schema_version != 1 {
        return Err(DictationLabJobError::new("definition-schema-unsupported"));
    }
    if !matches!(
        definition.mode.as_str(),
        PROVIDER_FREE_MODE | PROVIDER_REAL_MODE | PROVIDER_REAL_GATE_B_MODE
    ) {
        return Err(DictationLabJobError::new("mode-not-allowlisted"));
    }
    if definition.corpus_id.trim().is_empty() || definition.sample_ids.is_empty() {
        return Err(DictationLabJobError::new("corpus-or-samples-invalid"));
    }
    if !is_nonempty_unique(&definition.sample_ids) {
        return Err(DictationLabJobError::new("sample-ids-invalid"));
    }
    if (definition.mode != PROVIDER_REAL_GATE_B_MODE
        && !is_nonempty_unique(&definition.stt_recipes))
        || !is_nonempty_unique(&definition.materializations)
        || !is_nonempty_unique(&definition.prosody_modes)
        || !is_nonempty_unique(&definition.vocabulary_modes)
    {
        return Err(DictationLabJobError::new(
            "definition-dimensions-empty-or-duplicate",
        ));
    }
    if !all_in(
        &definition.stt_recipes,
        &[
            PROVIDER_FREE_STT_RECIPE,
            STT_SHORT_AUTO,
            STT_RICH_AUTO,
            STT_SHORT_ES,
            STT_RICH_ES,
        ],
    ) {
        return Err(DictationLabJobError::new("stt-recipe-not-allowlisted"));
    }
    if !all_in(
        &definition.materializations,
        &[MATERIALIZATION_IDENTITY, "response-text-kept"],
    ) {
        return Err(DictationLabJobError::new("materialization-not-allowlisted"));
    }
    if !all_in(
        &definition.postprocess_recipes,
        &[POSTPROCESS_PLAIN, POSTPROCESS_PROSODY],
    ) || !all_in(&definition.prosody_modes, &["off", "advisory"])
        || !all_in(&definition.vocabulary_modes, &["off", "automatic", "ask"])
    {
        return Err(DictationLabJobError::new("mode-option-not-allowlisted"));
    }
    if definition.mode == PROVIDER_REAL_MODE
        && (definition.corpus_id != REAL_CORPUS
            || definition
                .sample_ids
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                != REAL_SAMPLE_IDS
            || definition
                .stt_recipes
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                != REAL_STT_RECIPES
            || !definition.postprocess_recipes.is_empty()
            || definition.prosody_modes != ["off"]
            || definition.vocabulary_modes != ["off"]
            || definition.materializations != ["response-text-kept"]
            || definition.baseline_candidate_id.is_some()
            || definition.source_gate_a_run_id.is_some())
    {
        return Err(DictationLabJobError::new(
            "provider-real-definition-unsupported",
        ));
    }
    if definition.mode == PROVIDER_REAL_GATE_B_MODE
        && (definition.corpus_id != REAL_CORPUS
            || definition
                .sample_ids
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                != REAL_SAMPLE_IDS
            || !definition.stt_recipes.is_empty()
            || definition.postprocess_recipes != [POSTPROCESS_PLAIN, POSTPROCESS_PROSODY]
            || definition.prosody_modes != ["off"]
            || definition.vocabulary_modes != ["off"]
            || definition.materializations != ["response-text-kept"]
            || definition.baseline_candidate_id.as_deref() != Some(STT_SHORT_AUTO)
            || !definition
                .source_gate_a_run_id
                .as_deref()
                .is_some_and(valid_execution_id))
    {
        return Err(DictationLabJobError::new(
            "provider-real-gate-b-definition-unsupported",
        ));
    }
    if definition.mode == PROVIDER_FREE_MODE
        && (definition.corpus_id != PROVIDER_FREE_CORPUS
            || definition
                .sample_ids
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                != PROVIDER_FREE_SAMPLE_IDS
            || definition.stt_recipes.len() != 1
            || definition.stt_recipes[0] != PROVIDER_FREE_STT_RECIPE
            || definition.materializations.len() != 1
            || definition.materializations[0] != MATERIALIZATION_IDENTITY
            || !definition.postprocess_recipes.is_empty()
            || definition.prosody_modes.len() != 1
            || definition.prosody_modes[0] != "off"
            || definition.vocabulary_modes.len() != 1
            || definition.vocabulary_modes[0] != "off"
            || definition.source_gate_a_run_id.is_some())
    {
        return Err(DictationLabJobError::new(
            "provider-free-definition-unsupported",
        ));
    }
    Ok(())
}

pub fn estimate_definition(
    definition: LabExperimentDefinition,
) -> Result<LabExperimentEstimate, DictationLabJobError> {
    validate_definition(&definition)?;
    let definition_hash = hash_definition(&definition);
    let sample_count = definition.sample_ids.len();
    let gate_b = definition.mode == PROVIDER_REAL_GATE_B_MODE;
    let candidate_count = if gate_b {
        definition.postprocess_recipes.len()
    } else {
        definition
            .stt_recipes
            .len()
            .saturating_mul(definition.materializations.len())
            .saturating_mul(definition.postprocess_recipes.len().max(1))
            .saturating_mul(definition.prosody_modes.len())
            .saturating_mul(definition.vocabulary_modes.len())
    };
    let combination_count = sample_count.saturating_mul(candidate_count);
    let provider_required = matches!(
        definition.mode.as_str(),
        PROVIDER_REAL_MODE | PROVIDER_REAL_GATE_B_MODE
    );
    let stt_calls = if definition.mode == PROVIDER_REAL_MODE {
        sample_count.saturating_mul(definition.stt_recipes.len())
    } else {
        0
    };
    let reused_raw_count = if gate_b || !provider_required {
        sample_count
    } else {
        0
    };
    let postprocess_calls = if gate_b { combination_count } else { 0 };
    let max_requests = stt_calls.saturating_add(postprocess_calls);
    let max_cost_usd = if provider_required {
        REAL_COST_CAP_USD
    } else {
        0.0
    };
    let mut one_variable_warnings = Vec::new();
    if definition.stt_recipes.len() > 1 {
        one_variable_warnings.push("stt-recipe-varies".to_string());
    }
    if definition.materializations.len() > 1 {
        one_variable_warnings.push("materialization-varies".to_string());
    }
    if definition.postprocess_recipes.len() > 1 {
        one_variable_warnings.push("postprocess-recipe-varies".to_string());
    }
    if definition.prosody_modes.len() > 1 {
        one_variable_warnings.push("prosody-varies".to_string());
    }
    if definition.vocabulary_modes.len() > 1 {
        one_variable_warnings.push("vocabulary-varies".to_string());
    }
    Ok(LabExperimentEstimate {
        definition_hash,
        sample_count,
        candidate_count,
        combination_count,
        stt_calls,
        postprocess_calls,
        reused_raw_count,
        max_requests,
        max_cost_usd,
        provider_required,
        one_variable_warnings,
    })
}

#[tauri::command]
pub async fn estimate_dictation_lab_experiment(
    definition: LabExperimentDefinition,
) -> Result<LabExperimentEstimate, DictationLabJobError> {
    estimate_definition(definition)
}

#[tauri::command]
pub fn list_dictation_lab_gate_sources() -> Result<Vec<LabGateSource>, DictationLabJobError> {
    let root = workspace_root().join(PRIVATE_EXECUTION_ROOT);
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut sources = Vec::new();
    for entry in fs::read_dir(root)
        .map_err(|_| DictationLabJobError::new("laboratory_execution_binding_unavailable"))?
        .take(64)
    {
        let path = entry
            .map_err(|_| DictationLabJobError::new("laboratory_execution_binding_unavailable"))?
            .path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let bytes = fs::read(path)
            .map_err(|_| DictationLabJobError::new("laboratory_execution_binding_unavailable"))?;
        if bytes.len() as u64 > MAX_PRIVATE_EVIDENCE_BYTES {
            continue;
        }
        let Ok(binding) = serde_json::from_slice::<PrivateExecutionBinding>(&bytes) else {
            continue;
        };
        sources.push(LabGateSource {
            execution_id: binding.execution_id,
            completed_request_count: if binding.status == "completed" {
                if binding.kind == "gate-a" {
                    12
                } else {
                    6
                }
            } else {
                0
            },
            canonical_raw_ref_count: binding.canonical_raw_mappings.len(),
            kind: binding.kind,
            status: binding.status,
        });
    }
    sources.sort_by(|left, right| left.execution_id.cmp(&right.execution_id));
    Ok(sources)
}

#[tauri::command]
pub fn get_dictation_lab_local_plan() -> LabExperimentDefinition {
    LabExperimentDefinition {
        schema_version: 1,
        mode: PROVIDER_FREE_MODE.to_string(),
        corpus_id: PROVIDER_FREE_CORPUS.to_string(),
        sample_ids: PROVIDER_FREE_SAMPLE_IDS
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
        stt_recipes: vec![PROVIDER_FREE_STT_RECIPE.to_string()],
        materializations: vec![MATERIALIZATION_IDENTITY.to_string()],
        postprocess_recipes: Vec::new(),
        prosody_modes: vec!["off".to_string()],
        vocabulary_modes: vec!["off".to_string()],
        baseline_candidate_id: None,
        source_gate_a_run_id: None,
    }
}

#[tauri::command]
pub async fn recover_dictation_lab_gate_a_completion(
    execution_id: String,
    run_id: String,
    definition_hash: String,
    estimate_hash: String,
) -> Result<(), DictationLabJobError> {
    let execution = AuthoritativeExecution {
        execution_id,
        definition_hash,
        estimate_hash,
        max_requests: 12,
        max_cost_usd: REAL_COST_CAP_USD,
    };
    if read_binding(&execution.execution_id).is_err() {
        persist_binding(&PrivateExecutionBinding {
            schema_version: 1,
            execution_id: execution.execution_id.clone(),
            local_evidence_run_id: run_id.clone(),
            kind: "gate-a".to_string(),
            definition_hash: execution.definition_hash.clone(),
            estimate_hash: execution.estimate_hash.clone(),
            source_gate_a_execution_id: None,
            status: "completion-pending".to_string(),
            canonical_raw_mappings: Vec::new(),
        })?;
    }
    complete_gate_a_binding(&execution, &run_id).await
}

#[tauri::command]
pub async fn abort_dictation_lab_execution(
    execution_id: String,
    reason: String,
) -> Result<(), DictationLabJobError> {
    let binding = read_binding(&execution_id)?;
    abort_execution(
        &AuthoritativeExecution {
            execution_id: binding.execution_id,
            definition_hash: binding.definition_hash,
            estimate_hash: binding.estimate_hash,
            max_requests: if binding.kind == "gate-a" { 12 } else { 6 },
            max_cost_usd: REAL_COST_CAP_USD,
        },
        &reason,
    )
    .await
}

fn gate_b_source_results_path(source_execution_id: &str) -> Result<String, DictationLabJobError> {
    let binding = read_binding(source_execution_id)?;
    if binding.kind != "gate-a"
        || binding.status != "completed"
        || binding.canonical_raw_mappings.len() != 3
        || !REAL_SAMPLE_IDS
            .iter()
            .enumerate()
            .all(|(index, sample_id)| {
                binding
                    .canonical_raw_mappings
                    .get(index)
                    .is_some_and(|mapping| {
                        mapping.sample_id == *sample_id
                            && mapping.candidate_id == STT_SHORT_AUTO
                            && mapping.raw_ref.starts_with("lraw_")
                    })
            })
    {
        return Err(DictationLabJobError::new(
            "laboratory_execution_source_invalid",
        ));
    }
    for mapping in &binding.canonical_raw_mappings {
        let raw = read_private_evidence(&mapping.local_ref)?;
        if raw.len() as u64 != mapping.byte_length || sha256_hex(&raw) != mapping.sha256 {
            return Err(DictationLabJobError::new(
                "laboratory_execution_source_invalid",
            ));
        }
    }
    Ok(format!(
        "artifacts/transcription-quality/{}/results.jsonl",
        binding.local_evidence_run_id
    ))
}

fn spawn_runner(
    mode: &str,
    run_id: &str,
    estimate: &LabExperimentEstimate,
    execution: Option<&AuthoritativeExecution>,
    source_results_path: Option<&str>,
) -> Result<Arc<Mutex<Child>>, DictationLabJobError> {
    let args = match mode {
        PROVIDER_FREE_MODE => vec![
            "run".to_string(),
            "scripts/transcription-quality-provider-free.ts".to_string(),
            "--run-id".to_string(),
            run_id.to_string(),
        ],
        PROVIDER_REAL_MODE => {
            let execution = execution
                .ok_or_else(|| DictationLabJobError::new("laboratory_execution_unauthorized"))?;
            if execution.max_requests != estimate.max_requests
                || (execution.max_cost_usd - estimate.max_cost_usd).abs() > f64::EPSILON
            {
                return Err(DictationLabJobError::new(
                    "laboratory_execution_grant_mismatch",
                ));
            }
            vec![
                "run".to_string(),
                "scripts/transcription-quality-product-baseline.ts".to_string(),
                "--allow-provider-call".to_string(),
                "--max-requests".to_string(),
                execution.max_requests.to_string(),
                "--max-cost-usd".to_string(),
                execution.max_cost_usd.to_string(),
                "--run-id".to_string(),
                run_id.to_string(),
                "--execution-id".to_string(),
                execution.execution_id.clone(),
                "--definition-hash".to_string(),
                execution.definition_hash.clone(),
                "--estimate-hash".to_string(),
                execution.estimate_hash.clone(),
            ]
        }
        PROVIDER_REAL_GATE_B_MODE => {
            let execution = execution
                .ok_or_else(|| DictationLabJobError::new("laboratory_execution_unauthorized"))?;
            let source_results_path = source_results_path
                .ok_or_else(|| DictationLabJobError::new("laboratory_execution_source_invalid"))?;
            if execution.max_requests != 6
                || (execution.max_cost_usd - REAL_COST_CAP_USD).abs() > f64::EPSILON
            {
                return Err(DictationLabJobError::new(
                    "laboratory_execution_grant_mismatch",
                ));
            }
            vec![
                "run".to_string(),
                "scripts/transcription-quality-replay.ts".to_string(),
                "--source-results".to_string(),
                source_results_path.to_string(),
                "--allow-provider-call".to_string(),
                "--max-requests".to_string(),
                execution.max_requests.to_string(),
                "--max-cost-usd".to_string(),
                execution.max_cost_usd.to_string(),
                "--run-id".to_string(),
                run_id.to_string(),
                "--execution-id".to_string(),
                execution.execution_id.clone(),
                "--definition-hash".to_string(),
                execution.definition_hash.clone(),
            ]
        }
        _ => return Err(DictationLabJobError::new("runner-mode-not-allowlisted")),
    };
    let child = Command::new("bun")
        .current_dir(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."))
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| DictationLabJobError::new("runner-unavailable"))?;
    Ok(Arc::new(Mutex::new(child)))
}
pub async fn start_provider_free_smoke_job() -> Result<LabJobSnapshot, DictationLabJobError> {
    start_dictation_lab_job(
        LabExperimentDefinition {
            schema_version: 1,
            mode: PROVIDER_FREE_MODE.to_string(),
            corpus_id: PROVIDER_FREE_CORPUS.to_string(),
            sample_ids: PROVIDER_FREE_SAMPLE_IDS
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
            stt_recipes: vec![PROVIDER_FREE_STT_RECIPE.to_string()],
            materializations: vec![MATERIALIZATION_IDENTITY.to_string()],
            postprocess_recipes: Vec::new(),
            prosody_modes: vec!["off".to_string()],
            vocabulary_modes: vec!["off".to_string()],
            baseline_candidate_id: None,
            source_gate_a_run_id: None,
        },
        None,
    )
    .await
}
#[tauri::command]
pub async fn start_dictation_lab_job(
    definition: LabExperimentDefinition,
    execution_grant: Option<LabExecutionGrant>,
) -> Result<LabJobSnapshot, DictationLabJobError> {
    let estimate = estimate_definition(definition.clone())?;
    let job_id = new_job_id(&estimate.definition_hash);
    let run_id = format!("lab-{job_id}");
    let total_units = estimate.combination_count;
    let queued = LabJobSnapshot {
        job_id: job_id.clone(),
        state: "queued".to_string(),
        mode: definition.mode.clone(),
        estimate: estimate.clone(),
        completed_units: 0,
        total_units,
        run_id: Some(run_id.clone()),
        error_code: None,
        created_at: now_iso(),
        updated_at: now_iso(),
    };
    let source_results_path = if definition.mode == PROVIDER_REAL_GATE_B_MODE {
        Some(gate_b_source_results_path(
            definition
                .source_gate_a_run_id
                .as_deref()
                .ok_or_else(|| DictationLabJobError::new("laboratory_execution_source_invalid"))?,
        )?)
    } else {
        None
    };
    {
        let mut guard = active_job()
            .lock()
            .map_err(|_| DictationLabJobError::new("job-state-unavailable"))?;
        if guard
            .as_ref()
            .is_some_and(|job| job.snapshot.state == "queued" || job.snapshot.state == "running")
        {
            return Err(DictationLabJobError::new("active-job-exists"));
        }
        *guard = Some(ActiveJob {
            snapshot: queued.clone(),
            child: None,
            execution: None,
        });
    }
    let authoritative_execution = if matches!(
        definition.mode.as_str(),
        PROVIDER_REAL_MODE | PROVIDER_REAL_GATE_B_MODE
    ) {
        let grant = execution_grant
            .as_ref()
            .filter(|grant| grant.is_opaque_valid())
            .ok_or_else(|| DictationLabJobError::new("laboratory_execution_unauthorized"));
        let consumed = match grant {
            Ok(grant) => consume_execution_grant(grant, &estimate, &definition.mode).await,
            Err(error) => Err(error),
        };
        match consumed {
            Ok(execution) => Some(execution),
            Err(error) => {
                if let Ok(mut guard) = active_job().lock() {
                    if guard
                        .as_ref()
                        .is_some_and(|job| job.snapshot.job_id == job_id)
                    {
                        *guard = None;
                    }
                }
                return Err(error);
            }
        }
    } else {
        None
    };
    if let Some(execution) = &authoritative_execution {
        let binding = PrivateExecutionBinding {
            schema_version: 1,
            execution_id: execution.execution_id.clone(),
            local_evidence_run_id: run_id.clone(),
            kind: if definition.mode == PROVIDER_REAL_MODE {
                "gate-a"
            } else {
                "gate-b"
            }
            .to_string(),
            definition_hash: execution.definition_hash.clone(),
            estimate_hash: execution.estimate_hash.clone(),
            source_gate_a_execution_id: definition.source_gate_a_run_id.clone(),
            status: "active".to_string(),
            canonical_raw_mappings: Vec::new(),
        };
        if let Err(error) = persist_binding(&binding) {
            let _ = abort_execution(execution, "spawn-failed").await;
            if let Ok(mut guard) = active_job().lock() {
                if guard
                    .as_ref()
                    .is_some_and(|job| job.snapshot.job_id == job_id)
                {
                    *guard = None;
                }
            }
            return Err(error);
        }
    }

    enum SpawnOutcome {
        Started(Arc<Mutex<Child>>),
        Cancelled,
        Failed(DictationLabJobError),
    }
    let spawn_outcome = {
        let mut guard = active_job()
            .lock()
            .map_err(|_| DictationLabJobError::new("job-state-unavailable"))?;
        let job = guard
            .as_mut()
            .filter(|job| job.snapshot.job_id == job_id)
            .ok_or_else(|| DictationLabJobError::new("job-state-unavailable"))?;
        if job.snapshot.state != "queued" {
            SpawnOutcome::Cancelled
        } else {
            match spawn_runner(
                &definition.mode,
                &run_id,
                &estimate,
                authoritative_execution.as_ref(),
                source_results_path.as_deref(),
            ) {
                Ok(child) => {
                    job.child = Some(child.clone());
                    job.execution = authoritative_execution.clone();
                    job.snapshot.state = "running".to_string();
                    job.snapshot.updated_at = now_iso();
                    SpawnOutcome::Started(child)
                }
                Err(error) => {
                    job.snapshot.state = "failed".to_string();
                    job.snapshot.error_code = Some(error.code.clone());
                    job.snapshot.updated_at = now_iso();
                    SpawnOutcome::Failed(error)
                }
            }
        }
    };
    let child = match spawn_outcome {
        SpawnOutcome::Started(child) => child,
        SpawnOutcome::Cancelled => {
            if let Some(execution) = &authoritative_execution {
                abort_execution(execution, "cancelled").await?;
            }
            return Err(DictationLabJobError::new("cancelled-by-user"));
        }
        SpawnOutcome::Failed(error) => {
            if let Some(execution) = &authoritative_execution {
                abort_execution(execution, "spawn-failed").await?;
            }
            return Err(error);
        }
    };
    let monitor_execution = authoritative_execution.clone();
    let monitor_mode = definition.mode.clone();
    let monitor_run_id = run_id.clone();
    let monitor_job_id = job_id.clone();
    tauri::async_runtime::spawn(async move {
        let status = tauri::async_runtime::spawn_blocking(move || {
            child
                .lock()
                .ok()
                .and_then(|mut process| process.wait().ok())
        })
        .await
        .ok()
        .flatten();
        let cancelled = active_job()
            .lock()
            .ok()
            .and_then(|guard| {
                guard
                    .as_ref()
                    .filter(|job| job.snapshot.job_id == monitor_job_id)
                    .map(|job| job.snapshot.state == "cancelled")
            })
            .unwrap_or(false);
        if cancelled {
            return;
        }
        let runner_succeeded = status.is_some_and(|value| value.success());
        let terminal_result = if !runner_succeeded {
            if let Some(execution) = &monitor_execution {
                abort_execution(execution, "runner-failed").await
            } else {
                Ok(())
            }
        } else if let Some(execution) = &monitor_execution {
            if monitor_mode == PROVIDER_REAL_MODE {
                complete_gate_a_binding(execution, &monitor_run_id).await
            } else {
                complete_gate_b_binding(execution).await
            }
        } else {
            Ok(())
        };
        if let Ok(mut guard) = active_job().lock() {
            if let Some(job) = guard
                .as_mut()
                .filter(|job| job.snapshot.job_id == monitor_job_id)
            {
                let completed = runner_succeeded && terminal_result.is_ok();
                job.snapshot.state = if completed {
                    "completed".to_string()
                } else if runner_succeeded {
                    "completion-pending".to_string()
                } else {
                    "failed".to_string()
                };
                job.snapshot.completed_units = if runner_succeeded {
                    job.snapshot.total_units
                } else {
                    0
                };
                job.snapshot.error_code = terminal_result
                    .err()
                    .map(|error| error.code)
                    .or_else(|| (!runner_succeeded).then(|| "runner-failed".to_string()));
                job.snapshot.updated_at = now_iso();
            }
        }
    });
    let guard = active_job()
        .lock()
        .map_err(|_| DictationLabJobError::new("job-state-unavailable"))?;
    guard
        .as_ref()
        .map(|job| job.snapshot.clone())
        .ok_or_else(|| DictationLabJobError::new("job-state-unavailable"))
}

#[tauri::command]
pub async fn get_dictation_lab_job() -> Result<Option<LabJobSnapshot>, DictationLabJobError> {
    let guard = active_job()
        .lock()
        .map_err(|_| DictationLabJobError::new("job-state-unavailable"))?;
    Ok(guard.as_ref().map(|job| job.snapshot.clone()))
}

#[tauri::command]
pub async fn cancel_dictation_lab_job(
    job_id: String,
) -> Result<LabJobSnapshot, DictationLabJobError> {
    let (snapshot, execution) = {
        let mut guard = active_job()
            .lock()
            .map_err(|_| DictationLabJobError::new("job-state-unavailable"))?;
        let job = guard
            .as_mut()
            .ok_or_else(|| DictationLabJobError::new("job-not-found"))?;
        if job.snapshot.job_id != job_id {
            return Err(DictationLabJobError::new("job-not-found"));
        }
        if job.snapshot.state == "queued" || job.snapshot.state == "running" {
            if let Some(child) = &job.child {
                if let Ok(mut process) = child.lock() {
                    let _ = process.kill();
                }
            }
            job.snapshot.state = "cancelled".to_string();
            job.snapshot.error_code = Some("cancelled-by-user".to_string());
            job.snapshot.updated_at = now_iso();
        }
        (job.snapshot.clone(), job.execution.clone())
    };
    if let Some(execution) = execution {
        abort_execution(&execution, "cancelled").await?;
    }
    Ok(snapshot)
}
#[cfg(test)]
mod tests {
    use super::*;

    fn provider_free_definition() -> LabExperimentDefinition {
        LabExperimentDefinition {
            schema_version: 1,
            mode: PROVIDER_FREE_MODE.to_string(),
            corpus_id: PROVIDER_FREE_CORPUS.to_string(),
            sample_ids: PROVIDER_FREE_SAMPLE_IDS
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
            stt_recipes: vec![PROVIDER_FREE_STT_RECIPE.to_string()],
            materializations: vec![MATERIALIZATION_IDENTITY.to_string()],
            postprocess_recipes: Vec::new(),
            prosody_modes: vec!["off".to_string()],
            vocabulary_modes: vec!["off".to_string()],
            baseline_candidate_id: None,
            source_gate_a_run_id: None,
        }
    }
    fn gate_a_definition() -> LabExperimentDefinition {
        LabExperimentDefinition {
            schema_version: 1,
            mode: PROVIDER_REAL_MODE.to_string(),
            corpus_id: REAL_CORPUS.to_string(),
            sample_ids: REAL_SAMPLE_IDS
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
            stt_recipes: REAL_STT_RECIPES
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
            materializations: vec!["response-text-kept".to_string()],
            postprocess_recipes: Vec::new(),
            prosody_modes: vec!["off".to_string()],
            vocabulary_modes: vec!["off".to_string()],
            baseline_candidate_id: None,
            source_gate_a_run_id: None,
        }
    }
    fn gate_b_definition() -> LabExperimentDefinition {
        LabExperimentDefinition {
            schema_version: 1,
            mode: PROVIDER_REAL_GATE_B_MODE.to_string(),
            corpus_id: REAL_CORPUS.to_string(),
            sample_ids: REAL_SAMPLE_IDS
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
            stt_recipes: Vec::new(),
            materializations: vec!["response-text-kept".to_string()],
            postprocess_recipes: vec![
                POSTPROCESS_PLAIN.to_string(),
                POSTPROCESS_PROSODY.to_string(),
            ],
            prosody_modes: vec!["off".to_string()],
            vocabulary_modes: vec!["off".to_string()],
            baseline_candidate_id: Some(STT_SHORT_AUTO.to_string()),
            source_gate_a_run_id: Some("12345678-1234-1234-1234-123456789abc".to_string()),
        }
    }

    #[test]
    fn exact_gate_a_estimate_is_the_frozen_matrix() {
        let estimate = estimate_definition(gate_a_definition()).expect("Gate A estimate");
        assert_eq!(estimate.sample_count, 3);
        assert_eq!(estimate.candidate_count, 4);
        assert_eq!(estimate.combination_count, 12);
        assert_eq!(estimate.stt_calls, 12);
        assert_eq!(estimate.postprocess_calls, 0);
        assert_eq!(estimate.max_requests, 12);
        assert_eq!(estimate.max_cost_usd, 0.005);
        assert!(estimate.provider_required);
    }

    #[test]
    fn altered_gate_a_matrix_is_rejected_before_runner_creation() {
        let mut definition = gate_a_definition();
        definition.stt_recipes.pop();
        let error = estimate_definition(definition).expect_err("subset Gate A must reject");
        assert_eq!(error.code, "provider-real-definition-unsupported");
    }

    #[test]
    fn provider_real_runners_are_closed_without_spawning() {
        let gate_a_estimate = estimate_definition(gate_a_definition()).expect("Gate A estimate");
        let gate_a_error = spawn_runner(
            PROVIDER_REAL_MODE,
            "redacted-run",
            &gate_a_estimate,
            None,
            None,
        )
        .expect_err("Gate A must remain closed");
        assert_eq!(gate_a_error.code, "laboratory_execution_unauthorized");

        let gate_b_estimate = estimate_definition(gate_b_definition()).expect("Gate B estimate");
        let gate_b_error = spawn_runner(
            PROVIDER_REAL_GATE_B_MODE,
            "redacted-run",
            &gate_b_estimate,
            None,
            Some("redacted-source"),
        )
        .expect_err("Gate B must remain closed");
        assert_eq!(gate_b_error.code, "laboratory_execution_unauthorized");
    }

    #[test]
    fn exact_gate_b_estimate_is_locked_and_provider_real() {
        let estimate = estimate_definition(gate_b_definition()).expect("Gate B estimate");
        assert_eq!(estimate.sample_count, 3);
        assert_eq!(estimate.candidate_count, 2);
        assert_eq!(estimate.combination_count, 6);
        assert_eq!(estimate.stt_calls, 0);
        assert_eq!(estimate.postprocess_calls, 6);
        assert_eq!(estimate.reused_raw_count, 3);
        assert_eq!(estimate.max_requests, 6);
        assert_eq!(estimate.max_cost_usd, 0.005);
        assert!(estimate.provider_required);
    }

    #[test]
    fn gate_b_subset_and_missing_source_are_rejected() {
        let mut subset = gate_b_definition();
        subset.postprocess_recipes.pop();
        assert_eq!(
            estimate_definition(subset)
                .expect_err("subset must reject")
                .code,
            "provider-real-gate-b-definition-unsupported",
        );
        let mut missing_source = gate_b_definition();
        missing_source.source_gate_a_run_id = None;
        assert_eq!(
            estimate_definition(missing_source)
                .expect_err("source must reject")
                .code,
            "provider-real-gate-b-definition-unsupported",
        );
    }

    #[test]
    fn provider_free_estimate_is_deterministic_and_has_zero_provider_budget() {
        let first = estimate_definition(provider_free_definition()).expect("estimate");
        let second = estimate_definition(provider_free_definition()).expect("estimate");
        assert_eq!(first.definition_hash, second.definition_hash);
        assert_eq!(first.sample_count, 2);
        assert_eq!(first.candidate_count, 1);
        assert_eq!(first.combination_count, 2);
        assert_eq!(first.stt_calls, 0);
        assert_eq!(first.postprocess_calls, 0);
        assert_eq!(first.reused_raw_count, 2);
        assert_eq!(first.max_requests, 0);
        assert_eq!(first.max_cost_usd, 0.0);
        assert!(!first.provider_required);
    }

    #[test]
    fn estimator_rejects_non_allowlisted_runner_inputs() {
        let mut definition = provider_free_definition();
        definition.stt_recipes = vec!["arbitrary-shell-command".to_string()];
        let error = estimate_definition(definition).expect_err("must reject");
        assert_eq!(error.code, "stt-recipe-not-allowlisted");
    }

    #[test]
    fn sha256_implementation_matches_known_vector() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
    #[test]
    fn opaque_grants_reject_claims_and_whitespace() {
        assert!(!LabExecutionGrant {
            schema_version: 1,
            grant_token: String::new()
        }
        .is_opaque_valid());
        assert!(!LabExecutionGrant {
            schema_version: 1,
            grant_token: "opaque token".to_string()
        }
        .is_opaque_valid());
        assert!(!LabExecutionGrant {
            schema_version: 2,
            grant_token: "opaque-token".to_string()
        }
        .is_opaque_valid());
        assert!(LabExecutionGrant {
            schema_version: 1,
            grant_token: "opaque-token".to_string()
        }
        .is_opaque_valid());
    }
}
