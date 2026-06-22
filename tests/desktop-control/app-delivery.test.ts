import { describe, expect, it } from "vitest";
import {
  applyDeliveryEvidenceFallback,
  applySafePasteLastRecovery,
  formatDesktopRecoveryAction,
  getTranscriptReview,
} from "../../src/App";
import type { SimulatedRunSummary } from "../../src/pipeline/types";

describe("App delivery fallback", () => {
  it("formats controller recovery actions for the shared recovery line", () => {
    expect(
      formatDesktopRecoveryAction({
        kind: "record_again",
        label: "Check microphone setup",
        reason: "Check microphone permission or device setup, then record again.",
        clipAvailable: false,
      }),
    ).toBe(
      "Check microphone setup: Check microphone permission or device setup, then record again.",
    );

    expect(
      formatDesktopRecoveryAction({
        kind: "dismiss",
        label: "Dismiss",
        reason: "No further automatic action is required for this control event.",
        clipAvailable: false,
      }),
    ).toBeUndefined();
  });

  it("keeps transcript review visible after delivery failure", () => {
    const summary = createReviewSummary();
    const afterFailure = applyDeliveryEvidenceFallback(summary, {
      status: "failed",
      output: "transcript remains visible",
      strategy: "copy",
      message: "Delivery failed; transcript remains available for review.",
      reason: "Fake copy failed.",
    });

    expect(afterFailure.deliveryEvidence).toEqual({
      status: "failed",
      output: "transcript remains visible",
      reason: "Fake copy failed.",
    });
    expect(getTranscriptReview(afterFailure)).toMatchObject({
      text: "transcript remains visible",
      provider: "host-runtime-fake",
      model: "fake-model",
    });
  });

  it("marks paste-last recovery as uncertain without sending or observing paste", () => {
    const summary = createReviewSummary();
    const afterPasteLast = applySafePasteLastRecovery(summary);

    expect(afterPasteLast.deliveryEvidence).toEqual({
      status: "uncertain",
      output: "transcript remains visible",
      reason:
        "Paste last was not sent in safe mode; transcript remains available for manual copy.",
    });
    expect(getTranscriptReview(afterPasteLast)).toMatchObject({
      text: "transcript remains visible",
    });
    expect(JSON.stringify(afterPasteLast)).not.toContain("paste_observed");
    expect(afterPasteLast.deliveryEvidence?.status).not.toBe("paste_sent");
  });

  it("leaves summaries without latest output unchanged", () => {
    const summary: SimulatedRunSummary = {
      ...createReviewSummary(),
      transcript: undefined,
      output: undefined,
      deliveryEvidence: undefined,
    };

    expect(applySafePasteLastRecovery(summary)).toBe(summary);
    expect(getTranscriptReview(summary)).toBeUndefined();
  });
});

function createReviewSummary(): SimulatedRunSummary {
  return {
    runId: "app-delivery-run",
    fixtureId: "microphone",
    inputKind: "microphone",
    events: [
      {
        type: "transcription_completed",
        runId: "app-delivery-run",
        fixtureId: "microphone",
        at: 1,
        data: {
          transcript: "transcript remains visible",
          latencyMs: 7,
          stt: {
            provider: "host-runtime-fake",
            model: "fake-model",
            mode: "dry-run",
            requestId: "redacted-request",
          },
        },
      },
    ],
    states: ["idle", "listening", "transcribing", "delivering", "done"],
    terminalState: "done",
    transcript: "transcript remains visible",
    output: "transcript remains visible",
    delivery: {
      status: "skipped",
      output: "transcript remains visible",
      reason: "Transcript is available for manual copy.",
    },
    deliveryEvidence: {
      status: "available",
      output: "transcript remains visible",
      reason: "Transcript is available locally. Delivery has not been observed.",
    },
    durationMs: 7,
  };
}
