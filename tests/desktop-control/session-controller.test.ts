import { describe, expect, it } from "vitest";
import {
  isActiveDesktopDictationState,
  isTerminalDesktopDictationState,
  rememberDesktopControlEvent,
  resolveDesktopControlTransition,
} from "../../src/desktop-control/types";
import { createControlEvent, createSession } from "./desktop-control-fixtures";

describe("desktop dictation foundation state transitions", () => {
  it("starts from idle through the same contract used by app controls", () => {
    const decision = resolveDesktopControlTransition(
      { state: "idle" },
      createControlEvent({ action: "start" }),
    );

    expect(decision).toEqual({
      accepted: true,
      effectiveAction: "start",
      nextState: "arming",
    });
  });

  it("maps toggle to start from idle and stop from listening", () => {
    expect(
      resolveDesktopControlTransition(
        { state: "idle" },
        createControlEvent({ action: "toggle" }),
      ),
    ).toMatchObject({
      accepted: true,
      effectiveAction: "start",
      nextState: "arming",
    });

    expect(
      resolveDesktopControlTransition(
        createSession({ state: "listening" }),
        createControlEvent({ action: "toggle" }),
      ),
    ).toMatchObject({
      accepted: true,
      effectiveAction: "stop",
      nextState: "stopping",
    });
  });

  it("allows cancellation from active work and marks the next state terminal", () => {
    const decision = resolveDesktopControlTransition(
      createSession({ state: "transcribing" }),
      createControlEvent({ action: "cancel" }),
    );

    expect(decision).toMatchObject({
      accepted: true,
      effectiveAction: "cancel",
      nextState: "cancelled",
    });

    if (decision.accepted) {
      expect(isTerminalDesktopDictationState(decision.nextState)).toBe(true);
    }
  });
});

describe("desktop dictation foundation no-overlap and dedupe", () => {
  it("rejects overlapping starts while a session is active", () => {
    for (const state of ["arming", "listening", "transcribing", "delivering"] as const) {
      const decision = resolveDesktopControlTransition(
        createSession({ state }),
        createControlEvent({ action: "start" }),
      );

      expect(isActiveDesktopDictationState(state)).toBe(true);
      expect(decision).toEqual({
        accepted: false,
        reason: "overlap",
        message: `A ${state} dictation session is already active.`,
        currentState: state,
      });
    }
  });

  it("dedupes repeated desktop control event ids before transition handling", () => {
    const event = createControlEvent({ id: "fake-toggle-001", action: "toggle" });
    const first = rememberDesktopControlEvent(new Set<string>(), event);
    const second = rememberDesktopControlEvent(first.seenEventIds, event);

    expect(first.duplicate).toBe(false);
    expect(first.seenEventIds.has("fake-toggle-001")).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.seenEventIds).toBe(first.seenEventIds);
  });
});
