import { describe, expect, it, vi } from "vitest";
import { DesktopDictationController } from "../../src/desktop-control/controller";
import type {
  DesktopAutoStopSilencePolicy,
  DesktopCaptureGateway,
  DesktopRuntimeGateway,
} from "../../src/desktop-control/controller";
import type { DesktopDeliveryGateway } from "../../src/delivery";
import {
  isActiveDesktopDictationState,
  isTerminalDesktopDictationState,
  rememberDesktopControlEvent,
  resolveDesktopControlTransition,
} from "../../src/desktop-control/types";
import { createControlEvent, createSession } from "./desktop-control-fixtures";

describe("desktop dictation foundation state transitions", () => {
  it("starts from idle through the same contract used by app controls", () => {
    const decision = resolveDesktopControlTransition(
      { state: "idle" },
      createControlEvent({ action: "start" }),
    );

    expect(decision).toEqual({
      accepted: true,
      effectiveAction: "start",
      nextState: "arming",
    });
  });

  it("maps toggle to start from idle and stop from listening", () => {
    expect(
      resolveDesktopControlTransition(
        { state: "idle" },
        createControlEvent({ action: "toggle" }),
      ),
    ).toMatchObject({
      accepted: true,
      effectiveAction: "start",
      nextState: "arming",
    });

    expect(
      resolveDesktopControlTransition(
        createSession({ state: "listening" }),
        createControlEvent({ action: "toggle" }),
      ),
    ).toMatchObject({
      accepted: true,
      effectiveAction: "stop",
      nextState: "stopping",
    });
  });

  it("allows a new recording from review without treating transcript review as overlap", () => {
    const decision = resolveDesktopControlTransition(
      createSession({ state: "reviewing" }),
      createControlEvent({ action: "start" }),
    );

    expect(decision).toEqual({
      accepted: true,
      effectiveAction: "start",
      nextState: "arming",
    });
  });

  it("allows cancellation from active work and marks the next state terminal", () => {
    const decision = resolveDesktopControlTransition(
      createSession({ state: "transcribing" }),
      createControlEvent({ action: "cancel" }),
    );

    expect(decision).toMatchObject({
      accepted: true,
      effectiveAction: "cancel",
      nextState: "cancelled",
    });

    if (decision.accepted) {
      expect(isTerminalDesktopDictationState(decision.nextState)).toBe(true);
    }
  });
});

describe("desktop dictation foundation no-overlap and dedupe", () => {
  it("rejects overlapping starts while a session is active", () => {
    for (const state of ["arming", "listening", "transcribing", "delivering"] as const) {
      const decision = resolveDesktopControlTransition(
        createSession({ state }),
        createControlEvent({ action: "start" }),
      );

      expect(isActiveDesktopDictationState(state)).toBe(true);
      expect(decision).toEqual({
        accepted: false,
        reason: "overlap",
        message: `A ${state} dictation session is already active.`,
        currentState: state,
      });
    }
  });

  it("dedupes repeated desktop control event ids before transition handling", () => {
    const event = createControlEvent({ id: "fake-toggle-001", action: "toggle" });
    const first = rememberDesktopControlEvent(new Set<string>(), event);
    const second = rememberDesktopControlEvent(first.seenEventIds, event);

    expect(first.duplicate).toBe(false);
    expect(first.seenEventIds.has("fake-toggle-001")).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.seenEventIds).toBe(first.seenEventIds);
  });
});

