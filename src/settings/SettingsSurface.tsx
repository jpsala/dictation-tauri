import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { SettingsSearch } from "./shared/SettingsSearch";
import { SettingsPage } from "./shared/SettingsPage";
import {
  getSettingsSearchTarget,
  parseSettingsDeepLink,
  serializeSettingsDeepLink,
  settingsRegistry,
  type SettingsDeepLink,
  type SettingsSearchTarget,
  type SettingsSectionId,
} from "./settings-registry";
import { useUserPreferencesController } from "./controllers/use-user-preferences-controller";
import type { VocabularyClient } from "../personal-vocabulary/teach-correction";
import type { FixvoxAuthSessionStatus, FixvoxCloudStatus } from "./fixvox-cloud-control";
import { getFixvoxCloudStatus, isFixvoxAccountReady } from "./fixvox-cloud-control";
import { AccountSettings } from "./sections/AccountSettings";
import { DictationSettings } from "./sections/DictationSettings";
import { HotkeySettings } from "./sections/HotkeySettings";
import { ActionSettings } from "./sections/ActionSettings";
import { VocabularySettings } from "./sections/VocabularySettings";
import { ApplicationSettings } from "./sections/ApplicationSettings";
import { PrivacySettings } from "./sections/PrivacySettings";
import { HelpSettings } from "./sections/HelpSettings";
import { AdvancedSettings } from "./sections/AdvancedSettings";
import "./settings-heroui.css";

export type SettingsSurfaceProps = {
  initialSection?: SettingsSectionId;
  initialCloudStatus?: FixvoxCloudStatus;
  initialAuthSessionStatus?: FixvoxAuthSessionStatus;
  vocabularyClient?: VocabularyClient;
};

type DirtyState = Partial<Record<SettingsSectionId, boolean>>;

type PendingNavigation = {
  sectionId: SettingsSectionId;
  target?: SettingsSearchTarget;
};

const dirtyPromptMessage = "Tenés cambios sin guardar en esta sección.";

function currentSettingsDeepLink(): SettingsDeepLink | undefined {
  if (typeof window === "undefined") return undefined;
  return parseSettingsDeepLink(window.location.hash);
}

function replaceSettingsLocation(target?: SettingsSearchTarget): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(window.history.state, "", serializeSettingsDeepLink(target));
}

