import type {
  DesktopControlEvent,
  DesktopDictationController as DesktopDictationControllerContract,
  DesktopDictationSession,
  DesktopRecoveryAction,
  IdleDesktopDictationState,
} from "./types";
import {
  isActiveDesktopDictationState,
  rememberDesktopControlEvent,
  resolveDesktopControlTransition,
} from "./types";

export type DesktopCaptureGateway = {
  start(input: { sessionId: string; event: DesktopControlEvent }): Promise<unknown>;
  stop(input: { sessionId: string; event: DesktopControlEvent }): Promise<unknown>;
  cancel?(input: { sessionId: string; event: DesktopControlEvent }): Promise<void>;
};

export type DesktopRuntimeGateway = {
  transcribe(input: {
    sessionId: string;
    capture: unknown;
    event: DesktopControlEvent;
  }): Promise<DesktopRuntimeResult>;
};

export type DesktopRuntimeResult = {
  transcript: string;
  output?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  requestId?: string;
};

export type DesktopDictationControllerOptions = {
  capture: DesktopCaptureGateway;
  runtime: DesktopRuntimeGateway;
  createSessionId?: () => string;
  now?: () => string;
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
  private readonly createSessionId: () => string;
  private readonly now: () => string;

  constructor(options: DesktopDictationControllerOptions) {
    this.capture = options.capture;
    this.runtime = options.runtime;
    this.createSessionId = options.createSessionId ?? createDefaultSessionId;
    this.now = options.now ?? (() => new Date().toISOString());
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

      return this.patchCurrent(session.sessionId, {
        state: "listening",
      });
    } catch (error) {
      return this.finishError(session, "Capture setup failed.", {
        code: "capture-start-failed",
        cause: error,
        recoveryAction: recordAgainRecovery(),
      });
    }
  }

  private async stop(event: DesktopControlEvent): Promise<DesktopDictationSession> {
    const session = this.requireCurrentSession();
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

      return this.patchCurrent(session.sessionId, {
        capture,
        runtime,
        state: "reviewing",
        recoveryAction: copyManuallyRecovery(),
      });
    } catch (error) {
      const current = this.requireCurrentSession();
      return this.finishError(session, "Dictation processing failed.", {
        code: "runtime-failed",
        cause: error,
        recoveryAction: current.capture
          ? retryFromClipRecovery()
          : recordAgainRecovery(),
      });
    }
  }

  private async cancel(event: DesktopControlEvent): Promise<DesktopDictationSession> {
    const session = this.requireCurrentSession();
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

      return this.patchCurrent(session.sessionId, {
        runtime,
        state: "reviewing",
        recoveryAction: copyManuallyRecovery(),
      });
    } catch (error) {
      return this.finishError(session, "Retry from clip failed.", {
        code: "retry-failed",
        cause: error,
        recoveryAction: retryFromClipRecovery(),
      });
    }
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
        message: redactErrorMessage(input.cause, message),
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

export function copyManuallyRecovery(): DesktopRecoveryAction {
  return {
    kind: "copy_manually",
    label: "Copy transcript manually",
    clipAvailable: true,
  };
}

export function retryFromClipRecovery(): DesktopRecoveryAction {
  return {
    kind: "retry_from_clip",
    label: "Retry from captured clip",
    clipAvailable: true,
  };
}

export function recordAgainRecovery(): DesktopRecoveryAction {
  return {
    kind: "record_again",
    label: "Record again",
    clipAvailable: false,
  };
}

export function dismissRecovery(): DesktopRecoveryAction {
  return {
    kind: "dismiss",
    label: "Dismiss",
    clipAvailable: false,
  };
}

function createDefaultSessionId(): string {
  return `desktop-session-${cryptoSafeRandom()}`;
}

function cryptoSafeRandom(): string {
  return Math.random().toString(36).slice(2, 10);
}

function redactErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim()) {
    return cause.message;
  }

  return fallback;
}
