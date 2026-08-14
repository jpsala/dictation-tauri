import { useEffect, useMemo, useState } from "react";

import { StatePanel, StatusChip, type LabArtifactState } from "./LabWorkspaces";
import type {
  LabCandidateSummary,
  LabExperimentDefinition,
  LabExperimentEstimate,
  LabJobSnapshot,
  LabRunSummary,
} from "./types";

export type ExperimentRecipeOptions = {
  stt: readonly string[];
  postprocess: readonly string[];
  materialization: readonly string[];
  prosody: readonly LabExperimentDefinition["prosodyModes"][number][];
  vocabulary: readonly LabExperimentDefinition["vocabularyModes"][number][];
};

export type ExperimentPromotionSelection = {
  runId: string;
  candidateId: string;
  recipe: LabCandidateSummary["recipe"];
};

export type ExperimentWorkspaceProps = {
  artifacts: LabArtifactState;
  definition: LabExperimentDefinition;
  estimate: LabExperimentEstimate | null;
  estimateLoading: boolean;
  estimateError: string;
  job: LabJobSnapshot | null;
  orchestrationAvailable: boolean;
  providerAuthorizationAvailable: boolean;
  onChange: (next: LabExperimentDefinition) => void;
  onEstimate: () => void;
  onStart: () => void;
  onCancel: () => void;
  /** A server-owned snapshot reload. This never creates a grant. */
  onReload?: () => void;
  /** Refreshes the canonical artifact index after a completed local run. */
  onRefreshArtifacts?: () => void;
  /** Parent owns draft mutation and PromotionDraft provenance. */
  onPromoteCandidate?: (selection: ExperimentPromotionSelection) => void;
  availableRecipeIds?: Partial<ExperimentRecipeOptions>;
};

type Axis = "stt" | "postprocess" | "vocabulary";


function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}


function labelForOption(id: string): string {
  const normalized = id.toLowerCase();
  const length = normalized.includes("rich") ? "Rich" : normalized.includes("short") ? "Short" : "Recipe";
  const mode = normalized.includes("auto") ? "auto" : normalized.includes("es") ? "es" : "";
  return mode ? `${length} · ${mode} (${id})` : `${length} (${id})`;
}

function toggle(values: readonly string[], value: string, checked: boolean): string[] {
  return checked ? unique([...values, value]) : values.filter((item) => item !== value);
}

function setCsv(definition: LabExperimentDefinition, key: "sampleIds" | "sttRecipes" | "materializations" | "postprocessRecipes", value: string): LabExperimentDefinition {
  return { ...definition, [key]: unique(value.split(",").map((item) => item.trim())) };
}


