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
  createVocabularyTelemetryStage,
  VocabularyPreDeliveryCoordinator,
  vocabularyWaitingState,
  type PersonalVocabularySnapshot,
  type VocabularyChoice,
  type VocabularyChoiceSessionView,
  type VocabularyPreDeliveryTelemetry,
  type VocabularyResolutionPlan,
  type VocabularyResolutionSource,
} from "../personal-vocabulary";
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
  DesktopVocabularySettlementListener,
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
  /** Explicit route marker used to distinguish a persistent preset from a selection transform. */
  vocabularySource?: VocabularyResolutionSource;
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

export type DesktopVocabularyChoiceStateHandler = (
  state: VocabularyChoiceSessionView,
) => void | boolean | Promise<void | boolean>;

/**
 * A waiting session must never depend on a host-provided timeout to make
 * progress. The product bridge can override this for tests or a shorter local
 * policy, but the safe default remains finite.
 */
export const DEFAULT_VOCABULARY_CHOICE_TIMEOUT_MS = 30_000;

export type DesktopVocabularyResolverOptions = {
  /** A host-owned snapshot captured once when a result reaches delivery. */
  snapshot?: PersonalVocabularySnapshot | (() => PersonalVocabularySnapshot | Promise<PersonalVocabularySnapshot>);
  getSnapshot?: () => PersonalVocabularySnapshot | Promise<PersonalVocabularySnapshot>;
  enabled?: boolean;
  /** Optional UI bridge. Returning false means the surface could not open. */
  onChoiceRequired?: DesktopVocabularyChoiceStateHandler;
  openChoiceSurface?: DesktopVocabularyChoiceStateHandler;
  /** A defensive timeout; omitted/non-finite values use the finite default. */
  choiceTimeoutMs?: number;
  scheduler?: {
    setTimeout(callback: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
  };
};

export type DesktopDictationControllerOptions = {
  capture: DesktopCaptureGateway;
  runtime: DesktopRuntimeGateway;
  delivery?: DesktopDeliveryGateway;
  allowDesktopDeliverySideEffects?: boolean;
  autoStop?: DesktopAutoStopSilencePolicy;
  prepareDeliveryTargetOnStop?: () => Promise<void>;
  scheduler?: DesktopScheduler;
  createSessionId?: () => string;
  now?: () => string;
  clockMs?: () => number;
  vocabulary?: DesktopVocabularyResolverOptions;
  /** Alias kept for integrations that call this boundary a resolver. */
  vocabularyResolver?: DesktopVocabularyResolverOptions;
};

type PendingVocabularyDelivery = {
  sessionId: string;
  capture?: unknown;
  runtime: DesktopRuntimeResult;
  event: DesktopControlEvent;
  coordinator: VocabularyPreDeliveryCoordinator;
  plan: VocabularyResolutionPlan;
  originalText: string;
  snapshot: PersonalVocabularySnapshot;
  timeoutHandle?: unknown;
  settling: boolean;
};

type VocabularyResolutionOutcome = {
  outcome: "automatic" | "unchanged" | "waiting_for_choice" | "fallback";
  text: string;
  plan?: VocabularyResolutionPlan;
  snapshot?: PersonalVocabularySnapshot;
  telemetry: VocabularyPreDeliveryTelemetry;
  view?: VocabularyChoiceSessionView;
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
  private readonly prepareDeliveryTargetOnStop?: () => Promise<void>;
  private readonly scheduler: DesktopScheduler;
  private readonly createSessionId: () => string;
  private readonly now: () => string;
  private readonly clockMs: () => number;
  private readonly vocabulary?: DesktopVocabularyResolverOptions;
  private readonly vocabularyCoordinator = new VocabularyPreDeliveryCoordinator();
  private autoStopInterval: unknown;
  private autoStopSilentSinceMs: number | undefined;
  private pendingVocabulary?: PendingVocabularyDelivery;
  private vocabularyDeliveryInFlight = false;
  private readonly vocabularySettlementListeners = new Set<DesktopVocabularySettlementListener>();

  constructor(options: DesktopDictationControllerOptions) {
    this.capture = options.capture;
    this.runtime = options.runtime;
    this.delivery = options.delivery ?? createReviewOnlyDeliveryGateway();
    this.allowDesktopDeliverySideEffects = options.allowDesktopDeliverySideEffects ?? false;
    this.autoStop = options.autoStop;
    this.prepareDeliveryTargetOnStop = options.prepareDeliveryTargetOnStop;
    this.scheduler = options.scheduler ?? globalScheduler;
    this.createSessionId = options.createSessionId ?? createDefaultSessionId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.clockMs = options.clockMs ?? Date.now;
    this.vocabulary = options.vocabularyResolver ?? options.vocabulary;
  }

  getState(): DesktopDictationSession | IdleDesktopDictationState {
    return this.current;
  }

  subscribeVocabularySettlement(listener: DesktopVocabularySettlementListener): () => void {
    this.vocabularySettlementListeners.add(listener);
    return () => {
      this.vocabularySettlementListeners.delete(listener);
    };
  }

  /**
   * Resolve the currently visible choice group. Groups are intentionally
   * sequential: a choice for a later group cannot race the first one.
   */
  async resolveVocabularyChoice(input: {
    groupId?: string;
    choice: string;
    sessionId?: string;
  }): Promise<DesktopDictationSession> {
    const pending = this.pendingVocabulary;
    if (!pending || this.current.state !== vocabularyWaitingState) {
      return this.requireCurrentSessionOrSynthetic("No vocabulary choice is active.");
    }
    if (input.sessionId && input.sessionId !== pending.sessionId) {
      return this.current;
    }
    if (pending.settling || this.vocabularyDeliveryInFlight) {
      return this.current;
    }

    const activeSession = pending.coordinator.session;
    const group = activeSession?.view.group;
    if (!activeSession || !group || (input.groupId && input.groupId !== group.id)) {
      return this.current;
    }

    pending.settling = true;
    const result = pending.coordinator.choose({
      groupId: group.id,
      choice: input.choice as VocabularyChoice,
    });
    if (result.outcome === vocabularyWaitingState && result.session) {
      pending.settling = false;
      return this.patchCurrent(pending.sessionId, {
        vocabulary: result.session.view,
        state: vocabularyWaitingState,
      });
    }

    return this.finishPendingVocabularyDelivery(pending, {
      outcome: "resolved",
      reason: "choice_confirmed",
      result,
    });
  }

  /** Keep all unresolved occurrences unchanged and continue normal delivery. */
  async cancelVocabularyResolution(input: { sessionId?: string } = {}): Promise<DesktopDictationSession> {
    const pending = this.pendingVocabulary;
    if (!pending || this.current.state !== vocabularyWaitingState) {
      return this.requireCurrentSessionOrSynthetic("No vocabulary choice is active.");
    }
    if (input.sessionId && input.sessionId !== pending.sessionId) {
      return this.current;
    }
    if (pending.settling || this.vocabularyDeliveryInFlight) {
      return this.current;
    }

    pending.settling = true;
    const result = pending.coordinator.cancel();
    return this.finishPendingVocabularyDelivery(pending, {
      outcome: "cancelled",
      reason: "original_preserved_for_pending_groups",
      result,
    });
  }

  async handleControl(
    event: DesktopControlEvent,
  ): Promise<DesktopDictationSession> {
    const dedupe = rememberDesktopControlEvent(this.seenEventIds, event);
    this.seenEventIds = new Set(dedupe.seenEventIds);

    if (dedupe.duplicate) {
      if (this.vocabularyDeliveryInFlight && this.current.state !== "idle") {
        return this.current;
      }
      return this.ensureSession("Duplicate desktop control event was ignored.", {
        code: "duplicate-control-event",
      });
    }

    // Choice settlement owns the delivery critical section.  Ignore a
    // concurrent control event rather than allowing cancel/start to race the
    // single delivery call.
    if (this.vocabularyDeliveryInFlight && this.current.state !== "idle") {
      return this.current;
    }

    // Escape, close and the existing cancel command mean "keep originals" at
    // the vocabulary gate.  They must not discard the already transcribed run.
    if (this.current.state === vocabularyWaitingState && event.action === "cancel") {
      return this.cancelVocabularyResolution({ sessionId: this.current.sessionId });
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
      if (this.prepareDeliveryTargetOnStop) {
        await this.prepareDeliveryTargetOnStop();
      }
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
    const originalText = input.runtime.output ?? input.runtime.transcript;
    const vocabulary = await this.resolveVocabularyBeforeDelivery({
      session,
      event,
      capture: input.capture,
      runtime: input.runtime,
      text: originalText,
    });

    if (vocabulary.outcome === "waiting_for_choice" && vocabulary.plan && vocabulary.view) {
      const pending: PendingVocabularyDelivery = {
        sessionId: session.sessionId,
        capture: input.capture,
        runtime: attachVocabularyResolutionToRuntime(
          input.runtime,
          originalText,
          vocabulary.telemetry,
        ),
        event: snapshotDesktopControlEvent(event),
        coordinator: this.vocabularyCoordinator,
        plan: vocabulary.plan,
        originalText,
        snapshot: vocabulary.snapshot ?? {
          revision: vocabulary.plan.snapshotRevision,
          rules: [],
        },
        settling: false,
      };
      this.pendingVocabulary = pending;
      this.scheduleVocabularyChoiceTimeout(pending);

      const waitingSession = this.patchCurrent(session.sessionId, {
        capture: input.capture,
        runtime: pending.runtime,
        vocabulary: vocabulary.view,
        delivery: undefined,
        state: vocabularyWaitingState,
        recoveryAction: undefined,
      });

      const opened = await this.presentVocabularyChoice(pending, vocabulary.view);
      // A host bridge may resolve the choice synchronously while opening the
      // surface.  Return the authoritative current state instead of the stale
      // waiting projection in that case.
      if (this.pendingVocabulary !== pending) {
        return this.requireCurrentSessionOrSynthetic("Vocabulary choice was already settled.");
      }
      if (!opened) {
        return this.finishPendingVocabularyDelivery(pending, {
          outcome: "fallback",
          reason: "choice_surface_unavailable",
        });
      }

      return waitingSession;
    }

    const runtime = attachVocabularyResolutionToRuntime(
      input.runtime,
      vocabulary.text,
      vocabulary.telemetry,
    );
    return this.deliverResolvedRuntime(session, event, {
      capture: input.capture,
      runtime,
      text: vocabulary.text,
    });
  }

  private async deliverResolvedRuntime(
    session: DesktopDictationSession,
    event: DesktopControlEvent,
    input: {
      capture?: unknown;
      runtime: DesktopRuntimeResult;
      text: string;
    },
  ): Promise<DesktopDictationSession> {
    const text = input.text;
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
      vocabulary: undefined,
      state: "reviewing",
      recoveryAction,
    });
  }

  private async resolveVocabularyBeforeDelivery(input: {
    session: DesktopDictationSession;
    event: DesktopControlEvent;
    capture?: unknown;
    runtime: DesktopRuntimeResult;
    text: string;
  }): Promise<VocabularyResolutionOutcome> {
    const source = inferVocabularySource(input.runtime);
    const baseTelemetry = (outcome: VocabularyPreDeliveryTelemetry["outcome"], reason: string) =>
      createControllerVocabularyTelemetry({
        sessionId: input.session.sessionId,
        outcome,
        text: input.text,
        output: input.text,
        reason,
      });

    if (
      !this.vocabulary ||
      this.vocabulary.enabled === false ||
      source === "selection_transform" ||
      source === "assistant" ||
      !input.text
    ) {
      return {
        outcome: "unchanged",
        text: input.text,
        telemetry: baseTelemetry("skipped", source === "assistant" || source === "selection_transform"
          ? "excluded_source"
          : "resolver_disabled"),
      };
    }

    const snapshotSource = this.vocabulary.getSnapshot ?? this.vocabulary.snapshot;
    if (!snapshotSource) {
      return {
        outcome: "unchanged",
        text: input.text,
        telemetry: baseTelemetry("skipped", "snapshot_provider_unavailable"),
      };
    }

    try {
      const snapshot = typeof snapshotSource === "function"
        ? await snapshotSource()
        : snapshotSource;
      const result = this.vocabularyCoordinator.begin({
        sessionId: input.session.sessionId,
        text: input.text,
        snapshot,
        source,
        persistentPreset: source === "persistent_preset",
      });
      if (result.outcome === vocabularyWaitingState && result.session) {
        return {
          outcome: "waiting_for_choice",
          text: result.text,
          plan: result.session.plan,
          snapshot: result.session.snapshot,
          view: result.session.view,
          telemetry: result.telemetry,
        };
      }

      return {
        outcome: result.outcome === "automatic" ? "automatic" : "unchanged",
        text: result.text,
        plan: result.plan,
        snapshot,
        telemetry: result.telemetry,
      };
    } catch {
      // The safety contract is fail-open for delivery but fail-closed for
      // vocabulary: no matcher/UI error may lose or partially rewrite text.
      return {
        outcome: "fallback",
        text: input.text,
        telemetry: baseTelemetry("fallback", "resolver_failed_original_preserved"),
      };
    }
  }

  private async presentVocabularyChoice(
    pending: PendingVocabularyDelivery,
    view: VocabularyChoiceSessionView,
  ): Promise<boolean> {
    const handler = this.vocabulary?.onChoiceRequired ?? this.vocabulary?.openChoiceSurface;
    if (!handler) {
      return false;
    }
    try {
      const result = await handler(view);
      return result !== false;
    } catch {
      return false;
    }
  }

  private scheduleVocabularyChoiceTimeout(pending: PendingVocabularyDelivery): void {
    const configuredTimeoutMs = this.vocabulary?.choiceTimeoutMs;
    const timeoutMs = configuredTimeoutMs === undefined || !Number.isFinite(configuredTimeoutMs)
      ? DEFAULT_VOCABULARY_CHOICE_TIMEOUT_MS
      : Math.max(1, Math.floor(configuredTimeoutMs));
    const scheduler = this.vocabulary?.scheduler ?? defaultVocabularyTimeoutScheduler;
    pending.timeoutHandle = scheduler.setTimeout(() => {
      if (this.pendingVocabulary?.sessionId !== pending.sessionId) {
        return;
      }
      // A defensive timeout is not an explicit user cancellation.  It must
      // release the coordinator and deliver the pre-vocabulary original,
      // even if automatic replacements or earlier choices were staged.
      void this.fallbackVocabularyResolution({
        sessionId: pending.sessionId,
        reason: "choice_timeout_original_preserved",
      });
    }, timeoutMs);
  }

  private clearVocabularyChoiceTimeout(pending: PendingVocabularyDelivery): void {
    if (pending.timeoutHandle === undefined) {
      return;
    }
    const scheduler = this.vocabulary?.scheduler ?? defaultVocabularyTimeoutScheduler;
    scheduler.clearTimeout(pending.timeoutHandle);
    pending.timeoutHandle = undefined;
  }

  private async finishPendingVocabularyDelivery(
    pending: PendingVocabularyDelivery,
    input: {
      outcome: "resolved" | "cancelled" | "fallback";
      reason: string;
      result?: {
        text: string;
        telemetry: VocabularyPreDeliveryTelemetry;
      };
    },
  ): Promise<DesktopDictationSession> {
    if (this.pendingVocabulary !== pending || this.vocabularyDeliveryInFlight) {
      return this.requireCurrentSessionOrSynthetic("Vocabulary delivery is no longer active.");
    }

    this.clearVocabularyChoiceTimeout(pending);
    if (input.outcome === "fallback") {
      // Defensive failures must not apply automatic replacements or partial
      // choices while releasing the one coordinator authority.
      pending.coordinator.discard();
    }
    this.pendingVocabulary = undefined;
    this.vocabularyDeliveryInFlight = true;
    const text = input.outcome === "fallback"
      ? pending.originalText
      : input.result?.text ?? pending.originalText;
    const telemetry = input.result?.telemetry ?? createControllerVocabularyTelemetry({
      sessionId: pending.sessionId,
      outcome: input.outcome,
      plan: pending.plan,
      snapshot: pending.snapshot,
      text: pending.originalText,
      output: text,
      reason: input.reason,
    });
    const runtime = attachVocabularyResolutionToRuntime(
      pending.runtime,
      text,
      telemetry,
    );
    this.current = {
      ...this.requireCurrentSession(),
      runtime,
      vocabulary: undefined,
      state: "delivering",
    };

    let settled: DesktopDictationSession;
    try {
      settled = await this.deliverResolvedRuntime(this.requireCurrentSession(), pending.event, {
        capture: pending.capture,
        runtime,
        text,
      });
    } finally {
      this.vocabularyDeliveryInFlight = false;
    }
    this.notifyVocabularySettlement(settled);
    return settled;
  }

  private notifyVocabularySettlement(session: DesktopDictationSession): void {
    for (const listener of this.vocabularySettlementListeners) {
      try {
        listener(session);
      } catch {
        // UI observers must never corrupt the controller's authoritative
        // settlement or turn one completed delivery into a retry.
      }
    }
  }

  private async fallbackVocabularyResolution(input: {
    sessionId: string;
    reason: string;
  }): Promise<DesktopDictationSession> {
    const pending = this.pendingVocabulary;
    if (
      !pending ||
      pending.sessionId !== input.sessionId ||
      this.current.state !== vocabularyWaitingState
    ) {
      return this.requireCurrentSessionOrSynthetic("Vocabulary fallback is no longer active.");
    }
    if (pending.settling || this.vocabularyDeliveryInFlight) {
      return this.requireCurrentSessionOrSynthetic("Vocabulary fallback is already settling.");
    }

    pending.settling = true;
    return this.finishPendingVocabularyDelivery(pending, {
      outcome: "fallback",
      reason: input.reason,
    });
  }

  private requireCurrentSessionOrSynthetic(message: string): DesktopDictationSession {
    if (this.current.state !== "idle") {
      return this.current;
    }
    return this.ensureSession(message, { code: "vocabulary-not-active" });
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
    if (
      code === "invalid_transition" &&
      (event.action === "stop" || event.action === "cancel")
    ) {
      // A stale stop/cancel can arrive while capture startup or processing is
      // settling. It is a harmless race, not a user-facing failure.
      if (this.current.state !== "idle") {
        return this.current;
      }

      return this.replaceCurrent({
        sessionId: this.createSessionId(),
        controlSource: event.source,
        state: "cancelled",
        startedAt: event.receivedAt ?? this.now(),
        endedAt: this.now(),
      });
    }

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
    if (this.pendingVocabulary) {
      this.clearVocabularyChoiceTimeout(this.pendingVocabulary);
      this.pendingVocabulary.coordinator.discard();
      this.pendingVocabulary = undefined;
    }
    return this.patchCurrent(session.sessionId, {
      ...partial,
      controlSource: event.source,
      delivery: undefined,
      vocabulary: undefined,
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

function snapshotDesktopControlEvent(event: DesktopControlEvent): DesktopControlEvent {
  return Object.freeze({
    ...event,
    ...(event.targetSnapshot
      ? { targetSnapshot: Object.freeze({ ...event.targetSnapshot }) }
      : {}),
  });
}

function inferVocabularySource(
  runtime: DesktopRuntimeResult,
): VocabularyResolutionSource {
  if (runtime.vocabularySource) {
    return runtime.vocabularySource;
  }
  const summary = asRecord(runtime.summary);
  const resultSource = summary?.resultSource;
  if (resultSource === "persistent_preset") {
    return "persistent_preset";
  }
  if (resultSource === "selection_transform") {
    return "selection_transform";
  }
  if (
    resultSource === "assistant" ||
    runtime.assistantAction !== undefined ||
    (runtime.assistantSurface !== undefined && runtime.assistantSurface.kind !== "none")
  ) {
    return "assistant";
  }
  return "dictation";
}

function createControllerVocabularyTelemetry(input: {
  sessionId: string;
  outcome: VocabularyPreDeliveryTelemetry["outcome"];
  plan?: VocabularyResolutionPlan;
  snapshot?: PersonalVocabularySnapshot;
  text: string;
  output: string;
  choiceCount?: number;
  reason?: string;
}): VocabularyPreDeliveryTelemetry {
  return Object.freeze({
    event: "vocabulary_pre_delivery",
    sessionId: input.sessionId,
    outcome: input.outcome,
    ...(input.plan ? { snapshotRevision: input.plan.snapshotRevision } : {}),
    ruleCount: input.snapshot?.rules.length ?? 0,
    matchCount: input.plan?.matches.length ?? 0,
    automaticCount: input.plan?.automatic.length ?? 0,
    askGroupCount: input.plan?.askGroups.length ?? 0,
    choiceCount: input.choiceCount ?? 0,
    inputLength: input.text.length,
    outputLength: input.output.length,
    ...(input.reason ? { reason: input.reason } : {}),
    redacted: true as const,
  });
}

function attachVocabularyResolutionToRuntime(
  runtime: DesktopRuntimeResult,
  output: string,
  telemetry: VocabularyPreDeliveryTelemetry,
): DesktopRuntimeResult {
  const summary = asRecord(runtime.summary);
  const stage = createVocabularyTelemetryStage(telemetry);
  if (!summary) {
    return {
      ...runtime,
      output,
    };
  }

  const stages = Array.isArray(summary.runtimeTelemetryStages)
    ? summary.runtimeTelemetryStages
    : [];
  return {
    ...runtime,
    output,
    summary: {
      ...summary,
      output,
      runtimeTelemetryStages: [...stages, stage],
    },
  };
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, any>
    : undefined;
}

const globalScheduler: DesktopScheduler = {
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

const defaultVocabularyTimeoutScheduler = {
  setTimeout(callback: () => void, ms: number): unknown {
    const handle = globalThis.setTimeout(callback, ms) as ReturnType<typeof setTimeout> & {
      unref?: () => void;
    };
    handle.unref?.();
    return handle;
  },
  clearTimeout(handle: unknown): void {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
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

