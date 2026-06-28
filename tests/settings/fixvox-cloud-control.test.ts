import { describe, expect, it } from "vitest";
import {
  shouldConfirmFixvoxCloudOperation,
  summarizeFixvoxCloudStatus,
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
      redacted: true,
    };

    const copy = summarizeFixvoxCloudStatus(status);

    expect(copy).toBe("Device linked · Alpha Basic.");
    expect(copy).not.toContain("dev_test_1234567890abcdef");
  });

  it("keeps real cloud operations behind explicit user confirmation", () => {
    expect(shouldConfirmFixvoxCloudOperation("activate", "FIXVOX-INVITE-123")).toBe(true);
    expect(shouldConfirmFixvoxCloudOperation("activate", "   ")).toBe(false);
    expect(shouldConfirmFixvoxCloudOperation("register")).toBe(true);
    expect(shouldConfirmFixvoxCloudOperation("refresh")).toBe(true);
  });
});
