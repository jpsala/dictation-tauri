import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import {
  getTauriActionHotkeyConfig,
  type TauriGlobalHotkeyConfig,
} from "../../desktop-control/tauri-host-control";
import {
  deriveFixvoxCloudHealth,
  getFixvoxAuthSessionStatus,
  getFixvoxCloudStatus,
  resolveSettingsAccess,
  type FixvoxCloudStatus,
} from "../fixvox-cloud-control";
import { formatHotkeyEditReason } from "../hotkey-edit-copy";
import {
  createEffectiveSettingsSnapshot,
  formatEffectiveSettingsDiagnostic,
} from "../effective-settings";
import type {
  AdvancedSettingsProps,
  EffectiveSettingItem,
  EffectiveSettingState,
} from "../section-contracts";
import { SettingNotice } from "../shared/SettingNotice";
import { SettingRow } from "../shared/SettingRow";
import { SettingsGroup } from "../shared/SettingsGroup";

type Notice = { tone: "idle" | "success" | "warning" | "danger"; message: string };
type RegisteredHotkeys = {
  status: "available" | "unavailable";
  shortcuts: readonly string[];
};

const dictationModeLabels: Record<string, string> = {
  profile: "Según mi perfil",
  fast: "Rápido",
  safeCleanup: "Limpieza segura",
  complete: "Completo",
};

const effectiveStateLabels: Record<EffectiveSettingState, string> = {
  configured: "Configurado",
  "not-configured": "No configurado",
  unavailable: "No disponible",
  disabled: "Deshabilitado",
  managed: "Administrado",
};

function accountItem(cloudStatus: FixvoxCloudStatus | undefined): EffectiveSettingItem {
  if (!cloudStatus) {
    return { label: "Cuenta", value: "No disponible", state: "unavailable" };
  }
  if (cloudStatus.authPolicy?.accessMode === "anonymous") {
    return { label: "Cuenta", value: "No configurado", state: "not-configured" };
  }
  if (cloudStatus.authPolicy?.accessMode === "signed_in") {
    return { label: "Cuenta", value: "Conectada", state: "configured" };
  }
  return { label: "Cuenta", value: "No disponible", state: "unavailable" };
}

function hostItem(cloudStatus: FixvoxCloudStatus | undefined): EffectiveSettingItem {
  if (!cloudStatus) {
    return { label: "Estado de la aplicación", value: "No disponible", state: "unavailable" };
  }
  if (!cloudStatus.installIdPresent || !cloudStatus.deviceRegistered) {
    return { label: "Estado de la aplicación", value: "No configurado", state: "not-configured" };
  }
  if (cloudStatus.capabilities?.canUseManagedTranscription === false) {
    return { label: "Estado de la aplicación", value: "Deshabilitado", state: "disabled" };
  }
  if (!cloudStatus.lastRegisterOk) {
    return { label: "Estado de la aplicación", value: "No disponible", state: "unavailable" };
  }
  return { label: "Estado de la aplicación", value: "Listo", state: "configured" };
}

function localDictationItems(
  proven: boolean,
  preferences: AdvancedSettingsProps["preferences"]["preferences"],
): readonly EffectiveSettingItem[] {
  if (!proven) return [];
  const mode = dictationModeLabels[preferences.dictationMode];
  if (!mode) return [];
  return [{
    label: "Modo",
    value: mode,
    state: "configured",
    provenance: { source: "local", scope: "device", effect: "next-dictation" },
  }];
}

function hotkeyItem(registeredHotkeys: RegisteredHotkeys): EffectiveSettingItem {
  if (registeredHotkeys.status === "unavailable") {
    return { label: "Atajos registrados", value: "No disponible", state: "unavailable" };
  }
  if (!registeredHotkeys.shortcuts.length) {
    return { label: "Atajos registrados", value: "No configurado", state: "not-configured" };
  }
  return {
    label: "Atajos registrados",
    value: registeredHotkeys.shortcuts.join(" · "),
    state: "configured",
  };
}

function createSnapshot(
  preferences: AdvancedSettingsProps["preferences"],
  cloudStatus: FixvoxCloudStatus | undefined,
  registeredHotkeys: RegisteredHotkeys,
) {
  const preferencesProven = preferences.available;
  return createEffectiveSettingsSnapshot({
    account: [accountItem(cloudStatus)],
    dictation: localDictationItems(preferencesProven, preferences.preferences),
    hotkeys: [hotkeyItem(registeredHotkeys)],
    application: [hostItem(cloudStatus)],
  });
}

