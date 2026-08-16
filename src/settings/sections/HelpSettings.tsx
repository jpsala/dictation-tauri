import type { HelpSettingsProps } from "../section-contracts";
import { deriveFixvoxCloudHealth } from "../fixvox-cloud-control";
import { SettingRow } from "../shared/SettingRow";
import { SettingsGroup } from "../shared/SettingsGroup";

export function HelpSettings({ onNavigate, cloudStatus }: HelpSettingsProps) {
  const health = deriveFixvoxCloudHealth(cloudStatus);
  return (
    <>
      <SettingsGroup id="settings-help-status" title="Estado y diagnóstico" description="Revisá el estado seguro de esta computadora sin exponer dictados, rutas, identificadores ni detalles del proveedor.">
        <SettingRow label="Estado de esta computadora" description={health.detail}>
          <span className="settings-hotkey-value" data-health={health.tone}><kbd>{health.badge}</kbd><small>estado seguro</small></span>
        </SettingRow>
        <SettingRow
          label="Diagnóstico seguro"
          description="Para revisar preferencias locales y el estado efectivo sin abrir datos privados."
        >
          {onNavigate ? (
            <button
              type="button"
              className="settings-editor-button settings-editor-button-secondary"
              aria-controls="settings-advanced-diagnostics"
              onClick={() => onNavigate("advanced", "settings-advanced-diagnostics")}
            >
              Abrir diagnóstico
            </button>
          ) : <span className="settings-readonly-note">No disponible</span>}
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
