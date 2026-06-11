import type {
  CapturedAudioArtifact,
  CaptureError,
  CaptureMetadata,
} from "../capture/types";

export const pipelineStates = [
  "idle",
  "listening",
  "transcribing",
  "delivering",
  "done",
  "error",
  "cancelled",
] as const;

export type PipelineState = (typeof pipelineStates)[number];

export type TerminalPipelineState = Extract<
  PipelineState,
  "done" | "error" | "cancelled"
>;

export type FailurePhase = Extract<
  PipelineState,
  "listening" | "transcribing" | "delivering"
>;

export const deliveryStatuses = [
  "delivered",
  "copiedFallback",
  "uncertain",
  "failed",
  "skipped",
] as const;

export type DeliveryStatus = (typeof deliveryStatuses)[number];

export type DeliveryResult = {
  status: DeliveryStatus;
  output?: string;
  reason?: string;
};

export type PipelineErrorPhase = FailurePhase | "fixture";

export type RedactedPipelineError = {
  phase: PipelineErrorPhase;
  message: string;
};

export type SimulatedFixture = {
  id: string;
  label: string;
  sourceText?: string;
  expectedTranscript?: string;
  expectedOutput?: string;
  failureMode?: {
    phase: FailurePhase;
    message: string;
  };
  deliveryMode: DeliveryStatus;
};

export type MockTranscriptionResult =
  | {
      text: string;
      latencyMs: number;
      stt?: {
        provider: string;
        model: string;
        mode: "mock" | "dry-run" | "real";
        audioPath?: string;
        requestId?: string;
      };
      error?: never;
    }
  | {
      error: RedactedPipelineError;
      latencyMs: number;
      text?: never;
    };

export type PipelineInputKind =
  | "simulated"
  | "synthetic-fixture"
  | "local-audio-fixture"
  | "microphone";

export type SimulatedRunRequest = {
  fixtureId: string;
  inputKind?: PipelineInputKind;
  capture?: CaptureMetadata;
  cancelAtState?: FailurePhase;
};

export type PipelineStateEvent = {
  runId: string;
  state: PipelineState;
  fixtureId: string;
  at: number;
};

export type PipelineStateLedgerEvent = {
  type: "run_started" | "state_changed";
  runId: string;
  fixtureId: string;
  state: PipelineState;
  at: number;
};

export type TranscriptionCompletedEvent = {
  type: "transcription_completed";
  runId: string;
  fixtureId: string;
  at: number;
  data: {
    transcript: string;
    latencyMs: number;
    stt?: {
      provider: string;
      model: string;
      mode: "mock" | "dry-run" | "real";
      audioPath?: string;
      requestId?: string;
    };
  };
};

export type DeliveryCompletedEvent = {
  type: "delivery_completed";
  runId: string;
  fixtureId: string;
  at: number;
  data: {
    delivery: DeliveryResult;
  };
};

export type RunCompletedEvent = {
  type: "run_completed";
  runId: string;
  fixtureId: string;
  at: number;
  data?: {
    output?: string;
    delivery?: DeliveryResult;
  };
};

export type RunFailedEvent = {
  type: "run_failed";
  runId: string;
  fixtureId: string;
  at: number;
  data: {
    error: RedactedPipelineError;
    output?: string;
    delivery?: DeliveryResult;
  };
};

export type RunCancelledEvent = {
  type: "run_cancelled";
  runId: string;
  fixtureId: string;
  at: number;
  data?: {
    reason?: string;
  };
};

export type CaptureStartedEvent = {
  type: "capture_started";
  runId: string;
  captureId: string;
  at: number;
  data: CaptureMetadata;
};

export type CaptureCompletedEvent = {
  type: "capture_completed";
  runId: string;
  captureId: string;
  at: number;
  data: {
    metadata: CaptureMetadata;
    artifact: CapturedAudioArtifact;
  };
};

export type CaptureFailedEvent = {
  type: "capture_failed";
  runId: string;
  captureId: string;
  at: number;
  data: {
    metadata: CaptureMetadata;
    error: CaptureError;
  };
};

export type CapturePipelineEvent =
  | CaptureStartedEvent
  | CaptureCompletedEvent
  | CaptureFailedEvent;

export type PipelineEvent =
  | PipelineStateLedgerEvent
  | CapturePipelineEvent
  | TranscriptionCompletedEvent
  | DeliveryCompletedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunCancelledEvent;

export type PipelineEventHandler = (event: PipelineEvent) => void;

export type PipelineRun = {
  id: string;
  fixtureId: string;
  inputKind: PipelineInputKind;
  state: PipelineState;
  states: PipelineState[];
  startedAt: number;
  endedAt?: number;
  capture?: CaptureMetadata;
  transcript?: string;
  output?: string;
  delivery?: DeliveryResult;
  error?: RedactedPipelineError;
};

export type SimulatedRunSummary = {
  runId: string;
  fixtureId: string;
  inputKind: PipelineInputKind;
  events: PipelineEvent[];
  states: PipelineState[];
  terminalState: TerminalPipelineState;
  capture?: CaptureMetadata;
  transcript?: string;
  output?: string;
  delivery?: DeliveryResult;
  error?: RedactedPipelineError;
  durationMs: number;
};

export const terminalPipelineStates: readonly TerminalPipelineState[] = [
  "done",
  "error",
  "cancelled",
] as const;

export function isTerminalPipelineState(
  state: PipelineState,
): state is TerminalPipelineState {
  return terminalPipelineStates.includes(state as TerminalPipelineState);
}