export function SettingsSurface({
  initialSection,
  initialCloudStatus,
  initialAuthSessionStatus,
  vocabularyClient,
}: SettingsSurfaceProps = {}) {
  const tauriRuntime = isTauri();
  const preferences = useUserPreferencesController(tauriRuntime);
  const initialReady = isFixvoxAccountReady(initialCloudStatus);
  const initialLink = currentSettingsDeepLink();
  const navigationLocationRef = useRef(
    initialLink?.target && typeof window !== "undefined" ? window.location.hash : "#settings",
  );
  const [accountReady, setAccountReady] = useState(initialReady);
  const [cloudStatus, setCloudStatus] = useState<FixvoxCloudStatus | undefined>(initialCloudStatus);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() => (
    initialLink?.sectionId ?? initialSection ?? (initialReady ? "dictation" : "account")
  ));
  const [dirty, setDirty] = useState<DirtyState>({});
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>();
  const [focusTarget, setFocusTarget] = useState<SettingsSearchTarget | undefined>(initialLink?.target);

  const activeMeta = useMemo(
    () => settingsRegistry.find((section) => section.id === activeSection) ?? settingsRegistry[0],
    [activeSection],
  );
  const hasDirtyActiveSection = dirty[activeSection] === true;

  const requestNavigation = useCallback((sectionId: SettingsSectionId, target?: SettingsSearchTarget) => {
    const registeredTarget = target ? getSettingsSearchTarget(sectionId, target.targetId) : undefined;
    if (target && !registeredTarget) return;
    if (sectionId === activeSection && !registeredTarget) return;
    const destination = registeredTarget;
    if (dirty[activeSection]) {
      setPendingNavigation({ sectionId, target: destination });
      return;
    }
    if (destination) setFocusTarget(destination);
    setActiveSection(sectionId);
    replaceSettingsLocation(destination);
    navigationLocationRef.current = destination ? serializeSettingsDeepLink(destination) : "#settings";
  }, [activeSection, dirty]);

  const requestNavigationById = useCallback((sectionId: SettingsSectionId, targetId: string) => {
    const target = getSettingsSearchTarget(sectionId, targetId);
    if (target) requestNavigation(sectionId, target);
  }, [requestNavigation]);

  const commitPendingNavigation = useCallback(() => {
    if (!pendingNavigation) return;
    const destination = pendingNavigation.target;
    if (destination) setFocusTarget(destination);
    setDirty((current) => ({ ...current, [activeSection]: false }));
    setActiveSection(pendingNavigation.sectionId);
    replaceSettingsLocation(destination);
    navigationLocationRef.current = destination ? serializeSettingsDeepLink(destination) : "#settings";
    setPendingNavigation(undefined);
  }, [activeSection, pendingNavigation]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const parsed = parseSettingsDeepLink(window.location.hash);
    if (!parsed) {
      replaceSettingsLocation();
      navigationLocationRef.current = "#settings";
    }
    const onLocationChange = () => {
      const next = parseSettingsDeepLink(window.location.hash);
      if (!next) {
        replaceSettingsLocation();
        navigationLocationRef.current = "#settings";
        return;
      }
      if (next.target) requestNavigation(next.sectionId!, next.target);
    };
    window.addEventListener("hashchange", onLocationChange);
    window.addEventListener("popstate", onLocationChange);
    return () => {
      window.removeEventListener("hashchange", onLocationChange);
      window.removeEventListener("popstate", onLocationChange);
    };
  }, [requestNavigation]);

  useEffect(() => {
    if (initialCloudStatus) setCloudStatus(initialCloudStatus);
  }, [initialCloudStatus]);

  useEffect(() => {
    if (!tauriRuntime || cloudStatus) return;
    let disposed = false;
    void getFixvoxCloudStatus()
      .then((status) => {
        if (!disposed) setCloudStatus(status);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [cloudStatus, tauriRuntime]);

  useEffect(() => {
    if (initialSection || accountReady || initialLink?.sectionId) return;
    if (!cloudStatus) return;
    if (!isFixvoxAccountReady(cloudStatus)) {
      setActiveSection((current) => current === "dictation" ? "account" : current);
    }
  }, [accountReady, cloudStatus, initialLink?.sectionId, initialSection]);

  useEffect(() => {
    if (!focusTarget || focusTarget.sectionId !== activeSection) return;
    const target = focusTarget;
    setFocusTarget(undefined);
    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(target.targetId);
      if (!(element instanceof HTMLElement)) return;
      element.scrollIntoView({ block: "start", behavior: "smooth" });
      if (!element.hasAttribute("tabindex")) element.tabIndex = -1;
      element.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSection, focusTarget]);


  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        const input = document.querySelector<HTMLInputElement>(".settings-search input[type='search']");
        input?.focus();
        input?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);


  const onDirtyChange = useCallback((sectionId: SettingsSectionId, value: boolean) => {
    setDirty((current) => ({ ...current, [sectionId]: value }));
  }, []);
  const onHotkeysDirtyChange = useCallback((value: boolean) => {
    onDirtyChange("hotkeys", value);
  }, [onDirtyChange]);
  const onActionsDirtyChange = useCallback((value: boolean) => {
    onDirtyChange("actions", value);
  }, [onDirtyChange]);


  const renderActiveSection = () => {
    switch (activeSection) {
      case "account":
        return (
          <AccountSettings
            tauriRuntime={tauriRuntime}
            initialCloudStatus={cloudStatus}
            initialAuthSessionStatus={initialAuthSessionStatus}
            onAccountReadyChange={setAccountReady}
            onCloudStatusChange={setCloudStatus}
          />
        );
      case "dictation":
        return <DictationSettings tauriRuntime={tauriRuntime} preferences={preferences} onNavigate={requestNavigationById} />;
      case "hotkeys":
        return <HotkeySettings tauriRuntime={tauriRuntime} onDirtyChange={onHotkeysDirtyChange} onNavigate={requestNavigationById} />;
      case "actions":
        return <ActionSettings tauriRuntime={tauriRuntime} cloudStatus={cloudStatus} onDirtyChange={onActionsDirtyChange} onNavigate={requestNavigationById} />;
      case "vocabulary":
        return <VocabularySettings vocabularyClient={vocabularyClient} />;
      case "application":
        return <ApplicationSettings tauriRuntime={tauriRuntime} preferences={preferences} onNavigate={requestNavigationById} />;
      case "privacy":
        return <PrivacySettings tauriRuntime={tauriRuntime} onNavigate={requestNavigationById} />;
      case "help":
        return <HelpSettings tauriRuntime={tauriRuntime} cloudStatus={cloudStatus} onNavigate={requestNavigationById} />;
      case "advanced":
        return <AdvancedSettings tauriRuntime={tauriRuntime} cloudStatus={cloudStatus} preferences={preferences} onNavigate={requestNavigationById} />;
    }
  };

  return (
    <main className="settings-window-shell" data-app-surface="settings" aria-label="Ajustes de Dictation">
      <aside className="settings-sidebar" aria-label="Secciones de ajustes">
        <div className="settings-brand-row">
          <div className="settings-brand-mark" aria-hidden="true">⚡</div>
          <div className="settings-brand-copy">
            <strong>Fixvox</strong>
            <span>Ajustes de escritorio</span>
          </div>
        </div>
        <nav className="settings-nav-list" aria-label="Navegación de ajustes">
          {(["primary", "utility"] as const).map((group) => {
            const sections = settingsRegistry.filter((section) => section.group === group);
            return (
              <div className="settings-nav-group" key={group}>
                <span className="settings-nav-group-title">{group === "primary" ? "Preferencias" : "Soporte"}</span>
                {sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className="settings-nav-item"
                    aria-current={section.id === activeSection ? "page" : undefined}
                    onClick={() => requestNavigation(section.id)}
                  >
                    <span className="settings-nav-icon" aria-hidden="true">{section.icon}</span>
                    <span className="settings-nav-copy"><span>{section.label}</span><small>{section.summary}</small></span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <section className="settings-content" aria-labelledby="settings-page-title">
        <div className="settings-shell-toolbar">
          <SettingsSearch onSelect={(target) => requestNavigation(target.sectionId, target)} />
          <span className="settings-key-hint">Ctrl+F</span>
        </div>
        {pendingNavigation ? (
          <div className="settings-dirty-prompt" role="alertdialog" aria-live="assertive" aria-label="Cambios sin guardar">
            <div><strong>{dirtyPromptMessage}</strong><span>¿Querés cambiar de sección sin guardarlos?</span></div>
            <div className="settings-dirty-prompt-actions">
              <button type="button" className="settings-editor-button settings-editor-button-secondary" onClick={() => {
                setPendingNavigation(undefined);
                if (typeof window !== "undefined") window.history.replaceState(window.history.state, "", navigationLocationRef.current);
              }}>Seguir editando</button>
              <button type="button" className="settings-editor-button settings-editor-button-primary" onClick={commitPendingNavigation}>Cambiar de sección</button>
            </div>
          </div>
        ) : null}
        <SettingsPage title={activeMeta.label} summary={activeMeta.summary}>
          <div className="settings-active-section" data-section-id={activeSection}>
            {renderActiveSection()}
          </div>
        </SettingsPage>
        {hasDirtyActiveSection ? <span className="sr-only" role="status">Hay cambios sin guardar.</span> : null}
      </section>
    </main>
  );
}
