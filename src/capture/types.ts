import type { AudioSpeechDecision } from "./audio-analysis";

export const capturePermissionStatuses = [
  "unknown",
  "prompting",
  "granted",
  "denied",
  "unavailable",
  "error",
] as const;

export type CapturePermissionStatus =
  (typeof capturePermissionStatuses)[number];

export const captureStates = [
  "idle",
  "permission_needed",
  "requesting_permission",
  "recording",
  "stopping",
  "captured",
  "failed",
  "cancelled",
] as const;

export type CaptureState = (typeof captureStates)[number];

export type TerminalCaptureState = Extract<
  CaptureState,
  "captured" | "failed" | "cancelled"
>;

export type CaptureArtifactPolicy = "gitignored-local";

export type CaptureArtifactSensitivity = "real-user-audio";

export type CapturedAudioArtifact = {
  artifactId: string;
  captureId: string;
  path?: string;
  relativePath?: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  durationMs: number;
  sampleRateHz?: number;
  channelCount?: number;
  sensitivity: CaptureArtifactSensitivity;
  policy: CaptureArtifactPolicy;
};

export type CaptureMetadata = {
  captureId: string;
  source: "microphone";
  permissionStatus: CapturePermissionStatus;
  artifactPolicy: CaptureArtifactPolicy;
  durationMs?: number;
  mimeType?: string;
  sizeBytes?: number;
  artifact?: CapturedAudioArtifact;
  localSpeechDecision?: AudioSpeechDecision;
  deviceKind: "audioinput";
  deviceLabel?: string;
};

export type CaptureSession = {
  captureId: string;
  runId?: string;
  state: CaptureState;
  startedAt: number;
  stoppedAt?: number;
  durationMs?: number;
  source: "microphone";
  deviceLabel?: string;
  error?: CaptureError;
};

export type CaptureErrorPhase =
  | "permission"
  | "recording"
  | "artifact"
  | "cancelled";

export type CaptureErrorCode =
  | "permission-denied"
  | "device-not-found"
  | "device-not-readable"
  | "unsupported-recorder"
  | "empty-audio"
  | "artifact-write-failed"
  | "cancelled"
  | "unknown";

export type CaptureError = {
  phase: CaptureErrorPhase;
  code: CaptureErrorCode;
  message: string;
};

export type CaptureResult =
  | {
      ok: true;
      metadata: CaptureMetadata;
      artifact: CapturedAudioArtifact;
    }
  | {
      ok: false;
      metadata: CaptureMetadata;
      error: CaptureError;
    };

export const terminalCaptureStates: readonly TerminalCaptureState[] = [
  "captured",
  "failed",
  "cancelled",
] as const;

export function isTerminalCaptureState(
  state: CaptureState,
): state is TerminalCaptureState {
  return terminalCaptureStates.includes(state as TerminalCaptureState);
}