export function AdvancedSettings({
  tauriRuntime,
  cloudStatus: initialCloudStatus,
  preferences,
}: AdvancedSettingsProps) {
  const [cloudStatus, setCloudStatus] = useState<FixvoxCloudStatus | undefined>(initialCloudStatus);
  const [registeredHotkeys, setRegisteredHotkeys] = useState<RegisteredHotkeys>({
    status: "unavailable",
    shortcuts: [],
  });
  const [busy, setBusy] = useState<"status" | "admin" | undefined>();
  const [checkedAt, setCheckedAt] = useState<string>();
  const [notice, setNotice] = useState<Notice>({ tone: "idle", message: "" });

  useEffect(() => {
    let disposed = false;
    if (!tauriRuntime || initialCloudStatus) return () => { disposed = true; };
    void refreshStatus(false, () => disposed);
    return () => { disposed = true; };
  }, [initialCloudStatus, tauriRuntime]);

  useEffect(() => {
    if (!tauriRuntime) return;
    let disposed = false;
    void Promise.allSettled([
      invoke<TauriGlobalHotkeyConfig>("get_desktop_control_hotkey_config"),
      getTauriActionHotkeyConfig(),
    ]).then(([globalResult, actionsResult]) => {
      if (disposed) return;
      const global = globalResult.status === "fulfilled" ? globalResult.value : undefined;
      const actions = actionsResult.status === "fulfilled" ? actionsResult.value : undefined;
      const shortcuts = [
        typeof global?.shortcut === "string" && global.shortcut.trim() ? `Dictado: ${global.shortcut.trim()}` : undefined,
        typeof actions?.presetPicker === "string" && actions.presetPicker.trim() ? `Selector: ${actions.presetPicker.trim()}` : undefined,
        typeof actions?.pasteLastSafe === "string" && actions.pasteLastSafe.trim() ? `Pegar último: ${actions.pasteLastSafe.trim()}` : undefined,
        typeof actions?.stopSubmit === "string" && actions.stopSubmit.trim() ? `Detener y enviar: ${actions.stopSubmit.trim()}` : undefined,
      ].filter((shortcut): shortcut is string => Boolean(shortcut));
      setRegisteredHotkeys({
        status: global || actions ? "available" : "unavailable",
        shortcuts,
      });
    });
    return () => { disposed = true; };
  }, [tauriRuntime]);

  const health = deriveFixvoxCloudHealth(cloudStatus);
  const access = resolveSettingsAccess(cloudStatus);
  const snapshot = useMemo(
    () => createSnapshot(preferences, cloudStatus, registeredHotkeys),
    [cloudStatus, preferences, registeredHotkeys],
  );
  const diagnostic = formatEffectiveSettingsDiagnostic(snapshot);

  async function refreshStatus(manual: boolean, isDisposed: () => boolean = () => false) {
    if (!tauriRuntime || busy) return;
    if (manual) setBusy("status");
    try {
      const [status] = await Promise.all([getFixvoxCloudStatus(), getFixvoxAuthSessionStatus()]);
      if (isDisposed()) return;
      setCloudStatus(status);
      const checked = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      setCheckedAt(checked);
      if (manual) setNotice({ tone: deriveFixvoxCloudHealth(status).tone, message: `Diagnóstico actualizado a las ${checked}. ${deriveFixvoxCloudHealth(status).detail}` });
    } catch (error) {
      if (isDisposed()) return;
      if (manual) setNotice({ tone: "danger", message: `No pudimos volver a comprobar el diagnóstico: ${formatHotkeyEditReason(error)}` });
    } finally {
      if (manual && !isDisposed()) setBusy(undefined);
    }
  }

  async function openControlRoom() {
    if (!tauriRuntime || !isTauri() || !access.canOpenAdmin) {
      setNotice({ tone: "warning", message: "Tu cuenta no tiene acceso a Control Room." });
      return;
    }
    setBusy("admin");
    try {
      await invoke("show_admin_control_room");
      setNotice({ tone: "success", message: "Control Room se abrió en una ventana separada." });
    } catch (error) {
      setNotice({ tone: "danger", message: formatHotkeyEditReason(error) });
    } finally {
      setBusy(undefined);
    }
  }

  const sections: readonly [string, readonly EffectiveSettingItem[]][] = [
    ["Cuenta", snapshot.account],
    ["Dictado", snapshot.dictation],
    ["Atajos", snapshot.hotkeys],
    ["Aplicación", snapshot.application],
  ];

  return (
    <>
      <SettingsGroup
        id="settings-advanced-diagnostics"
        title="Estado efectivo del dictado"
        description="Sólo muestra preferencias locales comprobadas, atajos que la aplicación pudo informar y estado seguro. No incluye contenido privado, rutas ni datos de cuenta."
      >
        <div className="settings-effective-sections">
          {sections.map(([section, items]) => (
            <section className="settings-effective-section" key={section} aria-label={section}>
              <h3>{section}</h3>
              {items.length ? items.map((item) => (
                <SettingRow
                  key={item.label}
                  label={item.label}
                  provenance={item.provenance}
                  description={effectiveStateLabels[item.state]}
                >
                  <span className="settings-effective-value">{item.value}</span>
                </SettingRow>
              )) : <p className="settings-effective-empty">No disponible</p>}
            </section>
          ))}
        </div>
        <SettingRow label="Diagnóstico redactado" description="Texto seleccionable para leer o compartir manualmente. No se copia automáticamente." layout="stacked">
          <pre className="settings-effective-diagnostic" tabIndex={0} aria-label="Diagnóstico redactado seleccionable">{diagnostic}</pre>
        </SettingRow>
        <SettingRow label="Estado seguro" description={health.detail}>
          <span className="settings-hotkey-value" data-health={health.tone}><kbd>{health.badge}</kbd><small>redactado</small></span>
        </SettingRow>
        <SettingRow label="Diagnóstico local" description="Volvé a leer el estado guardado en esta computadora.">
          <span className="settings-status-check-control">
            <button type="button" className="settings-editor-button settings-editor-button-secondary" disabled={!tauriRuntime || Boolean(busy)} onClick={() => void refreshStatus(true)}>{busy === "status" ? "Comprobando…" : "Volver a comprobar"}</button>
            <small aria-live="polite">{checkedAt ? `Última comprobación: ${checkedAt}` : "Todavía no comprobado"}</small>
          </span>
        </SettingRow>
        {access.canOpenAdmin ? <SettingRow label="Control Room" description="Administración separada para personas autorizadas."><button type="button" className="settings-editor-button settings-editor-button-primary" disabled={!tauriRuntime || busy === "admin"} onClick={() => void openControlRoom()}>{busy === "admin" ? "Abriendo" : "Abrir Control Room"}</button></SettingRow> : null}
        {notice.message ? <SettingNotice tone={notice.tone === "idle" ? "info" : notice.tone}>{notice.message}</SettingNotice> : null}
      </SettingsGroup>
    </>
  );
}
