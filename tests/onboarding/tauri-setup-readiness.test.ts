import { describe, expect, it, vi } from "vitest";
import {
	createTauriSetupReadinessAdapter,
	getFixvoxSetupReadinessCommand,
	normalizeSetupReadinessProjection,
} from "../../src/onboarding/tauri-setup-readiness";

describe("Tauri setup readiness adapter", () => {
	it("keeps only the redacted host projection", () => {
		const projection = normalizeSetupReadinessProjection({
			schemaVersion: 1,
			phase: "oauth_expired",
			ready: false,
			redacted: true,
			deviceId: "sensitive-device",
			token: "sensitive-token",
		});

		expect(projection).toEqual({
			schemaVersion: 1,
			phase: "oauth_expired",
			ready: false,
			redacted: true,
		});
		expect(JSON.stringify(projection)).not.toMatch(/device|token/i);
	});

	it("starts Google in the host and polls automatically to ready", async () => {
		const invoke = vi.fn(async (command: string) => {
			if (command === "start_fixvox_cloud_login") {
				return { redacted: true };
			}
			if (command === "poll_fixvox_cloud_login") {
				return { status: "signed_in", redacted: true };
			}
			if (command === getFixvoxSetupReadinessCommand) {
				return {
					schemaVersion: 1,
					phase: "ready",
					ready: true,
					redacted: true,
				};
			}
			throw new Error(`unexpected ${command}`);
		});
		const adapter = createTauriSetupReadinessAdapter(invoke, "welcome");

		await expect(adapter.continueWithGoogle()).resolves.toEqual({
			phase: "oauth_handoff",
		});
		await expect(adapter.pollBrowserSignIn()).resolves.toEqual({
			phase: "ready",
		});
		expect(invoke.mock.calls).toEqual([
			["start_fixvox_cloud_login", { openExternalBrowser: true }],
			["poll_fixvox_cloud_login"],
			[getFixvoxSetupReadinessCommand],
		]);
	});

	it("fails closed for invalid payloads and invoke failures", async () => {
		expect(normalizeSetupReadinessProjection(null).phase).toBe(
			"service_unavailable",
		);
		const adapter = createTauriSetupReadinessAdapter(async () => {
			throw new Error("raw host failure");
		});
		await expect(adapter.getSnapshot()).resolves.toEqual({
			phase: "service_unavailable",
		});
	});
});
