import { describe, expect, it } from "vitest";
import {
  applyCloudSelectionPresetDefaults,
  extractCloudSelectionPresetDefaults,
} from "../../src/settings/preset-store-control";
import {
  getSelectionTransformPreset,
  hydrateSelectionTransformPresetStore,
} from "../../src/selection-transform";
import type { FixvoxCloudStatus } from "../../src/settings/fixvox-cloud-control";

function cloudStatusWithSelectionPresets(): FixvoxCloudStatus {
  return {
    backendBaseUrl: "https://auth-fixvox.jpsala.dev",
    statePath: "fixvox-device-state.json · host app data",
    installIdPresent: true,
    deviceRegistered: true,
    lastRegisterOk: true,
    capabilities: {
      canUseManagedTranscription: true,
      canSeeAdvancedSettings: true,
      canUseDebugTools: false,
    },
    policySnapshot: {
      capabilities: {
        canUseManagedTranscription: true,
        canSeeAdvancedSettings: true,
        canUseDebugTools: false,
      },
      runtimePolicy: {
        defaults: {
          userSettingsDefaults: {
            selectionPresets: {
              schemaVersion: 1,
              source: "fixvox-cloud-admin",
              items: [
                {
                  id: "corregir-texto",
                  label: "Corregir desde Cloud",
                  promptId: "preset.corregir-texto",
                  pickerKey: "K",
                  hotkey: "Alt+T, K",
                  provider: "groq",
                  model: "llama-3.3-70b-versatile",
                  enabled: true,
                  confirm: true,
                  promptContent: "Cloud managed correction prompt. Return only corrected text.",
                },
                { id: "custom-cloud-only", label: "Cloud only", promptId: "preset.custom-cloud-only" },
              ],
            },
          },
        },
      },
      fetchedAt: "2026-07-02T00:00:00Z",
      trust: "fresh",
      stale: false,
    },
    redacted: true,
  };
}

describe("preset-store-control", () => {
  it("extracts selection preset defaults from the redacted cloud policy snapshot", () => {
    const defaults = extractCloudSelectionPresetDefaults(cloudStatusWithSelectionPresets());

    expect(defaults).toHaveLength(2);
    expect(defaults[0]).toMatchObject({
      id: "corregir-texto",
      label: "Corregir desde Cloud",
      promptId: "preset.corregir-texto",
      pickerKey: "K",
      hotkey: "Alt+T, K",
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      enabled: true,
      confirm: true,
      promptContent: "Cloud managed correction prompt. Return only corrected text.",
    });
  });

  it("imports cloud defaults only into known starter presets", () => {
    hydrateSelectionTransformPresetStore({ schemaVersion: 1, starterCustomizations: {}, customPresets: {} });

    const applied = applyCloudSelectionPresetDefaults(extractCloudSelectionPresetDefaults(cloudStatusWithSelectionPresets()));
    const preset = getSelectionTransformPreset("corregir-texto");

    expect(applied).toBe(1);
    expect(preset).toMatchObject({
      name: "Corregir desde Cloud",
      pickerKey: "K",
      hotkey: "Alt+T, K",
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      enabled: true,
      confirm: true,
      body: "Cloud managed correction prompt. Return only corrected text.",
    });
    expect(() => getSelectionTransformPreset("custom-cloud-only")).toThrow("Unknown selection transform preset");
  });
});
