use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{collections::{hash_map::DefaultHasher, BTreeSet}, fs, hash::{Hash, Hasher}, path::{Path, PathBuf}, sync::{LazyLock, Mutex}, time::{SystemTime, UNIX_EPOCH}};

use crate::fixvox_cloud::{request_authenticated_product_json, FixvoxCloudError};

const CONTROL_ROOM_PREFIX: &str = "/product/v1/control-room";
const ARTIFACT_RELATIVE_ROOT: &str = "artifacts/transcription-quality";
const MAX_RUNS: usize = 256;
const MAX_DIRECTORY_ENTRIES: usize = 512;
const MAX_JSON_BYTES: u64 = 8 * 1024 * 1024;
const MAX_RESULTS_BYTES: u64 = 64 * 1024 * 1024;
const MAX_RESULT_LINES: usize = 100_000;
const MAX_PRIVATE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ADJUDICATION_MUTATIONS: usize = 256;
static ADJUDICATION_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabAvailability { pub status: String, pub missing: Vec<String> }
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabArtifactRef { pub id: String, pub kind: String, pub availability: LabAvailability }
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabArtifactIndex { pub schema_version: u8, pub root_id: String, pub generated_at: String, pub runs: Vec<LabRunSummary>, pub corpora: Vec<LabCorpusSummary>, pub availability: LabAvailability }
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabCorpusSummary { pub corpus_id: String, pub version: String, pub sample_count: usize, pub approved_gold_count: usize, pub audio_available_count: usize, pub categories: Vec<String>, pub difficulties: Vec<String>, pub artifact: LabArtifactRef }
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabRunSummary { pub run_id: String, pub schema_version: String, pub status: String, pub started_at: Option<String>, pub completed_at: Option<String>, pub corpus_id: String, pub sample_count: usize, pub candidate_count: usize, pub result_count: usize, pub provider_calls: ProviderCallSummary, pub estimated_cost_usd: Option<f64>, pub observed_cost_usd: Option<f64>, pub candidates: Vec<LabCandidateSummary>, pub availability: LabAvailability }
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCallSummary { pub enabled: bool, pub max_requests: usize, pub observed_requests: Option<usize> }
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceIdentity { pub configured: Option<Value>, pub resolved: Option<Value>, pub observed: Option<Value> }
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabMetricValue { pub value: Option<f64>, pub unit: String, pub availability: LabAvailability }
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabCandidateSummary { pub candidate_id: String, pub label: String, pub recipe: Value, pub identity: EvidenceIdentity, pub sample_count: usize, pub coverage: LabMetricValue, pub wer: LabMetricValue, pub cer: LabMetricValue, pub entity_accuracy: LabMetricValue, pub structure_accuracy: LabMetricValue, pub semantic_safety: LabMetricValue, pub latency: LabMetricValue, pub cost: LabMetricValue, pub fallback_count: LabMetricValue, pub regression_reasons: Vec<String>, pub availability: LabAvailability }
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabSampleSummary { pub run_id: String, pub sample_id: String, pub candidate_id: String, pub language: String, pub categories: Vec<String>, pub difficulty: String, pub sensitivity: String, pub gold_status: String, pub audio: LabArtifactRef, pub raw: LabArtifactRef, #[serde(rename = "final")] pub final_text: LabArtifactRef, pub gold: LabArtifactRef, pub scores: SampleScores, pub fallback: FallbackSummary, pub latency_ms: Option<f64>, pub cost_usd: Option<f64>, pub availability: LabAvailability }
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleScores { pub wer: Option<f64>, pub cer: Option<f64>, pub entities: Option<f64>, pub structure: Option<f64>, pub semantic_safety: Option<f64> }
#[derive(Debug, Clone, Serialize)]
pub struct FallbackSummary { pub used: Option<bool>, pub reasons: Vec<String> }

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabExperimentDefinition { pub schema_version: u8, pub mode: String, pub corpus_id: String, pub sample_ids: Vec<String>, pub stt_recipes: Vec<String>, pub materializations: Vec<String>, pub postprocess_recipes: Vec<String>, pub prosody_modes: Vec<String>, pub vocabulary_modes: Vec<String>, pub baseline_candidate_id: Option<String> }
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabExperimentEstimate { pub definition_hash: String, pub sample_count: usize, pub candidate_count: usize, pub combination_count: usize, pub stt_calls: usize, pub postprocess_calls: usize, pub reused_raw_count: usize, pub max_requests: usize, pub max_cost_usd: f64, pub provider_required: bool, pub one_variable_warnings: Vec<String> }
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabJobSnapshot { pub job_id: String, pub state: String, pub mode: String, pub estimate: LabExperimentEstimate, pub completed_units: usize, pub total_units: usize, pub run_id: Option<String>, pub error_code: Option<String>, pub created_at: String, pub updated_at: String }
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabHumanVerdictMutation { pub run_id: String, pub sample_id: String, pub candidate_id: String, pub verdict: String, pub expected_revision: Option<u64> }
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaboratoryAdjudicationFile {
    schema_version: u8,
    revision: u64,
    mutations: Vec<LaboratoryAdjudicationMutation>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaboratoryAdjudicationMutation {
    run_id: String,
    sample_id: String,
    candidate_id: String,
    verdict: String,
    revision: u64,
    content_hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaboratoryAdjudicationPublicMutation {
    run_id: String,
    sample_id: String,
    candidate_id: String,
    verdict: String,
    content_hash: String,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromotionDraft { pub profile_id: String, pub expected_revision: u64, pub source_run_id: String, pub source_candidate_id: String, pub definition: Value, pub provenance: Value }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum DictationLabRequest { Session, Profiles, Configuration, EngineCatalog, Accounts, Devices, Audit, Usage, Pricing, ValidateProfile { profile_id: String, expected_revision: u64, definition: Value }, PreviewProfile { profile_id: String, expected_revision: u64, base_version: Option<u64>, definition: Value }, ApplyProfile { profile_id: String, expected_revision: u64, definition: Value, confirmation: Value }, RollbackProfile { profile_id: String, expected_revision: u64, target_version: u64, confirmation: Value }, AssignAccount { account_handle: String, policy_id: String, policy_label: Option<String> } }

fn profile_id(value: &str) -> Result<&str, FixvoxCloudError> { let value = value.trim(); if value.is_empty() || value.len() > 64 || (!value.as_bytes()[0].is_ascii_lowercase() && !value.as_bytes()[0].is_ascii_digit()) || !value.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-') { return Err(lab_error("DICTATION_LAB_PROFILE_INVALID", "The laboratory profile identifier is invalid.")); } Ok(value) }
fn redact_public(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(redact_public).collect()),
        Value::Object(object) => Value::Object(object.iter().filter_map(|(key, value)| {
            let lower = key.to_ascii_lowercase();
            if lower.contains("path") || lower.contains("ref") || lower.contains("private") { None } else { Some((key.clone(), redact_public(value))) }
        }).collect()),
        _ => value.clone(),
    }
}
fn account_handle(value: &str) -> Result<&str, FixvoxCloudError> { let value = value.trim(); if value.is_empty() || value.len() > 64 || !value.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_') { return Err(lab_error("DICTATION_LAB_ACCOUNT_INVALID", "The laboratory account identifier is invalid.")); } Ok(value) }

#[tauri::command]
pub async fn request_dictation_lab(request: DictationLabRequest) -> Result<Value, FixvoxCloudError> {
    let (method, path, body) = match request {
        DictationLabRequest::Session => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/session"), None), DictationLabRequest::Profiles => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/profiles"), None), DictationLabRequest::Configuration => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/configuration"), None), DictationLabRequest::EngineCatalog => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/engine-catalog"), None), DictationLabRequest::Accounts => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/accounts"), None), DictationLabRequest::Devices => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/devices"), None), DictationLabRequest::Audit => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/audit"), None), DictationLabRequest::Usage => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/usage"), None), DictationLabRequest::Pricing => (reqwest::Method::GET, format!("{CONTROL_ROOM_PREFIX}/pricing"), None),
        DictationLabRequest::ValidateProfile { profile_id: id, expected_revision, definition } => { let id = profile_id(&id)?; (reqwest::Method::POST, format!("{CONTROL_ROOM_PREFIX}/profiles/{id}/validate"), Some(serde_json::json!({"expectedRevision": expected_revision, "definition": definition}))) },
        DictationLabRequest::PreviewProfile { profile_id: id, expected_revision, base_version, definition } => { let id = profile_id(&id)?; let mut body = serde_json::json!({"expectedRevision": expected_revision, "definition": definition}); if let Some(v) = base_version { body["baseVersion"] = serde_json::json!(v); } (reqwest::Method::POST, format!("{CONTROL_ROOM_PREFIX}/profiles/{id}/preview"), Some(body)) },
        DictationLabRequest::ApplyProfile { profile_id: id, expected_revision, definition, confirmation } => { let id = profile_id(&id)?; (reqwest::Method::POST, format!("{CONTROL_ROOM_PREFIX}/profiles/{id}/apply"), Some(serde_json::json!({"expectedRevision": expected_revision, "definition": definition, "confirmation": confirmation}))) },
        DictationLabRequest::RollbackProfile { profile_id: id, expected_revision, target_version, confirmation } => { let id = profile_id(&id)?; (reqwest::Method::POST, format!("{CONTROL_ROOM_PREFIX}/profiles/{id}/rollback"), Some(serde_json::json!({"expectedRevision": expected_revision, "targetVersion": target_version, "confirmation": confirmation}))) },
        DictationLabRequest::AssignAccount { account_handle: handle, policy_id: id, policy_label } => { let handle = account_handle(&handle)?; let id = profile_id(&id)?; (reqwest::Method::POST, "/admin/control-plane/accounts/policy".to_string(), Some(serde_json::json!({"accountHandle": handle, "policyId": id, "policyLabel": policy_label}))) },
    };
    request_authenticated_product_json(method, &path, body).await
}

