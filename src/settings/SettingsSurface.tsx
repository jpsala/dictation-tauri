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
  isFixvoxAccountReady,
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
  createSelectionTransformPreset,
  deleteSelectionTransformPreset,
  listSelectionTransformPresetAdminItems,
  saveSelectionTransformPreset,
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

type SettingsIconName = "plus" | "download" | "copy" | "trash";

function SettingsIcon({ name }: { name: SettingsIconName }) {
  return (
    <svg className="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "plus" ? <><path d="M12 5v14" /><path d="M5 12h14" /></> : null}
      {name === "download" ? <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></> : null}
      {name === "copy" ? <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></> : null}
      {name === "trash" ? <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m7 7 1 13h8l1-13" /><path d="M10 11v5" /><path d="M14 11v5" /></> : null}
    </svg>
  );
}

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
    message: "",
  });
  const [lastStatusCheckedAt, setLastStatusCheckedAt] = useState<string>();
  const [privacyNotice, setPrivacyNotice] = useState<EditorNotice>({
    tone: "idle",
    message: "El historial se guarda localmente y podés borrarlo cuando quieras.",
  });
  const [diagnosticNotice, setDiagnosticNotice] = useState<EditorNotice>({
    tone: "idle",
    message: "",
  });
  const [adminNotice, setAdminNotice] = useState<EditorNotice>({
    tone: "idle",
    message: "",
  });
  const [startupConfig, setStartupConfig] = useState<StartupLaunchConfig | undefined>();
  const [userPreferences, setUserPreferencesState] = useState<UserPreferences>(defaultUserPreferences);
  const [selectedSection, setSelectedSection] = useState<SettingsSectionId>(initialSection);
  const [presetItems, setPresetItems] = useState<SelectionTransformPresetAdminItem[]>(() =>
    listSelectionTransformPresetAdminItems(),
  );
  const [selectedPresetId, setSelectedPresetId] = useState(presetItems[0]?.id ?? "");
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
    message: "Editá cualquier preset. El selector usa los cambios guardados en el próximo uso.",
  });
  const [cloudPresetDefaults, setCloudPresetDefaults] = useState<CloudSelectionPresetDefault[]>(() =>
    extractCloudSelectionPresetDefaults(initialCloudStatus),
  );
  const captureArmedRef = useRef(false);
  const accountAutoSelectDoneRef = useRef(false);
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
    if (!tauriRuntime || !cloudStatus || accountAutoSelectDoneRef.current) {
      return;
    }

    accountAutoSelectDoneRef.current = true;
    if (initialSection === "general" && !isFixvoxAccountReady(cloudStatus)) {
      setSelectedSection("account");
    }
  }, [cloudStatus, initialSection, tauriRuntime]);

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

  async function loadCloudStatus(manual = false) {
    if (manual) {
      setBusyAction("status");
    }
    try {
      const [status, sessionStatus] = await Promise.all([
        getFixvoxCloudStatus(),
        getFixvoxAuthSessionStatus(),
      ]);
      setCloudStatus(status);
      setAuthSessionStatus(sessionStatus);
      const health = deriveFixvoxCloudHealth(status);
      const checkedAt = new Date().toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      if (manual) {
        setLastStatusCheckedAt(checkedAt);
      }
      if (manual) {
        setDiagnosticNotice({
          tone: health.tone,
          message: `Diagnóstico actualizado a las ${checkedAt}. ${health.detail}`,
        });
      }
    } catch (error) {
      const reason = formatHotkeyEditReason(error);
      if (manual) {
        setDiagnosticNotice({
          tone: "danger",
          message: `No pudimos volver a comprobar el diagnóstico: ${reason}`,
        });
      } else {
        setCloudNotice({
          tone: "danger",
          message: "No pudimos leer el estado de la cuenta.",
        });
      }
    } finally {
      if (manual) {
        setBusyAction(undefined);
      }
    }
  }

  async function pollCloudLoginStatus(silent = false) {
    if (!tauriRuntime) {
      setCloudNotice({ tone: "warning", message: "Abrí estos ajustes desde la aplicación para continuar." });
      return;
    }

    if (!silent) {
      setBusyAction("loginStatus");
    }
    try {
      const sessionStatus = await pollFixvoxCloudLogin();
      if (!sessionStatus) {
        setCloudNotice({ tone: "warning", message: "No pudimos comprobar el inicio de sesión desde esta ventana." });
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
            ? "Cuenta conectada. Esta computadora ya está lista para dictar."
            : "La cuenta está conectada. Estamos terminando de preparar esta computadora.",
        });
      } else if (sessionStatus.status === "pending") {
        setCloudNotice({
          tone: "idle",
          message: "Esperando confirmación del navegador… Esta pantalla se actualizará automáticamente.",
        });
      } else if (sessionStatus.status === "expired") {
        setCloudNotice({ tone: "warning", message: "La sesión venció. Iniciá sesión de nuevo." });
      } else if (sessionStatus.status === "error") {
        setCloudNotice({ tone: "danger", message: "No pudimos completar el inicio de sesión. Intentá de nuevo." });
      }
    } catch (error) {
      setCloudNotice({
        tone: "danger",
        message: `No pudimos comprobar el inicio de sesión: ${formatHotkeyEditReason(error)}`,
      });
    } finally {
      if (!silent) {
        setBusyAction(undefined);
      }
    }
  }

  async function startCloudLogin() {
    if (!tauriRuntime) {
      setCloudNotice({ tone: "warning", message: "Abrí estos ajustes desde la aplicación para iniciar sesión." });
      return;
    }

    setBusyAction("login");
    try {
      const login = await startFixvoxCloudLogin(true);
      if (!login) {
        setCloudNotice({ tone: "warning", message: "No pudimos iniciar sesión desde esta ventana." });
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
          ? "Completá el inicio de sesión en el navegador. Esta pantalla se actualizará cuando vuelvas."
          : "No pudimos abrir el navegador. Intentá iniciar sesión de nuevo.",
      });
    } catch (error) {
      setCloudNotice({
        tone: "danger",
        message: `No pudimos iniciar sesión: ${formatHotkeyEditReason(error)}`,
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
    setSelectedPresetId(nextSelected?.id ?? "");
    setPresetNameDraft(nextSelected?.name ?? "");
    setPresetPickerKeyDraft(nextSelected?.pickerKey ?? "");
    setPresetHotkeyDraft(nextSelected?.hotkey ?? "");
    setPresetProviderDraft(nextSelected?.provider ?? "");
    setPresetModelDraft(nextSelected?.model ?? "");
    setPresetEnabledDraft(nextSelected?.enabled !== false);
    setPresetConfirmDraft(nextSelected?.confirm === true);
    setPresetDraft(nextSelected?.body ?? "");
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
          : "Los valores disponibles no coincidieron con ningún preset existente.",
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
      tone: "idle",
      message: "Preset seleccionado. Podés editarlo, desactivarlo, duplicarlo o eliminarlo.",
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
      saveSelectionTransformPreset(selectedPreset.id, {
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

  function addPreset() {
    setBusyAction("preset");
    try {
      const nextPreset = createSelectionTransformPreset({
        name: "Nuevo preset",
        pickerKey: "N",
      });
      void persistPresetStore();
      refreshPresetItems(nextPreset.id);
      setPresetNotice({ tone: "success", message: "Preset creado y seleccionado." });
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
      const nextPreset = createSelectionTransformPreset({
        name: `${selectedPreset.name} copia`,
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
      setPresetNotice({ tone: "success", message: `${selectedPreset.name} duplicado.` });
    } finally {
      setBusyAction(undefined);
    }
  }

  function deleteSelectedPreset() {
    if (!selectedPreset || !window.confirm(`¿Eliminar el preset “${selectedPreset.name}”? Esta acción no se puede deshacer.`)) {
      return;
    }

    setBusyAction("preset");
    try {
      deleteSelectionTransformPreset(selectedPreset.id);
      void persistPresetStore();
      refreshPresetItems("");
      setPresetNotice({ tone: "idle", message: `${selectedPreset.name} eliminado.` });
    } finally {
      setBusyAction(undefined);
    }
  }

  async function openAdminControlRoom() {
    if (!tauriRuntime || !settingsAccess.canOpenAdmin) {
      setAdminNotice({ tone: "warning", message: "Tu cuenta no tiene acceso a Control Room." });
      return;
    }

    setBusyAction("admin");
    try {
      await invoke("show_admin_control_room");
      setAdminNotice({ tone: "success", message: "Control Room se abrió en una ventana separada." });
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
        <section className="settings-panel settings-presets-panel" aria-label="Administrar presets">
          <div className="settings-preset-toolbar">
            <span className="settings-panel-count">{presetItems.length} presets</span>
            <div className="settings-panel-header-actions">
              {cloudPresetDefaults.length ? (
                <button
                  type="button"
                  className="settings-icon-button"
                  disabled={Boolean(busyAction)}
                  onClick={() => void importCloudPresetDefaults()}
                  aria-label="Importar valores disponibles"
                  title="Importar valores disponibles"
                >
                  <SettingsIcon name="download" />
                </button>
              ) : null}
              <button
                type="button"
                className="settings-icon-button"
                disabled={Boolean(busyAction) || !settingsAccess.canEditPresets}
                onClick={addPreset}
                aria-label="Agregar preset"
                title="Agregar preset"
              >
                <SettingsIcon name="plus" />
              </button>
            </div>
          </div>

          {!settingsAccess.canViewPresets ? (
            <div className="settings-hotkey-editor-feedback" data-tone="warning" aria-live="polite">
              <strong>Los presets no están disponibles para esta cuenta.</strong>
            </div>
          ) : null}

          <div className="settings-preset-admin-grid">
            {presetItems.length ? (
              <div className="settings-preset-admin-list" aria-label="Lista de presets">
                {presetItems.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="settings-preset-row"
                    data-selected={preset.id === selectedPreset?.id}
                    onClick={() => selectPresetForEditing(preset.id)}
                  >
                    <strong>{preset.name}</strong>
                    <span className="settings-preset-row-meta">
                      <kbd>{preset.pickerKey}</kbd>
                      <span data-enabled={preset.enabled !== false}>{preset.enabled === false ? "Desactivado" : "Activado"}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="settings-preset-empty">
                <strong>No hay presets.</strong>
                <span>Agregá uno para usarlo con Alt+Q.</span>
              </div>
            )}

            {selectedPreset ? (
              <section className="settings-preset-editor" aria-labelledby="settings-preset-editor-title">
                <header className="settings-preset-editor-header">
                  <div>
                    <h3 id="settings-preset-editor-title">{selectedPreset.name}</h3>
                  </div>
                  <div className="settings-preset-editor-icon-actions">
                    <button
                      type="button"
                      className="settings-icon-button"
                      disabled={Boolean(busyAction) || !settingsAccess.canEditPresets}
                      onClick={duplicateSelectedPreset}
                      aria-label="Duplicar preset"
                      title="Duplicar preset"
                    >
                      <SettingsIcon name="copy" />
                    </button>
                    <button
                      type="button"
                      className="settings-icon-button settings-icon-button-danger"
                      disabled={Boolean(busyAction) || !settingsAccess.canEditPresets}
                      onClick={deleteSelectedPreset}
                      aria-label="Eliminar preset"
                      title="Eliminar preset"
                    >
                      <SettingsIcon name="trash" />
                    </button>
                  </div>
                </header>

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
                    <span>Tecla</span>
                    <input
                      value={presetPickerKeyDraft}
                      maxLength={1}
                      disabled={!settingsAccess.canEditPresets}
                      onChange={(event) => setPresetPickerKeyDraft(event.target.value.toUpperCase().slice(0, 1))}
                      aria-label="Tecla del selector del preset"
                    />
                  </label>
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

                <div className="settings-preset-options">
                  <div className="settings-preset-option" title="Si lo desactivás, deja de aparecer en Alt+Q.">
                    <strong>Disponible en Alt+Q</strong>
                    <button
                      type="button"
                      className="settings-toggle"
                      role="switch"
                      aria-label="Disponible en Alt+Q"
                      aria-checked={presetEnabledDraft}
                      disabled={!settingsAccess.canEditPresets}
                      onClick={() => setPresetEnabledDraft(!presetEnabledDraft)}
                    />
                  </div>
                  <div className="settings-preset-option" title="Solicita confirmación antes de ejecutar este preset.">
                    <strong>Pedir confirmación</strong>
                    <button
                      type="button"
                      className="settings-toggle"
                      role="switch"
                      aria-label="Pedir confirmación"
                      aria-checked={presetConfirmDraft}
                      disabled={!settingsAccess.canEditPresets}
                      onClick={() => setPresetConfirmDraft(!presetConfirmDraft)}
                    />
                  </div>
                </div>

                <label className="settings-preset-field">
                  <span>Instrucción</span>
                  <textarea
                    className="settings-preset-textarea"
                    value={presetDraft}
                    disabled={!settingsAccess.canEditPresets}
                    onChange={(event) => setPresetDraft(event.target.value)}
                    spellCheck={false}
                    aria-label="Instrucción del preset"
                  />
                </label>

                <footer className="settings-preset-editor-footer">
                  <div className="settings-hotkey-editor-feedback" data-tone={presetNotice.tone} aria-live="polite">
                    <strong>{presetDraftChanged ? "Cambios sin guardar" : presetNotice.tone === "idle" ? "Cambios guardados" : presetNotice.message}</strong>
                  </div>
                  <button
                    type="button"
                    className="settings-editor-button settings-editor-button-primary"
                    disabled={Boolean(busyAction) || !presetDraftChanged || !settingsAccess.canEditPresets}
                    onClick={savePresetDraft}
                  >
                    {busyAction === "preset" ? "Guardando" : "Guardar cambios"}
                  </button>
                </footer>
              </section>
            ) : null}
          </div>
        </section>
        ) : effectiveSection === "account" ? (
        <section className="settings-panel settings-cloud-panel" aria-labelledby="settings-account-title">
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
                <h3 id="settings-account-action-title">
                  {loginPending ? "Completá el inicio de sesión" : "Conectá tu cuenta"}
                </h3>
                <p>
                  {loginPending
                    ? "Terminá el proceso en el navegador. Esta pantalla se actualizará automáticamente cuando vuelvas."
                    : "Se abrirá Google en tu navegador. Cuando termines, volvé a Fixvox para continuar con la configuración."}
                </p>
              </div>
            </div>
            {!loginPending ? (
              <div className="settings-hotkey-editor-actions">
                <button
                  type="button"
                  className="settings-editor-button settings-editor-button-primary"
                  disabled={!tauriRuntime || Boolean(busyAction)}
                  onClick={() => void startCloudLogin()}
                >
                  {busyAction === "login" ? "Abriendo…" : loginSignedIn ? "Cambiar cuenta" : "Continuar con Google"}
                </button>
              </div>
            ) : null}
            {loginPending || cloudNotice.message ? (
              <div className="settings-hotkey-editor-feedback" data-tone={cloudNotice.tone} aria-live="polite">
                <strong>{loginPending ? "Esperando confirmación…" : cloudNotice.message}</strong>
                {loginPending ? <span>{cloudNotice.message}</span> : null}
              </div>
            ) : null}
          </section>
        </section>
        ) : effectiveSection === "advanced" ? (
        <section className="settings-panel settings-cloud-panel" aria-labelledby="settings-advanced-title">
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
                <strong>Diagnóstico local</strong>
                <span>Volvé a leer el estado guardado en esta computadora.</span>
              </div>
              <div className="settings-status-check-control">
                <button
                  type="button"
                  className="settings-editor-button settings-editor-button-secondary"
                  disabled={!tauriRuntime || Boolean(busyAction)}
                  onClick={() => void loadCloudStatus(true)}
                >
                  {busyAction === "status" ? "Comprobando…" : "Volver a comprobar"}
                </button>
                <small aria-live="polite">
                  {lastStatusCheckedAt ? `Última comprobación: ${lastStatusCheckedAt}` : "Todavía no comprobado"}
                </small>
              </div>
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
          {diagnosticNotice.message ? (
            <div className="settings-hotkey-editor-feedback" data-tone={diagnosticNotice.tone} aria-live="polite">
              <strong>{diagnosticNotice.message}</strong>
            </div>
          ) : null}
          {adminNotice.message ? (
            <div className="settings-hotkey-editor-feedback" data-tone={adminNotice.tone} aria-live="polite">
              <strong>{adminNotice.message}</strong>
            </div>
          ) : null}
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
