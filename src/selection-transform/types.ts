import type { DesktopTargetConfidence, DesktopTargetSnapshot } from "../delivery/types";
import type { DesktopRecoveryAction } from "../desktop-control/types";

export type SelectionContextSource = "fixture" | "host_capture" | "none";

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

export type FixtureTransformPresetId = "rewrite" | "shorten" | "bulletize";
