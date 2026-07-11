import type { DesktopTargetConfidence, DesktopTargetSnapshot } from "../delivery/types";
import type { DesktopRecoveryAction } from "../desktop-control/types";
import type { DeliveryEvidence } from "../pipeline/types";

export type SelectionContextSource = "fixture" | "host_capture" | "none";

export const selectionCaptureStatuses = [
  "ok",
  "unsupported_platform",
  "no_foreground_target",
  "unsupported_target",
  "no_selection",
  "timeout",
  "failed",
] as const;

export type SelectionCaptureStatus = (typeof selectionCaptureStatuses)[number];

export type HostSelectionCaptureRoute = {
  owner: "tauri_host";
  primaryStrategy: "windows_ui_automation_then_clipboard_roundtrip";
  mutatesClipboard: true;
  sendsKeyboardShortcut: true;
  touchesFocus: false;
  persistsSelection: false;
  allowsClipboardRoundtrip: true;
};

export type SelectionCaptureOutcome = {
  status: SelectionCaptureStatus;
  selection?: SelectionContext;
  targetSnapshot?: DesktopTargetSnapshot;
  redacted: boolean;
  truncated: boolean;
  reason?: string;
};

export type SelectionContext = {
  selectionId: string;
  selectedText?: string;
  textLength: number;
  source: SelectionContextSource;
  capturedAt?: string;
  targetSnapshot?: DesktopTargetSnapshot;
  confidence: DesktopTargetConfidence;
  redacted: boolean;
};

export type SelectionContextInput = {
  selectionId?: string;
  selectedText?: string;
  source?: SelectionContextSource;
  capturedAt?: string;
  targetSnapshot?: DesktopTargetSnapshot;
  confidence?: DesktopTargetConfidence;
};

export type SelectionTransformMode = "fixture" | "managed" | "direct_byok";

export type SelectionTransformRequest = {
  requestId: string;
  sessionId: string;
  selection: SelectionContext;
  instructionTranscript: string;
  presetId: string;
  mode: SelectionTransformMode;
  allowProviderCall: boolean;
};

export type SelectionTransformAction =
  | "replace_selection"
  | "insert"
  | "copy"
  | "review_only";

export type SelectionTransformEvidence = {
  selectionAvailable: boolean;
  source: SelectionContextSource;
  presetId?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  reason?: string;
};

export type SelectionTransformResult = {
  status: "ok" | "skipped" | "failed";
  output?: string;
  action: SelectionTransformAction;
  presetId?: string;
  evidence: SelectionTransformEvidence;
  recoveryAction?: DesktopRecoveryAction;
};

export type SelectionRoute =
  | {
      kind: "direct_dictation";
      reason: string;
    }
  | {
      kind: "selection_transform";
      selection: SelectionContext;
    };

export type FixtureTransformPresetId = "como-yo-es" | "corregir-texto" | "fix-writing" | "like-me-en";

export type LatestResultSource = "dictation" | "selection_transform" | "assistant";

export type LatestResult = {
  runId: string;
  text: string;
  source: LatestResultSource;
  createdAt?: string;
  deliveryEvidence?: DeliveryEvidence;
};
