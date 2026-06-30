import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  applyTauriHotkeyRegistration,
  previewTauriHotkeyRegistration,
  type TauriGlobalHotkeyConfig,
  type TauriHotkeyRegistrationApplyResult,
  type TauriHotkeyRegistrationPreview,
} from "../desktop-control/tauri-host-control";
import {
  activateFixvoxDevice,
  deriveFixvoxAuthPolicyView,
  deriveFixvoxCloudHealth,
  formatFixvoxStateLocation,
  getFixvoxAuthSessionStatus,
  getFixvoxCloudStatus,
  pollFixvoxCloudLogin,
  refreshFixvoxPolicy,
  registerFixvoxDevice,
  shouldConfirmFixvoxCloudOperation,
  startFixvoxCloudLogin,
  summarizeFixvoxCloudProblem,
  summarizeFixvoxPolicyCapabilities,
  type FixvoxAuthSessionStatus,
  type FixvoxCloudStatus,
  type FixvoxCloudOperation,
} from "./fixvox-cloud-control";
import { formatHotkeyEditReason } from "./hotkey-edit-copy";
import { nativeHotkeyEditContract } from "./hotkey-edit-contract";
import "./settings-heroui.css";

const sections = [
  { id: "general", label: "General", state: "Later" },
  { id: "hotkeys", label: "Hotkeys", state: "Active" },
  { id: "cloud", label: "Cloud", state: "New" },
  { id: "dock", label: "Dock", state: "Later" },
  { id: "delivery", label: "Delivery", state: "Later" },
  { id: "presets", label: "Presets", state: "Later" },
  { id: "about", label: "About", state: "Later" },
] as const;

type SettingsSectionId = (typeof sections)[number]["id"];

type HotkeyRow = {
  id: string;
  label: string;
  value: string;
  hint: string;
  mode: "host" | "fixed" | "planned";
};

type EditorNotice = {
  tone: "idle" | "success" | "warning" | "danger";
  message: string;
};

type BusyAction = "preview" | "apply" | FixvoxCloudOperation | "status" | "login" | "loginStatus";

type CaptureState = "idle" | "recording";

type HostHotkeyCapturePayload = {
  source: string;
  shortcut: string;
};

type SettingsSurfaceProps = {
  initialSection?: SettingsSectionId;
  initialCloudStatus?: FixvoxCloudStatus;
};

const HOST_HOTKEY_CAPTURE_EVENT = "desktop-control://hotkey-capture";

