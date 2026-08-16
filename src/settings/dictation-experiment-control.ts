import { invoke, isTauri } from "@tauri-apps/api/core";
import type { DictationMode } from "./user-preferences-control";

export type DictationModeCatalogItem = Readonly<{
  mode: DictationMode;
  label: string;
  summary: string;
  postProcessEnabled: boolean;
  experimental: boolean;
  literal: boolean;
}>;

export const defaultDictationModeCatalog: readonly DictationModeCatalogItem[] = Object.freeze([
  Object.freeze({
    mode: "profile",
    label: "Según mi perfil",
    summary: "Usa el comportamiento publicado para tu cuenta o dispositivo.",
    postProcessEnabled: false,
    experimental: false,
    literal: false,
  }),
  Object.freeze({
    mode: "fast",
    label: "Rápido",
    summary: "Entrega el texto reconocido sin limpieza adicional.",
    postProcessEnabled: false,
    experimental: false,
    literal: true,
  }),
  Object.freeze({
    mode: "safeCleanup",
    label: "Limpieza segura",
    summary: "Limpia el dictado con una revisión conservadora y vuelve al texto reconocido si hace falta.",
    postProcessEnabled: true,
    experimental: false,
    literal: false,
  }),
  Object.freeze({
    mode: "complete",
    label: "Completo",
    summary: "Combina reconocimiento y limpieza conservadora para dictados con más estructura.",
    postProcessEnabled: true,
    experimental: true,
    literal: false,
  }),
]);


function isDictationMode(value: unknown): value is DictationMode {
  return value === "profile"
    || value === "fast"
    || value === "safeCleanup"
    || value === "complete";
}

function normalizeDictationModeCatalog(value: unknown): readonly DictationModeCatalogItem[] {
  if (!Array.isArray(value)) {
    return defaultDictationModeCatalog;
  }
  const byMode: Partial<Record<DictationMode, DictationModeCatalogItem>> = {};
  for (const item of value) {
    if (
      !item
      || typeof item !== "object"
      || Array.isArray(item)
      || !("mode" in item)
      || !isDictationMode(item.mode)
    ) {
      continue;
    }
    const candidate = item as Record<string, unknown>;
    const mode = item.mode as DictationMode;
    const fallback = defaultDictationModeCatalog.find((entry) => entry.mode === mode);
    if (!fallback) continue;
    byMode[mode] = {
      ...fallback,
      label: typeof candidate.label === "string" && candidate.label.trim()
        ? candidate.label
        : fallback.label,
      summary: typeof candidate.summary === "string" && candidate.summary.trim()
        ? candidate.summary
        : fallback.summary,
      postProcessEnabled: typeof candidate.postProcessEnabled === "boolean"
        ? candidate.postProcessEnabled
        : fallback.postProcessEnabled,
      experimental: typeof candidate.experimental === "boolean"
        ? candidate.experimental
        : fallback.experimental,
      literal: typeof candidate.literal === "boolean" ? candidate.literal : fallback.literal,
    };
  }

  return defaultDictationModeCatalog.map((entry) => byMode[entry.mode] ?? entry);
}

export async function getDictationModeCatalog(): Promise<readonly DictationModeCatalogItem[]> {
  if (!isTauri()) return defaultDictationModeCatalog;
  try {
    return normalizeDictationModeCatalog(await invoke<unknown>("get_dictation_mode_catalog"));
  } catch {
    return defaultDictationModeCatalog;
  }
}

export const profileDefaultRecipeId = "profile-default-v1";
export const dailyLiteralRecipeId = "daily-literal-v1";
export const dailySafeCleanupRecipeId = "daily-safe-cleanup-v1";
export const dailyExperimentalRichRecipeId = "daily-experimental-rich-v1";

export type DictationExperimentRecipeId =
  | typeof profileDefaultRecipeId
  | typeof dailyLiteralRecipeId
  | typeof dailySafeCleanupRecipeId
  | typeof dailyExperimentalRichRecipeId;

export type DictationExperimentScope = "next-dictation" | "session";

export type DictationExperimentSelection = Readonly<{
  recipeId: DictationExperimentRecipeId;
  recipeVersion: "v1";
  scope: DictationExperimentScope;
}>;

export type DictationExperimentState = Readonly<{
  schemaVersion: 1;
  active: DictationExperimentSelection | null;
}>;

export type DictationExperimentRecipe = Readonly<{
  id: DictationExperimentRecipeId;
  version: "v1";
  label: string;
  summary: string;
  transcription: string;
  postprocess: string;
  safety: string;
}>;

export const dictationExperimentRecipes: readonly DictationExperimentRecipe[] = Object.freeze([
  Object.freeze({
    id: profileDefaultRecipeId,
    version: "v1",
    label: "Según mi perfil",
    summary: "Usa la configuración asignada a tu cuenta o dispositivo.",
    transcription: "Configuración asignada",
    postprocess: "Configuración asignada",
    safety: "Protección asignada",
  }),
  Object.freeze({
    id: dailyLiteralRecipeId,
    version: "v1",
    label: "Literal",
    summary: "Entrega el texto reconocido sin limpieza adicional. Sirve como control cotidiano.",
    transcription: "Reconocimiento actual",
    postprocess: "Apagado",
    safety: "Texto reconocido preservado",
  }),
  Object.freeze({
    id: dailySafeCleanupRecipeId,
    version: "v1",
    label: "Limpieza segura",
    summary: "Limpia el dictado y vuelve al texto reconocido si detecta un cambio inseguro.",
    transcription: "Igual que Literal",
    postprocess: "Limpieza activada",
    safety: "Fallback conservador",
  }),
  Object.freeze({
    id: dailyExperimentalRichRecipeId,
    version: "v1",
    label: "Experimental",
    summary: "Prueba instrucciones de reconocimiento más detalladas, sin limpieza posterior.",
    transcription: "Reconocimiento experimental",
    postprocess: "Apagado",
    safety: "Configuración de evaluación",
  }),
]);

export const defaultDictationExperimentState: DictationExperimentState = {
  schemaVersion: 1,
  active: null,
};

export function resolveDictationExperimentRecipe(
  recipeId: string | undefined,
): DictationExperimentRecipe {
  return dictationExperimentRecipes.find((recipe) => recipe.id === recipeId)
    ?? dictationExperimentRecipes[0];
}

export async function getDictationExperimentState(): Promise<DictationExperimentState> {
  if (!isTauri()) return defaultDictationExperimentState;
  return invoke<DictationExperimentState>("get_dictation_experiment_state");
}

export async function setDictationExperimentSelection(
  recipeId: DictationExperimentRecipeId,
  scope: DictationExperimentScope,
): Promise<DictationExperimentState> {
  const recipe = resolveDictationExperimentRecipe(recipeId);
  if (!isTauri()) {
    return recipe.id === profileDefaultRecipeId
      ? defaultDictationExperimentState
      : { schemaVersion: 1, active: { recipeId: recipe.id, recipeVersion: recipe.version, scope } };
  }
  return invoke<DictationExperimentState>("set_dictation_experiment_selection", {
    selection: { recipeId: recipe.id, recipeVersion: recipe.version, scope },
  });
}

export function summarizeDictationExperimentState(state: DictationExperimentState): string {
  if (!state.active) return "Se usa la configuración asignada a tu perfil.";
  const recipe = resolveDictationExperimentRecipe(state.active.recipeId);
  return state.active.scope === "next-dictation"
    ? `${recipe.label} se usará una vez y después volverá a tu perfil.`
    : `${recipe.label} seguirá activo hasta que lo cambies o cierres Dictation.`;
}
