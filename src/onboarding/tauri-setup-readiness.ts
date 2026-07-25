import type {
	AccountFirstController,
	AccountFirstPhase,
	AccountFirstSnapshot,
} from "./account-first-flow";

export const getFixvoxSetupReadinessCommand = "get_fixvox_setup_readiness";

export type TauriSetupReadinessInvoke = (
	command: string,
	args?: Record<string, unknown>,
) => Promise<unknown>;

type SetupReadinessProjection = {
	schemaVersion: 1;
	phase: AccountFirstPhase;
	ready: boolean;
	redacted: true;
};

const validPhases = new Set<AccountFirstPhase>([
	"welcome",
	"oauth_handoff",
	"account_linking",
	"ready",
	"offline",
	"oauth_cancelled",
	"oauth_expired",
	"account_not_authorized",
	"binding_conflict",
	"policy_unavailable",
	"service_unavailable",
]);

const safeFallback: SetupReadinessProjection = {
	schemaVersion: 1,
	phase: "service_unavailable",
	ready: false,
	redacted: true,
};

/** Validates the narrow, host-owned setup projection before React renders it. */
export function normalizeSetupReadinessProjection(
	value: unknown,
): SetupReadinessProjection {
	if (!value || typeof value !== "object") {
		return safeFallback;
	}

	const candidate = value as Record<string, unknown>;
	const phase = candidate.phase;
	if (
		candidate.schemaVersion !== 1 ||
		typeof phase !== "string" ||
		!validPhases.has(phase as AccountFirstPhase) ||
		typeof candidate.ready !== "boolean" ||
		candidate.ready !== (phase === "ready") ||
		candidate.redacted !== true
	) {
		return safeFallback;
	}

	return {
		schemaVersion: 1,
		phase: phase as AccountFirstPhase,
		ready: candidate.ready,
		redacted: true,
	};
}

function normalizeAuthStatus(value: unknown): string {
	if (
		!value ||
		typeof value !== "object" ||
		(value as Record<string, unknown>).redacted !== true
	) {
		return "error";
	}
	const status = (value as Record<string, unknown>).status;
	return typeof status === "string" ? status : "error";
}

/** Host boundary for setup. Tokens and identity never enter this contract. */
export function createTauriSetupReadinessAdapter(
	invoke: TauriSetupReadinessInvoke,
	initialPhase: AccountFirstPhase = "checking",
): AccountFirstController & { getSnapshot(): Promise<AccountFirstSnapshot> } {
	let phase = initialPhase;
	const snapshot = (): AccountFirstSnapshot => ({ phase });
	const update = (next: AccountFirstPhase): AccountFirstSnapshot => {
		phase = next;
		return snapshot();
	};

	const getSnapshot = async (): Promise<AccountFirstSnapshot> => {
		try {
			const value = await invoke(getFixvoxSetupReadinessCommand);
			return update(normalizeSetupReadinessProjection(value).phase);
		} catch {
			return update("service_unavailable");
		}
	};

	return {
		snapshot,
		getSnapshot,
		completeStartupCheck: getSnapshot,
		async continueWithGoogle() {
			try {
				await invoke("start_fixvox_cloud_login", { openExternalBrowser: true });
				return update("oauth_handoff");
			} catch {
				return update("service_unavailable");
			}
		},
		async pollBrowserSignIn() {
			if (phase !== "oauth_handoff") {
				return snapshot();
			}
			try {
				const status = normalizeAuthStatus(
					await invoke("poll_fixvox_cloud_login"),
				);
				if (status === "pending") {
					return snapshot();
				}
				if (status === "expired") {
					return update("oauth_expired");
				}
				if (status === "signed_in") {
					return getSnapshot();
				}
				return update(
					status === "error" ? "oauth_cancelled" : "service_unavailable",
				);
			} catch {
				return update("offline");
			}
		},
		async retry() {
			if (phase === "offline") {
				return update("oauth_handoff");
			}
			if (
				phase === "oauth_cancelled" ||
				phase === "oauth_expired" ||
				phase === "service_unavailable"
			) {
				return this.continueWithGoogle();
			}
			return snapshot();
		},
		async goBack() {
			return update("welcome");
		},
		async useAnotherAccount() {
			return update("welcome");
		},
	};
}
