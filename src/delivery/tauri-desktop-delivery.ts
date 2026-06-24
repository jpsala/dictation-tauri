import { redactHostRuntimeText } from "../host-runtime/redaction";
import { deriveDeliveryEvidence } from "./evidence";
import type { DeliveryRequest, DesktopDeliveryGateway } from "./types";

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export type TauriDesktopDeliveryTarget = {
  frameHwnd: string;
  windowTitle: string;
  windowClass: string;
  processId: number;
  inputLike: boolean;
  reason: string;
};

type NativeDeliveryResult = {
  status: "paste_sent" | "paste_observed";
  reason: string;
  target: TauriDesktopDeliveryTarget;
};

export async function captureTauriDesktopDeliveryTarget(
  invoke: TauriInvoke,
): Promise<TauriDesktopDeliveryTarget | undefined> {
  try {
    const target = await invoke<TauriDesktopDeliveryTarget>("capture_desktop_delivery_target");
    return target.inputLike ? target : undefined;
  } catch {
    return undefined;
  }
}

export function createTauriSavedTargetDeliveryGateway(input: {
  invoke: TauriInvoke;
  getTarget: () => TauriDesktopDeliveryTarget | undefined;
  getPressEnterAfterPaste?: () => boolean;
}): DesktopDeliveryGateway {
  return {
    async deliver(request: DeliveryRequest) {
      const target = input.getTarget();
      if (!target) {
        return deriveDeliveryEvidence(request, {
          status: "failed",
          reason: "No saved editable target is available for paste delivery.",
        });
      }

      try {
        const result = await input.invoke<NativeDeliveryResult>(
          "deliver_text_to_desktop_target",
          {
            text: request.text,
            target,
            pressEnterAfterPaste: input.getPressEnterAfterPaste?.() === true,
          },
        );

        return deriveDeliveryEvidence(
          request,
          {
            status: result.status,
            reason: result.reason,
          },
          { allowVerifiedPasteObservation: result.status === "paste_observed" },
        );
      } catch (error) {
        return deriveDeliveryEvidence(request, {
          status: "failed",
          reason: redactHostRuntimeText(error, {
            maxMessageLength: 220,
          }),
        });
      }
    },
  };
}
