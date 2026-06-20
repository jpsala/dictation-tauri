import { describe, expect, it } from "vitest";
import {
  applyCopiedFallback,
  getRecoveryAction,
  getTranscriptReview,
} from "../../src/App";
import type { SimulatedRunSummary } from "../../src/pipeline/types";

describe("host transcript copy fallback", () => {
  it("marks host transcript summaries as copied while preserving transcript review metadata", () => {
    const copied = applyCopiedFallback(createHostTranscriptSummary());

    expect(copied.deliveryEvidence).toEqual({
      status: "copied",
      output: "host transcript ready to copy",
      reason: "Transcript copied as fallback.",
    });
    expect(getTranscriptReview(copied)).toMatchObject({
      text: "host transcript ready to copy",
      provider: "groq",
      model: "whisper-large-v3",
      latencyMs: 42,
      requestId: "req_redacted_copy",
    });
    expect(getRecoveryAction(copied)).toBeUndefined();
  });

  it("keeps transcript review visible when clipboard fallback fails or is unavailable", () => {
    const summaryAfterClipboardFailure = createHostTranscriptSummary();

    expect(getTranscriptReview(summaryAfterClipboardFailure)).toMatchObject({
      text: "host transcript ready to copy",
      provider: "groq",
      model: "whisper-large-v3",
    });
    expect(summaryAfterClipboardFailure.deliveryEvidence).toMatchObject({
      status: "available",
      output: "host transcript ready to copy",
    });
  });

  it("does not claim paste observation in host transcript summaries", () => {
    const summary = createHostTranscriptSummary();
    const copied = applyCopiedFallback(summary);

    expect(JSON.stringify(summary)).not.toContain("paste_observed");
    expect(JSON.stringify(copied)).not.toContain("paste_observed");
  });
});

function createHostTranscriptSummary(): SimulatedRunSummary {
  return {
    runId: "copy-fallback-run",
    fixtureId: "microphone",
    inputKind: "microphone",
    events: [
      {
        type: "transcription_completed",
        runId: "copy-fallback-run",
        fixtureId: "microphone",
        at: 1,
        data: {
          transcript: "host transcript ready to copy",
          latencyMs: 42,
          stt: {
            provider: "groq",
            model: "whisper-large-v3",
            mode: "dry-run",
            requestId: "req_redacted_copy",
          },
        },
      },
    ],
    states: ["idle", "listening", "transcribing", "delivering", "done"],
    terminalState: "done",
    transcript: "host transcript ready to copy",
    output: "host transcript ready to copy",
    delivery: {
      status: "skipped",
      output: "host transcript ready to copy",
      reason: "Transcript is available for manual copy.",
    },
    deliveryEvidence: {
      status: "available",
      output: "host transcript ready to copy",
      reason: "Transcript is available locally. Delivery has not been observed.",
    },
    durationMs: 42,
  };
}
