import type {
  DesktopControlAction,
  DesktopControlEvent,
  DesktopControlReadiness,
  DesktopControlSource,
  DesktopDictationController,
  DesktopDictationSession,
} from "./types";
import { createDesktopControlEvent } from "./types";

export type FakeHostControlEventOptions = {
  receivedAt?: string;
  id?: string;
  targetSnapshot?: DesktopControlEvent["targetSnapshot"];
};

export type FakeHostControlSourceOptions = {
  source?: Extract<DesktopControlSource, "fake_host_event">;
  now?: () => string;
  createEventId?: (action: DesktopControlAction, receivedAt: string) => string;
  readinessReason?: string;
};

export type FakeHostControlEventSource = {
  getReadiness(): DesktopControlReadiness;
  emit(
    action: DesktopControlAction,
    options?: FakeHostControlEventOptions,
  ): Promise<DesktopDictationSession>;
  toggle(options?: FakeHostControlEventOptions): Promise<DesktopDictationSession>;
};

const defaultFakeHostControlReadinessReason =
  "Fake host control events are available for tests/dev; no real shortcut is registered.";

export function createFakeHostControlReadiness(
  reason = defaultFakeHostControlReadinessReason,
): DesktopControlReadiness {
  return {
    controlAvailable: true,
    hotkeyRegistered: false,
    deliveryAvailable: false,
    backgroundModeAvailable: false,
    reason,
  };
}

export function createFakeHostControlEventSource(
  controller: DesktopDictationController,
  options: FakeHostControlSourceOptions = {},
): FakeHostControlEventSource {
  const source = options.source ?? "fake_host_event";

  return {
    getReadiness() {
      return createFakeHostControlReadiness(options.readinessReason);
    },
    emit(action, eventOptions = {}) {
      const receivedAt = eventOptions.receivedAt ?? options.now?.() ?? new Date().toISOString();
      const event = createDesktopControlEvent({
        id: eventOptions.id ?? options.createEventId?.(action, receivedAt),
        source,
        action,
        receivedAt,
        targetSnapshot: eventOptions.targetSnapshot,
      });

      return controller.handleControl(event);
    },
    toggle(eventOptions = {}) {
      return this.emit("toggle", eventOptions);
    },
  };
}
