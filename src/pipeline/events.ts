import type {
  DeliveryEvidence,
  DeliveryResult,
  PipelineEvent,
  PipelineInputKind,
  PipelineState,
  RedactedPipelineError,
  RuntimeTelemetryStage,
  SimulatedRunSummary,
  TerminalPipelineState,
} from "./types";
import { createRuntimeTelemetryStage } from "./runtime-telemetry";
import type { CaptureMetadata } from "../capture/types";
import { isTerminalPipelineState } from "./types";

export function deriveRunSummaryFromEvents(
  events: readonly PipelineEvent[],
): SimulatedRunSummary {
  if (events.length === 0) {
    throw new Error("Cannot derive a pipeline run summary from an empty ledger.");
  }

  const firstEvent = events[0];
  const finalEvent = events[events.length - 1];
  const states = events
    .filter(isStateLedgerEvent)
    .map((event) => event.state);
  const terminalState = deriveTerminalState(finalEvent, states);
  const inputKind = deriveInputKind(events);
  const capture = deriveCaptureMetadata(events);
  const transcript = deriveTranscript(events);
  const delivery = deriveDelivery(events);
  const output = deriveOutput(events, delivery);
  const error = deriveError(finalEvent);
  const deliveryEvidence = deriveDeliveryEvidence({
    inputKind,
    transcript,
    output,
    delivery,
    terminalState,
    error,
  });
  const runtimeTelemetryStages = deriveRuntimeTelemetryStages({
    events,
    capture,
    transcript,
    delivery,
    deliveryEvidence,
    terminalState,
    error,
  });

  return {
    runId: firstEvent.runId,
    fixtureId: deriveFixtureId(events),
    inputKind,
    events: [...events],
    states,
    terminalState,
    capture,
    transcript,
    output,
    delivery,
    deliveryEvidence,
    error,
    runtimeTelemetryStages,
    durationMs: finalEvent.at - firstEvent.at,
  };
}

export function isTerminalPipelineEvent(event: PipelineEvent): boolean {
  return (
    event.type === "run_completed" ||
    event.type === "run_failed" ||
    event.type === "run_cancelled"
  );
}

function isStateLedgerEvent(
  event: PipelineEvent,
): event is Extract<PipelineEvent, { state: PipelineState }> {
  return event.type === "run_started" || event.type === "state_changed";
}

function deriveTerminalState(
  finalEvent: PipelineEvent,
  states: readonly PipelineState[],
): TerminalPipelineState {
  if (finalEvent.type === "run_completed") {
    return "done";
  }

  if (finalEvent.type === "run_failed") {
    return "error";
  }

  if (finalEvent.type === "run_cancelled") {
    return "cancelled";
  }

  const finalState = states[states.length - 1];
  if (finalState && isTerminalPipelineState(finalState)) {
    return finalState;
  }

  throw new Error(`Pipeline ledger has no terminal event: ${finalEvent.type}`);
}

function deriveTranscript(events: readonly PipelineEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "transcription_completed") {
      return event.data.transcript;
    }
  }

  return undefined;
}

function deriveFixtureId(events: readonly PipelineEvent[]): string {
  for (const event of events) {
    if ("fixtureId" in event) {
      return event.fixtureId;
    }
  }

  return "microphone";
}

function deriveInputKind(events: readonly PipelineEvent[]): PipelineInputKind {
  if (events.some((event) => event.type.startsWith("capture_"))) {
    return "microphone";
  }

  return "simulated";
}

function deriveCaptureMetadata(
  events: readonly PipelineEvent[],
): CaptureMetadata | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "capture_completed" || event.type === "capture_failed") {
      return event.data.metadata;
    }

    if (event.type === "capture_started") {
      return event.data;
    }
  }

  return undefined;
}

function deriveDelivery(
  events: readonly PipelineEvent[],
): DeliveryResult | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "delivery_completed") {
      return event.data.delivery;
    }

    if (
      (event.type === "run_completed" || event.type === "run_failed") &&
      event.data?.delivery
    ) {
      return event.data.delivery;
    }
  }

  return undefined;
}

function deriveOutput(
  events: readonly PipelineEvent[],
  delivery: DeliveryResult | undefined,
): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (
      (event.type === "run_completed" || event.type === "run_failed") &&
      event.data?.output
    ) {
      return event.data.output;
    }
  }

  return delivery?.output;
}

function deriveError(
  finalEvent: PipelineEvent,
): RedactedPipelineError | undefined {
  if (finalEvent.type !== "run_failed") {
    return undefined;
  }

  return finalEvent.data.error;
}