export function SettingsSurface({ initialSection = "hotkeys", initialCloudStatus }: SettingsSurfaceProps = {}) {
  const tauriRuntime = isTauri();
  const [dictationShortcut, setDictationShortcut] = useState("Alt+Space");
  const [editingShortcut, setEditingShortcut] = useState("Alt+Space");
  const [preview, setPreview] = useState<TauriHotkeyRegistrationPreview | undefined>();
  const [applyResult, setApplyResult] = useState<TauriHotkeyRegistrationApplyResult | undefined>();
  const [notice, setNotice] = useState<EditorNotice>({
    tone: "idle",
    message: "Click the shortcut field, then press the new key combination.",
  });
  const [busyAction, setBusyAction] = useState<BusyAction | undefined>();
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [cloudStatus, setCloudStatus] = useState<FixvoxCloudStatus | undefined>(initialCloudStatus);
  const [authSessionStatus, setAuthSessionStatus] = useState<FixvoxAuthSessionStatus | undefined>();
  const [cloudNotice, setCloudNotice] = useState<EditorNotice>({
    tone: "idle",
    message: "Local cloud status loads from host-owned app data.",
  });
  const [inviteCode, setInviteCode] = useState("");
  const [selectedSection, setSelectedSection] = useState<SettingsSectionId>(initialSection);
  const captureArmedRef = useRef(false);
  const selectedSectionMeta = sections.find((section) => section.id === selectedSection) ?? sections[1];
  const settingsHeading = sectionHeading(selectedSectionMeta.id);
  const settingsSummary = sectionSummary(selectedSectionMeta.id);

  useEffect(() => {
    if (!tauriRuntime) {
      return;
    }

    void invoke<TauriGlobalHotkeyConfig>("get_desktop_control_hotkey_config")
      .then((config) => {
        const shortcut = config.shortcut || "Alt+Space";
        setDictationShortcut(shortcut);
        setEditingShortcut(shortcut);
      })
      .catch(() => {
        setDictationShortcut("Alt+Space");
        setEditingShortcut("Alt+Space");
      });
  }, [tauriRuntime]);

  useEffect(() => {
    if (!tauriRuntime || selectedSection !== "cloud") {
      return;
    }

    void loadCloudStatus();
  }, [tauriRuntime, selectedSection]);

  useEffect(() => {
    if (!tauriRuntime || selectedSection !== "cloud" || authSessionStatus?.status !== "pending") {
      return;
    }

    const poll = () => {
      void pollCloudLoginStatus(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        poll();
      }
    };
    const timer = window.setInterval(poll, 3_000);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tauriRuntime, selectedSection, authSessionStatus?.status]);

  useEffect(() => {
    if (!tauriRuntime) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<HostHotkeyCapturePayload>(HOST_HOTKEY_CAPTURE_EVENT, (event) => {
      if (disposed || !event.payload.shortcut) {
        return;
      }

      captureArmedRef.current = false;
      void invoke<boolean>("set_desktop_control_hotkey_capture_enabled", { enabled: false });
      setCaptureState("idle");
      setEditingShortcut(event.payload.shortcut);
      void applyCandidate(event.payload.shortcut);
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    });

    return () => {
      disposed = true;
      captureArmedRef.current = false;
      unlisten?.();
      void invoke<boolean>("set_desktop_control_hotkey_capture_enabled", { enabled: false });
    };
  }, [tauriRuntime]);

  const hotkeys: HotkeyRow[] = useMemo(
    () => [
      {
        id: "dictation-key",
        label: "Dictation key",
        value: dictationShortcut,
        hint: "Hold or tap. Host-owned runtime binding.",
        mode: "host",
      },
      {
        id: "paste-last",
        label: "Paste last",
        value: "Alt+Shift+X",
        hint: "Safe paste path for the latest result.",
        mode: "fixed",
      },
      {
        id: "cancel-recording",
        label: "Cancel recording",
        value: "Escape",
        hint: "Only armed during cancellable capture.",
        mode: "fixed",
      },
    ],
    [dictationShortcut],
  );

  const previewCopy = preview
    ? preview.canApply
      ? `Ready: host can swap to ${preview.normalizedShortcut}.`
      : `Blocked: ${formatHotkeyEditReason(preview.reason)}`
    : "No host preview yet.";
  const applyCopy = applyResult
    ? applyResult.error
      ? applyResult.rolledBack
        ? `Rolled back: ${formatHotkeyEditReason(applyResult.error)}`
        : `Apply failed: ${formatHotkeyEditReason(applyResult.error)}`
      : applyResult.persistenceError
        ? `Applied, not saved: ${formatHotkeyEditReason(applyResult.persistenceError)}`
        : applyResult.preferencePersisted
          ? `Saved: ${applyResult.effectiveConfig.shortcut}.`
          : `Already verified: ${applyResult.effectiveConfig.shortcut}.`
    : "Apply waits for preview.";
  const candidateChanged = editingShortcut !== dictationShortcut;
  const cloudHealth = deriveFixvoxCloudHealth(cloudStatus);
  const authPolicyView = deriveFixvoxAuthPolicyView(cloudStatus);
  const cloudProblem = summarizeFixvoxCloudProblem(cloudStatus);
  const cloudStateLocation = formatFixvoxStateLocation(cloudStatus?.statePath);
  const loginSessionStatus = authSessionStatus?.status ?? "signed_out";
  const loginPending = loginSessionStatus === "pending";
  const loginSignedIn = loginSessionStatus === "signed_in";
  const loginHeroTitle = loginSignedIn
    ? "Google sign-in complete"
    : loginPending
      ? "Finish sign-in in your browser"
      : "Sign in to unlock Fixvox Cloud";
  const loginHeroDetail = loginSignedIn
    ? "Settings received redacted account status. Device link and policy refresh are the next host-owned step."
    : loginPending
      ? "After Google finishes, return here. Settings checks automatically and you can also check manually."
      : "Use your Fixvox account to unlock managed dictation, postprocess, transforms, assistant actions and higher limits.";
  const authStatusHeadline = loginSignedIn ? "Signed in: device link pending" : authPolicyView.headline;
  const authStatusDetail = loginSignedIn
    ? "Google sign-in completed. Capabilities remain basic until the host links this device and refreshes policy."
    : authPolicyView.detail;
  const authStatusAccessLabel = loginSignedIn ? "Signed in" : authPolicyView.accessLabel;
  const authStatusUserLabel = loginSignedIn ? (authSessionStatus?.userRedacted ?? "user redacted") : authPolicyView.userLabel;

  async function closeSettingsWindow() {
    if (!tauriRuntime) {
      return;
    }

    try {
      await invoke("hide_settings_window");
    } catch (error) {
      setNotice({
        tone: "warning",
        message: `Settings close failed: ${formatHotkeyEditReason(error)}`,
      });
    }
  }

  async function previewCandidate(nextShortcut = editingShortcut) {
    setBusyAction("preview");
    setApplyResult(undefined);
    try {
      const hostPreview = await previewTauriHotkeyRegistration(nextShortcut);
      if (!hostPreview) {
        setPreview({
          requestedShortcut: nextShortcut,
          normalizedShortcut: nextShortcut,
          canApply: false,
          reason: "tauri_runtime_unavailable",
        });
        setNotice({
          tone: "warning",
          message: "Open this surface inside Tauri to run the host preview.",
        });
        return;
      }

      setPreview(hostPreview);
      setNotice({
        tone: hostPreview.canApply ? "success" : "warning",
        message: hostPreview.canApply
          ? "Host preview passed. Save will swap, verify, persist, and roll back on registration failure."
          : `Host preview blocked this binding: ${formatHotkeyEditReason(hostPreview.reason)}`,
      });
    } catch (error) {
      setPreview(undefined);
      setNotice({
        tone: "danger",
        message: `Host preview failed: ${formatHotkeyEditReason(error)}`,
      });
    } finally {
      setBusyAction(undefined);
    }
  }

  async function startShortcutCapture() {
    if (!tauriRuntime || busyAction) {
      setNotice({
        tone: "warning",
        message: "Open this surface inside Tauri to record a shortcut.",
      });
      return;
    }

    if (captureState === "recording" || captureArmedRef.current) {
      return;
    }

    captureArmedRef.current = true;
    setPreview(undefined);
    setApplyResult(undefined);
    try {
      await invoke<boolean>("set_desktop_control_hotkey_capture_enabled", { enabled: true });
      setCaptureState("recording");
      setNotice({
        tone: "idle",
        message: "Press the new shortcut now. Esc cancels.",
      });
    } catch (error) {
      captureArmedRef.current = false;
      setNotice({
        tone: "danger",
        message: `Host capture failed: ${formatHotkeyEditReason(error)}`,
      });
    }
  }

  async function handleShortcutCaptureKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (captureState !== "recording") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      captureArmedRef.current = false;
      void invoke<boolean>("set_desktop_control_hotkey_capture_enabled", { enabled: false });
      setCaptureState("idle");
      setEditingShortcut(dictationShortcut);
      setNotice({
        tone: "idle",
        message: "Shortcut capture cancelled.",
      });
      return;
    }

    const shortcut = shortcutFromKeyboardEvent(event);
    if (!shortcut) {
      setNotice({
        tone: "warning",
        message: "Press a shortcut with Ctrl, Alt, or Shift plus another key.",
      });
      return;
    }

    captureArmedRef.current = false;
    void invoke<boolean>("set_desktop_control_hotkey_capture_enabled", { enabled: false });
    setCaptureState("idle");
    setEditingShortcut(shortcut);
    await applyCandidate(shortcut);
  }

  async function applyCandidate(nextShortcut = editingShortcut) {
    setBusyAction("apply");
    try {
      const result = await applyTauriHotkeyRegistration(nextShortcut);
      if (!result) {
        setNotice({
          tone: "warning",
          message: "Open this surface inside Tauri to apply a runtime binding.",
        });
        return;
      }

      setApplyResult(result);
      setPreview(result.preview);
      setDictationShortcut(result.effectiveConfig.shortcut);
      setEditingShortcut(result.effectiveConfig.shortcut);
      setNotice({
        tone: result.error ? (result.rolledBack ? "warning" : "danger") : result.persistenceError ? "warning" : "success",
        message: result.error
          ? result.rolledBack
            ? `Host restored the previous binding: ${formatHotkeyEditReason(result.error)}`
            : `Host could not apply the binding: ${formatHotkeyEditReason(result.error)}`
          : result.persistenceError
            ? `Binding applied, but local preference was not saved: ${formatHotkeyEditReason(result.persistenceError)}`
            : result.preferencePersisted
              ? "Binding saved locally and verified by the host."
              : "Binding was already active, saved locally, and verified by the host.",
      });
    } catch (error) {
      setNotice({
        tone: "danger",
        message: `Host apply failed: ${formatHotkeyEditReason(error)}`,
      });
    } finally {
      setBusyAction(undefined);
    }
  }

  async function loadCloudStatus() {
    setBusyAction("status");
    try {
      const [status, sessionStatus] = await Promise.all([
        getFixvoxCloudStatus(),
        getFixvoxAuthSessionStatus(),
      ]);
      setCloudStatus(status);
      setAuthSessionStatus(sessionStatus);
      const health = deriveFixvoxCloudHealth(status);
      setCloudNotice({
        tone: health.tone,
        message: health.detail,
      });
    } catch (error) {
      setCloudNotice({
        tone: "danger",
        message: `Cloud status failed: ${formatHotkeyEditReason(error)}`,
      });
    } finally {
      setBusyAction(undefined);
    }
  }

  async function pollCloudLoginStatus(silent = false) {
    if (!tauriRuntime) {
      setCloudNotice({ tone: "warning", message: "Open Settings inside Tauri to check login status." });
      return;
    }

    if (!silent) {
      setBusyAction("loginStatus");
    }
    try {
      const sessionStatus = await pollFixvoxCloudLogin();
      if (!sessionStatus) {
        setCloudNotice({ tone: "warning", message: "Open this surface inside Tauri to check host-owned login." });
        return;
      }

      setAuthSessionStatus(sessionStatus);
      if (sessionStatus.status === "signed_in") {
        setCloudNotice({
          tone: "success",
          message: "Fixvox Cloud sign-in completed. Session status is host-owned and redacted in Settings.",
        });
      } else if (sessionStatus.status === "pending") {
        setCloudNotice({
          tone: "idle",
          message: "Waiting for browser sign-in to finish. Settings checks this session automatically.",
        });
      } else if (sessionStatus.status === "expired") {
        setCloudNotice({ tone: "warning", message: "This login session expired. Start sign-in again." });
      } else if (sessionStatus.status === "error") {
        setCloudNotice({ tone: "danger", message: "Fixvox Cloud sign-in failed. Start sign-in again." });
      }
    } catch (error) {
      setCloudNotice({
        tone: "danger",
        message: `Fixvox Cloud login status failed: ${formatHotkeyEditReason(error)}`,
      });
    } finally {
      if (!silent) {
        setBusyAction(undefined);
      }
    }
  }

  async function startCloudLogin() {
    if (!tauriRuntime) {
      setCloudNotice({ tone: "warning", message: "Open Settings inside Tauri to start login." });
      return;
    }

    setBusyAction("login");
    try {
      const login = await startFixvoxCloudLogin(true);
      if (!login) {
        setCloudNotice({ tone: "warning", message: "Open this surface inside Tauri to start host-owned login." });
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
      setCloudNotice({
        tone: login.browserOpened ? "success" : "warning",
        message: login.browserOpened
          ? `Browser opened. Continue with Google there, then return here; Settings checks this session automatically.`
          : `Login start prepared for ${login.flow}; use Check sign-in status after opening the browser.`,
      });
    } catch (error) {
      setCloudNotice({
        tone: "danger",
        message: `Fixvox Cloud login start failed: ${formatHotkeyEditReason(error)}`,
      });
    } finally {
      setBusyAction(undefined);
    }
  }

  async function runCloudOperation(operation: FixvoxCloudOperation) {
    const code = inviteCode.trim();
    if (operation === "activate" && !code) {
      setCloudNotice({ tone: "warning", message: "Enter an invite code before activation." });
      return;
    }

    if (!shouldConfirmFixvoxCloudOperation(operation, code)) {
      setCloudNotice({ tone: "warning", message: "Cloud operation cancelled before contact." });
      return;
    }

    const confirmed = window.confirm(
      operation === "activate"
        ? "Activate this Fixvox Tauri device against Fixvox Cloud using this invite code?"
        : "Contact Fixvox Cloud now to update this device state?",
    );
    if (!confirmed) {
      setCloudNotice({ tone: "idle", message: "Cloud operation cancelled." });
      return;
    }

    setBusyAction(operation);
    try {
      const status = operation === "activate"
        ? await activateFixvoxDevice(code)
        : operation === "register"
          ? await registerFixvoxDevice()
          : await refreshFixvoxPolicy();
      setCloudStatus(status);
      const health = deriveFixvoxCloudHealth(status);
      setCloudNotice({ tone: health.tone, message: health.detail });
      if (operation === "activate") {
        setInviteCode("");
      }
    } catch (error) {
      setCloudNotice({
        tone: "danger",
        message: `Fixvox Cloud ${operation} failed: ${formatHotkeyEditReason(error)}`,
      });
    } finally {
      setBusyAction(undefined);
    }
  }

  return (
    <main className="settings-window-shell" aria-label="Dictation settings" data-theme="quiet-dark">
      <aside className="settings-sidebar" aria-label="Settings sections">
        <div className="settings-brand-row">
          <div className="settings-brand-mark" aria-hidden="true">DT</div>
          <div className="settings-brand-copy">
            <strong>Settings</strong>
            <span>Dictation Tauri</span>
          </div>
        </div>

        <nav className="settings-nav-list">
          {sections.map((section) => {
            const isActive = section.id === selectedSection;
            return (
              <button
                key={section.id}
                type="button"
                className="settings-nav-item"
                aria-current={isActive ? "page" : undefined}
                onClick={() => setSelectedSection(section.id)}
              >
                <span>{section.label}</span>
                <small>{section.state}</small>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="settings-content" aria-labelledby={`settings-${selectedSection}-title`}>
        <header className="settings-header">
          <div className="settings-title-block">
            <p className="settings-path">Settings / {selectedSectionMeta.label}</p>
            <h1 id={`settings-${selectedSection}-title`}>{settingsHeading}</h1>
            <p>{settingsSummary}</p>
          </div>
          <div className="settings-header-actions">
            <span className="settings-status-badge">{selectedSectionMeta.state}</span>
            <button
              type="button"
              className="settings-close-button"
              onClick={() => void closeSettingsWindow()}
              aria-label="Close Settings"
              disabled={!tauriRuntime}
            >
              Close
            </button>
          </div>
        </header>

        {selectedSection === "hotkeys" ? (
        <section className="settings-panel" aria-labelledby="settings-current-bindings-title">
          <div className="settings-panel-header">
            <div>
              <h2 id="settings-current-bindings-title">Current bindings</h2>
              <p>Fixvox-like shortcuts with compact runtime status.</p>
            </div>
            <span className="settings-panel-count">3 keys</span>
          </div>

          <div className="settings-hotkey-list">
            {hotkeys.map((hotkey) => (
              <HotkeyRow key={hotkey.id} hotkey={hotkey} />
            ))}
          </div>

          <section className="settings-hotkey-editor" aria-labelledby="settings-hotkey-editor-title">
            <div className="settings-hotkey-editor-topline">
              <div className="settings-hotkey-editor-copy">
                <div className="settings-native-plan-heading">
                  <h3 id="settings-hotkey-editor-title">{nativeHotkeyEditContract.heading}</h3>
                  <span>{nativeHotkeyEditContract.statusLabel}</span>
                </div>
                <p>{nativeHotkeyEditContract.summary} Click the field, then press the shortcut.</p>
              </div>
              <div className="settings-hotkey-editor-state" aria-label="Hotkey edit state">
                <span>Current <kbd>{dictationShortcut}</kbd></span>
                <span>Candidate <kbd>{editingShortcut}</kbd></span>
              </div>
            </div>

            <button
              type="button"
              className="settings-hotkey-recorder"
              data-recording={captureState === "recording"}
              disabled={!tauriRuntime || Boolean(busyAction)}
              onClick={() => void startShortcutCapture()}
              onKeyDown={(event) => void handleShortcutCaptureKeyDown(event)}
              aria-label={`Dictation key shortcut: ${editingShortcut}. Click, then press a new shortcut.`}
            >
              <span>{captureState === "recording" ? "Press new shortcut…" : editingShortcut}</span>
              <small>{captureState === "recording" ? "Esc cancels" : "Click to edit"}</small>
            </button>

            <div className="settings-hotkey-editor-actions">
              <button
                type="button"
                className="settings-editor-button settings-editor-button-secondary"
                disabled={!tauriRuntime || Boolean(busyAction) || captureState === "recording"}
                onClick={() => void previewCandidate()}
              >
                {busyAction === "preview" ? "Checking" : "Check current shortcut"}
              </button>
            </div>

            <div className="settings-hotkey-editor-feedback" data-tone={notice.tone}>
              <span>{candidateChanged ? "Change staged" : "Current binding selected"}</span>
              <span>{previewCopy}</span>
              <span>{applyCopy}</span>
              <strong>{notice.message}</strong>
            </div>

            <ol className="settings-native-plan-steps settings-hotkey-editor-steps" aria-label="Native re-registration steps">
              {nativeHotkeyEditContract.steps.map((step) => (
                <li key={step.id} title={step.guardrail}>{step.label}</li>
              ))}
            </ol>
          </section>
        </section>
        ) : selectedSection === "cloud" ? (
        <section className="settings-panel settings-cloud-panel" aria-labelledby="settings-cloud-title">
          <div className="settings-panel-header">
            <div>
              <h2 id="settings-cloud-title">Fixvox Cloud</h2>
              <p>Device, activation, policy/preflight and managed runtime.</p>
            </div>
            <span className="settings-panel-count">{cloudHealth.badge}</span>
          </div>

          <div className="settings-hotkey-list" aria-label="Fixvox Cloud status">
            <div className="settings-hotkey-row" data-health={loginSignedIn ? "success" : authPolicyView.tone}>
              <div className="settings-hotkey-copy">
                <strong>{authStatusHeadline}</strong>
                <span>{authStatusDetail}</span>
              </div>
              <div className="settings-hotkey-value" aria-label="Fixvox Cloud auth status">
                <kbd>{authStatusAccessLabel}</kbd>
                <small>{authStatusUserLabel}</small>
              </div>
            </div>
            <div className="settings-hotkey-row" data-health={cloudHealth.tone}>
              <div className="settings-hotkey-copy">
                <strong>{cloudHealth.headline}</strong>
                <span>{cloudHealth.detail}</span>
              </div>
              <div className="settings-hotkey-value" aria-label="Fixvox Cloud device status">
                <kbd>{cloudHealth.activationLabel}</kbd>
                <small>{cloudStatus?.deviceIdRedacted ?? cloudStatus?.installIdRedacted ?? "local"}</small>
              </div>
            </div>
            <div className="settings-hotkey-row">
              <div className="settings-hotkey-copy">
                <strong>Policy group</strong>
                <span>{authPolicyView.groupLabel}</span>
              </div>
              <div className="settings-hotkey-value" aria-label="Fixvox Cloud policy group">
                <kbd>{authPolicyView.templateLabel}</kbd>
                <small>{authPolicyView.accessLabel}</small>
              </div>
            </div>
            <div className="settings-hotkey-row">
              <div className="settings-hotkey-copy">
                <strong>Capabilities</strong>
                <span>{authPolicyView.capabilityLabel}</span>
              </div>
              <div className="settings-hotkey-value" aria-label="Fixvox Cloud capabilities">
                <kbd>{cloudHealth.managedLabel}</kbd>
                <small>{cloudStatus?.capabilities?.canSeeAdvancedSettings ? "advanced" : "basic"}</small>
              </div>
            </div>
            <div className="settings-hotkey-row">
              <div className="settings-hotkey-copy">
                <strong>Policy snapshot</strong>
                <span>{summarizeFixvoxPolicyCapabilities(cloudStatus)}</span>
              </div>
              <div className="settings-hotkey-value" aria-label="Fixvox Cloud policy status">
                <kbd>{cloudHealth.policyLabel}</kbd>
                <small>{cloudStatus?.policySnapshot?.trust ?? "pending"}</small>
              </div>
            </div>
            <div className="settings-hotkey-row">
              <div className="settings-hotkey-copy">
                <strong>Next step</strong>
                <span>{cloudHealth.nextAction}</span>
              </div>
              <div className="settings-hotkey-value" aria-label="Fixvox Cloud next step">
                <kbd>{cloudProblem}</kbd>
                <small>{cloudStatus?.policySnapshot?.stale ? "stale" : "checked"}</small>
              </div>
            </div>
          </div>

          <section className="settings-hotkey-editor" aria-labelledby="settings-cloud-activation-title">
            <div className="settings-hotkey-editor-topline">
              <div className="settings-hotkey-editor-copy">
                <div className="settings-native-plan-heading">
                  <h3 id="settings-cloud-activation-title">Fixvox Cloud sign in</h3>
                  <span>Host-owned</span>
                </div>
                <p>Sign-in opens your browser directly. Settings never receives secrets and only displays redacted session status.</p>
              </div>
              <div className="settings-hotkey-editor-state" aria-label="Fixvox Cloud auth action">
                <span>{authPolicyView.limitsLabel}</span>
                <span>{authSessionStatus ? `Session ${authSessionStatus.status}` : authPolicyView.actionHint}</span>
                {authSessionStatus?.userRedacted ? <span>{authSessionStatus.userRedacted}</span> : null}
                {authSessionStatus?.sessionIdRedacted ? <span>{authSessionStatus.sessionIdRedacted}</span> : null}
              </div>
            </div>

            <div className="settings-cloud-login-hero" data-status={loginSessionStatus}>
              <div className="settings-cloud-login-hero-copy">
                <span>Fixvox account</span>
                <strong>{loginHeroTitle}</strong>
                <small>{loginHeroDetail}</small>
              </div>
              <div className="settings-cloud-login-hero-actions">
                <button
                  type="button"
                  className="settings-cloud-login-primary"
                  disabled={!tauriRuntime || Boolean(busyAction)}
                  onClick={() => void startCloudLogin()}
                  aria-label="Start Fixvox Cloud sign in"
                >
                  {busyAction === "login" ? "Opening browser…" : loginSignedIn ? "Sign in again" : "Sign in with Google"}
                </button>
                {loginPending || loginSignedIn ? (
                  <button
                    type="button"
                    className="settings-editor-button settings-editor-button-secondary settings-cloud-login-status-button"
                    disabled={!tauriRuntime || Boolean(busyAction)}
                    onClick={() => void pollCloudLoginStatus()}
                  >
                    {busyAction === "loginStatus" ? "Checking" : "Check sign-in status"}
                  </button>
                ) : null}
              </div>
            </div>

            <input
              className="settings-hotkey-recorder settings-cloud-invite-input"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="Enter invite code"
              aria-label="Fixvox Cloud invite code"
              disabled={!tauriRuntime || Boolean(busyAction)}
            />

            <div className="settings-hotkey-editor-actions">
              <button
                type="button"
                className="settings-editor-button settings-editor-button-secondary"
                disabled={!tauriRuntime || Boolean(busyAction)}
                onClick={() => void loadCloudStatus()}
              >
                {busyAction === "status" ? "Reading" : "Refresh local status"}
              </button>
              <button
                type="button"
                className="settings-editor-button settings-editor-button-secondary"
                disabled={!tauriRuntime || Boolean(busyAction)}
                onClick={() => void runCloudOperation("register")}
              >
                {busyAction === "register" ? "Repairing" : "Repair device link"}
              </button>
              <button
                type="button"
                className="settings-editor-button settings-editor-button-secondary"
                disabled={!tauriRuntime || Boolean(busyAction)}
                onClick={() => void runCloudOperation("refresh")}
              >
                {busyAction === "refresh" ? "Refreshing" : "Refresh policy"}
              </button>
              <button
                type="button"
                className="settings-editor-button settings-editor-button-primary"
                disabled={!tauriRuntime || Boolean(busyAction) || !inviteCode.trim()}
                onClick={() => void runCloudOperation("activate")}
              >
                {busyAction === "activate" ? "Activating" : "Activate device"}
              </button>
            </div>

            <div className="settings-hotkey-editor-feedback" data-tone={cloudNotice.tone}>
              <span>IDs redacted</span>
              <span>{authSessionStatus?.sessionPath ?? cloudStateLocation}</span>
              <span>{authSessionStatus?.secretsPresent ? "session secrets host-owned" : cloudProblem}</span>
              <strong>{cloudNotice.message}</strong>
            </div>
          </section>
        </section>
        ) : (
        <section className="settings-panel settings-planned-panel" aria-labelledby={`settings-${selectedSection}-planned-title`}>
          <div className="settings-panel-header">
            <div>
              <h2 id={`settings-${selectedSection}-planned-title`}>{selectedSectionMeta.label}</h2>
              <p>This section is available for navigation, but its controls are intentionally not implemented yet.</p>
            </div>
            <span className="settings-panel-count">Planned</span>
          </div>
          <p className="settings-readonly-note">
            Settings renders one selected section at a time to keep the window fast and avoid hidden panels overlapping compact desktop layouts.
          </p>
        </section>
        )}
      </section>
    </main>
  );
}

function sectionHeading(sectionId: SettingsSectionId): string {
  switch (sectionId) {
    case "hotkeys":
      return "Keyboard shortcuts";
    case "cloud":
      return "Fixvox Cloud";
    case "general":
      return "General";
    case "dock":
      return "Dock";
    case "delivery":
      return "Delivery";
    case "presets":
      return "Presets";
    case "about":
      return "About";
  }
}

function sectionSummary(sectionId: SettingsSectionId): string {
  switch (sectionId) {
    case "hotkeys":
      return "Host-owned runtime bindings.";
    case "cloud":
      return "Device, activation, policy/preflight and managed runtime.";
    case "general":
      return "Base app preferences will live here after the hotkey and cloud flows are stable.";
    case "dock":
      return "Dock behavior remains controlled by the native shell until this section gets real controls.";
    case "delivery":
      return "Insertion, copy fallback and observer settings are planned, not editable from Settings yet.";
    case "presets":
      return "Assistant and transform presets stay in the companion flow until this surface is designed.";
    case "about":
      return "Build, diagnostics and support metadata are planned for a later compact panel.";
  }
}

function shortcutFromKeyboardEvent(event: KeyboardEvent): string | undefined {
  const key = normalizeShortcutKey(event.key);
  if (!key) {
    return undefined;
  }

  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push("Meta");
  }

  if (parts.length === 0) {
    return undefined;
  }

  parts.push(key);
  return parts.join("+");
}

function normalizeShortcutKey(key: string): string | undefined {
  if (["Control", "Alt", "Shift", "Meta", "OS"].includes(key)) {
    return undefined;
  }
  if (key === " ") {
    return "Space";
  }
  if (/^F\d{1,2}$/i.test(key)) {
    return key.toUpperCase();
  }
  if (/^[a-z]$/i.test(key)) {
    return key.toUpperCase();
  }
  if (/^\d$/.test(key)) {
    return key;
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key;
}

function HotkeyRow({ hotkey }: { hotkey: HotkeyRow }) {
  return (
    <div className="settings-hotkey-row">
      <div className="settings-hotkey-copy">
        <strong>{hotkey.label}</strong>
        <span>{hotkey.hint}</span>
      </div>
      <div className="settings-hotkey-value" aria-label={`${hotkey.label}: ${hotkey.value}`}>
        <kbd>{hotkey.value}</kbd>
        <small>{hotkey.mode}</small>
      </div>
    </div>
  );
}
