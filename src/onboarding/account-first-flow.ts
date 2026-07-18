export type AccountFirstPhase =
  | "checking"
  | "welcome"
  | "oauth_handoff"
  | "account_linking"
  | "microphone_setup"
  | "shortcut_setup"
  | "ready"
  | "offline"
  | "oauth_cancelled"
  | "oauth_expired"
  | "account_not_authorized"
  | "binding_conflict"
  | "policy_unavailable"
  | "microphone_denied"
  | "service_unavailable";

/** Redacted projection rendered by React. */
export type AccountFirstSnapshot = { phase: AccountFirstPhase };

/**
 * Provider-free outcomes supplied by a host fixture. Real OAuth/session data is
 * intentionally outside this contract and must never reach the renderer.
 */
export type AccountFirstFixture = {
  callback: "signed_in" | "cancelled" | "expired" | "offline";
  link: "linked" | "binding_conflict" | "not_authorized" | "policy_unavailable" | "service_unavailable";
  microphone: "granted" | "denied";
  shortcut: "recommended";
  /** A redacted host-owned phase restored through checking on restart. */
  resumePhase?: Exclude<AccountFirstPhase, "checking">;
};

export type AccountFirstFixtureController = {
  readonly requests: readonly [];
  snapshot(): AccountFirstSnapshot;
  completeStartupCheck(): Promise<AccountFirstSnapshot>;
  continueWithGoogle(): Promise<AccountFirstSnapshot>;
  confirmBrowserSignIn(): Promise<AccountFirstSnapshot>;
  cancelBrowserSignIn(): Promise<AccountFirstSnapshot>;
  completeAutomaticLink(): Promise<AccountFirstSnapshot>;
  grantMicrophone(): Promise<AccountFirstSnapshot>;
  openMicrophonePermissions(): Promise<AccountFirstSnapshot>;
  useRecommendedShortcut(): Promise<AccountFirstSnapshot>;
  retry(): Promise<AccountFirstSnapshot>;
  goBack(): Promise<AccountFirstSnapshot>;
  useAnotherAccount(): Promise<AccountFirstSnapshot>;
};

/**
 * A local, deterministic vertical-slice host adapter. It performs no network
 * operations and exposes only the setup phase to React.
 */
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
  const resolve = (next: AccountFirstSnapshot): Promise<AccountFirstSnapshot> => Promise.resolve(next);

  return {
    requests: [],
    snapshot,
    completeStartupCheck() {
      if (phase !== "checking") {
        return resolve(snapshot());
      }
      return resolve(advance(fixture.resumePhase ?? "welcome"));
    },
    continueWithGoogle() {
      if (phase === "welcome" || phase === "oauth_cancelled" || phase === "oauth_expired") {
        return resolve(advance("oauth_handoff"));
      }
      return resolve(snapshot());
    },
    confirmBrowserSignIn() {
      if (phase !== "oauth_handoff") {
        return resolve(snapshot());
      }
      if (fixture.callback === "signed_in") {
        return resolve(advance("account_linking"));
      }
      if (fixture.callback === "offline") {
        interruptedPhase = "oauth_handoff";
        return resolve(advance("offline"));
      }
      return resolve(advance(fixture.callback === "cancelled" ? "oauth_cancelled" : "oauth_expired"));
    },
    cancelBrowserSignIn() {
      return resolve(phase === "oauth_handoff" ? advance("oauth_cancelled") : snapshot());
    },
    completeAutomaticLink() {
      if (phase !== "account_linking") {
        return resolve(snapshot());
      }
      const nextByOutcome: Record<AccountFirstFixture["link"], AccountFirstPhase> = {
        linked: "microphone_setup",
        binding_conflict: "binding_conflict",
        not_authorized: "account_not_authorized",
        policy_unavailable: "policy_unavailable",
        service_unavailable: "service_unavailable",
      };
      if (fixture.link === "policy_unavailable" || fixture.link === "service_unavailable") {
        interruptedPhase = "account_linking";
      }
      return resolve(advance(nextByOutcome[fixture.link]));
    },
    grantMicrophone() {
      if (phase !== "microphone_setup") {
        return resolve(snapshot());
      }
      return resolve(advance(fixture.microphone === "granted" ? "shortcut_setup" : "microphone_denied"));
    },
    openMicrophonePermissions() {
      return resolve(phase === "microphone_denied" ? advance("microphone_setup") : snapshot());
    },
    useRecommendedShortcut() {
      if (phase !== "shortcut_setup" || fixture.shortcut !== "recommended") {
        return resolve(snapshot());
      }
      return resolve(advance("ready"));
    },
    retry() {
      if (phase === "binding_conflict") {
        return resolve(advance("account_linking"));
      }
      if (phase === "offline" || phase === "policy_unavailable" || phase === "service_unavailable") {
        return resolve(advance(interruptedPhase));
      }
      if (phase === "oauth_cancelled" || phase === "oauth_expired") {
        return resolve(advance("oauth_handoff"));
      }
      return resolve(snapshot());
    },
    goBack() {
      if (phase === "offline" || phase === "oauth_cancelled" || phase === "oauth_expired") {
        return resolve(advance("welcome"));
      }
      return resolve(snapshot());
    },
    useAnotherAccount() {
      return resolve(
        phase === "binding_conflict" || phase === "account_not_authorized" ? advance("welcome") : snapshot(),
      );
    },
  };
}