#[derive(Clone)] struct IndexedRun { run_id: String, root: PathBuf, run: Value, manifest: Value, summary: Value, results: Vec<Value>, missing: Vec<String> }
fn lab_error(code: &str, message: &str) -> FixvoxCloudError { FixvoxCloudError { code: code.to_string(), message: message.to_string(), redacted: true } }
fn approved_root() -> Result<PathBuf, FixvoxCloudError> { fs::canonicalize(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")).map_err(|_| lab_error("DICTATION_LAB_UNAVAILABLE", "The approved laboratory root is unavailable.")) }
fn ensure_under(root: &Path, path: &Path) -> Result<PathBuf, FixvoxCloudError> { let canonical = fs::canonicalize(path).map_err(|_| lab_error("DICTATION_LAB_UNAVAILABLE", "The requested artifact is unavailable."))?; if canonical != root && !canonical.starts_with(root) { return Err(lab_error("DICTATION_LAB_PATH_REJECTED", "The requested artifact is outside the approved laboratory root.")); } Ok(canonical) }
fn read_bounded(root: &Path, path: &Path, max_bytes: u64) -> Result<String, FixvoxCloudError> { let safe = ensure_under(root, path)?; let meta = fs::metadata(&safe).map_err(|_| lab_error("DICTATION_LAB_UNAVAILABLE", "The requested artifact is unavailable."))?; if !meta.is_file() || meta.len() > max_bytes { return Err(lab_error("DICTATION_LAB_LIMIT", "The requested artifact exceeds the laboratory read limit.")); } fs::read_to_string(safe).map_err(|_| lab_error("DICTATION_LAB_UNAVAILABLE", "The requested artifact is unavailable.")) }
fn read_json(root: &Path, path: &Path) -> Result<Value, FixvoxCloudError> { serde_json::from_str(&read_bounded(root, path, MAX_JSON_BYTES)?).map_err(|_| lab_error("DICTATION_LAB_INVALID_ARTIFACT", "The laboratory artifact is not valid JSON.")) }
fn stable_id(value: &str) -> bool { !value.is_empty() && value.len() <= 160 && value.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-')) }
fn string_at<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> { let mut current = value; for key in path { current = current.get(*key)?; } current.as_str() }
fn number_at(value: &Value, path: &[&str]) -> Option<f64> { let mut current = value; for key in path { current = current.get(*key)?; } current.as_f64().filter(|n| n.is_finite()) }
fn array_strings(value: &Value, key: &str) -> Vec<String> { value.get(key).and_then(Value::as_array).map(|xs| xs.iter().filter_map(Value::as_str).take(128).map(ToOwned::to_owned).collect()).unwrap_or_default() }
fn availability(missing: Vec<String>) -> LabAvailability { LabAvailability { status: if missing.is_empty() { "available" } else { "partial" }.to_string(), missing } }
fn unavailable(missing: Vec<String>) -> LabAvailability { LabAvailability { status: "unavailable".to_string(), missing } }
fn artifact_ref(id: String, kind: &str, ok: bool, missing: &str) -> LabArtifactRef { LabArtifactRef { id, kind: kind.to_string(), availability: if ok { availability(Vec::new()) } else { unavailable(vec![missing.to_string()]) } } }
fn iso_now() -> String { format!("unix:{}", SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)) }

fn parse_results(root: &Path, path: &Path) -> Result<Vec<Value>, FixvoxCloudError> { let text = read_bounded(root, path, MAX_RESULTS_BYTES)?; let mut out = Vec::new(); for line in text.lines().take(MAX_RESULT_LINES) { if line.len() > MAX_JSON_BYTES as usize { return Err(lab_error("DICTATION_LAB_LIMIT", "A result line exceeds the laboratory read limit.")); } if !line.trim().is_empty() { if let Ok(value) = serde_json::from_str::<Value>(line) { out.push(value); } } } Ok(out) }
fn load_runs(root: &Path) -> Result<Vec<IndexedRun>, FixvoxCloudError> {
    let artifact_root = ensure_under(root, &root.join(ARTIFACT_RELATIVE_ROOT))?;
    let mut entries: Vec<_> = fs::read_dir(&artifact_root)
        .map_err(|_| lab_error("DICTATION_LAB_UNAVAILABLE", "The laboratory artifact root is unavailable."))?
        .take(MAX_DIRECTORY_ENTRIES).filter_map(Result::ok).collect();
    entries.sort_by_key(|e| e.file_name());
    let mut out = Vec::new();
    for entry in entries.into_iter().take(MAX_RUNS) {
        let path = entry.path();
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) || entry.file_name() == "corpus" { continue; }
        let run_id = entry.file_name().to_string_lossy().to_string();
        if !stable_id(&run_id) || ensure_under(root, &path).is_err() { continue; }
        let mut missing = Vec::new();
        let run = match read_json(root, &path.join("run.json")) {
            Ok(v) => v,
            Err(_) => { missing.push("run.json".to_string()); Value::Object(Map::new()) }
        };
        let manifest = read_json(root, &path.join("manifest.json")).unwrap_or_else(|_| Value::Object(Map::new()));
        let summary = match read_json(root, &path.join("summary.json")) {
            Ok(v) => v,
            Err(_) => { missing.push("summary.json".to_string()); Value::Object(Map::new()) }
        };
        let results = match parse_results(root, &path.join("results.jsonl")) {
            Ok(v) => v,
            Err(_) => { missing.push("results.jsonl".to_string()); Vec::new() }
        };
        if run.is_object() || manifest.is_object() || summary.is_object() || !results.is_empty() {
            out.push(IndexedRun { run_id, root: path, run, manifest, summary, results, missing });
        }
    }
    Ok(out)
}
fn corpus_value(root: &Path) -> Result<Value, FixvoxCloudError> { read_json(root, &root.join(ARTIFACT_RELATIVE_ROOT).join("corpus").join("manifest.json")) }
fn corpus_summary(root: &Path) -> Option<LabCorpusSummary> { let manifest = corpus_value(root).ok()?; let corpus_id = string_at(&manifest, &["corpusId"]).unwrap_or("unknown").to_string(); let version = string_at(&manifest, &["corpusVersion"]).unwrap_or("unknown").to_string(); let samples = manifest.get("samples").and_then(Value::as_array).cloned().unwrap_or_default(); let mut categories = BTreeSet::new(); let mut difficulties = BTreeSet::new(); let mut approved = 0; let mut audio = 0; for sample in &samples { for x in array_strings(sample, "categories") { categories.insert(x); } if let Some(x) = string_at(sample, &["difficulty"]) { difficulties.insert(x.to_string()); } if string_at(sample, &["goldStatus"]) == Some("approved") { approved += 1; } if let Some(id) = string_at(sample, &["id"]) { let p = root.join(ARTIFACT_RELATIVE_ROOT).join("corpus/private/audio").join(format!("{id}.wav")); if ensure_under(root, &p).is_ok() && p.is_file() { audio += 1; } } } Some(LabCorpusSummary { corpus_id: corpus_id.clone(), version, sample_count: samples.len(), approved_gold_count: approved, audio_available_count: audio, categories: categories.into_iter().collect(), difficulties: difficulties.into_iter().collect(), artifact: artifact_ref(format!("corpus:{corpus_id}"), "corpus", true, "manifest.json") }) }
fn provider_calls(run: &Value, summary: &Value, n: usize) -> ProviderCallSummary { let p = run.get("providerCalls").or_else(|| summary.get("providerCalls")); ProviderCallSummary { enabled: p.and_then(|v| v.get("enabled")).and_then(Value::as_bool).unwrap_or(false), max_requests: p.and_then(|v| v.get("maxRequests")).and_then(Value::as_u64).unwrap_or(0) as usize, observed_requests: (n > 0).then_some(n) } }
fn identity_for(v: &Value) -> EvidenceIdentity { EvidenceIdentity { configured: v.get("configured").cloned(), resolved: v.get("resolved").cloned(), observed: v.get("observed").cloned() } }
fn metric(value: Option<f64>, unit: &str, missing: &str) -> LabMetricValue { LabMetricValue { value, unit: unit.to_string(), availability: value.map(|_| availability(Vec::new())).unwrap_or_else(|| unavailable(vec![missing.to_string()])) } }
fn sample_ids(run: &IndexedRun) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    for source in [&run.run, &run.manifest, &run.summary] {
        if let Some(values) = source.get("sampleIds").and_then(Value::as_array) {
            for value in values.iter().filter_map(Value::as_str) { if stable_id(value) { ids.insert(value.to_string()); } }
        }
        if let Some(values) = source.get("samples").and_then(Value::as_array) {
            for value in values { if let Some(id) = string_at(value, &["sampleId"]).or_else(|| string_at(value, &["id"])) { if stable_id(id) { ids.insert(id.to_string()); } } }
        }
    }
    for result in &run.results { if let Some(id) = string_at(result, &["sampleId"]) { if stable_id(id) { ids.insert(id.to_string()); } } }
    ids
}
fn candidate_ids(run: &IndexedRun) -> Vec<String> { let mut ids = BTreeSet::new(); for source in [&run.run, &run.manifest, &run.summary] { if let Some(xs) = source.get("candidates").and_then(Value::as_array) { for x in xs { if let Some(id) = string_at(x, &["candidateId"]).or_else(|| string_at(x, &["configured", "candidateId"])) { if stable_id(id) { ids.insert(id.to_string()); } } } } } for x in &run.results { if let Some(id) = string_at(x, &["candidateId"]) { if stable_id(id) { ids.insert(id.to_string()); } } } ids.into_iter().collect() }
fn candidate_summary(run: &IndexedRun, id: &str) -> LabCandidateSummary { let results: Vec<&Value> = run.results.iter().filter(|r| string_at(r, &["candidateId"]) == Some(id)).collect(); let receipt = run.run.get("candidates").and_then(Value::as_array).and_then(|xs| xs.iter().find(|x| string_at(x, &["candidateId"]).or_else(|| string_at(x, &["configured", "candidateId"])) == Some(id))).cloned().unwrap_or_else(|| serde_json::json!({"configured":{"candidateId":id}})); let recipe = receipt.get("recipe").cloned().unwrap_or_else(|| serde_json::json!({})); let avg = |path: &[&str]| { let xs: Vec<f64> = results.iter().filter_map(|r| number_at(r, path)).collect(); (!xs.is_empty()).then_some(xs.iter().sum::<f64>() / xs.len() as f64) }; let coverage = (!run.results.is_empty()).then_some(results.len() as f64 / run.results.len() as f64); let fallback = results.iter().filter(|r| string_at(r, &["rawSource", "kind"]) == Some("reused")).count() as f64; LabCandidateSummary { candidate_id: id.to_string(), label: receipt.get("label").and_then(Value::as_str).unwrap_or(id).to_string(), recipe: redact_public(&recipe), identity: identity_for(&receipt), sample_count: results.len(), coverage: metric(coverage, "ratio", "results"), wer: metric(avg(&["scores", "wer"]), "ratio", "scores.wer"), cer: metric(avg(&["scores", "cer"]), "ratio", "scores.cer"), entity_accuracy: metric(avg(&["scores", "entities", "exactMatchRate"]), "ratio", "scores.entities"), structure_accuracy: metric(avg(&["scores", "structure", "lists"]), "ratio", "scores.structure"), semantic_safety: metric(avg(&["scores", "semanticSafety", "instructionFollowing"]), "ratio", "scores.semanticSafety"), latency: metric(avg(&["timingsMs", "total"]), "milliseconds", "timingsMs.total"), cost: metric(avg(&["costUsd", "total"]), "usd", "costUsd.total"), fallback_count: metric(Some(fallback), "count", "rawSource"), regression_reasons: Vec::new(), availability: availability(run.missing.clone()) } }
fn run_summary(run: &IndexedRun) -> LabRunSummary {
    let corpus_id = string_at(&run.run, &["corpus", "corpusId"]).or_else(|| string_at(&run.summary, &["corpus", "corpusId"])).or_else(|| string_at(&run.manifest, &["corpus", "corpusId"])).unwrap_or("unknown").to_string();
    let sample_count = run.run.get("sampleIds").and_then(Value::as_array).map(Vec::len).or_else(|| run.summary.get("sampleCount").and_then(Value::as_u64).map(|x| x as usize)).unwrap_or_else(|| run.results.iter().filter_map(|r| string_at(r, &["sampleId"])).collect::<BTreeSet<_>>().len());
    let schema_version = run.run.get("schemaVersion").and_then(Value::as_u64).or_else(|| run.summary.get("schemaVersion").and_then(Value::as_u64)).map(|x| x.to_string()).unwrap_or_else(|| "unknown".to_string());
    let status = [string_at(&run.run, &["status"]), string_at(&run.summary, &["status"]), string_at(&run.manifest, &["status"])].into_iter().flatten().find(|value| matches!(*value, "planned" | "running" | "completed" | "failed" | "cancelled")).unwrap_or("completed").to_string();
    LabRunSummary { run_id: run.run_id.clone(), schema_version, status, started_at: string_at(&run.run, &["startedAt"]).map(ToOwned::to_owned), completed_at: string_at(&run.run, &["finishedAt"]).or_else(|| string_at(&run.summary, &["completedAt"])).map(ToOwned::to_owned), corpus_id, sample_count, candidate_count: candidate_ids(run).len(), result_count: run.results.len(), provider_calls: provider_calls(&run.run, &run.summary, run.results.len()), estimated_cost_usd: number_at(&run.summary, &["estimatedCostUsd"]), observed_cost_usd: run.results.iter().filter_map(|r| number_at(r, &["costUsd", "total"])).reduce(|a,b| a+b), candidates: candidate_ids(run).iter().map(|id| candidate_summary(run, id)).collect(), availability: availability(run.missing.clone()) }
}
fn find_result<'a>(run: &'a IndexedRun, sample: &str, candidate: &str) -> Option<&'a Value> { run.results.iter().find(|r| string_at(r, &["sampleId"]) == Some(sample) && string_at(r, &["candidateId"]) == Some(candidate)) }
fn corpus_sample(root: &Path, id: &str) -> Option<Value> { corpus_value(root).ok()?.get("samples")?.as_array()?.iter().find(|x| string_at(x, &["id"]) == Some(id)).cloned() }
fn indexed_private_path(root: &Path, run: &IndexedRun, result: Option<&Value>, sample: &str, candidate: &str, kind: &str) -> Option<PathBuf> { let key = match kind { "raw" => "rawTranscriptRef", "final" => "finalTextRef", "gold" => "goldRef", _ => return None }; if let Some(r) = result.and_then(|x| x.get("text")).and_then(|x| x.get(key)).and_then(Value::as_str) { let p = root.join(r); if ensure_under(root, &p).is_ok() && p.is_file() { return Some(p); } } let base = run.root.join("private").join(sample); let names = match kind { "raw" => ["raw.txt"].as_slice(), "final" => ["final.txt"].as_slice(), "gold" => ["gold.txt"].as_slice(), _ => &[] }; let mut dirs = vec![base.clone(), base.join(candidate)]; if let Ok(xs) = fs::read_dir(&base) { for e in xs.take(MAX_DIRECTORY_ENTRIES).filter_map(Result::ok) { if e.file_type().map(|t| t.is_dir()).unwrap_or(false) { dirs.push(e.path()); } } } for d in dirs { for name in names { let p = d.join(name); if ensure_under(root, &p).is_ok() && p.is_file() { return Some(p); } } } None }
fn sample_summary(root: &Path, run: &IndexedRun, sample: &str, candidate: &str) -> Result<LabSampleSummary, FixvoxCloudError> { let result = find_result(run, sample, candidate); if result.is_none() && !run.results.is_empty() { return Err(lab_error("DICTATION_LAB_ID_NOT_INDEXED", "The requested sample candidate is not indexed.")); } let corpus = corpus_sample(root, sample).unwrap_or_else(|| serde_json::json!({})); let audio = corpus.get("audioArtifactPath").and_then(Value::as_str).map(|x| root.join(x)).filter(|p| ensure_under(root, p).is_ok() && p.is_file()).or_else(|| { let p = root.join(ARTIFACT_RELATIVE_ROOT).join("corpus/private/audio").join(format!("{sample}.wav")); (ensure_under(root, &p).is_ok() && p.is_file()).then_some(p) }).is_some(); let raw = indexed_private_path(root, run, result, sample, candidate, "raw").is_some(); let final_text = indexed_private_path(root, run, result, sample, candidate, "final").is_some(); let gold = indexed_private_path(root, run, result, sample, candidate, "gold").is_some(); let missing = [("audio",audio),("raw",raw),("final",final_text),("gold",gold)].into_iter().filter_map(|(x,ok)| (!ok).then_some(x.to_string())).collect(); let scores = result.and_then(|r| r.get("scores")); let fallback = result.and_then(|r| string_at(r, &["rawSource", "kind"])); Ok(LabSampleSummary { run_id: run.run_id.clone(), sample_id: sample.to_string(), candidate_id: candidate.to_string(), language: string_at(&corpus, &["language"]).unwrap_or("unknown").to_string(), categories: array_strings(&corpus, "categories"), difficulty: string_at(&corpus, &["difficulty"]).unwrap_or("unknown").to_string(), sensitivity: string_at(&corpus, &["sensitivity"]).unwrap_or("unknown").to_string(), gold_status: string_at(&corpus, &["goldStatus"]).unwrap_or("unknown").to_string(), audio: artifact_ref(format!("audio:{}", sample), "audio", audio, "audio"), raw: artifact_ref(format!("private-text:{}:{}:{}:raw", run.run_id, sample, candidate), "private-text", raw, "raw"), final_text: artifact_ref(format!("private-text:{}:{}:{}:final", run.run_id, sample, candidate), "private-text", final_text, "final"), gold: artifact_ref(format!("private-text:{}:{}:{}:gold", run.run_id, sample, candidate), "private-text", gold, "gold"), scores: SampleScores { wer: scores.and_then(|v| v.get("wer")).and_then(Value::as_f64), cer: scores.and_then(|v| v.get("cer")).and_then(Value::as_f64), entities: scores.and_then(|v| v.get("entities")).and_then(|v| v.get("exactMatchRate")).and_then(Value::as_f64), structure: scores.and_then(|v| v.get("structure")).and_then(|v| v.get("lists")).and_then(Value::as_f64), semantic_safety: scores.and_then(|v| v.get("semanticSafety")).and_then(|v| v.get("instructionFollowing")).and_then(Value::as_f64) }, fallback: FallbackSummary { used: fallback.map(|x| x == "reused"), reasons: result.and_then(|r| r.get("stages")).and_then(|s| s.get("materialization")).map(|m| array_strings(m, "reasons")).unwrap_or_default() }, latency_ms: result.and_then(|r| number_at(r, &["timingsMs", "total"])), cost_usd: result.and_then(|r| number_at(r, &["costUsd", "total"])), availability: availability(missing) }) }

