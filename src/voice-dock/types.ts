export type VoiceDockPhase =
  | "idle"
  | "arming"
  | "recording"
  | "processing"
  | "review"
  | "failed"
  | "cancelled"
  | "uncertain";

export type DockCommand =
  | "start"
  | "stop"
  | "stop_submit"
  | "cancel"
  | "retry"
  | "copy"
  | "paste_last_safe";

export type DockActivePreset = {
  presetName: string;
  presetId?: string | null;
  appKey?: string | null;
};

export type DockRecoveryState = {
  kind: "copy" | "retry" | "record_again" | "setup" | "uncertain";
  title: string;
  message: string;
  primaryAction?: DockCommand;
  secondaryAction?: DockCommand;
};

export type VoiceDockState = {
  phase: VoiceDockPhase;
  statusText: string;
  statusDetail?: string;
  ariaLabel: string;
  active: boolean;
  busy: boolean;
  canStart: boolean;
  canStop: boolean;
  canCancel: boolean;
  canStopSubmit: boolean;
  canCopy: boolean;
  canRetry: boolean;
  canPasteLastSafe: boolean;
  vuLevel: number;
  vuBands: number[];
  recovery?: DockRecoveryState;
  activePreset?: DockActivePreset;
  assistantModeEnabled: boolean;
};

export type DockVisualOptions = {
  vuLevel?: number;
  vuBands?: readonly number[];
  canPasteLastSafe?: boolean;
  showEnterSubmitButton?: boolean;
  activePreset?: DockActivePreset;
  assistantModeEnabled?: boolean;
};
