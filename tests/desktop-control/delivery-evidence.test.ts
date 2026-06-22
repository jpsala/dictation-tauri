import { describe, expect, it } from "vitest";
import {
  assertDefaultDeliveryEvidenceAllowed,
  createReviewOnlyEvidence,
  deriveDeliveryEvidence,
  isPasteObservedEvidence,
} from "../../src/delivery/evidence";
import { createDeliveryRequest } from "./desktop-control-fixtures";

describe("desktop delivery evidence foundation", () => {
  it("marks review-only text as available without desktop side effects", () => {
    const evidence = createReviewOnlyEvidence(
      createDeliveryRequest({ strategy: "review_only", allowDesktopSideEffects: false }),
    );

    expect(evidence).toMatchObject({
      status: "available",
      output: "desktop control transcript",
      strategy: "review_only",
      message: "Transcript is available for review and manual copy.",
    });
    expect(JSON.stringify(evidence)).not.toContain("paste_observed");
  });

  it("records copy success as copied instead of observed paste", () => {
    const evidence = deriveDeliveryEvidence(
      createDeliveryRequest({ strategy: "copy", allowDesktopSideEffects: true }),
      {
        status: "copied",
        reason: "Fake clipboard accepted the text.",
      },
    );

    expect(evidence).toMatchObject({
      status: "copied",
      output: "desktop control transcript",
      strategy: "copy",
      message: "Transcript was copied; target insertion was not observed.",
      reason: "Fake clipboard accepted the text.",
    });
    expect(isPasteObservedEvidence(evidence)).toBe(false);
  });

  it("downgrades paste send to uncertain when desktop side effects are disabled", () => {
    const evidence = deriveDeliveryEvidence(
      createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: false }),
      {
        status: "paste_sent",
        reason: "Paste send was requested by a fake adapter.",
      },
    );

    expect(evidence).toMatchObject({
      status: "uncertain",
      strategy: "paste_send",
      message: "Delivery outcome is uncertain; transcript remains available.",
      reason: "Paste send was requested by a fake adapter.",
    });
  });

  it("allows unverified paste send evidence but never claims observation", () => {
    const evidence = deriveDeliveryEvidence(
      createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: true }),
      {
        status: "paste_sent",
        reason: "A fake paste command was sent without observation.",
      },
    );

    expect(evidence).toMatchObject({
      status: "paste_sent",
      strategy: "paste_send",
      message: "Paste command was sent but target insertion was not observed.",
    });
    expect(JSON.stringify(evidence)).not.toContain("paste_observed");
  });

  it("forbids default paste_observed evidence without a verified observer", () => {
    expect(() =>
      deriveDeliveryEvidence(
        createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: true }),
        {
          status: "paste_observed",
          message: "Fake adapter tried to overclaim insertion.",
        },
      ),
    ).toThrow("paste_observed is forbidden without a verified desktop observer.");

    expect(() =>
      assertDefaultDeliveryEvidenceAllowed({
        status: "paste_observed",
        strategy: "paste_send",
        message: "unverified",
      }),
    ).toThrow("verified desktop observer");
  });
});
