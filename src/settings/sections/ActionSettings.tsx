import { useEffect, useMemo, useRef, useState } from "react";
import {
  createSelectionTransformPreset,
  deleteSelectionTransformPreset,
  listSelectionTransformPresetAdminItems,
  saveSelectionTransformPreset,
  type SelectionTransformPresetAdminItem,
} from "../../selection-transform";
import {
  extractCloudSelectionPresetDefaults,
  importCloudSelectionPresetDefaults,
  loadSelectionPresetStore,
  saveSelectionPresetStore,
} from "../preset-store-control";
import { getFixvoxCloudStatus, resolveSettingsAccess, type FixvoxCloudStatus } from "../fixvox-cloud-control";
import type { ActionSettingsProps, SettingsPersistenceState } from "../section-contracts";
import { SettingNotice } from "../shared/SettingNotice";
const emptyDraft = {
  name: "",
  pickerKey: "",
  hotkey: "",
  enabled: true,
  confirm: false,
  body: "",
  provider: "",
  model: "",
};

type ActionDraft = typeof emptyDraft;
type Notice = { tone: "info" | "success" | "warning" | "danger"; message: string };

function draftFromPreset(preset: SelectionTransformPresetAdminItem | undefined): ActionDraft {
  if (!preset) return emptyDraft;
  return {
    name: preset.name,
    pickerKey: preset.pickerKey,
    hotkey: preset.hotkey,
    enabled: preset.enabled !== false,
    confirm: preset.confirm === true,
    body: preset.body,
    provider: preset.provider ?? "",
    model: preset.model ?? "",
  };
}

function sameDraft(draft: ActionDraft, preset: SelectionTransformPresetAdminItem | undefined): boolean {
  if (!preset) return true;
  return draft.name === preset.name
    && draft.pickerKey.toUpperCase() === preset.pickerKey
    && draft.hotkey === preset.hotkey
    && draft.enabled === (preset.enabled !== false)
    && draft.confirm === (preset.confirm === true)
    && draft.body === preset.body
    && draft.provider === (preset.provider ?? "")
    && draft.model === (preset.model ?? "");
}

function formatError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "No pudimos guardar los cambios.";
}



