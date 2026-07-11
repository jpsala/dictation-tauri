import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  applyTauriActionHotkeyRegistration,
  applyTauriHotkeyRegistration,
  getTauriActionHotkeyConfig,
  previewTauriHotkeyRegistration,
  type TauriActionHotkeyConfig,
  type TauriActionHotkeyId,
  type TauriActionHotkeyRegistrationApplyResult,
  type TauriActionHotkeyRegistrationPreview,
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
import {
  extractCloudSelectionPresetDefaults,
  importCloudSelectionPresetDefaults,
  loadSelectionPresetStore,
  saveSelectionPresetStore,
  type CloudSelectionPresetDefault,
} from "./preset-store-control";
import {
  defaultUserPreferences,
  getUserPreferences,
  setUserPreferences,
  type UserPreferences,
} from "./user-preferences-control";
import {
  createSelectionTransformCustomPreset,
  deleteSelectionTransformCustomPreset,
  listSelectionTransformPresetAdminItems,
  resetSelectionTransformPresetCustomization,
  saveSelectionTransformPresetCustomization,
  type SelectionTransformPresetAdminItem,
} from "../selection-transform";
import {
  getStartupLaunchConfig,
  setStartupLaunchEnabled,
  summarizeStartupLaunchConfig,
  type StartupLaunchConfig,
} from "./startup-launch-control";
import "./settings-heroui.css";

const sections = [
  { id: "general", label: "Settings", state: "Essentials", icon: "⚙" },
  { id: "hotkeys", label: "Hotkeys", state: "Shortcuts", icon: "⌘" },
  { id: "cloud", label: "Cloud", state: "Access", icon: "☁" },
  { id: "dock", label: "Dock", state: "Workspace", icon: "◌" },
  { id: "delivery", label: "Delivery", state: "Behavior", icon: "↵" },
  { id: "presets", label: "Presets", state: "Actions", icon: "▣" },
  { id: "about", label: "About", state: "Version", icon: "i" },
] as const;

type SettingsSectionId = (typeof sections)[number]["id"];

type EssentialsTabId = "access" | "workspace" | "behavior" | "hotkeys" | "first-run";

const essentialsTabs: Array<{ id: EssentialsTabId; label: string }> = [
  { id: "access", label: "Access" },
  { id: "workspace", label: "Workspace" },
  { id: "behavior", label: "Behavior" },
  { id: "hotkeys", label: "Hotkeys" },
  { id: "first-run", label: "First run" },
];

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

type BusyAction = "preview" | "apply" | FixvoxCloudOperation | "status" | "login" | "loginStatus" | "startup" | "preset" | "preferences";

type CaptureState = "idle" | "recording";
type ShortcutCaptureTarget = "dictation" | TauriActionHotkeyId;

type HostHotkeyCapturePayload = {
  source: string;
  shortcut: string;
};

type SettingsSurfaceProps = {
  initialSection?: SettingsSectionId;
  initialCloudStatus?: FixvoxCloudStatus;
  initialAuthSessionStatus?: FixvoxAuthSessionStatus;
};

const HOST_HOTKEY_CAPTURE_EVENT = "desktop-control://hotkey-capture";

