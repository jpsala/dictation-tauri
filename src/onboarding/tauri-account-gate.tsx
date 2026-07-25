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

export async function ensureTauriDictationReadiness(
  invoke: TauriAccountGateInvoke,
): Promise<boolean> {
  const readiness = await getEffectiveTauriAccountReadiness(invoke);
  if (readiness.ready) {
    return true;
  }

  await openTauriAccountSetup(invoke);
  return false;
}

/** Keeps the dock unavailable until the host reports an effective signed-in account. */
export function TauriAccountGate({ invoke, renderReady }: TauriAccountGateProps) {
  const [ready, setReady] = useState(false);
  const setupOpenedRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      const readiness = await getEffectiveTauriAccountReadiness(invoke);
      if (disposed) {
        return;
      }

      if (readiness.ready) {
        setReady(true);
        return;
      }

      setReady(false);
      if (!setupOpenedRef.current) {
        setupOpenedRef.current = true;
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
      <p>Abriendo la configuración de tu cuenta…</p>
    </main>
  );
}
