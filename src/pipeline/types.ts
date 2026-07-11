import type {
  CapturedAudioArtifact,
  CaptureError,
  CaptureMetadata,
  CaptureResult,
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

export const deliveryEvidenceStatuses = [
  "available",
  "copied",
  "paste_sent",
  "paste_observed",
  "failed",
  "uncertain",
] as const;

export type DeliveryEvidenceStatus = (typeof deliveryEvidenceStatuses)[number];

export type DeliveryEvidence = {
  status: DeliveryEvidenceStatus;
  output?: string;
  reason?: string;
  observedAt?: number;
};

export type PipelineErrorPhase = FailurePhase | "selection_transform" | "fixture";

export type RedactedPipelineError = {
  phase: PipelineErrorPhase;
  message: string;
};

export type RuntimeTelemetryStageName =
  | "capture"
  | "audio-prep"
  | "stt"
  | "postprocess"
  | "selection_transform"
  | "delivery";

export type RuntimeTelemetryStageStatus =
  | "started"
  | "skipped"
  | "ok"
  | "failed"
  | "fallback";

export type RuntimeTelemetryStage = {
  stage: RuntimeTelemetryStageName;
  status: RuntimeTelemetryStageStatus;
  durationMs?: number;
  reason?: string;
  profileId?: string;
  engineId?: string;
  promptId?: string;
  model?: string;
  provider?: string;
  audio?: {
    durationMs?: number;
    originalBytes?: number;
    uploadBytes?: number;
    mimeType?: string;
    source?: string;
    compressionRatio?: string;
    voiceActivity?: {
      durationMs: number;
      voicedMs: number;
      frameCount: number;
      voicedFrameCount: number;
      rmsPpm: number;
      peakPpm: number;
      hasSpeech: boolean;
    };
  };
  target?: {
    processName?: string;
    inputLike?: boolean;
    confidence?: "low" | "medium" | "high";
    reason?: string;
  };
  delivery?: {
    strategy?: string;
    evidenceStatus?: DeliveryEvidenceStatus;
    confidence?: "low" | "medium" | "high";
  };
  redacted: true;
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
  captureArtifact?: CapturedAudioArtifact;
  captureError?: CaptureError;
  cancelAtState?: FailurePhase;
};

export type CapturedAudioRunRequest = SimulatedRunRequest & {
  fixtureId: "microphone";
  inputKind: "microphone";
  capture: CaptureMetadata;
};

export type CapturedAudioInput = CaptureResult;

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
  deliveryEvidence?: DeliveryEvidence;
  error?: RedactedPipelineError;
};

export type AssistantOption = { id: string; label: string; description?: string };

export type AssistantSurface =
  | { kind: "none" }
  | { kind: "insertText"; text: string; delivery: "paste_send" }
  | { kind: "notify"; title?: string; message: string; level?: "info" | "success" | "warning" | "error" }
  | { kind: "quickChat"; title?: string; initialUserText?: string; initialAssistantText?: string }
  | { kind: "showMarkdown"; title: string; markdown: string }
  | {
      kind: "optionPicker";
      title: string;
      prompt: string;
      options: AssistantOption[];
    }
  | { kind: "toolAction"; tool: string; args: Record<string, unknown> }
  | { kind: "error"; message: string; recoverable?: boolean };

export type SimulatedRunSummary = {
  runId: string;
  fixtureId: string;
  resultSource?: "dictation" | "selection_transform" | "assistant";
  assistantSurface?: AssistantSurface;
  inputKind: PipelineInputKind;
  events: PipelineEvent[];
  states: PipelineState[];
  terminalState: TerminalPipelineState;
  capture?: CaptureMetadata;
  transcript?: string;
  output?: string;
  delivery?: DeliveryResult;
  deliveryEvidence?: DeliveryEvidence;
  error?: RedactedPipelineError;
  runtimeTelemetryStages?: RuntimeTelemetryStage[];
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
