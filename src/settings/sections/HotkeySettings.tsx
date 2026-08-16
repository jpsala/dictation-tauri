import { useEffect } from "react";
import type { HotkeySettingsProps, SettingsPersistenceState } from "../section-contracts";
import { SettingNotice } from "../shared/SettingNotice";
import { SettingsGroup } from "../shared/SettingsGroup";
import { hotkeyPreviewMessage, useHotkeysController, type HotkeyBinding } from "../controllers/use-hotkeys-controller";

const FIXED_BINDINGS = [
  {
    id: "stop-submit",
    label: "Detener y entregar",
    description: "Finaliza la captura y entrega el resultado.",
    shortcut: "Alt+Shift+Space",
  },
  {
    id: "result-history",
    label: "Historial de resultados",
    description: "Abre los resultados recientes y la recuperación para pegar el último.",
    shortcut: "Alt+Shift+Z",
  },
  {
    id: "cancel-recording",
    label: "Cancelar grabación",
    description: "Cancela una captura activa.",
    shortcut: "Escape",
  },
] as const;

const PLANNED_BINDINGS = [
  {
    id: "quick-chat",
    label: "Asistente rápido",
    description: "Acción reservada para el asistente.",
    shortcut: "Alt+Shift+C",
  },
  {
    id: "assistant-mode",
    label: "Modo asistente",
    description: "Acción reservada para dictado asistido.",
    shortcut: "Sin configurar",
  },
  {
    id: "press-enter",
    label: "Enviar después de pegar",
    description: "Preferencia reservada para enviar después de entregar.",
    shortcut: "Sin configurar",
  },
] as const;