#[tauri::command]
pub async fn list_dictation_lab_artifacts() -> Result<LabArtifactIndex, FixvoxCloudError> { let root = approved_root()?; let runs = load_runs(&root)?; let corpus = corpus_summary(&root); Ok(LabArtifactIndex { schema_version: 1, root_id: "transcription-quality".to_string(), generated_at: iso_now(), runs: runs.iter().map(run_summary).collect(), corpora: corpus.clone().into_iter().collect(), availability: availability(if corpus.is_some() { Vec::new() } else { vec!["corpus/manifest.json".to_string()] }) }) }
#[tauri::command]
pub async fn load_dictation_lab_run(run_id: String) -> Result<Value, FixvoxCloudError> {
    if !stable_id(&run_id) { return Err(lab_error("DICTATION_LAB_ID_INVALID", "The laboratory run identifier is invalid.")); }
    let root = approved_root()?;
    let run = load_runs(&root)?.into_iter().find(|x| x.run_id == run_id).ok_or_else(|| lab_error("DICTATION_LAB_ID_NOT_INDEXED", "The laboratory run is not indexed."))?;
    Ok(serde_json::json!({"run":redact_public(&run.run),"summary":redact_public(&run.summary),"resultCount":run.results.len(),"availability":availability(run.missing)}))
}
#[tauri::command]
pub async fn load_dictation_lab_sample(run_id: String, sample_id: String, candidate_id: String) -> Result<LabSampleSummary, FixvoxCloudError> {
    if !stable_id(&run_id) || !stable_id(&sample_id) || !stable_id(&candidate_id) { return Err(lab_error("DICTATION_LAB_ID_INVALID", "The laboratory identifier is invalid.")); }

    let root = approved_root()?;
    let run = load_runs(&root)?.into_iter().find(|x| x.run_id == run_id).ok_or_else(|| lab_error("DICTATION_LAB_ID_NOT_INDEXED", "The laboratory run is not indexed."))?;
    if !sample_ids(&run).contains(&sample_id) || !candidate_ids(&run).iter().any(|x| x == &candidate_id) { return Err(lab_error("DICTATION_LAB_ID_NOT_INDEXED", "The laboratory sample or candidate is not indexed.")); }
    sample_summary(&root, &run, &sample_id, &candidate_id)
}
#[tauri::command]
pub async fn read_dictation_lab_private_text(run_id: String, sample_id: String, candidate_id: String, kind: String) -> Result<String, FixvoxCloudError> {
    if !stable_id(&run_id) || !stable_id(&sample_id) || !stable_id(&candidate_id) || !matches!(kind.as_str(), "raw"|"final"|"gold") { return Err(lab_error("DICTATION_LAB_ID_INVALID", "The laboratory identifier or text kind is invalid.")); }
    let root = approved_root()?;
    let run = load_runs(&root)?.into_iter().find(|x| x.run_id == run_id).ok_or_else(|| lab_error("DICTATION_LAB_ID_NOT_INDEXED", "The laboratory run is not indexed."))?;
    if !sample_ids(&run).contains(&sample_id) || !candidate_ids(&run).iter().any(|x| x == &candidate_id) { return Err(lab_error("DICTATION_LAB_ID_NOT_INDEXED", "The laboratory sample or candidate is not indexed.")); }
    let result = find_result(&run, &sample_id, &candidate_id);
    let path = indexed_private_path(&root, &run, result, &sample_id, &candidate_id, &kind).ok_or_else(|| lab_error("DICTATION_LAB_UNAVAILABLE", "The requested private text is unavailable."))?;
    read_bounded(&root, &path, MAX_PRIVATE_BYTES)
}
#[tauri::command]
pub async fn resolve_dictation_lab_audio(run_id: String, sample_id: String, candidate_id: Option<String>) -> Result<Value, FixvoxCloudError> {
    if !stable_id(&run_id) || !stable_id(&sample_id) || candidate_id.as_deref().is_some_and(|x| !stable_id(x)) { return Err(lab_error("DICTATION_LAB_ID_INVALID", "The laboratory identifier is invalid.")); }
    let root = approved_root()?;
    let run = load_runs(&root)?.into_iter().find(|x| x.run_id == run_id).ok_or_else(|| lab_error("DICTATION_LAB_ID_NOT_INDEXED", "The laboratory run is not indexed."))?;
    if !sample_ids(&run).contains(&sample_id) { return Err(lab_error("DICTATION_LAB_ID_NOT_INDEXED", "The laboratory sample is not indexed.")); }
    if let Some(id) = candidate_id.as_deref() { if !candidate_ids(&run).iter().any(|x| x == id) { return Err(lab_error("DICTATION_LAB_ID_NOT_INDEXED", "The laboratory candidate is not indexed.")); } }
    let corpus = corpus_sample(&root, &sample_id).ok_or_else(|| lab_error("DICTATION_LAB_ID_NOT_INDEXED", "The laboratory sample is not indexed."))?;
    let path = corpus.get("audioArtifactPath").and_then(Value::as_str).map(|x| root.join(x)).filter(|p| ensure_under(&root,p).is_ok() && p.is_file()).or_else(|| { let p = root.join(ARTIFACT_RELATIVE_ROOT).join("corpus/private/audio").join(format!("{sample_id}.wav")); (ensure_under(&root,&p).is_ok() && p.is_file()).then_some(p) }).ok_or_else(|| lab_error("DICTATION_LAB_UNAVAILABLE", "The requested audio is unavailable."))?;
    let safe = ensure_under(&root, &path)?;
    let bytes = fs::metadata(&safe).map_err(|_| lab_error("DICTATION_LAB_UNAVAILABLE", "The requested audio is unavailable."))?.len();
    if bytes > MAX_AUDIO_BYTES { return Err(lab_error("DICTATION_LAB_LIMIT", "The requested audio exceeds the laboratory read limit.")); }
    Ok(serde_json::json!({"available":true,"kind":"audio","mimeType":"audio/wav","bytes":bytes,"audioId":format!("audio:{}",sample_id),"readable":true}))
}
fn adjudication_file_path(run: &IndexedRun) -> PathBuf {
    run.root.join("private").join("laboratory-adjudication.json")
}

