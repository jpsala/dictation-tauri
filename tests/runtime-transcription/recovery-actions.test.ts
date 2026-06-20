import { describe, expect, it } from "vitest";
import { deriveRuntimeRecoveryAction } from "../../src/model-gateway/runtime-transcription";

describe("runtime recovery actions", () => {
  it("offers manual copy when transcript text is available", () => {
    expect(
      deriveRuntimeRecoveryAction({
        status: "ok",
        clipAvailable: true,
        transcriptAvailable: true,
      }),
    ).toEqual({
      kind: "copy_manually",
      label: "Copy transcript manually",
      reason: "Transcript is available even if automatic delivery is not verified.",
      clipAvailable: true,
    });
  });

  it("treats copied delivery as completed recovery", () => {
    expect(
      deriveRuntimeRecoveryAction({
        status: "ok",
        clipAvailable: true,
        transcriptAvailable: true,
        deliveryStatus: "copied",
      }),
    ).toEqual({
      kind: "none",
      label: "No action needed",
      reason: "The transcript already has confirmed delivery evidence.",
      clipAvailable: true,
    });
  });

  it("points setup failures to setup inspection", () => {
    expect(
      deriveRuntimeRecoveryAction({
        status: "setup-error",
        clipAvailable: true,
      }),
    ).toMatchObject({
      kind: "inspect_setup",
      clipAvailable: true,
    });
  });

  it("points setup failures without a clip to setup inspection before recording again", () => {
    expect(
      deriveRuntimeRecoveryAction({
        status: "setup-error",
        clipAvailable: false,
      }),
    ).toEqual({
      kind: "inspect_setup",
      label: "Inspect provider setup",
      reason: "Provider configuration must be fixed before retrying transcription.",
      clipAvailable: false,
    });
  });

  it("allows retry from the same clip after provider failures", () => {
    expect(
      deriveRuntimeRecoveryAction({
        status: "provider-error",
        clipAvailable: true,
      }),
    ).toMatchObject({
      kind: "retry_transcription",
      clipAvailable: true,
    });
  });

  it("allows retry from the same clip after empty transcript text", () => {
    expect(
      deriveRuntimeRecoveryAction({
        status: "empty",
        clipAvailable: true,
      }),
    ).toEqual({
      kind: "retry_transcription",
      label: "Retry transcription",
      reason: "No usable transcript text was produced, but the clip is still available.",
      clipAvailable: true,
    });
  });

  it("asks for a new recording when empty transcript cannot reuse a clip", () => {
    expect(
      deriveRuntimeRecoveryAction({
        status: "empty",
        clipAvailable: false,
      }),
    ).toEqual({
      kind: "record_again",
      label: "Record again",
      reason: "No usable transcript text was produced and the clip is unavailable.",
      clipAvailable: false,
    });
  });

  it("allows retry after cancellation when the clip is still available", () => {
    expect(
      deriveRuntimeRecoveryAction({
        status: "cancelled",
        clipAvailable: true,
      }),
    ).toEqual({
      kind: "retry_transcription",
      label: "Retry transcription",
      reason: "The run was cancelled and the captured clip is still available.",
      clipAvailable: true,
    });
  });

  it("keeps delivery uncertainty recoverable through manual copy", () => {
    expect(
      deriveRuntimeRecoveryAction({
        status: "ok",
        clipAvailable: true,
        transcriptAvailable: true,
        deliveryStatus: "uncertain",
      }),
    ).toMatchObject({
      kind: "copy_manually",
      label: "Copy transcript manually",
    });
  });
});
