import { useState } from "react";

import type { LabRunEvidence } from "./evaluation";
import type {
  LabArtifactIndex,
  LabCandidateSummary,
  LabExperimentDefinition,
  LabExperimentEstimate,
  LabJobSnapshot,
  LabRunSummary,
  LabSampleSummary,
  LaboratoryProfile,
} from "./types";

export type LabWorkspace = "overview" | "experiments" | "results" | "recipes" | "corpus";

export const labWorkspaces: ReadonlyArray<{ id: LabWorkspace; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "Readiness and recent work" },
  { id: "experiments", label: "Experiments", description: "Define and run comparisons" },
  { id: "results", label: "Results", description: "Runs, candidates and evidence" },
  { id: "recipes", label: "Recipes", description: "Profiles and published versions" },
  { id: "corpus", label: "Corpus", description: "Approved evaluation inputs" },
];

export type LabArtifactState = {
  index: LabArtifactIndex | null;
  loading: boolean;
  error: string;
};

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export function StatusChip({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <span className="lab-status-chip" data-tone={tone}>{label}</span>;
}

function availabilityTone(status: "available" | "partial" | "unavailable"): Tone {
  if (status === "available") return "success";
  if (status === "partial") return "warning";
  return "neutral";
}

export function StatePanel({ title, detail, tone = "neutral", busy = false }: { title: string; detail: string; tone?: Tone; busy?: boolean }) {
  return (
    <section className="lab-state-panel" data-tone={tone} aria-busy={busy || undefined}>
      <div><h3>{title}</h3><StatusChip label={busy ? "Loading" : tone === "danger" ? "Error" : tone === "warning" ? "Partial" : "Unavailable"} tone={tone} /></div>
      <p>{detail}</p>
    </section>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "No observado";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "No observado" : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatMetric(metric: LabCandidateSummary["wer"]): string {
  if (metric.value === null) return "No observado";
  if (metric.unit === "ratio") return `${(metric.value * 100).toFixed(1)}%`;
  if (metric.unit === "milliseconds") return `${formatNumber(metric.value, 0)} ms`;
  if (metric.unit === "usd") return `$${metric.value.toFixed(4)}`;
  return formatNumber(metric.value, 0);
}

export function OverviewWorkspace({ artifacts, profiles, localRuns, job }: { artifacts: LabArtifactState; profiles: readonly LaboratoryProfile[]; localRuns: readonly LabRunEvidence[]; job: LabJobSnapshot | null }) {
  const availability = artifacts.index?.availability;
  return (
    <div className="lab-workspace-content">
      <header className="lab-page-heading">
        <div><h2>Laboratory overview</h2><p>Artifact readiness, active work and operator-owned recipe state.</p></div>
        {availability ? <StatusChip label={availability.status} tone={availabilityTone(availability.status)} /> : null}
      </header>
      <dl className="lab-summary-strip" aria-label="Laboratory summary">
        <div><dt>Published profiles</dt><dd>{profiles.filter((profile) => profile.published).length}</dd></div>
        <div><dt>Indexed runs</dt><dd>{artifacts.index?.runs.length ?? "—"}</dd></div>
        <div><dt>Completed runs</dt><dd>{artifacts.index?.runs.filter((run) => run.status === "completed").length ?? "—"}</dd></div>
        <div><dt>Corpora</dt><dd>{artifacts.index?.corpora.length ?? "—"}</dd></div>
        <div><dt>Local replay inputs</dt><dd>{localRuns.length}</dd></div>
      </dl>
      {artifacts.loading ? <StatePanel title="Reading canonical artifacts" detail="Run and corpus counts remain unknown until the local index responds." busy /> : artifacts.error ? <StatePanel title="Canonical artifacts unavailable" detail={`${artifacts.error} Existing Recipes data remains available; no example results were substituted.`} tone="danger" /> : !artifacts.index ? <StatePanel title="Canonical artifacts unavailable" detail="The local artifact gateway is not present in this build. Existing Recipes data remains available; no example results were substituted." /> : availability?.status !== "available" ? <StatePanel title="Artifact index is partial" detail={`Missing: ${availability?.missing.join(", ") || "unspecified artifact evidence"}. Missing metrics stay unobserved.`} tone="warning" /> : null}
      <div className="lab-overview-grid">
        <section className="lab-panel">
          <div className="lab-section-heading"><div><h3>Recent runs</h3><p>Canonical run summaries, newest timestamps first.</p></div><span>{artifacts.index?.runs.length ?? 0}</span></div>
          {artifacts.index?.runs.length ? <div className="lab-compact-list">{artifacts.index.runs.slice(0, 5).map((run) => <div key={run.runId}><div><strong>{run.runId}</strong><span>{run.corpusId}</span></div><div><StatusChip label={run.status} tone={run.status === "completed" ? "success" : run.status === "failed" ? "danger" : run.status === "running" ? "info" : "neutral"} /><time>{formatDate(run.completedAt ?? run.startedAt)}</time></div></div>)}</div> : <p className="lab-empty">No canonical runs are indexed. Create an experiment only after a corpus and estimate are available.</p>}
        </section>
        <section className="lab-panel">
          <div className="lab-section-heading"><div><h3>Current job</h3><p>Job state is reported by the local orchestrator.</p></div>{job ? <StatusChip label={job.state} tone={job.state === "completed" ? "success" : job.state === "failed" ? "danger" : job.state === "running" ? "info" : "neutral"} /> : null}</div>
          {job ? <dl className="lab-detail-list"><div><dt>Job</dt><dd>{job.jobId}</dd></div><div><dt>Mode</dt><dd>{job.mode}</dd></div><div><dt>Progress</dt><dd>{job.completedUnits} / {job.totalUnits}</dd></div><div><dt>Run</dt><dd>{job.runId ?? "Not assigned"}</dd></div></dl> : <p className="lab-empty">No queued or running job is reported. Experiments remain idle until explicitly started.</p>}
        </section>
      </div>
    </div>
  );
}

export function ExperimentsWorkspace({ artifacts, definition, estimate, estimateLoading, estimateError, job, orchestrationAvailable, onChange, onEstimate, onStart, onCancel }: { artifacts: LabArtifactState; definition: LabExperimentDefinition; estimate: LabExperimentEstimate | null; estimateLoading: boolean; estimateError: string; job: LabJobSnapshot | null; orchestrationAvailable: boolean; onChange: (next: LabExperimentDefinition) => void; onEstimate: () => void; onStart: () => void; onCancel: () => void }) {
  const corpora = artifacts.index?.corpora ?? [];
  const canEstimate = orchestrationAvailable && Boolean(definition.corpusId) && definition.sttRecipes.length > 0 && definition.postprocessRecipes.length > 0;
  const jobActive = job?.state === "queued" || job?.state === "running";
  const setCsv = (key: "sampleIds" | "sttRecipes" | "materializations" | "postprocessRecipes", value: string) => onChange({ ...definition, [key]: value.split(",").map((item) => item.trim()).filter(Boolean) });
  return (
    <div className="lab-workspace-content">
      <header className="lab-page-heading"><div><h2>Experiments</h2><p>Define the matrix first, inspect the estimate, then start an explicit job.</p></div><StatusChip label={definition.mode === "provider-real" ? "Provider access required" : "Provider-free"} tone={definition.mode === "provider-real" ? "warning" : "info"} /></header>
      {!orchestrationAvailable ? <StatePanel title="Experiment orchestration unavailable" detail="This build can edit a definition, but it cannot estimate or start work. No provider call will be attempted." /> : null}
      {artifacts.error ? <StatePanel title="Corpus index unavailable" detail="A canonical corpus is required before the experiment can be estimated." tone="danger" /> : null}
      <div className="lab-split-layout">
        <form className="lab-panel lab-experiment-form" onSubmit={(event) => { event.preventDefault(); onEstimate(); }}>
          <div className="lab-section-heading"><div><h3>Experiment definition</h3><p>Comma-separated fields accept stable IDs only.</p></div><span>Schema v{definition.schemaVersion}</span></div>
          <fieldset className="lab-choice-group"><legend>Execution mode</legend><label><input type="radio" name="experiment-mode" checked={definition.mode === "provider-free-replay"} onChange={() => onChange({ ...definition, mode: "provider-free-replay" })} /><span><strong>Provider-free replay</strong><small>Reuse existing raw artifacts without provider requests.</small></span></label><label><input type="radio" name="experiment-mode" checked={definition.mode === "provider-real"} onChange={() => onChange({ ...definition, mode: "provider-real" })} /><span><strong>Provider-real</strong><small>Requires a separate execution grant and bounded request estimate.</small></span></label></fieldset>
          <div className="lab-field-grid">
            <label><span>Corpus</span><select value={definition.corpusId} onChange={(event) => onChange({ ...definition, corpusId: event.currentTarget.value })} required><option value="">Choose a corpus</option>{corpora.map((corpus) => <option key={`${corpus.corpusId}:${corpus.version}`} value={corpus.corpusId}>{corpus.corpusId} · {corpus.version}</option>)}</select></label>
            <label><span>Baseline candidate ID</span><input value={definition.baselineCandidateId ?? ""} onChange={(event) => onChange({ ...definition, baselineCandidateId: event.currentTarget.value || null })} placeholder="Optional stable ID" /></label>
            <label className="lab-field-wide"><span>Sample IDs</span><input value={definition.sampleIds.join(", ")} onChange={(event) => setCsv("sampleIds", event.currentTarget.value)} placeholder="Empty uses the corpus selection" /></label>
            <label className="lab-field-wide"><span>STT recipe IDs</span><input value={definition.sttRecipes.join(", ")} onChange={(event) => setCsv("sttRecipes", event.currentTarget.value)} placeholder="recipe-a, recipe-b" required /></label>
            <label className="lab-field-wide"><span>Materialization IDs</span><input value={definition.materializations.join(", ")} onChange={(event) => setCsv("materializations", event.currentTarget.value)} placeholder="raw-v1" /></label>
            <label className="lab-field-wide"><span>Post-process recipe IDs</span><input value={definition.postprocessRecipes.join(", ")} onChange={(event) => setCsv("postprocessRecipes", event.currentTarget.value)} placeholder="cleanup-a" required /></label>
          </div>
          <div className="lab-form-actions"><button type="submit" className="lab-secondary-button" disabled={!canEstimate || estimateLoading || jobActive}>{estimateLoading ? "Estimating" : "Estimate experiment"}</button><button type="button" className="lab-primary-button" disabled={!estimate || estimate.providerRequired || estimateLoading || jobActive} onClick={onStart}>Start experiment</button></div>
        </form>
        <aside className="lab-panel" aria-label="Experiment estimate and job status">
          <div className="lab-section-heading"><div><h3>Estimate</h3><p>Server-owned bounds, never inferred from missing evidence.</p></div>{estimate ? <StatusChip label={estimate.providerRequired ? "Grant required" : "Ready"} tone={estimate.providerRequired ? "warning" : "success"} /> : null}</div>
          {estimateError ? <StatePanel title="Estimate unavailable" detail={estimateError} tone="danger" /> : estimate ? <dl className="lab-detail-list"><div><dt>Samples</dt><dd>{estimate.sampleCount}</dd></div><div><dt>Candidates</dt><dd>{estimate.candidateCount}</dd></div><div><dt>Combinations</dt><dd>{estimate.combinationCount}</dd></div><div><dt>STT calls</dt><dd>{estimate.sttCalls}</dd></div><div><dt>Post-process calls</dt><dd>{estimate.postprocessCalls}</dd></div><div><dt>Reused raw</dt><dd>{estimate.reusedRawCount}</dd></div><div><dt>Request ceiling</dt><dd>{estimate.maxRequests}</dd></div><div><dt>Cost ceiling</dt><dd>${estimate.maxCostUsd.toFixed(4)}</dd></div></dl> : <p className="lab-empty">Complete the required fields and request an estimate. Starting remains disabled until an estimate is returned.</p>}
          {estimate?.oneVariableWarnings.length ? <div className="lab-inline-notice" data-tone="warning"><strong>Comparison warnings</strong><ul>{estimate.oneVariableWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
          {job ? <div className="lab-job-status" aria-live="polite"><div><strong>{job.jobId}</strong><StatusChip label={job.state} tone={job.state === "completed" ? "success" : job.state === "failed" ? "danger" : job.state === "running" ? "info" : "neutral"} /></div><progress value={job.completedUnits} max={Math.max(job.totalUnits, 1)}>{job.completedUnits} of {job.totalUnits}</progress><span>{job.completedUnits} of {job.totalUnits} units · run {job.runId ?? "not assigned"}</span>{jobActive ? <button type="button" className="lab-danger-button" onClick={onCancel}>Cancel job</button> : null}{job.errorCode ? <p className="lab-error-text">Error code: {job.errorCode}</p> : null}</div> : null}
        </aside>
      </div>
    </div>
  );
}

export function ResultsWorkspace({ artifacts, selectedRun, samples, samplesLoading, samplesError, onSelectRun }: { artifacts: LabArtifactState; selectedRun: LabRunSummary | null; samples: readonly LabSampleSummary[]; samplesLoading: boolean; samplesError: string; onSelectRun: (run: LabRunSummary) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const runs = (artifacts.index?.runs ?? []).filter((run) => (!query || `${run.runId} ${run.corpusId}`.toLowerCase().includes(query.toLowerCase())) && (status === "all" || run.status === status));
  return (
    <div className="lab-workspace-content">
      <header className="lab-page-heading"><div><h2>Results</h2><p>Run summaries and redacted candidate evidence from canonical artifacts.</p></div><span className="lab-result-count">{runs.length} shown</span></header>
      <div className="lab-filter-bar" role="search" aria-label="Filter results"><label><span>Find run</span><input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Run or corpus ID" /></label><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.currentTarget.value)}><option value="all">All statuses</option><option value="planned">Planned</option><option value="running">Running</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></label></div>
      {artifacts.loading ? <StatePanel title="Reading results" detail="Run summaries will appear after the local artifact index responds." busy /> : artifacts.error ? <StatePanel title="Results unavailable" detail={`${artifacts.error} No production result was fabricated.`} tone="danger" /> : !artifacts.index ? <StatePanel title="Results unavailable" detail="The canonical artifact gateway is not present in this build. No production result was fabricated." /> : <div className="lab-table-region" tabIndex={0} role="region" aria-label="Experiment runs table"><table className="lab-data-table"><thead><tr><th scope="col">Run</th><th scope="col">Status</th><th scope="col">Corpus</th><th scope="col">Samples</th><th scope="col">Candidates</th><th scope="col">Results</th><th scope="col">Observed cost</th><th scope="col">Completed</th></tr></thead><tbody>{runs.map((run) => <tr key={run.runId} data-selected={selectedRun?.runId === run.runId}><th scope="row"><button type="button" className="lab-table-link" onClick={() => onSelectRun(run)}>{run.runId}</button></th><td><StatusChip label={run.status} tone={run.status === "completed" ? "success" : run.status === "failed" ? "danger" : run.status === "running" ? "info" : "neutral"} /></td><td>{run.corpusId}</td><td>{run.sampleCount}</td><td>{run.candidateCount}</td><td>{run.resultCount}</td><td>{run.observedCostUsd === null ? "No observado" : `$${run.observedCostUsd.toFixed(4)}`}</td><td>{formatDate(run.completedAt)}</td></tr>)}</tbody></table>{!runs.length ? <p className="lab-table-empty">No runs match these filters. Clear the search or choose another status.</p> : null}</div>}
      {selectedRun ? <RunDrilldown run={selectedRun} samples={samples} samplesLoading={samplesLoading} samplesError={samplesError} /> : <StatePanel title="No run selected" detail="Choose a run ID in the table to inspect candidates and sample evidence." />}
    </div>
  );
}

function RunDrilldown({ run, samples, samplesLoading, samplesError }: { run: LabRunSummary; samples: readonly LabSampleSummary[]; samplesLoading: boolean; samplesError: string }) {
  return (
    <section className="lab-drilldown" aria-labelledby="lab-run-detail-title">
      <div className="lab-section-heading"><div><h3 id="lab-run-detail-title">Run {run.runId}</h3><p>{run.corpusId} · {run.sampleCount} samples · {run.resultCount} results</p></div><StatusChip label={run.availability.status} tone={availabilityTone(run.availability.status)} /></div>
      {run.availability.missing.length ? <p className="lab-partial-note">Missing evidence: {run.availability.missing.join(", ")}. Missing values are not converted to zero.</p> : null}
      <div className="lab-table-region" tabIndex={0} role="region" aria-label={`Candidates for run ${run.runId}`}><table className="lab-data-table lab-candidate-table"><thead><tr><th scope="col">Candidate</th><th scope="col">Coverage</th><th scope="col">WER</th><th scope="col">CER</th><th scope="col">Entities</th><th scope="col">Structure</th><th scope="col">Safety</th><th scope="col">Latency</th><th scope="col">Cost</th></tr></thead><tbody>{run.candidates.map((candidate) => <tr key={candidate.candidateId}><th scope="row"><strong>{candidate.label}</strong><small>{candidate.candidateId}</small></th><td>{formatMetric(candidate.coverage)}</td><td>{formatMetric(candidate.wer)}</td><td>{formatMetric(candidate.cer)}</td><td>{formatMetric(candidate.entityAccuracy)}</td><td>{formatMetric(candidate.structureAccuracy)}</td><td>{formatMetric(candidate.semanticSafety)}</td><td>{formatMetric(candidate.latency)}</td><td>{formatMetric(candidate.cost)}</td></tr>)}</tbody></table>{!run.candidates.length ? <p className="lab-table-empty">No candidate summaries are available for this run.</p> : null}</div>
      <div className="lab-sample-summary"><div><h4>Sample evidence</h4><span>{samples.length} loaded</span></div>{samplesLoading ? <p>Loading sample summaries.</p> : samplesError ? <p className="lab-error-text">{samplesError}</p> : samples.length ? <div className="lab-table-region" tabIndex={0} role="region" aria-label={`Samples for run ${run.runId}`}><table className="lab-data-table"><thead><tr><th scope="col">Sample</th><th scope="col">Candidate</th><th scope="col">Language</th><th scope="col">Difficulty</th><th scope="col">WER</th><th scope="col">Latency</th><th scope="col">Availability</th></tr></thead><tbody>{samples.map((sample) => <tr key={`${sample.sampleId}:${sample.candidateId}`}><th scope="row">{sample.sampleId}</th><td>{sample.candidateId}</td><td>{sample.language}</td><td>{sample.difficulty}</td><td>{sample.scores.wer === null ? "No observado" : `${(sample.scores.wer * 100).toFixed(1)}%`}</td><td>{sample.latencyMs === null ? "No observado" : `${formatNumber(sample.latencyMs, 0)} ms`}</td><td><StatusChip label={sample.availability.status} tone={availabilityTone(sample.availability.status)} /></td></tr>)}</tbody></table></div> : <p>No sample summaries are available through the allowlisted gateway. Private text and audio were not requested.</p>}</div>
    </section>
  );
}

export function CorpusWorkspace({ artifacts }: { artifacts: LabArtifactState }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = Array.from(new Set((artifacts.index?.corpora ?? []).flatMap((corpus) => corpus.categories))).sort();
  const corpora = (artifacts.index?.corpora ?? []).filter((corpus) => (!query || `${corpus.corpusId} ${corpus.version}`.toLowerCase().includes(query.toLowerCase())) && (category === "all" || corpus.categories.includes(category)));
  return (
    <div className="lab-workspace-content">
      <header className="lab-page-heading"><div><h2>Corpus</h2><p>Metadata only. Human audio and gold text remain behind narrow local commands.</p></div><span className="lab-result-count">{corpora.length} shown</span></header>
      <div className="lab-filter-bar" role="search" aria-label="Filter corpora"><label><span>Find corpus</span><input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Corpus ID or version" /></label><label><span>Category</span><select value={category} onChange={(event) => setCategory(event.currentTarget.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
      {artifacts.loading ? <StatePanel title="Reading corpus metadata" detail="Corpus counts remain unknown until the local index responds." busy /> : artifacts.error ? <StatePanel title="Corpus unavailable" detail={`${artifacts.error} No sample metadata was substituted.`} tone="danger" /> : !artifacts.index ? <StatePanel title="Corpus unavailable" detail="The canonical artifact gateway is not present in this build. No sample metadata was substituted." /> : <div className="lab-table-region" tabIndex={0} role="region" aria-label="Corpus table"><table className="lab-data-table"><thead><tr><th scope="col">Corpus</th><th scope="col">Version</th><th scope="col">Samples</th><th scope="col">Approved gold</th><th scope="col">Audio available</th><th scope="col">Categories</th><th scope="col">Difficulties</th><th scope="col">Availability</th></tr></thead><tbody>{corpora.map((corpus) => <tr key={`${corpus.corpusId}:${corpus.version}`}><th scope="row">{corpus.corpusId}</th><td>{corpus.version}</td><td>{corpus.sampleCount}</td><td>{corpus.approvedGoldCount}</td><td>{corpus.audioAvailableCount}</td><td>{corpus.categories.join(", ") || "Not classified"}</td><td>{corpus.difficulties.join(", ") || "Not classified"}</td><td><StatusChip label={corpus.artifact.availability.status} tone={availabilityTone(corpus.artifact.availability.status)} /></td></tr>)}</tbody></table>{!corpora.length ? <p className="lab-table-empty">No corpora match these filters. Clear the search or choose another category.</p> : null}</div>}
      <section className="lab-inline-notice"><strong>Private material stays local</strong><p>This workspace indexes counts, categories and opaque references only. It does not render raw transcripts, final text, gold text, audio paths or provider output.</p></section>
    </div>
  );
}
