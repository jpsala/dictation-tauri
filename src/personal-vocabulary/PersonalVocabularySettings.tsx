
import { useEffect, useMemo, useState } from "react";
import {
  buildTeachCorrectionMutation,
  createTeachCorrectionDraftFromRule,
  createTauriVocabularyClient,
  saveTeachCorrection,
  validateTeachCorrectionDraft,
  type TeachCorrectionDraft,
  type VocabularyClient,
} from "./teach-correction";
import type { PersonalVocabularyRule, PersonalVocabularySnapshot } from "./types";

type SettingsNotice = Readonly<{
  tone: "idle" | "success" | "warning" | "danger";
  message: string;
}>;

type PersonalVocabularySettingsProps = Readonly<{
  client?: VocabularyClient;
  initialSnapshot?: PersonalVocabularySnapshot;
}>;

const EMPTY_DRAFT: TeachCorrectionDraft = {
  spoken: "",
  written: "",
  alternatives: [],
  mode: "ask",
  automaticConfirmed: false,
};

export function PersonalVocabularySettings({ client = createTauriVocabularyClient(), initialSnapshot }: PersonalVocabularySettingsProps) {
  const [snapshot, setSnapshot] = useState<PersonalVocabularySnapshot | undefined>(initialSnapshot);
  const [selectedRuleId, setSelectedRuleId] = useState<string>();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<TeachCorrectionDraft>(EMPTY_DRAFT);
  const [alternativeDraft, setAlternativeDraft] = useState("");
  const [busy, setBusy] = useState<"load" | "save" | "refresh" | "delete" | undefined>();
  const [notice, setNotice] = useState<SettingsNotice>({ tone: "idle", message: "" });

  const selectedRule = snapshot?.rules.find((rule) => rule.id === selectedRuleId);
  const draftValidation = validateTeachCorrectionDraft(draft);
  const automaticWarning = draftValidation.warnings.length > 0;
  const filteredRules = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return snapshot?.rules ?? [];
    return (snapshot?.rules ?? []).filter((rule) => [
      rule.id,
      rule.spoken,
      ...rule.candidates.map((candidate) => candidate.written),
    ].some((value) => value.toLocaleLowerCase().includes(normalized)));
  }, [query, snapshot?.rules]);

  useEffect(() => {
    if (initialSnapshot) {
      setSnapshot(initialSnapshot);
      return;
    }
    void loadSnapshot();
    // Loading is intentionally tied to this surface mount. Manual refresh is explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedRule) return;
    setDraft(createTeachCorrectionDraftFromRule(selectedRule));
    setAlternativeDraft("");
  }, [selectedRuleId]);

  async function loadSnapshot() {
    setBusy("load");
    try {
      const next = await client.readSnapshot();
      setSnapshot(next);
      if (selectedRuleId && !next.rules.some((rule) => rule.id === selectedRuleId)) {
        setSelectedRuleId(undefined);
        setDraft(EMPTY_DRAFT);
      }
      setNotice({ tone: "idle", message: "" });
    } catch (error) {
      setNotice({ tone: "warning", message: "No pudimos cargar las correcciones. El borrador queda disponible para reintentar." });
      if (error instanceof Error && error.message === "tauri_runtime_unavailable") {
        setNotice({ tone: "idle", message: "Abrí estos ajustes dentro de la aplicación para administrar correcciones." });
      }
    } finally {
      setBusy(undefined);
    }
  }

  function startCreate() {
    setSelectedRuleId(undefined);
    setDraft(EMPTY_DRAFT);
    setAlternativeDraft("");
    setNotice({ tone: "idle", message: "Nueva corrección. Guardá cuando el texto y el modo estén listos." });
  }

  function selectRule(rule: PersonalVocabularyRule) {
    setSelectedRuleId(rule.id);
    setDraft(createTeachCorrectionDraftFromRule(rule));
    setAlternativeDraft("");
    setNotice({ tone: "idle", message: "Regla seleccionada. Las mutaciones usan su ID y revisión exactos." });
  }

  function addAlternative() {
    const value = alternativeDraft;
    if (!value || value.trim().length === 0 || draft.alternatives.includes(value)) return;
    setDraft((current) => ({ ...current, alternatives: [...current.alternatives, value], mode: "ask", automaticConfirmed: false }));
    setAlternativeDraft("");
  }

  async function saveDraft() {
    if (!snapshot) {
      setNotice({ tone: "warning", message: "Todavía no hay una revisión de vocabulario disponible." });
      return;
    }
    setBusy("save");
    try {
      const result = await saveTeachCorrection({
        draft,
        snapshot,
        action: "remember_only",
        existingRule: selectedRule,
      }, client);
      if (result.status === "saved_only") {
        setNotice({ tone: result.cacheRefreshError ? "warning" : "success", message: result.cacheRefreshError ? "Regla guardada. La caché se actualizará al volver a intentar." : "Regla guardada y caché actualizada." });
        await loadSnapshot();
        return;
      }
      setNotice({
        tone: result.status === "conflict" ? "warning" : "danger",
        message: result.status === "conflict" ? "La revisión cambió en otro dispositivo. Actualizá y revisá el borrador." : "No pudimos guardar la regla. El borrador se conserva.",
      });
    } finally {
      setBusy(undefined);
    }
  }

  async function toggleEnabled() {
    if (!snapshot || !selectedRule) return;
    setBusy("save");
    try {
      const mutation = buildTeachCorrectionMutation(createTeachCorrectionDraftFromRule(selectedRule));
      const result = await client.updateRule({
        ruleId: selectedRule.id,
        expectedRevision: selectedRule.revision,
        mutation: { ...mutation, enabled: !selectedRule.enabled },
      });
      await client.refresh();
      setNotice({ tone: "success", message: selectedRule.enabled ? "Regla desactivada." : "Regla activada." });
      await loadSnapshot();
      if (result.rule) setSelectedRuleId(result.rule.id);
    } catch (error) {
      setNotice({ tone: /stale|conflict|409|revision/i.test(vocabularyErrorText(error)) ? "warning" : "danger", message: "No pudimos actualizar el estado. El borrador se conserva." });
    } finally {
      setBusy(undefined);
    }
  }

  async function deleteRule() {
    if (!snapshot || !selectedRule || !window.confirm(`¿Eliminar la regla “${selectedRule.spoken}”?`)) return;
    setBusy("delete");
    try {
      await client.deleteRule({ ruleId: selectedRule.id, expectedRevision: selectedRule.revision });
      await client.refresh();
      setSelectedRuleId(undefined);
      setDraft(EMPTY_DRAFT);
      setNotice({ tone: "success", message: "Regla eliminada." });
      await loadSnapshot();
    } catch (error) {
      setNotice({ tone: /stale|conflict|409|revision/i.test(vocabularyErrorText(error)) ? "warning" : "danger", message: "No pudimos eliminar la regla. Actualizá y reintentá." });
    } finally {
      setBusy(undefined);
    }
  }

  async function manualRefresh() {
    setBusy("refresh");
    try {
      await client.refresh();
      await loadSnapshot();
      setNotice({ tone: "success", message: "Correcciones actualizadas." });
    } catch {
      setNotice({ tone: "warning", message: "No pudimos actualizar las correcciones. El borrador no cambió." });
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className="settings-panel settings-vocabulary-panel" aria-labelledby="settings-vocabulary-title">
      <div className="settings-panel-header">
        <div>
          <h2 id="settings-vocabulary-title">Correcciones personales</h2>
          <p>Guardá grafías exactas para que tus dictados futuros sean previsibles.</p>
        </div>
        <div className="settings-panel-header-actions">
          <button type="button" className="settings-editor-button settings-editor-button-secondary" onClick={() => void manualRefresh()} disabled={Boolean(busy)}>
            {busy === "refresh" ? "Actualizando…" : "Actualizar"}
          </button>
          <button type="button" className="settings-editor-button settings-editor-button-primary" onClick={startCreate} disabled={Boolean(busy)}>Nueva regla</button>
        </div>
      </div>

      <label className="settings-vocabulary-search">
        <span>Buscar por ID, disparador o salida</span>
        <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Buscar correcciones" />
      </label>

      <div className="settings-vocabulary-grid">
        <div className="settings-vocabulary-list" aria-label="Reglas de corrección">
          {filteredRules.length ? filteredRules.map((rule) => (
            <button key={rule.id} type="button" className="settings-vocabulary-row" data-selected={rule.id === selectedRuleId} onClick={() => selectRule(rule)}>
              <span><strong>{rule.spoken}</strong><small>{rule.candidates.map((candidate) => candidate.written).join(" · ")}</small></span>
              <em data-enabled={rule.enabled}>{rule.enabled ? "Activa" : "Desactivada"}</em>
            </button>
          )) : (
            <div className="settings-vocabulary-empty"><strong>{snapshot ? "No hay reglas que coincidan." : "Sin reglas cargadas."}</strong><span>Creá una regla desde el picker o con Nueva regla.</span></div>
          )}
        </div>

        <section className="settings-vocabulary-editor" aria-labelledby="settings-vocabulary-editor-title">
          <div className="settings-preset-editor-header">
            <div><h3 id="settings-vocabulary-editor-title">{selectedRule ? "Editar regla" : "Nueva regla"}</h3><span>{selectedRule ? `ID ${selectedRule.id}` : "Sin guardar"}</span></div>
            {selectedRule ? <button type="button" className="settings-editor-button settings-editor-button-danger" onClick={() => void deleteRule()} disabled={Boolean(busy)}>Eliminar</button> : null}
          </div>
          <label className="settings-preset-field"><span>Texto hablado</span><input value={draft.spoken} onChange={(event) => setDraft((current) => ({ ...current, spoken: event.currentTarget.value, automaticConfirmed: current.spoken === event.currentTarget.value ? current.automaticConfirmed : false }))} maxLength={256} /></label>
          <label className="settings-preset-field"><span>Texto correcto</span><textarea value={draft.written} onChange={(event) => setDraft((current) => ({ ...current, written: event.currentTarget.value }))} maxLength={256} rows={2} /></label>
          <fieldset className="settings-vocabulary-mode"><legend>Modo</legend><label><input type="radio" name="settings-vocabulary-mode" checked={draft.mode === "automatic"} onChange={() => setDraft((current) => ({ ...current, mode: "automatic", automaticConfirmed: current.mode === "automatic" && current.automaticConfirmed }))} />Automática</label><label><input type="radio" name="settings-vocabulary-mode" checked={draft.mode === "ask"} onChange={() => setDraft((current) => ({ ...current, mode: "ask", automaticConfirmed: false }))} />Preguntar</label></fieldset>
          {automaticWarning ? <div className="settings-vocabulary-warning" role="note"><strong>Este disparador es corto o común.</strong><span>Usá Preguntar o confirmá explícitamente Automática.</span>{draft.mode === "automatic" ? <label><input type="checkbox" data-testid="settings-automatic-confirmation" checked={draft.automaticConfirmed} onChange={(event) => setDraft((current) => ({ ...current, automaticConfirmed: event.currentTarget.checked }))} />Confirmo usar Automática para este disparador.</label> : null}</div> : null}
          <div className="settings-preset-field"><span>Alternativas</span><div className="settings-vocabulary-alternative-entry"><input value={alternativeDraft} onChange={(event) => setAlternativeDraft(event.currentTarget.value)} placeholder="Otra salida" aria-label="Nueva salida" /><button type="button" className="settings-editor-button settings-editor-button-secondary" onClick={addAlternative} disabled={!alternativeDraft.trim()}>Agregar</button></div>{draft.alternatives.length ? <ul>{draft.alternatives.map((value) => <li key={value}><span>{value}</span><button type="button" onClick={() => setDraft((current) => ({ ...current, alternatives: current.alternatives.filter((candidate) => candidate !== value) }))} aria-label={`Quitar alternativa ${value}`}>×</button></li>)}</ul> : null}</div>
          <div className="settings-vocabulary-enabled">{selectedRule ? <><span>{selectedRule.enabled ? "Regla activa" : "Regla desactivada"}</span><button type="button" className="settings-editor-button settings-editor-button-secondary" onClick={() => void toggleEnabled()} disabled={Boolean(busy)}>{selectedRule.enabled ? "Desactivar" : "Activar"}</button></> : <span>Las reglas nuevas quedan activas al guardar.</span>}</div>
          {notice.message ? <div className="settings-hotkey-editor-feedback" data-tone={notice.tone} role="status" aria-live="polite"><strong>{notice.message}</strong></div> : null}
          <footer className="settings-preset-editor-footer"><span className="settings-readonly-note">La revisión se valida en el servidor. Los conflictos conservan este borrador.</span><button type="button" className="settings-editor-button settings-editor-button-primary" onClick={() => void saveDraft()} disabled={Boolean(busy) || !draft.spoken.trim() || !draft.written.trim()}>{busy === "save" ? "Guardando…" : "Guardar regla"}</button></footer>
        </section>
      </div>
    </section>
  );
}

function vocabularyErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) return JSON.stringify(error) ?? String(error);
  return String(error);
}
