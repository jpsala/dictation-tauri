import { useEffect, useMemo, useState } from "react";

import { StatePanel, StatusChip, type LabArtifactState } from "./LabWorkspaces";
import type {
  LabCandidateSummary,
  LabExperimentDefinition,
  LabExperimentEstimate,
  LabMetadataExperimentPlan,
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
  localReplayDefinition?: LabExperimentDefinition;
  gateASourceExecutionId?: string | null;
  metadataExperiment?: LabMetadataExperimentPlan | null;
  metadataCandidateAvailable?: boolean;
  catalogState?: {
    status: "available" | "partial" | "unavailable";
    code: string | null;
  };
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
  onRetryCatalog?: () => void;
  /** A server-owned snapshot reload. This never creates a grant. */
  onReload?: () => void;
  /** Refreshes the canonical artifact index after a completed local run. */
  onRefreshArtifacts?: () => void;
  /** Parent owns draft mutation and PromotionDraft provenance. */
  onPromoteCandidate?: (selection: ExperimentPromotionSelection) => void;
  availableRecipeIds?: Partial<ExperimentRecipeOptions>;
};

function unique(values: readonly string[]): string[] {

  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
const GATE_B_V1_RECIPE_IDS = [
  "transcription-quality-v1-postprocess-120b-plain",
  "transcription-quality-v1-postprocess-120b-prosody",
] as const;

export function ExperimentWorkspace({
  artifacts,
  definition,
  localReplayDefinition = definition,
  gateASourceExecutionId = null,
  metadataExperiment = null,
  metadataCandidateAvailable = false,
  catalogState = { status: "unavailable", code: "catalog-unavailable" },
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
  onRetryCatalog,
  onReload,
  onRefreshArtifacts,
  onPromoteCandidate,
  availableRecipeIds,
}: ExperimentWorkspaceProps) {
  const options = useMemo<ExperimentRecipeOptions>(
    () => ({
      stt: unique(availableRecipeIds?.stt ?? []),
      postprocess: unique(availableRecipeIds?.postprocess ?? []),
      materialization: unique(availableRecipeIds?.materialization ?? []),
      prosody: availableRecipeIds?.prosody ?? [],
      vocabulary: availableRecipeIds?.vocabulary ?? [],
    }),
    [availableRecipeIds],
  );
  const [providerBoundaryAcknowledged, setProviderBoundaryAcknowledged] =
    useState(false);
  const [promotionCandidate, setPromotionCandidate] =
    useState<ExperimentPromotionSelection | null>(null);
  const [lastJobState, setLastJobState] = useState<
    LabJobSnapshot["state"] | null
  >(job?.state ?? null);
  const jobActive = job?.state === "queued" || job?.state === "running";
  const isGateB =
    definition.mode === "provider-real-gate-b" ||
    definition.mode === "provider-real-gate-b-v2";
  const canEstimate =
    orchestrationAvailable &&
    Boolean(definition.corpusId) &&
    definition.sampleIds.length > 0 &&
    definition.materializations.length > 0 &&
    definition.prosodyModes.length > 0 &&
    definition.vocabularyModes.length > 0 &&
    (isGateB
      ? definition.sttRecipes.length === 0 &&
        definition.postprocessRecipes.length === 2
      : definition.sttRecipes.length > 0 &&
        definition.postprocessRecipes.length === 0);
  const completedRuns = (artifacts.index?.runs ?? []).filter(
    (run) => run.status === "completed",
  );

  useEffect(() => {
    if (lastJobState !== "completed" && job?.state === "completed")
      onRefreshArtifacts?.();
    if (job) setLastJobState(job.state);
  }, [job, lastJobState, onRefreshArtifacts]);

  useEffect(() => {
    if (!jobActive) return;
    const timer = window.setInterval(() => onReload?.(), 1500);
    return () => window.clearInterval(timer);
  }, [jobActive, onReload]);

  function selectPromotion(run: LabRunSummary, candidate: LabCandidateSummary) {
    const selection = {
      runId: run.runId,
      candidateId: candidate.candidateId,
      recipe: candidate.recipe,
    };
    setPromotionCandidate(selection);
    onPromoteCandidate?.(selection);
  }

  return (
    <div className="lab-workspace-content">
      <header className="lab-page-heading">
        <div>
          <h2>Experiments</h2>
          <p>
            Assemble an allowlisted matrix, inspect the exact server estimate,
            then run locally or stop at the provider boundary.
          </p>
        </div>
        <StatusChip
          label={
            definition.mode === "provider-free-replay"
              ? "Provider-free replay"
              : definition.mode === "provider-real"
                ? "Gate A · locked 3×4"
                : definition.mode === "provider-real-gate-b-v2"
                  ? "Gate B v2 · locked 3×2"
                  : "Gate B v1 · locked 3×2"
          }
          tone={definition.mode === "provider-free-replay" ? "info" : "warning"}
        />
      </header>
      {!orchestrationAvailable ? (
        <StatePanel
          title="Experiment orchestration unavailable"
          detail="This build can edit a definition, but it cannot estimate or start work. No provider call will be attempted."
        />
      ) : null}
      {artifacts.error ? (
        <StatePanel
          title="Artifact index unavailable"
          detail="A canonical corpus or completed run is required. No sample, candidate, or metric rows are fabricated."
          tone="danger"
        />
      ) : null}

      <div className="lab-split-layout">
        <form
          className="lab-panel lab-experiment-form"
          onSubmit={(event) => {
            event.preventDefault();
            onEstimate();
          }}
        >
          <div className="lab-section-heading">
            <div>
              <h3>Experiment definition</h3>
              <p>
                Selectable axes come only from the authenticated server catalog.
                Evidence artifacts never add options.
              </p>
            </div>
            <span>Schema v{definition.schemaVersion}</span>
          </div>
          <fieldset className="lab-choice-group">
            <legend>Locked execution plan</legend>
            <label>
              <input
                type="radio"
                name="experiment-mode"
                checked={definition.mode === "provider-free-replay"}
                onChange={() => {
                  setProviderBoundaryAcknowledged(false);
                  onChange(structuredClone(localReplayDefinition));
                }}
              />
              <span>
                <strong>Provider-free · fixed 2×1</strong>
                <small>
                  Host-owned manifest replay. Zero cloud, device registration,
                  provider calls, or mutations.
                </small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="experiment-mode"
                checked={definition.mode === "provider-real"}
                disabled={
                  catalogState.status !== "available" ||
                  options.stt.length !== 4
                }
                onChange={() => {
                  setProviderBoundaryAcknowledged(false);
                  onChange({
                    schemaVersion: 1,
                    mode: "provider-real",
                    corpusId: "transcription-quality-local-human",
                    sampleIds: [
                      "jp-quality-bilingual-technical-20260812",
                      "jp-quality-punctuation-list-20260812",
                      "jp-quality-model-comparison-20260812",
                    ],
                    sttRecipes: [...options.stt],
                    materializations: ["response-text-kept"],
                    postprocessRecipes: [],
                    prosodyModes: ["off"],
                    vocabularyModes: ["off"],
                    baselineCandidateId: null,
                    sourceGateARunId: null,
                  });
                }}
              />
              <span>
                <strong>Gate A · fixed 3×4</strong>
                <small>
                  Exactly four STT recipes from the authenticated cloud catalog.
                  No subset is valid.
                </small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="experiment-mode"
                checked={definition.mode === "provider-real-gate-b"}
                disabled={
                  !gateASourceExecutionId ||
                  !GATE_B_V1_RECIPE_IDS.every((recipeId) =>
                    options.postprocess.includes(recipeId),
                  )
                }
                onChange={() => {
                  if (!gateASourceExecutionId) return;
                  setProviderBoundaryAcknowledged(false);
                  onChange({
                    schemaVersion: 1,
                    mode: "provider-real-gate-b",
                    corpusId: "transcription-quality-local-human",
                    sampleIds: [
                      "jp-quality-bilingual-technical-20260812",
                      "jp-quality-punctuation-list-20260812",
                      "jp-quality-model-comparison-20260812",
                    ],
                    sttRecipes: [],
                    materializations: ["response-text-kept"],
                    postprocessRecipes: [...GATE_B_V1_RECIPE_IDS],
                    prosodyModes: ["off"],
                    vocabularyModes: ["off"],
                    baselineCandidateId: "transcription-quality-v1-short-auto",
                    sourceGateARunId: gateASourceExecutionId,
                  });
                }}
              />
              <span>
                <strong>Gate B · fixed 3×2</strong>
                <small>
                  Derived only from a completed canonical Gate A source. Six
                  postprocess calls; zero STT/audio/delivery.
                </small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="experiment-mode"
                checked={definition.mode === "provider-real-gate-b-v2"}
                disabled={
                  !gateASourceExecutionId ||
                  !metadataExperiment ||
                  !metadataCandidateAvailable ||
                  catalogState.status !== "available"
                }
                onChange={() => {
                  if (!gateASourceExecutionId) return;
                  setProviderBoundaryAcknowledged(false);
                  onChange({
                    schemaVersion: 1,
                    mode: "provider-real-gate-b-v2",
                    corpusId: "transcription-quality-local-human",
                    sampleIds: [
                      "jp-quality-bilingual-technical-20260812",
                      "jp-quality-punctuation-list-20260812",
                      "jp-quality-model-comparison-20260812",
                    ],
                    sttRecipes: [],
                    materializations: ["response-text-kept"],
                    postprocessRecipes: [
                      "transcription-quality-v1-postprocess-120b-plain",
                      "transcription-quality-v2-postprocess-120b-conservative-timing",
                    ],
                    prosodyModes: ["off"],
                    vocabularyModes: ["off"],
                    baselineCandidateId: "transcription-quality-v1-short-auto",
                    sourceGateARunId: gateASourceExecutionId,
                  });
                }}
              />
              <span>
                <strong>Gate B v2 · fixed 3×2</strong>
                <small>
                  Plain baseline versus conservative verbose timing. Six
                  postprocess calls; zero STT/audio/delivery.
                </small>
              </span>
            </label>
          </fieldset>

          {catalogState.status !== "available" ? (
            <StatePanel
              title="Cloud recipe catalog unavailable"
              detail={`Reason: ${catalogState.code ?? "unknown"}. The fixed local replay remains available; no cloud recipe is inferred.`}
              tone="danger"
              action={
                onRetryCatalog ? (
                  <button
                    type="button"
                    className="lab-secondary-button"
                    onClick={onRetryCatalog}
                  >
                    Retry catalog
                  </button>
                ) : undefined
              }
            />
          ) : null}
          {!gateASourceExecutionId ? (
            <StatePanel
              title="Gate B unavailable"
              detail="A completed Gate A with 12 requests and three canonical short-auto raw references is required."
            />
          ) : null}
          {metadataExperiment ? (
            <section
              className="lab-inline-notice"
              data-tone="info"
              aria-label="Candidato de metadatos verbose"
            >
              <strong>Candidato: timing conservador</strong>
              <p>
                Análisis local sobre {metadataExperiment.sampleCount} muestras
                short-auto. Cero llamadas al proveedor.
              </p>
              <dl className="lab-detail-list">
                <div>
                  <dt>Señales anteriores</dt>
                  <dd>{metadataExperiment.legacySignalCount}</dd>
                </div>
                <div>
                  <dt>Señales conservadoras</dt>
                  <dd>{metadataExperiment.conservativeSignalCount}</dd>
                </div>
                <div>
                  <dt>Límite por muestra</dt>
                  <dd>{metadataExperiment.maxSignalsPerSample}</dd>
                </div>
                <div>
                  <dt>Comparación propuesta</dt>
                  <dd>{metadataExperiment.plannedPostprocessCalls} llamadas</dd>
                </div>
              </dl>
              <p>
                Hipótesis: conservar el mismo raw y el mismo modelo, pero pasar
                sólo los límites temporales más fuertes, sin sugerir coma,
                punto, párrafo ni lista. La comparación debe mostrar Raw, Final
                y decisión del guard semántico lado a lado.
              </p>
              <p>
                Modelo {metadataExperiment.model}. Ejecutar exige un packet
                separado; no incluye STT, audio, delivery ni cambio de perfil.
              </p>
            </section>
          ) : null}

          <section
            className="lab-inline-notice"
            data-tone="info"
            aria-label="Locked matrix"
          >
            <strong>Configured plan</strong>
            <dl className="lab-detail-list">
              <div>
                <dt>Corpus</dt>
                <dd>{definition.corpusId}</dd>
              </div>
              <div>
                <dt>Samples</dt>
                <dd>{definition.sampleIds.length}</dd>
              </div>
              <div>
                <dt>STT recipes</dt>
                <dd>{definition.sttRecipes.length}</dd>
              </div>
              <div>
                <dt>Postprocess recipes</dt>
                <dd>{definition.postprocessRecipes.length}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>
                  {definition.sourceGateARunId
                    ? `${definition.sourceGateARunId.slice(0, 8)}…`
                    : "Not required"}
                </dd>
              </div>
            </dl>
            <p>
              Dimensions are locked. Configured values are not copied into
              resolved or observed evidence.
            </p>
          </section>

          {isGateB && estimate ? (
            <div className="lab-inline-notice" data-tone="warning">
              <strong>{definition.mode === "provider-real-gate-b-v2" ? "Gate B v2" : "Gate B v1"} provider boundary</strong>
              <p>
                Exactly three canonical Gate A raw inputs × two postprocess
                recipes. Model openai/gpt-oss-120b, six requests, USD 0.005 cap,
                sequential, zero retries.
              </p>
              <p>
                No STT, audio upload, delivery, vocabulary, clipboard, typing,
                profile mutation, or promotion.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={providerBoundaryAcknowledged}
                  onChange={(event) =>
                    setProviderBoundaryAcknowledged(event.currentTarget.checked)
                  }
                />{" "}
                I reviewed this Gate B packet. Starting still requires a
                separate interactive approval outside this screen.
              </label>
            </div>
          ) : null}

          <div className="lab-form-actions">
            <button
              type="submit"
              className="lab-secondary-button"
              disabled={!canEstimate || estimateLoading || jobActive}
            >
              {estimateLoading ? "Estimating" : "Estimate exact matrix"}
            </button>
            <button
              type="button"
              className="lab-primary-button"
              disabled={
                !estimate ||
                estimateLoading ||
                jobActive ||
                (estimate.providerRequired
                  ? !providerAuthorizationAvailable ||
                    !providerBoundaryAcknowledged
                  : false)
              }
              onClick={onStart}
            >
              {definition.mode === "provider-real-gate-b-v2"
                ? "Request grant and run Gate B v2"
                : definition.mode === "provider-real-gate-b"
                  ? "Request grant and run Gate B v1"
                : estimate?.providerRequired
                  ? "Request grant and run Gate A"
                  : "Start provider-free job"}
            </button>
          </div>
        </form>

        <aside
          className="lab-panel"
          aria-label="Experiment estimate and job status"
        >
          <div className="lab-section-heading">
            <div>
              <h3>Estimate and boundary</h3>
              <p>
                Native values are authoritative, including zero requests and
                unavailable metrics.
              </p>
            </div>
            {estimate ? (
              <StatusChip
                label={estimate.providerRequired ? "Grant required" : "Ready"}
                tone={estimate.providerRequired ? "warning" : "success"}
              />
            ) : null}
          </div>
          {estimateError ? (
            <StatePanel
              title="Estimate unavailable"
              detail={estimateError}
              tone="danger"
            />
          ) : estimate ? (
            <>
              <dl className="lab-detail-list">
                <div>
                  <dt>Samples</dt>
                  <dd>{estimate.sampleCount}</dd>
                </div>
                <div>
                  <dt>Candidates</dt>
                  <dd>{estimate.candidateCount}</dd>
                </div>
                <div>
                  <dt>Combinations</dt>
                  <dd>{estimate.combinationCount}</dd>
                </div>
                <div>
                  <dt>STT requests</dt>
                  <dd>{estimate.sttCalls}</dd>
                </div>
                <div>
                  <dt>Post-process requests</dt>
                  <dd>{estimate.postprocessCalls}</dd>
                </div>
                <div>
                  <dt>Raw reuse plan</dt>
                  <dd>{estimate.reusedRawCount} existing artifacts</dd>
                </div>
                <div>
                  <dt>Max requests</dt>
                  <dd>{estimate.maxRequests}</dd>
                </div>
                <div>
                  <dt>Max USD</dt>
                  <dd>${estimate.maxCostUsd.toFixed(4)}</dd>
                </div>
                <div>
                  <dt>Definition hash</dt>
                  <dd className="lab-mono-value">{estimate.definitionHash}</dd>
                </div>
              </dl>
              {estimate.oneVariableWarnings.length ? (
                <div className="lab-inline-notice" data-tone="warning">
                  <strong>One-variable-change warnings</strong>
                  <ul>
                    {estimate.oneVariableWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {definition.mode === "provider-real" ? (
                <div className="lab-inline-notice" data-tone="warning">
                  <strong>Gate A provider confirmation</strong>
                  <p>
                    Samples: jp-quality-bilingual-technical-20260812,
                    jp-quality-punctuation-list-20260812,
                    jp-quality-model-comparison-20260812.
                  </p>
                  <p>
                    Recipes: short-auto, rich-auto, short-es, rich-es. Provider
                    Groq, model whisper-large-v3-turbo, human audio,{" "}
                    {estimate.maxRequests} requests maximum, total cap $
                    {estimate.maxCostUsd.toFixed(3)}. Sequential and stop on
                    first error.
                  </p>
                  <p>
                    Private artifacts and redacted receipts are expected. No
                    postprocess, vocabulary, delivery, clipboard, typing,
                    profile mutation or deploy.
                  </p>
                  <p>
                    Definition hash:{" "}
                    <span className="lab-mono-value">
                      {estimate.definitionHash}
                    </span>
                    .
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={providerBoundaryAcknowledged}
                      onChange={(event) =>
                        setProviderBoundaryAcknowledged(
                          event.currentTarget.checked,
                        )
                      }
                      disabled={!providerAuthorizationAvailable}
                    />{" "}
                    I approve this exact Gate A execution and its stated request
                    and cost caps.
                  </label>
                  {!providerAuthorizationAvailable ? (
                    <small>
                      Grant issuance is unavailable. No provider process can
                      start.
                    </small>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="lab-empty">
              Complete corpus and matrix selections, then request the native
              estimate.
            </p>
          )}
          {job ? (
            <div className="lab-job-status" aria-live="polite">
              <div>
                <strong>{job.jobId}</strong>
                <StatusChip
                  label={job.state}
                  tone={
                    job.state === "completed"
                      ? "success"
                      : job.state === "failed"
                        ? "danger"
                        : job.state === "running"
                          ? "info"
                          : "neutral"
                  }
                />
              </div>
              <progress
                value={job.completedUnits}
                max={Math.max(job.totalUnits, 1)}
              >
                {job.completedUnits} of {job.totalUnits}
              </progress>
              <span>
                {job.completedUnits} of {job.totalUnits} units · run{" "}
                {job.runId ?? "not assigned"}
              </span>
              <div className="lab-form-actions">
                {jobActive ? (
                  <button
                    type="button"
                    className="lab-danger-button"
                    onClick={onCancel}
                  >
                    Cancel job
                  </button>
                ) : null}
                <button
                  type="button"
                  className="lab-secondary-button"
                  onClick={onReload}
                  disabled={!onReload}
                >
                  Reload snapshot
                </button>
                {job.state === "completed" ? (
                  <button
                    type="button"
                    className="lab-secondary-button"
                    onClick={onRefreshArtifacts}
                    disabled={!onRefreshArtifacts}
                  >
                    Refresh artifact index
                  </button>
                ) : null}
              </div>
              {job.errorCode ? (
                <p className="lab-error-text">Error code: {job.errorCode}</p>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      <section className="lab-panel" aria-labelledby="promotion-title">
        <div className="lab-section-heading">
          <div>
            <h3 id="promotion-title">Promote a completed candidate</h3>
            <p>
              Copies the candidate recipe into the selected local profile draft
              with PromotionDraft provenance. Validation and preview remain
              required before any publish or apply action.
            </p>
          </div>
          <StatusChip
            label={
              onPromoteCandidate ? "Draft only" : "Parent callback unavailable"
            }
            tone={onPromoteCandidate ? "info" : "neutral"}
          />
        </div>
        {completedRuns.length ? (
          <div className="lab-promotion-list">
            {completedRuns.flatMap((run) =>
              run.candidates.map((candidate) => (
                <div
                  className="lab-promotion-row"
                  key={`${run.runId}:${candidate.candidateId}`}
                >
                  <div>
                    <strong>{candidate.label}</strong>
                    <small>
                      {candidate.candidateId} · run {run.runId}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="lab-secondary-button"
                    onClick={() => selectPromotion(run, candidate)}
                    disabled={!onPromoteCandidate}
                  >
                    Promote to selected draft
                  </button>
                </div>
              )),
            )}
          </div>
        ) : (
          <p className="lab-empty">
            No completed candidates are indexed yet. Finish a provider-free job,
            then refresh the artifact index.
          </p>
        )}
        {promotionCandidate ? (
          <p className="lab-partial-note">
            Selected {promotionCandidate.candidateId} from run{" "}
            {promotionCandidate.runId}. The parent owns the local draft
            mutation.
          </p>
        ) : null}
      </section>
    </div>
  );
}
export const ExperimentsWorkspace = ExperimentWorkspace;
