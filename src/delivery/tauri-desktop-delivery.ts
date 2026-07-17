import { redactHostRuntimeText } from "../host-runtime/redaction";
import { createReviewOnlyEvidence, deriveDeliveryEvidence } from "./evidence";
import {
  deriveObservedPasteEvidence,
  derivePasteObserverErrorEvidence,
  type DesktopPasteObserver,
  type PasteObservation,
} from "./observation";
import type {
  DeliveryRequest,
  DeliveryTargetAffinity,
  DesktopDeliveryGateway,
  DesktopTargetSnapshot,
} from "./types";

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export type TauriDesktopDeliveryTarget = {
  frameHwnd: string;
  windowTitle: string;
  windowClass: string;
  processId: number;
  processName?: string;
  inputLike: boolean;
  reason: string;
  cacheReason?: string;
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
  options: { preferForegroundWatcherCacheOverTerminal?: boolean } = {},
): Promise<TauriDesktopDeliveryTarget | undefined> {
  let currentTarget: TauriDesktopDeliveryTarget | undefined;
  try {
    currentTarget = await invoke<TauriDesktopDeliveryTarget>("capture_desktop_delivery_target");
  } catch {
    // Fall back to a previously cached editable target below. This preserves tray/menu
    // flows where opening the menu can temporarily steal foreground away from the input.
  }

  let cachedTarget: TauriDesktopDeliveryTarget | undefined;
  try {
    cachedTarget = await invoke<TauriDesktopDeliveryTarget | undefined>(
      "get_cached_desktop_delivery_target",
    );
  } catch {
    // No cached target available.
  }

  if (
    options.preferForegroundWatcherCacheOverTerminal === true &&
    currentTarget?.inputLike &&
    isTerminalLikeTarget(currentTarget) &&
    cachedTarget?.inputLike &&
    !isTerminalLikeTarget(cachedTarget) &&
    cachedTarget.cacheReason === "foreground_watcher"
  ) {
    return cachedTarget;
  }

  if (currentTarget?.inputLike) {
    return currentTarget;
  }

  return cachedTarget?.inputLike ? cachedTarget : undefined;
}

function isTerminalLikeTarget(target: TauriDesktopDeliveryTarget): boolean {
  const haystack = `${target.processName ?? ""} ${target.windowClass} ${target.windowTitle}`.toLowerCase();
  return haystack.includes("tabby.exe") ||
    haystack.includes("windowsterminal.exe") ||
    haystack.includes("powershell.exe") ||
    haystack.includes("pwsh.exe") ||
    haystack.includes("cmd.exe") ||
    haystack.includes("cascadia_hosting_window_class") ||
    haystack.includes("consolewindowclass") ||
    haystack.includes("windows powershell") ||
    haystack.includes("powershell") ||
    haystack.includes("command prompt");
}

function resolveAssuredDeliveryTarget(input: {
  savedTarget?: TauriDesktopDeliveryTarget;
  currentTarget?: TauriDesktopDeliveryTarget;
  targetAffinity?: DeliveryTargetAffinity;
}): TauriDesktopDeliveryTarget | undefined {
  const savedTarget = input.savedTarget?.inputLike ? input.savedTarget : undefined;
  const currentTarget = input.currentTarget?.inputLike ? input.currentTarget : undefined;

  if (input.targetAffinity === "saved") {
    return savedTarget ?? currentTarget;
  }

  if (!currentTarget) {
    return savedTarget;
  }

  if (savedTarget && isTerminalLikeTarget(currentTarget) && !isTerminalLikeTarget(savedTarget)) {
    return savedTarget;
  }

  return currentTarget;
}

export function createTauriSavedTargetDeliveryGateway(input: {
  invoke: TauriInvoke;
  getTarget: () => TauriDesktopDeliveryTarget | undefined;
  getStopTarget?: () => TauriDesktopDeliveryTarget | undefined;
  getFollowFocusUntilDelivery?: () => boolean;
  getPressEnterAfterPaste?: () => boolean;
  observer?: DesktopPasteObserver<TauriDesktopDeliveryTarget>;
}): DesktopDeliveryGateway {
  return {
    async deliver(request: DeliveryRequest) {
      if (!request.allowDesktopSideEffects || request.strategy === "review_only") {
        return createReviewOnlyEvidence(request);
      }

      const savedTarget = input.getTarget();
      const useStopTarget = request.targetAffinity !== "saved" &&
        input.getFollowFocusUntilDelivery?.() === false;
      const stopTarget = useStopTarget ? input.getStopTarget?.() : undefined;
      const savedTargetIsExplicitTerminal = savedTarget?.inputLike === true &&
        isTerminalLikeTarget(savedTarget);
      const currentTarget = request.targetAffinity === "saved" || useStopTarget
        ? undefined
        : await captureTauriDesktopDeliveryTarget(input.invoke, {
            preferForegroundWatcherCacheOverTerminal: !savedTargetIsExplicitTerminal,
          });
      const target = useStopTarget
        ? stopTarget?.inputLike ? stopTarget : undefined
        : resolveAssuredDeliveryTarget({
            savedTarget,
            currentTarget,
            targetAffinity: request.targetAffinity,
          });
      if (!target) {
        return deriveDeliveryEvidence(request, {
          status: "failed",
          reason: "No assured editable target is available for paste delivery.",
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
