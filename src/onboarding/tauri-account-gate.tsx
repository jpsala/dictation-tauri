import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AccountFirstPhase } from "./account-first-flow";
import { normalizeSetupReadinessProjection } from "./tauri-setup-readiness";

export type TauriAccountGateInvoke = (command: string) => Promise<unknown>;

type EffectiveAccountReadiness = {
  ready: boolean;
  phase: AccountFirstPhase;
};

type TauriAccountGateProps = {
  invoke: TauriAccountGateInvoke;
  renderReady: () => ReactNode;
};

function cloudStatusIsReady(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const status = value as Record<string, unknown>;
  const authPolicy = status.authPolicy;
  const capabilities = status.capabilities;
  return status.redacted === true &&
    status.deviceRegistered === true &&
    Boolean(authPolicy && typeof authPolicy === "object" && (authPolicy as Record<string, unknown>).accessMode === "signed_in") &&
    Boolean(capabilities && typeof capabilities === "object" && (capabilities as Record<string, unknown>).canUseManagedTranscription === true);
}

export async function getEffectiveTauriAccountReadiness(
  invoke: TauriAccountGateInvoke,
): Promise<EffectiveAccountReadiness> {
  try {
    const projection = normalizeSetupReadinessProjection(
      await invoke("get_fixvox_setup_readiness"),
    );
    if (projection.ready) {
      return { ready: true, phase: "ready" };
    }

    const cloudStatus = await invoke("get_fixvox_cloud_status");
    if (cloudStatusIsReady(cloudStatus)) {
      return { ready: true, phase: "ready" };
    }

    return { ready: false, phase: projection.phase };
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
  const blockedRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      const readiness = await getEffectiveTauriAccountReadiness(invoke);
      if (disposed) {
        return;
      }

      if (readiness.ready) {
        if (blockedRef.current) {
          blockedRef.current = false;
          await invoke("show_dock").catch(() => undefined);
        }
        if (!disposed) {
          setReady(true);
        }
        return;
      }

      blockedRef.current = true;
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
