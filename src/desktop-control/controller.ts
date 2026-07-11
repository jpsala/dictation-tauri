import {
  assertDefaultDeliveryEvidenceAllowed,
  createReviewOnlyDeliveryGateway,
  type DeliveryEvidence,
  type DeliveryStrategy,
  type DeliveryTargetAffinity,
  type DesktopDeliveryGateway,
} from "../delivery";
import type { AssistantSurface } from "../pipeline/types";
import {
  copyManuallyRecovery,
  createFailedDeliveryEvidence,
  dismissRecovery,
  isManagedPreflightFailure,
  mapDesktopFailureToRecovery,
  recordAgainRecovery,
  redactDesktopFailureMessage,
  retryFromClipRecovery,
} from "./recovery";
import type {
  DesktopControlEvent,
  DesktopDictationController as DesktopDictationControllerContract,
  DesktopDictationSession,
  DesktopRecoveryAction,
  IdleDesktopDictationState,
} from "./types";
import {
  createDesktopControlEvent,
  rememberDesktopControlEvent,
  resolveDesktopControlTransition,
} from "./types";

export type DesktopCaptureLevel = {
  active: boolean;
  vuLevel: number;
  sampleCount?: number;
};

export type DesktopCaptureGateway = {
  start(input: { sessionId: string; event: DesktopControlEvent }): Promise<unknown>;
  stop(input: { sessionId: string; event: DesktopControlEvent }): Promise<unknown>;
  cancel?(input: { sessionId: string; event: DesktopControlEvent }): Promise<void>;
  getLevel?(input: { sessionId: string }): Promise<DesktopCaptureLevel>;
};

export type DesktopRuntimeGateway = {
  transcribe(input: {
    sessionId: string;
    capture: unknown;
    event: DesktopControlEvent;
  }): Promise<DesktopRuntimeResult>;
};

export type DesktopAssistantAction =
  | { kind: "activate-preset"; presetId: string; presetName: string }
  | { kind: "open-settings" }
  | { kind: "show-history" };

export type DesktopRuntimeResult = {
  transcript: string;
  output?: string;
  assistantAction?: DesktopAssistantAction;
  assistantSurface?: AssistantSurface;
  deliveryStrategy?: Extract<DeliveryStrategy, "review_only" | "paste_send">;
  deliveryReason?: string;
  deliveryTargetAffinity?: DeliveryTargetAffinity;
  provider?: string;
  model?: string;
  latencyMs?: number;
  requestId?: string;
  summary?: unknown;
};

export type DesktopAutoStopSilencePolicy = {
  enabled: boolean;
  silenceMs: number;
  pollMs?: number;
  silenceThreshold?: number;
};

type DesktopScheduler = {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
};

export type DesktopDictationControllerOptions = {
  capture: DesktopCaptureGateway;
  runtime: DesktopRuntimeGateway;
  delivery?: DesktopDeliveryGateway;
  allowDesktopDeliverySideEffects?: boolean;
  autoStop?: DesktopAutoStopSilencePolicy;
  scheduler?: DesktopScheduler;
  createSessionId?: () => string;
  now?: () => string;
  clockMs?: () => number;
};

