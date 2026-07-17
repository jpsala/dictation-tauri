export const BUILTIN_CATALOG_VERSION = "1" as const;

export type BuiltinCatalogKind = "profile" | "variant" | "engine" | "prompt" | "default";

export type BuiltinCatalogItem = Readonly<{
  id: string;
  kind: BuiltinCatalogKind;
  /** Internal-only static text; intentionally excluded from manifests. */
  promptBody?: string;
}>;

export type BuiltinCatalog = Readonly<{
  version: string;
  items: readonly BuiltinCatalogItem[];
}>;

export type BuiltinCatalogManifest = Readonly<{
  version: string;
  counts: Readonly<Record<BuiltinCatalogKind, number>>;
  ids: Readonly<Record<BuiltinCatalogKind, readonly string[]>>;
  hashes: Readonly<Record<BuiltinCatalogKind, string>>;
}>;

export type BuiltinEngineKind = "transcription" | "postprocess" | "selectionTransform";
export type BuiltinEngine = Readonly<{
  id: string;
  label: string;
  kind: BuiltinEngineKind;
  tier: string;
  provider: string;
  model: string;
  enabled: boolean;
  notes: string;
  promptKey: string;
  promptSummary: string;
  source: "built-in";
}>;

export const BUILTIN_ENGINES: readonly BuiltinEngine[] = Object.freeze(([
  { id: "stt-off", label: "STT off", kind: "transcription", tier: "off", provider: "none", model: "off", enabled: false, notes: "No usa transcripción managed.", promptKey: "none", promptSummary: "Sin prompt.", source: "built-in" },
  { id: "stt-groq-whisper-turbo", label: "Groq Whisper Turbo", kind: "transcription", tier: "balanced", provider: "groq", model: "whisper-large-v3-turbo", enabled: true, notes: "Default histórico de Fixvox: mejor balance calidad/precio/velocidad para dictado managed.", promptKey: "transcriptBase", promptSummary: "Español rioplatense técnico; conserva comandos, URLs, modelos, archivos y puntuación hablada literal.", source: "built-in" },
  { id: "postprocess-off", label: "Postprocess off", kind: "postprocess", tier: "off", provider: "none", model: "off", enabled: false, notes: "Sin post-proceso managed.", promptKey: "none", promptSummary: "Sin prompt.", source: "built-in" },
  { id: "postprocess-groq-gpt-oss-120b", label: "Groq GPT-OSS 120B post", kind: "postprocess", tier: "balanced", provider: "groq", model: "openai/gpt-oss-120b", enabled: true, notes: "Default histórico de post-proceso: buena calidad/precio/velocidad para cleanup bilingüe.", promptKey: "postProcessBase", promptSummary: "Limpia dictado español/bilingüe con cambios mínimos; reconstruye tokens técnicos y listas cuando está claro.", source: "built-in" },
  { id: "transform-off", label: "Transform off", kind: "selectionTransform", tier: "off", provider: "none", model: "off", enabled: false, notes: "Sin transformación de selección managed.", promptKey: "none", promptSummary: "Sin prompt.", source: "built-in" },
  { id: "transform-groq-llama-70b", label: "Groq Llama 70B transform", kind: "selectionTransform", tier: "balanced", provider: "groq", model: "llama-3.3-70b-versatile", enabled: true, notes: "Default histórico para traducción/transformación de selección.", promptKey: "selectionTransformBase", promptSummary: "Reescribe el texto seleccionado según la instrucción del usuario preservando intención y formato.", source: "built-in" },
  { id: "translate-groq-llama-70b", label: "Groq Llama 70B translate", kind: "selectionTransform", tier: "balanced", provider: "groq", model: "llama-3.3-70b-versatile", enabled: true, notes: "Ruta histórica de traducción natural/fiel.", promptKey: "translateBase", promptSummary: "Traduce de forma fiel y natural, preservando significado, tono e intención.", source: "built-in" },
  { id: "assistant-groq-8b-instant", label: "Groq 8B assistant", kind: "postprocess", tier: "cheap", provider: "groq", model: "llama-3.1-8b-instant", enabled: true, notes: "Ruta histórica barata/rápida para assistant/default targets; disponible para profiles económicos.", promptKey: "assistant.quickChat", promptSummary: "Prompt base vacío en política actual; útil para respuestas rápidas de bajo costo.", source: "built-in" },
  { id: "postprocess-openrouter-premium", label: "OpenRouter post premium", kind: "postprocess", tier: "premium", provider: "openrouter", model: "anthropic/claude-sonnet-4", enabled: true, notes: "Opción premium editable para cuentas habilitadas; no era el default histórico.", promptKey: "postProcessBase", promptSummary: "Mismo prompt de cleanup; modelo premium para mayor calidad cuando justifique costo.", source: "built-in" },
  { id: "transform-openrouter-premium", label: "OpenRouter transform premium", kind: "selectionTransform", tier: "premium", provider: "openrouter", model: "anthropic/claude-sonnet-4", enabled: true, notes: "Opción premium editable para transformación/traducción avanzada; no era el default histórico.", promptKey: "selectionTransformBase", promptSummary: "Mismo prompt de transformación; modelo premium para casos habilitados.", source: "built-in" },
] satisfies readonly BuiltinEngine[]).map((engine) => Object.freeze(engine)));

