import {
  EVALUATION_RECIPES,
  GATE_A_DEFINITION,
  POSTPROCESS_EVALUATION_RECIPES,
  type EvaluationRecipeId,
  type GateADefinition,
  type PostprocessEvaluationRecipeId,
} from "./evaluation-recipes.ts";

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
export type BuiltinEngineEffort = Readonly<{ id: string; label: string }>;
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
  supportedEfforts: readonly BuiltinEngineEffort[];
  defaultEffortId: string | null;
  source: "built-in";
}>;

export type LaboratoryAvailabilityReasonCode =
  | "authoritative_one_shot_grant_unavailable"
  | "laboratory_execution_unauthorized"
  | "laboratory_execution_definition_mismatch"
  | "laboratory_execution_source_incomplete"
  | "laboratory_execution_grant_expired"
  | "laboratory_execution_grant_mismatch"
  | "laboratory_execution_grant_reused"
  | "laboratory_execution_budget_exhausted"
  | "gate_b_unavailable"
  | "vocabulary_snapshot_unavailable"
  | "snapshot_prerequisite_unavailable"
  | "snapshot_not_found"
  | "snapshot_stale"
  | "snapshot_kind_not_allowlisted"
  | "snapshot_read_out_of_bounds";

export const LABORATORY_EXECUTION_ERROR_CODES = Object.freeze([
  "laboratory_execution_unauthorized",
  "laboratory_execution_definition_mismatch",
  "laboratory_execution_source_incomplete",
  "laboratory_execution_grant_expired",
  "laboratory_execution_grant_mismatch",
  "laboratory_execution_grant_reused",
  "laboratory_execution_budget_exhausted",
] as const);

export type LaboratoryAvailability = Readonly<{
  status: "available" | "partial" | "unavailable";
  reasonCode: LaboratoryAvailabilityReasonCode | null;
}>;
export type LaboratoryCompatibility = Readonly<{
  profileRuntimeKinds: readonly BuiltinEngineKind[];
  prosodyModes: readonly ("off" | "advisory")[];
  requiresVocabularySnapshot: boolean;
}>;

export type LaboratoryCatalogEntry = Readonly<{
  id: string;
  label: string;
  version: string;
  lifecycleStatus: "active" | "retired" | "experimental";
  availability: LaboratoryAvailability;
  executionModes: readonly ("provider-free-replay" | "provider-real")[];
  compatibility: LaboratoryCompatibility;
  profileMaterialization: Readonly<{
    engineId?: string;
    promptId?: string;
    defaults?: Readonly<Record<string, string | number | boolean>>;
  }> | null;
}>;

export type LaboratoryCatalog = Readonly<{
  schemaVersion: 1;
  revision: string;
  engines: readonly LaboratoryCatalogEntry[];
  prompts: readonly LaboratoryCatalogEntry[];
  sttRecipes: readonly (LaboratoryCatalogEntry & { id: EvaluationRecipeId })[];
  postprocessRecipes: readonly (LaboratoryCatalogEntry & { id: PostprocessEvaluationRecipeId })[];
  prosodyModes: readonly LaboratoryCatalogEntry[];
  vocabularyModes: readonly (LaboratoryCatalogEntry & {
    snapshotPrerequisite: Readonly<{
      required: boolean;
      immutableIdentityFields: readonly ["snapshotId", "revision", "sha256", "source"];
    }>;
  })[];
  materializations: readonly LaboratoryCatalogEntry[];
  providerAuthorization: Readonly<{
    status: "available" | "unavailable";
    reasonCode: LaboratoryAvailabilityReasonCode | null;
  }>;
}>;

export type LaboratoryResourceName =
  | "session"
  | "profiles"
  | "configuration"
  | "catalog"
  | "accounts"
  | "audit";

export type LaboratoryResourceState = Readonly<{
  resource: LaboratoryResourceName;
  availability: LaboratoryAvailability;
}>;

export type LaboratoryEffectiveIdentity = Readonly<{
  configured: Readonly<{ availability: LaboratoryAvailability; value: unknown | null; source: string | null }>;
  resolved: Readonly<{ availability: LaboratoryAvailability; value: unknown | null; source: string | null }>;
  observed: Readonly<{ availability: LaboratoryAvailability; value: unknown | null; source: string | null }>;
}>;

