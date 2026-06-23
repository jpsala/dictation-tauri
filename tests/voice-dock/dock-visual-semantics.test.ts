import { describe, expect, it } from "vitest";
import {
  createVoiceDockState,
  sanitizeVuBands,
} from "../../src/voice-dock/visual-semantics";
import type { DesktopDictationSession } from "../../src/desktop-control/types";

function session(input: Partial<DesktopDictationSession>): DesktopDictationSession {
  return {
    sessionId: "dock-session-001",
    controlSource: "app_button",
    state: "idle",
    ...input,
  } as DesktopDictationSession;
}

describe("voice dock visual semantics", () => {
  it("renders idle as a quiet launcher with no stop or recovery controls", () => {
    expect(createVoiceDockState({ state: "idle" })).toMatchObject({
      phase: "idle",
      statusText: "Ready",
      active: false,
      busy: false,
      canStart: true,
      canStop: false,
      canCancel: false,
      canCopy: false,
      canPasteLastSafe: false,
      vuLevel: 0,
      vuBands: [0, 0, 0, 0, 0, 0, 0],
    });
  });

  it("renders arming and recording as active states with live controls and VU bands", () => {
    expect(
      createVoiceDockState(session({ state: "arming" }), {
        vuLevel: 0.3,
        vuBands: [0.1, 0.8],
      }),
    ).toMatchObject({
      phase: "arming",
      statusText: "Starting mic",
      active: true,
      busy: true,
      canStart: false,
      canStop: true,
      canCancel: true,
      vuLevel: 0.3,
      vuBands: [0.1, 0.8, 0, 0, 0, 0, 0],
    });

    expect(
      createVoiceDockState(session({ state: "listening" }), {
        vuLevel: 1.7,
        vuBands: [-1, 0.25, 2],
      }),
    ).toMatchObject({
      phase: "recording",
      statusText: "Recording",
      active: true,
      busy: false,
      canStop: true,
      canCancel: true,
      vuLevel: 1,
      vuBands: [0, 0.25, 1, 0, 0, 0, 0],
    });
  });

  it("renders processing from stopping/transcribing/postprocessing/delivering without claiming paste observation", () => {
    for (const state of ["stopping", "transcribing", "postprocessing", "delivering"] as const) {
      const dock = createVoiceDockState(session({ state }));

      expect(dock).toMatchObject({
        phase: "processing",
        active: true,
        busy: true,
        canStart: false,
        canStop: false,
        canCopy: false,
      });
      expect(JSON.stringify(dock)).not.toContain("paste_observed");
    }
  });

  it("renders review with copy and safe paste-last recovery actions when output exists", () => {
    expect(
      createVoiceDockState(
        session({
          state: "reviewing",
          delivery: {
            status: "available",
            strategy: "review_only",
            output: "local transcript",
            message: "Transcript is available.",
          },
        }),
        { canPasteLastSafe: true },
      ),
    ).toMatchObject({
      phase: "review",
      statusText: "Review ready",
      canCopy: true,
      canPasteLastSafe: true,
      recovery: {
        kind: "copy",
        primaryAction: "copy",
        secondaryAction: "paste_last_safe",
      },
    });
  });

  it("renders failed, cancelled, and uncertain recovery honestly", () => {
    expect(
      createVoiceDockState(
        session({
          state: "error",
          error: { message: "Provider unavailable", code: "provider_unavailable" },
          recoveryAction: {
            kind: "retry_from_clip",
            label: "Retry",
            reason: "Provider failed.",
            clipAvailable: true,
          },
        }),
      ),
    ).toMatchObject({
      phase: "failed",
      statusText: "Needs attention",
      canRetry: true,
      recovery: {
        kind: "retry",
        primaryAction: "retry",
      },
    });

    expect(createVoiceDockState(session({ state: "cancelled" }))).toMatchObject({
      phase: "cancelled",
      statusText: "Cancelled",
      canRetry: true,
      recovery: {
        kind: "record_again",
        primaryAction: "retry",
      },
    });

    const uncertain = createVoiceDockState(
      session({
        state: "done",
        delivery: {
          status: "uncertain",
          strategy: "paste_send",
          output: "local transcript",
          message: "Paste was not observed.",
        },
      }),
      { canPasteLastSafe: true },
    );

    expect(uncertain).toMatchObject({
      phase: "uncertain",
      statusText: "Check target",
      canCopy: true,
      canPasteLastSafe: true,
      recovery: {
        kind: "uncertain",
        primaryAction: "copy",
        secondaryAction: "paste_last_safe",
      },
    });
    expect(JSON.stringify(uncertain)).not.toContain("paste_observed");
  });

  it("normalizes VU bands for the seven-dot dock affordance", () => {
    expect(sanitizeVuBands([0.2, Number.NaN, 0.9], 5)).toEqual([0.2, 0, 0.9, 0, 0]);
  });
});
