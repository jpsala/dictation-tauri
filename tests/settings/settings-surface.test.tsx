// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsSurface } from "../../src/settings/SettingsSurface";
import type { FixvoxCloudStatus } from "../../src/settings/fixvox-cloud-control";

describe("SettingsSurface", () => {
  it("renders the eight-section Settings rail and keeps General limited to startup and dock", () => {
    const hotkeys = renderToStaticMarkup(<SettingsSurface initialSection="hotkeys" />);
    const general = renderToStaticMarkup(<SettingsSurface initialSection="general" />);

    expect(hotkeys).toContain("Ajustes de escritorio");
    expect(hotkeys).not.toContain('role="tablist"');
    expect(hotkeys).not.toContain("Current policy");
    for (const section of ["General", "Cuenta", "Dictado", "Atajos", "Presets", "Privacidad", "Ayuda", "Avanzado"]) {
      expect(hotkeys).toContain(section);
    }
    expect(hotkeys).toContain("Tecla de dictado");
    expect(hotkeys).toContain("Pegar el último resultado");
    expect(hotkeys).toContain("9 atajos");
    expect(hotkeys).toContain("Comprobar atajo");
    expect(hotkeys).not.toContain("Device activation");
    expect(hotkeys).not.toContain("Enter invite code");
    expect(hotkeys).not.toContain("navigator.clipboard");
    expect(hotkeys.toLowerCase()).not.toContain("raw transcript");
    expect(hotkeys.toLowerCase()).not.toContain("selected text");

    expect(general).toContain("Inicio de la aplicación");
    expect(general).toContain("Abrir Dictation al iniciar Windows");
    expect(general).toContain("Mostrar el dock al iniciar");
    expect(general).not.toContain("Atajos administrados por la aplicación.");
    expect(general).not.toContain("role=\"tablist\"");
  });

  it("renders Cuenta signed-out UX without infrastructure detail", () => {
    const cloudStatus: FixvoxCloudStatus = {
      backendBaseUrl: "https://auth-fixvox.jpsala.dev",
      statePath: "C:/Users/JP/AppData/Roaming/dictation-tauri/fixvox-device-state.json",
      installIdPresent: true,
      installIdRedacted: "instal…1234",
      deviceRegistered: false,
      lastRegisterOk: false,
      redacted: true,
    };

    const html = renderToStaticMarkup(<SettingsSurface initialSection="account" initialCloudStatus={cloudStatus} />);

    expect(html).toContain("Cuenta");
    expect(html).toContain("Iniciá sesión para usar Dictation");
    expect(html).toContain("Tu cuenta se vincula automáticamente a esta computadora.");
    expect(html).toContain("Continuar con Google");
    expect(html).toContain("El inicio de sesión se abre en el navegador y volvés a la aplicación al terminar.");
    expect(html).not.toContain("Cloud");
    expect(html).not.toContain("policy");
    expect(html).not.toContain("invite code");
    expect(html).not.toContain("fixvox-device-state.json");
    expect(html).not.toContain("user_1234567890abcdef");
    expect(html).not.toContain("dev_test_1234567890abcdef");
    expect(html).not.toContain("C:/Users/JP/AppData");
    expect(html).not.toContain("token");
  });

  it("renders signed-in Cuenta summary from simulated redacted state", () => {
    const cloudStatus: FixvoxCloudStatus = {
      backendBaseUrl: "https://auth-fixvox.jpsala.dev",
      statePath: "redacted",
      installIdPresent: true,
      installIdRedacted: "instal…1234",
      deviceRegistered: true,
      deviceIdRedacted: "dev…cdef",
      lastRegisterOk: true,
      policyLabel: "Pro",
      capabilities: {
        canUseManagedTranscription: true,
        canSeeAdvancedSettings: true,
        canUseDebugTools: false,
      },
      policySnapshot: {
        policyLabel: "Pro",
        capabilities: {
          canUseManagedTranscription: true,
          canSeeAdvancedSettings: true,
          canUseDebugTools: false,
        },
        fetchedAt: "2026-06-29T00:00:00Z",
        trust: "simulated",
        stale: false,
      },
      authPolicy: {
        accessMode: "signed_in",
        userRedacted: "user_1234567890abcdef",
        groupLabel: "Founders",
        policyTemplateId: "pro",
        policyTemplateLabel: "Pro",
        redacted: true,
      },
      redacted: true,
    };

    const html = renderToStaticMarkup(
      <SettingsSurface
        initialSection="account"
        initialCloudStatus={cloudStatus}
        initialAuthSessionStatus={{
          status: "signed_in",
          flow: "device_code_polling",
          userRedacted: "user_1234567890abcdef",
          sessionIdRedacted: "sess…cdef",
          stateRedacted: "state…cdef",
          secretsPresent: false,
          sessionPath: "fixvox-auth-session.v1.json · host app data",
          redacted: true,
        }}
      />,
    );

    expect(html).toContain("Cuenta conectada");
    expect(html).toContain("Pro");
    expect(html).toContain("Tu cuenta y esta computadora están listas para dictar.");
    expect(html).toContain("Plan Pro");
    expect(html).not.toContain("Founders");
    expect(html).not.toContain("managed dictation");
    expect(html).not.toContain("postprocess");
    expect(html).not.toContain("policy");
    expect(html).not.toContain("Capabilities remain basic until the host links this device");
    expect(html).not.toContain("user_1234567890abcdef");
    expect(html).not.toContain("device_id");
    expect(html).not.toContain("gsk_");
  });

  it("keeps Presets visible and explains unavailable capability", () => {
    const html = renderToStaticMarkup(<SettingsSurface
      initialSection="presets"
      initialCloudStatus={{
        backendBaseUrl: "redacted",
        statePath: "redacted",
        installIdPresent: true,
        deviceRegistered: true,
        lastRegisterOk: true,
        authPolicy: {
          accessMode: "signed_in",
          policyTemplateId: "dictation-basic",
          redacted: true,
        },
        redacted: true,
      }}
    />);

    expect(html).toContain("Presets");
    expect(html).toContain("Los presets no están disponibles para esta cuenta.");
    expect(html).toContain("Presets");
    expect(html).toContain("Agregar preset");
  });

  it("shows the Control Room entry only in Avanzado for admin capability", () => {
    const html = renderToStaticMarkup(<SettingsSurface
      initialSection="advanced"
      initialCloudStatus={{
        backendBaseUrl: "redacted",
        statePath: "redacted",
        installIdPresent: true,
        deviceRegistered: true,
        lastRegisterOk: true,
        authPolicy: {
          accessMode: "signed_in",
          policyTemplateId: "power-admin",
          capabilities: ["admin_settings"],
          redacted: true,
        },
        redacted: true,
      }}
    />);

    expect(html).toContain("Avanzado");
    expect(html).toContain("Abrir Control Room");
    expect(html).toContain("Diagnóstico seguro");
    expect(html).not.toContain("ADMIN_API_KEY");

    const nonAdminHtml = renderToStaticMarkup(<SettingsSurface initialSection="advanced" />);
    expect(nonAdminHtml).not.toContain("Abrir Control Room");
  });

  it("renders Dictado, Privacidad and Ayuda without account or runtime internals", () => {
    const dictation = renderToStaticMarkup(<SettingsSurface initialSection="dictation" />);
    const privacy = renderToStaticMarkup(<SettingsSurface initialSection="privacy" />);
    const help = renderToStaticMarkup(<SettingsSurface initialSection="help" />);

    expect(dictation).toContain("Dictado");
    expect(dictation).toContain("Detener después de un silencio");
    expect(dictation).toContain("Silenciar salida al grabar");
    expect(dictation).not.toContain("Cloud");
    expect(dictation).not.toContain("policy");
    expect(privacy).toContain("Privacidad");
    expect(privacy).toContain("El historial se guarda sólo en esta computadora.");
    expect(privacy).toContain("Borrar historial");
    expect(privacy).not.toContain("raw transcript");
    expect(help).toContain("Ayuda");
    expect(help).toContain("Estado del servicio");
    expect(help).toContain("Abrir diagnóstico seguro");
    expect(help).not.toContain("provider");
  });

  it("renders local preset administration for starter prompt overrides", () => {
    const html = renderToStaticMarkup(<SettingsSurface initialSection="presets" />);

    expect(html).toContain("Presets");
    expect(html).toContain("Editá los presets disponibles y agregá presets locales para Alt+Q");
    expect(html).toContain("Como yo (español)");
    expect(html).toContain("Corregir texto");
    expect(html).toContain("Fix Writing");
    expect(html).toContain("Like me (English)");
    expect(html).toContain("Importar valores disponibles");
    expect(html).toContain("Agregar preset");
    expect(html).toContain("Editar el preset seleccionado");
    expect(html).toContain("Nombre");
    expect(html).toContain("Tecla del selector");
    expect(html).toContain("Atajo");
    expect(html).not.toContain("Managed engine");
    expect(html).not.toContain("Configured in Control Room");
    expect(html).not.toContain("Preset provider");
    expect(html).not.toContain("Preset model");
    expect(html).toContain("Sin confirmación");
    expect(html).toContain("Duplicar");
    expect(html).toContain("Guardar cambios");
    expect(html).toContain("Restablecer incluido");
    expect(html).toContain("Preset incluido");
    expect(html).toContain("Datos locales de la aplicación");
    expect(html).toContain("Sin valores para importar");
    expect(html).toContain("Alt+Q se actualiza en el próximo uso");
    expect(html).not.toContain("raw transcript");
    expect(html).not.toContain("token");
  });

  it("wires the single shortcut field to record key presses and save through the host", () => {
    const source = readFileSync("src/settings/SettingsSurface.tsx", "utf8");

    expect(source).toContain("desktop-control://hotkey-capture");
    expect(source).toContain("set_desktop_control_hotkey_capture_enabled");
    expect(source).toContain("startShortcutCapture");
    expect(source).toContain("onClick={() => void startShortcutCapture()}");
    expect(source).toContain("captureState === \"recording\" || captureArmedRef.current");
    expect(source).not.toContain("onMouseDown={() => void startShortcutCapture()}");
    expect(source).not.toContain("onFocus={() => void startShortcutCapture()}");
    expect(source).toContain("handleShortcutCaptureKeyDown");
    expect(source).toContain("shortcutFromKeyboardEvent");
    expect(source).toContain("await applyCandidate(shortcut)");
    expect(source).toContain("Presioná el nuevo atajo…");
    expect(source).toContain("onClick={() => setSelectedSection(section.id)}");
    expect(source).not.toContain("disabled={!isActive}");
    expect(source).toContain("effectiveSection === \"hotkeys\"");
    expect(source).toContain("effectiveSection === \"account\"");
    expect(source).toContain("effectiveSection === \"advanced\"");
    expect(source).toContain("effectiveSection === \"presets\"");
    expect(source).toContain("getTauriActionHotkeyConfig");
    expect(source).toContain("applyTauriActionHotkeyRegistration");
    expect(source).not.toContain("essentialsTabs");
    expect(source).not.toContain("role=\"tablist\"");
    expect(source).toContain("createSelectionTransformCustomPreset");
    expect(source).toContain("deleteSelectionTransformCustomPreset");
    expect(source).toContain("saveSelectionTransformPresetCustomization");
    expect(source).toContain("resetSelectionTransformPresetCustomization");
    expect(source).toContain("extractCloudSelectionPresetDefaults");
    expect(source).toContain("importCloudSelectionPresetDefaults");
    expect(source).not.toContain("close_settings_window");
    expect(source).not.toContain("closeSettingsWindow");
    expect(source).toContain("getFixvoxCloudStatus");
    expect(source).toContain("getUserPreferences");
    expect(source).toContain("setUserPreferences");
    expect(source).toContain("autoStopOnSilenceEnabled");
    expect(source).toContain("autoStopSilenceMs");
    expect(source).toContain("Detener después de un silencio");
    expect(source).toContain("followFocusUntilDelivery");
    expect(source).toContain("followFocusUntilDelivery");
    expect(source).toContain("muteOutputDuringRecording");
    expect(source).toContain("Silenciar salida al grabar");
    expect(source).toContain("dictationSoundCuesEnabled");
    expect(source).toContain("Sonidos de dictado");
    expect(source).toContain("getFixvoxAuthSessionStatus");
    expect(source).toContain("pollFixvoxCloudLogin");
    expect(source).toContain("pollCloudLoginStatus");
    expect(source).toContain("visibilitychange");
    expect(source).not.toContain("activateFixvoxDevice");
    expect(source).toContain("startFixvoxCloudLogin");
    expect(source).toContain("startCloudLogin");
    expect(source).not.toContain("Open the external browser to start Fixvox Cloud sign-in?");
    expect(source).not.toContain("void applyCandidate(candidate.shortcut)");
    expect(source).not.toContain("Save ${editingShortcut}");
  });

  it("notifies the dock runtime when host-owned user preferences change", () => {
    const settingsControlSource = readFileSync("src/settings/user-preferences-control.ts", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");

    expect(settingsControlSource).toContain("settings://user-preferences-changed");
    expect(settingsControlSource).toContain("emit(userPreferencesChangedEvent, next)");
    expect(appSource).toContain("userPreferencesChangedEvent");
    expect(appSource).toContain("getUserPreferences()");
    expect(appSource).toContain("userPreferencesRef.current.pressEnterAfterPaste");
    expect(appSource).toContain("userPreferencesRef.current.followFocusUntilDelivery");
    expect(settingsControlSource).toContain("followFocusUntilDelivery");
    expect(settingsControlSource).toContain("autoStopOnSilenceEnabled");
    expect(settingsControlSource).toContain("defaultAutoStopSilenceMs");
    expect(settingsControlSource).toContain("createMuteOutputPolicy");
    expect(appSource).toContain("forcePressEnterAfterPasteRef.current");
    expect(appSource).toContain("reviewBeforeDelivery ? \"review_only\" : \"paste_send\"");
  });
});
