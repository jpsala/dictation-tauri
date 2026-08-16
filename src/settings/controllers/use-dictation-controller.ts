import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  defaultDictationExperimentState,
  defaultDictationModeCatalog,
  getDictationExperimentState,
  getDictationModeCatalog,
  summarizeDictationExperimentState,
  type DictationExperimentState,
  type DictationModeCatalogItem,
} from "../dictation-experiment-control";

export type DictationLoadState = "idle" | "loading" | "ready" | "error";
export type DictationLaboratoryState = "idle" | "opening" | "opened" | "error";

export type DictationController = {
  catalog: readonly DictationModeCatalogItem[];
  experiment: DictationExperimentState;
  loadState: DictationLoadState;
  error?: string;
  laboratoryState: DictationLaboratoryState;
  laboratoryError?: string;
  openLaboratory: () => Promise<boolean>;
};

function formatLaboratoryError(error: unknown): string {
  const value = error && typeof error === "object" ? error as { code?: unknown } : {};
  if (value.code === "DICTATION_LAB_UNAUTHORIZED" || value.code === "admin_unauthorized") {
    return "El laboratorio requiere una sesión de escritorio vinculada a Control Room.";
  }
  if (value.code === "forbidden") {
    return "Tu sesión no tiene un rol habilitado para abrir el laboratorio.";
  }
  if (value.code === "DICTATION_LAB_CATALOG_INVALID") {
    return "El catálogo seguro del laboratorio no está disponible.";
  }
  return "No pudimos abrir Dictation Laboratory. Tu perfil y tus overrides no cambiaron.";
}

export function useDictationController(enabled: boolean): DictationController {
  const [catalog, setCatalog] = useState<readonly DictationModeCatalogItem[]>(defaultDictationModeCatalog);
  const [experiment, setExperiment] = useState<DictationExperimentState>(defaultDictationExperimentState);
  const [loadState, setLoadState] = useState<DictationLoadState>(enabled ? "loading" : "idle");
  const [error, setError] = useState<string>();
  const [laboratoryState, setLaboratoryState] = useState<DictationLaboratoryState>("idle");
  const [laboratoryError, setLaboratoryError] = useState<string>();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoadState("idle");
      setError(undefined);
      setExperiment(defaultDictationExperimentState);
      return () => {
        mountedRef.current = false;
      };
    }

    let disposed = false;
    setLoadState("loading");
    setError(undefined);
    void Promise.all([getDictationModeCatalog(), getDictationExperimentState()])
      .then(([nextCatalog, nextExperiment]) => {
        if (disposed) return;
        setCatalog(nextCatalog);
        setExperiment(nextExperiment);
        setLoadState("ready");
      })
      .catch(() => {
        if (disposed) return;
        setLoadState("error");
        setError("No pudimos leer la receta activa. Tu perfil sigue siendo la autoridad.");
        setExperiment(defaultDictationExperimentState);
      });

    return () => {
      disposed = true;
      mountedRef.current = false;
    };
  }, [enabled]);

  const openLaboratory = useCallback(async () => {
    if (!enabled || !mountedRef.current) return false;
    setLaboratoryState("opening");
    setLaboratoryError(undefined);
    try {
      await invoke("show_dictation_lab_window");
      if (!mountedRef.current) return true;
      setLaboratoryState("opened");
      return true;
    } catch (caughtError) {
      if (mountedRef.current) {
        setLaboratoryState("error");
        setLaboratoryError(formatLaboratoryError(caughtError));
      }
      return false;
    }
  }, [enabled]);

  return {
    catalog,
    experiment,
    loadState,
    error,
    laboratoryState,
    laboratoryError,
    openLaboratory,
  };
}

export { summarizeDictationExperimentState };