export type LaboratoryExecutionGrantRequest =
  | Readonly<{
      schemaVersion: 1;
      kind: "gate-a";
      definition: GateADefinition;
    }>
  | Readonly<{
      schemaVersion: 1;
      kind: "gate-b";
      sourceGateARunId: string;
    }>;

export type LaboratoryExecutionGrantResult =
  | Readonly<{
      ok: true;
      data: Readonly<{ grantToken: string }>;
    }>
  | Readonly<{
      ok: false;
      availability: Readonly<{
        status: "unavailable";
        reasonCode: LaboratoryAvailabilityReasonCode;
      }>;
    }>;

export type LaboratoryExecutionStartRequest = Readonly<{
  schemaVersion: 1;
  grantToken: string;
}>;

export type LaboratoryExecutionStartResult = Readonly<{
  ok: true;
  data: Readonly<{
    executionId: string;
    definitionHash: string;
    estimateHash: string;
    bounds: Readonly<{ maxRequests: number; maxCostUsd: number }>;
    expiresAt: string;
  }>;
}>;
export const LABORATORY_CANONICAL_RAW_REF_PATTERN = /^lraw_[a-f0-9]{64}$/;

export type LaboratoryRawEvidenceInput = Readonly<{
  sampleId: string;
  candidateId: "transcription-quality-v1-short-auto";
  sha256: string;
  byteLength: number;
}>;

export type LaboratoryExecutionCompletionRequest = Readonly<{
  schemaVersion: 1;
  kind: "gate-a";
  definitionHash: string;
  estimateHash: string;
  completedRequestCount: 12;
  rawEvidence: readonly [
    LaboratoryRawEvidenceInput,
    LaboratoryRawEvidenceInput,
    LaboratoryRawEvidenceInput,
  ];
}>;

export type LaboratoryCanonicalRawRef = Readonly<{
  sampleId: string;
  candidateId: "transcription-quality-v1-short-auto";
  rawRef: string;
}>;

export type LaboratoryExecutionCompletionResult = Readonly<{
  ok: true;
  data: Readonly<{
    executionId: string;
    status: "completed";
    completedRequestCount: 12;
    canonicalRawRefs: readonly [
      LaboratoryCanonicalRawRef,
      LaboratoryCanonicalRawRef,
      LaboratoryCanonicalRawRef,
    ];
    completedAt: string;
    idempotentReplay: boolean;
  }>;
}>;

export type LaboratoryExecutionAbortReason =
  | "spawn-failed"
  | "runner-failed"
  | "cancelled"
  | "source-invalid";

export type LaboratoryExecutionAbortRequest = Readonly<{
  schemaVersion: 1;
  reason: LaboratoryExecutionAbortReason;
}>;

export type LaboratoryExecutionAbortResult = Readonly<{
  ok: true;
  data: Readonly<{
    executionId: string;
    status: "aborted";
    reason: LaboratoryExecutionAbortReason;
    abortedAt: string;
    idempotentReplay: boolean;
  }>;
}>;


export const LABORATORY_EXECUTION_WIRE_EXAMPLES = Object.freeze({
  issueGateA: Object.freeze({
    schemaVersion: 1 as const,
    kind: "gate-a" as const,
    definition: GATE_A_DEFINITION,
  }),
  issueGateB: Object.freeze({
    schemaVersion: 1 as const,
    kind: "gate-b" as const,
    sourceGateARunId: "gate-a-run-id" as const,
  }),
  grant: Object.freeze({
    ok: true as const,
    data: Object.freeze({ grantToken: "opaque-token" as const }),
  }),
  consume: Object.freeze({
    schemaVersion: 1 as const,
    grantToken: "opaque-token" as const,
  }),
  completeGateA: Object.freeze({
    schemaVersion: 1 as const,
    kind: "gate-a" as const,
    definitionHash: "a".repeat(64),
    estimateHash: "b".repeat(64),
    completedRequestCount: 12 as const,
    rawEvidence: Object.freeze([
      Object.freeze({
        sampleId: GATE_A_DEFINITION.sampleIds[0],
        candidateId: "transcription-quality-v1-short-auto" as const,
        sha256: "c".repeat(64),
        byteLength: 1,
      }),
      Object.freeze({
        sampleId: GATE_A_DEFINITION.sampleIds[1],
        candidateId: "transcription-quality-v1-short-auto" as const,
        sha256: "d".repeat(64),
        byteLength: 1,
      }),
      Object.freeze({
        sampleId: GATE_A_DEFINITION.sampleIds[2],
        candidateId: "transcription-quality-v1-short-auto" as const,
        sha256: "e".repeat(64),
        byteLength: 1,
      }),
    ] as const),
  }),
  abort: Object.freeze({
    schemaVersion: 1 as const,
    reason: "runner-failed" as const,
  }),
});


