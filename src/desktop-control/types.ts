import type { DeliveryEvidence, DesktopTargetSnapshot } from "../delivery/types";

export const desktopControlSources = [
  "app_button",
  "fake_host_event",
  "global_hotkey",
  "tray",
  "unknown",
] as const;

export type DesktopControlSource = (typeof desktopControlSources)[number];

export const desktopControlActions = [
  "start",
  "stop",
  "toggle",
  "cancel",
  "retry",
] as const;

export type DesktopControlAction = (typeof desktopControlActions)[number];

export const desktopDictationStates = [
  "idle",
  "arming",
  "listening",
  "stopping",
  "transcribing",
  "postprocessing",
  "reviewing",
  "delivering",
  "done",
  "error",
  "cancelled",
] as const;

export type DesktopDictationState = (typeof desktopDictationStates)[number];

export const terminalDesktopDictationStates = [
  "done",
  "error",
  "cancelled",
] as const;

export type TerminalDesktopDictationState =
  (typeof terminalDesktopDictationStates)[number];

export const activeDesktopDictationStates = [
  "arming",
  "listening",
  "stopping",
  "transcribing",
  "postprocessing",
  "reviewing",
  "delivering",
] as const;

export type ActiveDesktopDictationState =
  (typeof activeDesktopDictationStates)[number];

export type DesktopControlEvent = {
  id: string;
  source: DesktopControlSource;
  action: DesktopControlAction;
  receivedAt?: string;
  targetSnapshot?: DesktopTargetSnapshot;
};

export type DesktopDictationError = {
  message: string;
  code?: string;
};

export type DesktopRecoveryAction = {
  kind:
    | "copy_manually"
    | "retry_from_clip"
    | "record_again"
    | "inspect_setup"
    | "dismiss";
  label: string;
  clipAvailable: boolean;
};

export type DesktopDictationSession = {
  sessionId: string;
  controlSource: DesktopControlSource;
  state: DesktopDictationState;
  capture?: unknown;
  runtime?: unknown;
  delivery?: DeliveryEvidence;
  recoveryAction?: DesktopRecoveryAction;
  startedAt?: string;
  endedAt?: string;
  error?: DesktopDictationError;
};

export type IdleDesktopDictationState = { state: "idle" };

export interface DesktopDictationController {
  getState(): DesktopDictationSession | IdleDesktopDictationState;
  handleControl(event: DesktopControlEvent): Promise<DesktopDictationSession>;
}

export type DesktopControlReadiness = {
  controlAvailable: boolean;
  hotkeyRegistered: boolean;
  deliveryAvailable: boolean;
  backgroundModeAvailable: boolean;
  reason?: string;
};

export type DesktopControlTransitionDecision =
  | {
      accepted: true;
      effectiveAction: Exclude<DesktopControlAction, "toggle">;
      nextState: DesktopDictationState;
    }
  | {
      accepted: false;
      reason: "overlap" | "invalid_transition";
      message: string;
      currentState: DesktopDictationState;
    };

export type DesktopControlDedupeDecision = {
  duplicate: boolean;
  seenEventIds: ReadonlySet<string>;
};

export function isTerminalDesktopDictationState(
  state: DesktopDictationState,
): state is TerminalDesktopDictationState {
  return terminalDesktopDictationStates.includes(
    state as TerminalDesktopDictationState,
  );
}

export function isActiveDesktopDictationState(
  state: DesktopDictationState,
): state is ActiveDesktopDictationState {
  return activeDesktopDictationStates.includes(
    state as ActiveDesktopDictationState,
  );
}

export function createDesktopControlEvent(
  input: Omit<DesktopControlEvent, "id"> & { id?: string },
): DesktopControlEvent {
  return {
    ...input,
    id:
      input.id ??
      `${input.source}:${input.action}:${input.receivedAt ?? "undated"}`,
  };
}

export function createUnavailableDesktopControlReadiness(
  reason: string,
): DesktopControlReadiness {
  return {
    controlAvailable: false,
    hotkeyRegistered: false,
    deliveryAvailable: false,
    backgroundModeAvailable: false,
    reason,
  };
}

export function rememberDesktopControlEvent(
  seenEventIds: ReadonlySet<string>,
  event: DesktopControlEvent,
): DesktopControlDedupeDecision {
  if (seenEventIds.has(event.id)) {
    return {
      duplicate: true,
      seenEventIds,
    };
  }

  const nextSeenEventIds = new Set(seenEventIds);
  nextSeenEventIds.add(event.id);

  return {
    duplicate: false,
    seenEventIds: nextSeenEventIds,
  };
}

export function resolveDesktopControlTransition(
  current: DesktopDictationSession | IdleDesktopDictationState,
  event: DesktopControlEvent,
): DesktopControlTransitionDecision {
  const currentState = current.state;
  const effectiveAction = resolveEffectiveAction(currentState, event.action);

  if (effectiveAction === "start") {
    if (
      currentState === "idle" ||
      currentState === "reviewing" ||
      isTerminalDesktopDictationState(currentState)
    ) {
      return {
        accepted: true,
        effectiveAction,
        nextState: "arming",
      };
    }

    return rejectOverlap(currentState);
  }

  if (effectiveAction === "stop") {
    if (currentState === "listening") {
      return {
        accepted: true,
        effectiveAction,
        nextState: "stopping",
      };
    }

    return {
      accepted: false,
      reason: "invalid_transition",
      message: `Cannot stop a ${currentState} dictation session.`,
      currentState,
    };
  }

  if (effectiveAction === "cancel") {
    if (isActiveDesktopDictationState(currentState)) {
      return {
        accepted: true,
        effectiveAction,
        nextState: "cancelled",
      };
    }

    return {
      accepted: false,
      reason: "invalid_transition",
      message: `Cannot cancel a ${currentState} dictation session.`,
      currentState,
    };
  }

  if (effectiveAction === "retry") {
    if (currentState === "reviewing" || isTerminalDesktopDictationState(currentState)) {
      return {
        accepted: true,
        effectiveAction,
        nextState: "arming",
      };
    }

    if (isActiveDesktopDictationState(currentState)) {
      return rejectOverlap(currentState);
    }
  }

  return {
    accepted: false,
    reason: "invalid_transition",
    message: `Cannot ${effectiveAction} a ${currentState} dictation session.`,
    currentState,
  };
}

function resolveEffectiveAction(
  state: DesktopDictationState,
  action: DesktopControlAction,
): Exclude<DesktopControlAction, "toggle"> {
  if (action !== "toggle") {
    return action;
  }

  if (state === "listening") {
    return "stop";
  }

  return "start";
}

function rejectOverlap(
  currentState: DesktopDictationState,
): DesktopControlTransitionDecision {
  return {
    accepted: false,
    reason: "overlap",
    message: `A ${currentState} dictation session is already active.`,
    currentState,
  };
}
