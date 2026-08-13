use std::{
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

use crate::dictation_lab::{LabExperimentDefinition, LabExperimentEstimate, LabJobSnapshot};

const PROVIDER_FREE_MODE: &str = "provider-free-replay";
const PROVIDER_REAL_MODE: &str = "provider-real";
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
fn now_iso() -> String {
    let seconds = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
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
    if month <= 2 { year += 1; }
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z", day_seconds / 3_600, (day_seconds % 3_600) / 60, day_seconds % 60)
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabExecutionGrant {
    pub definition_hash: String,
    pub estimate: LabExperimentEstimate,
    pub expires_at: String,
}
fn sha256_hex(input: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let mut message = input.to_vec();
    let bit_len = (message.len() as u64).saturating_mul(8);
    message.push(0x80);
    while message.len() % 64 != 56 { message.push(0); }
    message.extend_from_slice(&bit_len.to_be_bytes());
    let mut h: [u32; 8] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    for chunk in message.chunks_exact(64) {
        let mut w = [0u32; 64];
        for (index, bytes) in chunk.chunks_exact(4).take(16).enumerate() { w[index] = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]); }
        for index in 16..64 {
            let s0 = w[index - 15].rotate_right(7) ^ w[index - 15].rotate_right(18) ^ (w[index - 15] >> 3);
            let s1 = w[index - 2].rotate_right(17) ^ w[index - 2].rotate_right(19) ^ (w[index - 2] >> 10);
            w[index] = w[index - 16].wrapping_add(s0).wrapping_add(w[index - 7]).wrapping_add(s1);
        }
        let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) = (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);
        for index in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[index]).wrapping_add(w[index]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);
            (hh, g, f, e, d, c, b, a) = (g, f, e, d.wrapping_add(temp1), c, b, a, temp1.wrapping_add(temp2));
        }
        h[0] = h[0].wrapping_add(a); h[1] = h[1].wrapping_add(b); h[2] = h[2].wrapping_add(c); h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e); h[5] = h[5].wrapping_add(f); h[6] = h[6].wrapping_add(g); h[7] = h[7].wrapping_add(hh);
    }
    h.iter().map(|word| format!("{word:08x}")).collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationLabJobError {
    pub code: String,
}

impl DictationLabJobError {
    fn new(code: &'static str) -> Self { Self { code: code.to_string() } }
}

#[derive(Debug)]
struct ActiveJob {
    snapshot: LabJobSnapshot,
    child: Option<Arc<Mutex<Child>>>,
}

static ACTIVE_JOB: OnceLock<Mutex<Option<ActiveJob>>> = OnceLock::new();

fn active_job() -> &'static Mutex<Option<ActiveJob>> {
    ACTIVE_JOB.get_or_init(|| Mutex::new(None))
}



fn is_nonempty_unique(values: &[String]) -> bool {
    !values.is_empty() && values.iter().all(|value| !value.trim().is_empty())
        && values.windows(2).all(|pair| pair[0] != pair[1])
}

fn all_in(values: &[String], allowed: &[&str]) -> bool {
    values.iter().all(|value| allowed.contains(&value.as_str()))
}
fn now_epoch() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

