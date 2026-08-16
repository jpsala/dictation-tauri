import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsSurface } from "../../src/settings/SettingsSurface";
import { settingsRegistry, settingsSearchIndex } from "../../src/settings/settings-registry";
import { nativeHotkeyEditCandidates, nativeHotkeyEditContract } from "../../src/settings/hotkey-edit-contract";
import { PersonalVocabularySettings } from "../../src/personal-vocabulary/PersonalVocabularySettings";
import type { PersonalVocabularySnapshot } from "../../src/personal-vocabulary/types";
import type { FixvoxCloudStatus } from "../../src/settings/fixvox-cloud-control";
import { AdvancedSettings } from "../../src/settings/sections/AdvancedSettings";
import { HelpSettings } from "../../src/settings/sections/HelpSettings";
import { PrivacySettings } from "../../src/settings/sections/PrivacySettings";
import { defaultUserPreferences } from "../../src/settings/user-preferences-control";
import { ApplicationSettings } from "../../src/settings/sections/ApplicationSettings";
import { DictationSettings } from "../../src/settings/sections/DictationSettings";

const savedPreferences = {
  preferences: { ...defaultUserPreferences, dictationMode: "safeCleanup" as const },
  state: { status: "saved" as const, target: "preferencias", scope: "device" as const },
  available: true,
  refresh: async () => undefined,
  update: async () => true,
};

const deniedCloudStatus: FixvoxCloudStatus = {
  backendBaseUrl: "redacted",
  statePath: "redacted",
  installIdPresent: false,
  deviceRegistered: true,
  lastRegisterOk: true,
  capabilities: { canUseManagedTranscription: false, canSeeAdvancedSettings: false, canUseDebugTools: false },
  authPolicy: { accessMode: "anonymous", redacted: true },
  redacted: true,
};


const readyCloudStatus: FixvoxCloudStatus = {
  backendBaseUrl: "redacted",
  statePath: "redacted",
  installIdPresent: true,
  deviceRegistered: true,
  lastRegisterOk: true,
  authPolicy: {
    accessMode: "signed_in",
    policyTemplateId: "pro",
    capabilities: ["selection_transform", "custom_prompts", "managed_llm"],
    redacted: true,
  },
  redacted: true,
};

function renderSection(section: Parameters<typeof SettingsSurface>[0]["initialSection"]) {
  return renderToStaticMarkup(<SettingsSurface initialSection={section} initialCloudStatus={readyCloudStatus} />);
}

