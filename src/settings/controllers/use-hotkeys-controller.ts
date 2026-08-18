import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  applyTauriActionHotkeyRegistration,
  applyTauriHotkeyRegistration,
  getTauriActionHotkeyConfig,
  previewTauriActionHotkeyRegistration,
  previewTauriHotkeyRegistration,
  type TauriActionHotkeyConfig,
  type TauriActionHotkeyId,
  type TauriActionHotkeyRegistrationApplyResult,
  type TauriActionHotkeyRegistrationPreview,
  type TauriGlobalHotkeyConfig,
  type TauriHotkeyRegistrationApplyResult,
  type TauriHotkeyRegistrationPreview,
} from "../../desktop-control/tauri-host-control";
import { formatHotkeyEditReason } from "../hotkey-edit-copy";

const HOST_HOTKEY_CAPTURE_EVENT = "desktop-control://hotkey-capture";
const DEFAULT_DICTATION_SHORTCUT = "Alt+Space";
const DEFAULT_ACTION_HOTKEYS: TauriActionHotkeyConfig = {
  schemaVersion: 1,
  presetPicker: "Alt+Q",
  pasteLastSafe: "Alt+Shift+X",
  stopSubmit: "Win+Space",
};

export type HotkeyTarget = "dictation" | TauriActionHotkeyId;
type CaptureTarget = HotkeyTarget | undefined;

type HostHotkeyCapturePayload = {
  source?: string;
  shortcut?: string;
};

export type HotkeyPreview = TauriHotkeyRegistrationPreview | TauriActionHotkeyRegistrationPreview;
export type HotkeyApplyResult = TauriHotkeyRegistrationApplyResult | TauriActionHotkeyRegistrationApplyResult;
export type HotkeyControllerState = "idle" | "loading" | "capturing" | "previewing" | "applying" | "error";

export type HotkeyBinding = {
  id: HotkeyTarget;
  label: string;
  description: string;
  shortcut: string;
  candidate?: string;
  preview?: HotkeyPreview;
  applyResult?: HotkeyApplyResult;
  state: HotkeyControllerState;
  error?: string;
};

export type HotkeysController = {
  bindings: HotkeyBinding[];
  captureTarget?: HotkeyTarget;
  dirty: boolean;
  loading: boolean;
  startCapture: (target: HotkeyTarget) => Promise<void>;
  apply: (target: HotkeyTarget) => Promise<boolean>;
  cancel: (target: HotkeyTarget) => void;
};

export function hotkeyPreviewMessage(preview: HotkeyPreview): string {
  if (preview.canApply) {
    return `Disponible: ${preview.normalizedShortcut}.`;
  }
  return formatHotkeyEditReason(preview.reason);
}

