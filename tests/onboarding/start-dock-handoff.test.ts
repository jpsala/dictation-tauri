import { describe, expect, it, vi } from "vitest";
import { createStartDockHandoff } from "../../src/onboarding/start-dock-handoff";

describe("first-run start dock handoff", () => {
	it("opens the dock once and closes onboarding only after the open succeeds", async () => {
		let confirmOpen: (() => void) | undefined;
		const openDock = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					confirmOpen = resolve;
				}),
		);
		const closeOnboarding = vi.fn(async () => undefined);
		const start = createStartDockHandoff({ openDock, closeOnboarding });

		const first = start();
		const second = start();

		expect(openDock).toHaveBeenCalledTimes(1);
		expect(closeOnboarding).not.toHaveBeenCalled();
		confirmOpen?.();
		await Promise.all([first, second]);
		expect(closeOnboarding).toHaveBeenCalledTimes(1);
	});

	it("keeps onboarding open when the dock cannot be opened", async () => {
		const openDock = vi.fn().mockRejectedValue(new Error("dock unavailable"));
		const closeOnboarding = vi.fn(async () => undefined);
		const start = createStartDockHandoff({ openDock, closeOnboarding });

		await expect(start()).rejects.toThrow("dock unavailable");
		expect(closeOnboarding).not.toHaveBeenCalled();
	});

	it("does not request the dock again when only closing onboarding needs a retry", async () => {
		const openDock = vi.fn(async () => undefined);
		const closeOnboarding = vi
			.fn()
			.mockRejectedValueOnce(new Error("close unavailable"))
			.mockResolvedValueOnce(undefined);
		const start = createStartDockHandoff({ openDock, closeOnboarding });

		await expect(start()).rejects.toThrow("close unavailable");
		await expect(start()).resolves.toBeUndefined();
		expect(openDock).toHaveBeenCalledTimes(1);
		expect(closeOnboarding).toHaveBeenCalledTimes(2);
	});
});
