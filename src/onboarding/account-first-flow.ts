export type AccountFirstPhase =
	| "checking"
	| "welcome"
	| "oauth_handoff"
	| "account_linking"
	| "ready"
	| "offline"
	| "oauth_cancelled"
	| "oauth_expired"
	| "account_not_authorized"
	| "binding_conflict"
	| "policy_unavailable"
	| "service_unavailable";

/** Redacted projection rendered by React. */
export type AccountFirstSnapshot = { phase: AccountFirstPhase };

/** Provider-free outcomes supplied by a host fixture. */
export type AccountFirstFixture = {
	callback: "signed_in" | "cancelled" | "expired" | "offline";
	link:
		| "linked"
		| "binding_conflict"
		| "not_authorized"
		| "policy_unavailable"
		| "service_unavailable";
	/** A redacted host-owned phase restored through checking on restart. */
	resumePhase?: Exclude<AccountFirstPhase, "checking">;
};

export type AccountFirstController = {
	snapshot(): AccountFirstSnapshot;
	completeStartupCheck(): Promise<AccountFirstSnapshot>;
	continueWithGoogle(): Promise<AccountFirstSnapshot>;
	pollBrowserSignIn(): Promise<AccountFirstSnapshot>;
	retry(): Promise<AccountFirstSnapshot>;
	goBack(): Promise<AccountFirstSnapshot>;
	useAnotherAccount(): Promise<AccountFirstSnapshot>;
};

export type AccountFirstFixtureController = AccountFirstController & {
	readonly requests: readonly [];
};

/** A local deterministic adapter. It performs no network operations. */
export function createAccountFirstFixtureController(
	fixture: AccountFirstFixture,
): AccountFirstFixtureController {
	let phase: AccountFirstPhase = fixture.resumePhase ? "checking" : "welcome";
	let interruptedPhase: AccountFirstPhase = "welcome";

	const snapshot = (): AccountFirstSnapshot => ({ phase });
	const advance = (next: AccountFirstPhase): AccountFirstSnapshot => {
		phase = next;
		return snapshot();
	};
	const resolve = (next: AccountFirstSnapshot): Promise<AccountFirstSnapshot> =>
		Promise.resolve(next);

	const finishHandoff = (): AccountFirstSnapshot => {
		if (fixture.callback === "offline") {
			interruptedPhase = "oauth_handoff";
			return advance("offline");
		}
		if (fixture.callback !== "signed_in") {
			return advance(
				fixture.callback === "cancelled" ? "oauth_cancelled" : "oauth_expired",
			);
		}

		const nextByOutcome: Record<
			AccountFirstFixture["link"],
			AccountFirstPhase
		> = {
			linked: "ready",
			binding_conflict: "binding_conflict",
			not_authorized: "account_not_authorized",
			policy_unavailable: "policy_unavailable",
			service_unavailable: "service_unavailable",
		};
		if (
			fixture.link === "policy_unavailable" ||
			fixture.link === "service_unavailable"
		) {
			interruptedPhase = "oauth_handoff";
		}
		return advance(nextByOutcome[fixture.link]);
	};

	return {
		requests: [],
		snapshot,
		completeStartupCheck() {
			return resolve(
				phase === "checking"
					? advance(fixture.resumePhase ?? "welcome")
					: snapshot(),
			);
		},
		continueWithGoogle() {
			if (
				phase === "welcome" ||
				phase === "oauth_cancelled" ||
				phase === "oauth_expired"
			) {
				return resolve(advance("oauth_handoff"));
			}
			return resolve(snapshot());
		},
		pollBrowserSignIn() {
			return resolve(phase === "oauth_handoff" ? finishHandoff() : snapshot());
		},
		retry() {
			if (
				phase === "offline" ||
				phase === "policy_unavailable" ||
				phase === "service_unavailable"
			) {
				return resolve(advance(interruptedPhase));
			}
			if (phase === "oauth_cancelled" || phase === "oauth_expired") {
				return resolve(advance("oauth_handoff"));
			}
			if (phase === "binding_conflict") {
				return resolve(advance("welcome"));
			}
			return resolve(snapshot());
		},
		goBack() {
			if (
				phase === "offline" ||
				phase === "oauth_cancelled" ||
				phase === "oauth_expired"
			) {
				return resolve(advance("welcome"));
			}
			return resolve(snapshot());
		},
		useAnotherAccount() {
			return resolve(
				phase === "binding_conflict" || phase === "account_not_authorized"
					? advance("welcome")
					: snapshot(),
			);
		},
	};
}
