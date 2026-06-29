import { redactHostRuntimeText } from "../host-runtime/redaction";
import { deriveDeliveryEvidence } from "./evidence";
import {
  deriveObservedPasteEvidence,
  derivePasteObserverErrorEvidence,
  type DesktopPasteObserver,
  type PasteObservation,
} from "./observation";
import type { DeliveryRequest, DesktopDeliveryGateway, DesktopTargetSnapshot } from "./types";

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

function createTargetSnapshot(target: TauriDesktopDeliveryTarget): DesktopTargetSnapshot {
  return {
    appLabel: target.windowClass,
    windowLabel: target.windowTitle,
    confidence: target.inputLike ? "high" : "low",
  };
}

export async function captureTauriDesktopDeliveryTarget(
  invoke: TauriInvoke,
): Promise<TauriDesktopDeliveryTarget | undefined> {
  try {
    const target = await invoke<TauriDesktopDeliveryTarget>("capture_desktop_delivery_target");
    if (target.inputLike) {
      return target;
    }
  } catch {
    // Fall back to a previously cached editable target below. This preserves tray/menu
    // flows where opening the menu can temporarily steal foreground away from the input.
  }

  try {
    const cachedTarget = await invoke<TauriDesktopDeliveryTarget | undefined>(
      "get_cached_desktop_delivery_target",
    );
    return cachedTarget?.inputLike ? cachedTarget : undefined;
  } catch {
    return undefined;
  }
}

export function createTauriSavedTargetDeliveryGateway(input: {
  invoke: TauriInvoke;
  getTarget: () => TauriDesktopDeliveryTarget | undefined;
  getPressEnterAfterPaste?: () => boolean;
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
          {
            text: request.text,
            target,
            pressEnterAfterPaste: input.getPressEnterAfterPaste?.() === true,
          },
        );

        if (result.status === "paste_sent" && input.observer) {
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
          } catch (error) {
            return derivePasteObserverErrorEvidence(request, error);
          }
        }

        return deriveDeliveryEvidence(
          request,
          {
            status: result.status,
            reason: result.reason,
            targetAfter: createTargetSnapshot(result.target),
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