fn adjudication_public_path(run: &IndexedRun) -> PathBuf {
    run.root.join("laboratory-adjudication-summary.json")
}

fn empty_adjudication_file() -> LaboratoryAdjudicationFile {
    LaboratoryAdjudicationFile { schema_version: 1, revision: 0, mutations: Vec::new() }
}

fn read_adjudication_file(root: &Path, run: &IndexedRun) -> Result<LaboratoryAdjudicationFile, FixvoxCloudError> {
    let path = adjudication_file_path(run);
    if !path.exists() {
        return Ok(empty_adjudication_file());
    }
    let text = read_bounded(root, &path, MAX_PRIVATE_BYTES)?;
    serde_json::from_str(&text).map_err(|_| lab_error("DICTATION_LAB_VERDICT_INVALID", "The adjudication sidecar is invalid."))
}

fn write_json_atomic(root: &Path, path: &Path, value: &Value) -> Result<(), FixvoxCloudError> {
    let parent = path.parent().ok_or_else(|| lab_error("DICTATION_LAB_VERDICT_UNAVAILABLE", "The adjudication sidecar location is unavailable."))?;
    fs::create_dir_all(parent).map_err(|_| lab_error("DICTATION_LAB_VERDICT_UNAVAILABLE", "The adjudication sidecar location is unavailable."))?;
    ensure_under(root, parent)?;
    let body = serde_json::to_vec(value).map_err(|_| lab_error("DICTATION_LAB_VERDICT_INVALID", "The adjudication sidecar could not be encoded."))?;
    let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or("laboratory-adjudication");
    let temp = parent.join(format!(".{file_name}.tmp"));
    fs::write(&temp, body).map_err(|_| lab_error("DICTATION_LAB_VERDICT_UNAVAILABLE", "The adjudication sidecar could not be written."))?;
    if fs::rename(&temp, path).is_err() {
        if path.exists() {
            fs::remove_file(path).map_err(|_| lab_error("DICTATION_LAB_VERDICT_UNAVAILABLE", "The adjudication sidecar could not be replaced."))?;
        }
        fs::rename(&temp, path).map_err(|_| lab_error("DICTATION_LAB_VERDICT_UNAVAILABLE", "The adjudication sidecar could not be replaced."))?;
    }
    Ok(())
}

