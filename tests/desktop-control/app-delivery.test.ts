import { describe, expect, it } from "vitest";
import {
  applyDeliveryEvidenceFallback,
  getTranscriptReview,
} from "../../src/App";
import type { SimulatedRunSummary } from "../../src/pipeline/types";

describe("App delivery fallback", () => {
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
