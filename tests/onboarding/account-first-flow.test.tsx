import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OnboardingSurface } from "../../src/onboarding/OnboardingSurface";
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

  it("fails closed on an invalid callback and returns to a safe sign-in recovery", async () => {
    const controller = createAccountFirstFixtureController({
      ...happyPathFixture,
      callback: "expired",
    });

    await controller.continueWithGoogle();
    expect(await controller.confirmBrowserSignIn()).toEqual({ phase: "oauth_expired" });
    expect(await controller.retry()).toEqual({ phase: "oauth_handoff" });
  });
});