fn hash_definition(definition: &LabExperimentDefinition) -> String {
    let canonical = serde_json::to_string(definition).unwrap_or_default();
    sha256_hex(canonical.as_bytes())
}
fn new_job_id(definition_hash: &str) -> String {
    format!("lab-{}-{}", &definition_hash[..12.min(definition_hash.len())], now_epoch())
}
fn validate_definition(definition: &LabExperimentDefinition) -> Result<(), DictationLabJobError> {
    if definition.schema_version != 1 { return Err(DictationLabJobError::new("definition-schema-unsupported")); }
    if definition.mode != PROVIDER_FREE_MODE && definition.mode != PROVIDER_REAL_MODE { return Err(DictationLabJobError::new("mode-not-allowlisted")); }
    if definition.corpus_id.trim().is_empty() || definition.sample_ids.is_empty() { return Err(DictationLabJobError::new("corpus-or-samples-invalid")); }
    if !is_nonempty_unique(&definition.sample_ids) { return Err(DictationLabJobError::new("sample-ids-invalid")); }
    if !is_nonempty_unique(&definition.stt_recipes) || !is_nonempty_unique(&definition.materializations)
        || !is_nonempty_unique(&definition.prosody_modes) || !is_nonempty_unique(&definition.vocabulary_modes) {
        return Err(DictationLabJobError::new("definition-dimensions-empty-or-duplicate"));
    }
    if !all_in(&definition.stt_recipes, &[PROVIDER_FREE_STT_RECIPE, STT_SHORT_AUTO, STT_RICH_AUTO, STT_SHORT_ES, STT_RICH_ES]) {
        return Err(DictationLabJobError::new("stt-recipe-not-allowlisted"));
    }
    if !all_in(&definition.materializations, &[MATERIALIZATION_IDENTITY, "response-text-kept"]) {
        return Err(DictationLabJobError::new("materialization-not-allowlisted"));
    }
    if !all_in(&definition.postprocess_recipes, &[POSTPROCESS_PLAIN, POSTPROCESS_PROSODY])
        || !all_in(&definition.prosody_modes, &["off", "advisory"])
        || !all_in(&definition.vocabulary_modes, &["off", "automatic", "ask"]) {
        return Err(DictationLabJobError::new("mode-option-not-allowlisted"));
    }
    if definition.mode == PROVIDER_REAL_MODE && (definition.corpus_id != REAL_CORPUS
        || definition.sample_ids.iter().map(String::as_str).collect::<Vec<_>>() != REAL_SAMPLE_IDS
        || definition.stt_recipes.iter().any(|recipe| !REAL_STT_RECIPES.contains(&recipe.as_str()))
        || !definition.postprocess_recipes.is_empty()
        || definition.prosody_modes != ["off"]
        || definition.vocabulary_modes != ["off"]
        || definition.materializations != ["response-text-kept"]) {
        return Err(DictationLabJobError::new("provider-real-definition-unsupported"));
    }
    if definition.mode == PROVIDER_FREE_MODE && (definition.corpus_id != PROVIDER_FREE_CORPUS
        || definition.sample_ids.iter().map(String::as_str).collect::<Vec<_>>() != PROVIDER_FREE_SAMPLE_IDS
        || definition.stt_recipes.len() != 1 || definition.stt_recipes[0] != PROVIDER_FREE_STT_RECIPE
        || definition.materializations.len() != 1 || definition.materializations[0] != MATERIALIZATION_IDENTITY
        || !definition.postprocess_recipes.is_empty()
        || definition.prosody_modes.len() != 1 || definition.prosody_modes[0] != "off"
        || definition.vocabulary_modes.len() != 1 || definition.vocabulary_modes[0] != "off") {
        return Err(DictationLabJobError::new("provider-free-definition-unsupported"));
    }
    Ok(())
}

pub fn estimate_definition(definition: LabExperimentDefinition) -> Result<LabExperimentEstimate, DictationLabJobError> {
    validate_definition(&definition)?;
    let definition_hash = hash_definition(&definition);
    let sample_count = definition.sample_ids.len();
    let candidate_count = definition.stt_recipes.len()
        .saturating_mul(definition.materializations.len())
        .saturating_mul(definition.postprocess_recipes.len().max(1))
        .saturating_mul(definition.prosody_modes.len())
        .saturating_mul(definition.vocabulary_modes.len());
    let combination_count = sample_count.saturating_mul(candidate_count);
    let provider_required = definition.mode == PROVIDER_REAL_MODE;
    let stt_calls = if provider_required { sample_count.saturating_mul(definition.stt_recipes.len()) } else { 0 };
    let reused_raw_count = if provider_required { 0 } else { sample_count };
    let postprocess_calls = sample_count
        .saturating_mul(definition.postprocess_recipes.len())
        .saturating_mul(definition.prosody_modes.iter().filter(|mode| mode.as_str() == "advisory").count().max(1));
    let max_requests = stt_calls.saturating_add(postprocess_calls);
    let max_cost_usd = if provider_required { REAL_COST_CAP_USD } else { 0.0 };
    let mut one_variable_warnings = Vec::new();
    if definition.stt_recipes.len() > 1 { one_variable_warnings.push("stt-recipe-varies".to_string()); }
    if definition.materializations.len() > 1 { one_variable_warnings.push("materialization-varies".to_string()); }
    if definition.postprocess_recipes.len() > 1 { one_variable_warnings.push("postprocess-recipe-varies".to_string()); }
    if definition.prosody_modes.len() > 1 { one_variable_warnings.push("prosody-varies".to_string()); }
    if definition.vocabulary_modes.len() > 1 { one_variable_warnings.push("vocabulary-varies".to_string()); }
    Ok(LabExperimentEstimate { definition_hash, sample_count, candidate_count, combination_count, stt_calls, postprocess_calls, reused_raw_count, max_requests, max_cost_usd, provider_required, one_variable_warnings })
}

