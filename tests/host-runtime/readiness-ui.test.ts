import { describe, expect, it } from "vitest";
import {
  describeHostReadiness,
  describeHostReadinessFailure,
} from "../../src/host-runtime/readiness-ui";

const secret = "gsk_test_secret_must_not_leak";

describe("host readiness UI labels", () => {
  it("labels configured host readiness with provider/model evidence and no secret leakage", () => {
    const ui = describeHostReadiness({
      configured: true,
      provider: "groq",
      model: "whisper-large-v3",
      artifactRoot: "artifacts/microphone-capture",
      supportsRealProviderCall: true,
      directByokConfigured: true,
      managedCloudConfigured: false,
      managedDeviceRegistered: false,
      reason: {
        code: "IGNORED_SECRET_CONTEXT",
        message: `configured with ${secret}`,
        redacted: true,
      },
    });

    expect(ui).toEqual({
      status: "configured",
      statusLabel: "Direct BYOK ready",
      providerLabel: "groq",
      modelLabel: "whisper-large-v3",
      detail: "Direct Groq BYOK is ready as an explicit fallback. Fixvox managed cloud is not ready.",
      supportsRealProviderCallLabel: "Real provider gated",
      managedCloudLabel: "Not configured",
      managedDeviceLabel: "Not available",
      directByokLabel: "Direct Groq BYOK ready",
    });
    expect(JSON.stringify(ui)).not.toContain(secret);
    expect(JSON.stringify(ui)).not.toContain("GROQ_API_KEY");
  });

  it("labels managed cloud ready when backend and device are registered", () => {
    const ui = describeHostReadiness({
      configured: true,
      provider: "fixvox-cloud",
      model: "whisper-large-v3",
      artifactRoot: "artifacts/microphone-capture",
      supportsRealProviderCall: true,
      directByokConfigured: false,
      managedCloudConfigured: true,
      managedDeviceRegistered: true,
      managedBackendBaseUrl: "https://auth-fixvox.jpsala.dev",
    });

    expect(ui).toMatchObject({
      status: "configured",
      statusLabel: "Managed cloud ready",
      providerLabel: "Fixvox managed cloud",
      managedCloudLabel: "Ready via https://auth-fixvox.jpsala.dev",
      managedDeviceLabel: "Registered",
      directByokLabel: "Direct Groq BYOK not configured",
    });
    expect(ui.detail).toBe(
      "Fixvox managed cloud is ready for gated transcription. Direct Groq BYOK is not configured and will not be used silently.",
    );
  });

  it("labels managed cloud device registration needed separately from direct BYOK", () => {
    const ui = describeHostReadiness({
      configured: false,
      artifactRoot: "artifacts/microphone-capture",
      supportsRealProviderCall: false,
      directByokConfigured: false,
      managedCloudConfigured: true,
      managedDeviceRegistered: false,
      managedBackendBaseUrl: "https://auth-fixvox.jpsala.dev",
      reason: {
        code: "GROQ_API_KEY_MISSING",
        message: "Groq STT provider is not configured.",
        redacted: true,
      },
    });

    expect(ui).toMatchObject({
      status: "device-needed",
      statusLabel: "Device registration needed",
      managedCloudLabel: "Backend configured: https://auth-fixvox.jpsala.dev",
      managedDeviceLabel: "Registration needed",
      directByokLabel: "Direct Groq BYOK not configured",
    });
    expect(ui.detail).toBe(
      "Fixvox managed cloud backend is configured, but this device is not registered yet. Direct Groq BYOK is not configured.",
    );
  });

  it("labels managed cloud backend unavailable separately from direct BYOK", () => {
    const ui = describeHostReadiness({
      configured: false,
      artifactRoot: "artifacts/microphone-capture",
      supportsRealProviderCall: false,
      directByokConfigured: false,
      managedCloudConfigured: false,
      managedDeviceRegistered: false,
      managedCloudReason: {
        code: "FIXVOX_BACKEND_UNAVAILABLE",
        message: "Configured Fixvox backend is unavailable.",
        redacted: true,
      },
      reason: {
        code: "GROQ_API_KEY_MISSING",
        message: "Groq STT provider is not configured.",
        redacted: true,
      },
    });

    expect(ui).toMatchObject({
      status: "backend-unavailable",
      statusLabel: "Backend unavailable",
      managedCloudLabel: "Backend unavailable",
      managedDeviceLabel: "Not available",
      directByokLabel: "Direct Groq BYOK not configured",
    });
    expect(ui.detail).toBe(
      "Fixvox managed cloud backend is unavailable or misconfigured. Direct Groq BYOK is not configured.",
    );
  });

  it("labels unavailable/setup-error readiness with redacted setup guidance", () => {
    const ui = describeHostReadiness({
      configured: false,
      artifactRoot: "artifacts/microphone-capture",
      supportsRealProviderCall: false,
      directByokConfigured: false,
      managedCloudConfigured: false,
      managedDeviceRegistered: false,
      reason: {
        code: "GROQ_API_KEY_MISSING",
        message: `Groq STT provider is not configured. GROQ_API_KEY=${secret}`,
        redacted: true,
      },
    });

    expect(ui).toMatchObject({
      status: "unconfigured",
      statusLabel: "Setup needed",
      providerLabel: "Not configured",
      modelLabel: "Not configured",
      supportsRealProviderCallLabel: "Provider calls disabled",
      managedCloudLabel: "Not configured",
      managedDeviceLabel: "Not available",
      directByokLabel: "Direct Groq BYOK not configured",
    });
    expect(ui.detail).toBe(
      "Groq STT provider is not configured. GROQ_API_KEY=[REDACTED]",
    );
    expect(JSON.stringify(ui)).not.toContain(secret);
  });

  it("labels readiness check failures without blocking capture availability", () => {
    const ui = describeHostReadinessFailure(
      new Error(`Tauri invoke failed with token ${secret}`),
    );

    expect(ui).toEqual({
      status: "failed",
      statusLabel: "Readiness unknown",
      providerLabel: "Unknown",
      modelLabel: "Unknown",
      detail: "Host readiness check failed. Capture remains available.",
      supportsRealProviderCallLabel: "Provider calls disabled",
      managedCloudLabel: "Unknown",
      managedDeviceLabel: "Unknown",
      directByokLabel: "Unknown",
    });
    expect(JSON.stringify(ui)).not.toContain(secret);
  });
});