const NO_REASONING_EFFORTS: readonly BuiltinEngineEffort[] = Object.freeze([]);
const STANDARD_REASONING_EFFORTS: readonly BuiltinEngineEffort[] = Object.freeze([
  Object.freeze({ id: "low", label: "Low" }),
  Object.freeze({ id: "medium", label: "Medium" }),
  Object.freeze({ id: "high", label: "High" }),
]);

export const BUILTIN_ENGINES: readonly BuiltinEngine[] = Object.freeze(([
  { id: "stt-off", label: "STT off", kind: "transcription", tier: "off", provider: "none", model: "off", enabled: false, notes: "No usa transcripción managed.", promptKey: "none", promptSummary: "Sin prompt.", supportedEfforts: NO_REASONING_EFFORTS, defaultEffortId: null, source: "built-in" },
  { id: "stt-groq-whisper-turbo", label: "Groq Whisper Turbo", kind: "transcription", tier: "balanced", provider: "groq", model: "whisper-large-v3-turbo", enabled: true, notes: "Default histórico de Fixvox: mejor balance calidad/precio/velocidad para dictado managed.", promptKey: "transcriptBase", promptSummary: "Español rioplatense técnico; conserva comandos, URLs, modelos, archivos y puntuación hablada literal.", supportedEfforts: NO_REASONING_EFFORTS, defaultEffortId: null, source: "built-in" },
  { id: "postprocess-off", label: "Postprocess off", kind: "postprocess", tier: "off", provider: "none", model: "off", enabled: false, notes: "Sin post-proceso managed.", promptKey: "none", promptSummary: "Sin prompt.", supportedEfforts: NO_REASONING_EFFORTS, defaultEffortId: null, source: "built-in" },
  { id: "postprocess-groq-gpt-oss-120b", label: "Groq GPT-OSS 120B post", kind: "postprocess", tier: "balanced", provider: "groq", model: "openai/gpt-oss-120b", enabled: true, notes: "Default histórico de post-proceso: buena calidad/precio/velocidad para cleanup bilingüe.", promptKey: "postProcessBase", promptSummary: "Limpia dictado español/bilingüe con cambios mínimos; reconstruye tokens técnicos y listas cuando está claro.", supportedEfforts: STANDARD_REASONING_EFFORTS, defaultEffortId: "medium", source: "built-in" },
  { id: "transform-off", label: "Transform off", kind: "selectionTransform", tier: "off", provider: "none", model: "off", enabled: false, notes: "Sin transformación de selección managed.", promptKey: "none", promptSummary: "Sin prompt.", supportedEfforts: NO_REASONING_EFFORTS, defaultEffortId: null, source: "built-in" },
  { id: "transform-groq-llama-70b", label: "Groq Llama 70B transform", kind: "selectionTransform", tier: "balanced", provider: "groq", model: "llama-3.3-70b-versatile", enabled: true, notes: "Default histórico para traducción/transformación de selección.", promptKey: "selectionTransformBase", promptSummary: "Reescribe el texto seleccionado según la instrucción del usuario preservando intención y formato.", supportedEfforts: NO_REASONING_EFFORTS, defaultEffortId: null, source: "built-in" },
  { id: "translate-groq-llama-70b", label: "Groq Llama 70B translate", kind: "selectionTransform", tier: "balanced", provider: "groq", model: "llama-3.3-70b-versatile", enabled: true, notes: "Ruta histórica de traducción natural/fiel.", promptKey: "translateBase", promptSummary: "Traduce de forma fiel y natural, preservando significado, tono e intención.", supportedEfforts: NO_REASONING_EFFORTS, defaultEffortId: null, source: "built-in" },
  { id: "assistant-groq-8b-instant", label: "Groq 8B assistant", kind: "postprocess", tier: "cheap", provider: "groq", model: "llama-3.1-8b-instant", enabled: true, notes: "Ruta histórica barata/rápida para assistant/default targets; disponible para profiles económicos.", promptKey: "assistant.quickChat", promptSummary: "Prompt base vacío en política actual; útil para respuestas rápidas de bajo costo.", supportedEfforts: NO_REASONING_EFFORTS, defaultEffortId: null, source: "built-in" },
  { id: "postprocess-openrouter-premium", label: "OpenRouter post premium", kind: "postprocess", tier: "premium", provider: "openrouter", model: "anthropic/claude-sonnet-4", enabled: true, notes: "Opción premium editable para cuentas habilitadas; no era el default histórico.", promptKey: "postProcessBase", promptSummary: "Mismo prompt de cleanup; modelo premium para mayor calidad cuando justifique costo.", supportedEfforts: NO_REASONING_EFFORTS, defaultEffortId: null, source: "built-in" },
  { id: "transform-openrouter-premium", label: "OpenRouter transform premium", kind: "selectionTransform", tier: "premium", provider: "openrouter", model: "anthropic/claude-sonnet-4", enabled: true, notes: "Opción premium editable para transformación/traducción avanzada; no era el default histórico.", promptKey: "selectionTransformBase", promptSummary: "Mismo prompt de transformación; modelo premium para casos habilitados.", supportedEfforts: STANDARD_REASONING_EFFORTS, defaultEffortId: "medium", source: "built-in" },
] satisfies readonly BuiltinEngine[]).map((engine) => Object.freeze(engine)));

