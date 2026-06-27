import type {
  DeliveryEvidence,
} from "../delivery/types";
import type {
  DesktopDictationSession,
  IdleDesktopDictationState,
} from "../desktop-control/types";
import type {
  DockRecoveryState,
  DockVisualOptions,
  VoiceDockPhase,
  VoiceDockState,
} from "./types";

const dockBandCount = 7;

type DockInputState = DesktopDictationSession | IdleDesktopDictationState;

export function createVoiceDockState(
  input: DockInputState,
  options: DockVisualOptions = {},
): VoiceDockState {
  const phase = mapDockPhase(input);
  const hasOutput = hasDeliveryOutput(input);
  const inserted = deliveryWasInserted(getDelivery(input));
  const canPasteLastSafe = Boolean(options.canPasteLastSafe && hasOutput && !inserted);
  const canCopy = hasOutput && !inserted;
  const canRetry = phase === "failed" || phase === "cancelled";
  const canStop = phase === "arming" || phase === "recording";
  const canCancel = canStop;
  const canStart = phase === "idle" || phase === "review" || phase === "failed" || phase === "cancelled";
  const canStopSubmit = canStop && options.showEnterSubmitButton !== false;
  const recovery = createRecoveryState(input, phase, {
    canCopy,
    canPasteLastSafe,
  });
  const status = getStatus(input, phase);

  return {
    phase,
    statusText: status.text,
    statusDetail: status.detail,
    deliveryStatus: input.state === "idle" ? undefined : input.delivery?.status,
    deliveryStatusLabel: input.state === "idle" ? undefined : getDeliveryStatusLabel(input.delivery),
    ariaLabel: createAriaLabel(status.text, status.detail),
    active: phase === "arming" || phase === "recording" || phase === "processing",
    busy: phase === "arming" || phase === "processing",
    canStart,
    canStop,
    canCancel,
    canStopSubmit,
    canCopy,
    canRetry,
    canPasteLastSafe,
    vuLevel: phase === "idle" ? 0 : clampLevel(options.vuLevel ?? 0),
    vuBands: phase === "idle" ? emptyVuBands() : sanitizeVuBands(options.vuBands),
    recovery,
    activePreset: phase === "processing" ? undefined : options.activePreset,
    assistantModeEnabled: options.assistantModeEnabled === true,
  };
}

export function sanitizeVuBands(
  bands: readonly number[] = [],
  count = dockBandCount,
): number[] {
  return Array.from({ length: count }, (_, index) => clampLevel(bands[index] ?? 0));
}

function mapDockPhase(input: DockInputState): VoiceDockPhase {
  if (input.state === "idle") {
    return "idle";
  }

  switch (input.state) {
    case "arming":
      return "arming";
    case "listening":
      return "recording";
    case "stopping":
    case "transcribing":
    case "postprocessing":
    case "delivering":
      return "processing";
    case "reviewing":
      return deliveryWasInserted(input.delivery)
        ? "idle"
        : deliveryIsUncertain(input.delivery)
          ? "uncertain"
          : "review";
    case "error":
      return "failed";
    case "cancelled":
      return "idle";
    case "done":
      return deliveryWasInserted(input.delivery)
        ? "idle"
        : deliveryIsUncertain(input.delivery)
          ? "uncertain"
          : "review";
    default:
      return "idle";
  }
}

function createRecoveryState(
  input: DockInputState,
  phase: VoiceDockPhase,
  actions: {
    canCopy: boolean;
    canPasteLastSafe: boolean;
  },
): DockRecoveryState | undefined {
  if (phase === "review" && actions.canCopy) {
    const observed = input.state !== "idle" && input.delivery?.status === "paste_observed";
    const sent = input.state !== "idle" && input.delivery?.status === "paste_sent";

    return {
      kind: "copy",
      title: observed ? "Paste observed" : sent ? "Paste sent" : "Transcript ready",
      message: observed
        ? "Verified observer confirmed target insertion; transcript remains available."
        : sent
          ? "Paste was sent but target insertion was not observed; transcript remains available."
          : "Review the transcript locally or copy it manually.",
      primaryAction: "copy",
      secondaryAction: actions.canPasteLastSafe ? "paste_last_safe" : undefined,
    };
  }

  if (phase === "uncertain") {
    return {
      kind: "uncertain",
      title: "Check the target app",
      message: "Delivery was not verified. Copy or use safe recovery if needed.",
      primaryAction: actions.canCopy ? "copy" : undefined,
      secondaryAction: actions.canPasteLastSafe ? "paste_last_safe" : undefined,
    };
  }

  if (phase === "failed") {
    return {
      kind: mapFailureRecoveryKind(input),
      title: "Dictation needs attention",
      message: getErrorMessage(input) ?? "The dictation run failed before a verified result.",
      primaryAction: "retry",
      secondaryAction: actions.canCopy ? "copy" : undefined,
    };
  }

  if (phase === "cancelled") {
    return {
      kind: "record_again",
      title: "Dictation cancelled",
      message: "Nothing was inserted. Start again when ready.",
      primaryAction: "retry",
    };
  }

  return undefined;
}

function getStatus(
  input: DockInputState,
  phase: VoiceDockPhase,
): { text: string; detail?: string } {
  switch (phase) {
    case "idle":
      return { text: "Ready", detail: "Press the dictation key or start from the dock." };
    case "arming":
      return { text: "Starting mic", detail: "Preparing capture." };
    case "recording":
      return { text: "Recording", detail: "Release or stop when finished." };
    case "processing":
      return { text: "Processing", detail: "Transcribing and preparing review." };
    case "review":
      if (input.state !== "idle" && input.delivery?.status === "paste_observed") {
        return { text: "Paste observed", detail: "paste_observed: verified target insertion." };
      }
      if (input.state !== "idle" && input.delivery?.status === "paste_sent") {
        return { text: "Paste sent", detail: "paste_sent: insertion was sent but not observed." };
      }
      return { text: "Review ready", detail: "Transcript is available for local review." };
    case "failed":
      return { text: "Needs attention", detail: getErrorMessage(input) };
    case "cancelled":
      return { text: "Cancelled", detail: "No transcript was produced." };
    case "uncertain":
      return { text: "Check target", detail: "Delivery was not verified." };
  }
}

function createAriaLabel(text: string, detail: string | undefined): string {
  return detail ? `${text}. ${detail}` : text;
}

function hasDeliveryOutput(input: DockInputState): boolean {
  if (input.state === "idle") {
    return false;
  }

  return typeof input.delivery?.output === "string" && input.delivery.output.length > 0;
}

function getDelivery(input: DockInputState): DeliveryEvidence | undefined {
  return input.state === "idle" ? undefined : input.delivery;
}

function deliveryWasInserted(delivery: DeliveryEvidence | undefined): boolean {
  const verifiedPasteStatus = `${"paste"}_observed`;
  return delivery?.status === "paste_sent" || delivery?.status === verifiedPasteStatus;
}

function deliveryIsUncertain(delivery: DeliveryEvidence | undefined): boolean {
  return delivery?.status === "uncertain" || delivery?.status === "failed";
}

function getErrorMessage(input: DockInputState): string | undefined {
  if (input.state === "idle") {
    return undefined;
  }

  return input.error?.message;
}

function mapFailureRecoveryKind(input: DockInputState): DockRecoveryState["kind"] {
  if (input.state === "idle") {
    return "retry";
  }

  if (input.recoveryAction?.kind === "inspect_setup") {
    return "setup";
  }

  return "retry";
}

function emptyVuBands(): number[] {
  return sanitizeVuBands();
}

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
