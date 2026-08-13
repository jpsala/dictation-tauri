import { useEffect, useMemo, useState } from "react";

import { compareLabRuns } from "./evaluation";
import { createDictationLabClient, type DictationLabClient } from "./client";
import type { JsonObject, JsonValue, LaboratoryLoad, LaboratoryProfile, ProfilePreviewReceipt, RecipeDefinition } from "./types";
import "./dictation-lab.css";

type LabTab = "builder" | "effective" | "bench" | "runs";
type Notice = { tone: "idle" | "success" | "warning" | "danger"; message: string };

const tabs: Array<{ id: LabTab; label: string }> = [
  { id: "builder", label: "Receta" },
  { id: "effective", label: "Configuración efectiva" },
  { id: "bench", label: "Test bench" },
  { id: "runs", label: "Runs y auditoría" },
];
const defaultDictationLabClient = createDictationLabClient();


function copyDefinition(value: RecipeDefinition | null): RecipeDefinition | null {
  return value ? structuredClone(value) : null;
}

function asObject(value: JsonValue | undefined): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function operation(draft: RecipeDefinition, key: "transcription" | "postprocess") {
  return asObject(asObject(draft.runtime)[key]);
}

function updateOperation(
  draft: RecipeDefinition,
  key: "transcription" | "postprocess",
  patch: JsonObject,
): RecipeDefinition {
  const runtime = asObject(draft.runtime);
  return { ...draft, runtime: { ...runtime, [key]: { ...asObject(runtime[key]), ...patch } } };
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

export function DictationLabSurface({ client = defaultDictationLabClient }: { client?: DictationLabClient }) {
  const [load, setLoad] = useState<LaboratoryLoad>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [draft, setDraft] = useState<RecipeDefinition | null>(null);
  const [tab, setTab] = useState<LabTab>("builder");
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
  const [baselineRunId, setBaselineRunId] = useState("");
  const [candidateRunId, setCandidateRunId] = useState("");

  const profiles = load?.profiles.profiles ?? [];
  const selectedProfile = profiles.find((profile) => profile.profileId === selectedProfileId) ?? profiles[0];
  const engines = load?.configuration.engineOptions ?? [];
  const prompts = load?.configuration.promptOptions ?? [];
  const canPublish = Boolean(load?.session.recentGoogle && ["publisher", "owner"].includes(load.session.role));
  const expectedApplyPhrase = selectedProfile ? `APPLY ${selectedProfile.profileId} REV ${selectedProfile.revision}` : "";
  const expectedRollbackPhrase = selectedProfile && rollbackVersion
    ? `ROLLBACK ${selectedProfile.profileId} TO ${rollbackVersion} REV ${selectedProfile.revision}`
    : "";
  const runs = load?.runs ?? [];
  const baselineRun = runs.find((run) => run.runId === baselineRunId) ?? runs[0];
  const candidateRun = runs.find((run) => run.runId === candidateRunId) ?? runs[1];
  const comparison = baselineRun && candidateRun ? compareLabRuns(baselineRun, candidateRun) : null;

  const dirty = useMemo(() => {
    if (!draft || !selectedProfile?.published) return false;
    return JSON.stringify(draft) !== JSON.stringify(selectedProfile.published);
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
        setDraft(copyDefinition(first?.published ?? null));
        setAdvancedText(first?.published ? JSON.stringify(first.published, null, 2) : "");
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

  function selectProfile(profile: LaboratoryProfile) {
    if (dirty && !window.confirm("Descartar el draft local y abrir otra receta?")) return;
    setSelectedProfileId(profile.profileId);
    const next = copyDefinition(profile.published);
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
      setPreviewFingerprint(JSON.stringify(draft));
      setNotice({
        tone: "success",
        message: nextPreview.data.changed
          ? `Draft válido: ${nextPreview.data.changes.length} cambios${nextPreview.data.truncated ? " (vista acotada)" : ""}.`
          : "Draft válido, sin cambios respecto de la versión publicada.",
      });
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
      const [nextProfiles, nextAudit] = await Promise.all([client.reloadProfiles(), client.reloadAudit()]);
      setLoad((current) => current ? { ...current, profiles: nextProfiles, audit: nextAudit } : current);
      const updated = nextProfiles.profiles.find((profile) => profile.profileId === selectedProfile.profileId);
      setDraft(copyDefinition(updated?.published ?? null));
      setApplyPhrase("");
      setNotice({ tone: "success", message: `Publicado v${receipt.data.publication.resultingVersion}. Audit ${receipt.data.audit.id}.` });
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
      const [nextProfiles, nextAudit] = await Promise.all([client.reloadProfiles(), client.reloadAudit()]);
      setLoad((current) => current ? { ...current, profiles: nextProfiles, audit: nextAudit } : current);
      setRollbackVersion(null);
      setRollbackPhrase("");
      setNotice({ tone: "success", message: `Rollback publicado como v${receipt.data.publication.resultingVersion}.` });
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

  if (loading) {
    return <main className="lab-shell lab-loading" aria-busy="true"><div className="lab-skeleton" /><div className="lab-skeleton large" /></main>;
  }

  if (loadError || !load) {
    return (
      <main className="lab-shell lab-unavailable">
        <section>
          <h1>Dictation Laboratory no disponible</h1>
          <p>{loadError || "No pudimos cargar el control plane."}</p>
          <p className="lab-muted">No se cargaron datos de ejemplo ni se ejecutó ningún provider.</p>
        </section>
      </main>
    );
  }

  const transcription = draft ? operation(draft, "transcription") : {};
  const postprocess = draft ? operation(draft, "postprocess") : {};
  const previousVersions = selectedProfile?.history.filter((item) => item.version !== versionOf(selectedProfile)) ?? [];

  return (
    <main className="lab-shell">
      <header className="lab-topbar">
        <div><h1>Dictation Laboratory</h1><p>Recetas versionadas sobre perfiles de Control Room</p></div>
        <div className="lab-session"><span>{load.session.role}</span><strong>{load.session.recentGoogle ? "Sesión reciente" : "Reautenticación requerida"}</strong></div>
      </header>

      <div className="lab-workspace">
        <aside className="lab-navigator" aria-label="Catálogo de recetas">
          <div className="lab-nav-heading"><strong>Profiles</strong><span>{profiles.length}</span></div>
          {profiles.length ? profiles.map((profile) => (
            <button key={profile.profileId} type="button" data-active={profile.profileId === selectedProfile?.profileId} onClick={() => selectProfile(profile)}>
              <strong>{profile.label}</strong>
              <small>{profile.profileId} · v{versionOf(profile) ?? "sin publicar"} · rev {profile.revision}</small>
            </button>
          )) : <p className="lab-empty">El servidor no devolvió profiles.</p>}
          <div className="lab-temporary-note"><strong>Override temporal</strong><span>Próximo dictado y sesión siguen locales. No modifican estas versiones.</span></div>
        </aside>

        <section className="lab-main">
          <div className="lab-title-row">
            <div><h2>{selectedProfile?.label ?? "Sin profile"}</h2><p>{dirty ? "Draft local con cambios" : "Copia local de la versión publicada"}</p></div>
            <div className="lab-version"><span>Publicada</span><strong>v{versionOf(selectedProfile) ?? "—"}</strong><small>rev {selectedProfile?.revision ?? "—"}</small></div>
          </div>

          <nav className="lab-tabs" aria-label="Secciones del laboratorio">
            {tabs.map((item) => <button key={item.id} type="button" data-active={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}
          </nav>

          {tab === "builder" && draft ? (
            <div className="lab-builder">
              <section className="lab-editor-section">
                <div className="lab-section-heading"><div><h3>Transcripción</h3><p>Motor, prompt e idioma configurados para STT.</p></div><span>configured</span></div>
                <div className="lab-field-grid">
                  <label><span>Motor STT</span><select value={String(transcription.engineId ?? "")} onChange={(event) => setDraftValue(updateOperation(draft, "transcription", { engineId: event.target.value }))}><option value="">Sin configurar</option>{engines.filter((item) => item.kind === "transcription").map((item) => <option key={item.id} value={item.id}>{item.providerLabel || item.provider || "Provider"} · {item.modelLabel || item.model || item.id}</option>)}</select></label>
                  <label><span>Prompt</span><select value={String(transcription.promptId ?? "")} onChange={(event) => setDraftValue(updateOperation(draft, "transcription", { promptId: event.target.value }))}><option value="">Sin configurar</option>{prompts.filter((item) => item.kind === "transcription").map((item) => <option key={item.id} value={item.id}>{item.id} · {item.version}</option>)}</select></label>
                  <label><span>Idioma</span><input value={String(transcription.language ?? "")} placeholder="auto" onChange={(event) => setDraftValue(updateOperation(draft, "transcription", { language: event.target.value }))} /></label>
                </div>
              </section>

              <section className="lab-editor-section">
                <div className="lab-section-heading"><div><h3>Post-proceso y seguridad semántica</h3><p>La validación y ejecución permanecen server-owned.</p></div><span>configured</span></div>
                <div className="lab-field-grid">
                  <label><span>Motor</span><select value={String(postprocess.engineId ?? "")} onChange={(event) => setDraftValue(updateOperation(draft, "postprocess", { engineId: event.target.value }))}><option value="">Sin configurar</option>{engines.filter((item) => item.kind === "postprocess").map((item) => <option key={item.id} value={item.id}>{item.providerLabel || item.provider || "Provider"} · {item.modelLabel || item.model || item.id}</option>)}</select></label>
                  <label><span>Prompt</span><select value={String(postprocess.promptId ?? "")} onChange={(event) => setDraftValue(updateOperation(draft, "postprocess", { promptId: event.target.value }))}><option value="">Sin configurar</option>{prompts.filter((item) => item.kind === "postprocess").map((item) => <option key={item.id} value={item.id}>{item.id} · {item.version}</option>)}</select></label>
                  <label><span>Estado</span><select value={postprocess.enabled === false ? "off" : "on"} onChange={(event) => setDraftValue(updateOperation(draft, "postprocess", { enabled: event.target.value === "on" }))}><option value="on">Habilitado</option><option value="off">Deshabilitado</option></select></label>
                </div>
                <div className="lab-json-summaries"><span>Vocabulary/defaults: {Object.keys(asObject(draft.defaults)).length} claves</span><span>Limits: {Object.keys(asObject(draft.limits)).length} claves</span><span>User controls: {Object.keys(asObject(draft.userControls)).length} claves</span><span>Capabilities: {Array.isArray(asObject(draft.access).capabilities) ? (asObject(draft.access).capabilities as JsonValue[]).length : 0}</span></div>
              </section>

              <section className="lab-advanced">
                <button type="button" className="lab-link-button" onClick={() => setAdvanced((value) => !value)}>{advanced ? "Ocultar JSON avanzado" : "Abrir JSON avanzado"}</button>
                {advanced && <div><textarea aria-label="Definición JSON avanzada" value={advancedText} onChange={(event) => setAdvancedText(event.target.value)} spellCheck={false} /><button type="button" className="lab-secondary-button" onClick={applyAdvancedJson}>Aplicar JSON al draft</button></div>}
              </section>
              {preview && previewFingerprint === JSON.stringify(draft) ? (
                <section className="lab-preview" aria-label="Preview server-owned">
                  <div className="lab-section-heading">
                    <div><h3>Preview server-owned</h3><p>Diff contra v{preview.baseVersion ?? "sin base"}. No mutó el profile.</p></div>
                    <span>{preview.changed ? `${preview.changes.length} cambios` : "Sin cambios"}</span>
                  </div>
                  {preview.changes.length ? (
                    <div className="lab-preview-list">
                      {preview.changes.map((change) => (
                        <div key={change.path}><code>{change.path}</code><span>{JSON.stringify(change.before)} → {JSON.stringify(change.after)}</span></div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          ) : null}

          {tab === "effective" && (
            <div className="lab-evidence-grid">
              <EvidencePanel title="Configured" value={selectedProfile?.published ?? null} detail="Definición publicada seleccionada." />
              <EvidencePanel title="Resolved" value={null} detail="La proyección efectiva por asignación todavía no está incluida en accounts/devices." />
              <EvidencePanel title="Observed" value={null} detail="No hay identidad de último run en las rutas canónicas cargadas." />
            </div>
          )}

          {tab === "bench" && (
            <section className="lab-run-picker">
              <div className="lab-section-heading"><div><h3>Test bench provider-free</h3><p>Selecciona dos dictados locales ya terminados. No vuelve a llamar STT ni postprocess.</p></div><span>{runs.length} elegibles</span></div>
              <div className="lab-field-grid">
                <label><span>Baseline</span><select value={baselineRun?.runId ?? ""} onChange={(event) => setBaselineRunId(event.target.value)}><option value="">Elegir run</option>{runs.map((run) => <option key={`base-${run.runId}`} value={run.runId}>{run.runId} · {run.final.length ?? "sin longitud"} chars</option>)}</select></label>
                <label><span>Candidate</span><select value={candidateRun?.runId ?? ""} onChange={(event) => setCandidateRunId(event.target.value)}><option value="">Elegir run</option>{runs.map((run) => <option key={`candidate-${run.runId}`} value={run.runId}>{run.runId} · {run.final.length ?? "sin longitud"} chars</option>)}</select></label>
              </div>
              {!runs.length ? <p className="lab-empty">No hay dictados terminados en el historial local.</p> : null}
            </section>
          )}

          {tab === "runs" && (
            <div className="lab-runs-layout">
              {comparison ? (
                <section className="lab-comparison">
                  <div className="lab-section-heading"><div><h3>Comparación redacted</h3><p>{comparison.baseline.runId} → {comparison.candidate.runId}</p></div><span>{comparison.evidence.status}</span></div>
                  <div className="lab-comparison-grid">
                    <ComparisonMetric label="Longitud final" baseline={comparison.finalLength.baseline} candidate={comparison.finalLength.candidate} delta={comparison.finalLength.delta} />
                    <ComparisonMetric label="Latencia ms" baseline={comparison.latencyMs.baseline} candidate={comparison.latencyMs.candidate} delta={comparison.latencyMs.delta} />
                    <ComparisonMetric label="Costo observado USD" baseline={comparison.costUsd.observed.baseline} candidate={comparison.costUsd.observed.candidate} delta={comparison.costUsd.observed.delta} />
                    <div><span>Provider / modelo</span><strong>{comparison.observedExecution.baseline.provider ?? "no observado"} / {comparison.observedExecution.baseline.model ?? "no observado"}</strong><strong>{comparison.observedExecution.candidate.provider ?? "no observado"} / {comparison.observedExecution.candidate.model ?? "no observado"}</strong></div>
                  </div>
                  <p className="lab-muted">Evidencia faltante: {comparison.evidence.missing.join(", ") || "ninguna"}. Raw/final permanecen como longitudes y refs opacas.</p>
                </section>
              ) : <UnavailableSection title="Comparación de runs" detail="Elegí dos runs distintos en Test bench." />}
              <section className="lab-audit"><div className="lab-section-heading"><div><h3>Auditoría</h3><p>Registros redacted más recientes.</p></div><span>{load.audit.records.length}</span></div>{load.audit.records.length ? load.audit.records.map((record, index) => <div className="lab-audit-row" key={`${record.occurredAt}-${index}`}><strong>{record.action}</strong><span>{record.targetType} · {record.result}</span><time>{new Date(record.occurredAt).toLocaleString()}</time></div>) : <p className="lab-empty">Sin registros disponibles.</p>}</section>
            </div>
          )}

          <footer className="lab-command-bar">
            <div className="lab-notice" data-tone={notice.tone} aria-live="polite">{notice.message || "Sin cambios server-side."}</div>
            <div className="lab-command-actions">
              <button type="button" className="lab-secondary-button" disabled={!draft || busy !== null} onClick={() => void validateDraft()}>{busy === "validate" ? "Validando" : "Validar draft"}</button>
              <details><summary>Publicar</summary><div className="lab-command-popover"><p>Escribí <code>{expectedApplyPhrase}</code></p><input value={applyPhrase} onChange={(event) => setApplyPhrase(event.target.value)} /><button type="button" className="lab-primary-button" disabled={!dirty || previewFingerprint !== JSON.stringify(draft) || !canPublish || applyPhrase !== expectedApplyPhrase || busy !== null} onClick={() => void applyDraft()}>{busy === "apply" ? "Publicando" : "Publicar versión"}</button>{previewFingerprint !== JSON.stringify(draft) && <small>Validá y revisá el preview antes de publicar.</small>}{!canPublish && <small>Requiere publisher/owner y Google reciente.</small>}</div></details>
              <details><summary>Rollback</summary><div className="lab-command-popover"><select value={rollbackVersion ?? ""} onChange={(event) => { setRollbackVersion(Number(event.target.value) || null); setRollbackPhrase(""); }}><option value="">Elegir versión</option>{previousVersions.map((item) => <option key={String(item.version)} value={Number(item.version)}>v{String(item.version)}</option>)}</select><p>Escribí <code>{expectedRollbackPhrase || "Elegí una versión"}</code></p><input value={rollbackPhrase} onChange={(event) => setRollbackPhrase(event.target.value)} /><button type="button" className="lab-danger-button" disabled={!canPublish || !rollbackVersion || rollbackPhrase !== expectedRollbackPhrase || busy !== null} onClick={() => void rollback()}>{busy === "rollback" ? "Restaurando" : "Publicar rollback"}</button></div></details>
              <details><summary>Asignar cuenta</summary><div className="lab-command-popover"><select value={accountHandle} onChange={(event) => setAccountHandle(event.target.value)}><option value="">Elegir cuenta</option>{load.accounts.accounts.map((account) => <option key={account.accountHandle} value={account.accountHandle}>{account.label || account.accountHandle}</option>)}</select><p>Asigna el profile publicado. El draft local no se asigna.</p><button type="button" className="lab-primary-button" disabled={!accountHandle || busy !== null} onClick={() => void assign()}>{busy === "assign" ? "Asignando" : "Asignar profile"}</button></div></details>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}

function EvidencePanel({ title, value, detail }: { title: string; value: JsonValue | null; detail: string }) {
  return <section className="lab-evidence-panel"><div><h3>{title}</h3><span>{value ? "Disponible" : "No observado"}</span></div><p>{detail}</p>{value && <pre>{JSON.stringify(value, null, 2)}</pre>}</section>;
}

function UnavailableSection({ title, detail }: { title: string; detail: string }) {
  return <section className="lab-unavailable-section"><h3>{title}</h3><p>{detail}</p><span>Unavailable</span></section>;
}

function ComparisonMetric({ label, baseline, candidate, delta }: { label: string; baseline?: number; candidate?: number; delta?: number }) {
  return <div><span>{label}</span><strong>{baseline ?? "no observado"}</strong><strong>{candidate ?? "no observado"}{delta === undefined ? "" : ` (${delta >= 0 ? "+" : ""}${delta})`}</strong></div>;
}