export function validateBuiltinEngines(engines: readonly BuiltinEngine[] = BUILTIN_ENGINES): void {
  const ids = new Set<string>();
  for (const engine of engines) {
    ensurePublicId(engine.id);
    if (ids.has(engine.id)) throw new Error(`builtin_engine_duplicate_id:${engine.id}`);
    if (!engine.label || !engine.provider || !engine.model || !engine.promptKey) throw new Error(`builtin_engine_invalid:${engine.id}`);
    const effortIds = new Set<string>();
    for (const effort of engine.supportedEfforts) {
      ensurePublicId(effort.id);
      if (!effort.label || effortIds.has(effort.id)) throw new Error(`builtin_engine_effort_invalid:${engine.id}`);
      effortIds.add(effort.id);
    }
    if (engine.defaultEffortId !== null && !effortIds.has(engine.defaultEffortId)) throw new Error(`builtin_engine_default_effort_unknown:${engine.id}`);
    ids.add(engine.id);
  }
}

export function builtinEngineCatalog(): BuiltinCatalog {
  validateBuiltinEngines();
  return { version: BUILTIN_CATALOG_VERSION, items: BUILTIN_ENGINES.map((engine) => ({ id: engine.id, kind: "engine" as const })) };
}

export type BuiltinPromptKind = BuiltinEngineKind | "assistant";
export type BuiltinPrompt = Readonly<{ id: string; label: string; kind: BuiltinPromptKind; version: string; summary: string; body: string; enabled: boolean; source: "built-in" }>;

