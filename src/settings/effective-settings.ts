import {
  settingEffectLabels,
  settingScopeLabels,
  settingSourceLabels,
  type EffectiveSettingItem,
  type EffectiveSettingsSnapshot,
} from "./section-contracts";

export type EffectiveSettingsSnapshotInput = {
  account?: readonly EffectiveSettingItem[];
  dictation?: readonly EffectiveSettingItem[];
  hotkeys?: readonly EffectiveSettingItem[];
  application?: readonly EffectiveSettingItem[];
};

const sensitiveDiagnosticPattern = /(?:\b(?:token|secret|payload|session(?:[_ -]?id|[_ -]?path)?|state[_ -]?path|backend[_ -]?base[_ -]?url|install[_ -]?id|device[_ -]?id|user[_ -]?id|provider|cloud|audio|transcript|gold|final(?:[_ -]?text)?)\b|[a-z]:[\\/]|\/users\/|\/home\/|https?:\/\/|(?:^|[\s:=])(?:sk|pk|rk)-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.)/i;

function redactItem(item: EffectiveSettingItem): EffectiveSettingItem {
  const value = sensitiveDiagnosticPattern.test(`${item.label} ${item.value}`)
    ? "[redactado]"
    : item.value;
  return { ...item, value };
}

export function createEffectiveSettingsSnapshot(
  input: EffectiveSettingsSnapshotInput,
): EffectiveSettingsSnapshot {
  return {
    account: (input.account ?? []).map(redactItem),
    dictation: (input.dictation ?? []).map(redactItem),
    hotkeys: (input.hotkeys ?? []).map(redactItem),
    application: (input.application ?? []).map(redactItem),
  };
}

const effectiveStateLabels: Record<EffectiveSettingItem["state"], string> = {
  configured: "Configurado",
  "not-configured": "No configurado",
  unavailable: "No disponible",
  disabled: "Deshabilitado",
  managed: "Administrado",
};

export function formatEffectiveSettingsDiagnostic(snapshot: EffectiveSettingsSnapshot): string {
  const sections: readonly [string, readonly EffectiveSettingItem[]][] = [
    ["Cuenta", snapshot.account],
    ["Dictado", snapshot.dictation],
    ["Atajos", snapshot.hotkeys],
    ["Aplicación", snapshot.application],
  ];
  return sections.map(([section, items]) => {
    const lines = items.length
      ? items.map((item) => {
          const provenance = item.provenance ? [
            settingSourceLabels[item.provenance.source],
            item.provenance.scope ? settingScopeLabels[item.provenance.scope] : undefined,
            item.provenance.effect ? settingEffectLabels[item.provenance.effect] : undefined,
          ].filter(Boolean).join(" · ") : "Origen no disponible";
          return `${item.label}: ${item.value} (${effectiveStateLabels[item.state]}; ${provenance})`;
        })
      : ["No disponible"];
    return `${section}\n${lines.map((line) => `- ${line}`).join("\n")}`;
  }).join("\n\n");
}
