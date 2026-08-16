import { SettingNotice } from "../shared/SettingNotice";
import { SettingRow } from "../shared/SettingRow";
import { SettingsGroup } from "../shared/SettingsGroup";
import {
  maxAutoStopSilenceMs,
  minAutoStopSilenceMs,
  type DeliveryMode,
  type UserPreferences,
} from "../user-preferences-control";
import type { DictationSettingsProps, SettingAvailability, SettingProvenance, SettingsNavigationHandler } from "../section-contracts";
import {
  summarizeDictationExperimentState,
  useDictationController,
} from "../controllers/use-dictation-controller";

const preferenceSavingStates = new Set(["loading", "saving"]);
const preferenceProvenance = (effect: SettingProvenance["effect"]): SettingProvenance => ({
  source: "local",
  scope: "device",
  effect,
  detail: "Guardado por la aplicación.",
});

type PreferenceKey =
  | "reviewBeforeDelivery"
  | "pressEnterAfterPaste"
  | "pasteWithoutFocusChange"
  | "followFocusUntilDelivery"
  | "autoStopOnSilenceEnabled"
  | "muteOutputDuringRecording"
  | "dictationSoundCuesEnabled"
  | "enhanceLowVolumeEnabled";


function PreferenceSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className="settings-toggle"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
    >
      <span className="settings-toggle-status">{checked ? "Activado" : "Desactivado"}</span>
    </button>
  );
}

function PreferenceControl({
  label,
  description,
  checked,
  disabled,
  onChange,
  provenance,
  availability,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  provenance: SettingProvenance;
  availability: SettingAvailability;
}) {
  return (
    <SettingRow
      label={label}
      description={description}
      provenance={provenance}
      availability={availability}
    >
      <PreferenceSwitch label={label} checked={checked} disabled={disabled} onChange={onChange} />
    </SettingRow>
  );
}

function DeliverySelect({
  value,
  disabled,
  onChange,
}: {
  value: DeliveryMode;
  disabled: boolean;
  onChange: (value: DeliveryMode) => void;
}) {
  return (
    <select
      className="settings-preference-select"
      aria-label="Modo de entrega"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as DeliveryMode)}
    >
      <option value="direct">Entrada directa</option>
      <option value="clipboardPaste">Pegado rápido</option>
    </select>
  );
}
function NavigationRelation({
  label,
  onNavigate,
  sectionId,
  targetId,
}: {
  label: string;
  onNavigate?: SettingsNavigationHandler;
  sectionId: "advanced" | "hotkeys";
  targetId: string;
}) {
  if (!onNavigate) return null;
  return (
    <button
      type="button"
      className="settings-inline-link"
      aria-controls={targetId}
      onClick={() => onNavigate(sectionId, targetId)}
    >
      {label}
    </button>
  );
}


