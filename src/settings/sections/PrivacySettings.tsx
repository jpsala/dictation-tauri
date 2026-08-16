import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { PrivacySettingsProps } from "../section-contracts";
import { formatHotkeyEditReason } from "../hotkey-edit-copy";
import { SettingNotice } from "../shared/SettingNotice";
import { SettingRow } from "../shared/SettingRow";
import { SettingsGroup } from "../shared/SettingsGroup";

type Notice = { tone: "idle" | "success" | "warning" | "danger"; message: string };

export function PrivacySettings({ tauriRuntime, onNavigate }: PrivacySettingsProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>({ tone: "idle", message: "" });

  async function clearLocalHistory() {
    if (!tauriRuntime || busy) return;
    setBusy(true);
    try {
      await invoke("clear_result_history");
      setConfirming(false);
      setNotice({ tone: "success", message: "El historial local se borró." });
    } catch (error) {
      setNotice({ tone: "danger", message: `No pudimos borrar el historial: ${formatHotkeyEditReason(error)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsGroup id="settings-privacy-history" title="Datos locales" description="Administrá los datos que Dictation conserva en esta computadora. El acceso de cuenta se gestiona por separado.">
        <SettingRow
          label="Historial de resultados"
          description="Se guarda sólo en esta computadora y su contenido no aparece en Ajustes."
        >
          {!confirming ? (
            <button type="button" className="settings-editor-button settings-editor-button-secondary" disabled={!tauriRuntime || busy} onClick={() => setConfirming(true)}>Borrar historial</button>
          ) : (
            <span className="settings-inline-confirmation" role="group" aria-label="Confirmar borrado del historial">
              <strong>¿Borrar el historial local?</strong>
              <button type="button" className="settings-editor-button settings-editor-button-danger" disabled={busy} onClick={() => void clearLocalHistory()}>{busy ? "Borrando…" : "Sí, borrar"}</button>
              <button type="button" className="settings-editor-button settings-editor-button-secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button>
            </span>
          )}
        </SettingRow>
        <SettingRow
          label="Diagnóstico seguro"
          description="Muestra preferencias y estado efectivo, nunca el contenido del historial."
        >
          {onNavigate ? (
            <button
              type="button"
              className="settings-editor-button settings-editor-button-secondary"
              aria-controls="settings-advanced-diagnostics"
              onClick={() => onNavigate("advanced", "settings-advanced-diagnostics")}
            >
              Ver diagnóstico
            </button>
          ) : <span className="settings-readonly-note">No disponible</span>}
        </SettingRow>
        {notice.message ? <SettingNotice tone={notice.tone === "idle" ? "info" : notice.tone}>{notice.message}</SettingNotice> : null}
      </SettingsGroup>
    </>
  );
}
