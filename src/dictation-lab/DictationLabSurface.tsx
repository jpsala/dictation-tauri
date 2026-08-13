import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import { createDictationLabClient, stableDefinitionFingerprint, type DictationLabClient } from "./client";
import { createDictationLabJobsClient, type DictationLabJobsClient } from "./jobs-client";
import { ExperimentWorkspace } from "./ExperimentWorkspace";
import {
  EvidenceCorpusWorkspace,
  EvidenceOverviewWorkspace,
  EvidenceResultsWorkspace,
} from "./EvidenceWorkspaces";
import {
  labWorkspaces,
  StatusChip,
  StatePanel,
  type LabArtifactState,
  type LabWorkspace,
} from "./LabWorkspaces";
import type {
  JsonObject,
  JsonValue,
  LabExperimentDefinition,
  LabExperimentEstimate,
  LabJobSnapshot,
  LaboratoryLoad,
  LaboratoryProfile,
  ProfilePreviewReceipt,
  RecipeDefinition,
} from "./types";
import "./dictation-lab.css";

type RecipeView = "builder" | "effective" | "audit";
type Notice = { tone: "idle" | "success" | "warning" | "danger"; message: string };

const recipeViews: ReadonlyArray<{ id: RecipeView; label: string }> = [
  { id: "builder", label: "Recipe draft" },
  { id: "effective", label: "Effective configuration" },
  { id: "audit", label: "Versions and audit" },
];

const defaultDictationLabClient = createDictationLabClient();
const defaultJobsClient = createDictationLabJobsClient();
const defaultExperiment: LabExperimentDefinition = {
  schemaVersion: 1,
  mode: "provider-free-replay",
  corpusId: "synthetic-audio-stt",
  sampleIds: ["en-clean-note", "es-short-reminder"],
  sttRecipes: ["provider-free-manifest-replay"],
  materializations: ["identity"],
  postprocessRecipes: [],
  prosodyModes: ["off"],
  vocabularyModes: ["off"],
  baselineCandidateId: null,
};

function copyDefinition(value: RecipeDefinition | null | undefined): RecipeDefinition | null {
  return value ? structuredClone(value) : null;
}


function operation(draft: RecipeDefinition, key: "transcription" | "postprocess" | "selectionTransform") {
  return draft.runtime[key];
}

function updateOperation(draft: RecipeDefinition, key: "transcription" | "postprocess" | "selectionTransform", patch: JsonObject): RecipeDefinition {
  return { ...draft, runtime: { ...draft.runtime, [key]: { ...draft.runtime[key], ...patch } } as RecipeDefinition["runtime"] };
}

function updateOptionalLimit(draft: RecipeDefinition, key: "dailyUsd" | "monthlyUsd", value: string): RecipeDefinition {
  const limits = { ...draft.limits };
  if (value) limits[key] = Number(value);
  else delete limits[key];
  return { ...draft, limits };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; code?: unknown };
    if (typeof value.message === "string" && value.message) {
      return typeof value.code === "string" ? `${value.message} (${value.code})` : value.message;
    }
  }
  return "La operación no está disponible.";
}

function versionOf(profile: LaboratoryProfile | undefined): number | null {
  const value = profile?.published?.version;
  return typeof value === "number" ? value : null;
}

type ArtifactClient = Pick<DictationLabClient, "listArtifacts">;

