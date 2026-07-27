import { useEffect, useRef, useState, type ReactNode } from "react";
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

/** Keeps the dock unavailable until the host reports an effective signed-in account. */
export function TauriAccountGate({ invoke, renderReady }: TauriAccountGateProps) {
  const [ready, setReady] = useState(false);
  const [openingSetup, setOpeningSetup] = useState(false);
  const setupOpenedRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      const readiness = await getEffectiveTauriAccountReadiness(invoke);
      if (disposed) {
        return;
      }

      setReady((currentReady) => projectTauriAccountGateReady(currentReady, readiness));
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
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [invoke]);

  if (ready) {
    return <>{renderReady()}</>;
  }

  return (
    <main className="onboarding-shell" aria-live="polite" data-testid="account-setup-opening">
      <p>{openingSetup ? "Abriendo la configuración de tu cuenta…" : "Verificando tu cuenta…"}</p>
    </main>
  );
}
