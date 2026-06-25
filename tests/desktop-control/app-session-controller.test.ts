import { describe, expect, it, vi } from "vitest";
import type { CaptureGateway } from "../../src/capture/gateway";
import type { HostRuntimeClient } from "../../src/host-runtime/types";
import {
  createAppSessionControllerFacade,
  createCaptureGatewayControllerAdapter,
  createHostRuntimeControllerAdapter,
} from "../../src/desktop-control/app-session";
import { createRuntimeClip } from "../runtime-transcription/runtime-fixtures";

describe("App desktop session controller seam", () => {
  it("maps app button methods to normalized controller events", async () => {
    const handleControl = vi.fn(async (event) => ({
      sessionId: "session-from-facade",
      controlSource: event.source,
      state: "listening" as const,
    }));
    const facade = createAppSessionControllerFacade(
      {
        getState: () => ({ state: "idle" }),
        handleControl,
      },
      {
        now: () => "2026-06-22T11:00:00.000Z",
        createEventId: (action) => `app-${action}`,
      },
    );

    await facade.start();
    await facade.stop();
    await facade.cancel();
    await facade.handle("start", {
      source: "global_hotkey",
      id: "dictation-key-press",
      receivedAt: "2026-06-22T11:00:01.000Z",
    });

    expect(handleControl).toHaveBeenNthCalledWith(1, {
      id: "app-start",
      source: "app_button",
      action: "start",
      receivedAt: "2026-06-22T11:00:00.000Z",
    });
    expect(handleControl).toHaveBeenNthCalledWith(2, {
      id: "app-stop",
      source: "app_button",
      action: "stop",
      receivedAt: "2026-06-22T11:00:00.000Z",
    });
    expect(handleControl).toHaveBeenNthCalledWith(3, {
      id: "app-cancel",
      source: "app_button",
      action: "cancel",
      receivedAt: "2026-06-22T11:00:00.000Z",
    });
    expect(handleControl).toHaveBeenNthCalledWith(4, {
      id: "dictation-key-press",
      source: "global_hotkey",
      action: "start",
      receivedAt: "2026-06-22T11:00:01.000Z",
    });
  });

  it("adapts the existing capture gateway without desktop side effects in tests", async () => {
    const gateway: CaptureGateway = {
      getPermissionState: vi.fn(async () => "granted"),
      startCapture: vi.fn(async () => ({
        captureId: "capture-from-app-adapter",
        source: "microphone",
        permissionStatus: "granted",
        artifactPolicy: "gitignored-local",
      })),
      stopCapture: vi.fn(async () => createCapturedAudioResult()),
      cancelCapture: vi.fn(async () => ({
        ok: false,
        metadata: {
          captureId: "cancelled-capture",
          source: "microphone",
          permissionStatus: "granted",
          artifactPolicy: "gitignored-local",
        },
        error: {
          phase: "cancelled",
          code: "cancelled",
          message: "Capture cancelled.",
        },
      })),
    };
    const adapter = createCaptureGatewayControllerAdapter(gateway);

    await expect(adapter.start({ sessionId: "session-1", event: appEvent("start") })).resolves.toMatchObject({
      captureId: "capture-from-app-adapter",
    });
    await expect(adapter.stop({ sessionId: "session-1", event: appEvent("stop") })).resolves.toMatchObject({
      ok: true,
    });
    await adapter.cancel?.({ sessionId: "session-1", event: appEvent("cancel") });

    expect(gateway.getPermissionState).toHaveBeenCalledTimes(1);
    expect(gateway.startCapture).toHaveBeenCalledTimes(1);
    expect(gateway.stopCapture).toHaveBeenCalledTimes(1);
    expect(gateway.cancelCapture).toHaveBeenCalledTimes(1);
  });

  it("uses materialized host runtime text as transcript and delivery output", async () => {
    const client: HostRuntimeClient = {
      async getReadiness() {
        throw new Error("readiness not needed");
      },
      async transcribeCapturedAudio() {
        return {
          status: "ok",
          text: "materialized final text",
          provider: "fixvox-cloud",
          model: "whisper-large-v3",
          latencyMs: 12,
          postProcess: {
            enabled: true,
            ran: true,
            provider: "groq",
            model: "openai/gpt-oss-120b",
            source: "policy",
            policyId: "pro",
            voiceRoutingProfileId: "pro-post-process",
            sanitizedChanged: true,
            sanitizerReason: "final_marker",
            fallbackToRaw: false,
            rawTranscriptLength: 10,
            finalTextLength: 23,
            redacted: true,
          },
          redacted: true,
        };
      },
    };
    const adapter = createHostRuntimeControllerAdapter(client, {
      mode: "real",
      allowProviderCall: true,
      postProcess: {
        enabled: true,
        prompt: "Clean dictated text",
        provider: "groq",
        model: "openai/gpt-oss-120b",
        source: "policy",
        policyId: "pro",
        voiceRoutingProfileId: "pro-post-process",
      },
    });

    const result = await adapter.transcribe({
      sessionId: "session-1",
      capture: createCapturedAudioResult(),
      event: appEvent("stop"),
    });

    expect(result.transcript).toBe("materialized final text");
    expect(result.output).toBe("materialized final text");
    expect(result.summary.deliveryEvidence).toMatchObject({
      status: "available",
      output: "materialized final text",
    });
  });

  it("keeps host runtime adapter provider-free unless explicitly allowed", async () => {
    const requests: unknown[] = [];
    const client: HostRuntimeClient = {
      async getReadiness() {
        throw new Error("readiness not needed");
      },
      async transcribeCapturedAudio(request) {
        requests.push(request);
        return {
          status: "ok",
          text: "adapter transcript",
          provider: "host-runtime-fake",
          model: "fake-model",
          latencyMs: 5,
          requestId: "redacted-request",
        };
      },
    };
    const adapter = createHostRuntimeControllerAdapter(client);

    const result = await adapter.transcribe({
      sessionId: "session-1",
      capture: createCapturedAudioResult(),
      event: appEvent("stop"),
    });

    expect(result).toMatchObject({
      transcript: "adapter transcript",
      provider: "host-runtime-fake",
      model: "fake-model",
      summary: {
        terminalState: "done",
        deliveryEvidence: {
          status: "available",
          output: "adapter transcript",
        },
      },
    });
    expect(requests).toEqual([
      expect.objectContaining({
        mode: "dry-run",
        allowProviderCall: false,
      }),
    ]);
  });
});

function appEvent(action: "start" | "stop" | "cancel") {
  return {
    id: `app-${action}`,
    source: "app_button" as const,
    action,
    receivedAt: "2026-06-22T11:00:00.000Z",
  };
}

function createCapturedAudioResult() {
  const artifact = createRuntimeClip();

  return {
    ok: true as const,
    metadata: {
      captureId: artifact.captureId,
      source: "microphone" as const,
      permissionStatus: "granted" as const,
      artifactPolicy: "gitignored-local" as const,
      durationMs: artifact.durationMs,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes,
      artifact,
      deviceKind: "audioinput",
      deviceLabel: "redacted-test-device",
    },
    artifact,
  };
}