#[tauri::command]
pub async fn estimate_dictation_lab_experiment(
    definition: LabExperimentDefinition,
) -> Result<LabExperimentEstimate, DictationLabJobError> {
    estimate_definition(definition)
}

fn grant_matches(estimate: &LabExperimentEstimate, grant: &LabExecutionGrant) -> bool {
    if grant.definition_hash != estimate.definition_hash || grant.estimate.definition_hash != estimate.definition_hash { return false; }
    if grant.estimate.sample_count != estimate.sample_count || grant.estimate.candidate_count != estimate.candidate_count
        || grant.estimate.combination_count != estimate.combination_count || grant.estimate.stt_calls != estimate.stt_calls
        || grant.estimate.postprocess_calls != estimate.postprocess_calls || grant.estimate.reused_raw_count != estimate.reused_raw_count
        || grant.estimate.max_requests != estimate.max_requests || (grant.estimate.max_cost_usd - estimate.max_cost_usd).abs() > f64::EPSILON
        || grant.estimate.provider_required != estimate.provider_required || grant.estimate.one_variable_warnings != estimate.one_variable_warnings {
        return false;
    }
    let expiry_valid = grant.expires_at.parse::<u64>()
        .map(|expiry| expiry > now_epoch())
        .unwrap_or_else(|_| grant.expires_at.as_str() > now_iso().as_str());
    expiry_valid
}