export function DictationSettings({ tauriRuntime, preferences, onNavigate }: DictationSettingsProps) {
  const dictation = useDictationController(tauriRuntime);
  const current = preferences.preferences;
  const saving = preferenceSavingStates.has(preferences.state.status);
  const disabled = !tauriRuntime || saving;
  const availability: SettingAvailability = tauriRuntime
    ? { state: "available" }
    : { state: "disabled", reason: "Tauri no está disponible en esta ventana." };
  const activeMode = dictation.catalog.find((mode) => mode.mode === current.dictationMode);
  const activeOverride = dictation.experiment.active;
  const laboratoryMessage = dictation.laboratoryState === "error"
    ? dictation.laboratoryError
    : dictation.laboratoryState === "opened"
      ? "Dictation Laboratory se abrió en una ventana separada."
      : activeOverride
        ? summarizeDictationExperimentState(dictation.experiment)
        : "Los overrides temporales sólo afectan una ejecución y no cambian el modo global guardado.";
  const laboratoryTone = dictation.laboratoryState === "error"
    ? "danger"
    : activeOverride
      ? "warning"
      : dictation.laboratoryState === "opened"
        ? "success"
        : "info";

  const update = async (patch: Partial<UserPreferences>) => {
    await preferences.update(patch);
  };

  const toggle = (key: PreferenceKey) => {
    void update({ [key]: !current[key] } as Partial<UserPreferences>);
  };

  return (
    <>
      <SettingNotice title="Preferencias del equipo" persistence={preferences.state}>
        Estos valores se guardan en esta computadora y se aplican en el próximo dictado.
        {!tauriRuntime ? " No disponible: Tauri no está disponible en esta ventana." : null}
      </SettingNotice>
      <SettingsGroup
        id="settings-dictation-mode"
        title="Modo"
        description="Controla la receta que usa cada dictado. No cambia los overrides temporales de Laboratory."
      >
        <div className="settings-dictation-recipe-list" role="radiogroup" aria-label="Modo de dictado">
          {dictation.catalog.map((mode) => {
            const selected = current.dictationMode === mode.mode;
            return (
              <button
                key={mode.mode}
                type="button"
                className="settings-dictation-recipe-row"
                role="radio"
                aria-checked={selected}
                aria-label={`${mode.label}: ${mode.summary}`}
                data-mode={mode.mode}
                data-selected={selected}
                disabled={disabled}
                onClick={() => void update({ dictationMode: mode.mode })}
              >
                <span className="settings-dictation-recipe-marker" aria-hidden="true" />
                <span>
                  <strong>{mode.label}</strong>
                  <small>{mode.summary}</small>
                </span>
                <span className="settings-panel-count">
                  {mode.mode === "profile" ? "Perfil" : mode.mode === "fast" ? "Sin limpieza" : mode.mode === "safeCleanup" ? "Limpieza" : "Detallado"}
                </span>
              </button>
            );
          })}
        </div>
        <dl className="settings-dictation-recipe-details" aria-label="Resumen del modo efectivo">
          <div><dt>Valor efectivo</dt><dd>{activeMode?.label ?? "Según mi perfil"}</dd></div>
          <div><dt>Procedencia</dt><dd>Configuración local · Esta computadora</dd></div>
          <div><dt>Aplicación</dt><dd>Próximo dictado</dd></div>
        </dl>
        <SettingRow
          label="Dictation Laboratory"
          description="Abre overrides temporales para probar una receta. No modifica este modo global guardado."
          availability={availability}
          relation={<NavigationRelation label="Ver Laboratory" onNavigate={onNavigate} sectionId="advanced" targetId="settings-advanced-diagnostics" />}
        >
          <button
            type="button"
            className="settings-editor-button settings-editor-button-secondary"
            disabled={!tauriRuntime || dictation.laboratoryState === "opening"}
            onClick={() => void dictation.openLaboratory()}
          >
            {dictation.laboratoryState === "opening" ? "Abriendo…" : "Abrir Laboratory"}
          </button>
        </SettingRow>
        <SettingNotice
          tone={laboratoryTone}
          title={activeOverride ? "Laboratory está activo" : "Laboratory"}
        >
          {laboratoryMessage}
          {activeOverride ? " El override reemplaza temporalmente el modo global hasta que finalice su alcance." : null}
        </SettingNotice>
      </SettingsGroup>

      <SettingsGroup
        id="settings-dictation-listening"
        title="Escucha"
        description="Controla la entrada y el autocierre del dictado. No cambia el micrófono elegido en Windows."
      >
        <SettingRow label="Micrófono" description="Se usa el dispositivo de entrada configurado en Windows.">
          <span className="settings-panel-count">Configuración del sistema</span>
        </SettingRow>
        <PreferenceControl
          label="Mejorar grabaciones con volumen bajo"
          description="Normaliza el audio capturado cuando la voz llega muy baja. No cambia el volumen maestro."
          checked={current.enhanceLowVolumeEnabled}
          disabled={disabled}
          onChange={() => toggle("enhanceLowVolumeEnabled")}
          provenance={preferenceProvenance("next-dictation")}
          availability={availability}
        />
        <PreferenceControl
          label="Detener después de un silencio"
          description="Detiene el dictado después del tiempo elegido. Siempre podés detenerlo manualmente."
          checked={current.autoStopOnSilenceEnabled}
          disabled={disabled}
          onChange={() => toggle("autoStopOnSilenceEnabled")}
          provenance={preferenceProvenance("next-dictation")}
          availability={availability}
        />
        <SettingRow
          label="Duración del silencio"
          description={`Tiempo sin voz antes del autocierre: ${current.autoStopSilenceMs} ms. Se usa en el próximo dictado.`}
          provenance={preferenceProvenance("next-dictation")}
          availability={availability}
        >
          <input
            className="settings-preference-select"
            type="number"
            min={minAutoStopSilenceMs}
            max={maxAutoStopSilenceMs}
            step={100}
            value={current.autoStopSilenceMs}
            disabled={disabled}
            aria-label="Duración del silencio en milisegundos"
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) void update({ autoStopSilenceMs: value });
            }}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        id="settings-dictation-delivery"
        title="Entrega"
        description="Controla cómo se entrega el texto y cómo se conserva el destino. No ejecuta una entrega desde esta pantalla."
      >
        <SettingRow
          label="Modo de entrega"
          description={current.deliveryMode === "clipboardPaste"
            ? "Pega de una vez y preserva el portapapeles. Se usa en el próximo dictado."
            : "Inserta sin usar el portapapeles. Se usa en el próximo dictado y puede tardar más en algunos editores."}
          provenance={preferenceProvenance("next-dictation")}
          availability={availability}
        >
          <DeliverySelect value={current.deliveryMode} disabled={disabled} onChange={(deliveryMode) => void update({ deliveryMode })} />
        </SettingRow>
        <PreferenceControl
          label="Revisar antes de entregar"
          description="Abre una revisión antes de insertar el resultado cuando corresponde."
          checked={current.reviewBeforeDelivery}
          disabled={disabled}
          onChange={() => toggle("reviewBeforeDelivery")}
          provenance={preferenceProvenance("next-dictation")}
          availability={availability}
        />
        <PreferenceControl
          label="Seguir el foco hasta entregar"
          description="Mantiene como destino el campo activo hasta que termina la entrega."
          checked={current.followFocusUntilDelivery}
          disabled={disabled}
          onChange={() => toggle("followFocusUntilDelivery")}
          provenance={preferenceProvenance("next-dictation")}
          availability={availability}
        />
        <PreferenceControl
          label="Pegar sin cambiar de ventana"
          description="Entrega sólo al input que seguía activo; si el foco no es seguro, no pega."
          checked={current.pasteWithoutFocusChange}
          disabled={disabled}
          onChange={() => toggle("pasteWithoutFocusChange")}
          provenance={preferenceProvenance("next-dictation")}
          availability={availability}
        />
        <PreferenceControl
          label="Presionar Enter después de pegar"
          description="Envía Enter después del pegado cuando el método de entrega lo permite."
          checked={current.pressEnterAfterPaste}
          disabled={disabled}
          onChange={() => toggle("pressEnterAfterPaste")}
          provenance={preferenceProvenance("next-dictation")}
          availability={availability}
        />
      </SettingsGroup>

      <SettingsGroup
        id="settings-dictation-feedback"
        title="Feedback"
        description="Controla los avisos de dictado y el silenciamiento temporal. No cambia el volumen maestro de Windows."
      >
        <PreferenceControl
          label="Silenciar salida al grabar"
          description="Reduce el audio de otras aplicaciones durante la grabación y lo restaura al terminar."
          checked={current.muteOutputDuringRecording}
          disabled={disabled}
          onChange={() => toggle("muteOutputDuringRecording")}
          provenance={preferenceProvenance("next-dictation")}
          availability={availability}
        />
        <PreferenceControl
          label="Sonidos de dictado"
          description="Reproduce avisos breves al iniciar, detener, completar o necesitar atención."
          checked={current.dictationSoundCuesEnabled}
          disabled={disabled}
          onChange={() => toggle("dictationSoundCuesEnabled")}
          provenance={preferenceProvenance("next-dictation")}
          availability={availability}
        />
      </SettingsGroup>
    </>
  );
}
