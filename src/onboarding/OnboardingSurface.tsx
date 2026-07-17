import { useEffect, useState } from "react";
import "./onboarding.css";
import type {
  AccountFirstFixtureController,
  AccountFirstPhase,
  AccountFirstSnapshot,
} from "./account-first-flow";

type OnboardingSurfaceProps = {
  controller: AccountFirstFixtureController;
};

type OnboardingCopy = {
  title: string;
  detail: string;
  primary?: string;
  secondary?: string;
};

const copyByPhase: Record<AccountFirstPhase, OnboardingCopy> = {
  welcome: {
    title: "Empezá a dictar con tu cuenta",
    detail: "Configuraremos lo necesario para que puedas dictar sin interrupciones.",
    primary: "Continuar con Google",
    secondary: "Salir",
  },
  oauth_handoff: {
    title: "Abrimos el navegador para iniciar sesión",
    detail: "Cuando termines, volvé a esta ventana para continuar.",
    primary: "Ya inicié sesión",
    secondary: "Cancelar",
  },
  account_linking: {
    title: "Configurando tu cuenta",
    detail: "Esto puede tomar unos segundos.",
    secondary: "Salir",
  },
  microphone_setup: {
    title: "Configurá el micrófono",
    detail: "Necesitamos acceso al micrófono para poder dictar.",
    primary: "Permitir micrófono",
    secondary: "Salir",
  },
  shortcut_setup: {
    title: "Elegí cómo iniciar el dictado",
    detail: "Podés usar el atajo recomendado y cambiarlo después en Ajustes.",
    primary: "Usar atajo recomendado",
    secondary: "Cambiar atajo",
  },
  ready: {
    title: "Todo listo para dictar",
    detail: "Tu atajo está configurado y podés empezar cuando quieras.",
    primary: "Probar dictado",
    secondary: "Abrir ajustes",
  },
  oauth_expired: {
    title: "La sesión de inicio venció",
    detail: "No se completó el inicio de sesión. Podés intentarlo de nuevo.",
    primary: "Iniciar sesión de nuevo",
    secondary: "Volver",
  },
  binding_conflict: {
    title: "No pudimos preparar este dispositivo",
    detail: "Podés intentar de nuevo o continuar con otra cuenta.",
    primary: "Intentar de nuevo",
    secondary: "Usar otra cuenta",
  },
};

export function OnboardingSurface({ controller }: OnboardingSurfaceProps) {
  const [snapshot, setSnapshot] = useState<AccountFirstSnapshot>(() => controller.snapshot());
  const copy = copyByPhase[snapshot.phase];

  useEffect(() => {
    if (snapshot.phase === "account_linking") {
      void controller.completeAutomaticLink().then(setSnapshot);
    }
  }, [controller, snapshot.phase]);

  const runPrimary = () => {
    const actionByPhase: Partial<Record<AccountFirstPhase, () => Promise<AccountFirstSnapshot>>> = {
      welcome: () => controller.continueWithGoogle(),
      oauth_handoff: () => controller.confirmBrowserSignIn(),
      microphone_setup: () => controller.grantMicrophone(),
      shortcut_setup: () => controller.useRecommendedShortcut(),
      oauth_expired: () => controller.retry(),
      binding_conflict: () => controller.retry(),
    };
    const action = actionByPhase[snapshot.phase];
    if (action) {
      void action().then(setSnapshot);
    }
  };

  const runSecondary = () => {
    if (snapshot.phase === "binding_conflict") {
      void controller.useAnotherAccount().then(setSnapshot);
    }
  };

  return (
    <main className="onboarding-shell" data-testid="account-first-onboarding">
      <section className="onboarding-panel" aria-live="polite" aria-labelledby="onboarding-title">
        <p className="onboarding-step">Configuración inicial</p>
        <h1 id="onboarding-title">{copy.title}</h1>
        <p>{copy.detail}</p>
        <div className="onboarding-actions">
          {copy.primary && (
            <button className="button button-primary" type="button" onClick={runPrimary}>
              {copy.primary}
            </button>
          )}
          {copy.secondary && (
            <button className="button button-secondary" type="button" onClick={runSecondary}>
              {copy.secondary}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
