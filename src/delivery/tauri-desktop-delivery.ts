import { redactHostRuntimeText } from "../host-runtime/redaction";
import { deriveDeliveryEvidence } from "./evidence";
import {
  deriveObservedPasteEvidence,
  derivePasteObserverErrorEvidence,
  type DesktopPasteObserver,
  type PasteObservation,
} from "./observation";
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
  status: "paste_sent";
  reason: string;
  target: TauriDesktopDeliveryTarget;
};

type NativePasteObservationResult = PasteObservation;

export type TauriNativePasteObserverOptions = {
  timeoutMs?: number;
};

export type NativePasteObserverEnv = {
  VITE_ENABLE_NATIVE_PASTE_OBSERVER?: string | boolean;
};

export function isTauriNativePasteObserverEnabled(
  env: NativePasteObserverEnv = import.meta.env as NativePasteObserverEnv,
): boolean {
  return env.VITE_ENABLE_NATIVE_PASTE_OBSERVER === true ||
    env.VITE_ENABLE_NATIVE_PASTE_OBSERVER === "1" ||
    env.VITE_ENABLE_NATIVE_PASTE_OBSERVER === "true";
}

export function createTauriNativePasteObserver(input: {
  invoke: TauriInvoke;
  options?: TauriNativePasteObserverOptions;
}): DesktopPasteObserver<TauriDesktopDeliveryTarget> {
  return {
    observe(observationInput) {
      return input.invoke<NativePasteObservationResult>("observe_desktop_paste", {
        text: observationInput.text,
        target: observationInput.target,
        timeoutMs: input.options?.timeoutMs,
      });
    },
  };
}

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
  observer?: DesktopPasteObserver<TauriDesktopDeliveryTarget>;
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
          { text: request.text, target },
        );

        if (!input.observer) {
          return deriveDeliveryEvidence(request, {
            status: "paste_sent",
            reason: result.reason,
          });
        }

        try {
          const observation = await input.observer.observe({
            sessionId: request.sessionId,
            text: request.text,
            target: result.target,
            targetBefore: request.targetSnapshot,
            pasteSentReason: result.reason,
          });

          return deriveObservedPasteEvidence(request, observation, {
            pasteSentReason: result.reason,
          });
        } catch (observerError) {
          return derivePasteObserverErrorEvidence(request, observerError);
        }
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
