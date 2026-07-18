import { useEffect, useMemo, useState, type ReactNode } from "react";
import { OnboardingSurface } from "./OnboardingSurface";
import {
  createAccountFirstFixtureController,
  type AccountFirstPhase,
  type AccountFirstSnapshot,
} from "./account-first-flow";
import {
  createTauriSetupReadinessAdapter,
  type TauriSetupReadinessInvoke,
} from "./tauri-setup-readiness";

export type SetupReadinessRoute = "checking" | "onboarding" | "dock";

/** Keeps the default dock route separate until the account-first route is validated. */
export function resolveSetupReadinessRoute(phase: AccountFirstPhase): SetupReadinessRoute {
  if (phase === "checking") {
    return "checking";
  }
  return phase === "ready" ? "dock" : "onboarding";
}

type SetupReadinessRouterProps = {
  invoke: TauriSetupReadinessInvoke;
  renderReady: () => ReactNode;
  onExit: () => void;
};

const fixtureOutcomes = {
  callback: "signed_in",
  link: "linked",
  microphone: "granted",
  shortcut: "recommended",
} as const;

/**
 * Reads the host-owned, redacted readiness projection before rendering setup.
 * It deliberately does not persist renderer state or change the default dock route.
 */
export function SetupReadinessRouter({ invoke, renderReady, onExit }: SetupReadinessRouterProps) {
  const [snapshot, setSnapshot] = useState<AccountFirstSnapshot>({ phase: "checking" });
  const adapter = useMemo(() => createTauriSetupReadinessAdapter(invoke), [invoke]);
  const route = resolveSetupReadinessRoute(snapshot.phase);
  const resumePhase = snapshot.phase === "checking" ? "service_unavailable" : snapshot.phase;
  const controller = useMemo(
    () => createAccountFirstFixtureController({ ...fixtureOutcomes, resumePhase }),
    [resumePhase],
  );

  useEffect(() => {
    let disposed = false;
    void adapter.getSnapshot().then((next) => {
      if (!disposed) {
        setSnapshot(next);
      }
    });
    return () => {
      disposed = true;
    };
  }, [adapter]);

  if (route === "checking") {
    return (
      <main className="onboarding-shell" aria-live="polite" data-testid="setup-readiness-checking">
        <p>Comprobando la configuración inicial…</p>
      </main>
    );
  }

  if (route === "dock") {
    return <>{renderReady()}</>;
  }

  return <OnboardingSurface controller={controller} onExit={onExit} />;
}
