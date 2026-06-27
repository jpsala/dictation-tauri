import type { TauriDesktopDeliveryTarget } from "../delivery/tauri-desktop-delivery";
import type { DesktopControlAction } from "./types";

export type DictationKeyEventKind = "pressed" | "released" | "cancel";

export type DictationKeyEvent = {
  kind: DictationKeyEventKind;
  shortcut: string;
  source: "fake_host_event" | "global_hotkey" | "dock_button";
  receivedAt: string;
  eventId?: string;
  targetSnapshot?: TauriDesktopDeliveryTarget;
};

export type DictationKeyState = {
  status: "idle" | "pressing" | "hold_recording" | "latched_recording" | "stopping";
  pressedAt?: string;
  activeSessionId?: string;
  lastEventId?: string;
};

export type DictationKeyDecision =
  | { action: "start"; latchMode: "hold" | "toggle" }
  | { action: "stop"; reason: "hold_release" | "toggle_press" | "stop_submit" }
  | { action: "cancel"; reason: "escape" }
  | { action: "ignore"; reason: string }
  | { action: "defer_stop_until_started" };

export type DictationKeyResolverOptions = {
  holdThresholdMs?: number;
  activeSessionCanCancel?: boolean;
};

export type DictationKeyResolution = {
  state: DictationKeyState;
  decision: DictationKeyDecision;
};

const defaultHoldThresholdMs = 300;

export function createInitialDictationKeyState(): DictationKeyState {
  return { status: "idle" };
}

export function resolveDictationKeyEvent(
  state: DictationKeyState,
  event: DictationKeyEvent,
  options: DictationKeyResolverOptions = {},
): DictationKeyResolution {
  if (isDuplicateEvent(state, event)) {
    return {
      state,
      decision: { action: "ignore", reason: "duplicate_event" },
    };
  }

  if (event.kind === "cancel") {
    return resolveCancel(state, event, options.activeSessionCanCancel ?? false);
  }

  if (event.kind === "pressed") {
    return resolvePress(state, event);
  }

  return resolveRelease(state, event, options.holdThresholdMs ?? defaultHoldThresholdMs);
}

export function markDictationKeyStarted(
  state: DictationKeyState,
  activeSessionId: string,
): DictationKeyState {
  if (state.status !== "pressing" && state.status !== "latched_recording") {
    return state;
  }

  return {
    ...state,
    status: state.status === "pressing" ? "hold_recording" : "latched_recording",
    activeSessionId,
  };
}

export function resetDictationKeyState(
  state: DictationKeyState = createInitialDictationKeyState(),
): DictationKeyState {
  return {
    status: "idle",
    lastEventId: state.lastEventId,
  };
}

export function dictationKeyDecisionToControlAction(
  decision: DictationKeyDecision,
): DesktopControlAction | undefined {
  switch (decision.action) {
    case "start":
      return "start";
    case "stop":
      return "stop";
    case "cancel":
      return "cancel";
    case "ignore":
    case "defer_stop_until_started":
      return undefined;
  }
}

function resolvePress(
  state: DictationKeyState,
  event: DictationKeyEvent,
): DictationKeyResolution {
  if (state.status === "latched_recording") {
    return {
      state: {
        ...rememberEvent(state, event),
        status: "stopping",
      },
      decision: { action: "stop", reason: "toggle_press" },
    };
  }

  if (state.status === "pressing" || state.status === "hold_recording") {
    return {
      state: rememberEvent(state, event),
      decision: { action: "ignore", reason: "already_pressed" },
    };
  }

  if (state.status === "stopping") {
    return {
      state: rememberEvent(state, event),
      decision: { action: "ignore", reason: "stop_in_flight" },
    };
  }

  return {
    state: {
      status: "pressing",
      pressedAt: event.receivedAt,
      lastEventId: event.eventId,
    },
    decision: { action: "start", latchMode: "hold" },
  };
}

function resolveRelease(
  state: DictationKeyState,
  event: DictationKeyEvent,
  holdThresholdMs: number,
): DictationKeyResolution {
  if (state.status === "idle") {
    return {
      state: rememberEvent(state, event),
      decision: { action: "ignore", reason: "release_without_press" },
    };
  }

  if (state.status === "latched_recording") {
    return {
      state: rememberEvent(state, event),
      decision: { action: "ignore", reason: "latched_release" },
    };
  }

  if (state.status === "stopping") {
    return {
      state: rememberEvent(state, event),
      decision: { action: "ignore", reason: "stop_in_flight" },
    };
  }

  const heldForMs = elapsedMs(state.pressedAt, event.receivedAt);
  const isHold = heldForMs >= holdThresholdMs;

  if (state.status === "pressing") {
    if (isHold) {
      return {
        state: {
          ...rememberEvent(state, event),
          status: "stopping",
        },
        decision: { action: "defer_stop_until_started" },
      };
    }

    return {
      state: {
        ...rememberEvent(state, event),
        status: "latched_recording",
      },
      decision: { action: "ignore", reason: "short_press_latched" },
    };
  }

  if (isHold) {
    return {
      state: {
        ...rememberEvent(state, event),
        status: "stopping",
      },
      decision: { action: "stop", reason: "hold_release" },
    };
  }

  return {
    state: {
      ...rememberEvent(state, event),
      status: "latched_recording",
    },
    decision: { action: "ignore", reason: "short_press_latched" },
  };
}

function resolveCancel(
  state: DictationKeyState,
  event: DictationKeyEvent,
  activeSessionCanCancel: boolean,
): DictationKeyResolution {
  if (state.status === "idle" && !activeSessionCanCancel) {
    return {
      state: rememberEvent(state, event),
      decision: { action: "ignore", reason: "cancel_without_active_session" },
    };
  }

  return {
    state: {
      status: "idle",
      lastEventId: event.eventId,
    },
    decision: { action: "cancel", reason: "escape" },
  };
}

function isDuplicateEvent(
  state: DictationKeyState,
  event: DictationKeyEvent,
): boolean {
  return Boolean(event.eventId && state.lastEventId === event.eventId);
}

function rememberEvent(
  state: DictationKeyState,
  event: DictationKeyEvent,
): DictationKeyState {
  return {
    ...state,
    lastEventId: event.eventId,
  };
}

function elapsedMs(start: string | undefined, end: string): number {
  const startTime = Date.parse(start ?? end);
  const endTime = Date.parse(end);

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return 0;
  }

  return Math.max(0, endTime - startTime);
}