export class DesktopDictationController
  implements DesktopDictationControllerContract
{
  private current: DesktopDictationSession | IdleDesktopDictationState = {
    state: "idle",
  };
  private seenEventIds = new Set<string>();
  private cancelRequestedSessionIds = new Set<string>();
  private readonly capture: DesktopCaptureGateway;
  private readonly runtime: DesktopRuntimeGateway;
  private readonly delivery: DesktopDeliveryGateway;
  private readonly allowDesktopDeliverySideEffects: boolean;
  private readonly autoStop?: DesktopAutoStopSilencePolicy;
  private readonly scheduler: DesktopScheduler;
  private readonly createSessionId: () => string;
  private readonly now: () => string;
  private readonly clockMs: () => number;
  private autoStopInterval: unknown;
  private autoStopSilentSinceMs: number | undefined;

  constructor(options: DesktopDictationControllerOptions) {
    this.capture = options.capture;
    this.runtime = options.runtime;
    this.delivery = options.delivery ?? createReviewOnlyDeliveryGateway();
    this.allowDesktopDeliverySideEffects = options.allowDesktopDeliverySideEffects ?? false;
    this.autoStop = options.autoStop;
    this.scheduler = options.scheduler ?? globalScheduler;
    this.createSessionId = options.createSessionId ?? createDefaultSessionId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.clockMs = options.clockMs ?? Date.now;
  }

  getState(): DesktopDictationSession | IdleDesktopDictationState {
    return this.current;
  }

  async handleControl(
    event: DesktopControlEvent,
  ): Promise<DesktopDictationSession> {
    const dedupe = rememberDesktopControlEvent(this.seenEventIds, event);
    this.seenEventIds = new Set(dedupe.seenEventIds);

    if (dedupe.duplicate) {
      return this.ensureSession("Duplicate desktop control event was ignored.", {
        code: "duplicate-control-event",
      });
    }

    const decision = resolveDesktopControlTransition(this.current, event);
    if (!decision.accepted) {
      return this.rejectControl(event, decision.message, decision.reason);
    }

    switch (decision.effectiveAction) {
      case "start":
        return this.start(event);
      case "stop":
        return this.stop(event);
      case "cancel":
        return this.cancel(event);
      case "retry":
        return this.retry(event);
    }
  }

  private async start(event: DesktopControlEvent): Promise<DesktopDictationSession> {
    const session = this.replaceCurrent({
      sessionId: this.createSessionId(),
      controlSource: event.source,
      state: "arming",
      startedAt: event.receivedAt ?? this.now(),
    });

    try {
      await this.capture.start({ sessionId: session.sessionId, event });
      if (this.isCancellationRequested(session.sessionId)) {
        return this.finishCancelled(session, event);
      }

      const listening = this.patchCurrent(session.sessionId, {
        state: "listening",
      });
      this.startAutoStopMonitor(listening.sessionId);
      return listening;
    } catch (error) {
      const recovery = mapDesktopFailureToRecovery({
        kind: "capture_setup",
        cause: error,
        clipAvailable: false,
      });

      return this.finishError(session, recovery.error.message, {
        code: recovery.error.code ?? "capture-start-failed",
        recoveryAction: recovery.recoveryAction,
      });
    }
  }

  private async stop(event: DesktopControlEvent): Promise<DesktopDictationSession> {
    const session = this.requireCurrentSession();
    this.stopAutoStopMonitor();
    this.patchCurrent(session.sessionId, { state: "stopping" });

    try {
      const capture = await this.capture.stop({
        sessionId: session.sessionId,
        event,
      });
      if (this.isCancellationRequested(session.sessionId)) {
        return this.finishCancelled(session, event, { capture });
      }

      this.patchCurrent(session.sessionId, { capture, state: "transcribing" });
      const runtime = await this.runtime.transcribe({
        sessionId: session.sessionId,
        capture,
        event,
      });
      if (this.isCancellationRequested(session.sessionId)) {
        return this.finishCancelled(session, event, { capture, runtime });
      }

      return this.finishReviewing(session, event, { capture, runtime });
    } catch (error) {
      const current = this.requireCurrentSession();
      const clipAvailable = Boolean(current.capture);
      const recovery = mapDesktopFailureToRecovery({
        kind: isManagedPreflightFailure(error)
          ? "managed_preflight"
          : clipAvailable
            ? "runtime_transcription"
            : "capture_setup",
        cause: error,
        clipAvailable,
      });

      return this.finishError(session, recovery.error.message, {
        code: recovery.error.code ?? "runtime-failed",
        recoveryAction: recovery.recoveryAction,
      });
    }
  }

  private async cancel(event: DesktopControlEvent): Promise<DesktopDictationSession> {
    const session = this.requireCurrentSession();
    this.stopAutoStopMonitor();
    this.cancelRequestedSessionIds.add(session.sessionId);
    await this.capture.cancel?.({ sessionId: session.sessionId, event });
    return this.finishCancelled(session, event);
  }

  private async retry(event: DesktopControlEvent): Promise<DesktopDictationSession> {
    const previous = this.requireCurrentSession();
    if (!previous.capture) {
      return this.finishError(previous, "No reusable clip is available.", {
        code: "no-reusable-clip",
        recoveryAction: recordAgainRecovery(),
      });
    }

    const session = this.patchCurrent(previous.sessionId, {
      state: "transcribing",
      controlSource: event.source,
      error: undefined,
      recoveryAction: undefined,
    });

    try {
      const runtime = await this.runtime.transcribe({
        sessionId: session.sessionId,
        capture: session.capture,
        event,
      });
      if (this.isCancellationRequested(session.sessionId)) {
        return this.finishCancelled(session, event, {
          capture: session.capture,
          runtime,
        });
      }

      return this.finishReviewing(session, event, {
        capture: session.capture,
        runtime,
      });
    } catch (error) {
      const recovery = mapDesktopFailureToRecovery({
        kind: isManagedPreflightFailure(error)
          ? "managed_preflight"
          : "runtime_transcription",
        cause: error,
        clipAvailable: true,
        code: isManagedPreflightFailure(error) ? undefined : "retry-failed",
      });

      return this.finishError(session, recovery.error.message, {
        code: recovery.error.code ?? "retry-failed",
        recoveryAction: recovery.recoveryAction,
      });
    }
  }

  private async finishReviewing(
    session: DesktopDictationSession,
    event: DesktopControlEvent,
    input: {
      capture?: unknown;
      runtime: DesktopRuntimeResult;
    },
  ): Promise<DesktopDictationSession> {
    const text = input.runtime.output ?? input.runtime.transcript;
    const allowDesktopSideEffects =
      this.allowDesktopDeliverySideEffects && input.runtime.deliveryStrategy !== "review_only";
    const request = {
      sessionId: session.sessionId,
      text,
      strategy: allowDesktopSideEffects ? "paste_send" as const : "review_only" as const,
      allowDesktopSideEffects,
      targetSnapshot: event.targetSnapshot,
      targetAffinity: input.runtime.deliveryTargetAffinity,
    };
    let delivery: DeliveryEvidence;
    let recoveryAction = copyManuallyRecovery();

    try {
      delivery = await this.delivery.deliver(request);
      assertDefaultDeliveryEvidenceAllowed(delivery, {
        allowVerifiedPasteObservation:
          delivery.status === "paste_observed" &&
          isTrustedPasteObservationReason(delivery.reason),
      });
    } catch (error) {
      const recovery = mapDesktopFailureToRecovery({
        kind: "delivery",
        cause: error,
        clipAvailable: Boolean(input.capture),
        transcriptAvailable: true,
      });
      delivery = createFailedDeliveryEvidence(request, recovery.error.message);
      recoveryAction = recovery.recoveryAction;
    }

    return this.patchCurrent(session.sessionId, {
      capture: input.capture,
      runtime: attachDeliveryEvidenceToRuntime(input.runtime, delivery),
      delivery,
      state: "reviewing",
      recoveryAction,
    });
  }

  private startAutoStopMonitor(sessionId: string): void {
    this.stopAutoStopMonitor();
    if (!this.autoStop?.enabled || !this.capture.getLevel) {
      return;
    }

    const pollMs = Math.max(50, this.autoStop.pollMs ?? 100);
    this.autoStopInterval = this.scheduler.setInterval(() => {
      void this.checkAutoStopSilence(sessionId);
    }, pollMs);
  }

  private stopAutoStopMonitor(): void {
    if (this.autoStopInterval !== undefined) {
      this.scheduler.clearInterval(this.autoStopInterval);
      this.autoStopInterval = undefined;
    }
    this.autoStopSilentSinceMs = undefined;
  }

  private async checkAutoStopSilence(sessionId: string): Promise<void> {
    if (this.current.state !== "listening" || this.current.sessionId !== sessionId) {
      this.stopAutoStopMonitor();
      return;
    }

    const level = await this.capture.getLevel?.({ sessionId });
    if (!level?.active) {
      this.autoStopSilentSinceMs = undefined;
      return;
    }

    const threshold = this.autoStop?.silenceThreshold ?? 0.02;
    const nowMs = this.clockMs();
    if (level.vuLevel > threshold) {
      this.autoStopSilentSinceMs = undefined;
      return;
    }

    this.autoStopSilentSinceMs ??= nowMs;
    if (nowMs - this.autoStopSilentSinceMs < (this.autoStop?.silenceMs ?? 0)) {
      return;
    }

    this.stopAutoStopMonitor();
    await this.handleControl(
      createDesktopControlEvent({
        id: `${sessionId}:auto-stop-silence`,
        source: "unknown",
        action: "stop",
        receivedAt: this.now(),
      }),
    );
  }

  private rejectControl(
    event: DesktopControlEvent,
    message: string,
    code: string,
  ): DesktopDictationSession {
    if (this.current.state !== "idle") {
      return this.patchCurrent(this.current.sessionId, {
        error: { message, code },
        recoveryAction: dismissRecovery(),
      });
    }

    return this.replaceCurrent({
      sessionId: this.createSessionId(),
      controlSource: event.source,
      state: "error",
      startedAt: event.receivedAt ?? this.now(),
      endedAt: this.now(),
      error: { message, code },
      recoveryAction: recordAgainRecovery(),
    });
  }

  private ensureSession(
    message: string,
    input: { code: string },
  ): DesktopDictationSession {
    if (this.current.state !== "idle") {
      return this.patchCurrent(this.current.sessionId, {
        error: {
          message,
          code: input.code,
        },
        recoveryAction: dismissRecovery(),
      });
    }

    return this.replaceCurrent({
      sessionId: this.createSessionId(),
      controlSource: "unknown",
      state: "error",
      startedAt: this.now(),
      endedAt: this.now(),
      error: {
        message,
        code: input.code,
      },
      recoveryAction: recordAgainRecovery(),
    });
  }

  private finishCancelled(
    session: DesktopDictationSession,
    event: DesktopControlEvent,
    partial: Pick<DesktopDictationSession, "capture" | "runtime"> = {},
  ): DesktopDictationSession {
    return this.patchCurrent(session.sessionId, {
      ...partial,
      controlSource: event.source,
      delivery: undefined,
      endedAt: this.now(),
      error: undefined,
      recoveryAction: dismissRecovery(),
      state: "cancelled",
    });
  }

  private finishError(
    session: DesktopDictationSession,
    message: string,
    input: {
      code: string;
      cause?: unknown;
      recoveryAction: DesktopRecoveryAction;
    },
  ): DesktopDictationSession {
    return this.patchCurrent(session.sessionId, {
      endedAt: this.now(),
      error: {
        message: redactDesktopFailureMessage(input.cause, message),
        code: input.code,
      },
      recoveryAction: input.recoveryAction,
      state: "error",
    });
  }

  private replaceCurrent(
    session: DesktopDictationSession,
  ): DesktopDictationSession {
    this.current = session;
    return session;
  }

  private patchCurrent(
    sessionId: string,
    patch: Partial<DesktopDictationSession>,
  ): DesktopDictationSession {
    const session = this.requireCurrentSession();
    if (session.sessionId !== sessionId) {
      throw new Error("Cannot patch a stale desktop dictation session.");
    }

    this.current = {
      ...session,
      ...patch,
    };

    return this.current;
  }

  private requireCurrentSession(): DesktopDictationSession {
    if (this.current.state === "idle") {
      throw new Error("Desktop dictation controller has no active session.");
    }

    return this.current;
  }

  private isCancellationRequested(sessionId: string): boolean {
    return this.cancelRequestedSessionIds.has(sessionId);
  }
}

function attachDeliveryEvidenceToRuntime(
  runtime: DesktopRuntimeResult,
  delivery: DeliveryEvidence,
): DesktopRuntimeResult {
  const runtimeWithSummary = runtime as DesktopRuntimeResult & {
    summary?: {
      deliveryEvidence?: unknown;
    };
  };

  if (!runtimeWithSummary.summary) {
    return runtime;
  }

  return {
    ...runtime,
    summary: {
      ...runtimeWithSummary.summary,
      deliveryEvidence: {
        status: delivery.status,
        output: delivery.output,
        reason: runtime.deliveryReason ?? delivery.reason ?? delivery.message,
      },
    },
  };
}

export {
  copyManuallyRecovery,
  dismissRecovery,
  recordAgainRecovery,
  retryFromClipRecovery,
};

const globalScheduler: DesktopScheduler = {
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

function isTrustedPasteObservationReason(reason: string | undefined): boolean {
  if (!reason) {
    return false;
  }

  return /verified|observer|observed|confirmed/i.test(reason);
}

function createDefaultSessionId(): string {
  return `desktop-session-${cryptoSafeRandom()}`;
}

function cryptoSafeRandom(): string {
  return Math.random().toString(36).slice(2, 10);
}

