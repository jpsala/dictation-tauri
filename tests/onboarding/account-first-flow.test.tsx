import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createSecondaryAction, OnboardingSurface } from "../../src/onboarding/OnboardingSurface";
import {
  createAccountFirstFixtureController,
  type AccountFirstFixture,
} from "../../src/onboarding/account-first-flow";

const happyPathFixture: AccountFirstFixture = {
  callback: "signed_in",
  link: "linked",
  microphone: "granted",
  shortcut: "recommended",
};

describe("provider-free account-first onboarding", () => {
  it("completes Welcome → handoff → callback → auto-link → mic → shortcut → Ready without network data in React", async () => {
    const controller = createAccountFirstFixtureController(happyPathFixture);

    expect(controller.snapshot()).toEqual({ phase: "welcome" });
    expect(await controller.continueWithGoogle()).toEqual({ phase: "oauth_handoff" });
    expect(await controller.confirmBrowserSignIn()).toEqual({ phase: "account_linking" });
    expect(await controller.completeAutomaticLink()).toEqual({ phase: "microphone_setup" });
    expect(await controller.grantMicrophone()).toEqual({ phase: "shortcut_setup" });
    expect(await controller.useRecommendedShortcut()).toEqual({ phase: "ready" });
    expect(controller.requests).toEqual([]);

    const projection = controller.snapshot();
    expect(JSON.stringify(projection)).not.toMatch(/token|google|subject|deviceId|installId|policy/i);
  });

  it("renders only Spanish-first human copy for the Welcome state", () => {
    const html = renderToStaticMarkup(
      <OnboardingSurface controller={createAccountFirstFixtureController(happyPathFixture)} />,
    );

    expect(html).toContain("Empezá a dictar con tu cuenta");
    expect(html).toContain("Continuar con Google");
    expect(html).not.toMatch(/deviceId|installId|policy|token|provider/i);
  });

  it("routes Salir from Welcome through the supplied safe exit without mutating setup", async () => {
    const controller = createAccountFirstFixtureController(happyPathFixture);
    let exits = 0;

    await createSecondaryAction("welcome", controller, () => {
      exits += 1;
    })();

    expect(exits).toBe(1);
    expect(controller.snapshot()).toEqual({ phase: "welcome" });
    expect(controller.requests).toEqual([]);
  });

  it("keeps auto-link idempotent and gives a human recovery state for a binding conflict", async () => {
    const controller = createAccountFirstFixtureController({
      ...happyPathFixture,
      link: "binding_conflict",
    });

    await controller.continueWithGoogle();
    await controller.confirmBrowserSignIn();
    expect(await controller.completeAutomaticLink()).toEqual({ phase: "binding_conflict" });
    expect(await controller.retry()).toEqual({ phase: "account_linking" });
    expect(await controller.completeAutomaticLink()).toEqual({ phase: "binding_conflict" });
    expect(await controller.useAnotherAccount()).toEqual({ phase: "welcome" });
  });

  it("covers cancellation, expiry, and offline handoff recovery without leaking callback details", async () => {
    for (const [callback, expected] of [
      ["cancelled", "oauth_cancelled"],
      ["expired", "oauth_expired"],
      ["offline", "offline"],
    ] as const) {
      const controller = createAccountFirstFixtureController({ ...happyPathFixture, callback });
      await controller.continueWithGoogle();
      expect(await controller.confirmBrowserSignIn()).toEqual({ phase: expected });
      expect(await controller.retry()).toEqual({ phase: "oauth_handoff" });
      expect(controller.requests).toEqual([]);
    }
  });

  it("cancels an in-progress handoff to the same redacted recovery state", async () => {
    const controller = createAccountFirstFixtureController(happyPathFixture);
    await controller.continueWithGoogle();
    expect(await controller.cancelBrowserSignIn()).toEqual({ phase: "oauth_cancelled" });
    expect(await controller.goBack()).toEqual({ phase: "welcome" });
  });

  it("resumes a host-owned redacted setup phase through checking after restart", async () => {
    const controller = createAccountFirstFixtureController({
      ...happyPathFixture,
      resumePhase: "shortcut_setup",
    });

    expect(controller.snapshot()).toEqual({ phase: "checking" });
    expect(await controller.completeStartupCheck()).toEqual({ phase: "shortcut_setup" });
    expect(JSON.stringify(controller.snapshot())).not.toMatch(/token|google|subject|deviceId|installId|policy/i);
  });

  it("maps authorization, policy, and temporary service outcomes to redacted recovery", async () => {
    for (const [link, expected] of [
      ["not_authorized", "account_not_authorized"],
      ["policy_unavailable", "policy_unavailable"],
      ["service_unavailable", "service_unavailable"],
    ] as const) {
      const controller = createAccountFirstFixtureController({ ...happyPathFixture, link });
      await controller.continueWithGoogle();
      await controller.confirmBrowserSignIn();
      expect(await controller.completeAutomaticLink()).toEqual({ phase: expected });
      if (expected !== "account_not_authorized") {
        expect(await controller.retry()).toEqual({ phase: "account_linking" });
      } else {
        expect(await controller.useAnotherAccount()).toEqual({ phase: "welcome" });
      }
    }
  });

  it("keeps setup incomplete after microphone denial and never reaches ready", async () => {
    const controller = createAccountFirstFixtureController({ ...happyPathFixture, microphone: "denied" });
    await controller.continueWithGoogle();
    await controller.confirmBrowserSignIn();
    await controller.completeAutomaticLink();
    expect(await controller.grantMicrophone()).toEqual({ phase: "microphone_denied" });
    expect(await controller.openMicrophonePermissions()).toEqual({ phase: "microphone_setup" });
    expect(controller.snapshot()).not.toEqual({ phase: "ready" });
  });
});
