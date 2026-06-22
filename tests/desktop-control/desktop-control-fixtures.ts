import type { DeliveryRequest } from "../../src/delivery/types";
import type {
  DesktopControlAction,
  DesktopControlEvent,
  DesktopControlSource,
  DesktopDictationSession,
  DesktopDictationState,
} from "../../src/desktop-control/types";

export const desktopControlTranscript = "desktop control transcript";

export const desktopTargetSnapshot = {
  capturedAt: "2026-06-22T10:00:00.000Z",
  appLabel: "redacted-target-app",
  windowLabel: "redacted-window",
  confidence: "medium" as const,
};

export function createControlEvent(input: {
  id?: string;
  source?: DesktopControlSource;
  action?: DesktopControlAction;
  receivedAt?: string;
} = {}): DesktopControlEvent {
  const source = input.source ?? "app_button";
  const action = input.action ?? "start";
  const receivedAt = input.receivedAt ?? "2026-06-22T10:00:01.000Z";

  return {
    id: input.id ?? `${source}:${action}:${receivedAt}`,
    source,
    action,
    receivedAt,
    targetSnapshot: desktopTargetSnapshot,
  };
}

export function createSession(input: {
  state: DesktopDictationState;
  sessionId?: string;
  controlSource?: DesktopControlSource;
}): DesktopDictationSession {
  return {
    sessionId: input.sessionId ?? "session-001",
    controlSource: input.controlSource ?? "app_button",
    state: input.state,
    startedAt: "2026-06-22T10:00:01.000Z",
  };
}

export function createDeliveryRequest(input: Partial<DeliveryRequest> = {}): DeliveryRequest {
  return {
    sessionId: input.sessionId ?? "session-001",
    text: input.text ?? desktopControlTranscript,
    strategy: input.strategy ?? "review_only",
    allowDesktopSideEffects: input.allowDesktopSideEffects ?? false,
    targetSnapshot: input.targetSnapshot ?? desktopTargetSnapshot,
  };
}