export function DictationLabSurface({
  client = defaultDictationLabClient,
  jobsClient = defaultJobsClient,
}: {
  client?: DictationLabClient;
  jobsClient?: DictationLabJobsClient;
}) {
  const [load, setLoad] = useState<LaboratoryLoad>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [workspace, setWorkspace] = useState<LabWorkspace>("overview");
  const [recipeView, setRecipeView] = useState<RecipeView>("builder");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [draft, setDraft] = useState<RecipeDefinition | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [advancedText, setAdvancedText] = useState("");
  const [notice, setNotice] = useState<Notice>({ tone: "idle", message: "" });
  const [preview, setPreview] = useState<ProfilePreviewReceipt["data"] | null>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState("");
  const [busy, setBusy] = useState<"validate" | "apply" | "rollback" | "assign" | null>(null);
  const [applyPhrase, setApplyPhrase] = useState("");
  const [rollbackVersion, setRollbackVersion] = useState<number | null>(null);
  const [rollbackPhrase, setRollbackPhrase] = useState("");
  const [accountHandle, setAccountHandle] = useState("");
  const [artifacts, setArtifacts] = useState<LabArtifactState>({ index: null, loading: true, error: "" });
  const [experiment, setExperiment] = useState<LabExperimentDefinition>(defaultExperiment);
  const [estimate, setEstimate] = useState<LabExperimentEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState("");
  const [job, setJob] = useState<LabJobSnapshot | null>(null);
  const [jobsAvailable, setJobsAvailable] = useState(true);

  const profiles = load?.profiles.profiles ?? [];
  const selectedProfile = profiles.find((profile) => profile.profileId === selectedProfileId) ?? profiles[0];
  const engines = load?.catalog?.engines ?? [];
  const prompts = load?.catalog?.prompts ?? [];
  const expectedApplyPhrase = selectedProfile ? `APPLY ${selectedProfile.profileId} REV ${selectedProfile.revision}` : "";
  const expectedRollbackPhrase = selectedProfile && rollbackVersion ? `ROLLBACK ${selectedProfile.profileId} TO ${rollbackVersion} REV ${selectedProfile.revision}` : "";

  const canPublish = Boolean(load?.session.recentGoogle && ["publisher", "owner"].includes(load.session.role));
  const dirty = useMemo(() => {
    if (!draft || !selectedProfile?.published) return false;
    return stableDefinitionFingerprint(draft) !== stableDefinitionFingerprint(selectedProfile.published.definition);
  }, [draft, selectedProfile]);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    client.load()
      .then((value) => {
        if (disposed) return;
        setLoad(value);
        const first = value.profiles.profiles[0];
        setSelectedProfileId(first?.profileId ?? "");
        setDraft(copyDefinition(first?.published?.definition));
        setAdvancedText(first?.published ? JSON.stringify(first.published.definition, null, 2) : "");
        setLoadError("");
      })
      .catch((error) => {
        if (!disposed) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => { disposed = true; };
  }, [client]);

  useEffect(() => {
    let disposed = false;
    const artifactClient = client as DictationLabClient & Partial<ArtifactClient>;
    if (typeof artifactClient.listArtifacts !== "function") {
      setArtifacts({ index: null, loading: false, error: "" });
      return;
    }
    setArtifacts((current) => ({ ...current, loading: true, error: "" }));
    artifactClient.listArtifacts()
      .then((index) => {
        if (!disposed) setArtifacts({ index, loading: false, error: "" });
      })
      .catch((error) => {
        if (!disposed) setArtifacts({ index: null, loading: false, error: errorMessage(error) });
      });
    return () => { disposed = true; };
  }, [client]);

  useEffect(() => {
    let disposed = false;
    jobsClient.getJob()
      .then((snapshot) => {
        if (disposed) return;
        setJob(snapshot);
        setJobsAvailable(true);
      })
      .catch(() => {
        if (!disposed) setJobsAvailable(false);
      });
    return () => { disposed = true; };
  }, [jobsClient]);

  useEffect(() => {
    if (!experiment.corpusId && artifacts.index?.corpora[0]) {
      setExperiment((current) => ({ ...current, corpusId: artifacts.index?.corpora[0]?.corpusId ?? "" }));
    }
  }, [artifacts.index, experiment.corpusId]);

  function selectProfile(profile: LaboratoryProfile) {
    if (dirty && !window.confirm("Descartar el draft local y abrir otra receta?")) return;
    setSelectedProfileId(profile.profileId);
    const next = copyDefinition(profile.published?.definition);
    setDraft(next);
    setAdvancedText(next ? JSON.stringify(next, null, 2) : "");
    setApplyPhrase("");
    setRollbackVersion(null);
    setRollbackPhrase("");
    setPreview(null);
    setPreviewFingerprint("");
    setNotice({ tone: "idle", message: "Draft local creado desde la versión publicada." });
  }

  function setDraftValue(next: RecipeDefinition) {
    setDraft(next);
    setAdvancedText(JSON.stringify(next, null, 2));
    setPreview(null);
    setPreviewFingerprint("");
    setNotice({ tone: "idle", message: "Cambios sólo en esta ventana. Todavía no se publicaron." });
  }

  function applyAdvancedJson() {
    try {
      const parsed: unknown = JSON.parse(advancedText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      setDraft(parsed as RecipeDefinition);
      setPreview(null);
      setPreviewFingerprint("");
      setNotice({ tone: "success", message: "JSON aplicado al draft local. Falta validación server-owned." });
    } catch {
      setNotice({ tone: "danger", message: "El JSON avanzado no es un objeto válido." });
    }
  }

  async function validateDraft() {
    if (!selectedProfile || !draft) return;
    setBusy("validate");
    try {
      const [, nextPreview] = await Promise.all([
        client.validateDraft(selectedProfile.profileId, selectedProfile.revision, draft),
        client.previewDraft(selectedProfile.profileId, selectedProfile.revision, versionOf(selectedProfile) ?? undefined, draft),
      ]);
      setPreview(nextPreview.data);
      setPreviewFingerprint(stableDefinitionFingerprint(draft));
      setNotice({ tone: "success", message: nextPreview.data.changed ? `Draft válido: ${nextPreview.data.changes.length} cambios${nextPreview.data.truncated ? " (vista acotada)" : ""}.` : "Draft válido, sin cambios respecto de la versión publicada." });
    } catch (error) {
      setPreview(null);
      setPreviewFingerprint("");
      setNotice({ tone: "warning", message: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function applyDraft() {
    if (!selectedProfile || !draft || applyPhrase !== expectedApplyPhrase) return;
    setBusy("apply");
    try {
      const receipt = await client.applyProfile(selectedProfile.profileId, selectedProfile.revision, draft, applyPhrase);
      setApplyPhrase("");
      setNotice({ tone: "success", message: `Publicado v${receipt.data.publication.resultingVersion}. Audit ${receipt.data.audit.id}.` });
      try {
        const [nextProfiles, nextAudit] = await Promise.all([client.reloadProfiles(), client.reloadAudit()]);
        setLoad((current) => current ? { ...current, profiles: nextProfiles, audit: nextAudit } : current);
        const updated = nextProfiles.profiles.find((profile) => profile.profileId === selectedProfile.profileId);
        setDraft(copyDefinition(updated?.published?.definition));
      } catch (refreshError) {
        setNotice({ tone: "warning", message: `Publicado v${receipt.data.publication.resultingVersion}. La actualización posterior falló por separado: ${errorMessage(refreshError)}` });
      }
    } catch (error) {
      setNotice({ tone: "danger", message: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function rollback() {
    if (!selectedProfile || !rollbackVersion || rollbackPhrase !== expectedRollbackPhrase) return;
    setBusy("rollback");
    try {
      const receipt = await client.rollbackProfile(selectedProfile.profileId, selectedProfile.revision, rollbackVersion, rollbackPhrase);
      setRollbackVersion(null);
      setRollbackPhrase("");
      setNotice({ tone: "success", message: `Rollback publicado como v${receipt.data.publication.resultingVersion}.` });
      try {
        const [nextProfiles, nextAudit] = await Promise.all([client.reloadProfiles(), client.reloadAudit()]);
        setLoad((current) => current ? { ...current, profiles: nextProfiles, audit: nextAudit } : current);
      } catch (refreshError) {
        setNotice({ tone: "warning", message: `Rollback publicado como v${receipt.data.publication.resultingVersion}. La actualización posterior falló por separado: ${errorMessage(refreshError)}` });
      }
    } catch (error) {
      setNotice({ tone: "danger", message: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function assign() {
    if (!selectedProfile || !accountHandle) return;
    setBusy("assign");
    try {
      await client.assignAccount(accountHandle, selectedProfile.profileId, selectedProfile.label);
      setNotice({ tone: "success", message: "Asignación de cuenta actualizada por el servidor." });
    } catch (error) {
      setNotice({ tone: "danger", message: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  function changeExperiment(next: LabExperimentDefinition) {
    setExperiment(next);
    setEstimate(null);
    setEstimateError("");
  }

  async function estimateExperiment() {
    setEstimateLoading(true);
    setEstimateError("");
    try {
      const next = await jobsClient.estimateExperiment(experiment);
      setEstimate(next);
      setJobsAvailable(true);
    } catch (error) {
      setEstimate(null);
      setEstimateError(errorMessage(error));
    } finally {
      setEstimateLoading(false);
    }
  }

  async function startExperiment() {
    if (!estimate || estimate.providerRequired) return;
    setEstimateError("");
    try {
      setJob(await jobsClient.startJob(experiment));
    } catch (error) {
      setEstimateError(errorMessage(error));
    }
  }

  async function cancelExperiment() {
    if (!job || (job.state !== "queued" && job.state !== "running")) return;
    try {
      setJob(await jobsClient.cancelJob(job.jobId));
    } catch (error) {
      setEstimateError(errorMessage(error));
    }
  }

  async function reloadJob() {
    try {
      setJob(await jobsClient.getJob());
      setJobsAvailable(true);
    } catch {
      setJobsAvailable(false);
    }
  }

  async function refreshArtifacts() {
    setArtifacts((current) => ({ ...current, loading: true, error: "" }));
    try {
      setArtifacts({ index: await client.listArtifacts(), loading: false, error: "" });
    } catch (error) {
      setArtifacts({ index: null, loading: false, error: errorMessage(error) });
    }
  }



  function handleWorkspaceKeys(event: KeyboardEvent<HTMLButtonElement>, current: LabWorkspace) {
    if (!(["ArrowDown", "ArrowUp", "Home", "End"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const currentIndex = labWorkspaces.findIndex((item) => item.id === current);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? labWorkspaces.length - 1 : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + labWorkspaces.length) % labWorkspaces.length;
    const next = labWorkspaces[nextIndex];
    if (!next) return;
    setWorkspace(next.id);
    document.querySelector<HTMLButtonElement>(`[data-workspace-id="${next.id}"]`)?.focus();
  }

  if (loading) {
    return <main className="lab-shell lab-loading" aria-busy="true" aria-label="Loading Dictation Laboratory"><div className="lab-skeleton" /><div className="lab-skeleton large" /></main>;
  }

  if (loadError || !load) {
    return <main className="lab-shell lab-unavailable"><header className="lab-topbar"><div><h1>Dictation Laboratory</h1><p>Controlled experiments and versioned production recipes</p></div><div className="lab-session"><StatusChip label="Session unavailable" tone="warning" /></div></header><div className="lab-frame"><nav className="lab-primary-nav" aria-label="Laboratory workspaces"><div className="lab-nav-heading"><strong>Workspaces</strong><span>5</span></div>{labWorkspaces.map((item) => <button key={item.id} type="button" data-workspace-id={item.id} data-active={workspace === item.id} aria-current={workspace === item.id ? "page" : undefined} onClick={() => setWorkspace(item.id)} onKeyDown={(event) => handleWorkspaceKeys(event, item.id)}><strong>{item.label}</strong><small>{item.description}</small></button>)}</nav><section className="lab-main"><StatePanel title="Control Room session unavailable" detail={`${loadError || "No pudimos cargar el control plane."} No sample, profile, metric or permission state was fabricated.`} tone="danger" /><p className="lab-muted">No provider, mutation, audio or delivery action is available.</p></section></div></main>;
  }

  return (
    <main className="lab-shell">
      <header className="lab-topbar">
        <div><h1>Dictation Laboratory</h1><p>Controlled experiments and versioned production recipes</p></div>
        <div className="lab-session"><StatusChip label={load.session.role} /><strong>{load.session.recentGoogle ? "Recent session" : "Reauthentication required"}</strong></div>
      </header>
      <div className="lab-frame">
        <nav className="lab-primary-nav" aria-label="Laboratory workspaces">
          <div className="lab-nav-heading"><strong>Workspaces</strong><span>5</span></div>
          {labWorkspaces.map((item) => <button key={item.id} type="button" data-workspace-id={item.id} data-active={workspace === item.id} aria-current={workspace === item.id ? "page" : undefined} onClick={() => setWorkspace(item.id)} onKeyDown={(event) => handleWorkspaceKeys(event, item.id)}><strong>{item.label}</strong><small>{item.description}</small></button>)}
          <div className="lab-privacy-note"><strong>Private by default</strong><span>Human text and audio stay behind local allowlisted commands.</span></div>
        </nav>
        <section className="lab-main" aria-label={`${labWorkspaces.find((item) => item.id === workspace)?.label ?? "Laboratory"} workspace`}>
          {workspace === "overview" ? <EvidenceOverviewWorkspace artifacts={artifacts} localRunCount={load.runs.length} /> : null}
          {workspace === "experiments" ? <ExperimentWorkspace artifacts={artifacts} definition={experiment} estimate={estimate} estimateLoading={estimateLoading} estimateError={estimateError} job={job} orchestrationAvailable={jobsAvailable} availableRecipeIds={{ stt: (load.catalog?.sttRecipes ?? []).filter((entry) => entry.executionModes.includes(experiment.mode)).map((entry) => entry.id), postprocess: (load.catalog?.postprocessRecipes ?? []).filter((entry) => entry.availability.status === "available" && entry.executionModes.includes(experiment.mode)).map((entry) => entry.id), materialization: (load.catalog?.materializations ?? []).filter((entry) => entry.availability.status === "available" && entry.executionModes.includes(experiment.mode)).map((entry) => entry.id), prosody: (load.catalog?.prosodyModes ?? []).filter((entry) => entry.availability.status === "available" && entry.executionModes.includes(experiment.mode)).map((entry) => entry.id as LabExperimentDefinition["prosodyModes"][number]), vocabulary: (load.catalog?.vocabularyModes ?? []).filter((entry) => entry.availability.status === "available" && entry.executionModes.includes(experiment.mode)).map((entry) => entry.id as LabExperimentDefinition["vocabularyModes"][number]) }} onChange={changeExperiment} onEstimate={() => void estimateExperiment()} onStart={() => void startExperiment()} onCancel={() => void cancelExperiment()} onReload={() => void reloadJob()} onRefreshArtifacts={() => void refreshArtifacts()} /> : null}
          {workspace === "results" ? <EvidenceResultsWorkspace artifacts={artifacts} client={client} /> : null}
          {workspace === "recipes" ? <RecipesWorkspace load={load} profiles={profiles} selectedProfile={selectedProfile} draft={draft} dirty={dirty} recipeView={recipeView} advanced={advanced} advancedText={advancedText} preview={preview} previewFingerprint={previewFingerprint} notice={notice} busy={busy} canPublish={canPublish} applyPhrase={applyPhrase} expectedApplyPhrase={expectedApplyPhrase} rollbackVersion={rollbackVersion} rollbackPhrase={rollbackPhrase} expectedRollbackPhrase={expectedRollbackPhrase} accountHandle={accountHandle} engines={engines} prompts={prompts} onSelectProfile={selectProfile} onRecipeView={setRecipeView} onDraftValue={setDraftValue} onAdvanced={setAdvanced} onAdvancedText={setAdvancedText} onApplyAdvancedJson={applyAdvancedJson} onValidate={() => void validateDraft()} onApply={() => void applyDraft()} onApplyPhrase={setApplyPhrase} onRollbackVersion={(value) => { setRollbackVersion(value); setRollbackPhrase(""); }} onRollbackPhrase={setRollbackPhrase} onRollback={() => void rollback()} onAccountHandle={setAccountHandle} onAssign={() => void assign()} /> : null}
          {workspace === "corpus" ? <EvidenceCorpusWorkspace artifacts={artifacts} /> : null}
        </section>
      </div>
    </main>
  );
}

type RecipesWorkspaceProps = {
  load: LaboratoryLoad;
  profiles: readonly LaboratoryProfile[];
  selectedProfile: LaboratoryProfile | undefined;
  draft: RecipeDefinition | null;
  dirty: boolean;
  recipeView: RecipeView;
  advanced: boolean;
  advancedText: string;
  preview: ProfilePreviewReceipt["data"] | null;
  previewFingerprint: string;
  notice: Notice;
  busy: "validate" | "apply" | "rollback" | "assign" | null;
  canPublish: boolean;
  applyPhrase: string;
  expectedApplyPhrase: string;
  rollbackVersion: number | null;
  rollbackPhrase: string;
  expectedRollbackPhrase: string;
  accountHandle: string;
  engines: NonNullable<LaboratoryLoad["catalog"]>["engines"];
  prompts: NonNullable<LaboratoryLoad["catalog"]>["prompts"];
  onSelectProfile: (profile: LaboratoryProfile) => void;
  onRecipeView: (view: RecipeView) => void;
  onDraftValue: (draft: RecipeDefinition) => void;
  onAdvanced: (open: boolean) => void;
  onAdvancedText: (value: string) => void;
  onApplyAdvancedJson: () => void;
  onValidate: () => void;
  onApply: () => void;
  onRollback: () => void;
  onAssign: () => void;
  onApplyPhrase: (value: string) => void;
  onRollbackVersion: (value: number | null) => void;
  onRollbackPhrase: (value: string) => void;
  onAccountHandle: (value: string) => void;
};

function RecipesWorkspace(props: RecipesWorkspaceProps) {
  const { load, profiles, selectedProfile, draft, dirty, recipeView, advanced, advancedText, preview, previewFingerprint, notice, busy, canPublish, applyPhrase, expectedApplyPhrase, rollbackVersion, rollbackPhrase, expectedRollbackPhrase, accountHandle, engines, prompts } = props;
  const transcription = draft ? operation(draft, "transcription") : null;
  const postprocess = draft ? operation(draft, "postprocess") : null;
  const selectionTransform = draft ? operation(draft, "selectionTransform") : null;
  const previousVersions = selectedProfile?.versions.filter((item) => item.status !== "draft" && item.version !== versionOf(selectedProfile)) ?? [];
  return (
    <div className="lab-recipes-workspace">
      <header className="lab-page-heading"><div><h2>Recipes</h2><p>Profiles, versioned definitions, effective evidence and guarded publication.</p></div><StatusChip label={dirty ? "Local draft changed" : "Published copy"} tone={dirty ? "warning" : "neutral"} /></header>
      <div className="lab-recipes-layout">
        <aside className="lab-profile-list" aria-label="Recipe profiles"><div className="lab-nav-heading"><strong>Profiles</strong><span>{profiles.length}</span></div>{profiles.length ? profiles.map((profile) => <button key={profile.profileId} type="button" data-active={profile.profileId === selectedProfile?.profileId} onClick={() => props.onSelectProfile(profile)}><strong>{profile.label}</strong><small>{profile.profileId} · v{versionOf(profile) ?? "unpublished"} · rev {profile.revision}</small></button>) : <p className="lab-empty">The server returned no profiles. Create one in Control Room before editing a recipe.</p>}<div className="lab-temporary-note"><strong>Temporary override</strong><span>Next-dictation and session overrides stay local. They do not modify these versions.</span></div></aside>
        <div className="lab-recipe-editor">
          <div className="lab-title-row"><div><h3>{selectedProfile?.label ?? "No profile"}</h3><p>{dirty ? "Local draft with unpublished changes" : "Local copy of the published version"}</p></div><div className="lab-version"><span>Published</span><strong>v{versionOf(selectedProfile) ?? "—"}</strong><small>rev {selectedProfile?.revision ?? "—"}</small></div></div>
          <nav className="lab-tabs" aria-label="Recipe sections">{recipeViews.map((item) => <button key={item.id} type="button" data-active={recipeView === item.id} aria-current={recipeView === item.id ? "page" : undefined} onClick={() => props.onRecipeView(item.id)}>{item.label}</button>)}</nav>
          {recipeView === "builder" && draft ? <div className="lab-builder">
            <section className="lab-editor-section">
              <div className="lab-section-heading"><div><h3>Transcription</h3><p>Canonical engine/prompt references and transcript language default.</p></div><StatusChip label="configured" /></div>
              <div className="lab-field-grid">
                <label><span>STT engine</span><select value={transcription?.engineId ?? ""} onChange={(event) => props.onDraftValue(updateOperation(draft, "transcription", { engineId: event.target.value }))}>{transcription?.engineId && !engines.some((item) => item.id === transcription.engineId) ? <option value={transcription.engineId}>Current unavailable · {transcription.engineId}</option> : null}<option value="">Not configured</option>{engines.filter((item) => item.compatibility.profileRuntimeKinds.includes("transcription")).map((item) => <option key={item.id} value={item.id} disabled={item.availability.status !== "available"}>{item.label} · {item.lifecycleStatus} · {item.availability.status}</option>)}</select></label>
                <label><span>Prompt</span><select value={transcription?.promptId ?? ""} onChange={(event) => props.onDraftValue(updateOperation(draft, "transcription", { promptId: event.target.value }))}>{transcription?.promptId && !prompts.some((item) => item.id === transcription.promptId) ? <option value={transcription.promptId}>Current unavailable · {transcription.promptId}</option> : null}<option value="">Not configured</option>{prompts.filter((item) => item.compatibility.profileRuntimeKinds.includes("transcription")).map((item) => <option key={item.id} value={item.id} disabled={item.availability.status !== "available"}>{item.label} · {item.version} · {item.availability.status}</option>)}</select></label>
                <label><span>Language</span><input value={String(draft.defaults["transcript.language"] ?? "")} placeholder="auto" onChange={(event) => props.onDraftValue({ ...draft, defaults: { ...draft.defaults, "transcript.language": event.target.value } })} /></label>
              </div>
            </section>
            <section className="lab-editor-section">
              <div className="lab-section-heading"><div><h3>Post-process and selection transform</h3><p>Canonical references only. Enablement is expressed by engine choice, never an invented field.</p></div><StatusChip label="configured" /></div>
              <div className="lab-field-grid">
                <label><span>Post-process engine</span><select value={postprocess?.engineId ?? ""} onChange={(event) => props.onDraftValue(updateOperation(draft, "postprocess", { engineId: event.target.value }))}>{postprocess?.engineId && !engines.some((item) => item.id === postprocess.engineId) ? <option value={postprocess.engineId}>Current unavailable · {postprocess.engineId}</option> : null}{engines.filter((item) => item.compatibility.profileRuntimeKinds.includes("postprocess")).map((item) => <option key={item.id} value={item.id} disabled={item.availability.status !== "available"}>{item.label} · {item.availability.status}</option>)}</select></label>
                <label><span>Post-process prompt</span><select value={postprocess?.promptId ?? ""} onChange={(event) => props.onDraftValue(updateOperation(draft, "postprocess", { promptId: event.target.value }))}>{postprocess?.promptId && !prompts.some((item) => item.id === postprocess.promptId) ? <option value={postprocess.promptId}>Current unavailable · {postprocess.promptId}</option> : null}{prompts.filter((item) => item.compatibility.profileRuntimeKinds.includes("postprocess")).map((item) => <option key={item.id} value={item.id} disabled={item.availability.status !== "available"}>{item.label} · {item.availability.status}</option>)}</select></label>
                <label><span>Selection transform engine</span><select value={selectionTransform?.engineId ?? ""} onChange={(event) => props.onDraftValue(updateOperation(draft, "selectionTransform", { engineId: event.target.value }))}>{selectionTransform?.engineId && !engines.some((item) => item.id === selectionTransform.engineId) ? <option value={selectionTransform.engineId}>Current unavailable · {selectionTransform.engineId}</option> : null}{engines.filter((item) => item.compatibility.profileRuntimeKinds.includes("selectionTransform")).map((item) => <option key={item.id} value={item.id} disabled={item.availability.status !== "available"}>{item.label} · {item.availability.status}</option>)}</select></label>
                <label><span>Selection transform prompt</span><select value={selectionTransform?.promptId ?? ""} onChange={(event) => props.onDraftValue(updateOperation(draft, "selectionTransform", { promptId: event.target.value }))}>{selectionTransform?.promptId && !prompts.some((item) => item.id === selectionTransform.promptId) ? <option value={selectionTransform.promptId}>Current unavailable · {selectionTransform.promptId}</option> : null}{prompts.filter((item) => item.compatibility.profileRuntimeKinds.includes("selectionTransform")).map((item) => <option key={item.id} value={item.id} disabled={item.availability.status !== "available"}>{item.label} · {item.availability.status}</option>)}</select></label>
              </div>
            </section>
            <section className="lab-editor-section">
              <div className="lab-section-heading"><div><h3>Access, limits, controls and defaults</h3><p>Every canonical section stays in the definition; unknown keys remain intact.</p></div></div>
              <div className="lab-field-grid">
                <label className="lab-field-wide"><span>Capabilities</span><input value={draft.access.capabilities.join(", ")} onChange={(event) => props.onDraftValue({ ...draft, access: { ...draft.access, capabilities: Array.from(new Set(event.target.value.split(",").map((item) => item.trim()).filter(Boolean))) } })} /></label>
                <label><span>Limit mode</span><select value={draft.limits.mode} onChange={(event) => props.onDraftValue({ ...draft, limits: { ...draft.limits, mode: event.target.value as "block" | "warn" } })}><option value="warn">Warn</option><option value="block">Block</option></select></label>
                <label><span>Daily USD</span><input type="number" min="0" step="0.01" value={draft.limits.dailyUsd ?? ""} onChange={(event) => props.onDraftValue(updateOptionalLimit(draft, "dailyUsd", event.target.value))} /></label>
                <label><span>Monthly USD</span><input type="number" min="0" step="0.01" value={draft.limits.monthlyUsd ?? ""} onChange={(event) => props.onDraftValue(updateOptionalLimit(draft, "monthlyUsd", event.target.value))} /></label>
                <label><span>Quota profile</span><input value={draft.limits.quotaProfile ?? ""} onChange={(event) => props.onDraftValue({ ...draft, limits: { ...draft.limits, quotaProfile: event.target.value } })} /></label>
              </div>
              <div className="lab-json-summaries"><span>Defaults: {Object.keys(draft.defaults).length} typed keys</span><span>User controls: {Object.keys(draft.userControls).length} typed visibility rules</span><span>Capabilities: {draft.access.capabilities.length}</span></div>
              {Object.entries(draft.userControls).map(([key, value]) => <label className="lab-inline-control" key={key}><span>{key}</span><select value={value} onChange={(event) => props.onDraftValue({ ...draft, userControls: { ...draft.userControls, [key]: event.target.value as "hidden" | "visible-locked" | "editable" } })}><option value="hidden">Hidden</option><option value="visible-locked">Visible locked</option><option value="editable">Editable</option></select></label>)}
            </section>
            <section className="lab-advanced"><button type="button" className="lab-link-button" aria-expanded={advanced} onClick={() => props.onAdvanced(!advanced)}>{advanced ? "Hide advanced JSON" : "Open advanced JSON"}</button>{advanced ? <div><label htmlFor="lab-advanced-json">Advanced recipe definition</label><textarea id="lab-advanced-json" value={advancedText} onChange={(event) => props.onAdvancedText(event.target.value)} spellCheck={false} /><button type="button" className="lab-secondary-button" onClick={props.onApplyAdvancedJson}>Apply JSON to draft</button></div> : null}</section>
            {preview && previewFingerprint === stableDefinitionFingerprint(draft) ? <section className="lab-preview" aria-label="Server-owned preview"><div className="lab-section-heading"><div><h3>Server-owned preview</h3><p>Diff against v{preview.baseVersion ?? "no base"}. Fingerprint <code>{preview.candidateFingerprint}</code>. The profile was not mutated.</p></div><StatusChip label={preview.changed ? `${preview.changes.length} changes` : "No changes"} /></div>{preview.truncated ? <p className="lab-inline-notice" data-tone="warning">Diff truncated by the server; publication still applies the complete candidate.</p> : null}{preview.changes.length ? <div className="lab-preview-list">{preview.changes.map((change) => <div key={change.path}><code>{change.kind} · {change.path}</code><span><strong>Before:</strong> {JSON.stringify(change.before)} <strong>After:</strong> {JSON.stringify(change.after)}</span></div>)}</div> : null}</section> : null}
          </div> : null}
          {recipeView === "builder" && !draft ? <StatePanel title="No published recipe" detail="This profile has no published definition to copy into a local draft." /> : null}
          {recipeView === "effective" ? <div className="lab-evidence-grid"><EvidencePanel title="Configured" value={selectedProfile?.published?.definition ?? null} detail="Selected published definition." /><EvidencePanel title="Resolved" value={null} detail="Unavailable: no effective assignment projection is present in the canonical routes currently loaded." /><EvidencePanel title="Observed" value={null} detail="Unavailable: no last-run identity is present in the canonical routes currently loaded." /></div> : null}
          {recipeView === "audit" ? <div className="lab-runs-layout"><section className="lab-panel"><div className="lab-section-heading"><div><h3>Published versions</h3><p>Server-owned history for the selected profile.</p></div><span>{selectedProfile?.history.length ?? 0}</span></div>{selectedProfile?.history.length ? <div className="lab-version-list">{selectedProfile.history.map((version) => <div key={String(version.version)}><strong>v{version.version}</strong><span>{version.status}</span><code>authority rev {version.authorityRevision}</code></div>)}</div> : <p className="lab-empty">No historical versions are available.</p>}</section><section className="lab-audit"><div className="lab-section-heading"><div><h3>Audit</h3><p>Most recent redacted records.</p></div><span>{load.audit.records.length}</span></div>{load.audit.records.length ? load.audit.records.map((record, index) => <div className="lab-audit-row" key={`${record.occurredAt}-${index}`}><strong>{record.action}</strong><span>{record.targetType} · {record.result}</span><time>{new Date(record.occurredAt).toLocaleString()}</time></div>) : <p className="lab-empty">{load.resources.audit.status === "unavailable" ? "Audit is temporarily unavailable; profiles remain readable." : "No audit records are available."}</p>}</section></div> : null}
        </div>
      </div>
      <footer className="lab-command-bar"><div className="lab-notice" data-tone={notice.tone} aria-live="polite">{notice.message || "No server-side changes."}</div><div className="lab-command-actions"><button type="button" className="lab-secondary-button" disabled={!draft || busy !== null} onClick={props.onValidate}>{busy === "validate" ? "Validating" : "Validate draft"}</button><details><summary>Publish</summary><div className="lab-command-popover"><label><span>Confirmation phrase</span><input value={applyPhrase} onChange={(event) => props.onApplyPhrase(event.target.value)} aria-describedby="lab-publish-phrase" /></label><p id="lab-publish-phrase">Type <code>{expectedApplyPhrase}</code></p><button type="button" className="lab-primary-button" disabled={!dirty || !draft || previewFingerprint !== stableDefinitionFingerprint(draft) || !canPublish || applyPhrase !== expectedApplyPhrase || busy !== null} onClick={props.onApply}>{busy === "apply" ? "Publishing" : "Publish version"}</button>{!draft || previewFingerprint !== stableDefinitionFingerprint(draft) ? <small>Validate and review the preview before publishing.</small> : null}{!canPublish ? <small>Requires publisher or owner role and recent Google authentication.</small> : null}</div></details><details><summary>Rollback</summary><div className="lab-command-popover"><label><span>Target version</span><select value={rollbackVersion ?? ""} onChange={(event) => props.onRollbackVersion(Number(event.target.value) || null)}><option value="">Choose a version</option>{previousVersions.map((item) => <option key={item.version} value={item.version}>v{item.version} · {item.status}</option>)}</select></label><label><span>Confirmation phrase</span><input value={rollbackPhrase} onChange={(event) => props.onRollbackPhrase(event.target.value)} aria-describedby="lab-rollback-phrase" /></label><p id="lab-rollback-phrase">Type <code>{expectedRollbackPhrase || "Choose a version first"}</code></p><button type="button" className="lab-danger-button" disabled={!canPublish || !rollbackVersion || rollbackPhrase !== expectedRollbackPhrase || busy !== null} onClick={props.onRollback}>{busy === "rollback" ? "Restoring" : "Publish rollback"}</button></div></details><details><summary>Assign account</summary><div className="lab-command-popover"><label><span>Account</span><select value={accountHandle} onChange={(event) => props.onAccountHandle(event.target.value)}><option value="">Choose an account</option>{load.accounts.accounts.map((account) => <option key={account.accountHandle} value={account.accountHandle}>{account.label || account.accountHandle}</option>)}</select></label><p>{load.resources.accounts.status === "unavailable" ? "Accounts are temporarily unavailable; the profile remains readable." : "Assigns the published profile. The local draft is never assigned."}</p><button type="button" className="lab-primary-button" disabled={!accountHandle || !canPublish || busy !== null} onClick={props.onAssign}>{busy === "assign" ? "Assigning" : "Assign profile"}</button></div></details></div></footer>
    </div>
  );
}

function EvidencePanel({ title, value, detail }: { title: string; value: JsonValue | null; detail: string }) {
  return <section className="lab-evidence-panel"><div><h3>{title}</h3><StatusChip label={value ? "Available" : "Not observed"} tone={value ? "success" : "neutral"} /></div><p>{detail}</p>{value ? <pre>{JSON.stringify(value, null, 2)}</pre> : null}</section>;
}
