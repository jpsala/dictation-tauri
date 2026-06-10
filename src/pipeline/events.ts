import type {
  DeliveryResult,
  PipelineEvent,
  PipelineState,
  RedactedPipelineError,
  SimulatedRunSummary,
  TerminalPipelineState,
} from "./types";
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
  const transcript = deriveTranscript(events);
  const delivery = deriveDelivery(events);
  const output = deriveOutput(events, delivery);
  const error = deriveError(finalEvent);

  return {
    runId: firstEvent.runId,
    fixtureId: firstEvent.fixtureId,
    events: [...events],
    states,
    terminalState,
    transcript,
    output,
    delivery,
    error,
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
