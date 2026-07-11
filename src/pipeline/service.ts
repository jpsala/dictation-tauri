import { deriveRunSummaryFromEvents, isTerminalPipelineEvent } from "./events";
import { getSimulatedFixture, createMissingFixtureError } from "./fixtures";
import { createRedactedPipelineError } from "./pipeline";
import {
  fixtureDeliveryAdapter,
  fixtureTranscriptionAdapter,
  type MockDeliveryAdapter,
  type MockTranscriptionAdapter,
} from "./ports";
import type {
  PipelineEvent,
  PipelineEventHandler,
  PipelineState,
  PipelineStateEvent,
  SimulatedFixture,
  SimulatedRunRequest,
  SimulatedRunSummary,
} from "./types";
import { isTerminalPipelineState } from "./types";

export type PipelineServiceOptions = {
  createRunId?: () => string;
  now?: () => number;
  getFixture?: (fixtureId: string) => SimulatedFixture | undefined;
  transcriptionAdapter?: MockTranscriptionAdapter;
  deliveryAdapter?: MockDeliveryAdapter;
  onEvent?: PipelineEventHandler;
  onState?: (event: PipelineStateEvent) => void;
  yieldControl?: () => Promise<void>;
};

type ActiveRun = {
  runId: string;
  cancelled: boolean;
};

export class ActivePipelineRunError extends Error {
  constructor(readonly activeRunId: string) {
    super(`Pipeline run already active: ${activeRunId}`);
    this.name = "ActivePipelineRunError";
  }
}

export class PipelineService {
  private activeRun?: ActiveRun;
  private runCounter = 0;
  private readonly createRunId: () => string;
  private readonly now: () => number;
  private readonly getFixture: (fixtureId: string) => SimulatedFixture | undefined;
  private readonly transcriptionAdapter: MockTranscriptionAdapter;
  private readonly deliveryAdapter: MockDeliveryAdapter;
  private readonly onEvent?: PipelineEventHandler;
  private readonly onState?: (event: PipelineStateEvent) => void;
  private readonly yieldControl: () => Promise<void>;

  constructor(options: PipelineServiceOptions = {}) {
    this.createRunId = options.createRunId ?? (() => this.nextRunId());
    this.now = options.now ?? performanceNow;
    this.getFixture = options.getFixture ?? getSimulatedFixture;
    this.transcriptionAdapter =
      options.transcriptionAdapter ?? fixtureTranscriptionAdapter;
    this.deliveryAdapter = options.deliveryAdapter ?? fixtureDeliveryAdapter;
    this.onEvent = options.onEvent;
    this.onState = options.onState;
    this.yieldControl = options.yieldControl ?? defaultYieldControl;
  }

  get activeRunId(): string | undefined {
    return this.activeRun?.runId;
  }

  cancelActiveRun(): boolean {
    if (!this.activeRun) {
      return false;
    }

    this.activeRun.cancelled = true;
    return true;
  }

  async run(request: SimulatedRunRequest): Promise<SimulatedRunSummary> {
    if (this.activeRun) {
      throw new ActivePipelineRunError(this.activeRun.runId);
    }

    const runId = this.createRunId();
    const activeRun: ActiveRun = {
      runId,
      cancelled: false,
    };

    this.activeRun = activeRun;

    try {
      return await this.executeRun(request, activeRun);
    } finally {
      if (this.activeRun === activeRun) {
        this.activeRun = undefined;
      }
    }
  }