export function SettingsSurface({ initialSection = "general", initialCloudStatus, initialAuthSessionStatus }: SettingsSurfaceProps = {}) {
  const tauriRuntime = isTauri();
  const [dictationShortcut, setDictationShortcut] = useState("Alt+Space");
  const [editingShortcut, setEditingShortcut] = useState("Alt+Space");
  const [preview, setPreview] = useState<TauriHotkeyRegistrationPreview | undefined>();
  const [applyResult, setApplyResult] = useState<TauriHotkeyRegistrationApplyResult | undefined>();
  const [actionHotkeys, setActionHotkeys] = useState<TauriActionHotkeyConfig>({
    schemaVersion: 1,
    presetPicker: "Alt+Q",
    pasteLastSafe: "Alt+Shift+X",
  });
  const [actionPreview, setActionPreview] = useState<TauriActionHotkeyRegistrationPreview | undefined>();
  const [actionApplyResult, setActionApplyResult] = useState<TauriActionHotkeyRegistrationApplyResult | undefined>();
  const [notice, setNotice] = useState<EditorNotice>({
    tone: "idle",
    message: "Click the shortcut field, then press the new key combination.",
  });
  const [busyAction, setBusyAction] = useState<BusyAction | undefined>();
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [captureTarget, setCaptureTarget] = useState<ShortcutCaptureTarget>("dictation");
  const [cloudStatus, setCloudStatus] = useState<FixvoxCloudStatus | undefined>(initialCloudStatus);
  const [authSessionStatus, setAuthSessionStatus] = useState<FixvoxAuthSessionStatus | undefined>(initialAuthSessionStatus);
  const [cloudNotice, setCloudNotice] = useState<EditorNotice>({
    tone: "idle",
    message: "Local cloud status loads from host-owned app data.",
  });
  const [startupConfig, setStartupConfig] = useState<StartupLaunchConfig | undefined>();
  const [userPreferences, setUserPreferencesState] = useState<UserPreferences>(defaultUserPreferences);
  const [inviteCode, setInviteCode] = useState("");
  const [selectedSection, setSelectedSection] = useState<SettingsSectionId>(initialSection);
  const [essentialsTab, setEssentialsTab] = useState<EssentialsTabId>("workspace");
  const [presetItems, setPresetItems] = useState<SelectionTransformPresetAdminItem[]>(() =>
    listSelectionTransformPresetAdminItems(),
  );
  const [selectedPresetId, setSelectedPresetId] = useState(presetItems[0]?.id ?? "como-yo-es");
  const [presetNameDraft, setPresetNameDraft] = useState(() => presetItems[0]?.name ?? "");
  const [presetPickerKeyDraft, setPresetPickerKeyDraft] = useState(() => presetItems[0]?.pickerKey ?? "");
  const [presetHotkeyDraft, setPresetHotkeyDraft] = useState(() => presetItems[0]?.hotkey ?? "");
  const [presetProviderDraft, setPresetProviderDraft] = useState(() => presetItems[0]?.provider ?? "");
  const [presetModelDraft, setPresetModelDraft] = useState(() => presetItems[0]?.model ?? "");
  const [presetEnabledDraft, setPresetEnabledDraft] = useState(() => presetItems[0]?.enabled !== false);
  const [presetConfirmDraft, setPresetConfirmDraft] = useState(() => presetItems[0]?.confirm === true);
  const [presetDraft, setPresetDraft] = useState(() => presetItems[0]?.body ?? "");
  const [presetNotice, setPresetNotice] = useState<EditorNotice>({
    tone: "idle",
    message: "Edit starter preset prompts locally. The picker uses the saved prompt immediately.",
  });
  const [cloudPresetDefaults, setCloudPresetDefaults] = useState<CloudSelectionPresetDefault[]>([]);
  const captureArmedRef = useRef(false);
  const selectedSectionMeta = sections.find((section) => section.id === selectedSection) ?? sections[1];
  const settingsHeading = sectionHeading(selectedSectionMeta.id);
  const settingsSummary = sectionSummary(selectedSectionMeta.id);
  const selectedPreset = presetItems.find((preset) => preset.id === selectedPresetId) ?? presetItems[0];
  const presetDraftChanged = Boolean(
    selectedPreset && (
      presetDraft !== selectedPreset.body ||
      presetNameDraft !== selectedPreset.name ||
      presetPickerKeyDraft.toUpperCase() !== selectedPreset.pickerKey ||
      presetHotkeyDraft !== (selectedPreset.hotkey ?? "") ||
      presetProviderDraft !== (selectedPreset.provider ?? "") ||
      presetModelDraft !== (selectedPreset.model ?? "") ||
      presetEnabledDraft !== (selectedPreset.enabled !== false) ||
      presetConfirmDraft !== (selectedPreset.confirm === true)
    ),
  );

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

    void getTauriActionHotkeyConfig()
      .then((config) => {
        if (config) {
          setActionHotkeys(config);
        }
      })
      .catch(() => undefined);
  }, [tauriRuntime]);

  useEffect(() => {
    if (!tauriRuntime || selectedSection !== "cloud") {
      return;
    }

    void loadCloudStatus();
  }, [tauriRuntime, selectedSection]);

  useEffect(() => {
    if (!tauriRuntime || selectedSection !== "general") {
      return;
    }

    void loadStartupLaunch();
    void loadUserPreferences();
  }, [tauriRuntime, selectedSection]);

  useEffect(() => {
    if (!tauriRuntime || selectedSection !== "presets") {
      return;
    }

    void loadSelectionPresetStore()
      .then(() => refreshPresetItems())
      .catch((error) => {
        setPresetNotice({
          tone: "warning",
          message: `Preset store unavailable; using renderer fallback: ${formatHotkeyEditReason(error)}`,
        });
      });
    void getFixvoxCloudStatus()
      .then((status) => setCloudPresetDefaults(extractCloudSelectionPresetDefaults(status)))
      .catch(() => setCloudPresetDefaults([]));
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
      if (captureTarget === "dictation") {
        setEditingShortcut(event.payload.shortcut);
      }
      void applyShortcutCandidate(captureTarget, event.payload.shortcut);
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
  }, [captureTarget, tauriRuntime]);

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
        id: "stop-submit",
        label: "Stop and submit",
        value: "Alt+Shift+Space",
        hint: "Advanced action for finishing capture and delivering immediately.",
        mode: "fixed",
      },
      {
        id: "paste-last",
        label: "Paste last",
        value: actionHotkeys.pasteLastSafe,
        hint: "Safe paste path for the latest result. Host-owned action shortcut.",
        mode: "host",
      },
      {
        id: "quick-chat",
        label: "Quick Chat",
        value: "Alt+Shift+C",
        hint: "Assistant chat surface. Planned until Quick Chat UI lands.",
        mode: "planned",
      },
      {
        id: "result-history",
        label: "Result history",
        value: "Alt+Shift+Z",
        hint: "Open recent results and paste-last recovery history.",
        mode: "fixed",
      },
      {
        id: "preset-picker",
        label: "Preset picker",
        value: actionHotkeys.presetPicker,
        hint: "Runs replacement presets or preset voice capture one-shot. Host-owned action shortcut.",
        mode: "host",
      },
      {
        id: "assistant-mode",
        label: "Assistant mode",
        value: "Not set",
        hint: "Planned toggle for assistant-mode dictation.",
        mode: "planned",
      },
      {
        id: "press-enter",
        label: "Press Enter after paste",
        value: "Not set",
        hint: "Planned toggle for submit-after-delivery behavior.",
        mode: "planned",
      },
      {
        id: "cancel-recording",
        label: "Cancel recording",
        value: "Escape",
        hint: "Only armed during cancellable capture.",
        mode: "fixed",
      },
    ],
    [actionHotkeys.pasteLastSafe, actionHotkeys.presetPicker, dictationShortcut],
  );

  const previewCopy = preview
    ? preview.canApply
      ? `Ready: host can swap to ${preview.normalizedShortcut}.`
      : `Blocked: ${formatHotkeyEditReason(preview.reason)}`
    : undefined;
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
    : undefined;
  const actionPreviewCopy = actionPreview
    ? actionPreview.canApply
      ? `Action ready: ${actionPreview.normalizedShortcut}.`
      : `Action blocked: ${formatHotkeyEditReason(actionPreview.reason)}`
    : undefined;
  const actionApplyCopy = actionApplyResult
    ? actionApplyResult.error
      ? `Action apply failed: ${formatHotkeyEditReason(actionApplyResult.error)}`
      : actionApplyResult.persistenceError
        ? `Action applied, not saved: ${formatHotkeyEditReason(actionApplyResult.persistenceError)}`
        : "Action shortcut saved and applied."
    : undefined;
  const candidateChanged = editingShortcut !== dictationShortcut;
  const cloudHealth = deriveFixvoxCloudHealth(cloudStatus);
  const authPolicyView = deriveFixvoxAuthPolicyView(cloudStatus);
  const cloudProblem = summarizeFixvoxCloudProblem(cloudStatus);
  const cloudStateLocation = formatFixvoxStateLocation(cloudStatus?.statePath);
  const loginSessionStatus = authSessionStatus?.status ?? "signed_out";
  const loginPending = loginSessionStatus === "pending";
  const loginSignedIn = loginSessionStatus === "signed_in";
  const signedInPolicyActive = cloudStatus?.authPolicy?.accessMode === "signed_in";
  const signedInDeviceLinkPending = loginSignedIn && !signedInPolicyActive;
  const loginHeroTitle = signedInPolicyActive
    ? "Fixvox policy active"
    : loginSignedIn
      ? "Google sign-in complete"
      : loginPending
        ? "Finish sign-in in your browser"
        : "Sign in to unlock Fixvox Cloud";
  const loginHeroDetail = signedInPolicyActive
    ? "This device is linked to a redacted Fixvox account and policy capabilities are refreshed from Cloud."
    : loginSignedIn
      ? "Settings received redacted account status. Device link and policy refresh are the next host-owned step."
      : loginPending
        ? "After Google finishes, return here. Settings checks automatically and you can also check manually."
        : "Use your Fixvox account to unlock managed dictation, postprocess, transforms, assistant actions and higher limits.";
  const authStatusHeadline = signedInDeviceLinkPending ? "Signed in: device link pending" : authPolicyView.headline;
  const authStatusDetail = signedInDeviceLinkPending
    ? "Google sign-in completed. Capabilities remain basic until the host links this device and refreshes policy."
    : authPolicyView.detail;
  const authStatusAccessLabel = signedInDeviceLinkPending ? "Signed in" : authPolicyView.accessLabel;
  const authStatusUserLabel = signedInDeviceLinkPending ? (authSessionStatus?.userRedacted ?? "user redacted") : authPolicyView.userLabel;
  const startupSummary = summarizeStartupLaunchConfig(startupConfig);
  const startupStateLabel = startupConfig?.enabled ? "On" : "Off";

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

  async function startShortcutCapture(target: ShortcutCaptureTarget = "dictation") {
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
    setCaptureTarget(target);
    setPreview(undefined);
    setApplyResult(undefined);
    setActionPreview(undefined);
    setActionApplyResult(undefined);
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
    if (captureTarget === "dictation") {
      setEditingShortcut(shortcut);
    }
    await applyShortcutCandidate(captureTarget, shortcut);
  }

  async function applyShortcutCandidate(target: ShortcutCaptureTarget, shortcut: string) {
    if (target === "dictation") {
      await applyCandidate(shortcut);
      return;
    }
    await applyActionCandidate(target, shortcut);
  }

  async function applyActionCandidate(actionId: TauriActionHotkeyId, nextShortcut: string) {
    setBusyAction("apply");
    try {
      const result = await applyTauriActionHotkeyRegistration(actionId, nextShortcut);
      if (!result) {
        setNotice({
          tone: "warning",
          message: "Open this surface inside Tauri to apply an action shortcut.",
        });
        return;
      }

      setActionApplyResult(result);
      setActionPreview(result.preview);
      setActionHotkeys(result.effectiveConfig);
      setNotice({
        tone: result.error ? "danger" : result.persistenceError ? "warning" : "success",
        message: result.error
          ? `Host could not apply the action shortcut: ${formatHotkeyEditReason(result.error)}`
          : result.persistenceError
            ? `Action shortcut applied, but local preference was not saved: ${formatHotkeyEditReason(result.persistenceError)}`
            : "Action shortcut saved locally and applied by the host.",
      });
    } catch (error) {
      setNotice({
        tone: "danger",
        message: `Host action shortcut apply failed: ${formatHotkeyEditReason(error)}`,
      });
    } finally {
      setBusyAction(undefined);
    }
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

  async function loadStartupLaunch() {
    setBusyAction("startup");
    try {
      const config = await getStartupLaunchConfig();
      setStartupConfig(config);
    } finally {
      setBusyAction(undefined);
    }
  }

  async function toggleStartupLaunch(enabled: boolean) {
    setBusyAction("startup");
    try {
      const config = await setStartupLaunchEnabled(enabled);
      setStartupConfig(config);
    } finally {
      setBusyAction(undefined);
    }
  }

  async function loadUserPreferences() {
    try {
      const preferences = await getUserPreferences();
      setUserPreferencesState(preferences);
    } catch {
      setUserPreferencesState(defaultUserPreferences);
    }
  }

  async function toggleUserPreference(key: keyof Pick<UserPreferences, "showDockOnStartup" | "reviewBeforeDelivery" | "pressEnterAfterPaste" | "autoStopOnSilenceEnabled" | "muteOutputDuringRecording" | "dictationSoundCuesEnabled">) {
    setBusyAction("preferences");
    try {
      const nextPreferences = {
        ...userPreferences,
        [key]: !userPreferences[key],
      };
      const saved = await setUserPreferences(nextPreferences);
      setUserPreferencesState(saved);
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
        const linkedStatus = await getFixvoxCloudStatus();
        setCloudStatus(linkedStatus);
        const linkedAuthPolicy = linkedStatus?.authPolicy?.accessMode === "signed_in";
        setCloudNotice({
          tone: linkedAuthPolicy ? "success" : "warning",
          message: linkedAuthPolicy
            ? "Fixvox Cloud sign-in completed; this device is linked and policy capabilities were refreshed."
            : "Fixvox Cloud sign-in completed. Device link is still pending; use Link signed-in device or Check sign-in status again.",
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

  function refreshPresetItems(nextSelectedId = selectedPresetId) {
    const nextItems = listSelectionTransformPresetAdminItems();
    setPresetItems(nextItems);
    const nextSelected = nextItems.find((preset) => preset.id === nextSelectedId) ?? nextItems[0];
    if (nextSelected) {
      setSelectedPresetId(nextSelected.id);
      setPresetNameDraft(nextSelected.name);
      setPresetPickerKeyDraft(nextSelected.pickerKey);
      setPresetHotkeyDraft(nextSelected.hotkey ?? "");
      setPresetProviderDraft(nextSelected.provider ?? "");
      setPresetModelDraft(nextSelected.model ?? "");
      setPresetEnabledDraft(nextSelected.enabled !== false);
      setPresetConfirmDraft(nextSelected.confirm === true);
      setPresetDraft(nextSelected.body);
    }
  }

  async function persistPresetStore() {
    try {
      await saveSelectionPresetStore();
    } catch (error) {
      setPresetNotice({
        tone: "warning",
        message: `Preset changes saved in memory, but host persistence failed: ${formatHotkeyEditReason(error)}`,
      });
    }
  }

  async function importCloudPresetDefaults() {
    if (!cloudPresetDefaults.length) {
      setPresetNotice({ tone: "warning", message: "No Cloud preset defaults found in the current policy snapshot." });
      return;
    }

    setBusyAction("preset");
    try {
      const result = await importCloudSelectionPresetDefaults(cloudPresetDefaults);
      refreshPresetItems();
      setPresetNotice({
        tone: result.applied > 0 ? "success" : "warning",
        message: result.applied > 0
          ? `Imported ${result.applied} Cloud preset defaults into local app data.`
          : "Cloud preset defaults did not match editable starter presets.",
      });
    } catch (error) {
      setPresetNotice({ tone: "danger", message: formatHotkeyEditReason(error) });
    } finally {
      setBusyAction(undefined);
    }
  }

  function selectPresetForEditing(presetId: SelectionTransformPresetAdminItem["id"]) {
    const nextPreset = presetItems.find((preset) => preset.id === presetId);
    setSelectedPresetId(presetId);
    setPresetNameDraft(nextPreset?.name ?? "");
    setPresetPickerKeyDraft(nextPreset?.pickerKey ?? "");
    setPresetHotkeyDraft(nextPreset?.hotkey ?? "");
    setPresetProviderDraft(nextPreset?.provider ?? "");
    setPresetModelDraft(nextPreset?.model ?? "");
    setPresetEnabledDraft(nextPreset?.enabled !== false);
    setPresetConfirmDraft(nextPreset?.confirm === true);
    setPresetDraft(nextPreset?.body ?? "");
    setPresetNotice({
      tone: nextPreset?.isCustomized ? "success" : "idle",
      message: nextPreset?.canDelete
        ? "Custom preset selected. You can edit, save, or delete it."
        : nextPreset?.isCustomized
          ? "This starter preset has local edits. Save again to update or reset to bundled default."
          : "Bundled starter preset selected. Edit the prompt body and save to override locally. Starters cannot be deleted.",
    });
  }

  function savePresetDraft() {
    if (!selectedPreset) {
      return;
    }
    if (!presetDraft.trim()) {
      setPresetNotice({ tone: "warning", message: "Preset prompt cannot be empty." });
      return;
    }

    setBusyAction("preset");
    try {
      saveSelectionTransformPresetCustomization(selectedPreset.id, {
        name: presetNameDraft,
        hotkey: presetHotkeyDraft,
        pickerKey: presetPickerKeyDraft,
        provider: presetProviderDraft,
        model: presetModelDraft,
        enabled: presetEnabledDraft,
        confirm: presetConfirmDraft,
        body: presetDraft,
      });
      void persistPresetStore();
      refreshPresetItems(selectedPreset.id);
      setPresetNotice({
        tone: "success",
        message: `${selectedPreset.name} saved locally. Alt+Q uses the updated prompt on the next run.`,
      });
    } finally {
      setBusyAction(undefined);
    }
  }

  function addCustomPreset() {
    setBusyAction("preset");
    try {
      const nextPreset = createSelectionTransformCustomPreset({
        name: "New preset",
        pickerKey: "N",
      });
      void persistPresetStore();
      refreshPresetItems(nextPreset.id);
      setPresetNotice({ tone: "success", message: "Custom preset created locally and selected. You can edit, save, or delete this preset." });
    } finally {
      setBusyAction(undefined);
    }
  }

  function duplicateSelectedPreset() {
    if (!selectedPreset) {
      return;
    }

    setBusyAction("preset");
    try {
      const nextPreset = createSelectionTransformCustomPreset({
        name: `${selectedPreset.name} copy`,
        pickerKey: selectedPreset.pickerKey,
        hotkey: selectedPreset.hotkey,
        provider: selectedPreset.provider,
        model: selectedPreset.model,
        enabled: selectedPreset.enabled !== false,
        confirm: selectedPreset.confirm === true,
        body: selectedPreset.body,
      });
      void persistPresetStore();
      refreshPresetItems(nextPreset.id);
      setPresetNotice({ tone: "success", message: `${selectedPreset.name} duplicated as a custom preset.` });
    } finally {
      setBusyAction(undefined);
    }
  }

  function deleteSelectedPreset() {
    if (!selectedPreset?.canDelete) {
      setPresetNotice({ tone: "warning", message: "Starter presets cannot be deleted. Reset them instead." });
      return;
    }

    setBusyAction("preset");
    try {
      deleteSelectionTransformCustomPreset(selectedPreset.id);
      void persistPresetStore();
      refreshPresetItems("como-yo-es");
      setPresetNotice({ tone: "idle", message: `${selectedPreset.name} deleted locally.` });
    } finally {
      setBusyAction(undefined);
    }
  }

  function resetPresetDraft() {
    if (!selectedPreset) {
      return;
    }

    setBusyAction("preset");
    try {
      resetSelectionTransformPresetCustomization(selectedPreset.id);
      void persistPresetStore();
      refreshPresetItems(selectedPreset.id);
      setPresetNotice({ tone: "idle", message: `${selectedPreset.name} reset to bundled starter prompt.` });
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
          <div className="settings-brand-mark" aria-hidden="true">⚡</div>
          <div className="settings-brand-copy">
            <strong>Fixvox</strong>
            <span>Desktop settings</span>
          </div>
        </div>
        <div className="settings-policy-line">Current policy: <strong>local</strong></div>

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
                <span className="settings-nav-icon" aria-hidden="true">{section.icon}</span>
                <span className="settings-nav-copy">
                  <span>{section.label}</span>
                  <small>{section.state}</small>
                </span>
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
          <span className="settings-status-badge">{selectedSectionMeta.state}</span>
        </header>

        {selectedSection === "general" ? (
        <section className="settings-panel settings-essentials-panel" aria-labelledby="settings-general-title">
          <div className="settings-panel-header">
            <div>
              <h2 id="settings-general-title">Essentials</h2>
              <p>Fixvox-style workspace for access, behavior, hotkeys and first-run controls.</p>
            </div>
            <span className="settings-panel-count">{essentialsTabs.length} tabs</span>
          </div>

          <div className="settings-essentials-tabs" role="tablist" aria-label="Essentials sections">
            {essentialsTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={essentialsTab === tab.id}
                className="settings-essentials-tab"
                onClick={() => setEssentialsTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {essentialsTab === "access" ? (
            <div className="settings-hotkey-list" role="tabpanel" aria-label="Access essentials">
              <div className="settings-hotkey-row">
                <div className="settings-hotkey-copy">
                  <strong>Fixvox Cloud access</strong>
                  <span>{authPolicyView.headline}. Open Cloud to sign in, repair device link or refresh policy.</span>
                </div>
                <button type="button" className="settings-editor-button settings-editor-button-secondary" onClick={() => setSelectedSection("cloud")}>
                  Open Cloud
                </button>
              </div>
            </div>
          ) : essentialsTab === "workspace" ? (
            <div className="settings-hotkey-list" role="tabpanel" aria-label="Workspace essentials">
              <div className="settings-hotkey-row settings-toggle-row" data-health={startupConfig?.enabled ? "success" : undefined}>
                <div className="settings-hotkey-copy">
                  <strong>Open Fixvox when Windows starts</strong>
                  <span>{startupSummary}</span>
                </div>
                <button
                  type="button"
                  className="settings-toggle"
                  role="switch"
                  aria-checked={startupConfig?.enabled === true}
                  aria-label="Open Fixvox when Windows starts"
                  disabled={!tauriRuntime || busyAction === "startup" || !startupConfig?.supported}
                  onClick={() => void toggleStartupLaunch(!startupConfig?.enabled)}
                >
                  <span>{busyAction === "startup" ? "Saving" : startupStateLabel}</span>
                </button>
              </div>
              <div className="settings-hotkey-row settings-toggle-row" data-health={userPreferences.showDockOnStartup ? "success" : undefined}>
                <div className="settings-hotkey-copy">
                  <strong>Show dock on startup</strong>
                  <span>Persisted host preference. Tray Show/Hide can still override during the session.</span>
                </div>
                <button
                  type="button"
                  className="settings-toggle"
                  role="switch"
                  aria-checked={userPreferences.showDockOnStartup}
                  aria-label="Show dock on startup"
                  disabled={!tauriRuntime || busyAction === "preferences"}
                  onClick={() => void toggleUserPreference("showDockOnStartup")}
                >
                  <span>{userPreferences.showDockOnStartup ? "On" : "Off"}</span>
                </button>
              </div>
            </div>
          ) : essentialsTab === "behavior" ? (
            <div className="settings-hotkey-list" role="tabpanel" aria-label="Behavior essentials">
              <div className="settings-hotkey-row settings-toggle-row" data-health={userPreferences.reviewBeforeDelivery ? "success" : undefined}>
                <div className="settings-hotkey-copy">
                  <strong>Review before delivery</strong>
                  <span>Persisted host preference for opening review before insertion when policy/user preference asks for it.</span>
                </div>
                <button
                  type="button"
                  className="settings-toggle"
                  role="switch"
                  aria-checked={userPreferences.reviewBeforeDelivery}
                  aria-label="Review before delivery"
                  disabled={!tauriRuntime || busyAction === "preferences"}
                  onClick={() => void toggleUserPreference("reviewBeforeDelivery")}
                >
                  <span>{userPreferences.reviewBeforeDelivery ? "On" : "Off"}</span>
                </button>
              </div>
<div className="settings-hotkey-row settings-toggle-row" data-health={userPreferences.pressEnterAfterPaste ? "success" : undefined}>
<div className="settings-hotkey-copy">
<strong>Press Enter after paste</strong>
<span>Persisted Fixvox behavior control. Runtime still fails closed when delivery is uncertain.</span>
</div>
<button
type="button"
className="settings-toggle"
role="switch"
aria-checked={userPreferences.pressEnterAfterPaste}
aria-label="Press Enter after paste"
disabled={!tauriRuntime || busyAction === "preferences"}
onClick={() => void toggleUserPreference("pressEnterAfterPaste")}
>
<span>{userPreferences.pressEnterAfterPaste ? "On" : "Off"}</span>
</button>
</div>
<div className="settings-hotkey-row settings-toggle-row" data-health={userPreferences.muteOutputDuringRecording ? "success" : undefined}>
<div className="settings-hotkey-copy">
<strong>Mute output while recording</strong>
<span>Attempts to mute speaker output during capture and restore it after stop/cancel/error.</span>
</div>
<button
 type="button"
 className="settings-toggle"
 role="switch"
 aria-checked={userPreferences.muteOutputDuringRecording}
 aria-label="Mute output while recording"
 disabled={!tauriRuntime || busyAction === "preferences"}
 onClick={() => void toggleUserPreference("muteOutputDuringRecording")}
>
<span>{userPreferences.muteOutputDuringRecording ? "On" : "Off"}</span>
</button>
</div>
<div className="settings-hotkey-row settings-toggle-row" data-health={userPreferences.dictationSoundCuesEnabled ? "success" : undefined}>
<div className="settings-hotkey-copy">
<strong>Dictation sound cues</strong>
<span>Optional non-blocking cues for start, stop, success, no-speech and error states.</span>
</div>
<button
 type="button"
 className="settings-toggle"
 role="switch"
 aria-checked={userPreferences.dictationSoundCuesEnabled}
 aria-label="Dictation sound cues"
 disabled={!tauriRuntime || busyAction === "preferences"}
 onClick={() => void toggleUserPreference("dictationSoundCuesEnabled")}
>
<span>{userPreferences.dictationSoundCuesEnabled ? "On" : "Off"}</span>
</button>
</div>
<div className="settings-hotkey-row settings-toggle-row" data-health={userPreferences.autoStopOnSilenceEnabled ? "success" : undefined}>
<div className="settings-hotkey-copy">
<strong>Auto-stop after silence</strong>
<span>Stops recording after {userPreferences.autoStopSilenceMs} ms of silence. Manual stop remains available.</span>
</div>
<button
type="button"
className="settings-toggle"
role="switch"
aria-checked={userPreferences.autoStopOnSilenceEnabled}
aria-label="Auto-stop after silence"
disabled={!tauriRuntime || busyAction === "preferences"}
onClick={() => void toggleUserPreference("autoStopOnSilenceEnabled")}
>
<span>{userPreferences.autoStopOnSilenceEnabled ? "On" : "Off"}</span>
</button>
</div>
            </div>
          ) : essentialsTab === "hotkeys" ? (
            <div className="settings-hotkey-list" role="tabpanel" aria-label="Hotkey essentials">
              <div className="settings-hotkey-row">
                <div className="settings-hotkey-copy">
                  <strong>Dictation key</strong>
                  <span>Current binding: {dictationShortcut}. Full shortcut editor lives in Hotkeys.</span>
                </div>
                <button type="button" className="settings-editor-button settings-editor-button-secondary" onClick={() => setSelectedSection("hotkeys")}>
                  Open Hotkeys
                </button>
              </div>
              <div className="settings-hotkey-row">
                <div className="settings-hotkey-copy">
                  <strong>Picker</strong>
                  <span>{actionHotkeys.presetPicker} opens the preset picker and uses one-shot presets.</span>
                </div>
                <div className="settings-hotkey-value"><kbd>{actionHotkeys.presetPicker}</kbd><small>host</small></div>
              </div>
            </div>
          ) : (
            <div className="settings-hotkey-list" role="tabpanel" aria-label="First run essentials">
              <div className="settings-hotkey-row">
                <div className="settings-hotkey-copy">
                  <strong>Onboarding and identity</strong>
                  <span>Planned first-run replay/reset controls. Kept here to match Fixvox Essentials layout.</span>
                </div>
                <div className="settings-hotkey-value"><kbd>Planned</kbd><small>first run</small></div>
              </div>
              <div className="settings-hotkey-row">
                <div className="settings-hotkey-copy">
                  <strong>Version</strong>
                  <span>About/version details stay visible without exposing secrets or raw local paths.</span>
                </div>
                <div className="settings-hotkey-value"><kbd>Local</kbd><small>about</small></div>
              </div>
            </div>
          )}
        </section>
        ) : selectedSection === "hotkeys" ? (
        <section className="settings-panel" aria-labelledby="settings-current-bindings-title">
          <div className="settings-panel-header">
            <div>
              <h2 id="settings-current-bindings-title">Shortcut editor</h2>
              <p>Edit the primary dictation key and action shortcuts, host-owned.</p>
            </div>
            <span className="settings-panel-count">{hotkeys.length} keys</span>
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
              data-recording={captureState === "recording" && captureTarget === "dictation"}
              disabled={!tauriRuntime || Boolean(busyAction)}
              onClick={() => void startShortcutCapture()}
              onKeyDown={(event) => void handleShortcutCaptureKeyDown(event)}
              aria-label={`Dictation key shortcut: ${editingShortcut}. Click, then press a new shortcut.`}
            >
              <span>{captureState === "recording" && captureTarget === "dictation" ? "Press new shortcut…" : editingShortcut}</span>
              <small>{captureState === "recording" && captureTarget === "dictation" ? "Esc cancels" : "Click to edit"}</small>
            </button>

            <div className="settings-hotkey-editor-actions settings-action-hotkey-editors" aria-label="Action shortcut editors">
              <button
                type="button"
                className="settings-hotkey-recorder settings-hotkey-recorder-compact"
                data-recording={captureState === "recording" && captureTarget === "preset_picker"}
                disabled={!tauriRuntime || Boolean(busyAction)}
                onClick={() => void startShortcutCapture("preset_picker")}
                onKeyDown={(event) => void handleShortcutCaptureKeyDown(event)}
                aria-label={`Preset picker shortcut: ${actionHotkeys.presetPicker}. Click, then press a new shortcut.`}
              >
                <span>{captureState === "recording" && captureTarget === "preset_picker" ? "Press new shortcut…" : actionHotkeys.presetPicker}</span>
                <small>Preset picker</small>
              </button>
              <button
                type="button"
                className="settings-hotkey-recorder settings-hotkey-recorder-compact"
                data-recording={captureState === "recording" && captureTarget === "paste_last_safe"}
                disabled={!tauriRuntime || Boolean(busyAction)}
                onClick={() => void startShortcutCapture("paste_last_safe")}
                onKeyDown={(event) => void handleShortcutCaptureKeyDown(event)}
                aria-label={`Paste last shortcut: ${actionHotkeys.pasteLastSafe}. Click, then press a new shortcut.`}
              >
                <span>{captureState === "recording" && captureTarget === "paste_last_safe" ? "Press new shortcut…" : actionHotkeys.pasteLastSafe}</span>
                <small>Paste last</small>
              </button>
            </div>

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
              {previewCopy ? <span>{previewCopy}</span> : null}
              {applyCopy ? <span>{applyCopy}</span> : null}
              {actionPreviewCopy ? <span>{actionPreviewCopy}</span> : null}
              {actionApplyCopy ? <span>{actionApplyCopy}</span> : null}
              <strong>{notice.message}</strong>
            </div>

            <ol className="settings-native-plan-steps settings-hotkey-editor-steps" aria-label="Native re-registration steps">
              {nativeHotkeyEditContract.steps.map((step) => (
                <li key={step.id} title={step.guardrail}>{step.label}</li>
              ))}
            </ol>
          </section>

          <div className="settings-subsection-heading">
            <strong>All bindings</strong>
            <span>{hotkeys.length} shortcuts</span>
          </div>
          <div className="settings-hotkey-list">
            {hotkeys.map((hotkey) => (
              <HotkeyRow key={hotkey.id} hotkey={hotkey} />
            ))}
          </div>
        </section>
        ) : selectedSection === "presets" ? (
        <section className="settings-panel settings-presets-panel" aria-labelledby="settings-presets-title">
          <div className="settings-panel-header">
            <div>
              <h2 id="settings-presets-title">Preset prompt editor</h2>
              <p>Edit starter prompts and add local custom presets used by Alt+Q.</p>
            </div>
            <div className="settings-panel-header-actions">
              <button
                type="button"
                className="settings-editor-button settings-editor-button-secondary"
                disabled={Boolean(busyAction) || !cloudPresetDefaults.length}
                onClick={() => void importCloudPresetDefaults()}
                title={cloudPresetDefaults.length ? "Import preset defaults from the current redacted Cloud policy snapshot." : "No Cloud preset defaults found in the current policy snapshot."}
              >
                {busyAction === "preset" ? "Importing" : "Import Cloud defaults"}
              </button>
              <button
                type="button"
                className="settings-editor-button settings-editor-button-secondary"
                disabled={Boolean(busyAction)}
                onClick={addCustomPreset}
              >
                Add preset
              </button>
              <span className="settings-panel-count">{presetItems.length} presets</span>
            </div>
          </div>

          <div className="settings-preset-admin-grid">
            <div className="settings-hotkey-list settings-preset-admin-list" aria-label="Preset list">
              {presetItems.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="settings-hotkey-row settings-preset-row"
                  data-selected={preset.id === selectedPreset?.id}
                  onClick={() => selectPresetForEditing(preset.id)}
                >
                  <div className="settings-hotkey-copy">
                    <strong>{preset.name}</strong>
                    <span>{preset.id}</span>
                  </div>
                  <div className="settings-hotkey-value" aria-label={`${preset.name} preset state`}>
                    <kbd>{preset.pickerKey}</kbd>
                      <small>{preset.canDelete ? "custom" : preset.isCustomized ? "edited" : "starter"}</small>
                  </div>
                </button>
              ))}
            </div>

            <section className="settings-hotkey-editor settings-preset-editor" aria-labelledby="settings-preset-editor-title">
              <div className="settings-hotkey-editor-topline">
                <div className="settings-hotkey-editor-copy">
                  <div className="settings-native-plan-heading">
                    <h3 id="settings-preset-editor-title">{selectedPreset?.name ?? "Preset"}</h3>
                    <span>{selectedPreset?.isCustomized ? "Custom" : "Starter"}</span>
                  </div>
                  <p>{selectedPreset?.id ?? "No preset selected"} · picker key {selectedPreset?.pickerKey ?? "—"}</p>
                </div>
                <div className="settings-hotkey-editor-state" aria-label="Preset metadata">
                  <span>{selectedPreset?.provider ?? "local"}</span>
                  <span>{selectedPreset?.model ?? "managed default"}</span>
                </div>
              </div>

              <div className="settings-preset-metadata-grid">
                <label className="settings-preset-field">
                  <span>Name</span>
                  <input
                    value={presetNameDraft}
                    onChange={(event) => setPresetNameDraft(event.target.value)}
                    aria-label="Preset name"
                  />
                </label>
                <label className="settings-preset-field settings-preset-field-short">
                  <span>Picker key</span>
                  <input
                    value={presetPickerKeyDraft}
                    maxLength={1}
                    onChange={(event) => setPresetPickerKeyDraft(event.target.value.toUpperCase().slice(0, 1))}
                    aria-label="Preset picker key"
                  />
                </label>
                <button
                  type="button"
                  className="settings-toggle settings-preset-enabled-toggle"
                  role="switch"
                  aria-checked={presetEnabledDraft}
                  onClick={() => setPresetEnabledDraft(!presetEnabledDraft)}
                >
                  <span>{presetEnabledDraft ? "Enabled" : "Disabled"}</span>
                </button>
              </div>

              <div className="settings-preset-metadata-grid settings-preset-metadata-grid-secondary">
                <label className="settings-preset-field">
                  <span>Hotkey</span>
                  <input
                    value={presetHotkeyDraft}
                    onChange={(event) => setPresetHotkeyDraft(event.target.value)}
                    aria-label="Preset hotkey"
                    placeholder="Alt+T, N"
                  />
                </label>
                <label className="settings-preset-field">
                  <span>Provider</span>
                  <input
                    value={presetProviderDraft}
                    onChange={(event) => setPresetProviderDraft(event.target.value)}
                    aria-label="Preset provider"
                    placeholder="managed default"
                  />
                </label>
                <label className="settings-preset-field">
                  <span>Model</span>
                  <input
                    value={presetModelDraft}
                    onChange={(event) => setPresetModelDraft(event.target.value)}
                    aria-label="Preset model"
                    placeholder="managed default"
                  />
                </label>
              </div>

              <div className="settings-preset-metadata-grid settings-preset-metadata-grid-actions">
                <button
                  type="button"
                  className="settings-toggle settings-preset-enabled-toggle"
                  role="switch"
                  aria-checked={presetConfirmDraft}
                  onClick={() => setPresetConfirmDraft(!presetConfirmDraft)}
                >
                  <span>{presetConfirmDraft ? "Confirm" : "No confirm"}</span>
                </button>
              </div>

              <textarea
                className="settings-preset-textarea"
                value={presetDraft}
                onChange={(event) => setPresetDraft(event.target.value)}
                spellCheck={false}
                aria-label="Preset prompt body"
              />

              <div className="settings-hotkey-editor-actions">
                <button
                  type="button"
                  className="settings-editor-button settings-editor-button-secondary"
                  disabled={Boolean(busyAction) || !selectedPreset}
                  onClick={duplicateSelectedPreset}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="settings-editor-button settings-editor-button-secondary"
                  disabled={Boolean(busyAction) || selectedPreset?.canDelete || !selectedPreset?.isCustomized}
                  onClick={resetPresetDraft}
                  title={selectedPreset?.canDelete ? "Custom presets do not have a bundled starter to reset." : undefined}
                >
                  Reset starter
                </button>
                <button
                  type="button"
                  className="settings-editor-button settings-editor-button-secondary"
                  disabled={Boolean(busyAction) || !selectedPreset?.canDelete}
                  onClick={deleteSelectedPreset}
                  title={selectedPreset?.canDelete ? "Delete this local custom preset." : "Starter presets are locked. Add a custom preset to delete it later."}
                >
                  {selectedPreset?.canDelete ? "Delete preset" : "Starter locked"}
                </button>
                <button
                  type="button"
                  className="settings-editor-button settings-editor-button-primary"
                  disabled={Boolean(busyAction) || !selectedPreset || !presetDraftChanged}
                  onClick={savePresetDraft}
                >
                  {busyAction === "preset" ? "Saving" : "Save prompt"}
                </button>
              </div>

              <div className="settings-hotkey-editor-feedback" data-tone={presetNotice.tone}>
                <span>{presetDraftChanged ? "Unsaved changes" : "Saved prompt"}</span>
                <span>Local app data</span>
                <span>{cloudPresetDefaults.length ? `${cloudPresetDefaults.length} Cloud defaults` : "No Cloud defaults"}</span>
                <span>Alt+Q reads on next run</span>
                <strong>{presetNotice.message}</strong>
              </div>
            </section>
          </div>
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
                {authSessionStatus?.userRedacted ? <span>{authStatusUserLabel}</span> : null}
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
                onClick={() => void (signedInDeviceLinkPending ? pollCloudLoginStatus() : runCloudOperation("register"))}
              >
                {busyAction === "register" ? "Repairing" : signedInDeviceLinkPending ? "Link signed-in device" : "Repair device link"}
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
      return "Settings";
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
      return "Essentials for access, workspace, behavior, hotkeys and first run.";
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
