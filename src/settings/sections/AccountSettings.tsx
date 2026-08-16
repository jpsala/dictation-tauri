import { useEffect, useState } from "react";
import {
  deriveFixvoxAuthPolicyView,
  deriveFixvoxCloudHealth,
  getFixvoxAuthSessionStatus,
  getFixvoxCloudStatus,
  isFixvoxAccountReady,
  pollFixvoxCloudLogin,
  startFixvoxCloudLogin,
  type FixvoxAuthSessionStatus,
  type FixvoxCloudStatus,
} from "../fixvox-cloud-control";
import { formatHotkeyEditReason } from "../hotkey-edit-copy";
import type { AccountSettingsProps } from "../section-contracts";
import { SettingNotice } from "../shared/SettingNotice";
import { SettingRow } from "../shared/SettingRow";
import { SettingsGroup } from "../shared/SettingsGroup";

type Notice = { tone: "idle" | "success" | "warning" | "danger"; message: string };

export function AccountSettings({
  tauriRuntime,
  initialCloudStatus,
  initialAuthSessionStatus,
  onCloudStatusChange,
  onAccountReadyChange,
}: AccountSettingsProps) {
  const [cloudStatus, setCloudStatus] = useState<FixvoxCloudStatus | undefined>(initialCloudStatus);
  const [authSessionStatus, setAuthSessionStatus] = useState<FixvoxAuthSessionStatus | undefined>(initialAuthSessionStatus);
  const [resolved, setResolved] = useState(initialCloudStatus !== undefined && initialAuthSessionStatus !== undefined);
  const [busy, setBusy] = useState<"load" | "login" | "poll" | undefined>();
  const [notice, setNotice] = useState<Notice>({ tone: "idle", message: "" });

  useEffect(() => {
    if (!tauriRuntime) {
      setResolved(true);
      onAccountReadyChange?.(false);
      return () => {};
    }

    let disposed = false;
    setResolved(false);
    void Promise.all([getFixvoxCloudStatus(), getFixvoxAuthSessionStatus()])
      .then(([status, session]) => {
        if (disposed) return;
        setCloudStatus(status);
        onCloudStatusChange?.(status);
        setAuthSessionStatus(session);
        onAccountReadyChange?.(isFixvoxAccountReady(status));
      })
      .catch(() => {
        if (disposed) return;
        setNotice({ tone: "danger", message: "No pudimos leer el estado de la cuenta." });
        onAccountReadyChange?.(false);
      })
      .finally(() => {
        if (!disposed) setResolved(true);
      });
    return () => { disposed = true; };
  }, [onAccountReadyChange, onCloudStatusChange, tauriRuntime]);

  const sessionState = authSessionStatus?.status ?? "signed_out";
  const loginPending = sessionState === "pending";
  const loginSignedIn = sessionState === "signed_in";
  const policy = deriveFixvoxAuthPolicyView(cloudStatus);
  const health = resolved
    ? deriveFixvoxCloudHealth(cloudStatus)
    : { ...deriveFixvoxCloudHealth(cloudStatus), tone: "idle" as const, badge: "Comprobando", detail: "Estamos comprobando el estado de la cuenta." };
  const accountReady = loginSignedIn && cloudStatus?.authPolicy?.accessMode === "signed_in";

  async function startLogin() {
    if (!tauriRuntime || busy) {
      if (!tauriRuntime) setNotice({ tone: "warning", message: "Abrí estos ajustes desde la aplicación para iniciar sesión." });
      return;
    }
    setBusy("login");
    try {
      const login = await startFixvoxCloudLogin(true);
      if (!login) {
        setNotice({ tone: "warning", message: "No pudimos iniciar sesión desde esta ventana." });
        return;
      }
      setAuthSessionStatus({
        status: "pending",
        flow: login.flow,
        sessionIdRedacted: login.sessionIdRedacted,
        stateRedacted: login.stateRedacted,
        expiresAt: `+${login.expiresInSeconds}s`,
        secretsPresent: false,
        sessionPath: "fixvox-auth-session.v1.json · host app data",
        redacted: true,
      });
      setNotice({
        tone: login.browserOpened ? "success" : "warning",
        message: login.browserOpened
          ? "Completá el inicio de sesión en el navegador. Esta pantalla se actualizará cuando vuelvas."
          : "No pudimos abrir el navegador. Intentá iniciar sesión de nuevo.",
      });
    } catch (error) {
      setNotice({ tone: "danger", message: `No pudimos iniciar sesión: ${formatHotkeyEditReason(error)}` });
    } finally {
      setBusy(undefined);
    }
  }

  async function pollLogin(silent = false) {
    if (!tauriRuntime || busy === "login") return;
    if (!silent) setBusy("poll");
    try {
      const session = await pollFixvoxCloudLogin();
      if (!session) {
        setNotice({ tone: "warning", message: "No pudimos comprobar el inicio de sesión desde esta ventana." });
        return;
      }
      setAuthSessionStatus(session);
      if (session.status === "signed_in") {
        const linkedStatus = await getFixvoxCloudStatus();
        setCloudStatus(linkedStatus);
        onCloudStatusChange?.(linkedStatus);
        onAccountReadyChange?.(isFixvoxAccountReady(linkedStatus));
        const linked = linkedStatus?.authPolicy?.accessMode === "signed_in";
        setNotice({ tone: linked ? "success" : "warning", message: linked ? "Cuenta conectada. Esta computadora ya está lista para dictar." : "La cuenta está conectada. Estamos terminando de preparar esta computadora." });
      } else if (session.status === "pending") {
        setNotice({ tone: "idle", message: "Esperando confirmación del navegador… Esta pantalla se actualizará automáticamente." });
      } else if (session.status === "expired") {
        setNotice({ tone: "warning", message: "La sesión venció. Iniciá sesión de nuevo." });
      } else if (session.status === "error") {
        setNotice({ tone: "danger", message: "No pudimos completar el inicio de sesión. Intentá de nuevo." });
      }
    } catch (error) {
      setNotice({ tone: "danger", message: `No pudimos comprobar el inicio de sesión: ${formatHotkeyEditReason(error)}` });
    } finally {
      if (!silent) setBusy(undefined);
    }
  }

  useEffect(() => {
    if (!tauriRuntime || !loginPending) return;
    const poll = () => { void pollLogin(true); };
    const onVisible = () => { if (document.visibilityState === "visible") poll(); };
    const timer = window.setInterval(poll, 3_000);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loginPending, tauriRuntime]);

  return (
    <>
      <SettingsGroup id="settings-account-access" title="Cuenta" description="El estado de tu cuenta se muestra de forma segura y redactada.">
        {!resolved ? <SettingNotice>Comprobando disponibilidad…</SettingNotice> : null}
        <SettingRow label={accountReady ? "Cuenta conectada" : "Iniciá sesión para usar Dictation"} description={accountReady ? "Tu cuenta y esta computadora están listas para dictar." : "Tu cuenta se vincula automáticamente a esta computadora."}>
          <span className="settings-hotkey-value"><kbd>{accountReady ? "Lista" : health.badge}</kbd><small>cuenta protegida</small></span>
        </SettingRow>
        {accountReady ? (
          <>
            <SettingRow label={`Plan ${policy.templateLabel}`} description="Los límites y funciones disponibles se aplican automáticamente."><span className="settings-hotkey-value"><kbd>{policy.limitsLabel}</kbd><small>actual</small></span></SettingRow>
            <SettingRow label="Perfil de dictado" description="Define el comportamiento administrado de transcripción y postproceso."><span className="settings-hotkey-value"><kbd>{cloudStatus?.policyLabel ?? cloudStatus?.policySnapshot?.policyLabel ?? "Pendiente"}</kbd><small>asignado</small></span></SettingRow>
          </>
        ) : null}
      </SettingsGroup>
      <SettingsGroup id="settings-account-login" title={loginPending ? "Completá el inicio de sesión" : "Conectá tu cuenta"} description={loginPending ? "Terminá el proceso en el navegador. Esta pantalla se actualizará automáticamente cuando vuelvas." : "Se abrirá Google en tu navegador. Cuando termines, volvé a Fixvox para continuar."}>
        {!loginPending ? <button type="button" className="settings-editor-button settings-editor-button-primary" disabled={!tauriRuntime || Boolean(busy)} onClick={() => void startLogin()}>{busy === "login" ? "Abriendo…" : loginSignedIn ? "Cambiar cuenta" : "Continuar con Google"}</button> : null}
        {loginPending || notice.message ? <SettingNotice tone={notice.tone === "idle" ? "info" : notice.tone} actions={loginPending ? <button type="button" className="settings-editor-button settings-editor-button-secondary" disabled={Boolean(busy)} onClick={() => void pollLogin()}>{busy === "poll" ? "Comprobando…" : "Comprobar ahora"}</button> : undefined}>{loginPending ? "Esperando confirmación…" : notice.message}</SettingNotice> : null}
      </SettingsGroup>
    </>
  );
}
