import { useEffect, useState } from "react";
import "./onboarding.css";
import type {
  AccountFirstFixtureController,
  AccountFirstPhase,
  AccountFirstSnapshot,
} from "./account-first-flow";

type OnboardingSurfaceProps = {
  controller: AccountFirstFixtureController;
  onExit?: () => void;
};

type OnboardingCopy = {
  title: string;
  detail: string;
  primary?: string;
  secondary?: string;
};

const copyByPhase: Record<AccountFirstPhase, OnboardingCopy> = {
  checking: { title: "Preparando Dictation", detail: "Estamos revisando tu configuración para continuar de forma segura.", secondary: "Salir" },
  welcome: { title: "Empezá a dictar con tu cuenta", detail: "Configuraremos lo necesario para que puedas dictar sin interrupciones.", primary: "Continuar con Google", secondary: "Salir" },
  oauth_handoff: { title: "Abrimos el navegador para iniciar sesión", detail: "Cuando termines, volvé a esta ventana para continuar.", primary: "Ya inicié sesión", secondary: "Cancelar" },
  account_linking: { title: "Configurando tu cuenta", detail: "Esto puede tomar unos segundos.", secondary: "Salir" },
  microphone_setup: { title: "Configurá el micrófono", detail: "Necesitamos acceso al micrófono para poder dictar.", primary: "Permitir micrófono", secondary: "Salir" },
  shortcut_setup: { title: "Elegí cómo iniciar el dictado", detail: "Podés usar el atajo recomendado y cambiarlo después en Ajustes.", primary: "Usar atajo recomendado", secondary: "Cambiar atajo" },
  ready: { title: "Todo listo para dictar", detail: "Tu atajo está configurado y podés empezar cuando quieras.", primary: "Probar dictado", secondary: "Abrir ajustes" },
  offline: { title: "No pudimos conectarnos", detail: "Revisá tu conexión e intentá de nuevo cuando estés listo.", primary: "Reintentar", secondary: "Volver" },
  oauth_cancelled: { title: "No se completó el inicio de sesión", detail: "Podés intentarlo de nuevo cuando estés listo.", primary: "Intentar de nuevo", secondary: "Volver" },
  oauth_expired: { title: "La sesión de inicio venció", detail: "No se completó el inicio de sesión. Podés intentarlo de nuevo.", primary: "Iniciar sesión de nuevo", secondary: "Volver" },
  account_not_authorized: { title: "Esta cuenta no tiene acceso a Dictation", detail: "Probá con otra cuenta para continuar.", primary: "Usar otra cuenta", secondary: "Salir" },
  binding_conflict: { title: "No pudimos preparar este dispositivo", detail: "Podés intentar de nuevo o continuar con otra cuenta.", primary: "Intentar de nuevo", secondary: "Usar otra cuenta" },
  policy_unavailable: { title: "El servicio no está disponible por ahora", detail: "Podés reintentar más tarde o volver al inicio.", primary: "Reintentar", secondary: "Volver" },
  microphone_denied: { title: "Necesitamos acceso al micrófono para dictar", detail: "Abrí los permisos del sistema y volvé cuando el acceso esté habilitado.", primary: "Abrir permisos", secondary: "Salir" },
  service_unavailable: { title: "El servicio está temporalmente no disponible", detail: "Podés reintentar más tarde o volver al inicio.", primary: "Reintentar", secondary: "Volver" },
};

export function createSecondaryAction(
  phase: AccountFirstPhase,
  controller: AccountFirstFixtureController,
  onExit: () => void = () => undefined,
): () => Promise<AccountFirstSnapshot | undefined> {
  if (["checking", "welcome", "account_linking", "microphone_setup", "microphone_denied", "account_not_authorized"].includes(phase)) {
    return () => {
      onExit();
      return Promise.resolve(undefined);
    };
  }
  if (phase === "oauth_handoff") {
    return () => controller.cancelBrowserSignIn();
  }
  if (phase === "binding_conflict") {
    return () => controller.useAnotherAccount();
  }
  if (["offline", "oauth_cancelled", "oauth_expired", "policy_unavailable", "service_unavailable"].includes(phase)) {
    return () => controller.goBack();
  }
  return () => Promise.resolve(undefined);
}

export function OnboardingSurface({ controller, onExit }: OnboardingSurfaceProps) {
  const [snapshot, setSnapshot] = useState<AccountFirstSnapshot>(() => controller.snapshot());
  const copy = copyByPhase[snapshot.phase];

  useEffect(() => {
    if (snapshot.phase === "checking") {
      void controller.completeStartupCheck().then(setSnapshot);
    }
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
      offline: () => controller.retry(),
      oauth_cancelled: () => controller.retry(),
      oauth_expired: () => controller.retry(),
      account_not_authorized: () => controller.useAnotherAccount(),
      binding_conflict: () => controller.retry(),
      policy_unavailable: () => controller.retry(),
      microphone_denied: () => controller.openMicrophonePermissions(),
      service_unavailable: () => controller.retry(),
    };
    const action = actionByPhase[snapshot.phase];
    if (action) {
      void action().then(setSnapshot);
    }
  };

  const runSecondary = () => {
    const action = createSecondaryAction(snapshot.phase, controller, onExit);
    void action().then((next) => {
      if (next) {
        setSnapshot(next);
      }
    });
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
