import { describe, expect, it } from "vitest";
import {
  assertDefaultDeliveryEvidenceAllowed,
  createReviewOnlyEvidence,
  deriveDeliveryEvidence,
  isPasteObservedEvidence,
} from "../../src/delivery/evidence";
import {
  createCopyDeliveryGateway,
  createPasteSendDeliveryGateway,
  createReviewOnlyDeliveryGateway,
} from "../../src/delivery/adapters";
import { createTauriSavedTargetDeliveryGateway } from "../../src/delivery/tauri-desktop-delivery";
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

  it("delivers review-only evidence as available without a desktop handoff", async () => {
    const gateway = createReviewOnlyDeliveryGateway();

    await expect(
      gateway.deliver(
        createDeliveryRequest({
          strategy: "copy",
          allowDesktopSideEffects: true,
        }),
      ),
    ).resolves.toMatchObject({
      status: "available",
      output: "desktop control transcript",
      strategy: "review_only",
      message: "Transcript is available for review and manual copy.",
    });
  });

  it("records fake copy success and failure without hiding the transcript", async () => {
    const copied = createCopyDeliveryGateway({
      copyText: async () => undefined,
      successReason: "Fake clipboard accepted the text.",
    });
    const failed = createCopyDeliveryGateway({
      copyText: async () => {
        throw new Error("Fake clipboard rejected the text.");
      },
    });

    await expect(
      copied.deliver(createDeliveryRequest({ strategy: "copy", allowDesktopSideEffects: true })),
    ).resolves.toMatchObject({
      status: "copied",
      output: "desktop control transcript",
      strategy: "copy",
      reason: "Fake clipboard accepted the text.",
    });

    await expect(
      failed.deliver(createDeliveryRequest({ strategy: "copy", allowDesktopSideEffects: true })),
    ).resolves.toMatchObject({
      status: "failed",
      output: "desktop control transcript",
      strategy: "copy",
      reason: "Fake clipboard rejected the text.",
      message: "Delivery failed; transcript remains available for review.",
    });
  });

  it("redacts secret-looking diagnostics from delivery adapter reasons", async () => {
    const failedCopy = createCopyDeliveryGateway({
      copyText: async () => {
        throw new Error("Clipboard rejected TOKEN=ghp_secret_copy");
      },
    });
    const failedPaste = createPasteSendDeliveryGateway({
      failWith: "Paste failed with Authorization: Bearer sk-secret-paste",
    });

    await expect(
      failedCopy.deliver(createDeliveryRequest({ strategy: "copy", allowDesktopSideEffects: true })),
    ).resolves.toMatchObject({
      status: "failed",
      reason: "Clipboard rejected TOKEN=[REDACTED]",
    });
    await expect(
      failedPaste.deliver(
        createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: true }),
      ),
    ).resolves.toMatchObject({
      status: "failed",
      reason: "Paste failed with Authorization: Bearer [REDACTED]",
    });
  });

  it("sends Tauri saved-target paste as paste_sent without claiming observation", async () => {
    const gateway = createTauriSavedTargetDeliveryGateway({
      invoke: async () => ({
        status: "paste_sent",
        reason: "Paste command was sent to the saved foreground target without observation.",
        target: {
          frameHwnd: "123",
          windowTitle: "Scratchpad",
          windowClass: "Notepad",
          processId: 1,
          inputLike: true,
          reason: "foreground target captured before dictation",
        },
      }),
      getTarget: () => ({
        frameHwnd: "123",
        windowTitle: "Scratchpad",
        windowClass: "Notepad",
        processId: 1,
        inputLike: true,
        reason: "foreground target captured before dictation",
      }),
    });

    await expect(
      gateway.deliver(createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: true })),
    ).resolves.toMatchObject({
      status: "paste_sent",
      strategy: "paste_send",
      reason: "Paste command was sent to the saved foreground target without observation.",
    });
  });

  it("falls back when Tauri paste has no saved target", async () => {
    const gateway = createTauriSavedTargetDeliveryGateway({
      invoke: async () => {
        throw new Error("should not invoke without target");
      },
      getTarget: () => undefined,
    });

    await expect(
      gateway.deliver(createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: true })),
    ).resolves.toMatchObject({
      status: "failed",
      strategy: "paste_send",
      output: "desktop control transcript",
      reason: "No saved editable target is available for paste delivery.",
    });
  });

  it("records fake paste-send as sent or uncertain, never observed", async () => {
    const gateway = createPasteSendDeliveryGateway({
      reason: "A fake paste command was sent without observation.",
    });

    const sent = await gateway.deliver(
      createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: true }),
    );
    const blocked = await gateway.deliver(
      createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: false }),
    );

    expect(sent).toMatchObject({
      status: "paste_sent",
      strategy: "paste_send",
      reason: "A fake paste command was sent without observation.",
    });
    expect(blocked).toMatchObject({
      status: "uncertain",
      strategy: "paste_send",
      reason: "A fake paste command was sent without observation.",
    });
    expect(JSON.stringify([sent, blocked])).not.toContain("paste_observed");
  });
});
