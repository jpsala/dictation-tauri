import { describe, expect, it, vi } from "vitest";
import {
  DesktopDictationController,
  type DesktopCaptureGateway,
  type DesktopRuntimeGateway,
} from "../../src/desktop-control/controller";
import { createFakeHostControlEventSource } from "../../src/desktop-control/fake-host-control";
import { createUnavailableDesktopControlReadiness } from "../../src/desktop-control/types";
import { desktopTargetSnapshot } from "./desktop-control-fixtures";

describe("fake host desktop control events", () => {
  it("starts an idle session through a fake toggle event without real desktop side effects", async () => {
    const { controller, capture, runtime } = createController();
    const fakeHostControl = createFakeHostControlEventSource(controller, {
      now: () => "2026-06-22T10:00:02.000Z",
      createEventId: (action, receivedAt) => `fake-control:${action}:${receivedAt}`,
    });

    const started = await fakeHostControl.toggle({
      targetSnapshot: desktopTargetSnapshot,
    });

    expect(started).toMatchObject({
      sessionId: "desktop-session-001",
      controlSource: "fake_host_event",
      state: "listening",
      startedAt: "2026-06-22T10:00:02.000Z",
    });
    expect(capture.start).toHaveBeenCalledWith({
      sessionId: "desktop-session-001",
      event: expect.objectContaining({
        id: "fake-control:toggle:2026-06-22T10:00:02.000Z",
        source: "fake_host_event",
        action: "toggle",
        receivedAt: "2026-06-22T10:00:02.000Z",
        targetSnapshot: desktopTargetSnapshot,
      }),
    });
    expect(capture.stop).not.toHaveBeenCalled();
    expect(runtime.transcribe).not.toHaveBeenCalled();
  });

  it("stops a listening session through a fake toggle event and submits the safe pipeline", async () => {
    const captureArtifact = {
      captureId: "fake-toggle-clip",
      artifactPolicy: "in-memory-test-double",
    };
    const capture: DesktopCaptureGateway = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => captureArtifact),
      cancel: vi.fn(async () => undefined),
    };
    const runtime: DesktopRuntimeGateway = {
      transcribe: vi.fn(async ({ capture }) => ({
        transcript: "fake stopped transcript",
        output: "fake stopped transcript",
        provider: "fake-host-runtime",
        model: "fake-model",
        capture,
      })),
    };
    const { controller } = createController({ capture, runtime });
    const fakeHostControl = createFakeHostControlEventSource(controller);

    await fakeHostControl.toggle({
      id: "fake-toggle-start",
      receivedAt: "2026-06-22T10:00:03.000Z",
    });
    const reviewed = await fakeHostControl.toggle({
      id: "fake-toggle-stop",
      receivedAt: "2026-06-22T10:00:04.000Z",
      targetSnapshot: desktopTargetSnapshot,
    });

    expect(reviewed).toMatchObject({
      sessionId: "desktop-session-001",
      controlSource: "fake_host_event",
      state: "reviewing",
      capture: captureArtifact,
      runtime: {
        transcript: "fake stopped transcript",
        output: "fake stopped transcript",
        provider: "fake-host-runtime",
      },
      delivery: {
        status: "available",
        strategy: "review_only",
        output: "fake stopped transcript",
      },
      recoveryAction: {
        kind: "copy_manually",
        clipAvailable: true,
      },
    });
    expect(capture.stop).toHaveBeenCalledWith({
      sessionId: "desktop-session-001",
      event: expect.objectContaining({
        id: "fake-toggle-stop",
        source: "fake_host_event",
        action: "toggle",
        receivedAt: "2026-06-22T10:00:04.000Z",
        targetSnapshot: desktopTargetSnapshot,
      }),
    });
    expect(runtime.transcribe).toHaveBeenCalledWith({
      sessionId: "desktop-session-001",
      capture: captureArtifact,
      event: expect.objectContaining({
        id: "fake-toggle-stop",
        source: "fake_host_event",
        action: "toggle",
      }),
    });
    expect(JSON.stringify(reviewed)).not.toContain("paste_observed");
  });

  it("reports desktop control readiness as unavailable without registering real hotkeys", () => {
    expect(
      createUnavailableDesktopControlReadiness(
        "Desktop control host adapter is not configured.",
      ),
    ).toEqual({
      controlAvailable: false,
      hotkeyRegistered: false,
      deliveryAvailable: false,
      backgroundModeAvailable: false,
      reason: "Desktop control host adapter is not configured.",
    });
  });
});

function createController(input: {
  capture?: DesktopCaptureGateway;
  runtime?: DesktopRuntimeGateway;
} = {}) {
  const capture = input.capture ?? {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => ({ captureId: "fake-default-clip" })),
    cancel: vi.fn(async () => undefined),
  };
  const runtime = input.runtime ?? {
    transcribe: vi.fn(async () => ({ transcript: "default fake transcript" })),
  };

  return {
    controller: new DesktopDictationController({
      capture,
      runtime,
      createSessionId: () => "desktop-session-001",
      now: () => "2026-06-22T10:00:05.000Z",
    }),
    capture,
    runtime,
  };
}
