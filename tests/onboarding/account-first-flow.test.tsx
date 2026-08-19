import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OnboardingSurface } from "../../src/onboarding/OnboardingSurface";
import {
	createAccountFirstFixtureController,
	type AccountFirstFixture,
} from "../../src/onboarding/account-first-flow";

const happyPathFixture: AccountFirstFixture = {
	callback: "signed_in",
	link: "linked",
};

describe("provider-free first-run welcome", () => {
	it("completes Bienvenida → Google en curso → Todo listo without a manual callback button", async () => {
		const controller = createAccountFirstFixtureController(happyPathFixture);

		expect(controller.snapshot()).toEqual({ phase: "welcome" });
		expect(await controller.continueWithGoogle()).toEqual({
			phase: "oauth_handoff",
		});
		const handoffHtml = renderToStaticMarkup(
			<OnboardingSurface controller={controller} />,
		);
		expect(handoffHtml).toContain(
			"Terminá el inicio de sesión en el navegador",
		);
		expect(handoffHtml).not.toContain("Ya inicié sesión");
		expect(handoffHtml).not.toContain("<button");
		expect(await controller.pollBrowserSignIn()).toEqual({ phase: "ready" });
		expect(controller.requests).toEqual([]);
		expect(JSON.stringify(controller.snapshot())).not.toMatch(
			/token|subject|deviceId|installId|policy/i,
		);
	});
	it("renders a closable confirmation when the account is ready", async () => {
		const controller = createAccountFirstFixtureController(happyPathFixture);
		await controller.continueWithGoogle();
		expect(await controller.pollBrowserSignIn()).toEqual({ phase: "ready" });

		const onReady = vi.fn();
		const html = renderToStaticMarkup(
			<OnboardingSurface controller={controller} onReady={onReady} />,
		);

		expect(html).toContain("Ya está logueado");
		expect(html).toContain("Cerrar");
		expect(html.match(/<button/g)).toHaveLength(1);
		expect(onReady).not.toHaveBeenCalled();
	});

	it("renders one primary Google action on Welcome", () => {
		const html = renderToStaticMarkup(
			<OnboardingSurface
				controller={createAccountFirstFixtureController(happyPathFixture)}
			/>,
		);

		expect(html).toContain("Tu voz, lista cuando la necesites");
		expect(html).toContain("Continuar con Google");
		expect(html.match(/<button/g)).toHaveLength(1);
		expect(html).not.toMatch(/deviceId|installId|policy|token|provider/i);
	});

	it("shows expired sessions as returning authentication instead of a new welcome", async () => {
		const controller = createAccountFirstFixtureController({
			...happyPathFixture,
			resumePhase: "oauth_expired",
		});
		await controller.completeStartupCheck();
		const html = renderToStaticMarkup(
			<OnboardingSurface controller={controller} />,
		);

		expect(html).toContain("Tu sesión venció");
		expect(html).toContain("Volvé a iniciar sesión");
		expect(html).not.toContain("Tu voz, lista cuando la necesites");
	});

	it("maps cancellation, expiry, offline, and link failures to redacted recovery", async () => {
		for (const [fixture, expected] of [
			[
				{ ...happyPathFixture, callback: "cancelled" as const },
				"oauth_cancelled",
			],
			[{ ...happyPathFixture, callback: "expired" as const }, "oauth_expired"],
			[{ ...happyPathFixture, callback: "offline" as const }, "offline"],
			[
				{ ...happyPathFixture, link: "binding_conflict" as const },
				"binding_conflict",
			],
			[
				{ ...happyPathFixture, link: "not_authorized" as const },
				"account_not_authorized",
			],
		] as const) {
			const controller = createAccountFirstFixtureController(fixture);
			await controller.continueWithGoogle();
			expect(await controller.pollBrowserSignIn()).toEqual({ phase: expected });
			expect(controller.requests).toEqual([]);
		}
	});
});