function deriveRuntimeTelemetryStages(input: {
  events: readonly PipelineEvent[];
  capture: CaptureMetadata | undefined;
  transcript: string | undefined;
  delivery: DeliveryResult | undefined;
  deliveryEvidence: DeliveryEvidence | undefined;
  terminalState: TerminalPipelineState;
  error: RedactedPipelineError | undefined;
}): RuntimeTelemetryStage[] | undefined {
  if (!input.capture && !input.transcript && !input.delivery && !input.error) {
    return undefined;
  }

  const stages: RuntimeTelemetryStage[] = [];
  const captureEvent = input.events.find((event) => event.type === "capture_completed" || event.type === "capture_failed");
  if (input.capture) {
    stages.push(createRuntimeTelemetryStage({
      stage: "capture",
      status: captureEvent?.type === "capture_failed" ? "failed" : "ok",
      reason: captureEvent?.type === "capture_failed" ? captureEvent.data.error.code : undefined,
      durationMs: input.capture.durationMs,
      redacted: true,
    }));
  }

  const artifact = input.capture?.artifact;
  if (input.capture) {
    stages.push(createRuntimeTelemetryStage({
      stage: "audio-prep",
      status: "ok",
      audio: {
        durationMs: artifact?.durationMs ?? input.capture.durationMs,
        originalBytes: artifact?.sizeBytes ?? input.capture.sizeBytes,
        uploadBytes: artifact?.sizeBytes ?? input.capture.sizeBytes,
        mimeType: artifact?.mimeType ?? input.capture.mimeType,
        source: input.capture.source,
        voiceActivity: input.capture.localSpeechDecision?.voiceActivity,
      },
      redacted: true,
    }));
  }

  const transcriptionEvent = [...input.events].reverse().find((event) => event.type === "transcription_completed");
  if (transcriptionEvent?.type === "transcription_completed") {
    stages.push(createRuntimeTelemetryStage({
      stage: "stt",
      status: "ok",
      durationMs: transcriptionEvent.data.latencyMs,
      provider: transcriptionEvent.data.stt?.provider,
      model: transcriptionEvent.data.stt?.model,
      redacted: true,
    }));
  } else if (input.error?.phase === "transcribing") {
    stages.push(createRuntimeTelemetryStage({
      stage: "stt",
      status: "failed",
      reason: input.error.message,
      redacted: true,
    }));
  }

  if (transcriptionEvent?.type === "transcription_completed") {
    stages.push(createRuntimeTelemetryStage({
      stage: "postprocess",
      status: "skipped",
      reason: "postprocess_telemetry_not_available",
      redacted: true,
    }));
  }

  if (input.deliveryEvidence || input.delivery || input.error?.phase === "delivering") {
    stages.push(createRuntimeTelemetryStage({
      stage: "delivery",
      status: input.deliveryEvidence?.status === "failed"
        ? "failed"
        : input.deliveryEvidence?.status === "uncertain"
          ? "fallback"
          : "ok",
      reason: input.deliveryEvidence?.reason ?? input.delivery?.reason ?? input.error?.message,
      delivery: {
        strategy: input.delivery?.status,
        evidenceStatus: input.deliveryEvidence?.status,
        confidence: input.deliveryEvidence?.status === "uncertain" ? "low" : "medium",
      },
      redacted: true,
    }));
  }

  return stages.length > 0 ? stages : undefined;
}

function deriveDeliveryEvidence(input: {
  inputKind: PipelineInputKind;
  transcript: string | undefined;
  output: string | undefined;
  delivery: DeliveryResult | undefined;
  terminalState: TerminalPipelineState;
  error: RedactedPipelineError | undefined;
}): DeliveryEvidence | undefined {
  if (input.inputKind !== "microphone") {
    return undefined;
  }

  const text = input.output ?? input.transcript;

  if (input.delivery?.status === "copiedFallback") {
    return {
      status: "copied",
      output: text,
      reason: input.delivery.reason,
    };
  }

  if (input.delivery?.status === "delivered") {
    return {
      status: "paste_sent",
      output: text,
      reason: input.delivery.reason,
    };
  }

  if (input.delivery?.status === "uncertain") {
    return {
      status: "uncertain",
      output: text,
      reason: input.delivery.reason,
    };
  }

  if (input.delivery?.status === "failed" || input.terminalState === "error") {
    return {
      status: "failed",
      output: text,
      reason: input.delivery?.reason ?? input.error?.message,
    };
  }

  if (text) {
    return {
      status: "available",
      output: text,
      reason: input.delivery?.reason,
    };
  }

  return undefined;
}