export function validateBuiltinEngines(engines: readonly BuiltinEngine[] = BUILTIN_ENGINES): void {
  const ids = new Set<string>();
  for (const engine of engines) {
    ensurePublicId(engine.id);
    if (ids.has(engine.id)) throw new Error(`builtin_engine_duplicate_id:${engine.id}`);
    if (!engine.label || !engine.provider || !engine.model || !engine.promptKey) throw new Error(`builtin_engine_invalid:${engine.id}`);
    ids.add(engine.id);
  }
}

export function builtinEngineCatalog(): BuiltinCatalog {
  validateBuiltinEngines();
  return { version: BUILTIN_CATALOG_VERSION, items: BUILTIN_ENGINES.map((engine) => ({ id: engine.id, kind: "engine" as const })) };
}

export type BuiltinPromptKind = BuiltinEngineKind | "assistant";
export type BuiltinPrompt = Readonly<{ id: string; label: string; kind: BuiltinPromptKind; version: string; summary: string; body: string; enabled: boolean; source: "built-in" }>;

const BUILTIN_PROMPT_DEFINITIONS: readonly Omit<BuiltinPrompt, "enabled">[] = [] = [
  { id: "none", label: "Sin prompt", kind: "assistant", version: "v1", summary: "No aplica prompt de sistema.", body: "", source: "built-in" },
  { id: "transcriptBase", label: "Transcript base", kind: "transcription", version: "v1", summary: "Español rioplatense técnico; conserva comandos, URLs, modelos, archivos y puntuación hablada literal.", body: "Transcribe el audio con precisión. Mantén español rioplatense cuando corresponda, conserva términos técnicos, nombres de modelos, URLs, comandos, paths y puntuación hablada cuando sea claramente intencional.", source: "built-in" },
  { id: "postProcessBase", label: "Post-process base", kind: "postprocess", version: "v1", summary: "Limpia dictado español/bilingüe con cambios mínimos; reconstruye tokens técnicos y listas cuando está claro.", body: "Limpia el dictado manteniendo el significado. Corrige errores evidentes de STT, reconstruye términos técnicos, puntuación y listas cuando sea claro. No agregues explicaciones ni cambies intención.", source: "built-in" },
  { id: "selectionTransformBase", label: "Selection transform base", kind: "selectionTransform", version: "v1", summary: "Reescribe el texto seleccionado según la instrucción del usuario preservando intención y formato.", body: "Aplica la instrucción del usuario al texto seleccionado. Devuelve solo el texto final transformado. Preserva formato, intención y tono salvo que la instrucción pida lo contrario.", source: "built-in" },
  { id: "translateBase", label: "Translate base", kind: "selectionTransform", version: "v1", summary: "Traduce de forma fiel y natural, preservando significado, tono e intención.", body: "Traduce el texto de forma fiel y natural. Conserva significado, tono, formato y términos técnicos. Devuelve solo la traducción.", source: "built-in" },
  { id: "preset.como-yo-es", label: "Preset · Como yo (español)", kind: "selectionTransform", version: "v1", summary: "Starter Fixvox para reescribir como JP en español/voseo, preservando estructura y ritmo.", body: "Reescribí este texto como lo escribiría JP, un developer argentino. Hacé correcciones muy menores solamente. Preservá la estructura, las palabras y el ritmo. Usá voseo argentino, mezcla natural de español e inglés técnico y devolvé solo el texto final, sin explicaciones.", source: "built-in" },
  { id: "preset.corregir-texto", label: "Preset · Corregir texto", kind: "selectionTransform", version: "v1", summary: "Starter Fixvox para corregir gramática, ortografía y claridad sin cambiar estilo.", body: "Corregí la gramática, ortografía y claridad. Mantené el significado y estilo. Devolvé solo el texto corregido, sin explicaciones.", source: "built-in" },
  { id: "preset.fix-writing", label: "Preset · Fix Writing", kind: "selectionTransform", version: "v1", summary: "Starter Fixvox para corregir writing en inglés preservando tono e idioma.", body: "Fix grammar, spelling, and clarity in the following text. Keep the original tone and language. Return only the corrected text, no explanations.", source: "built-in" },
  { id: "preset.like-me-en", label: "Preset · Like me (English)", kind: "selectionTransform", version: "v1", summary: "Starter Fixvox para reescribir/traducir al inglés estilo JP, no nativo, directo y conversacional.", body: "Rewrite this text as JP would write it in English. Always return English text. Preserve meaning, structure, wording choices and rhythm as much as possible. Make only minor fixes when clearly wrong. Return only the fixed text, no explanations.", source: "built-in" },
  { id: "assistant.quickChat", label: "Assistant quick chat", kind: "assistant", version: "v1", summary: "Respuesta rápida de bajo costo para assistant/default targets.", body: "Respondé de forma breve, útil y directa.", source: "built-in" },
] as const;
export const BUILTIN_PROMPTS: readonly BuiltinPrompt[] = Object.freeze(BUILTIN_PROMPT_DEFINITIONS.map((prompt) => Object.freeze({ ...prompt, enabled: true })));

