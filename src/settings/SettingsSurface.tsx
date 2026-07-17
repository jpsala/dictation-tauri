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
  deriveFixvoxAuthPolicyView,
  deriveFixvoxCloudHealth,
  getFixvoxAuthSessionStatus,
  getFixvoxCloudStatus,
  pollFixvoxCloudLogin,
  resolveSettingsAccess,
  startFixvoxCloudLogin,
  type FixvoxAuthSessionStatus,
  type FixvoxCloudStatus,
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
  { id: "general", label: "General", state: "Aplicación", icon: "⚙" },
  { id: "account", label: "Cuenta", state: "Acceso", icon: "☁" },
  { id: "dictation", label: "Dictado", state: "Audio y entrega", icon: "◌" },
  { id: "hotkeys", label: "Atajos", state: "Teclado", icon: "⌘" },
  { id: "presets", label: "Presets", state: "Acciones", icon: "▣" },
  { id: "privacy", label: "Privacidad", state: "Datos locales", icon: "◐" },
  { id: "help", label: "Ayuda", state: "Soporte", icon: "?" },
  { id: "advanced", label: "Avanzado", state: "Diagnóstico", icon: "◇" },
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

type BusyAction = "preview" | "apply" | "status" | "login" | "loginStatus" | "startup" | "preset" | "preferences" | "history" | "admin";

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
  const [privacyNotice, setPrivacyNotice] = useState<EditorNotice>({
    tone: "idle",
    message: "El historial se guarda localmente y podés borrarlo cuando quieras.",
  });
  const [adminNotice, setAdminNotice] = useState<EditorNotice>({
    tone: "idle",
    message: "OAuth and admin credentials remain server-side in the existing Control Room.",
  });
  const [startupConfig, setStartupConfig] = useState<StartupLaunchConfig | undefined>();
  const [userPreferences, setUserPreferencesState] = useState<UserPreferences>(defaultUserPreferences);
  const [selectedSection, setSelectedSection] = useState<SettingsSectionId>(initialSection);
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
  const settingsAccess = cloudStatus
    ? resolveSettingsAccess(cloudStatus)
    : tauriRuntime
      ? resolveSettingsAccess(undefined)
      : { canViewPresets: true, canEditPresets: true, canOpenAdmin: false };
  const visibleSections = sections;
  const requestedSectionAllowed = visibleSections.some((section) => section.id === selectedSection);
  const effectiveSection = requestedSectionAllowed ? selectedSection : "general";
  const selectedSectionMeta = sections.find((section) => section.id === effectiveSection) ?? sections[0];
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
    if (!tauriRuntime || cloudStatus) {
      return;
    }

    void getFixvoxCloudStatus().then(setCloudStatus).catch(() => undefined);
  }, [cloudStatus, tauriRuntime]);

  useEffect(() => {
    if (!tauriRuntime || effectiveSection !== "account") {
      return;
    }

    void loadCloudStatus();
  }, [effectiveSection, tauriRuntime]);

  useEffect(() => {
    if (!tauriRuntime || effectiveSection !== "general") {
      return;
    }

    void loadStartupLaunch();
    void loadUserPreferences();
  }, [effectiveSection, tauriRuntime]);

  useEffect(() => {
    if (!tauriRuntime || effectiveSection !== "presets" || !settingsAccess.canViewPresets) {
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
  }, [effectiveSection, settingsAccess.canViewPresets, tauriRuntime]);

  useEffect(() => {
    if (!tauriRuntime || effectiveSection !== "account" || authSessionStatus?.status !== "pending") {
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
  }, [effectiveSection, tauriRuntime, authSessionStatus?.status]);

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
        label: "Tecla de dictado",
        value: dictationShortcut,
        hint: "Mantenela o tocala para iniciar el dictado. La aplicación la administra.",
        mode: "host",
      },
      {
        id: "stop-submit",
        label: "Detener y entregar",
        value: "Alt+Shift+Space",
        hint: "Finaliza la captura y entrega el resultado.",
        mode: "fixed",
      },
      {
        id: "paste-last",
        label: "Pegar el último resultado",
        value: actionHotkeys.pasteLastSafe,
        hint: "Pega de forma segura el resultado más reciente. La aplicación administra el atajo.",
        mode: "host",
      },
      {
        id: "quick-chat",
        label: "Asistente rápido",
        value: "Alt+Shift+C",
        hint: "Acción reservada para el asistente.",
        mode: "planned",
      },
      {
        id: "result-history",
        label: "Historial de resultados",
        value: "Alt+Shift+Z",
        hint: "Abre los resultados recientes y la recuperación para pegar el último.",
        mode: "fixed",
      },
      {
        id: "preset-picker",
        label: "Selector de presets",
        value: actionHotkeys.presetPicker,
        hint: "Transforma la selección actual o elige un preset de dictado. La aplicación administra el atajo.",
        mode: "host",
      },
      {
        id: "assistant-mode",
        label: "Modo asistente",
        value: "Sin configurar",
        hint: "Acción reservada para dictado asistido.",
        mode: "planned",
      },
      {
        id: "press-enter",
        label: "Enviar después de pegar",
        value: "Sin configurar",
        hint: "Preferencia reservada para enviar después de entregar.",
        mode: "planned",
      },
      {
        id: "cancel-recording",
        label: "Cancelar grabación",
        value: "Escape",
        hint: "Disponible sólo durante una captura que se puede cancelar.",
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
  const loginSessionStatus = authSessionStatus?.status ?? "signed_out";
  const loginPending = loginSessionStatus === "pending";
  const loginSignedIn = loginSessionStatus === "signed_in";
  const signedInPolicyActive = cloudStatus?.authPolicy?.accessMode === "signed_in";
  const startupSummary = summarizeStartupLaunchConfig(startupConfig);

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

  async function toggleUserPreference(key: keyof Pick<UserPreferences, "showDockOnStartup" | "reviewBeforeDelivery" | "pressEnterAfterPaste" | "followFocusUntilDelivery" | "autoStopOnSilenceEnabled" | "muteOutputDuringRecording" | "dictationSoundCuesEnabled">) {
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

  async function clearLocalHistory() {
    if (!tauriRuntime || !window.confirm("¿Querés borrar el historial local de resultados?")) {
      return;
    }

    setBusyAction("history");
    try {
      await invoke("clear_result_history");
      setPrivacyNotice({ tone: "success", message: "El historial local se borró." });
    } catch (error) {
      setPrivacyNotice({ tone: "danger", message: `No pudimos borrar el historial: ${formatHotkeyEditReason(error)}` });
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

  async function openAdminControlRoom() {
    if (!tauriRuntime || !settingsAccess.canOpenAdmin) {
      setAdminNotice({ tone: "warning", message: "The current Fixvox policy does not allow Admin settings." });
      return;
    }

    setBusyAction("admin");
    try {
      await invoke("show_admin_control_room");
      setAdminNotice({ tone: "success", message: "Control Room opened in a dedicated Fixvox window." });
    } catch (error) {
      setAdminNotice({ tone: "danger", message: formatHotkeyEditReason(error) });
    } finally {
      setBusyAction(undefined);
    }
  }


  return (
    <main className="settings-window-shell" aria-label="Ajustes de Dictation">
      <aside className="settings-sidebar" aria-label="Settings sections">
        <div className="settings-brand-row">
          <div className="settings-brand-mark" aria-hidden="true">⚡</div>
          <div className="settings-brand-copy">
            <strong>Fixvox</strong>
            <span>Ajustes de escritorio</span>
          </div>
        </div>

        <nav className="settings-nav-list">
          {visibleSections.map((section) => {
            const isActive = section.id === effectiveSection;
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

      <section className="settings-content" aria-labelledby={`settings-${effectiveSection}-title`}>
        <header className="settings-header">
          <div className="settings-title-block">
            <p className="settings-path">Ajustes / {selectedSectionMeta.label}</p>
            <h1 id={`settings-${effectiveSection}-title`}>{settingsHeading}</h1>
            <p>{settingsSummary}</p>
          </div>
          <span className="settings-status-badge">{selectedSectionMeta.state}</span>
        </header>

        {effectiveSection === "general" ? (
        <section className="settings-panel" aria-labelledby="settings-general-panel-title">
          <div className="settings-panel-header">
            <div><h2 id="settings-general-panel-title">Inicio de la aplicación</h2><p>Elegí qué ocurre cuando iniciás Windows.</p></div>
          </div>
          <div className="settings-hotkey-list">
            <PreferenceToggle label="Abrir Dictation al iniciar Windows" detail={startupSummary} checked={startupConfig?.enabled === true} disabled={!tauriRuntime || busyAction === "startup" || !startupConfig?.supported} onClick={() => void toggleStartupLaunch(!startupConfig?.enabled)} />
            <PreferenceToggle label="Mostrar el dock al iniciar" detail="La preferencia se guarda en esta computadora." checked={userPreferences.showDockOnStartup} disabled={!tauriRuntime || busyAction === "preferences"} onClick={() => void toggleUserPreference("showDockOnStartup")} />
          </div>
        </section>
        ) : effectiveSection === "dictation" ? (
        <section className="settings-panel" aria-labelledby="settings-dictation-controls-title">
          <div className="settings-panel-header">
            <div>
              <h2 id="settings-dictation-controls-title">Dictado</h2>
              <p>Elegí cómo se comporta Dictation mientras grabás y cuando entrega el resultado.</p>
            </div>
          </div>
          <div className="settings-hotkey-list" aria-label="Preferencias de dictado">
            <PreferenceToggle
              label="Detener después de un silencio"
              detail={`Detiene el dictado después de ${userPreferences.autoStopSilenceMs} ms de silencio. Siempre podés detenerlo manualmente.`}
              checked={userPreferences.autoStopOnSilenceEnabled}
              disabled={!tauriRuntime || busyAction === "preferences"}
              onClick={() => void toggleUserPreference("autoStopOnSilenceEnabled")}
            />
            <PreferenceToggle
              label="Silenciar salida al grabar"
              detail="Reduce el audio de otras aplicaciones durante la grabación y lo restaura al terminar."
              checked={userPreferences.muteOutputDuringRecording}
              disabled={!tauriRuntime || busyAction === "preferences"}
              onClick={() => void toggleUserPreference("muteOutputDuringRecording")}
            />
            <PreferenceToggle
              label="Sonidos de dictado"
              detail="Reproduce avisos breves al iniciar, detener, completar o necesitar atención."
              checked={userPreferences.dictationSoundCuesEnabled}
              disabled={!tauriRuntime || busyAction === "preferences"}
              onClick={() => void toggleUserPreference("dictationSoundCuesEnabled")}
            />
            <PreferenceToggle
              label="Revisar antes de entregar"
              detail="Abre una revisión antes de insertar el resultado cuando corresponde."
              checked={userPreferences.reviewBeforeDelivery}
              disabled={!tauriRuntime || busyAction === "preferences"}
              onClick={() => void toggleUserPreference("reviewBeforeDelivery")}
            />
          </div>
        </section>
        ) : effectiveSection === "privacy" ? (
        <section className="settings-panel" aria-labelledby="settings-privacy-title">
          <div className="settings-panel-header">
            <div>
              <h2 id="settings-privacy-title">Privacidad</h2>
              <p>Controlá los datos que Dictation conserva en esta computadora.</p>
            </div>
          </div>
          <div className="settings-hotkey-list" aria-label="Privacidad y datos locales">
            <div className="settings-hotkey-row">
              <div className="settings-hotkey-copy">
                <strong>Historial local</strong>
                <span>El historial se guarda sólo en esta computadora. No se muestra su contenido en Ajustes.</span>
              </div>
              <button
                type="button"
                className="settings-editor-button settings-editor-button-secondary"
                disabled={!tauriRuntime || busyAction === "history"}
                onClick={() => void clearLocalHistory()}
              >
                {busyAction === "history" ? "Borrando" : "Borrar historial"}
              </button>
            </div>
          </div>
          <div className="settings-hotkey-editor-feedback" data-tone={privacyNotice.tone} aria-live="polite">
            <strong>{privacyNotice.message}</strong>
          </div>
        </section>
        ) : effectiveSection === "help" ? (
        <section className="settings-panel" aria-labelledby="settings-help-title">
          <div className="settings-panel-header">
            <div>
              <h2 id="settings-help-title">Ayuda</h2>
              <p>Consultá el estado general y abrí información segura si necesitás asistencia.</p>
            </div>
          </div>
          <div className="settings-hotkey-list" aria-label="Ayuda y estado">
            <div className="settings-hotkey-row" data-health={cloudHealth.tone}>
              <div className="settings-hotkey-copy">
                <strong>Estado del servicio</strong>
                <span>{cloudHealth.badge === "Ready" ? "Dictation está listo para usar." : "Hay información disponible para ayudarte a continuar."}</span>
              </div>
              <button type="button" className="settings-editor-button settings-editor-button-secondary" onClick={() => setSelectedSection("advanced")}>
                Abrir diagnóstico seguro
              </button>
            </div>
          </div>
        </section>
        ) : effectiveSection === "hotkeys" ? (
        <section className="settings-panel" aria-labelledby="settings-current-bindings-title">
          <div className="settings-panel-header">
            <div>
              <h2 id="settings-current-bindings-title">Atajos</h2>
              <p>Cambiá el atajo de dictado y los atajos de acciones desde la aplicación.</p>
            </div>
            <span className="settings-panel-count">{hotkeys.length} atajos</span>
          </div>

          <section className="settings-hotkey-editor" aria-labelledby="settings-hotkey-editor-title">
            <div className="settings-hotkey-editor-topline">
              <div className="settings-hotkey-editor-copy">
                <div className="settings-native-plan-heading">
                  <h3 id="settings-hotkey-editor-title">{nativeHotkeyEditContract.heading}</h3>
                  <span>{nativeHotkeyEditContract.statusLabel}</span>
                </div>
                <p>{nativeHotkeyEditContract.summary} Seleccioná el campo y presioná el nuevo atajo.</p>
              </div>
              <div className="settings-hotkey-editor-state" aria-label="Estado de edición del atajo">
                <span>Actual <kbd>{dictationShortcut}</kbd></span>
                <span>Nuevo <kbd>{editingShortcut}</kbd></span>
              </div>
            </div>

            <button
              type="button"
              className="settings-hotkey-recorder"
              data-recording={captureState === "recording" && captureTarget === "dictation"}
              disabled={!tauriRuntime || Boolean(busyAction)}
              onClick={() => void startShortcutCapture()}
              onKeyDown={(event) => void handleShortcutCaptureKeyDown(event)}
              aria-label={`Atajo de dictado: ${editingShortcut}. Seleccionalo y presioná un nuevo atajo.`}
            >
              <span>{captureState === "recording" && captureTarget === "dictation" ? "Presioná el nuevo atajo…" : editingShortcut}</span>
              <small>{captureState === "recording" && captureTarget === "dictation" ? "Esc cancela" : "Seleccionar para cambiar"}</small>
            </button>

            <div className="settings-hotkey-editor-actions settings-action-hotkey-editors" aria-label="Editores de atajos de acciones">
              <button
                type="button"
                className="settings-hotkey-recorder settings-hotkey-recorder-compact"
                data-recording={captureState === "recording" && captureTarget === "preset_picker"}
                disabled={!tauriRuntime || Boolean(busyAction)}
                onClick={() => void startShortcutCapture("preset_picker")}
                onKeyDown={(event) => void handleShortcutCaptureKeyDown(event)}
                aria-label={`Atajo del selector de presets: ${actionHotkeys.presetPicker}. Seleccionalo y presioná un nuevo atajo.`}
              >
                <span>{captureState === "recording" && captureTarget === "preset_picker" ? "Presioná el nuevo atajo…" : actionHotkeys.presetPicker}</span>
                <small>Selector de presets</small>
              </button>
              <button
                type="button"
                className="settings-hotkey-recorder settings-hotkey-recorder-compact"
                data-recording={captureState === "recording" && captureTarget === "paste_last_safe"}
                disabled={!tauriRuntime || Boolean(busyAction)}
                onClick={() => void startShortcutCapture("paste_last_safe")}
                onKeyDown={(event) => void handleShortcutCaptureKeyDown(event)}
                aria-label={`Atajo para pegar el último resultado: ${actionHotkeys.pasteLastSafe}. Seleccionalo y presioná un nuevo atajo.`}
              >
                <span>{captureState === "recording" && captureTarget === "paste_last_safe" ? "Presioná el nuevo atajo…" : actionHotkeys.pasteLastSafe}</span>
                <small>Pegar el último</small>
              </button>
            </div>

            <div className="settings-hotkey-editor-actions">
              <button
                type="button"
                className="settings-editor-button settings-editor-button-secondary"
                disabled={!tauriRuntime || Boolean(busyAction) || captureState === "recording"}
                onClick={() => void previewCandidate()}
              >
                {busyAction === "preview" ? "Comprobando" : "Comprobar atajo"}
              </button>
            </div>

            <div className="settings-hotkey-editor-feedback" data-tone={notice.tone}>
              <span>{candidateChanged ? "Cambio preparado" : "Atajo actual seleccionado"}</span>
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
            <strong>Todos los atajos</strong>
            <span>{hotkeys.length} atajos</span>
          </div>
          <div className="settings-hotkey-list">
            {hotkeys.map((hotkey) => (
              <HotkeyRow key={hotkey.id} hotkey={hotkey} />
            ))}
          </div>
        </section>
        ) : effectiveSection === "presets" ? (
        <section className="settings-panel settings-presets-panel" aria-labelledby="settings-presets-title">
          <div className="settings-panel-header">
            <div>
              <h2 id="settings-presets-title">Presets</h2>
              <p>Editá los presets disponibles y agregá presets locales para Alt+Q.</p>
            </div>
            <div className="settings-panel-header-actions">
              <button
                type="button"
                className="settings-editor-button settings-editor-button-secondary"
                disabled={Boolean(busyAction) || !cloudPresetDefaults.length}
                onClick={() => void importCloudPresetDefaults()}
                title={cloudPresetDefaults.length ? "Import preset defaults from the current redacted Cloud policy snapshot." : "No Cloud preset defaults found in the current policy snapshot."}
              >
                {busyAction === "preset" ? "Importando" : "Importar valores disponibles"}
              </button>
              <button
                type="button"
                className="settings-editor-button settings-editor-button-secondary"
                disabled={Boolean(busyAction) || !settingsAccess.canEditPresets}
                onClick={addCustomPreset}
              >
                Agregar preset
              </button>
              <span className="settings-panel-count">{presetItems.length} presets</span>
            </div>
          </div>

          {!settingsAccess.canViewPresets ? (
            <div className="settings-hotkey-editor-feedback" data-tone="warning" aria-live="polite">
              <strong>Los presets no están disponibles para esta cuenta.</strong>
            </div>
          ) : null}

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

            <details className="settings-preset-details">
              <summary>Editar el preset seleccionado</summary>
              <section className="settings-hotkey-editor settings-preset-editor" aria-labelledby="settings-preset-editor-title">
              <div className="settings-hotkey-editor-topline">
                <div className="settings-hotkey-editor-copy">
                  <div className="settings-native-plan-heading">
                    <h3 id="settings-preset-editor-title">{selectedPreset?.name ?? "Preset"}</h3>
                    <span>{selectedPreset?.isCustomized ? "Personalizado" : "Incluido"}</span>
                  </div>
                  <p>Tecla del selector: {selectedPreset?.pickerKey ?? "—"}</p>
                </div>
              </div>

              <div className="settings-preset-metadata-grid">
                <label className="settings-preset-field">
                  <span>Nombre</span>
                  <input
                    value={presetNameDraft}
                    disabled={!settingsAccess.canEditPresets}
                    onChange={(event) => setPresetNameDraft(event.target.value)}
                    aria-label="Nombre del preset"
                  />
                </label>
                <label className="settings-preset-field settings-preset-field-short">
                  <span>Tecla del selector</span>
                  <input
                    value={presetPickerKeyDraft}
                    maxLength={1}
                    disabled={!settingsAccess.canEditPresets}
                    onChange={(event) => setPresetPickerKeyDraft(event.target.value.toUpperCase().slice(0, 1))}
                    aria-label="Tecla del selector del preset"
                  />
                </label>
                <button
                  type="button"
                  className="settings-toggle settings-preset-enabled-toggle"
                  role="switch"
                  aria-checked={presetEnabledDraft}
                  disabled={!settingsAccess.canEditPresets}
                  onClick={() => setPresetEnabledDraft(!presetEnabledDraft)}
                >
                  <span className="sr-only">{presetEnabledDraft ? "Activado" : "Desactivado"}</span>
                </button>
              </div>

              <div className="settings-preset-metadata-grid settings-preset-metadata-grid-secondary">
                <label className="settings-preset-field">
                  <span>Atajo</span>
                  <input
                    value={presetHotkeyDraft}
                    disabled={!settingsAccess.canEditPresets}
                    onChange={(event) => setPresetHotkeyDraft(event.target.value)}
                    aria-label="Atajo del preset"
                    placeholder="Alt+T, N"
                  />
                </label>
              </div>

              <div className="settings-preset-metadata-grid settings-preset-metadata-grid-actions">
                <button
                  type="button"
                  className="settings-toggle settings-preset-enabled-toggle"
                  role="switch"
                  aria-checked={presetConfirmDraft}
                  disabled={!settingsAccess.canEditPresets}
                  onClick={() => setPresetConfirmDraft(!presetConfirmDraft)}
                >
                  <span className="sr-only">{presetConfirmDraft ? "Pedir confirmación" : "Sin confirmación"}</span>
                </button>
              </div>

              <textarea
                className="settings-preset-textarea"
                value={presetDraft}
                disabled={!settingsAccess.canEditPresets}
                onChange={(event) => setPresetDraft(event.target.value)}
                spellCheck={false}
                aria-label="Instrucción del preset"
              />

              <div className="settings-hotkey-editor-actions">
                <button
                  type="button"
                  className="settings-editor-button settings-editor-button-secondary"
                  disabled={Boolean(busyAction) || !selectedPreset || !settingsAccess.canEditPresets}
                  onClick={duplicateSelectedPreset}
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  className="settings-editor-button settings-editor-button-secondary"
                  disabled={Boolean(busyAction) || selectedPreset?.canDelete || !selectedPreset?.isCustomized || !settingsAccess.canEditPresets}
                  onClick={resetPresetDraft}
                  title={selectedPreset?.canDelete ? "Custom presets do not have a bundled starter to reset." : undefined}
                >
                  Restablecer incluido
                </button>
                <button
                  type="button"
                  className="settings-editor-button settings-editor-button-secondary"
                  disabled={Boolean(busyAction) || !selectedPreset?.canDelete || !settingsAccess.canEditPresets}
                  onClick={deleteSelectedPreset}
                  title={selectedPreset?.canDelete ? "Delete this local custom preset." : "Starter presets are locked. Add a custom preset to delete it later."}
                >
                  {selectedPreset?.canDelete ? "Eliminar preset" : "Preset incluido"}
                </button>
                <button
                  type="button"
                  className="settings-editor-button settings-editor-button-primary"
                  disabled={Boolean(busyAction) || !selectedPreset || !presetDraftChanged || !settingsAccess.canEditPresets}
                  onClick={savePresetDraft}
                >
                  {busyAction === "preset" ? "Guardando" : "Guardar cambios"}
                </button>
              </div>

              <div className="settings-hotkey-editor-feedback" data-tone={presetNotice.tone}>
                <span>{presetDraftChanged ? "Cambios sin guardar" : "Cambios guardados"}</span>
                <span>Datos locales de la aplicación</span>
                <span>{cloudPresetDefaults.length ? `${cloudPresetDefaults.length} valores disponibles` : "Sin valores para importar"}</span>
                <span>Alt+Q se actualiza en el próximo uso</span>
                <strong>{presetNotice.message}</strong>
              </div>
              </section>
            </details>
          </div>
        </section>
        ) : effectiveSection === "account" ? (
        <section className="settings-panel settings-cloud-panel" aria-labelledby="settings-account-title">
          <div className="settings-panel-header">
            <div>
              <h2 id="settings-account-title">Cuenta</h2>
              <p>Administrá el acceso a Dictation en esta computadora.</p>
            </div>
            <span className="settings-panel-count">{loginSignedIn && signedInPolicyActive ? "Conectada" : "Sin iniciar sesión"}</span>
          </div>

          <div className="settings-hotkey-list" aria-label="Estado de cuenta">
            {loginSignedIn && signedInPolicyActive ? (
              <>
                <div className="settings-hotkey-row" data-health="success">
                  <div className="settings-hotkey-copy">
                    <strong>Cuenta conectada</strong>
                    <span>Tu cuenta y esta computadora están listas para dictar.</span>
                  </div>
                  <div className="settings-hotkey-value"><kbd>Lista</kbd><small>cuenta protegida</small></div>
                </div>
                <div className="settings-hotkey-row">
                  <div className="settings-hotkey-copy">
                    <strong>Plan {authPolicyView.templateLabel}</strong>
                    <span>Los límites y funciones disponibles se aplican automáticamente.</span>
                  </div>
                  <div className="settings-hotkey-value"><kbd>{authPolicyView.limitsLabel}</kbd><small>actual</small></div>
                </div>
              </>
            ) : (
              <div className="settings-hotkey-row" data-health="warning">
                <div className="settings-hotkey-copy">
                  <strong>Iniciá sesión para usar Dictation</strong>
                  <span>Tu cuenta se vincula automáticamente a esta computadora.</span>
                </div>
                <div className="settings-hotkey-value"><kbd>Pendiente</kbd><small>cuenta</small></div>
              </div>
            )}
          </div>

          <section className="settings-hotkey-editor" aria-labelledby="settings-account-action-title">
            <div className="settings-hotkey-editor-topline">
              <div className="settings-hotkey-editor-copy">
                <div className="settings-native-plan-heading">
                  <h3 id="settings-account-action-title">Acceso seguro</h3>
                  <span>Cuenta</span>
                </div>
                <p>El inicio de sesión se abre en el navegador y volvés a la aplicación al terminar.</p>
              </div>
            </div>
            <div className="settings-hotkey-editor-actions">
              <button
                type="button"
                className="settings-editor-button settings-editor-button-primary"
                disabled={!tauriRuntime || Boolean(busyAction)}
                onClick={() => void startCloudLogin()}
              >
                {busyAction === "login" ? "Abriendo…" : loginSignedIn ? "Iniciar sesión de nuevo" : "Continuar con Google"}
              </button>
              {loginPending || loginSignedIn ? (
                <button
                  type="button"
                  className="settings-editor-button settings-editor-button-secondary"
                  disabled={!tauriRuntime || Boolean(busyAction)}
                  onClick={() => void pollCloudLoginStatus()}
                >
                  {busyAction === "loginStatus" ? "Comprobando" : "Comprobar estado"}
                </button>
              ) : null}
            </div>
            <div className="settings-hotkey-editor-feedback" data-tone={cloudNotice.tone} aria-live="polite">
              <strong>{cloudNotice.message}</strong>
            </div>
          </section>
        </section>
        ) : effectiveSection === "advanced" ? (
        <section className="settings-panel settings-cloud-panel" aria-labelledby="settings-advanced-title">
          <div className="settings-panel-header">
            <div>
              <h2 id="settings-advanced-title">Avanzado</h2>
              <p>Diagnóstico reducido para resolver problemas sin mostrar datos sensibles.</p>
            </div>
            <span className="settings-panel-count">Diagnóstico</span>
          </div>
          <div className="settings-hotkey-list" aria-label="Diagnóstico seguro">
            <div className="settings-hotkey-row" data-health={cloudHealth.tone}>
              <div className="settings-hotkey-copy">
                <strong>Diagnóstico seguro</strong>
                <span>{cloudHealth.detail}</span>
              </div>
              <div className="settings-hotkey-value"><kbd>{cloudHealth.badge}</kbd><small>redactado</small></div>
            </div>
            <div className="settings-hotkey-row">
              <div className="settings-hotkey-copy">
                <strong>Estado del servicio</strong>
                <span>Podés actualizar el estado antes de pedir ayuda.</span>
              </div>
              <button
                type="button"
                className="settings-editor-button settings-editor-button-secondary"
                disabled={!tauriRuntime || Boolean(busyAction)}
                onClick={() => void loadCloudStatus()}
              >
                {busyAction === "status" ? "Actualizando" : "Actualizar estado"}
              </button>
            </div>
            {settingsAccess.canOpenAdmin ? (
              <div className="settings-hotkey-row">
                <div className="settings-hotkey-copy">
                  <strong>Control Room</strong>
                  <span>Administración separada para personas autorizadas.</span>
                </div>
                <button
                  type="button"
                  className="settings-editor-button settings-editor-button-primary"
                  disabled={!tauriRuntime || busyAction === "admin"}
                  onClick={() => void openAdminControlRoom()}
                >
                  {busyAction === "admin" ? "Abriendo" : "Abrir Control Room"}
                </button>
              </div>
            ) : null}
          </div>
          <div className="settings-hotkey-editor-feedback" data-tone={adminNotice.tone} aria-live="polite">
            <strong>{adminNotice.message}</strong>
          </div>
        </section>
        ) : (
        <section className="settings-panel settings-planned-panel" aria-labelledby={`settings-${effectiveSection}-planned-title`}>
          <div className="settings-panel-header">
            <div>
              <h2 id={`settings-${effectiveSection}-planned-title`}>{selectedSectionMeta.label}</h2>
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
    case "general": return "General";
    case "account": return "Cuenta";
    case "dictation": return "Dictado";
    case "hotkeys": return "Atajos";
    case "presets": return "Presets";
    case "privacy": return "Privacidad";
    case "help": return "Ayuda";
    case "advanced": return "Avanzado";
  }
}

function sectionSummary(sectionId: SettingsSectionId): string {
  switch (sectionId) {
    case "general": return "Preferencias de inicio y del dock.";
    case "account": return "Tu acceso y plan, sin detalles técnicos.";
    case "dictation": return "Audio, autocierre y entrega del dictado.";
    case "hotkeys": return "Atajos administrados por la aplicación.";
    case "presets": return "Acciones disponibles para tu cuenta.";
    case "privacy": return "Historial y datos guardados en esta computadora.";
    case "help": return "Estado del servicio y ayuda para continuar.";
    case "advanced": return "Diagnóstico reducido y acceso de operador autorizado.";
  }
}

function PreferenceToggle({
  label,
  detail,
  checked,
  disabled,
  onClick,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="settings-hotkey-row settings-toggle-row" data-health={checked ? "success" : undefined}>
      <div className="settings-hotkey-copy">
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <div className="settings-toggle-control">
        <span className="settings-toggle-status">{checked ? "Activado" : "Desactivado"}</span>
        <button
          type="button"
          className="settings-toggle"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        />
      </div>
    </div>
  );
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