fn spawn_runner(mode: &str, run_id: &str, estimate: &LabExperimentEstimate) -> Result<Arc<Mutex<Child>>, DictationLabJobError> {
    let args = match mode {
        PROVIDER_FREE_MODE => vec![
            "run".to_string(),
            "scripts/transcription-quality-provider-free.ts".to_string(),
            "--run-id".to_string(),
            run_id.to_string(),
        ],
        PROVIDER_REAL_MODE => vec![
            "run".to_string(),
            "scripts/transcription-quality-product-baseline.ts".to_string(),
            "--allow-provider-call".to_string(),
            "--max-requests".to_string(),
            estimate.max_requests.to_string(),
            "--max-cost-usd".to_string(),
            format!("{:.6}", estimate.max_cost_usd),
            "--run-id".to_string(),
            run_id.to_string(),
        ],
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
#[tauri::command]
pub async fn start_dictation_lab_job(definition: LabExperimentDefinition, execution_grant: Option<LabExecutionGrant>) -> Result<LabJobSnapshot, DictationLabJobError> {
    let estimate = estimate_definition(definition.clone())?;
    if definition.mode == PROVIDER_REAL_MODE {
        let grant = execution_grant.as_ref().ok_or_else(|| DictationLabJobError::new("execution-grant-required"))?;
        if !grant_matches(&estimate, grant) { return Err(DictationLabJobError::new("execution-grant-invalid-or-expired")); }
    }
    let mut guard = active_job().lock().map_err(|_| DictationLabJobError::new("job-state-unavailable"))?;
    if guard.as_ref().is_some_and(|job| job.snapshot.state == "queued" || job.snapshot.state == "running") {
        return Err(DictationLabJobError::new("active-job-exists"));
    }
    let job_id = new_job_id(&estimate.definition_hash);
    let run_id = format!("lab-{job_id}");
    let total_units = estimate.combination_count;
    let queued = LabJobSnapshot { job_id: job_id.clone(), state: "queued".to_string(), mode: definition.mode.clone(), estimate: estimate.clone(), completed_units: 0, total_units, run_id: Some(run_id.clone()), error_code: None, created_at: now_iso(), updated_at: now_iso() };
    *guard = Some(ActiveJob { snapshot: queued.clone(), child: None });
    drop(guard);

    let child = match spawn_runner(&definition.mode, &run_id, &estimate) {
        Ok(child) => child,
        Err(error) => {
            let mut guard = active_job().lock().map_err(|_| DictationLabJobError::new("job-state-unavailable"))?;
            if let Some(job) = guard.as_mut() { job.snapshot.state = "failed".to_string(); job.snapshot.error_code = Some(error.code.clone()); job.snapshot.updated_at = now_iso(); }
            return Err(error);
        }
    };
    {
        let mut guard = active_job().lock().map_err(|_| DictationLabJobError::new("job-state-unavailable"))?;
        if let Some(job) = guard.as_mut() { job.child = Some(child.clone()); job.snapshot.state = "running".to_string(); job.snapshot.updated_at = now_iso(); }
    }
    tauri::async_runtime::spawn_blocking(move || {
        let status = child.lock().ok().and_then(|mut process| process.wait().ok());
        if let Ok(mut guard) = active_job().lock() {
            if let Some(job) = guard.as_mut() {
                if job.snapshot.state == "cancelled" { return; }
                let success = status.is_some_and(|value| value.success());
                job.snapshot.state = if success { "completed".to_string() } else { "failed".to_string() };
                job.snapshot.completed_units = if success { job.snapshot.total_units } else { 0 };
                job.snapshot.error_code = if success { None } else { Some("runner-failed".to_string()) };
                job.snapshot.updated_at = now_iso();
            }
        }
    });
    let guard = active_job().lock().map_err(|_| DictationLabJobError::new("job-state-unavailable"))?;
    guard.as_ref().map(|job| job.snapshot.clone()).ok_or_else(|| DictationLabJobError::new("job-state-unavailable"))
}

#[tauri::command]
pub async fn get_dictation_lab_job() -> Result<Option<LabJobSnapshot>, DictationLabJobError> {
    let guard = active_job().lock().map_err(|_| DictationLabJobError::new("job-state-unavailable"))?;
    Ok(guard.as_ref().map(|job| job.snapshot.clone()))
}

#[tauri::command]
pub async fn cancel_dictation_lab_job(job_id: String) -> Result<LabJobSnapshot, DictationLabJobError> {
    let mut guard = active_job().lock().map_err(|_| DictationLabJobError::new("job-state-unavailable"))?;

    let job = guard.as_mut().ok_or_else(|| DictationLabJobError::new("job-not-found"))?;
    if job.snapshot.job_id != job_id { return Err(DictationLabJobError::new("job-not-found")); }
    if job.snapshot.state == "queued" || job.snapshot.state == "running" {
        if let Some(child) = &job.child { if let Ok(mut process) = child.lock() { let _ = process.kill(); } }
        job.snapshot.state = "cancelled".to_string();
        job.snapshot.error_code = Some("cancelled-by-user".to_string());
        job.snapshot.updated_at = now_iso();
    }
    Ok(job.snapshot.clone())
}
#[cfg(test)]
mod tests {
    use super::*;

    fn provider_free_definition() -> LabExperimentDefinition {
        LabExperimentDefinition {
            schema_version: 1,
            mode: PROVIDER_FREE_MODE.to_string(),
            corpus_id: PROVIDER_FREE_CORPUS.to_string(),
            sample_ids: PROVIDER_FREE_SAMPLE_IDS.iter().map(|value| (*value).to_string()).collect(),
            stt_recipes: vec![PROVIDER_FREE_STT_RECIPE.to_string()],
            materializations: vec![MATERIALIZATION_IDENTITY.to_string()],
            postprocess_recipes: Vec::new(),
            prosody_modes: vec!["off".to_string()],
            vocabulary_modes: vec!["off".to_string()],
            baseline_candidate_id: None,
        }
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
}