export function ExperimentWorkspace({
  artifacts,
  definition,
  estimate,
  estimateLoading,
  estimateError,
  job,
  orchestrationAvailable,
  providerAuthorizationAvailable,
  onChange,
  onEstimate,
  onStart,
  onCancel,
  onReload,
  onRefreshArtifacts,
  onPromoteCandidate,
  availableRecipeIds,
}: ExperimentWorkspaceProps) {
  const options = useMemo<ExperimentRecipeOptions>(() => ({
    stt: unique(availableRecipeIds?.stt ?? []),
    postprocess: unique(availableRecipeIds?.postprocess ?? []),
    materialization: unique(availableRecipeIds?.materialization ?? []),
    prosody: availableRecipeIds?.prosody ?? [],
    vocabulary: availableRecipeIds?.vocabulary ?? [],
  }), [availableRecipeIds]);
  const [providerBoundaryAcknowledged, setProviderBoundaryAcknowledged] = useState(false);
  const [promotionCandidate, setPromotionCandidate] = useState<ExperimentPromotionSelection | null>(null);
  const [lastJobState, setLastJobState] = useState<LabJobSnapshot["state"] | null>(job?.state ?? null);
  const jobActive = job?.state === "queued" || job?.state === "running";
  const indexedCorpora = artifacts.index?.corpora ?? [];
  const corpora = definition.corpusId && !indexedCorpora.some((corpus) => corpus.corpusId === definition.corpusId)
    ? [{ corpusId: definition.corpusId, version: "runner-owned", sampleCount: definition.sampleIds.length, approvedGoldCount: 0, audioAvailableCount: 0, categories: [], difficulties: [], artifact: { id: definition.corpusId, kind: "corpus" as const, availability: { status: "partial" as const, missing: ["corpus-projection"] } } }, ...indexedCorpora]
    : indexedCorpora;
  const selectedCorpus = corpora.find((corpus) => corpus.corpusId === definition.corpusId);
  const canEstimate = orchestrationAvailable
    && Boolean(definition.corpusId)
    && definition.sampleIds.length > 0
    && definition.sttRecipes.length > 0
    && definition.materializations.length > 0
    && definition.prosodyModes.length > 0
    && definition.vocabularyModes.length > 0;
  const completedRuns = (artifacts.index?.runs ?? []).filter((run) => run.status === "completed");

  useEffect(() => {
    if (lastJobState !== "completed" && job?.state === "completed") onRefreshArtifacts?.();
    if (job) setLastJobState(job.state);
  }, [job, lastJobState, onRefreshArtifacts]);

  useEffect(() => {
    if (!jobActive) return;
    const timer = window.setInterval(() => onReload?.(), 1500);
    return () => window.clearInterval(timer);
  }, [jobActive, onReload]);

  function changeAxis(axis: Axis, value: string, checked: boolean) {
    if (axis === "stt") onChange({ ...definition, sttRecipes: toggle(definition.sttRecipes, value, checked) });
    if (axis === "postprocess") onChange({ ...definition, postprocessRecipes: toggle(definition.postprocessRecipes, value, checked) });
    if (axis === "vocabulary") onChange({ ...definition, vocabularyModes: toggle(definition.vocabularyModes, value, checked) as LabExperimentDefinition["vocabularyModes"] });
  }

  function selectPromotion(run: LabRunSummary, candidate: LabCandidateSummary) {
    const selection = { runId: run.runId, candidateId: candidate.candidateId, recipe: candidate.recipe };
    setPromotionCandidate(selection);
    onPromoteCandidate?.(selection);
  }

  return (
    <div className="lab-workspace-content">
      <header className="lab-page-heading">
        <div><h2>Experiments</h2><p>Assemble an allowlisted matrix, inspect the exact server estimate, then run locally or stop at the provider boundary.</p></div>
        <StatusChip label={definition.mode === "provider-real" ? "Provider confirmation required" : "Provider-free replay"} tone={definition.mode === "provider-real" ? "warning" : "info"} />
      </header>
      {!orchestrationAvailable ? <StatePanel title="Experiment orchestration unavailable" detail="This build can edit a definition, but it cannot estimate or start work. No provider call will be attempted." /> : null}
      {artifacts.error ? <StatePanel title="Artifact index unavailable" detail="A canonical corpus or completed run is required. No sample, candidate, or metric rows are fabricated." tone="danger" /> : null}

      <div className="lab-split-layout">
        <form className="lab-panel lab-experiment-form" onSubmit={(event) => { event.preventDefault(); onEstimate(); }}>
          <div className="lab-section-heading"><div><h3>Experiment definition</h3><p>Selectable axes come only from the authenticated server catalog. Evidence artifacts never add options.</p></div><span>Schema v{definition.schemaVersion}</span></div>
          <fieldset className="lab-choice-group">
            <legend>Execution mode</legend>
            <label>
              <input
                type="radio"
                name="experiment-mode"
                checked={definition.mode === "provider-free-replay"}
                onChange={() => {
                  setProviderBoundaryAcknowledged(false);
                  onChange({
                    ...definition,
                    mode: "provider-free-replay",
                    corpusId: "synthetic-audio-stt",
                    sampleIds: ["en-clean-note", "es-short-reminder"],
                    sttRecipes: ["provider-free-manifest-replay"],
                    materializations: ["identity"],
                    postprocessRecipes: [],
                    prosodyModes: ["off"],
                    vocabularyModes: ["off"],
                  });
                }}
              />
              <span><strong>Provider-free replay</strong><small>Reuse existing raw artifacts. Estimated provider requests remain zero.</small></span>
            </label>
            <label>
              <input
                type="radio"
                name="experiment-mode"
                checked={definition.mode === "provider-real"}
                onChange={() => onChange({
                  ...definition,
                  mode: "provider-real",
                  corpusId: "transcription-quality-local-human",
                  sampleIds: [
                    "jp-quality-bilingual-technical-20260812",
                    "jp-quality-punctuation-list-20260812",
                    "jp-quality-model-comparison-20260812",
                  ],
                  sttRecipes: [
                    "transcription-quality-v1-short-auto",
                    "transcription-quality-v1-rich-auto",
                    "transcription-quality-v1-short-es",
                    "transcription-quality-v1-rich-es",
                  ],
                  materializations: ["response-text-kept"],
                  postprocessRecipes: [],
                  prosodyModes: ["off"],
                  vocabularyModes: ["off"],
                })}
              />
              <span><strong>Provider-real confirmation</strong><small>Shows an exact request and cost boundary. An external expiring grant is still required.</small></span>
            </label>
          </fieldset>

          <div className="lab-field-grid">
            <label><span>Corpus</span><select value={definition.corpusId} onChange={(event) => onChange({ ...definition, corpusId: event.currentTarget.value })} required><option value="">Choose a corpus</option>{corpora.map((corpus) => <option key={`${corpus.corpusId}:${corpus.version}`} value={corpus.corpusId}>{corpus.corpusId} · {corpus.version}</option>)}</select></label>
            <label><span>Baseline candidate ID</span><input value={definition.baselineCandidateId ?? ""} onChange={(event) => onChange({ ...definition, baselineCandidateId: event.currentTarget.value || null })} placeholder="Optional stable ID" /></label>
            <label className="lab-field-wide"><span>Sample IDs</span><input value={definition.sampleIds.join(", ")} onChange={(event) => onChange(setCsv(definition, "sampleIds", event.currentTarget.value))} placeholder="Blank uses all corpus samples" /><small className="lab-field-help">{selectedCorpus ? `${selectedCorpus.sampleCount} samples indexed, ${selectedCorpus.audioAvailableCount} audio artifacts available.` : "Choose a corpus to inspect sample availability."}</small></label>
          </div>

          <div className="lab-experiment-matrix" aria-label="Experiment matrix">
            <fieldset className="lab-choice-group"><legend>STT recipe axis, short/rich and auto/es where allowlisted</legend>{options.stt.length ? options.stt.map((id) => <label key={id}><input type="checkbox" checked={definition.sttRecipes.includes(id)} onChange={(event) => changeAxis("stt", id, event.currentTarget.checked)} /><span><strong>{labelForOption(id)}</strong><small>Allowlisted evaluation recipe</small></span></label>) : <p className="lab-empty">No allowlisted STT recipes are loaded.</p>}</fieldset>
            <fieldset className="lab-choice-group"><legend>Post-process axis</legend>{options.postprocess.length ? options.postprocess.map((id) => <label key={id}><input type="checkbox" checked={definition.postprocessRecipes.includes(id)} onChange={(event) => changeAxis("postprocess", id, event.currentTarget.checked)} /><span><strong>{labelForOption(id)}</strong><small>Existing post-process recipe</small></span></label>) : <p className="lab-empty">No allowlisted post-process recipes are loaded.</p>}</fieldset>
            <fieldset className="lab-choice-group"><legend>Prosody axis</legend>{options.prosody.map((mode) => <label key={mode}><input type="checkbox" checked={definition.prosodyModes.includes(mode)} onChange={(event) => onChange({ ...definition, prosodyModes: toggle(definition.prosodyModes, mode, event.currentTarget.checked) as LabExperimentDefinition["prosodyModes"] })} /><span><strong>{mode === "off" ? "Off" : "Advisory"}</strong><small>{mode === "off" ? "No prosody pass" : "Catalog-authorized advisory prosody"}</small></span></label>)}</fieldset>
            <fieldset className="lab-choice-group"><legend>Vocabulary axis</legend>{options.vocabulary.map((mode) => <label key={mode}><input type="checkbox" checked={definition.vocabularyModes.includes(mode)} onChange={(event) => changeAxis("vocabulary", mode, event.currentTarget.checked)} /><span><strong>{mode === "off" ? "Off" : mode === "automatic" ? "Automatic" : "Ask"}</strong><small>Catalog-authorized vocabulary mode</small></span></label>)}</fieldset>
          </div>

          <div className="lab-form-actions"><button type="submit" className="lab-secondary-button" disabled={!canEstimate || estimateLoading || jobActive}>{estimateLoading ? "Estimating" : "Estimate exact matrix"}</button><button type="button" className="lab-primary-button" disabled={!estimate || estimateLoading || jobActive || (estimate.providerRequired ? !providerAuthorizationAvailable || !providerBoundaryAcknowledged : false)} onClick={onStart}>{estimate?.providerRequired ? "Request grant and run Gate A" : "Start provider-free job"}</button></div>
        </form>

        <aside className="lab-panel" aria-label="Experiment estimate and job status">
          <div className="lab-section-heading"><div><h3>Estimate and boundary</h3><p>Native values are authoritative, including zero requests and unavailable metrics.</p></div>{estimate ? <StatusChip label={estimate.providerRequired ? "Grant required" : "Ready"} tone={estimate.providerRequired ? "warning" : "success"} /> : null}</div>
          {estimateError ? <StatePanel title="Estimate unavailable" detail={estimateError} tone="danger" /> : estimate ? <>
            <dl className="lab-detail-list"><div><dt>Samples</dt><dd>{estimate.sampleCount}</dd></div><div><dt>Candidates</dt><dd>{estimate.candidateCount}</dd></div><div><dt>Combinations</dt><dd>{estimate.combinationCount}</dd></div><div><dt>STT requests</dt><dd>{estimate.sttCalls}</dd></div><div><dt>Post-process requests</dt><dd>{estimate.postprocessCalls}</dd></div><div><dt>Raw reuse plan</dt><dd>{estimate.reusedRawCount} existing artifacts</dd></div><div><dt>Max requests</dt><dd>{estimate.maxRequests}</dd></div><div><dt>Max USD</dt><dd>${estimate.maxCostUsd.toFixed(4)}</dd></div><div><dt>Definition hash</dt><dd className="lab-mono-value">{estimate.definitionHash}</dd></div></dl>
            {estimate.oneVariableWarnings.length ? <div className="lab-inline-notice" data-tone="warning"><strong>One-variable-change warnings</strong><ul>{estimate.oneVariableWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
            {definition.mode === "provider-real" ? <div className="lab-inline-notice" data-tone="warning"><strong>Gate A provider confirmation</strong><p>Samples: jp-quality-bilingual-technical-20260812, jp-quality-punctuation-list-20260812, jp-quality-model-comparison-20260812.</p><p>Recipes: short-auto, rich-auto, short-es, rich-es. Provider Groq, model whisper-large-v3-turbo, human audio, {estimate.maxRequests} requests maximum, total cap ${estimate.maxCostUsd.toFixed(3)}. Sequential and stop on first error.</p><p>Private artifacts and redacted receipts are expected. No postprocess, vocabulary, delivery, clipboard, typing, profile mutation or deploy.</p><p>Definition hash: <span className="lab-mono-value">{estimate.definitionHash}</span>.</p><label><input type="checkbox" checked={providerBoundaryAcknowledged} onChange={(event) => setProviderBoundaryAcknowledged(event.currentTarget.checked)} disabled={!providerAuthorizationAvailable} /> I approve this exact Gate A execution and its stated request and cost caps.</label>{!providerAuthorizationAvailable ? <small>Grant issuance is unavailable. No provider process can start.</small> : null}</div> : null}
          </> : <p className="lab-empty">Complete corpus and matrix selections, then request the native estimate.</p>}
          {job ? <div className="lab-job-status" aria-live="polite"><div><strong>{job.jobId}</strong><StatusChip label={job.state} tone={job.state === "completed" ? "success" : job.state === "failed" ? "danger" : job.state === "running" ? "info" : "neutral"} /></div><progress value={job.completedUnits} max={Math.max(job.totalUnits, 1)}>{job.completedUnits} of {job.totalUnits}</progress><span>{job.completedUnits} of {job.totalUnits} units · run {job.runId ?? "not assigned"}</span><div className="lab-form-actions">{jobActive ? <button type="button" className="lab-danger-button" onClick={onCancel}>Cancel job</button> : null}<button type="button" className="lab-secondary-button" onClick={onReload} disabled={!onReload}>Reload snapshot</button>{job.state === "completed" ? <button type="button" className="lab-secondary-button" onClick={onRefreshArtifacts} disabled={!onRefreshArtifacts}>Refresh artifact index</button> : null}</div>{job.errorCode ? <p className="lab-error-text">Error code: {job.errorCode}</p> : null}</div> : null}
        </aside>
      </div>

      <section className="lab-panel" aria-labelledby="promotion-title"><div className="lab-section-heading"><div><h3 id="promotion-title">Promote a completed candidate</h3><p>Copies the candidate recipe into the selected local profile draft with PromotionDraft provenance. Validation and preview remain required before any publish or apply action.</p></div><StatusChip label={onPromoteCandidate ? "Draft only" : "Parent callback unavailable"} tone={onPromoteCandidate ? "info" : "neutral"} /></div>{completedRuns.length ? <div className="lab-promotion-list">{completedRuns.flatMap((run) => run.candidates.map((candidate) => <div className="lab-promotion-row" key={`${run.runId}:${candidate.candidateId}`}><div><strong>{candidate.label}</strong><small>{candidate.candidateId} · run {run.runId}</small></div><button type="button" className="lab-secondary-button" onClick={() => selectPromotion(run, candidate)} disabled={!onPromoteCandidate}>Promote to selected draft</button></div>))}</div> : <p className="lab-empty">No completed candidates are indexed yet. Finish a provider-free job, then refresh the artifact index.</p>}{promotionCandidate ? <p className="lab-partial-note">Selected {promotionCandidate.candidateId} from run {promotionCandidate.runId}. The parent owns the local draft mutation.</p> : null}</section>
    </div>
  );
}
export const ExperimentsWorkspace = ExperimentWorkspace;