describe("DesktopDictationController US1 session lifecycle", () => {
  it("starts fake capture into listening, then stops into transcript review", async () => {
    const captureArtifact = { captureId: "clip-001", artifactPolicy: "gitignored-local" };
    const capture: DesktopCaptureGateway = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => captureArtifact),
    };
    const runtime: DesktopRuntimeGateway = {
      transcribe: vi.fn(async ({ capture }) => ({
        transcript: "fake transcript",
        output: "fake transcript",
        provider: "fake-host-runtime",
        model: "fake-model",
        latencyMs: 3,
        requestId: "redacted-request",
        capture,
      })),
    };
    const controller = createController({ capture, runtime });

    await expect(controller.handleControl(createControlEvent({ action: "start" }))).resolves.toMatchObject({
      sessionId: "desktop-session-001",
      state: "listening",
      controlSource: "app_button",
    });
    expect(capture.start).toHaveBeenCalledTimes(1);
    expect(runtime.transcribe).not.toHaveBeenCalled();

    await expect(controller.handleControl(createControlEvent({ action: "stop", id: "stop-001" }))).resolves.toMatchObject({
      sessionId: "desktop-session-001",
      state: "reviewing",
      capture: captureArtifact,
      runtime: {
        transcript: "fake transcript",
        output: "fake transcript",
        provider: "fake-host-runtime",
      },
      delivery: {
        status: "available",
        output: "fake transcript",
        strategy: "review_only",
      },
      recoveryAction: {
        kind: "copy_manually",
        label: "Copy transcript manually",
        clipAvailable: true,
      },
    });
    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(runtime.transcribe).toHaveBeenCalledWith({
      sessionId: "desktop-session-001",
      capture: captureArtifact,
      event: expect.objectContaining({ action: "stop" }),
    });
  });

  it("feeds review-only delivery evidence into a runtime summary without paste observation", async () => {
    const controller = createController({
      runtime: {
        transcribe: vi.fn(async () => ({
          transcript: "summary transcript",
          summary: {
            terminalState: "done",
            deliveryEvidence: {
              status: "failed",
              output: "stale delivery",
              reason: "should be replaced",
            },
          },
        })),
      },
    });

    await controller.handleControl(createControlEvent({ action: "start" }));
    const reviewed = await controller.handleControl(
      createControlEvent({ action: "stop", id: "stop-summary-delivery" }),
    );

    expect(reviewed).toMatchObject({
      state: "reviewing",
      delivery: {
        status: "available",
        output: "summary transcript",
        strategy: "review_only",
      },
      runtime: {
        summary: {
          deliveryEvidence: {
            status: "available",
            output: "summary transcript",
            reason: "Transcript is available for review and manual copy.",
          },
        },
      },
    });
    expect(JSON.stringify(reviewed)).not.toContain("paste_observed");
  });

  it("preserves verified paste observation from a trusted desktop delivery gateway", async () => {
    const delivery: DesktopDeliveryGateway = {
      deliver: vi.fn(async (request) => ({
        status: "paste_observed" as const,
        output: request.text,
        strategy: "paste_send" as const,
        message: "Paste insertion was observed by a verified desktop observer.",
        reason: "Native observer confirmed insertion.",
      })),
    };
    const controller = createController({
      delivery,
      allowDesktopDeliverySideEffects: true,
      runtime: {
        transcribe: vi.fn(async () => ({
          transcript: "observed transcript",
          summary: {
            terminalState: "done",
            transcript: "observed transcript",
            output: "observed transcript",
            events: [],
          },
        })),
      },
    });

    await controller.handleControl(createControlEvent({ action: "start" }));
    const reviewed = await controller.handleControl(
      createControlEvent({ action: "stop", id: "stop-observed-delivery" }),
    );

    expect(reviewed).toMatchObject({
      state: "reviewing",
      delivery: {
        status: "paste_observed",
        strategy: "paste_send",
        output: "observed transcript",
      },
      runtime: {
        summary: {
          deliveryEvidence: {
            status: "paste_observed",
            output: "observed transcript",
            reason: "Native observer confirmed insertion.",
          },
        },
      },
    });
  });

  it("rejects overlapping starts without replacing the active session", async () => {
    const controller = createController();

    const started = await controller.handleControl(createControlEvent({ action: "start" }));
    const overlap = await controller.handleControl(createControlEvent({ action: "start", id: "start-overlap" }));

    expect(started).toMatchObject({
      sessionId: "desktop-session-001",
      state: "listening",
    });
    expect(overlap).toMatchObject({
      sessionId: "desktop-session-001",
      state: "listening",
      error: {
        code: "overlap",
        message: "A listening dictation session is already active.",
      },
      recoveryAction: {
        kind: "dismiss",
      },
    });
  });

  it("cancels during capture setup and does not transcribe or deliver partial text", async () => {
    const startGate = createDeferred<void>();
    const capture: DesktopCaptureGateway = {
      start: vi.fn(() => startGate.promise),
      stop: vi.fn(async () => ({ captureId: "should-not-stop" })),
      cancel: vi.fn(async () => undefined),
    };
    const runtime: DesktopRuntimeGateway = {
      transcribe: vi.fn(async () => ({ transcript: "should-not-transcribe" })),
    };
    const controller = createController({ capture, runtime });

    const start = controller.handleControl(createControlEvent({ action: "start" }));
    expect(controller.getState()).toMatchObject({ state: "arming" });

    const cancelled = await controller.handleControl(createControlEvent({ action: "cancel", id: "cancel-during-start" }));
    startGate.resolve();
    await start;

    expect(cancelled).toMatchObject({
      state: "cancelled",
      delivery: undefined,
      recoveryAction: {
        kind: "dismiss",
      },
    });
    expect(capture.cancel).toHaveBeenCalledTimes(1);
    expect(capture.stop).not.toHaveBeenCalled();
    expect(runtime.transcribe).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ state: "cancelled", delivery: undefined });
  });

  it("cancels during transcription and does not attach delivery evidence", async () => {
    const runtimeGate = createDeferred<{ transcript: string }>();
    const controller = createController({
      runtime: {
        transcribe: vi.fn(() => runtimeGate.promise),
      },
    });

    await controller.handleControl(createControlEvent({ action: "start" }));
    const stop = controller.handleControl(createControlEvent({ action: "stop", id: "stop-for-cancel" }));
    await Promise.resolve();
    expect(controller.getState()).toMatchObject({ state: "transcribing" });

    const cancelled = await controller.handleControl(createControlEvent({ action: "cancel", id: "cancel-during-runtime" }));
    runtimeGate.resolve({ transcript: "late transcript" });
    await stop;

    expect(cancelled).toMatchObject({ state: "cancelled", delivery: undefined });
    expect(controller.getState()).toMatchObject({ state: "cancelled", delivery: undefined });
  });

  it("returns retry-from-clip guidance when runtime fails after capture", async () => {
    const captureArtifact = { captureId: "clip-before-runtime-failure" };
    const controller = createController({
      capture: {
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => captureArtifact),
      },
      runtime: {
        transcribe: vi.fn(async () => {
          throw new Error("Managed runtime unavailable.");
        }),
      },
    });

    await controller.handleControl(createControlEvent({ action: "start" }));
    const failed = await controller.handleControl(createControlEvent({ action: "stop", id: "stop-runtime-fails" }));

    expect(failed).toMatchObject({
      state: "error",
      capture: captureArtifact,
      error: {
        code: "runtime-failed",
        message: "Managed runtime unavailable.",
      },
      recoveryAction: {
        kind: "retry_from_clip",
        label: "Retry from captured clip",
        clipAvailable: true,
      },
    });
  });

  it("auto-stops after configured live silence and proceeds through the normal submit path", async () => {
    let nowMs = 1_000;
    const scheduler = createManualScheduler();
    const levels = [
      { active: true, vuLevel: 0.005 },
      { active: true, vuLevel: 0.005 },
    ];
    const capture: DesktopCaptureGateway = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => ({ captureId: "auto-stop-clip" })),
      getLevel: vi.fn(async () => levels.shift() ?? { active: true, vuLevel: 0.005 }),
    };
    const runtime: DesktopRuntimeGateway = {
      transcribe: vi.fn(async () => ({ transcript: "auto-stopped transcript" })),
    };
    const controller = createController({
      capture,
      runtime,
      autoStop: { enabled: true, silenceMs: 500, pollMs: 100, silenceThreshold: 0.02 },
      scheduler,
      clockMs: () => nowMs,
    });

    await controller.handleControl(createControlEvent({ action: "start" }));
    expect(scheduler.setInterval).toHaveBeenCalledWith(expect.any(Function), 100);

    scheduler.tick();
    await flushPromises();
    expect(capture.stop).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ state: "listening" });

    nowMs += 600;
    scheduler.tick();
    await flushPromises();

    expect(capture.stop).toHaveBeenCalledWith({
      sessionId: "desktop-session-001",
      event: expect.objectContaining({
        action: "stop",
        id: "desktop-session-001:auto-stop-silence",
      }),
    });
    expect(runtime.transcribe).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      state: "reviewing",
      capture: { captureId: "auto-stop-clip" },
      runtime: { transcript: "auto-stopped transcript" },
    });
    expect(scheduler.clearInterval).toHaveBeenCalledTimes(1);
  });

  it("does not auto-stop across short pauses when speech resumes", async () => {
    let nowMs = 2_000;
    const scheduler = createManualScheduler();
    const levels = [
      { active: true, vuLevel: 0.005 },
      { active: true, vuLevel: 0.5 },
      { active: true, vuLevel: 0.005 },
    ];
    const capture: DesktopCaptureGateway = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => ({ captureId: "manual-after-short-pause" })),
      getLevel: vi.fn(async () => levels.shift() ?? { active: true, vuLevel: 0.5 }),
    };
    const controller = createController({
      capture,
      autoStop: { enabled: true, silenceMs: 500, pollMs: 100, silenceThreshold: 0.02 },
      scheduler,
      clockMs: () => nowMs,
    });

    await controller.handleControl(createControlEvent({ action: "start" }));
    scheduler.tick();
    await flushPromises();
    nowMs += 300;
    scheduler.tick();
    await flushPromises();
    nowMs += 600;
    scheduler.tick();
    await flushPromises();

    expect(capture.stop).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ state: "listening" });

    await controller.handleControl(createControlEvent({ action: "stop", id: "manual-stop-after-short-pause" }));
    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(capture.stop).toHaveBeenCalledWith(expect.objectContaining({
      event: expect.objectContaining({ id: "manual-stop-after-short-pause" }),
    }));
  });

  it("keeps recording through silence when auto-stop is disabled", async () => {
    let nowMs = 3_000;
    const scheduler = createManualScheduler();
    const capture: DesktopCaptureGateway = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => ({ captureId: "disabled-auto-stop-clip" })),
      getLevel: vi.fn(async () => ({ active: true, vuLevel: 0.001 })),
    };
    const controller = createController({
      capture,
      autoStop: { enabled: false, silenceMs: 500, pollMs: 100, silenceThreshold: 0.02 },
      scheduler,
      clockMs: () => nowMs,
    });

    await controller.handleControl(createControlEvent({ action: "start" }));
    expect(scheduler.setInterval).not.toHaveBeenCalled();

    nowMs += 2_000;
    scheduler.tick();
    await flushPromises();

    expect(capture.getLevel).not.toHaveBeenCalled();
    expect(capture.stop).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ state: "listening" });
  });

  it("retries from a captured clip and exposes record-again guidance when no clip exists", async () => {
    const captureArtifact = { captureId: "clip-for-retry" };
    const runtime = vi
      .fn()
      .mockResolvedValueOnce({ transcript: "first transcript" })
      .mockRejectedValueOnce(new Error("Managed runtime unavailable."))
      .mockResolvedValueOnce({ transcript: "retry transcript" });
    const controller = createController({
      capture: {
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => captureArtifact),
      },
      runtime: {
        transcribe: runtime,
      },
    });

    await controller.handleControl(createControlEvent({ action: "start" }));
    await controller.handleControl(createControlEvent({ action: "stop", id: "stop-before-retry" }));
    const failedRetry = await controller.handleControl(createControlEvent({ action: "retry", id: "retry-fail" }));

    expect(failedRetry).toMatchObject({
      state: "error",
      capture: captureArtifact,
      error: {
        code: "retry-failed",
        message: "Managed runtime unavailable.",
      },
      recoveryAction: {
        kind: "retry_from_clip",
        clipAvailable: true,
      },
    });

    const recovered = await controller.handleControl(createControlEvent({ action: "retry", id: "retry-success" }));
    expect(recovered).toMatchObject({
      state: "reviewing",
      runtime: {
        transcript: "retry transcript",
      },
      recoveryAction: {
        kind: "copy_manually",
      },
    });

    const noClipController = createController();
    const noClip = await noClipController.handleControl(
      createControlEvent({ action: "retry", id: "retry-without-clip" }),
    );

    expect(noClip).toMatchObject({
      state: "error",
      error: {
        code: "invalid_transition",
      },
      recoveryAction: {
        kind: "record_again",
        clipAvailable: false,
      },
    });
  });
});