  private async executeRun(
    request: SimulatedRunRequest,
    activeRun: ActiveRun,
  ): Promise<SimulatedRunSummary> {
    const events: PipelineEvent[] = [];
    const fixture =
      this.getFixture(request.fixtureId) ?? createMicrophoneFixture(request);
    let currentState: PipelineState = "idle";
    let output: string | undefined;

    const append = (event: PipelineEvent): void => {
      if (events.length > 0 && isTerminalPipelineEvent(events[events.length - 1])) {
        throw new Error("Cannot append pipeline events after a terminal event.");
      }

      events.push(event);
      this.onEvent?.(event);

      if (event.type === "run_started" || event.type === "state_changed") {
        this.onState?.({
          runId: event.runId,
          fixtureId: event.fixtureId,
          state: event.state,
          at: event.at,
        });
      }
    };

    const transition = async (state: PipelineState): Promise<boolean> => {
      if (isTerminalPipelineState(currentState)) {
        return true;
      }

      currentState = state;
      append({
        type: state === "idle" ? "run_started" : "state_changed",
        runId: activeRun.runId,
        fixtureId: request.fixtureId,
        state,
        at: this.now(),
      });

      await this.yieldControl();

      if (request.cancelAtState === state) {
        activeRun.cancelled = true;
      }

      if (activeRun.cancelled && !isTerminalPipelineState(state)) {
        finishCancelled();
        return true;
      }

      return false;
    };

    const fail = (
      error = createMissingFixtureError(request.fixtureId),
      delivery = undefined as SimulatedRunSummary["delivery"],
    ): SimulatedRunSummary => {
      if (currentState !== "error") {
        currentState = "error";
        append({
          type: "state_changed",
          runId: activeRun.runId,
          fixtureId: request.fixtureId,
          state: "error",
          at: this.now(),
        });
      }

      append({
        type: "run_failed",
        runId: activeRun.runId,
        fixtureId: request.fixtureId,
        at: this.now(),
        data: {
          error,
          output,
          delivery,
        },
      });

      return deriveRunSummaryFromEvents(events);
    };

    const finishCancelled = (): SimulatedRunSummary => {
      if (currentState !== "cancelled") {
        currentState = "cancelled";
        append({
          type: "state_changed",
          runId: activeRun.runId,
          fixtureId: request.fixtureId,
          state: "cancelled",
          at: this.now(),
        });
      }

      append({
        type: "run_cancelled",
        runId: activeRun.runId,
        fixtureId: request.fixtureId,
        at: this.now(),
        data: {
          reason: "Pipeline run was cancelled.",
        },
      });

      return deriveRunSummaryFromEvents(events);
    };

    if (await transition("idle")) {
      return deriveRunSummaryFromEvents(events);
    }

    if (!fixture) {
      return fail(createMissingFixtureError(request.fixtureId));
    }

    if (request.inputKind === "microphone" && request.capture) {
      append({
        type: "capture_started",
        runId: activeRun.runId,
        captureId: request.capture.captureId,
        at: this.now(),
        data: request.capture,
      });

      if (request.captureError) {
        append({
          type: "capture_failed",
          runId: activeRun.runId,
          captureId: request.capture.captureId,
          at: this.now(),
          data: {
            metadata: request.capture,
            error: request.captureError,
          },
        });

        return fail(
          createRedactedPipelineError(
            "listening",
            "Capture failed before transcription.",
          ),
        );
      }

      if (!request.captureArtifact) {
        return fail(
          createRedactedPipelineError(
            "listening",
            "Captured audio artifact is unavailable.",
          ),
        );
      }

      append({
        type: "capture_completed",
        runId: activeRun.runId,
        captureId: request.capture.captureId,
        at: this.now(),
        data: {
          metadata: request.capture,
          artifact: request.captureArtifact,
        },
      });
    }

    if (await transition("listening")) {
      return deriveRunSummaryFromEvents(events);
    }

    if (fixture.failureMode?.phase === "listening") {
      return fail(
        createRedactedPipelineError(
          fixture.failureMode.phase,
          fixture.failureMode.message,
        ),
      );
    }

    if (await transition("transcribing")) {
      return deriveRunSummaryFromEvents(events);
    }

    const transcription = await this.transcriptionAdapter.transcribe(fixture, {
      runId: activeRun.runId,
      capture: request.capture,
    });

    if (activeRun.cancelled) {
      return finishCancelled();
    }

    if ("error" in transcription) {
      return fail(transcription.error);
    }

    append({
      type: "transcription_completed",
      runId: activeRun.runId,
      fixtureId: request.fixtureId,
      at: this.now(),
      data: {
        transcript: transcription.text,
        latencyMs: transcription.latencyMs,
        stt: transcription.stt,
      },
    });

    if (!fixture.expectedOutput && request.inputKind !== "microphone") {
      return fail(
        createRedactedPipelineError("delivering", "Fixture has no output."),
      );
    }

    output = fixture.expectedOutput ?? transcription.text;

    if (await transition("delivering")) {
      return deriveRunSummaryFromEvents(events);
    }

    const delivery = await this.deliveryAdapter.deliver({
      fixture,
      output,
    });

    if (activeRun.cancelled) {
      return finishCancelled();
    }

    append({
      type: "delivery_completed",
      runId: activeRun.runId,
      fixtureId: request.fixtureId,
      at: this.now(),
      data: {
        delivery,
      },
    });

    if (fixture.failureMode?.phase === "delivering" || delivery.status === "failed") {
      return fail(
        createRedactedPipelineError(
          fixture.failureMode?.phase ?? "delivering",
          fixture.failureMode?.message ?? delivery.reason ?? "Delivery failed.",
        ),
        delivery,
      );
    }

    await transition("done");
    append({
      type: "run_completed",
      runId: activeRun.runId,
      fixtureId: request.fixtureId,
      at: this.now(),
      data: {
        output,
        delivery,
      },
    });

    return deriveRunSummaryFromEvents(events);
  }

  private nextRunId(): string {
    this.runCounter += 1;
    return `sim-run-${this.runCounter.toString().padStart(4, "0")}`;
  }
}

function performanceNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

async function defaultYieldControl(): Promise<void> {
  await Promise.resolve();
}

function createMicrophoneFixture(
  request: SimulatedRunRequest,
): SimulatedFixture | undefined {
  if (request.inputKind !== "microphone" || !request.capture) {
    return undefined;
  }

  return {
    id: request.fixtureId,
    label: "Microphone capture",
    deliveryMode: "skipped",
  };
}
