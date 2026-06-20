import { describe, expect, it, vi } from "vitest";
import { createFakeHostRuntimeClient } from "../../src/host-runtime/client";
import { createHostRuntimeClientRuntime } from "../../src/host-runtime/runtime-selection";
import { getRuntimeTranscriptionReadinessCommand } from "../../src/host-runtime/tauri-client";

describe("host runtime selection", () => {
  it("selects a Tauri invoke-backed host client for desktop runtime", async () => {
    const invoke = vi.fn(async () => ({
      configured: true,
      provider: "groq",
      model: "whisper-large-v3",
      artifactRoot: "artifacts/microphone-capture",
      supportsRealProviderCall: true,
    }));

    const runtime = createHostRuntimeClientRuntime({
      isTauriRuntime: true,
      invokeImpl: invoke,
    });

    expect(runtime.label).toBe("Tauri host transcription");
    await expect(runtime.client.getReadiness()).resolves.toMatchObject({
      configured: true,
      provider: "groq",
    });
    expect(invoke).toHaveBeenCalledWith(getRuntimeTranscriptionReadinessCommand);
  });

  it("selects an unavailable host client for browser/dev runtime", async () => {
    const runtime = createHostRuntimeClientRuntime({ isTauriRuntime: false });

    expect(runtime.label).toBe("Browser unavailable host");
    await expect(runtime.client.getReadiness()).resolves.toMatchObject({
      configured: false,
      reason: { code: "HOST_RUNTIME_UNAVAILABLE", redacted: true },
    });
  });

  it("allows tests to inject a fake browser host client", async () => {
    const fakeClient = createFakeHostRuntimeClient({
      readiness: {
        configured: true,
        provider: "groq",
        model: "fake-model",
        artifactRoot: "artifacts/microphone-capture",
        supportsRealProviderCall: false,
      },
    });

    const runtime = createHostRuntimeClientRuntime({
      isTauriRuntime: false,
      browserClient: fakeClient,
    });

    expect(runtime.label).toBe("Browser unavailable host");
    await expect(runtime.client.getReadiness()).resolves.toMatchObject({
      configured: true,
      model: "fake-model",
    });
  });
});
