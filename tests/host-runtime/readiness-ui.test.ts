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
      reason: {
        code: "IGNORED_SECRET_CONTEXT",
        message: `configured with ${secret}`,
        redacted: true,
      },
    });

    expect(ui).toEqual({
      status: "configured",
      statusLabel: "Ready",
      providerLabel: "groq",
      modelLabel: "whisper-large-v3",
      detail: "Host transcription is configured for groq / whisper-large-v3.",
      supportsRealProviderCallLabel: "Real provider gated",
    });
    expect(JSON.stringify(ui)).not.toContain(secret);
    expect(JSON.stringify(ui)).not.toContain("GROQ_API_KEY");
  });

  it("labels unavailable/setup-error readiness with redacted setup guidance", () => {
    const ui = describeHostReadiness({
      configured: false,
      artifactRoot: "artifacts/microphone-capture",
      supportsRealProviderCall: false,
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
    });
    expect(JSON.stringify(ui)).not.toContain(secret);
  });
});