describe("SettingsSurface", () => {
  it("uses the registry order, grouping, labels, and exact search targets", () => {
    expect(settingsRegistry.map(({ id }) => id)).toEqual([
      "account", "dictation", "hotkeys", "actions", "vocabulary", "application", "privacy", "help", "advanced",
    ]);
    expect(settingsRegistry.filter(({ group }) => group === "primary").map(({ id }) => id)).toEqual([
      "account", "dictation", "hotkeys", "actions", "vocabulary", "application",
    ]);
    expect(settingsRegistry.filter(({ group }) => group === "utility").map(({ id }) => id)).toEqual([
      "privacy", "help", "advanced",
    ]);
    expect(settingsRegistry.find(({ id }) => id === "application")).toMatchObject({ label: "Aplicación" });
    expect(settingsRegistry.find(({ id }) => id === "actions")).toMatchObject({ label: "Acciones de texto" });
    expect(settingsRegistry.flatMap(({ search }) => search.map(({ targetId }) => targetId))).toEqual([
      "settings-account-access",
      "settings-dictation-mode",
      "settings-dictation-listening",
      "settings-dictation-delivery",
      "settings-dictation-feedback",
      "settings-hotkeys-list",
      "settings-actions-list",
      "settings-vocabulary-rules",
      "settings-application-startup",
      "settings-application-dock",
      "settings-privacy-history",
      "settings-help-status",
      "settings-advanced-diagnostics",
    ]);
    expect(settingsSearchIndex.every(({ label, summary, targetId }) => label && summary && targetId)).toBe(true);
  });

  it("renders the shell search surface and only mounts the active section", () => {
    const application = renderSection("application");
    expect(application).toContain('role="search"');
    expect(application).toContain('aria-label="Buscar ajustes"');
    expect(application).toContain("Aplicación");
    expect(application).toContain("Abrir Dictation al iniciar Windows");
    expect(application).toContain('id="settings-application-startup"');
    expect(application).toContain('id="settings-application-dock"');
    expect(application).not.toContain('id="settings-dictation-mode"');
    expect(application).not.toContain('id="settings-hotkeys-list"');
    expect(application).not.toContain('id="settings-actions-list"');
    expect(application).not.toContain("General");
    expect(application).not.toContain("Presets");
  });

  it("keeps Account redacted and excludes infrastructure details", () => {
    const html = renderToStaticMarkup(
      <SettingsSurface
        initialSection="account"
        initialCloudStatus={{
          ...readyCloudStatus,
          statePath: "C:/Users/JP/AppData/Roaming/dictation-tauri/fixvox-device-state.json",
          authPolicy: { accessMode: "signed_in", userRedacted: "user_1234567890abcdef", redacted: true },
        }}
        initialAuthSessionStatus={{
          status: "signed_in",
          secretsPresent: false,
          sessionPath: "redacted",
          redacted: true,
        }}
      />,
    );
    expect(html).toContain("Cuenta");
    expect(html).toContain("Cuenta conectada");
    expect(html).not.toContain("fixvox-device-state.json");
    expect(html).not.toContain("C:/Users/JP/AppData");
    expect(html).not.toContain("user_1234567890abcdef");
    expect(html).not.toContain("token");
    expect(html).not.toContain("policy");
  });

  it("keeps Dictation everyday modes separate from Laboratory", () => {
    const html = renderSection("dictation");
    expect(html).toContain('id="settings-dictation-mode"');
    for (const label of ["Según mi perfil", "Rápido", "Limpieza segura", "Completo"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Laboratory");
    expect(html).toContain("Los overrides temporales sólo afectan una ejecución y no cambian el modo global guardado.");
    expect(html).toContain('id="settings-dictation-listening"');
    expect(html).toContain('id="settings-dictation-delivery"');
    expect(html).toContain('id="settings-dictation-feedback"');
    expect(html).not.toContain("Configuración de prueba");
  });

  it("preserves the host-owned hotkey candidate and dirty contracts", () => {
    expect(nativeHotkeyEditCandidates.map(({ shortcut }) => shortcut)).toEqual([
      "Alt+Space", "Alt+3", "Ctrl+Shift+F9",
    ]);
    expect(nativeHotkeyEditContract.rendererBoundary).toEqual({
      editableControlsAllowed: true,
      keyboardCaptureAllowed: false,
      registrationAllowed: false,
      persistenceAllowed: false,
    });
    const html = renderSection("hotkeys");
    expect(html).toContain('id="settings-hotkeys-list"');
    expect(html).toContain("Cambiar");
    expect(html).not.toContain("Comprobar atajo");
  });

  it("keeps Actions advanced details disclosed and capability-aware", () => {
    const denied = renderToStaticMarkup(<SettingsSurface initialSection="actions" />);
    expect(denied).toContain("Acciones");
    expect(denied).not.toContain("Editar detalles avanzados");
    expect(denied).not.toContain("Nombre del preset");

    const readOnly = renderToStaticMarkup(
      <SettingsSurface
        initialSection="actions"
        initialCloudStatus={{
          ...readyCloudStatus,
          authPolicy: { accessMode: "signed_in", capabilities: ["selection_transform", "managed_llm"], redacted: true },
        }}
      />,
    );
    expect(readOnly).not.toContain("Editar detalles avanzados");
    expect(readOnly).toContain("disabled");

    const editable = renderSection("actions");
    expect(editable).toContain('id="settings-actions-list"');
    expect(editable).toContain("Editar detalles avanzados");
    expect(editable).not.toContain("Provider");
    expect(editable).toContain("<details");
    expect(editable).toContain("Vista previa no disponible");
    expect(editable).toContain("no ejecuta proveedores ni inventa una salida");
    expect(editable).not.toContain("Salida ilustrativa");
  });

  it("renders honest effective state for unavailable, denied, and proven local data", () => {
    const unavailable = renderToStaticMarkup(<SettingsSurface initialSection="advanced" />);
    expect(unavailable).toContain("Estado efectivo del dictado");
    expect(unavailable).toContain("No disponible");
    expect(unavailable).not.toContain("Alt+Space");
    expect(unavailable).not.toContain("Copiar");

    const notConfigured = renderToStaticMarkup(
      <AdvancedSettings tauriRuntime={false} cloudStatus={deniedCloudStatus} preferences={savedPreferences} />,
    );
    expect(notConfigured).toContain("No configurado");
    expect(notConfigured).not.toContain("C:/");
    expect(notConfigured).not.toContain("token");

    const disabled = renderToStaticMarkup(
      <AdvancedSettings
        tauriRuntime={false}
        cloudStatus={{ ...deniedCloudStatus, installIdPresent: true }}
        preferences={savedPreferences}
      />,
    );
    expect(disabled).toContain("Deshabilitado");
    const populated = renderToStaticMarkup(
      <AdvancedSettings tauriRuntime={false} cloudStatus={readyCloudStatus} preferences={savedPreferences} />,
    );
    expect(populated).toContain("Limpieza segura");
    expect(populated).toContain("Configuración local");
    expect(populated).toContain("Diagnóstico redactado seleccionable");
    expect(populated).not.toContain("sessionPath");
    expect(populated).not.toContain("provider");
    expect(populated).not.toContain("clipboard");
  });

  it("renders concise local-data controls and honest shared health copy", () => {
    const onNavigate = vi.fn();
    const privacy = renderToStaticMarkup(<PrivacySettings tauriRuntime={false} onNavigate={onNavigate} />);
    const help = renderToStaticMarkup(
      <HelpSettings
        tauriRuntime={false}
        cloudStatus={{
          ...readyCloudStatus,
          capabilities: {
            canUseManagedTranscription: true,
            canSeeAdvancedSettings: true,
            canUseDebugTools: false,
          },
        }}
        onNavigate={onNavigate}
      />,
    );

    expect(privacy).toContain("Datos locales");
    expect(privacy).toContain("Historial de resultados");
    expect(privacy).toContain("Ver diagnóstico");
    expect(privacy).not.toContain("El historial se guarda localmente y podés borrarlo");
    expect(help).toContain("Estado de esta computadora");
    expect(help).toContain("La cuenta y esta computadora están preparadas.");
    expect(help).toContain("Listo");
    expect(help).not.toContain("Hay información disponible");
    for (const html of [privacy, help]) {
      expect(html).toContain("settings-advanced-diagnostics");
      expect(html).not.toContain("<a ");
    }
  });

  it("shows local provenance, host-grounded effects, relations, and a non-mutating dock preview", () => {
    const onNavigate = vi.fn();
    const dictation = renderToStaticMarkup(
      <DictationSettings tauriRuntime={false} preferences={savedPreferences} onNavigate={onNavigate} />,
    );
    const application = renderToStaticMarkup(
      <ApplicationSettings tauriRuntime={false} preferences={savedPreferences} onNavigate={onNavigate} />,
    );
    expect(dictation).toContain("Configuración local");
    expect(dictation).toContain("Esta computadora");
    expect(dictation).toContain("Próximo dictado");
    expect(dictation).toContain("settings-advanced-diagnostics");
    expect(dictation).toContain("Tauri no está disponible");
    expect(application).toContain("Configuración local");
    expect(application).toContain("Se aplica de inmediato");
    expect(application).toContain("Se aplica al reiniciar");
    expect(application).toContain("Vista previa local");
    expect(application).toContain("settings-hotkeys-list");
    expect(application).toContain("sin guardar preferencias");
  });

  it("keeps Correcciones empty and populated states mutually exclusive", () => {
    const emptySnapshot: PersonalVocabularySnapshot = { revision: "r1", rules: [] };
    const empty = renderToStaticMarkup(<PersonalVocabularySettings initialSnapshot={emptySnapshot} />);
    expect(empty).toContain("No hay correcciones guardadas.");
    expect(empty).toContain("Nueva corrección");
    expect(empty).not.toContain("settings-vocabulary-editor");

    const populatedSnapshot: PersonalVocabularySnapshot = {
      revision: "r1",
      rules: [{
        id: "rule-1",
        revision: "1",
        spoken: "dictado",
        candidates: [{ id: "candidate-1", written: "Dictation" }],
        defaultCandidateId: "candidate-1",
        mode: "ask",
        enabled: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      }],
    };
    const populated = renderToStaticMarkup(<PersonalVocabularySettings initialSnapshot={populatedSnapshot} />);
    expect(populated).toContain("Correcciones personales");
    expect(populated).toContain("dictado");
    expect(populated).not.toContain("Nueva corrección. Completá los textos para guardarla.");
  });
});