function createController(input: {
  capture?: DesktopCaptureGateway;
  runtime?: DesktopRuntimeGateway;
  delivery?: DesktopDeliveryGateway;
  allowDesktopDeliverySideEffects?: boolean;
  autoStop?: DesktopAutoStopSilencePolicy;
  scheduler?: {
    setInterval(callback: () => void, ms: number): unknown;
    clearInterval(handle: unknown): void;
  };
  clockMs?: () => number;
} = {}) {
  return new DesktopDictationController({
    capture: input.capture ?? {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => ({ captureId: "clip-default" })),
      cancel: vi.fn(async () => undefined),
    },
    runtime: input.runtime ?? {
      transcribe: vi.fn(async () => ({ transcript: "default transcript" })),
    },
    delivery: input.delivery,
    allowDesktopDeliverySideEffects: input.allowDesktopDeliverySideEffects,
    autoStop: input.autoStop,
    scheduler: input.scheduler,
    createSessionId: () => "desktop-session-001",
    now: () => "2026-06-22T10:00:05.000Z",
    clockMs: input.clockMs,
  });
}

function createManualScheduler() {
  let intervalCallback: (() => void) | undefined;
  return {
    setInterval: vi.fn((callback: () => void) => {
      intervalCallback = callback;
      return "manual-interval";
    }),
    clearInterval: vi.fn(() => {
      intervalCallback = undefined;
    }),
    tick() {
      intervalCallback?.();
    },
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}
