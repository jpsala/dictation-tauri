export type AccountFirstPhase =
  | "welcome"
  | "oauth_handoff"
  | "account_linking"
  | "microphone_setup"
  | "shortcut_setup"
  | "ready"
  | "oauth_expired"
  | "binding_conflict";

/** Redacted projection rendered by React. */
export type AccountFirstSnapshot = { phase: AccountFirstPhase };

/**
 * Provider-free outcomes supplied by a host fixture. Real OAuth/session data is
 * intentionally outside this contract and must never reach the renderer.
 */
export type AccountFirstFixture = {
  callback: "signed_in" | "expired";
  link: "linked" | "binding_conflict";
  microphone: "granted" | "denied";
  shortcut: "recommended";
};

export type AccountFirstFixtureController = {
  readonly requests: readonly [];
  snapshot(): AccountFirstSnapshot;
  continueWithGoogle(): Promise<AccountFirstSnapshot>;
  confirmBrowserSignIn(): Promise<AccountFirstSnapshot>;
  completeAutomaticLink(): Promise<AccountFirstSnapshot>;
  grantMicrophone(): Promise<AccountFirstSnapshot>;
  useRecommendedShortcut(): Promise<AccountFirstSnapshot>;
  retry(): Promise<AccountFirstSnapshot>;
  useAnotherAccount(): Promise<AccountFirstSnapshot>;
};

/**
 * A local, deterministic vertical-slice host adapter. It performs no network
 * operations and exposes only the setup phase to React.
 */
export function createAccountFirstFixtureController(
  fixture: AccountFirstFixture,
): AccountFirstFixtureController {
  let phase: AccountFirstPhase = "welcome";

  const snapshot = (): AccountFirstSnapshot => ({ phase });
  const advance = (next: AccountFirstPhase): AccountFirstSnapshot => {
    phase = next;
    return snapshot();
  };
  const resolve = (next: AccountFirstSnapshot): Promise<AccountFirstSnapshot> => Promise.resolve(next);

  return {
    requests: [],
    snapshot,
    continueWithGoogle() {
      if (phase === "welcome" || phase === "oauth_expired") {
        return resolve(advance("oauth_handoff"));
      }
      return resolve(snapshot());
    },
    confirmBrowserSignIn() {
      if (phase !== "oauth_handoff") {
        return resolve(snapshot());
      }
      return resolve(advance(fixture.callback === "signed_in" ? "account_linking" : "oauth_expired"));
    },
    completeAutomaticLink() {
      if (phase !== "account_linking") {
        return resolve(snapshot());
      }
      return resolve(advance(fixture.link === "linked" ? "microphone_setup" : "binding_conflict"));
    },
    grantMicrophone() {
      if (phase !== "microphone_setup") {
        return resolve(snapshot());
      }
      return resolve(advance(fixture.microphone === "granted" ? "shortcut_setup" : "microphone_setup"));
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
      if (phase === "oauth_expired") {
        return resolve(advance("oauth_handoff"));
      }
      return resolve(snapshot());
    },
    useAnotherAccount() {
      return resolve(phase === "binding_conflict" ? advance("welcome") : snapshot());
    },
  };
}