export function validateBuiltinPrompts(prompts: readonly BuiltinPrompt[] = BUILTIN_PROMPTS): void {
  const ids = new Set<string>();
  for (const prompt of prompts) {
    ensurePublicId(prompt.id);
    if (!/^v[0-9]+$/.test(prompt.version) || !prompt.label || !prompt.summary) throw new Error(`builtin_prompt_invalid:${prompt.id}`);
    if (ids.has(prompt.id)) throw new Error(`builtin_prompt_duplicate_id:${prompt.id}`);
    ids.add(prompt.id);
  }
}

export function builtinPromptCatalog(): BuiltinCatalog {
  validateBuiltinPrompts();
  return { version: BUILTIN_CATALOG_VERSION, items: BUILTIN_PROMPTS.map((prompt) => ({ id: prompt.id, kind: "prompt" as const })) };
}

export type BuiltinVariant = Readonly<{ id: string; label: string; description: string; preset: string; effects: readonly string[]; engineIds: readonly string[]; enabled: boolean; source: "built-in" }>;

export const BUILTIN_VARIANTS: readonly BuiltinVariant[] = Object.freeze(([
  { id: "owner", label: "Owner", description: "acceso owner y cambios rápidos", preset: "access", effects: ["adminAccess: elevated", "safeMutations: allowedWithConfirmation"], engineIds: [], enabled: true, source: "built-in" },
  { id: "friend", label: "Amigo", description: "usuario cercano para pruebas manuales", preset: "manualTesting", effects: ["rollout: manual", "feedbackPriority: high"], engineIds: [], enabled: true, source: "built-in" },
  { id: "tester", label: "Tester", description: "recibe variantes en prueba", preset: "manualTesting", effects: ["rollout: manual", "feedbackPriority: high"], engineIds: [], enabled: true, source: "built-in" },
  { id: "trial", label: "Trial", description: "usuario en prueba controlada", preset: "trial", effects: ["quotaTier: trial", "advancedSettings: limited"], engineIds: [], enabled: true, source: "built-in" },
  { id: "debug-tools", label: "Debug tools", description: "muestra herramientas/debug avanzado", preset: "debug", effects: ["showDebugTools: true", "verboseDiagnostics: true"], engineIds: [], enabled: true, source: "built-in" },
  { id: "best-voice", label: "Best voice", description: "prioriza calidad de voz y post-proceso", preset: "voiceQuality", effects: ["voiceMode: best", "postProcess: on"], engineIds: [], enabled: true, source: "built-in" },
  { id: "cheap-model", label: "Cheap model", description: "prioriza costo bajo", preset: "lowCost", effects: ["modelTier: low-cost", "postProcess: minimal"], engineIds: [], enabled: true, source: "built-in" },
  { id: "new-ui", label: "New UI", description: "habilita variantes nuevas de UI", preset: "newUi", effects: ["uiVariant: next", "showAdvancedSettings: true"], engineIds: [], enabled: true, source: "built-in" },
  { id: "private-alpha", label: "Private alpha", description: "features alpha privadas", preset: "privateAlpha", effects: ["alphaFeatures: private", "requiresManualReview: true"], engineIds: [], enabled: true, source: "built-in" },
] satisfies readonly BuiltinVariant[]).map((variant) => Object.freeze({ ...variant, effects: Object.freeze([...variant.effects]), engineIds: Object.freeze([...variant.engineIds]) })));