export function useHotkeysController(enabled: boolean): HotkeysController {
  const [dictationShortcut, setDictationShortcut] = useState(DEFAULT_DICTATION_SHORTCUT);
  const [actionHotkeys, setActionHotkeys] = useState(DEFAULT_ACTION_HOTKEYS);
  const [drafts, setDrafts] = useState<Partial<Record<HotkeyTarget, {
    candidate?: string;
    preview?: HotkeyPreview;
    applyResult?: HotkeyApplyResult;
    state: HotkeyControllerState;
    error?: string;
  }>>>({});
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget>();
  const [loading, setLoading] = useState(enabled);
  const captureTargetRef = useRef<CaptureTarget | undefined>(undefined);
  const disposedRef = useRef(false);
  const previewVersionRef = useRef<Partial<Record<HotkeyTarget, number>>>({});

  const setDraft = useCallback((target: HotkeyTarget, patch: Partial<NonNullable<typeof drafts[HotkeyTarget]>>) => {
    setDrafts((previous) => ({
      ...previous,
      [target]: { ...previous[target], ...patch },
    }));
  }, []);

  const disableCapture = useCallback(async () => {
    captureTargetRef.current = undefined;
    setCaptureTarget(undefined);
    if (enabled) {
      await invoke<boolean>("set_desktop_control_hotkey_capture_enabled", { enabled: false }).catch(() => undefined);
    }
  }, [enabled]);

  const previewCandidate = useCallback(async (target: HotkeyTarget, requestedShortcut: string) => {
    const version = (previewVersionRef.current[target] ?? 0) + 1;
    previewVersionRef.current[target] = version;
    setDraft(target, { candidate: requestedShortcut, preview: undefined, error: undefined, state: "previewing" });

    try {
      const preview = target === "dictation"
        ? await previewTauriHotkeyRegistration(requestedShortcut)
        : await previewTauriActionHotkeyRegistration(target, requestedShortcut);
      if (disposedRef.current || previewVersionRef.current[target] !== version) {
        return;
      }
      if (!preview) {
        setDraft(target, {
          preview: undefined,
          state: "error",
          error: formatHotkeyEditReason("tauri_runtime_unavailable"),
        });
        return;
      }
      setDraft(target, {
        candidate: preview.normalizedShortcut || requestedShortcut,
        preview,
        state: "idle",
        error: undefined,
      });
    } catch (error) {
      if (!disposedRef.current && previewVersionRef.current[target] === version) {
        setDraft(target, { state: "error", error: formatHotkeyEditReason(error) });
      }
    }
  }, [setDraft]);

  const receiveCapture = useCallback(async (shortcut: string) => {
    const target = captureTargetRef.current;
    if (!target || !shortcut) {
      return;
    }
    await disableCapture();
    if (shortcut === "Escape") {
      setDraft(target, { candidate: undefined, preview: undefined, applyResult: undefined, state: "idle", error: undefined });
      return;
    }
    await previewCandidate(target, shortcut);
  }, [disableCapture, previewCandidate, setDraft]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    disposedRef.current = false;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const load = async () => {
      setLoading(true);
      const [dictation, actions] = await Promise.allSettled([
        invoke<TauriGlobalHotkeyConfig>("get_desktop_control_hotkey_config"),
        getTauriActionHotkeyConfig(),
      ]);
      if (disposed || disposedRef.current) {
        return;
      }
      if (dictation.status === "fulfilled" && dictation.value.shortcut) {
        setDictationShortcut(dictation.value.shortcut);
      }
      if (actions.status === "fulfilled" && actions.value) {
        setActionHotkeys(actions.value);
      }
      setLoading(false);
    };

    void load();
    void listen<HostHotkeyCapturePayload>(HOST_HOTKEY_CAPTURE_EVENT, (event) => {
      const shortcut = event.payload?.shortcut;
      if (!disposed && shortcut) {
        void receiveCapture(shortcut);
      }
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    });

    return () => {
      disposed = true;
      disposedRef.current = true;
      unlisten?.();
      captureTargetRef.current = undefined;
      setCaptureTarget(undefined);
      void invoke<boolean>("set_desktop_control_hotkey_capture_enabled", { enabled: false }).catch(() => undefined);
    };
  }, [enabled, receiveCapture]);

  const startCapture = useCallback(async (target: HotkeyTarget) => {
    if (!enabled || captureTargetRef.current) {
      return;
    }
    captureTargetRef.current = target;
    setCaptureTarget(target);
    setDraft(target, { candidate: undefined, state: "capturing", error: undefined, preview: undefined, applyResult: undefined });
    try {
      await invoke<boolean>("set_desktop_control_hotkey_capture_enabled", { enabled: true });
    } catch (error) {
      captureTargetRef.current = undefined;
      setCaptureTarget(undefined);
      setDraft(target, { state: "error", error: formatHotkeyEditReason(error) });
    }
  }, [enabled, setDraft]);

  const apply = useCallback(async (target: HotkeyTarget) => {
    const getActionShortcut = (actionTarget: Exclude<HotkeyTarget, "dictation">) => {
      switch (actionTarget) {
        case "preset_picker":
          return actionHotkeys.presetPicker;
        case "paste_last_safe":
          return actionHotkeys.pasteLastSafe;
        case "stop_submit":
          return actionHotkeys.stopSubmit;
      }
    };
    const binding = target === "dictation"
      ? dictationShortcut
      : getActionShortcut(target);
    const candidate = drafts[target]?.candidate;
    const preview = drafts[target]?.preview;
    if (!enabled || !candidate || candidate === binding || !preview?.canApply) {
      return false;
    }
    setDraft(target, { state: "applying", error: undefined });
    try {
      if (target === "dictation") {
        const result = await applyTauriHotkeyRegistration(candidate);
        if (!result) {
          setDraft(target, { state: "error", error: formatHotkeyEditReason("tauri_runtime_unavailable") });
          return false;
        }
        setDictationShortcut(result.effectiveConfig.shortcut);
        setDraft(target, {
          candidate: undefined,
          preview: result.preview,
          applyResult: result,
          state: result.error ? "error" : "idle",
          error: result.error ? formatHotkeyEditReason(result.error) : undefined,
        });
        return !result.error;
      }

      const result = await applyTauriActionHotkeyRegistration(target, candidate);
      if (!result) {
        setDraft(target, { state: "error", error: formatHotkeyEditReason("tauri_runtime_unavailable") });
        return false;
      }
      setActionHotkeys(result.effectiveConfig);
      setDraft(target, {
        candidate: undefined,
        preview: result.preview,
        applyResult: result,
        state: result.error ? "error" : "idle",
        error: result.error ? formatHotkeyEditReason(result.error) : undefined,
      });
      return !result.error;
    } catch (error) {
      setDraft(target, { state: "error", error: formatHotkeyEditReason(error) });
      return false;
    }
  }, [actionHotkeys, dictationShortcut, drafts, enabled, setDraft]);

  const cancel = useCallback((target: HotkeyTarget) => {
    if (captureTargetRef.current === target) {
      void disableCapture();
    }
    previewVersionRef.current[target] = (previewVersionRef.current[target] ?? 0) + 1;
    setDraft(target, { candidate: undefined, preview: undefined, applyResult: undefined, state: "idle", error: undefined });
  }, [disableCapture, setDraft]);

  const bindings = useMemo<HotkeyBinding[]>(() => [
    {
      id: "dictation",
      label: "Tecla de dictado",
      description: "Inicia o mantiene la captura. El sistema administra este atajo.",
      shortcut: dictationShortcut,
      ...drafts.dictation,
      state: drafts.dictation?.state ?? "idle",
    },
    {
      id: "preset_picker",
      label: "Selector de acciones",
      description: "Abre el selector de acciones disponibles.",
      shortcut: actionHotkeys.presetPicker,
      ...drafts.preset_picker,
      state: drafts.preset_picker?.state ?? "idle",
    },
    {
      id: "paste_last_safe",
      label: "Pegar el último resultado",
      description: "Pega de forma segura el resultado más reciente.",
      shortcut: actionHotkeys.pasteLastSafe,
      ...drafts.paste_last_safe,
      state: drafts.paste_last_safe?.state ?? "idle",
    },
    {
      id: "stop_submit",
      label: "Detener y enviar",
      description: "Finaliza una captura iniciada con la tecla de dictado y envía Enter después de entregar el resultado.",
      shortcut: actionHotkeys.stopSubmit,
      ...drafts.stop_submit,
      state: drafts.stop_submit?.state ?? "idle",
    },
  ], [actionHotkeys, dictationShortcut, drafts]);
  const dirty = bindings.some((binding) => Boolean(binding.candidate && binding.candidate !== binding.shortcut));

  return { bindings, captureTarget, dirty, loading, startCapture, apply, cancel };
}