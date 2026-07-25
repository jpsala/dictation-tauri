import { useEffect, useState } from "react";
import { tauriGlobalHotkeyShortcut } from "../desktop-control/tauri-host-control";
import "./onboarding.css";
import type {
	AccountFirstController,
	AccountFirstPhase,
	AccountFirstSnapshot,
} from "./account-first-flow";

type OnboardingSurfaceProps = {
	controller: AccountFirstController;
	onReady?: () => void | Promise<void>;
};

type OnboardingCopy = {
	title: string;
	detail: string;
	primary?: string;
};

const copyByPhase: Record<AccountFirstPhase, OnboardingCopy> = {
	checking: {
		title: "Preparando Dictation",
		detail: "Estamos comprobando tu sesión.",
	},
	welcome: {
		title: "Tu voz, lista cuando la necesites",
		detail: "Iniciá sesión para vincular esta computadora y empezar a dictar.",
		primary: "Continuar con Google",
	},
	oauth_handoff: {
		title: "Terminá el inicio de sesión en el navegador",
		detail:
			"Esta ventana continuará automáticamente cuando Google confirme tu cuenta.",
	},
	account_linking: {
		title: "Preparando esta computadora",
		detail: "Estamos terminando de vincular tu cuenta.",
	},
	ready: {
		title: "Todo listo para dictar",
		detail: `Usá ${tauriGlobalHotkeyShortcut} para empezar o detener el dictado.`,
		primary: "Empezar",
	},
	offline: {
		title: "No pudimos conectarnos",
		detail: "Revisá tu conexión e intentá de nuevo.",
		primary: "Reintentar",
	},
	oauth_cancelled: {
		title: "No se completó el inicio de sesión",
		detail: "Podés volver a intentarlo con Google.",
		primary: "Intentar de nuevo",
	},
	oauth_expired: {
		title: "Tu sesión venció",
		detail: "Volvé a iniciar sesión para seguir dictando con esta cuenta.",
		primary: "Continuar con Google",
	},
	account_not_authorized: {
		title: "Esta cuenta no tiene acceso",
		detail: "Probá con otra cuenta para continuar.",
		primary: "Usar otra cuenta",
	},
	binding_conflict: {
		title: "No pudimos vincular esta computadora",
		detail: "Volvé a iniciar sesión para intentarlo de nuevo.",
		primary: "Intentar de nuevo",
	},
	policy_unavailable: {
		title: "El servicio no está disponible",
		detail: "Intentá de nuevo en unos minutos.",
		primary: "Reintentar",
	},
	service_unavailable: {
		title: "No pudimos preparar Dictation",
		detail: "Comprobá tu conexión e intentá de nuevo.",
		primary: "Reintentar",
	},
};

export function OnboardingSurface({
	controller,
	onReady,
}: OnboardingSurfaceProps) {
	const [snapshot, setSnapshot] = useState<AccountFirstSnapshot>(() =>
		controller.snapshot(),
	);
	const [readyHandoffPending, setReadyHandoffPending] = useState(false);
	const copy = copyByPhase[snapshot.phase];

	useEffect(() => {
		if (snapshot.phase === "checking") {
			void controller.completeStartupCheck().then(setSnapshot);
			return;
		}
		if (snapshot.phase !== "oauth_handoff") {
			return;
		}

		let disposed = false;
		const poll = () => {
			void controller.pollBrowserSignIn().then((next) => {
				if (!disposed) {
					setSnapshot(next);
				}
			});
		};
		poll();
		const timer = window.setInterval(poll, 3_000);
		window.addEventListener("focus", poll);
		return () => {
			disposed = true;
			window.clearInterval(timer);
			window.removeEventListener("focus", poll);
		};
	}, [controller, snapshot.phase]);

	const runPrimary = () => {
		if (snapshot.phase === "ready") {
			if (readyHandoffPending) {
				return;
			}
			setReadyHandoffPending(true);
			void Promise.resolve(onReady?.()).catch(() => {
				setReadyHandoffPending(false);
			});
			return;
		}

		const actionByPhase: Partial<
			Record<AccountFirstPhase, () => Promise<AccountFirstSnapshot>>
		> = {
			welcome: () => controller.continueWithGoogle(),
			offline: () => controller.retry(),
			oauth_cancelled: () => controller.retry(),
			oauth_expired: () => controller.continueWithGoogle(),
			account_not_authorized: () => controller.useAnotherAccount(),
			binding_conflict: () => controller.retry(),
			policy_unavailable: () => controller.retry(),
			service_unavailable: () => controller.retry(),
		};
		const action = actionByPhase[snapshot.phase];
		if (action) {
			void action().then(setSnapshot);
		}
	};

	return (
		<main className="onboarding-shell" data-testid="account-first-onboarding">
			<section
				className="onboarding-panel"
				aria-live="polite"
				aria-labelledby="onboarding-title"
			>
				<p className="onboarding-step">Dictation</p>
				<h1 id="onboarding-title">{copy.title}</h1>
				<p>{copy.detail}</p>
				{snapshot.phase === "oauth_handoff" && (
					<div
						className="onboarding-progress"
						role="status"
						aria-label="Esperando confirmación del navegador"
					>
						<span aria-hidden="true" />
						Esperando confirmación
					</div>
				)}
				{copy.primary && (
					<div className="onboarding-actions">
						<button
							className="button button-primary"
							type="button"
							onClick={runPrimary}
							disabled={snapshot.phase === "ready" && readyHandoffPending}
							autoFocus
						>
							{copy.primary}
						</button>
					</div>
				)}
			</section>
		</main>
	);
}
