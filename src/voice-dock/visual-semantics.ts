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
  const assistantResult = options.resultSource === "assistant";
  const canPasteLastSafe = Boolean(options.canPasteLastSafe && hasOutput && !inserted && !assistantResult);
  const canCopy = hasOutput && !inserted && !assistantResult;
  const canRetry = phase === "failed" || phase === "cancelled";
  const canStop = phase === "arming" || phase === "recording";
  const canCancel = canStop;
  const canStart = phase === "idle" || phase === "review" || phase === "failed" || phase === "cancelled";
  const canStopSubmit = canStop && options.showEnterSubmitButton !== false;
  const recovery = createRecoveryState(input, phase, {
    canCopy,
    canPasteLastSafe,
    assistantResult,
  });
  const status = getStatus(input, phase, { assistantResult });

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
    assistantResult?: boolean;
  },
): DockRecoveryState | undefined {
  if (phase === "review" && actions.assistantResult) {
    return undefined;
  }

  if (phase === "review" && actions.canCopy) {
    const delivery = input.state === "idle" ? undefined : input.delivery;
    const observed = delivery?.status === "paste_observed";
    const sent = delivery?.status === "paste_sent";
    const reviewOnly = delivery?.strategy === "review_only";

    return {
      kind: "copy",
      title: observed
        ? "Paste verified"
        : sent
          ? "Paste sent, not verified"
          : reviewOnly
            ? "Review only"
            : "Transcript ready",
      message: observed
        ? "Observer verified target insertion; transcript remains available."
        : sent
          ? "Paste command was sent, but insertion was not observer-verified. If it did not appear, copy or paste last safely."
          : reviewOnly
            ? "Nothing was inserted. Review the transcript locally or copy it manually."
            : "Review the transcript locally or copy it manually.",
      primaryAction: "copy",
      secondaryAction: actions.canPasteLastSafe ? "paste_last_safe" : undefined,
    };
  }

  if (phase === "uncertain") {
    const failedDelivery = input.state !== "idle" && input.delivery?.status === "failed";

    return {
      kind: "uncertain",
      title: failedDelivery ? "Delivery failed" : "Delivery uncertain",
      message: failedDelivery
        ? "No verified insertion. Copy the result or retry if needed."
        : "Insertion was not verified. Check the target, then copy or use safe paste-last if needed.",
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
  options: { assistantResult?: boolean } = {},
): { text: string; detail?: string } {
  switch (phase) {
    case "idle":
      return { text: "Ready", detail: "Tap toggles · Hold to talk." };
    case "arming":
      return { text: "Starting mic", detail: "Tap toggles · Hold to talk." };
    case "recording":
      return { text: "Recording", detail: "Release to stop · tap again if latched." };
    case "processing":
      return { text: "Processing", detail: "Transcribing and preparing review." };
    case "review":
      if (input.state !== "idle" && input.delivery?.status === "paste_observed") {
        return { text: "Paste verified", detail: "paste_observed: observer verified target insertion." };
      }
      if (input.state !== "idle" && input.delivery?.status === "paste_sent") {
        return { text: "Paste sent", detail: "paste_sent: paste command sent; not observer-verified." };
      }
      if (options.assistantResult) {
        return { text: "Ready", detail: "Lulu response was handled outside normal transcript review." };
      }
      if (input.state !== "idle" && input.delivery?.strategy === "review_only") {
        return { text: "Review ready", detail: "review_only: nothing inserted; review or copy when ready." };
      }
      return { text: "Review ready", detail: "Transcript is available for local review." };
    case "failed":
      return { text: "Needs attention", detail: getErrorMessage(input) };
    case "cancelled":
      return { text: "Cancelled", detail: "No transcript was produced." };
    case "uncertain":
      if (input.state !== "idle" && input.delivery?.status === "failed") {
        return { text: "Delivery failed", detail: "No verified insertion. Copy the result or retry if needed." };
      }
      return { text: "Delivery uncertain", detail: "Insertion was not verified. Check target, copy, or paste last safely." };
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

function getDeliveryStatusLabel(delivery: DeliveryEvidence | undefined): string | undefined {
  if (!delivery) {
    return undefined;
  }

  if (delivery.status === "available" && delivery.strategy === "review_only") {
    return "review_only · not inserted";
  }

  switch (delivery.status) {
    case "available":
      return "available · review ready";
    case "copied":
      return "copied · clipboard fallback";
    case "paste_sent":
      return "paste_sent · not verified";
    case "paste_observed":
      return "paste_observed · verified";
    case "uncertain":
      return "uncertain · check target";
    case "failed":
      return "failed · not inserted";
  }
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
