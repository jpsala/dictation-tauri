import { describe, expect, it } from "vitest";
import { resolveSetupReadinessRoute } from "../../src/onboarding/SetupReadinessRouter";
import {
	createTauriSetupReadinessAdapter,
	normalizeSetupReadinessProjection,
} from "../../src/onboarding/tauri-setup-readiness";

describe("setup readiness router", () => {
	it("holds checking until the host projection resolves", () => {
		expect(resolveSetupReadinessRoute("checking")).toBe("checking");
	});

	it("routes ready through onboarding for the automatic dock handoff", () => {
		expect(resolveSetupReadinessRoute("ready")).toBe("onboarding");
		expect(resolveSetupReadinessRoute("welcome")).toBe("onboarding");
	});

	it("distinguishes clean, expired, pending, and valid sessions", async () => {
		for (const phase of [
			"welcome",
			"oauth_expired",
			"oauth_handoff",
			"ready",
		] as const) {
			const adapter = createTauriSetupReadinessAdapter(async () => ({
				schemaVersion: 1,
				phase,
				ready: phase === "ready",
				redacted: true,
			}));
			await expect(adapter.getSnapshot()).resolves.toEqual({ phase });
		}
	});

	it("fails closed without exposing invalid host fields", async () => {
		const projection = normalizeSetupReadinessProjection({
			schemaVersion: 2,
			phase: "ready",
			ready: true,
			redacted: true,
			deviceId: "sensitive-device",
			token: "sensitive-token",
		});
		expect(projection.phase).toBe("service_unavailable");
		expect(JSON.stringify(projection)).not.toMatch(/device|token/i);
	});
});
