import { describe, expect, it } from "vitest";
import {
  createInitialDictationKeyState,
  dictationKeyDecisionToControlAction,
  markDictationKeyStarted,
  resolveDictationKeyEvent,
} from "../../src/desktop-control/dictation-key";
import type { DictationKeyEvent, DictationKeyState } from "../../src/desktop-control/dictation-key";

const thresholdMs = 300;

function event(
  kind: DictationKeyEvent["kind"],
  receivedAt: string,
  input: Partial<DictationKeyEvent> = {},
): DictationKeyEvent {
  return {
    kind,
    shortcut: "Ctrl+Shift+F9",
    source: "global_hotkey",
    receivedAt,
    eventId: `${kind}-${receivedAt}`,
    ...input,
  };
}

describe("dictation key hold/tap resolver", () => {
  it("starts on press and stops a long hold on release", () => {
    const pressed = resolveDictationKeyEvent(
      createInitialDictationKeyState(),
      event("pressed", "2026-06-23T15:00:00.000Z", { eventId: "press-1" }),
      { holdThresholdMs: thresholdMs },
    );

    expect(pressed.decision).toEqual({ action: "start", latchMode: "hold" });
    expect(dictationKeyDecisionToControlAction(pressed.decision)).toBe("start");

    const recording = markDictationKeyStarted(
      pressed.state,
      "desktop-session-001",
    );
    expect(recording.status).toBe("hold_recording");

    const released = resolveDictationKeyEvent(
      recording,
      event("released", "2026-06-23T15:00:00.450Z", { eventId: "release-1" }),
      { holdThresholdMs: thresholdMs },
    );

    expect(released.decision).toEqual({ action: "stop", reason: "hold_release" });
    expect(dictationKeyDecisionToControlAction(released.decision)).toBe("stop");
    expect(released.state.status).toBe("stopping");
  });

  it("keeps a short tap latched after start", () => {
    const pressed = resolveDictationKeyEvent(
      createInitialDictationKeyState(),
      event("pressed", "2026-06-23T15:01:00.000Z", { eventId: "tap-press" }),
      { holdThresholdMs: thresholdMs },
    );
    const recording = markDictationKeyStarted(pressed.state, "desktop-session-002");

    const released = resolveDictationKeyEvent(
      recording,
      event("released", "2026-06-23T15:01:00.100Z", { eventId: "tap-release" }),
      { holdThresholdMs: thresholdMs },
    );

    expect(released.decision).toEqual({
      action: "ignore",
      reason: "short_press_latched",
    });
    expect(released.state).toMatchObject({
      status: "latched_recording",
      activeSessionId: "desktop-session-002",
    });
  });

  it("stops a latched recording on the next press", () => {
    const latched: DictationKeyState = {
      status: "latched_recording",
      pressedAt: "2026-06-23T15:02:00.000Z",
      activeSessionId: "desktop-session-003",
      lastEventId: "tap-release",
    };

    const stopped = resolveDictationKeyEvent(
      latched,
      event("pressed", "2026-06-23T15:02:03.000Z", { eventId: "second-press" }),
      { holdThresholdMs: thresholdMs },
    );

    expect(stopped.decision).toEqual({ action: "stop", reason: "toggle_press" });
    expect(stopped.state.status).toBe("stopping");
  });

  it("defers stop when release wins the start race", () => {
    const pressed = resolveDictationKeyEvent(
      createInitialDictationKeyState(),
      event("pressed", "2026-06-23T15:03:00.000Z", { eventId: "race-press" }),
      { holdThresholdMs: thresholdMs },
    );

    const released = resolveDictationKeyEvent(
      pressed.state,
      event("released", "2026-06-23T15:03:00.700Z", { eventId: "race-release" }),
      { holdThresholdMs: thresholdMs },
    );

    expect(released.decision).toEqual({ action: "defer_stop_until_started" });
    expect(released.state.status).toBe("stopping");
  });

  it("ignores duplicate event ids without emitting another control action", () => {
    const state: DictationKeyState = {
      status: "pressing",
      pressedAt: "2026-06-23T15:04:00.000Z",
      lastEventId: "dup-event",
    };

    const duplicate = resolveDictationKeyEvent(
      state,
      event("released", "2026-06-23T15:04:00.100Z", { eventId: "dup-event" }),
      { holdThresholdMs: thresholdMs },
    );

    expect(duplicate.decision).toEqual({ action: "ignore", reason: "duplicate_event" });
    expect(dictationKeyDecisionToControlAction(duplicate.decision)).toBeUndefined();
    expect(duplicate.state).toBe(state);
  });

  it("maps Escape cancel to the existing controller cancel action", () => {
    const cancelled = resolveDictationKeyEvent(
      {
        status: "hold_recording",
        pressedAt: "2026-06-23T15:05:00.000Z",
        activeSessionId: "desktop-session-004",
        lastEventId: "press-escape",
      },
      event("cancel", "2026-06-23T15:05:01.000Z", {
        eventId: "escape-1",
        shortcut: "Escape",
      }),
      { holdThresholdMs: thresholdMs },
    );

    expect(cancelled.decision).toEqual({ action: "cancel", reason: "escape" });
    expect(dictationKeyDecisionToControlAction(cancelled.decision)).toBe("cancel");
    expect(cancelled.state.status).toBe("idle");
  });
});
