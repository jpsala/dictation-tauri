import { useEffect, useMemo, useState } from "react";
import { OnboardingSurface } from "./OnboardingSurface";
import type {
	AccountFirstPhase,
	AccountFirstSnapshot,
} from "./account-first-flow";
import {
	createTauriSetupReadinessAdapter,
	type TauriSetupReadinessInvoke,
} from "./tauri-setup-readiness";

export type SetupReadinessRoute = "checking" | "onboarding";

/** Ready still routes through onboarding so it can complete the native dock handoff. */
export function resolveSetupReadinessRoute(
	phase: AccountFirstPhase,
): SetupReadinessRoute {
	return phase === "checking" ? "checking" : "onboarding";
}

type SetupReadinessRouterProps = {
	invoke: TauriSetupReadinessInvoke;
	onReady: () => void;
};

/** Reads and acts through the host-owned, redacted setup boundary. */
export function SetupReadinessRouter({
	invoke,
	onReady,
}: SetupReadinessRouterProps) {
	const [snapshot, setSnapshot] = useState<AccountFirstSnapshot>({
		phase: "checking",
	});
	const adapter = useMemo(
		() => createTauriSetupReadinessAdapter(invoke, snapshot.phase),
		[invoke, snapshot.phase],
	);
	const route = resolveSetupReadinessRoute(snapshot.phase);

	useEffect(() => {
		if (snapshot.phase !== "checking") {
			return;
		}
		let disposed = false;
		void adapter.getSnapshot().then((next) => {
			if (!disposed) {
				setSnapshot(next);
			}
		});
		return () => {
			disposed = true;
		};
	}, [adapter, snapshot.phase]);

	if (route === "checking") {
		return (
			<main
				className="onboarding-shell"
				aria-live="polite"
				data-testid="setup-readiness-checking"
			>
				<p>Comprobando tu sesión…</p>
			</main>
		);
	}

	return <OnboardingSurface controller={adapter} onReady={onReady} />;
}