export function ActionSettings({ tauriRuntime, cloudStatus, onDirtyChange, onNavigate }: ActionSettingsProps) {
  const [resolvedCloudStatus, setResolvedCloudStatus] = useState<FixvoxCloudStatus | undefined>(cloudStatus);
  const mountedRef = useRef(true);
  const [items, setItems] = useState<SelectionTransformPresetAdminItem[]>(() => listSelectionTransformPresetAdminItems());
  const [selectedId, setSelectedId] = useState(() => items[0]?.id ?? "");
  const [draft, setDraft] = useState<ActionDraft>(() => draftFromPreset(items[0]));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pendingSelectionId, setPendingSelectionId] = useState<string>();
  const [loading, setLoading] = useState(tauriRuntime && !resolvedCloudStatus);
  const [busy, setBusy] = useState<"load" | "save" | "import" | "duplicate" | "delete">();
  const [notice, setNotice] = useState<Notice>({ tone: "info", message: "Seleccioná una acción para revisar sus atajos." });
  const [persistence, setPersistence] = useState<SettingsPersistenceState>(
    tauriRuntime && !cloudStatus ? { status: "loading", target: "actions" } : { status: "idle" },
  );

  const access = resolveSettingsAccess(resolvedCloudStatus);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const dirty = Boolean(access.canEditPresets && selected && !sameDraft(draft, selected));
  const cloudDefaults = useMemo(() => extractCloudSelectionPresetDefaults(resolvedCloudStatus), [resolvedCloudStatus]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;

      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    if (dirty) setPersistence({ status: "dirty", count: 1 });
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (cloudStatus) {
      setResolvedCloudStatus(cloudStatus);
      return;
    }
    if (!tauriRuntime) return;
    let cancelled = false;
    setLoading(true);
    setPersistence({ status: "loading", target: "actions" });
    void getFixvoxCloudStatus()
      .then((status) => {
        if (!cancelled && mountedRef.current) setResolvedCloudStatus(status);
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) {
          setNotice({ tone: "warning", message: "No pudimos comprobar el acceso a las acciones." });
          setPersistence({ status: "error", message: "No pudimos comprobar el acceso a las acciones.", rolledBack: false });
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [cloudStatus, tauriRuntime]);

  useEffect(() => {
    if (tauriRuntime && !resolvedCloudStatus) {
      return;
    }
    if (!access.canViewPresets) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setBusy("load");
    setPersistence({ status: "loading", target: "actions" });
    void loadSelectionPresetStore()
      .then(() => {
        if (cancelled || !mountedRef.current) return;
        const nextItems = listSelectionTransformPresetAdminItems();
        setItems(nextItems);
        setSelectedId((current) => nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id ?? "");
      })
      .catch((error) => {
        if (!cancelled && mountedRef.current) {
          const message = `No pudimos cargar las acciones: ${formatError(error)}`;
          setNotice({ tone: "warning", message });
          setPersistence({ status: "error", message, rolledBack: false });
        }
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) {
          setBusy(undefined);
          setLoading(false);
          setPersistence((current) => current.status === "loading" ? { status: "idle" } : current);
        }
      });
    return () => { cancelled = true; };
  }, [access.canViewPresets, resolvedCloudStatus, tauriRuntime]);

  useEffect(() => {
    if (selectedId === "") {
      setDraft(emptyDraft);
      return;
    }
    const current = items.find((item) => item.id === selectedId);
    setDraft(draftFromPreset(current));
  }, [selectedId]);

  function refresh(nextSelectedId = selectedId) {
    const nextItems = listSelectionTransformPresetAdminItems();
    const nextSelected = nextItems.find((item) => item.id === nextSelectedId) ?? nextItems[0];
    setItems(nextItems);
    setSelectedId(nextSelected?.id ?? "");
    setDraft(draftFromPreset(nextSelected));
    setPendingSelectionId(undefined);
    setAdvancedOpen(false);
  }

  function chooseAction(nextId: string) {
    if (nextId === selectedId) return;
    if (dirty) {
      setPendingSelectionId(nextId);
      setNotice({ tone: "warning", message: "Tenés cambios sin guardar en esta acción." });
      return;
    }
    const next = items.find((item) => item.id === nextId);
    setSelectedId(nextId);
    setDraft(draftFromPreset(next));
    setAdvancedOpen(false);
    setPendingSelectionId(undefined);
    setNotice({ tone: "info", message: "Acción seleccionada." });
  }

  function discardAndChoose() {
    if (!pendingSelectionId) return;
    const next = items.find((item) => item.id === pendingSelectionId);
    setSelectedId(pendingSelectionId);
    setDraft(draftFromPreset(next));
    setPendingSelectionId(undefined);
    setAdvancedOpen(false);
    setNotice({ tone: "info", message: "Descartamos los cambios sin guardar." });
  }

  async function persistStore(): Promise<boolean> {
    try {
      const saved = await saveSelectionPresetStore();
      return Boolean(saved);
    } catch {
      return false;
    }
  }

  async function saveDraft() {
    if (!selected || !access.canEditPresets) return;
    if (!draft.name.trim() || !draft.body.trim()) {
      setNotice({ tone: "warning", message: "El nombre y los detalles avanzados no pueden estar vacíos." });
      setAdvancedOpen(true);
      return;
    }
    setBusy("save");
    setPersistence({ status: "saving", target: "actions", scope: "device" });
    try {
      saveSelectionTransformPreset(selected.id, {
        name: draft.name.trim(),
        pickerKey: draft.pickerKey.toUpperCase().slice(0, 1),
        hotkey: draft.hotkey.trim(),
        enabled: draft.enabled,
        confirm: draft.confirm,
        body: draft.body,
        provider: draft.provider.trim() || null,
        model: draft.model.trim() || null,
      });
      const persisted = await persistStore();
      if (mountedRef.current) {
        const message = persisted
          ? "Acción guardada. El cambio se usará la próxima vez."
          : "Acción actualizada en esta sesión, pero no pudimos conservarla.";
        setNotice({ tone: persisted ? "success" : "warning", message });
        setPersistence(
          persisted
            ? { status: "saved", target: "actions", scope: "device" }
            : { status: "error", message, rolledBack: false },
        );
      }
    } catch (error) {
      if (mountedRef.current) {
        const message = `No pudimos guardar la acción: ${formatError(error)}`;
        setNotice({ tone: "danger", message });
        setPersistence({ status: "error", message, rolledBack: false });
      }
    } finally {
      if (mountedRef.current) setBusy(undefined);
    }
  }
  async function importDefaults() {
    if (!access.canEditPresets || !cloudDefaults.length) return;
    setBusy("import");
    setPersistence({ status: "saving", target: "actions", scope: "device" });
    try {
      const result = await importCloudSelectionPresetDefaults(cloudDefaults);
      if (mountedRef.current) {
        refresh(selectedId);
        const message = result.applied > 0
          ? `Importamos ${result.applied} valores para tus acciones.`
          : "Los valores disponibles no coincidieron con ninguna acción.";
        setNotice({ tone: result.applied > 0 ? "success" : "warning", message });
        setPersistence({ status: "saved", target: "actions", scope: "device" });
      }
    } catch (error) {
      if (mountedRef.current) {
        const message = `No pudimos importar valores: ${formatError(error)}`;
        setNotice({ tone: "danger", message });
        setPersistence({ status: "error", message, rolledBack: false });
      }
    } finally {
      if (mountedRef.current) setBusy(undefined);
    }
  }

  async function duplicateSelected() {
    if (!selected || !access.canEditPresets) return;
    setBusy("duplicate");
    setPersistence({ status: "saving", target: "actions", scope: "device" });
    try {
      const copy = createSelectionTransformPreset({
        name: `${selected.name} copia`,
        pickerKey: selected.pickerKey,
        hotkey: selected.hotkey,
        provider: selected.provider,
        model: selected.model,
        enabled: selected.enabled !== false,
        confirm: selected.confirm === true,
        body: selected.body,
      });
      const persisted = await persistStore();
      if (mountedRef.current) {
        refresh(copy.id);
        const message = persisted
          ? `${selected.name} duplicada.`
          : `${selected.name} duplicada en esta sesión, pero no pudimos conservarla.`;
        setNotice({ tone: persisted ? "success" : "warning", message });
        setPersistence(
          persisted
            ? { status: "saved", target: "actions", scope: "device" }
            : { status: "error", message, rolledBack: false },
        );
      }
    } catch (error) {
      if (mountedRef.current) {
        const message = `No pudimos duplicar la acción: ${formatError(error)}`;
        setNotice({ tone: "danger", message });
        setPersistence({ status: "error", message, rolledBack: false });
      }
    } finally {
      if (mountedRef.current) setBusy(undefined);
    }
  }

  async function deleteSelected() {
    if (!selected || !access.canEditPresets) return;
    if (!window.confirm(`¿Eliminar la acción “${selected.name}”? Esta acción no se puede deshacer.`)) return;
    setBusy("delete");
    setPersistence({ status: "saving", target: "actions", scope: "device" });
    try {
      deleteSelectionTransformPreset(selected.id);
      const persisted = await persistStore();
      if (mountedRef.current) {
        const deletedName = selected.name;
        refresh("");
        const message = persisted
          ? `${deletedName} eliminada.`
          : `${deletedName} eliminada en esta sesión, pero no pudimos conservarla.`;
        setNotice({ tone: persisted ? "info" : "warning", message });
        setPersistence(
          persisted
            ? { status: "saved", target: "actions", scope: "device" }
            : { status: "error", message, rolledBack: false },
        );
      }
    } catch (error) {
      if (mountedRef.current) {
        const message = `No pudimos eliminar la acción: ${formatError(error)}`;
        setNotice({ tone: "danger", message });
        setPersistence({ status: "error", message, rolledBack: false });
      }
    } finally {
      if (mountedRef.current) setBusy(undefined);
    }
  }


  if (loading) {
    return (
      <section id="settings-actions-list" className="settings-panel settings-presets-panel" aria-label="Acciones">
        <SettingNotice tone="info" title="Comprobando disponibilidad">
          Estamos comprobando el acceso a tus acciones.
        </SettingNotice>
        <SettingNotice persistence={persistence} />
      </section>
    );
  }

  if (!access.canViewPresets) {
    return (
      <section id="settings-actions-list" className="settings-panel settings-presets-panel" aria-label="Acciones">
        <SettingNotice tone="warning" title="Acciones no disponibles">
          No disponible: tu cuenta no tiene acceso a las acciones de selección.
        </SettingNotice>
        <SettingNotice persistence={persistence} />
      </section>
    );
  }

  return (
    <section id="settings-actions-list" className="settings-panel settings-presets-panel" aria-label="Acciones de texto">
      <header className="settings-panel-header">
        <div><h2>Acciones disponibles</h2><p>Elegí una acción para usarla sobre el texto seleccionado.</p></div>
        <span className="settings-panel-count">{items.length} acciones</span>
      </header>
      <SettingNotice persistence={persistence} />
      <p className="settings-section-relation">
        ¿Querés revisar los atajos que activan estas acciones?{" "}
        <button
          type="button"
          className="settings-inline-link"
          aria-controls="settings-hotkeys-list"
          onClick={() => onNavigate?.("hotkeys", "settings-hotkeys-list")}
        >
          Ver atajos
        </button>
      </p>
      {notice.message ? <SettingNotice tone={notice.tone}>{notice.message}</SettingNotice> : null}
      <div className="settings-preset-toolbar">
        <span className="settings-readonly-note">Los cambios se aplican en el próximo uso.</span>
        {access.canEditPresets && cloudDefaults.length ? <button type="button" className="settings-editor-button settings-editor-button-secondary" disabled={Boolean(busy)} onClick={() => void importDefaults()}>Importar valores</button> : null}
      </div>
      <div className="settings-preset-admin-grid">
        {items.length ? <div id="settings-actions-list-items" className="settings-preset-admin-list" aria-label="Lista de acciones">
          {items.map((item) => <button key={item.id} type="button" className="settings-preset-row" data-selected={item.id === selected?.id} onClick={() => chooseAction(item.id)}>
            <strong>{item.name}</strong><span className="settings-preset-row-meta"><kbd>{item.pickerKey}</kbd><span data-enabled={item.enabled !== false}>{item.enabled === false ? "Desactivada" : "Activada"}</span></span>
          </button>)}
        </div> : <div className="settings-preset-empty"><strong>No hay acciones disponibles.</strong><span>La cuenta todavía no tiene acciones para usar sobre una selección.</span></div>}
        {selected ? <section className="settings-preset-editor" aria-labelledby="settings-action-editor-title">
          <header className="settings-preset-editor-header"><div><h3 id="settings-action-editor-title">{selected.name}</h3><span>{selected.id}</span></div>{access.canEditPresets ? <div className="settings-preset-editor-icon-actions">
            <button type="button" className="settings-icon-button" disabled={Boolean(busy)} onClick={() => void duplicateSelected()} aria-label="Duplicar acción" title="Duplicar acción">Duplicar</button>
            <button type="button" className="settings-icon-button settings-icon-button-danger" disabled={Boolean(busy)} onClick={() => void deleteSelected()} aria-label="Eliminar acción" title="Eliminar acción">Eliminar</button>
          </div> : null}</header>
          <div className="settings-preset-metadata-grid">
            <label className="settings-preset-field"><span>Nombre</span><input value={draft.name} disabled={!access.canEditPresets} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="settings-preset-field settings-preset-field-short"><span>Tecla</span><input value={draft.pickerKey} maxLength={1} disabled={!access.canEditPresets} onChange={(event) => setDraft((current) => ({ ...current, pickerKey: event.target.value.toUpperCase().slice(0, 1) }))} aria-label="Tecla del selector de la acción" /></label>
            <label className="settings-preset-field"><span>Atajo</span><input value={draft.hotkey} disabled={!access.canEditPresets} onChange={(event) => setDraft((current) => ({ ...current, hotkey: event.target.value }))} aria-label="Atajo de la acción" placeholder="Alt+T, N" /></label>
          </div>
          <div className="settings-preset-options">
            <label className="settings-preset-option"><strong>Acción activada</strong><input type="checkbox" checked={draft.enabled} disabled={!access.canEditPresets} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /></label>
            <label className="settings-preset-option"><strong>Confirmar antes de usar</strong><input type="checkbox" checked={draft.confirm} disabled={!access.canEditPresets} onChange={(event) => setDraft((current) => ({ ...current, confirm: event.target.checked }))} /></label>
          </div>
          {access.canEditPresets ? <details className="settings-preset-advanced" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
            <summary>Editar detalles avanzados</summary>
            <p className="settings-readonly-note">Estos detalles configuran la acción disponible para tu cuenta. La ruta final y el modelo efectivo dependen de la política del servicio.</p>
            <div className="settings-preset-options">
              <label className="settings-preset-field"><span>Proveedor</span><input value={draft.provider} onChange={(event) => setDraft((current) => ({ ...current, provider: event.target.value }))} /></label>
              <label className="settings-preset-field"><span>Modelo</span><input value={draft.model} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))} /></label>
            </div>
            <label className="settings-preset-field"><span>Detalles de la acción</span><textarea className="settings-preset-textarea" value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} spellCheck={false} /></label>
          </details> : <p className="settings-readonly-note" role="status">
            No disponible para editar: tu cuenta no tiene habilitada la capacidad de personalizar acciones.
          </p>}
          <SettingNotice tone="info" title="Vista previa no disponible">
            Esta acción se resuelve cuando la usás sobre una selección. Ajustes no ejecuta proveedores ni inventa una salida.
          </SettingNotice>
          {pendingSelectionId ? <SettingNotice tone="warning" title="Cambios sin guardar" actions={<><button type="button" className="settings-editor-button settings-editor-button-secondary" onClick={() => setPendingSelectionId(undefined)}>Seguir editando</button><button type="button" className="settings-editor-button settings-editor-button-primary" onClick={discardAndChoose}>Descartar cambios</button></>}>
            Elegí si querés conservar la acción actual antes de cambiar de selección.
          </SettingNotice> : null}
          <footer className="settings-preset-editor-footer">
            <div className="settings-hotkey-editor-feedback" data-tone={notice.tone} aria-live="polite">
              <strong>{dirty ? "1 cambio sin guardar" : ""}</strong>
            </div>
            <button type="button" className="settings-editor-button settings-editor-button-primary" disabled={Boolean(busy) || !dirty || !access.canEditPresets} onClick={() => void saveDraft()}>
              {busy === "save" ? "Guardando…" : "Guardar cambios"}
            </button>
          </footer>
        </section> : null}
      </div>
    </section>
  );
}
