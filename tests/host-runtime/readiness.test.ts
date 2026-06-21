import { afterEach, describe, expect, it, vi } from "vitest";
import { createHostRuntimeReadiness } from "../../src/host-runtime/readiness";

const secretKey = "gsk_test_secret_do_not_expose";

describe("host runtime readiness", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports missing provider config with a redacted setup reason", () => {
    const readiness = createHostRuntimeReadiness();

    expect(readiness).toEqual({
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
    expect(JSON.stringify(readiness)).not.toContain("GROQ_API_KEY=");
    expect(JSON.stringify(readiness)).not.toContain("Authorization");
  });

  it("maps underscore env keys to configured Groq readiness without exposing secrets", () => {
    const readiness = createHostRuntimeReadiness({
      GROQ_API_KEY: secretKey,
      GROQ_STT_MODEL: "whisper-large-v3-turbo",
    });

    expect(readiness).toEqual({
      configured: true,
      provider: "groq",
      model: "whisper-large-v3-turbo",
      artifactRoot: "artifacts/microphone-capture",
      supportsRealProviderCall: true,
      directByokConfigured: true,
      managedCloudConfigured: true,
      managedDeviceRegistered: false,
      managedBackendBaseUrl: "https://auth-fixvox.jpsala.dev",
    });
    expect(JSON.stringify(readiness)).not.toContain(secretKey);
  });

  it("reports managed cloud readiness and device state without provider secrets", () => {
    const readiness = createHostRuntimeReadiness({
      GROQ_API_KEY: secretKey,
      FIXVOX_BACKEND_URL: " https://auth-fixvox.jpsala.dev/ ",
      FIXVOX_DEVICE_ID: "dev_test_1234567890abcdef",
    });

    expect(readiness).toMatchObject({
      configured: true,
      directByokConfigured: true,
      managedCloudConfigured: true,
      managedDeviceRegistered: true,
      managedBackendBaseUrl: "https://auth-fixvox.jpsala.dev",
    });
    expect(JSON.stringify(readiness)).not.toContain(secretKey);
    expect(JSON.stringify(readiness)).not.toContain("Authorization");
  });

  it("treats managed cloud with a device id as configured without direct BYOK", () => {
    const readiness = createHostRuntimeReadiness({
      FIXVOX_BACKEND_URL: " https://auth-fixvox.jpsala.dev/ ",
      FIXVOX_DEVICE_ID: "dev_test_1234567890abcdef",
      FIXVOX_STT_MODEL: "whisper-large-v3",
    });

    expect(readiness).toMatchObject({
      configured: true,
      provider: "fixvox-cloud",
      model: "whisper-large-v3",
      supportsRealProviderCall: true,
      directByokConfigured: false,
      managedCloudConfigured: true,
      managedDeviceRegistered: true,
      managedBackendBaseUrl: "https://auth-fixvox.jpsala.dev",
    });
    expect(readiness.reason).toBeUndefined();
    expect(JSON.stringify(readiness)).not.toContain("Authorization");
  });

  it("rejects stale managed cloud backend readiness while keeping direct BYOK explicit", () => {
    const readiness = createHostRuntimeReadiness({
      GROQ_API_KEY: secretKey,
      FIXVOX_API_BASE_URL: "https://fixvox-api.jpsala.dev",
    });

    expect(readiness).toMatchObject({
      configured: true,
      directByokConfigured: true,
      managedCloudConfigured: false,
      managedDeviceRegistered: false,
      managedCloudReason: {
        code: "FIXVOX_BACKEND_URL_STALE",
        redacted: true,
      },
    });
  });

  it("accepts legacy hyphen env keys for local runtime config", () => {
    const readiness = createHostRuntimeReadiness({
      "GROQ-API-KEY": secretKey,
      "GROQ-STT-MODEL": "distil-whisper-large-v3-en",
    });

    expect(readiness).toMatchObject({
      configured: true,
      provider: "groq",
      model: "distil-whisper-large-v3-en",
      supportsRealProviderCall: true,
    });
    expect(JSON.stringify(readiness)).not.toContain(secretKey);
  });

  it("does not read ambient env, audio, fetch, or provider boundaries", () => {
    const originalProcessEnvKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = secretKey;
    const fetchSpy = vi.fn();
    const readAudioFile = vi.fn();
    const providerCall = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    try {
      const readiness = createHostRuntimeReadiness({
        env: {},
        readAudioFile,
        providerCall,
      } as Parameters<typeof createHostRuntimeReadiness>[0] & {
        readAudioFile: typeof readAudioFile;
        providerCall: typeof providerCall;
      });

      expect(readiness).toMatchObject({
        configured: false,
        supportsRealProviderCall: false,
        reason: { redacted: true },
      });
      expect(JSON.stringify(readiness)).not.toContain(secretKey);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(readAudioFile).not.toHaveBeenCalled();
      expect(providerCall).not.toHaveBeenCalled();
    } finally {
      if (originalProcessEnvKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalProcessEnvKey;
      }
    }
  });
});
