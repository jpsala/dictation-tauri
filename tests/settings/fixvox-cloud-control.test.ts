import { describe, expect, it } from "vitest";
import {
  shouldConfirmFixvoxCloudOperation,
  summarizeFixvoxCloudStatus,
  summarizeFixvoxPolicyCapabilities,
  type FixvoxCloudStatus,
} from "../../src/settings/fixvox-cloud-control";

describe("Fixvox cloud settings contract", () => {
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

  it("keeps real cloud operations behind explicit user confirmation", () => {
    expect(shouldConfirmFixvoxCloudOperation("activate", "FIXVOX-INVITE-123")).toBe(true);
    expect(shouldConfirmFixvoxCloudOperation("activate", "   ")).toBe(false);
    expect(shouldConfirmFixvoxCloudOperation("register")).toBe(true);
    expect(shouldConfirmFixvoxCloudOperation("refresh")).toBe(true);
  });
});
