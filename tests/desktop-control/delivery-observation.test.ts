import { describe, expect, it } from "vitest";
import {
  createTauriSavedTargetDeliveryGateway,
  deriveObservedPasteEvidence,
  type DesktopPasteObserver,
  type PasteObservation,
} from "../../src/delivery";
import { createDeliveryRequest } from "./desktop-control-fixtures";

const observedTarget = {
  confidence: "high" as const,
  appLabel: "Scratchpad",
  windowLabel: "Scratchpad - Notepad",
};

describe("verified paste observation evidence", () => {
  it("promotes paste-send evidence only for a verified high-confidence observer", () => {
    const evidence = deriveObservedPasteEvidence(
      createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: true }),
      {
        status: "observed",
        confidence: "high",
        reason: "Observer confirmed the target changed after paste.",
        targetAfter: observedTarget,
      },
      { pasteSentReason: "Paste command was sent before observation." },
    );

    expect(evidence).toMatchObject({
      status: "paste_observed",
      strategy: "paste_send",
      reason: "Observer confirmed the target changed after paste.",
      targetAfter: observedTarget,
      message: "Paste insertion was observed by a verified desktop observer.",
    });
  });

  it.each([
    {
      status: "observed" as const,
      confidence: "medium" as const,
      reason: "Observer saw a possible edit but confidence was not high enough.",
    },
    {
      status: "not_observed" as const,
      confidence: "none" as const,
      reason: "Target did not expose a changed text range before timeout.",
    },
    {
      status: "mismatch" as const,
      confidence: "high" as const,
      reason: "Observed target content did not match the requested transcript.",
    },
    {
      status: "unsupported" as const,
      confidence: "none" as const,
      reason: "Target does not expose a supported observation surface.",
    },
    {
      status: "timeout" as const,
      confidence: "low" as const,
      reason: "Observer timed out before target confirmation.",
    },
  ] satisfies PasteObservation[])(
    "keeps $status/$confidence observation as paste_sent without overclaiming",
    (observation) => {
      const evidence = deriveObservedPasteEvidence(
        createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: true }),
        observation,
        { pasteSentReason: "Paste command was sent before observation." },
      );

      expect(evidence).toMatchObject({
        status: "paste_sent",
        strategy: "paste_send",
        reason: observation.reason,
        message: "Paste command was sent but target insertion was not observed.",
      });
      expect(JSON.stringify(evidence)).not.toContain("paste_observed");
    },
  );

  it("still downgrades paste-send when desktop side effects are disabled", () => {
    const evidence = deriveObservedPasteEvidence(
      createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: false }),
      {
        status: "observed",
        confidence: "high",
        reason: "Fake observer should not promote when side effects are disabled.",
      },
      { pasteSentReason: "Paste command was requested." },
    );

    expect(evidence).toMatchObject({
      status: "uncertain",
      strategy: "paste_send",
      message: "Delivery outcome is uncertain; transcript remains available.",
    });
  });

  it("lets the Tauri saved-target gateway keep paste_sent when no observer is configured", async () => {
    const gateway = createTauriSavedTargetDeliveryGateway({
      invoke: async () => ({
        status: "paste_sent",
        reason: "Paste command was sent to the saved foreground target without observation.",
        target: createNativeTarget(),
      }),
      getTarget: createNativeTarget,
    });

    await expect(
      gateway.deliver(createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: true })),
    ).resolves.toMatchObject({
      status: "paste_sent",
      reason: "Paste command was sent to the saved foreground target without observation.",
    });
  });

  it("promotes the Tauri saved-target gateway only through an injected observer", async () => {
    const observer: DesktopPasteObserver = {
      async observe(input) {
        expect(input.text).toBe("desktop control transcript");
        expect(input.target.frameHwnd).toBe("123");
        return {
          status: "observed",
          confidence: "high",
          reason: "Injected observer confirmed insertion in the saved target.",
          targetAfter: observedTarget,
        };
      },
    };
    const gateway = createTauriSavedTargetDeliveryGateway({
      invoke: async () => ({
        status: "paste_sent",
        reason: "Paste command was sent to the saved foreground target before observation.",
        target: createNativeTarget(),
      }),
      getTarget: createNativeTarget,
      observer,
    });

    await expect(
      gateway.deliver(createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: true })),
    ).resolves.toMatchObject({
      status: "paste_observed",
      reason: "Injected observer confirmed insertion in the saved target.",
      targetAfter: observedTarget,
    });
  });

  it("redacts observer failures and preserves recovery as paste_sent", async () => {
    const observer: DesktopPasteObserver = {
      async observe() {
        throw new Error("Observer failed with Authorization: Bearer sk-observer-secret");
      },
    };
    const gateway = createTauriSavedTargetDeliveryGateway({
      invoke: async () => ({
        status: "paste_sent",
        reason: "Paste command was sent before observer failure.",
        target: createNativeTarget(),
      }),
      getTarget: createNativeTarget,
      observer,
    });

    await expect(
      gateway.deliver(createDeliveryRequest({ strategy: "paste_send", allowDesktopSideEffects: true })),
    ).resolves.toMatchObject({
      status: "paste_sent",
      reason: "Observer failed with Authorization: Bearer [REDACTED]",
    });
  });
});

function createNativeTarget() {
  return {
    frameHwnd: "123",
    windowTitle: "Scratchpad",
    windowClass: "Notepad",
    processId: 1,
    inputLike: true,
    reason: "foreground target captured before dictation",
  };
}
