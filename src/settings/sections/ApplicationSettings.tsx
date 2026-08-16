import { useEffect, useState } from "react";
import {
  classicDockSkin,
  compactDockSkin,
  getDockSkin,
  wisprFlowDockSkin,
  type DockSkinId,
} from "../../voice-dock/skins";
import type { ApplicationSettingsProps, SettingAvailability, SettingProvenance, SettingsNavigationHandler } from "../section-contracts";
import { getStartupLaunchConfig, setStartupLaunchEnabled, summarizeStartupLaunchConfig, type StartupLaunchConfig } from "../startup-launch-control";
import { SettingNotice } from "../shared/SettingNotice";
import { SettingRow } from "../shared/SettingRow";
import { SettingsGroup } from "../shared/SettingsGroup";

const dockSkins = [compactDockSkin, classicDockSkin, wisprFlowDockSkin] as const;
const localPreferenceProvenance = (effect: SettingProvenance["effect"]): SettingProvenance => ({
  source: "local",
  scope: "device",
  effect,
  detail: "Guardado por la aplicación.",
});

function NavigationRelation({ onNavigate }: { onNavigate?: SettingsNavigationHandler }) {
  if (!onNavigate) return null;
  return (
    <button
      type="button"
      className="settings-inline-link"
      aria-controls="settings-hotkeys-list"
      onClick={() => onNavigate("hotkeys", "settings-hotkeys-list")}
    >
      Configurar atajos
    </button>
  );
}

function DockPreview({ skinId }: { skinId: DockSkinId }) {
  const skin = getDockSkin(skinId);
  return (
    <div className="settings-dock-preview" aria-label={`Vista previa local: ${skin.label}`}>
      <div className="settings-dock-preview-window" data-skin={skin.id}>
        <span className="settings-dock-preview-label">Dictado</span>
        <span className="settings-dock-preview-dots" aria-hidden="true">
          {skin.dotIndexes.map((dot, index) => (
            <i key={`${dot}-${index}`} data-dot={dot} />
          ))}
        </span>
      </div>
      <span className="settings-dock-preview-meta">{skin.label} · {skin.width} × {skin.height} px</span>
    </div>
  );
}

export function ApplicationSettings({ tauriRuntime, preferences, onNavigate }: ApplicationSettingsProps) {
  const [startupConfig, setStartupConfig] = useState<StartupLaunchConfig | undefined>();
  const [startupState, setStartupState] = useState<"idle" | "loading" | "saving" | "error">(tauriRuntime ? "loading" : "idle");
  const [previewSkinId, setPreviewSkinId] = useState<DockSkinId>(preferences.preferences.dockSkin);

  useEffect(() => {
    setPreviewSkinId(preferences.preferences.dockSkin);
  }, [preferences.preferences.dockSkin]);

  useEffect(() => {
    let disposed = false;
    if (!tauriRuntime) {
      setStartupState("idle");
      return () => { disposed = true; };
    }
    setStartupState("loading");
    void getStartupLaunchConfig()
      .then((config) => {
        if (!disposed) setStartupConfig(config);
      })
      .catch(() => {
        if (!disposed) setStartupState("error");
      })
      .finally(() => {
        if (!disposed) setStartupState((state) => state === "error" ? state : "idle");
      });
    return () => { disposed = true; };
  }, [tauriRuntime]);

  async function toggleStartup() {
    if (!tauriRuntime || startupState === "saving" || !startupConfig?.supported) return;
    setStartupState("saving");
    try {
      const next = await setStartupLaunchEnabled(!startupConfig.enabled);
      setStartupConfig(next);
      setStartupState("idle");
    } catch {
      setStartupState("error");
    }
  }

  async function updatePreferences(patch: Parameters<typeof preferences.update>[0]) {
    await preferences.update(patch);
  }

  const preferenceBusy = !tauriRuntime || preferences.state.status === "loading" || preferences.state.status === "saving";
  const startupBusy = startupState === "loading" || startupState === "saving";
  const preferenceAvailability: SettingAvailability = tauriRuntime
    ? { state: "available" }
    : { state: "disabled", reason: "Tauri no está disponible en esta ventana." };
  const startupAvailability: SettingAvailability = !tauriRuntime
    ? { state: "disabled", reason: "Tauri no está disponible en esta ventana." }
    : startupConfig?.supported === false
      ? { state: "disabled", reason: "El host no admite inicio automático en esta plataforma." }
      : { state: "available" };

  return (
    <>
      <SettingNotice title="Preferencias del equipo" persistence={preferences.state}>
        La apariencia y visibilidad del dock se guardan en esta computadora. La apariencia cambia de inmediato; la visibilidad al iniciar se lee al reiniciar. Estos ajustes no cambian tus atajos ni el estado de tu cuenta.
      </SettingNotice>
      <SettingsGroup id="settings-application-startup" title="Inicio de la aplicación" description="Controla el registro de inicio de Windows, separado de las preferencias del dock.">
        <SettingRow
          label="Abrir Dictation al iniciar Windows"
          description={summarizeStartupLaunchConfig(startupConfig)}
          availability={startupAvailability}
        >
          <input type="checkbox" checked={startupConfig?.enabled === true} disabled={!tauriRuntime || startupBusy || !startupConfig?.supported} onChange={() => void toggleStartup()} aria-label="Abrir Dictation al iniciar Windows" />
        </SettingRow>
        {startupState === "error" ? <SettingNotice tone="warning">No pudimos leer o guardar la configuración de inicio.</SettingNotice> : null}
      </SettingsGroup>
      <SettingsGroup id="settings-application-dock" title="Dock" description="Controla la visibilidad y la apariencia local del dock. No monta ni modifica el dock desde esta vista previa.">
        <SettingRow
          label="Mostrar el dock al iniciar"
          description="Muestra el dock cuando la aplicación inicia. La aplicación vuelve a leer este valor después de reiniciar."
          provenance={localPreferenceProvenance("restart")}
          availability={preferenceAvailability}
          relation={<NavigationRelation onNavigate={onNavigate} />}
        >
          <input type="checkbox" checked={preferences.preferences.showDockOnStartup} disabled={preferenceBusy} onChange={() => void updatePreferences({ showDockOnStartup: !preferences.preferences.showDockOnStartup })} aria-label="Mostrar el dock al iniciar" />
        </SettingRow>
        <SettingRow
          label="Apariencia del dock"
          description="Cambia la forma y densidad del dock activo en cuanto se guarda."
          provenance={localPreferenceProvenance("immediate")}
          availability={preferenceAvailability}
          layout="stacked"
        >
          <select value={preferences.preferences.dockSkin} disabled={preferenceBusy} onChange={(event) => void updatePreferences({ dockSkin: event.currentTarget.value as DockSkinId })} aria-label="Apariencia del dock">
            {dockSkins.map((skin) => <option key={skin.id} value={skin.id}>{skin.label}</option>)}
          </select>
        </SettingRow>
        <SettingRow
          label="Vista previa local"
          description="Probá una apariencia y densidad sin guardar preferencias, montar el dock ni cambiar el estado de la aplicación."
          availability={{ state: "available" }}
          layout="stacked"
        >
          <select value={previewSkinId} onChange={(event) => setPreviewSkinId(event.currentTarget.value as DockSkinId)} aria-label="Vista previa local del dock">
            {dockSkins.map((skin) => <option key={skin.id} value={skin.id}>{skin.label}</option>)}
          </select>
          <DockPreview skinId={previewSkinId} />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