const BUILTIN_PROMPT_DEFINITIONS: readonly Omit<BuiltinPrompt, "enabled">[] = [
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

const LABORATORY_CATALOG_REVISION = "laboratory-v1";

function laboratoryEntry(input: {
  id: string;
  label: string;
  version?: string;
  availability?: LaboratoryAvailability;
  executionModes?: readonly ("provider-free-replay" | "provider-real")[];
  compatibility?: LaboratoryCompatibility;
  profileMaterialization?: LaboratoryCatalogEntry["profileMaterialization"];
}): LaboratoryCatalogEntry {
  return Object.freeze({
    id: input.id,
    label: input.label,
    version: input.version ?? "v1",
    lifecycleStatus: "active" as const,
    availability: Object.freeze(input.availability ?? { status: "available" as const, reasonCode: null }),
    executionModes: Object.freeze([...(input.executionModes ?? ["provider-free-replay" as const])]),
    compatibility: Object.freeze(input.compatibility ?? {
      profileRuntimeKinds: Object.freeze([]),
      prosodyModes: Object.freeze(["off" as const]),
      requiresVocabularySnapshot: false,
    }),
    profileMaterialization: input.profileMaterialization
      ? Object.freeze({
        ...input.profileMaterialization,
        ...(input.profileMaterialization.defaults ? { defaults: Object.freeze({ ...input.profileMaterialization.defaults }) } : {}),
      })
      : null,
  });
}

/**
 * Builds the server-owned laboratory catalog from the exact evaluation
 * authorities. Only labels, IDs, compatibility, and bounded availability are
 * exposed; recipe prompts and managed prompt bodies never enter this DTO.
 */
export function buildLaboratoryCatalog(
  revision = LABORATORY_CATALOG_REVISION,
  providerAuthorization: LaboratoryCatalog["providerAuthorization"] = {
    status: "unavailable",
    reasonCode: "authoritative_one_shot_grant_unavailable",
  },
): LaboratoryCatalog {
  validateBuiltinEngines();
  validateBuiltinPrompts();
  const engines = BUILTIN_ENGINES.map((engine) => laboratoryEntry({
    id: engine.id,
    label: engine.label,
    version: BUILTIN_CATALOG_VERSION,
    compatibility: {
      profileRuntimeKinds: Object.freeze([engine.kind]),
      prosodyModes: Object.freeze(["off"]),
      requiresVocabularySnapshot: false,
    },
    profileMaterialization: {
      engineId: engine.id,
      promptId: engine.promptKey,
    },
  }));
  const prompts = BUILTIN_PROMPTS.map((prompt) => laboratoryEntry({
    id: prompt.id,
    label: prompt.label,
    version: prompt.version,
    compatibility: {
      profileRuntimeKinds: Object.freeze([prompt.kind === "assistant" ? "postprocess" : prompt.kind]),
      prosodyModes: Object.freeze(["off"]),
      requiresVocabularySnapshot: false,
    },
  }));
  const unavailableGateB: LaboratoryAvailability = { status: "unavailable", reasonCode: "gate_b_unavailable" };
  const sttRecipes = EVALUATION_RECIPES.map((recipe) => laboratoryEntry({
    id: recipe.id,
    label: `${recipe.promptMode === "short" ? "Short" : "Rich"} · ${recipe.language.toUpperCase()}`,
    version: recipe.version,
    executionModes: ["provider-real"],
    compatibility: {
      profileRuntimeKinds: Object.freeze(["transcription"]),
      prosodyModes: Object.freeze(["off"]),
      requiresVocabularySnapshot: false,
    },
    profileMaterialization: {
      engineId: "stt-groq-whisper-turbo",
      promptId: "transcriptBase",
      defaults: { "transcript.language": recipe.language },
    },
  })) as LaboratoryCatalog["sttRecipes"];
  const postprocessRecipes = POSTPROCESS_EVALUATION_RECIPES.map((recipe) => laboratoryEntry({
    id: recipe.id,
    label: recipe.variant === "with-prosody" ? "120B · advisory prosody" : "120B · plain",
    version: recipe.version,
    availability: unavailableGateB,
    executionModes: ["provider-real"],
    compatibility: {
      profileRuntimeKinds: Object.freeze(["postprocess"]),
      prosodyModes: Object.freeze([recipe.variant === "with-prosody" ? "advisory" : "off"]),
      requiresVocabularySnapshot: false,
    },
    profileMaterialization: {
      engineId: "postprocess-groq-gpt-oss-120b",
      promptId: "postProcessBase",
    },
  })) as LaboratoryCatalog["postprocessRecipes"];
  const unavailableVocabulary: LaboratoryAvailability = { status: "unavailable", reasonCode: "vocabulary_snapshot_unavailable" };
  const prosodyModes = [
    laboratoryEntry({ id: "off", label: "Off", executionModes: ["provider-free-replay", "provider-real"], compatibility: { profileRuntimeKinds: Object.freeze(["transcription", "postprocess"]), prosodyModes: Object.freeze(["off"]), requiresVocabularySnapshot: false } }),
    laboratoryEntry({ id: "advisory", label: "Advisory", availability: unavailableGateB, compatibility: { profileRuntimeKinds: Object.freeze(["postprocess"]), prosodyModes: Object.freeze(["advisory"]), requiresVocabularySnapshot: false } }),
  ];
  const vocabularyModes = [
    Object.freeze({ ...laboratoryEntry({ id: "off", label: "Off", executionModes: ["provider-free-replay", "provider-real"], compatibility: { profileRuntimeKinds: Object.freeze(["transcription", "postprocess"]), prosodyModes: Object.freeze(["off"]), requiresVocabularySnapshot: false } }), snapshotPrerequisite: Object.freeze({ required: false, immutableIdentityFields: ["snapshotId", "revision", "sha256", "source"] as const }) }),
    Object.freeze({ ...laboratoryEntry({ id: "automatic", label: "Automatic", availability: unavailableVocabulary, compatibility: { profileRuntimeKinds: Object.freeze(["transcription", "postprocess"]), prosodyModes: Object.freeze(["off"]), requiresVocabularySnapshot: true } }), snapshotPrerequisite: Object.freeze({ required: true, immutableIdentityFields: ["snapshotId", "revision", "sha256", "source"] as const }) }),
    Object.freeze({ ...laboratoryEntry({ id: "ask", label: "Ask", availability: unavailableVocabulary, compatibility: { profileRuntimeKinds: Object.freeze(["transcription", "postprocess"]), prosodyModes: Object.freeze(["off"]), requiresVocabularySnapshot: true } }), snapshotPrerequisite: Object.freeze({ required: true, immutableIdentityFields: ["snapshotId", "revision", "sha256", "source"] as const }) }),
  ];
  const materializations = [
    laboratoryEntry({
      id: "identity",
      label: "Identity replay",
      executionModes: ["provider-free-replay"],
      compatibility: { profileRuntimeKinds: Object.freeze(["transcription"]), prosodyModes: Object.freeze(["off"]), requiresVocabularySnapshot: false },
    }),
    laboratoryEntry({
      id: "response-text-kept",
      label: "Keep provider response text",
      executionModes: ["provider-real"],
      compatibility: { profileRuntimeKinds: Object.freeze(["transcription"]), prosodyModes: Object.freeze(["off"]), requiresVocabularySnapshot: false },
    }),
  ];
  return Object.freeze({
    schemaVersion: 1,
    revision,
    engines: Object.freeze(engines),
    prompts: Object.freeze(prompts),
    sttRecipes: Object.freeze(sttRecipes),
    postprocessRecipes: Object.freeze(postprocessRecipes),
    prosodyModes: Object.freeze(prosodyModes),
    vocabularyModes: Object.freeze(vocabularyModes),
    materializations: Object.freeze(materializations),
    providerAuthorization: Object.freeze(providerAuthorization),
  });
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

// Keep the existing catalog import as a stable entrypoint while exposing the
// lifecycle/discovery contract next to the built-in definitions.
export {
  ENGINE_CATALOG_DISCOVERY_INTERVAL_MS,
  InMemoryEngineCatalogStore,
  createProviderDiscoveryAdapter,
  normalizeDiscoveredEngine,
  publishEngine,
  reviewEngine,
  retireEngine,
  runEngineCatalogDiscoveryJob,
} from "./engine-catalog.ts";
export type {
  DiscoveredEngine,
  DiscoveryJobResult,
  EngineAvailability,
  EngineCatalogAudit,
  EngineCatalogAuditAction,
  EngineCatalogEntry,
  EngineCandidate,
  EngineCatalogKind,
  EngineCatalogRun,
  EngineCatalogRunStatus,
  EngineCatalogSource,
  EngineCatalogStore,
  EngineCatalogTier,
  EngineDiscoveryAdapter,
  EngineEffort,
  EngineLifecycleStatus,
  PublishedEngineChoice,
} from "./engine-catalog.ts";