export function validateBuiltinVariants(variants: readonly BuiltinVariant[] = BUILTIN_VARIANTS, engines: readonly BuiltinEngine[] = BUILTIN_ENGINES): void {
  const ids = new Set<string>();
  const engineIds = new Set(engines.map((engine) => engine.id));
  for (const variant of variants) {
    ensurePublicId(variant.id);
    if (!variant.label || !variant.description || !variant.preset || !variant.enabled) throw new Error(`builtin_variant_invalid:${variant.id}`);
    if (ids.has(variant.id)) throw new Error(`builtin_variant_duplicate_id:${variant.id}`);
    if (variant.engineIds.some((engineId) => !engineIds.has(engineId))) throw new Error(`builtin_variant_unknown_engine:${variant.id}`);
    ids.add(variant.id);
  }
}

export function builtinVariantCatalog(): BuiltinCatalog {
  validateBuiltinVariants();
  return { version: BUILTIN_CATALOG_VERSION, items: BUILTIN_VARIANTS.map((variant) => ({ id: variant.id, kind: "variant" as const })) };
}

const KINDS: readonly BuiltinCatalogKind[] = ["profile", "variant", "engine", "prompt", "default"];

function ensurePublicId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error(`builtin_catalog_invalid_id:${value}`);
  return value;
}

/** Validates stable public identities without reading or exposing prompt bodies. */
export function validateBuiltinCatalog(catalog: BuiltinCatalog): void {
  if (!catalog.version.trim()) throw new Error("builtin_catalog_version_required");
  const seen = new Set<string>();
  for (const item of catalog.items) {
    const key = `${item.kind}:${ensurePublicId(item.id)}`;
    if (seen.has(key)) throw new Error(`builtin_catalog_duplicate_id:${key}`);
    seen.add(key);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort((left, right) => left.localeCompare(right)).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Safe, deterministic catalog receipt. It deliberately hashes public kind/ID
 * lists only: prompt bodies and any accidental sensitive fields cannot enter it.
 */
export async function createBuiltinCatalogManifest(catalog: BuiltinCatalog): Promise<BuiltinCatalogManifest> {
  validateBuiltinCatalog(catalog);
  const ids = Object.fromEntries(KINDS.map((kind) => [kind, catalog.items
    .reduce<string[]>((result, item) => item.kind === kind ? [...result, item.id] : result, [])
    .sort((left, right) => left.localeCompare(right))])) as Record<BuiltinCatalogKind, string[]>;
  const hashes = Object.fromEntries(await Promise.all(KINDS.map(async (kind) => [kind, await sha256(stableJson({ kind, ids: ids[kind] }))] as const))) as Record<BuiltinCatalogKind, string>;
  const counts = Object.fromEntries(KINDS.map((kind) => [kind, ids[kind].length])) as Record<BuiltinCatalogKind, number>;
  return Object.freeze({ version: catalog.version, counts: Object.freeze(counts), ids: Object.freeze(ids), hashes: Object.freeze(hashes) });
}
