import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { AccountFirstPhase } from "./account-first-flow";
import { normalizeSetupReadinessProjection } from "./tauri-setup-readiness";

export type TauriAccountGateInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

type EffectiveAccountReadiness = {
  ready: boolean;
  phase: AccountFirstPhase;
};

type TauriAccountGateProps = {
  invoke: TauriAccountGateInvoke;
  renderReady: () => ReactNode;
};

export async function getEffectiveTauriAccountReadiness(
  invoke: TauriAccountGateInvoke,
): Promise<EffectiveAccountReadiness> {
  try {
    const projection = normalizeSetupReadinessProjection(
      await invoke("get_fixvox_setup_readiness"),
    );
    return { ready: projection.ready, phase: projection.phase };
  } catch {
    return { ready: false, phase: "service_unavailable" };
  }
}

export async function openTauriAccountSetup(invoke: TauriAccountGateInvoke): Promise<void> {
  await invoke("hide_dock");
  await invoke("show_account_setup_window");
}

export async function openTauriAccountNotice(invoke: TauriAccountGateInvoke): Promise<void> {
  await invoke("show_account_notice_window");
}

export function shouldOpenTauriAccountSetup(phase: AccountFirstPhase): boolean {
  return phase === "welcome" ||
    phase === "oauth_handoff" ||
    phase === "account_linking" ||
    phase === "oauth_cancelled" ||
    phase === "oauth_expired" ||
    phase === "account_not_authorized" ||
    phase === "binding_conflict";
}

export function projectTauriAccountGateReady(
  currentReady: boolean,
  readiness: EffectiveAccountReadiness,
): boolean {
  if (readiness.ready) {
    return true;
  }
  return shouldOpenTauriAccountSetup(readiness.phase) ? false : currentReady;
}

export async function ensureTauriDictationReadiness(
  invoke: TauriAccountGateInvoke,
): Promise<boolean> {
  const readiness = await getEffectiveTauriAccountReadiness(invoke);
  if (readiness.ready) {
    return true;
  }

  if (shouldOpenTauriAccountSetup(readiness.phase)) {
    await openTauriAccountSetup(invoke);
  }
  return false;
}

export type DockGateFeedback = {
  /** Short pill label shown in the compact dock. */
  label: string;
  /** Hover/tooltip context; never exposes device id, policy, or provider. */
  detail: string;
  /** Presence of an action turns the pill into a button. */
  action?: "open-notice" | "refresh";
};

/** Maps a not-ready phase to the compact feedback the dock can show. */
export function dockGateFeedbackForPhase(
  phase: AccountFirstPhase | null,
): DockGateFeedback {
  switch (phase) {
    case "service_unavailable":
      return {
        label: "Conectá tu cuenta",
        detail: "Iniciá sesión para empezar a dictar.",
        action: "open-notice",
      };
    case "offline":
      return {
        label: "Reintentar",
        detail: "No pudimos conectarnos. Revisá tu conexión.",
        action: "refresh",
      };
    case "policy_unavailable":
      return {
        label: "Reintentar",
        detail: "El servicio no está disponible. Intentá de nuevo.",
        action: "refresh",
      };
    default:
      return {
        label: "Verificando…",
        detail: "Comprobando tu cuenta.",
      };
  }
}

/** Keeps the dock unavailable until the host reports an effective signed-in account. */
export function TauriAccountGate({ invoke, renderReady }: TauriAccountGateProps) {
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<AccountFirstPhase | null>(null);
  const [openingSetup, setOpeningSetup] = useState(false);
  const setupOpenedRef = useRef(false);

  const refresh = useCallback(async () => {
    const readiness = await getEffectiveTauriAccountReadiness(invoke);
    setReady((currentReady) => projectTauriAccountGateReady(currentReady, readiness));
    setPhase(readiness.phase);
    if (readiness.ready) {
      setOpeningSetup(false);
      return;
    }
    if (!shouldOpenTauriAccountSetup(readiness.phase)) {
      setOpeningSetup(false);
      return;
    }
    if (!setupOpenedRef.current) {
      setupOpenedRef.current = true;
      setOpeningSetup(true);
      await openTauriAccountSetup(invoke).catch(() => undefined);
    }
  }, [invoke]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (ready) {
    return <>{renderReady()}</>;
  }

  let label: string;
  let detail: string;
  let action: DockGateFeedback["action"];

  if (openingSetup) {
    label = "Abriendo configuración…";
    detail = "Se está abriendo la configuración de tu cuenta.";
    action = undefined;
  } else {
    const feedback = dockGateFeedbackForPhase(phase);
    label = feedback.label;
    detail = feedback.detail;
    action = feedback.action;
  }

  const pillClassName =
    action === undefined
      ? "dock-gate__pill dock-gate__pill--progress"
      : "dock-gate__pill dock-gate__pill--action";

  const activate = () => {
    if (action === "open-notice") {
      void openTauriAccountNotice(invoke).catch(() => undefined);
      return;
    }
    if (action === "refresh") {
      void refresh();
    }
  };

  return (
    <main className="dock-gate" aria-live="polite" data-testid="account-setup-opening">
      {action === undefined ? (
        <span className={pillClassName} title={detail}>
          <span className="dock-gate__dot" aria-hidden="true" />
          {label}
        </span>
      ) : (
        <button
          type="button"
          className={pillClassName}
          title={detail}
          onClick={activate}
        >
          <span className="dock-gate__dot" aria-hidden="true" />
          {label}
        </button>
      )}
    </main>
  );
}
