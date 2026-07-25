export type StartDockHandoff = () => Promise<void>;

type StartDockHandoffOptions = {
	openDock: () => Promise<void>;
	closeOnboarding: () => Promise<void>;
};

/** Opens the dock once, then closes onboarding only after the host confirms success. */
export function createStartDockHandoff({
	openDock,
	closeOnboarding,
}: StartDockHandoffOptions): StartDockHandoff {
	let openPromise: Promise<void> | undefined;
	let dockOpened = false;
	let closePromise: Promise<void> | undefined;
	let completed = false;

	return async () => {
		if (completed) {
			return;
		}

		if (!dockOpened) {
			openPromise ??= openDock().catch((error: unknown) => {
				openPromise = undefined;
				throw error;
			});
			await openPromise;
			dockOpened = true;
		}

		closePromise ??= closeOnboarding().catch((error: unknown) => {
			closePromise = undefined;
			throw error;
		});
		await closePromise;
		completed = true;
	};
}