function BindingRow({ binding, onChange, onApply, onCancel, captureTarget, available }: {
  binding: HotkeyBinding;
  onChange: () => void;
  onApply: () => void;
  onCancel: () => void;
  captureTarget?: string;
  available: boolean;
}) {
  const changed = Boolean(binding.candidate && binding.candidate !== binding.shortcut);
  const capturing = captureTarget === binding.id || binding.state === "capturing";
  const previewing = binding.state === "previewing";
  const applying = binding.state === "applying";
  const unavailable = Boolean(binding.preview && !binding.preview.canApply);
  const blockedMessage = unavailable && binding.preview ? hotkeyPreviewMessage(binding.preview) : undefined;
  const isConflict = unavailable && /conflict|registered|ocupad|already/i.test(binding.preview?.reason ?? "");
  const persisted = binding.applyResult?.preferencePersisted === true;

  return (
    <div className="settings-hotkey-row" data-hotkey-id={binding.id} aria-busy={applying || undefined}>
      <div className="settings-hotkey-copy">
        <strong>{binding.label}</strong>
        {!available ? (
          <span data-tone="warning" role="status">Bloqueado: el host de escritorio no está disponible.</span>
        ) : null}
        <span>{binding.description}</span>
        {persisted ? (
          <span className="settings-hotkey-provenance" aria-label="Procedencia: configuración local. Alcance: esta computadora.">
            Configuración local · Esta computadora
          </span>
        ) : null}
        {changed ? (
          <span className="settings-hotkey-candidate" aria-live="polite">
            Candidata pendiente: <kbd>{binding.candidate}</kbd>
          </span>
        ) : null}
        {capturing ? <span aria-live="polite">Captura administrada por la aplicación host. Presioná la combinación…</span> : null}
        {previewing ? <span aria-live="polite">Validando disponibilidad…</span> : null}
        {binding.preview && !previewing ? (
          <span
            data-tone={binding.preview.canApply ? "success" : "warning"}
            data-conflict={isConflict || undefined}
            role={binding.preview.canApply ? "status" : "alert"}
            aria-live="polite"
          >
            {binding.preview.canApply
              ? hotkeyPreviewMessage(binding.preview)
              : `${isConflict ? "Conflicto" : "Bloqueado"}: ${blockedMessage}`}
          </span>
        ) : null}
        {binding.error ? <span data-tone="danger" role="alert">{binding.error}</span> : null}
        {binding.applyResult?.persistenceError ? (
          <span data-tone="warning" role="alert" aria-live="polite">
            Aplicado en la aplicación, pero no pudimos guardar la preferencia.
          </span>
        ) : null}
      </div>
      <div className="settings-hotkey-value" aria-label={`${binding.label}: ${binding.candidate ?? binding.shortcut}`}>
        <kbd>{binding.candidate ?? binding.shortcut}</kbd>
        <button
          type="button"
          className="settings-editor-button settings-editor-button-secondary"
          onClick={onChange}
          disabled={!available || capturing || applying}
          aria-label={`Cambiar ${binding.label}`}
        >
          {capturing ? "Esperando combinación…" : "Cambiar"}
        </button>
        {changed ? (
          <span className="settings-hotkey-row-actions">
            <button
              type="button"
              className="settings-editor-button settings-editor-button-primary"
              onClick={onApply}
              disabled={!available || applying || previewing || unavailable}
              aria-label={`Aplicar candidata para ${binding.label}`}
            >
              {applying ? "Guardando…" : "Aplicar"}
            </button>
            <button
              type="button"
              className="settings-editor-button settings-editor-button-secondary"
              onClick={onCancel}
              disabled={applying}
            >
              Cancelar
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function hotkeyPersistenceState(controller: ReturnType<typeof useHotkeysController>): SettingsPersistenceState {
  if (controller.loading) return { status: "loading", target: "hotkeys" };
  const saving = controller.bindings.find((binding) => binding.state === "applying");
  if (saving) return { status: "saving", target: saving.label, scope: "device" };
  const errored = controller.bindings.find((binding) => binding.error || binding.applyResult?.persistenceError);
  if (errored) {
    const applyResult = errored.applyResult;
    return {
      status: "error",
      message: errored.error ?? applyResult?.persistenceError ?? "No pudimos guardar el atajo.",
      rolledBack: Boolean(applyResult && "rolledBack" in applyResult && applyResult.rolledBack),
    };
  }
  const saved = controller.bindings.find((binding) => binding.applyResult?.preferencePersisted);
  if (saved) return { status: "saved", target: saved.label, scope: "device" };
  const dirtyCount = controller.bindings.filter((binding) => Boolean(binding.candidate && binding.candidate !== binding.shortcut)).length;
  return dirtyCount ? { status: "dirty", count: dirtyCount } : { status: "idle" };
}

export function HotkeySettings({ tauriRuntime, onDirtyChange, onNavigate }: HotkeySettingsProps) {
  const controller = useHotkeysController(tauriRuntime);
  const persistence = hotkeyPersistenceState(controller);

  useEffect(() => {
    onDirtyChange?.(controller.dirty);
  }, [controller.dirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);
  return (
    <>
      <SettingsGroup
        title="Combinaciones de teclado"
        description="Cambiá los atajos editables; la aplicación valida cada combinación antes de aplicarla."
      >
        <SettingNotice persistence={persistence} />
        <div className="settings-hotkey-list" id="settings-hotkeys-list" aria-label="Lista de atajos">
          {controller.loading ? (
            <div className="settings-hotkey-row" aria-live="polite"><span>Cargando atajos…</span></div>
          ) : null}
          {controller.bindings.map((binding) => (
            <BindingRow
              key={binding.id}
              binding={binding}
              available={tauriRuntime}
              captureTarget={controller.captureTarget}
              onChange={() => void controller.startCapture(binding.id)}
              onApply={() => void controller.apply(binding.id)}
              onCancel={() => controller.cancel(binding.id)}
            />
          ))}
          {FIXED_BINDINGS.map((binding) => (
            <div className="settings-hotkey-row" key={binding.id} data-hotkey-id={binding.id}>
              <div className="settings-hotkey-copy"><strong>{binding.label}</strong><span>{binding.description}</span></div>
              <div className="settings-hotkey-value"><kbd>{binding.shortcut}</kbd><small>Fijo</small></div>
            </div>
          ))}
          {PLANNED_BINDINGS.map((binding) => (
            <div className="settings-hotkey-row" key={binding.id} data-hotkey-id={binding.id}>
              <div className="settings-hotkey-copy"><strong>{binding.label}</strong><span>{binding.description}</span></div>
              <div className="settings-hotkey-value"><kbd>{binding.shortcut}</kbd><small>Próximamente</small></div>
            </div>
          ))}
        </div>
        <p className="settings-section-relation">
          ¿Querés revisar la acción asociada?{" "}
          <button
            type="button"
            className="settings-inline-link"
            aria-controls="settings-actions-list"
            onClick={() => onNavigate?.("actions", "settings-actions-list")}
          >
            Ver acciones de texto
          </button>
        </p>
      </SettingsGroup>
      {!tauriRuntime ? (
        <SettingNotice tone="warning" title="Abrí Ajustes desde la aplicación">
          La captura y el guardado de atajos requieren el host de escritorio.
        </SettingNotice>
      ) : null}
    </>
  );
}
