import { describe, expect, it } from "vitest";
import {
  createDesktopControlEvent,
  createUnavailableDesktopControlReadiness,
  resolveDesktopControlTransition,
} from "../../src/desktop-control/types";
import { createSession, desktopTargetSnapshot } from "./desktop-control-fixtures";

describe("desktop control event foundation", () => {
  it("normalizes fake host events to the renderer-safe control event shape", () => {
    const event = createDesktopControlEvent({
      source: "fake_host_event",
      action: "toggle",
      receivedAt: "2026-06-22T10:00:02.000Z",
      targetSnapshot: desktopTargetSnapshot,
    });

    expect(event).toEqual({
      id: "fake_host_event:toggle:2026-06-22T10:00:02.000Z",
      source: "fake_host_event",
      action: "toggle",
      receivedAt: "2026-06-22T10:00:02.000Z",
      targetSnapshot: desktopTargetSnapshot,
    });
  });

  it("uses the same toggle transition contract for fake host events and app buttons", () => {
    const fakeHostToggle = createDesktopControlEvent({
      source: "fake_host_event",
      action: "toggle",
      receivedAt: "2026-06-22T10:00:03.000Z",
    });
    const appButtonToggle = createDesktopControlEvent({
      source: "app_button",
      action: "toggle",
      receivedAt: "2026-06-22T10:00:04.000Z",
    });

    expect(resolveDesktopControlTransition({ state: "idle" }, fakeHostToggle)).toMatchObject({
      accepted: true,
      effectiveAction: "start",
      nextState: "arming",
    });
    expect(
      resolveDesktopControlTransition(createSession({ state: "listening" }), appButtonToggle),
    ).toMatchObject({
      accepted: true,
      effectiveAction: "stop",
      nextState: "stopping",
    });
  });

  it("represents desktop control readiness failures without registering real hotkeys", () => {
    expect(createUnavailableDesktopControlReadiness("Fake event source only.")).toEqual({
      controlAvailable: false,
      hotkeyRegistered: false,
      deliveryAvailable: false,
      backgroundModeAvailable: false,
      reason: "Fake event source only.",
    });
  });
});