fn verdict_content_hash(mutation: &LabHumanVerdictMutation, revision: u64) -> String {
    let mut hasher = DefaultHasher::new();
    mutation.run_id.hash(&mut hasher);
    mutation.sample_id.hash(&mut hasher);
    mutation.candidate_id.hash(&mut hasher);
    mutation.verdict.hash(&mut hasher);
    revision.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[tauri::command]
pub fn record_dictation_lab_verdict(mutation: LabHumanVerdictMutation) -> Result<Value, FixvoxCloudError> {
    if !stable_id(&mutation.run_id) || !stable_id(&mutation.sample_id) || !stable_id(&mutation.candidate_id) {
        return Err(lab_error("DICTATION_LAB_ID_INVALID", "The laboratory identifier is invalid."));
    }
    if !matches!(mutation.verdict.as_str(), "better" | "same" | "lost-content" | "added-content" | "changed-intent" | "improved-structure" | "improved-terms") {
        return Err(lab_error("DICTATION_LAB_VERDICT_INVALID", "The human verdict is invalid."));
    }
    let _guard = ADJUDICATION_LOCK.lock().map_err(|_| lab_error("DICTATION_LAB_VERDICT_UNAVAILABLE", "The adjudication store is unavailable."))?;
    let root = approved_root()?;
    let run = load_runs(&root)?.into_iter().find(|item| item.run_id == mutation.run_id).ok_or_else(|| lab_error("DICTATION_LAB_ID_NOT_INDEXED", "The laboratory run is not indexed."))?;
    if !sample_ids(&run).contains(&mutation.sample_id) || !candidate_ids(&run).iter().any(|id| id == &mutation.candidate_id) {
        return Err(lab_error("DICTATION_LAB_ID_NOT_INDEXED", "The laboratory sample or candidate is not indexed."));
    }
    let mut file = read_adjudication_file(&root, &run)?;
    if mutation.expected_revision.unwrap_or(0) != file.revision {
        return Err(lab_error("DICTATION_LAB_VERDICT_REVISION_CONFLICT", "The adjudication revision has changed. Reload before saving."));
    }
    if file.revision == u64::MAX {
        return Err(lab_error("DICTATION_LAB_VERDICT_LIMIT", "The adjudication revision limit has been reached."));
    }
    let revision = file.revision + 1;
    let content_hash = verdict_content_hash(&mutation, revision);
    file.revision = revision;
    file.mutations.push(LaboratoryAdjudicationMutation {
        run_id: mutation.run_id.clone(),
        sample_id: mutation.sample_id.clone(),
        candidate_id: mutation.candidate_id.clone(),
        verdict: mutation.verdict.clone(),
        revision,
        content_hash: content_hash.clone(),
    });
    if file.mutations.len() > MAX_ADJUDICATION_MUTATIONS {
        let excess = file.mutations.len() - MAX_ADJUDICATION_MUTATIONS;
        file.mutations.drain(0..excess);
    }
    write_json_atomic(&root, &adjudication_file_path(&run), &serde_json::to_value(&file).map_err(|_| lab_error("DICTATION_LAB_VERDICT_INVALID", "The adjudication sidecar could not be encoded."))?)?;
    let public: Vec<LaboratoryAdjudicationPublicMutation> = file.mutations.iter().map(|item| LaboratoryAdjudicationPublicMutation {
        run_id: item.run_id.clone(),
        sample_id: item.sample_id.clone(),
        candidate_id: item.candidate_id.clone(),
        verdict: item.verdict.clone(),
        content_hash: item.content_hash.clone(),
    }).collect();
    write_json_atomic(&root, &adjudication_public_path(&run), &serde_json::to_value(&public).map_err(|_| lab_error("DICTATION_LAB_VERDICT_INVALID", "The adjudication summary could not be encoded."))?)?;
    Ok(serde_json::json!({"ok":true,"revision":revision,"summary":{"runId":mutation.run_id,"sampleId":mutation.sample_id,"candidateId":mutation.candidate_id,"verdict":mutation.verdict,"contentHash":content_hash}}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_ids_reject_paths_and_traversal() {
        assert!(stable_id("gate-a-20260812-v3"));
        assert!(!stable_id("../private"));
        assert!(!stable_id("run/private"));
        assert!(!stable_id("C:\\private"));
    }

    #[test]
    fn public_redaction_removes_private_refs_and_paths_recursively() {
        let source = serde_json::json!({
            "configured": {"candidateId": "short-auto"},
            "privateRef": "artifacts/transcription-quality/private/raw.txt",
            "nested": {"audioPath": "private/audio.wav", "wer": 0.2}
        });
        let redacted = redact_public(&source);
        assert_eq!(redacted["configured"]["candidateId"], "short-auto");
        assert_eq!(redacted["nested"]["wer"], 0.2);
        assert!(redacted.get("privateRef").is_none());
        assert!(redacted["nested"].get("audioPath").is_none());
    }

    #[test]
    fn canonical_guard_rejects_existing_paths_outside_root() {
        let root = approved_root().expect("approved root");
        if let Some(parent) = root.parent() {
            let error = ensure_under(&root, parent).expect_err("must reject parent");
            assert_eq!(error.code, "DICTATION_LAB_PATH_REJECTED");
        }
    }
}
