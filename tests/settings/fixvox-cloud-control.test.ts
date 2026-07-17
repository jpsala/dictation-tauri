import { describe, expect, it } from "vitest";
import {
  deriveFixvoxAuthPolicyView,
  deriveFixvoxCloudHealth,
  formatFixvoxStateLocation,
  resolveSettingsAccess,
  shouldConfirmFixvoxCloudOperation,
  summarizeFixvoxCloudProblem,
  summarizeFixvoxCloudStatus,
  summarizeFixvoxPolicyCapabilities,
  type FixvoxCloudStatus,
} from "../../src/settings/fixvox-cloud-control";

describe("Fixvox cloud settings contract", () => {
  it("derives Settings visibility and mutation rights from product capabilities", () => {
    expect(resolveSettingsAccess(undefined)).toEqual({
      canViewPresets: false,
      canEditPresets: false,
      canOpenAdmin: false,
    });
    expect(resolveSettingsAccess({
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
    })).toEqual({
      canViewPresets: true,
      canEditPresets: true,
      canOpenAdmin: false,
    });
    expect(resolveSettingsAccess({
      backendBaseUrl: "redacted",
      statePath: "redacted",
      installIdPresent: true,
      deviceRegistered: true,
      lastRegisterOk: true,
      authPolicy: {
        accessMode: "signed_in",
        policyTemplateId: "power-admin",
        capabilities: ["selection_transform", "custom_prompts", "managed_llm", "admin_settings"],
        redacted: true,
      },
      redacted: true,
    }).canOpenAdmin).toBe(true);
  });

  it("summarizes local device status without exposing raw identifiers", () => {
    const status: FixvoxCloudStatus = {
      backendBaseUrl: "https://auth-fixvox.jpsala.dev",
      statePath: "C:/Users/JP/AppData/Roaming/dictation-tauri/fixvox-device-state.json",
      installIdPresent: true,
      installIdRedacted: "instal…1234",
      deviceRegistered: true,
      deviceIdRedacted: "dev_te…cdef",
      lastRegisterOk: true,
      policyId: "alpha-basic",
      policyLabel: "Alpha Basic",
      capabilities: {
        canUseManagedTranscription: true,
        canSeeAdvancedSettings: false,
        canUseDebugTools: false,
      },
      policySnapshot: {
        policyId: "alpha-basic",
        policyLabel: "Alpha Basic",
        capabilities: {
          canUseManagedTranscription: true,
          canSeeAdvancedSettings: false,
          canUseDebugTools: false,
        },
        fetchedAt: "2026-06-28T00:00:00Z",
        trust: "fresh",
        stale: false,
      },
      redacted: true,
    };

    const copy = summarizeFixvoxCloudStatus(status);

    expect(copy).toBe("Device linked · Alpha Basic · Managed transcription ready.");
    expect(copy).not.toContain("dev_test_1234567890abcdef");
    expect(summarizeFixvoxPolicyCapabilities(status)).toBe("managed STT · basic settings · debug hidden · fresh");
    expect(deriveFixvoxCloudHealth(status)).toMatchObject({
      tone: "success",
      badge: "Ready",
      activationLabel: "Linked",
      policyLabel: "Alpha Basic",
      managedLabel: "Managed ready",
    });
    expect(formatFixvoxStateLocation(status.statePath)).toBe("fixvox-device-state.json · host app data");
  });

  it("summarizes pro/full policy capabilities without raw transport payloads", () => {
    const status: FixvoxCloudStatus = {
      backendBaseUrl: "https://auth-fixvox.jpsala.dev",
      statePath: "redacted",
      installIdPresent: true,
      deviceRegistered: true,
      lastRegisterOk: true,
      policyId: "pro",
      policyLabel: "Pro",
      capabilities: {
        canUseManagedTranscription: true,
        canSeeAdvancedSettings: true,
        canUseDebugTools: true,
      },
      policySnapshot: {
        policyId: "pro",
        policyLabel: "Pro",
        capabilities: {
          canUseManagedTranscription: true,
          canSeeAdvancedSettings: true,
          canUseDebugTools: true,
        },
        fetchedAt: "2026-06-28T00:00:00Z",
        trust: "fresh",
        stale: false,
      },
      redacted: true,
    };

    expect(summarizeFixvoxPolicyCapabilities(status)).toBe("managed STT · advanced settings · debug tools · fresh");
    expect(JSON.stringify(status)).not.toContain("gsk_");
  });

  it("turns stale, blocked or failed policy state into actionable redacted UX copy", () => {
    const failed: FixvoxCloudStatus = {
      backendBaseUrl: "https://auth-fixvox.jpsala.dev",
      statePath: "C:/Users/JP/AppData/Roaming/dictation-tauri/fixvox-device-state.json",
      installIdPresent: true,
      installIdRedacted: "instal…1234",
      deviceRegistered: true,
      deviceIdRedacted: "dev_te…cdef",
      lastRegisterOk: false,
      lastRegisterErrorCode: "fixvox_preflight_denied",
      lastRegisterErrorMessage: "quota or policy denied",
      policyId: "pro",
      policyLabel: "Pro",
      capabilities: {
        canUseManagedTranscription: true,
        canSeeAdvancedSettings: true,
        canUseDebugTools: false,
      },
      policySnapshot: {
        policyId: "pro",
        policyLabel: "Pro",
        capabilities: {
          canUseManagedTranscription: true,
          canSeeAdvancedSettings: true,
          canUseDebugTools: false,
        },
        fetchedAt: "2026-06-28T00:00:00Z",
        trust: "error",
        stale: true,
        error: { code: "cloudflare_1010", message: "request blocked", redacted: true },
      },
      redacted: true,
    };

    expect(deriveFixvoxCloudHealth(undefined)).toMatchObject({ tone: "warning", badge: "Open in Tauri" });
    expect(deriveFixvoxCloudHealth(failed)).toMatchObject({
      tone: "danger",
      badge: "Needs attention",
      managedLabel: "Managed cached",
      nextAction: "Retry Refresh policy; if it repeats, check network or invite/account state.",
    });
    expect(summarizeFixvoxCloudProblem(failed)).toBe("cloudflare_1010: request blocked");
    expect(JSON.stringify(deriveFixvoxCloudHealth(failed))).not.toContain("dev_test_1234567890abcdef");
  });

  it("derives signed-out basic and signed-in group/template auth UX without raw ids", () => {
    const signedOut: FixvoxCloudStatus = {
      backendBaseUrl: "https://auth-fixvox.jpsala.dev",
      statePath: "C:/Users/JP/AppData/Roaming/dictation-tauri/fixvox-device-state.json",
      installIdPresent: true,
      installIdRedacted: "instal…1234",
      deviceRegistered: false,
      lastRegisterOk: false,
      redacted: true,
    };

    expect(deriveFixvoxAuthPolicyView(signedOut)).toMatchObject({
      tone: "warning",
      accessLabel: "Anonymous basic",
      headline: "Signed out: basic mode only",
      groupLabel: "No user group",
      templateLabel: "Basic anonymous",
      actionLabel: "Sign in to unlock",
    });
    expect(deriveFixvoxAuthPolicyView(signedOut).capabilityLabel).toContain("no managed dictation");

    const signedIn: FixvoxCloudStatus = {
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

    const view = deriveFixvoxAuthPolicyView(signedIn);

    expect(view).toMatchObject({
      tone: "success",
      accessLabel: "Signed in",
      userLabel: "user redacted",
      groupLabel: "Founders",
      templateLabel: "Pro",
      actionLabel: "Account linked",
    });
    expect(view.capabilityLabel).toContain("managed dictation");
    expect(JSON.stringify(view)).not.toContain("user_1234567890abcdef");
  });

  it("keeps real cloud operations behind explicit user confirmation", () => {
    expect(shouldConfirmFixvoxCloudOperation("activate", "FIXVOX-INVITE-123")).toBe(true);
    expect(shouldConfirmFixvoxCloudOperation("activate", "   ")).toBe(false);
    expect(shouldConfirmFixvoxCloudOperation("register")).toBe(true);
    expect(shouldConfirmFixvoxCloudOperation("refresh")).toBe(true);
  });
});
