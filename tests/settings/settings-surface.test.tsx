// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsSurface } from "../../src/settings/SettingsSurface";
import type { FixvoxCloudStatus } from "../../src/settings/fixvox-cloud-control";

describe("SettingsSurface", () => {
  it("renders a compact hotkeys scaffold with a host-owned hotkey editor", () => {
    const html = renderToStaticMarkup(<SettingsSurface initialSection="hotkeys" />);

    expect(html).toContain("Keyboard shortcuts");
    expect(html).toContain("Fixvox");
    expect(html).toContain("Desktop settings");
    expect(html).toContain("Current policy");
    expect(html).toContain("Settings");
    expect(html).toContain("Essentials");
    expect(html).toContain("Cloud");
    expect(html).toContain("Dock");
    expect(html).toContain("Delivery");
    expect(html).toContain("Presets");
    expect(html).toContain("Dictation key");
    expect(html).toContain("Paste last");
    expect(html).toContain("Quick Chat");
    expect(html).toContain("Result history");
    expect(html).toContain("Preset picker");
    expect(html).toContain("Stop and submit");
    expect(html).toContain("Assistant mode");
    expect(html).toContain("Press Enter after paste");
    expect(html).toContain("Cancel recording");
    expect(html).toContain("9 keys");
    expect(html).toContain("Shortcuts");
    expect(html).toContain("Dictation key editor");
    expect(html).toContain("Alt+Space");
    expect(html).toContain("Check current shortcut");
    expect(html).toContain("Click the field, then press the shortcut.");
    expect(html).toContain("Click to edit");
    expect(html).not.toContain("Use Alt+Space");
    expect(html).not.toContain("Use Alt+3");
    expect(html).not.toContain("Use Ctrl+Shift+F9");
    expect(html).not.toContain("Save Alt+Space");
    expect(html).not.toContain("Preview before saving");
    expect(html).toContain("Capture");
    expect(html).toContain("Check conflict");
    expect(html).toContain("Swap");
    expect(html).toContain("Rollback");
    expect(html).toContain("Verify");
    expect(html).toContain("save to local preference storage");
    expect(html).not.toContain("Device activation");
    expect(html).not.toContain("Enter invite code");
    expect(html).not.toContain("Activate device");
    expect(html).not.toContain("Refresh local status");
    expect(html).not.toContain("Refresh policy");
    expect(html).not.toContain("IDs redacted");

    expect(html).not.toContain("Show dock on startup");
    expect(html).not.toContain("Preset routing");
    expect(html).not.toContain("Save changes");
    expect(html).not.toContain("Record shortcut");
    expect(html).not.toContain("Capture shortcut");
    expect(html).not.toContain("navigator.clipboard");
    expect(html).not.toContain("registerAll");
    expect(html.toLowerCase()).not.toContain("dummy");
    expect(html.toLowerCase()).not.toContain("spike-only");
    expect(html.toLowerCase()).not.toContain("raw transcript");
    expect(html.toLowerCase()).not.toContain("selected text");
  });

  it("renders Settings Cloud signed-out/basic UX without real auth", () => {
    const cloudStatus: FixvoxCloudStatus = {
      backendBaseUrl: "https://auth-fixvox.jpsala.dev",
      statePath: "C:/Users/JP/AppData/Roaming/dictation-tauri/fixvox-device-state.json",
      installIdPresent: true,
      installIdRedacted: "instal…1234",
      deviceRegistered: false,
      lastRegisterOk: false,
      redacted: true,
    };

    const html = renderToStaticMarkup(<SettingsSurface initialSection="cloud" initialCloudStatus={cloudStatus} />);

    expect(html).toContain("Fixvox Cloud");
    expect(html).toContain("Signed out: basic mode only");
    expect(html).toContain("Anonymous basic");
    expect(html).toContain("Sign in to unlock");
    expect(html).toContain("No user group");
    expect(html).toContain("Basic anonymous");
    expect(html).toContain("no managed dictation");
    expect(html).toContain("managed dictation, postprocess, transforms, assistant actions, advanced settings and higher limits require Fixvox Cloud login");
    expect(html).toContain("Browser sign-in is host-owned; Settings only receives redacted session status.");
    expect(html).toContain("Start Fixvox Cloud sign in");
    expect(html).toContain("Sign in with Google");
    expect(html).toContain("Use your Fixvox account to unlock managed dictation");
    expect(html).toContain("fixvox-device-state.json · host app data");
    expect(html).not.toContain("user_1234567890abcdef");
    expect(html).not.toContain("dev_test_1234567890abcdef");
    expect(html).not.toContain("C:/Users/JP/AppData");
    expect(html).not.toContain("token");
  });

  it("renders signed-in group/template/capabilities from simulated policy only", () => {
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
        initialSection="cloud"
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

    expect(html).toContain("Signed in policy active");
    expect(html).toContain("Founders");
    expect(html).toContain("Pro");
    expect(html).toContain("managed dictation");
    expect(html).toContain("postprocess");
    expect(html).toContain("1500 min/month");
    expect(html).toContain("host and cloud still enforce capabilities");
    expect(html).toContain("Fixvox policy active");
    expect(html).toContain("This device is linked to a redacted Fixvox account and policy capabilities are refreshed from Cloud");
    expect(html).not.toContain("Signed in: device link pending");
    expect(html).not.toContain("Capabilities remain basic until the host links this device");
    expect(html).not.toContain("user_1234567890abcdef");
    expect(html).not.toContain("device_id");
    expect(html).not.toContain("gsk_");
  });

  it("hides preset navigation when the effective policy cannot run transforms", () => {
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

    expect(html).not.toContain("Preset prompt editor");
    expect(html).not.toContain("Add preset");
    expect(html).toContain("Essentials");
  });

  it("shows the integrated Control Room only for admin settings capability", () => {
    const html = renderToStaticMarkup(<SettingsSurface
      initialSection="admin"
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

    expect(html).toContain("Control Room");
    expect(html).toContain("Open Control Room");
    expect(html).not.toContain("ADMIN_API_KEY");
  });

  it("renders local preset administration for starter prompt overrides", () => {
    const html = renderToStaticMarkup(<SettingsSurface initialSection="presets" />);

    expect(html).toContain("Preset prompt editor");
    expect(html).toContain("Edit starter prompts and add local custom presets used by Alt+Q");
    expect(html).toContain("Como yo (español)");
    expect(html).toContain("Corregir texto");
    expect(html).toContain("Fix Writing");
    expect(html).toContain("Like me (English)");
    expect(html).toContain("Import Cloud defaults");
    expect(html).toContain("Add preset");
    expect(html).toContain("Name");
    expect(html).toContain("Picker key");
    expect(html).toContain("Enabled");
    expect(html).toContain("Hotkey");
    expect(html).toContain("Managed engine");
    expect(html).toContain("Configured in Control Room");
    expect(html).not.toContain("Preset provider");
    expect(html).not.toContain("Preset model");
    expect(html).toContain("No confirm");
    expect(html).toContain("Duplicate");
    expect(html).toContain("Save prompt");
    expect(html).toContain("Reset starter");
    expect(html).toContain("Starter locked");
    expect(html).toContain("Local app data");
    expect(html).toContain("No Cloud defaults");
    expect(html).toContain("Alt+Q reads on next run");
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
    expect(source).toContain("Press new shortcut…");
    expect(source).toContain("onClick={() => setSelectedSection(section.id)}");
    expect(source).not.toContain("disabled={!isActive}");
    expect(source).toContain("effectiveSection === \"hotkeys\"");
    expect(source).toContain("effectiveSection === \"cloud\"");
    expect(source).toContain("effectiveSection === \"presets\"");
    expect(source).toContain("getTauriActionHotkeyConfig");
    expect(source).toContain("applyTauriActionHotkeyRegistration");
    expect(source).toContain("essentialsTabs");
    expect(source).toContain("role=\"tablist\"");
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
    expect(source).toContain("Auto-stop after silence");
    expect(source).toContain("followFocusUntilDelivery");
    expect(source).toContain("Follow focus until paste");
    expect(source).toContain("muteOutputDuringRecording");
    expect(source).toContain("Mute output while recording");
    expect(source).toContain("dictationSoundCuesEnabled");
    expect(source).toContain("Dictation sound cues");
    expect(source).toContain("getFixvoxAuthSessionStatus");
    expect(source).toContain("pollFixvoxCloudLogin");
    expect(source).toContain("pollCloudLoginStatus");
    expect(source).toContain("visibilitychange");
    expect(source).toContain("activateFixvoxDevice");
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
