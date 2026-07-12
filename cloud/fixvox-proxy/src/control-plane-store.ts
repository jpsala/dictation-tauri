import type { KvNamespaceLike } from "./admin-store";
import {
  buildFeatureFlagsFromRuntimePolicy,
  buildRegisterDefaultsFromRuntimePolicy,
  buildTransportPolicyFromRuntimePolicy,
  getRuntimePolicy,
} from "./runtime-policy-store";
import { getRecipePolicy } from "./recipe-policy-store";

export type DeviceRegisterPayload = {
  installId?: string | null;
  deviceId?: string | null;
  version?: string | null;
  platform?: string | null;
  arch?: string | null;
  hostname?: string | null;
  ts?: string | null;
};

export type DeviceActivatePayload = {
  installId?: string | null;
  deviceId?: string | null;
  inviteCode?: string | null;
  version?: string | null;
  platform?: string | null;
  arch?: string | null;
  hostname?: string | null;
  ts?: string | null;
};

export type DeviceInviteDefinition = {
  policyId: string;
  policyLabel: string;
};

export type DeviceRecord = {
  deviceId: string;
  installId: string;
  accountId: string | null;
   activated: boolean;
   policyId: string | null;
   policyLabel: string | null;
   status: "active" | "revoked" | "disabled";
   activatedAt: string | null;
   firstSeenAt: string;
   lastSeenAt: string;
  appVersion: string | null;
  platform: string | null;
  arch: string | null;
  hostname: string | null;
  cohorts: string[];
  experiments: Record<string, unknown> | null;
  feedback: Record<string, unknown> | null;
};

export type DeviceRegisterResponse = {
  ok: true;
  deviceId: string;
  activated: boolean;
  policyId: string | null;
  policyLabel: string | null;
  accountId: string | null;
  minVersion: string | null;
  auth: {
    required: boolean;
    providers: string[];
    accessMode?: "anonymous" | "signed_in";
    provider?: "google";
    userId?: string;
    userRedacted?: string;
    groupLabel?: string;
    policyTemplateId?: string;
    policyTemplateLabel?: string;
    capabilities?: string[];
    redacted?: true;
  };
  features: Record<string, boolean>;
  defaults: Record<string, unknown> | null;
  cohorts: string[];
  experiments: Record<string, unknown> | null;
  feedback: Record<string, unknown> | null;
  limits: DeviceLimits | null;
  telemetry: {
    enabled: boolean;
    intervalMs: number;
    batchSize: number;
  };
  transportPolicy: Record<string, unknown> | null;
};

export type DeviceActivateResponse = {
  ok: true;
  deviceId: string;
  activated: true;
  policyId: string;
  policyLabel: string;
};

export type ExecutionPreflightPayload = {
  mode?: string | null;
  deviceId?: string | null;
  installId?: string | null;
  usageKind?: string | null;
  engineKind?: string | null;
  estimate?: number | null;
};

export type ExecutionMode = "managed" | "byok";

export type ExecutionEngineResolution = {
  profile: {
    policyId: string | null;
    policyLabel: string | null;
    policySource: "base" | "group" | "account" | "device";
    accountHandle: string | null;
    accountBudget: ControlPlaneAdminPolicyBudget | null;
    groups: string[];
    matchedGroup: string | null;
  };
  engines: {
    selectedKind: ControlPlaneAdminEngineKind;
    selected: ControlPlaneAdminEngineOption | null;
    byKind: Record<ControlPlaneAdminEngineKind, ControlPlaneAdminEngineOption | null>;
  };
};

export type ExecutionPreflightResponse = {
  ok: true;
  allowed: boolean;
  reason: string | null;
  retryAfterSeconds?: number | null;
  limits?: DeviceLimits | null;
  profile?: ExecutionEngineResolution["profile"] | null;
  engines?: ExecutionEngineResolution["engines"] | null;
};

export type ManagedUsageWindowName = "rolling5h" | "weekly";

export type ManagedQuotaName = "managedUsage" | "transcription" | "aiActions";

export type ManagedUsageWindow = {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
};

export type ManagedUsageLimits = {
  unit: "managedUsageUnit";
  state: "ok" | "almost_used" | "blocked" | "paused";
  blockedWindow: ManagedUsageWindowName | null;
  windows: Record<ManagedUsageWindowName, ManagedUsageWindow>;
  policy: {
    policyId: string | null;
    matchedCohort: string | null;
    quotaMultiplier: number;
    globalMultiplier: number;
  };
};

export type ManagedQuotaLimits = {
  unit: "audioSecond" | "aiAction";
  label: string;
  state: "ok" | "almost_used" | "blocked" | "paused";
  blockedWindow: ManagedUsageWindowName | null;
  windows: Record<ManagedUsageWindowName, ManagedUsageWindow>;
  policy: {
    policyId: string | null;
    matchedCohort: string | null;
    quotaMultiplier: number;
    globalMultiplier: number;
  };
};

export type DeviceLimits = {
  managedUsage: ManagedUsageLimits;
  transcription: ManagedQuotaLimits;
  aiActions: ManagedQuotaLimits;
};

export type ControlPlaneAdminDeviceRow = {
  deviceId: string;
  installId: string;
  policyId: string | null;
  policyLabel: string | null;
  cohorts: string[];
  status: DeviceRecord["status"];
  lastSeenAt: string;
  profiles: {
    uiProfile: string | null;
    capabilityProfile: string | null;
    quotaProfile: string | null;
    llmProfile: string | null;
    settingsDefaultsProfile: string | null;
  };
  limits: DeviceLimits;
};

export type ControlPlaneAdminPolicyOption = {
  policyId: string;
  policyLabel: string;
  source: "built-in" | "assignment" | "quota-group";
};

export type ControlPlaneAdminDeviceList = {
  ok: true;
  source: "default" | "stored";
  updatedAt: string;
  policyOptions: ControlPlaneAdminPolicyOption[];
  devices: ControlPlaneAdminDeviceRow[];
  nextCursor: string | null;
};

export type ControlPlaneAdminDevicePolicyPayload = {
  deviceId?: string | null;
  policyId?: string | null;
  policyLabel?: string | null;
};

export type ControlPlaneAdminDevicePolicyResponse = {
  ok: true;
  source: "default" | "stored";
  updatedAt: string;
  policyOptions: ControlPlaneAdminPolicyOption[];
  device: ControlPlaneAdminDeviceRow;
};

export type ControlPlaneAdminAccountDeviceRow = {
  deviceIdRedacted: string;
  policyId: string | null;
  policyLabel: string | null;
  status: DeviceRecord["status"];
  lastSeenAt: string;
};

export type ControlPlaneAdminAccountRow = {
  accountHandle: string;
  accountIdRedacted: string;
  userRedacted: string;
  userEmail: string | null;
  provider: string | null;
  variants: string[];
  segments: string[];
  groups: string[];
  policyId: string | null;
  policyLabel: string | null;
  effectivePolicyId: string | null;
  effectivePolicyLabel: string | null;
  effectivePolicySource: ExecutionEngineResolution["profile"]["policySource"];
  matchedGroup: string | null;
  accountBudget: ControlPlaneAdminPolicyBudget | null;
  deviceCount: number;
  devices: ControlPlaneAdminAccountDeviceRow[];
  lastSeenAt: string;
};

export type ControlPlaneAdminAccountVariantOption = {
  id: string;
  label: string;
  description: string;
  preset: string;
  effects: string[];
  source: "built-in" | "custom";
};

export type ControlPlaneAdminGroupOption = {
  id: string;
  label: string;
  description: string;
  policyId?: string | null;
  policyLabel?: string | null;
  source: "built-in" | "custom";
};

export type ControlPlaneAdminEngineKind = "transcription" | "postprocess" | "selectionTransform";

export type ControlPlaneAdminEngineOption = {
  id: string;
  label: string;
  kind: ControlPlaneAdminEngineKind;
  tier: string;
  provider: string;
  model: string;
  notes: string;
  promptKey: string;
  promptSummary: string;
  source: "built-in" | "custom";
};

export type ControlPlaneAdminPromptOption = {
  id: string;
  label: string;
  kind: ControlPlaneAdminEngineKind | "assistant";
  version: string;
  summary: string;
  content: string;
  source: "built-in" | "custom";
};

export type ControlPlaneAdminAccountList = {
  ok: true;
  source: "default" | "stored";
  updatedAt: string;
  policyOptions: ControlPlaneAdminPolicyOption[];
  availableSegments: string[];
  variantOptions: ControlPlaneAdminAccountVariantOption[];
  groupOptions: ControlPlaneAdminGroupOption[];
  policyVariants: Record<string, string[]>;
  policyEngines: Record<string, ControlPlaneAdminPolicyEngineSelection>;
  accounts: ControlPlaneAdminAccountRow[];
  nextCursor: string | null;
};

export type ControlPlaneAdminAccountPolicyPayload = {
  accountHandle?: string | null;
  accountId?: string | null;
  policyId?: string | null;
  policyLabel?: string | null;
};

export type ControlPlaneAdminAccountPolicyResponse = {
  ok: true;
  source: "default" | "stored";
  updatedAt: string;
  policyOptions: ControlPlaneAdminPolicyOption[];
  availableSegments: string[];
  account: ControlPlaneAdminAccountRow;
  devicesUpdated: number;
};

export type ControlPlaneAdminAccountSegmentsPayload = {
  accountHandle?: string | null;
  accountId?: string | null;
  variants?: string[] | null;
  segments?: string[] | null;
};

export type ControlPlaneAdminAccountBudgetPayload = {
  accountHandle?: string | null;
  accountId?: string | null;
  budget?: Partial<ControlPlaneAdminPolicyBudget> | null;
};

export type ControlPlaneAdminAccountGroupsPayload = {
  accountHandle?: string | null;
  accountId?: string | null;
  groups?: string[] | null;
};

export type ControlPlaneAdminAccountSegmentsResponse = {
  ok: true;
  source: "default" | "stored";
  updatedAt: string;
  policyOptions: ControlPlaneAdminPolicyOption[];
  availableSegments: string[];
  variantOptions: ControlPlaneAdminAccountVariantOption[];
  account: ControlPlaneAdminAccountRow;
};

export type ControlPlaneAdminAccountBudgetResponse = {
  ok: true;
  source: "default" | "stored";
  updatedAt: string;
  policyOptions: ControlPlaneAdminPolicyOption[];
  availableSegments: string[];
  variantOptions: ControlPlaneAdminAccountVariantOption[];
  account: ControlPlaneAdminAccountRow;
};

export type ControlPlaneAdminAccountGroupsResponse = {
  ok: true;
  source: "default" | "stored";
  updatedAt: string;
  policyOptions: ControlPlaneAdminPolicyOption[];
  groupOptions: ControlPlaneAdminGroupOption[];
  account: ControlPlaneAdminAccountRow;
};

export type ControlPlaneAdminGroupPayload = {
  id?: string | null;
  label?: string | null;
  description?: string | null;
  policyId?: string | null;
  policyLabel?: string | null;
};

export type ControlPlaneAdminAccountVariantPayload = {
  id?: string | null;
  label?: string | null;
  description?: string | null;
  preset?: string | null;
};

export type ControlPlaneAdminAccountVariantDeletePayload = {
  id?: string | null;
};

export type ControlPlaneAdminPolicyVariantsPayload = {
  policyId?: string | null;
  variants?: string[] | null;
};

export type ControlPlaneAdminPolicyEngineSelection = {
  transcription?: string;
  postprocess?: string;
  selectionTransform?: string;
};

export type ControlPlaneAdminPolicyBudget = {
  dailyUsd: number | null;
  monthlyUsd: number | null;
  mode: "block" | "warn";
};

export type ControlPlaneAdminEnginePayload = {
  id?: string | null;
  label?: string | null;
  kind?: string | null;
  tier?: string | null;
  provider?: string | null;
  model?: string | null;
  notes?: string | null;
  promptKey?: string | null;
  promptSummary?: string | null;
};

export type ControlPlaneAdminEngineDeletePayload = {
  id?: string | null;
};

export type ControlPlaneAdminPromptPayload = {
  id?: string | null;
  label?: string | null;
  kind?: string | null;
  version?: string | null;
  summary?: string | null;
  content?: string | null;
};

export type ControlPlaneAdminPromptDeletePayload = {
  id?: string | null;
};

export type ControlPlaneAdminPolicyEnginesPayload = {
  policyId?: string | null;
  engines?: ControlPlaneAdminPolicyEngineSelection | null;
};

export type ControlPlaneAdminPolicyBudgetPayload = {
  policyId?: string | null;
  budget?: Partial<ControlPlaneAdminPolicyBudget> | null;
};

export type ControlPlaneAdminVariantConfig = {
  variantOptions: ControlPlaneAdminAccountVariantOption[];
  availableSegments: string[];
  engineOptions: ControlPlaneAdminEngineOption[];
  promptOptions: ControlPlaneAdminPromptOption[];
  policyVariants: Record<string, string[]>;
  policyEngines: Record<string, ControlPlaneAdminPolicyEngineSelection>;
  policyBudgets: Record<string, ControlPlaneAdminPolicyBudget>;
};

export type ControlPlaneAdminAccountVariantResponse = {
  ok: true;
  source: "default" | "stored";
  updatedAt: string;
  variant: ControlPlaneAdminAccountVariantOption;
  variantOptions: ControlPlaneAdminAccountVariantOption[];
  availableSegments: string[];
};

export type FeedbackEvent = {
  id: string;
  ts: string;
  type: "bug" | "confusing" | "idea" | "love-it";
  source: string;
  message: string;
  deviceId: string | null;
  installId: string | null;
  accountId: string | null;
  appVersion: string | null;
  loggedIn: boolean;
  cohorts: string[];
  experiments: Record<string, unknown> | null;
  features: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
};

export type FeedbackListFilters = {
  type?: string | null;
  source?: string | null;
  deviceId?: string | null;
  q?: string | null;
  limit?: number | null;
  cursor?: string | null;
};

type RecentIndexEntry = {
  id: string;
  ts: string;
};

const DEVICE_TTL_SECONDS = 60 * 60 * 24 * 180;
const DEVICE_WRITE_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEVICE_RECENT_LIMIT = 500;
const DEVICE_RECENT_INDEX_KEY = "control:devices:recent";
const ACCOUNT_POLICY_TTL_SECONDS = DEVICE_TTL_SECONDS;
const FEEDBACK_TTL_SECONDS = 60 * 60 * 24 * 180;
const FEEDBACK_RECENT_LIMIT = 500;
const FEEDBACK_RECENT_INDEX_KEY = "control:feedback:recent";
const USAGE_EVENT_TTL_SECONDS = 60 * 60 * 24 * 14;
const ROLLING_5H_MS = 5 * 60 * 60 * 1000;
const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_POLICY_ID = "alpha-basic";
const DEFAULT_POLICY_LABEL = "Alpha Basic";
const JP_ROLLING_5H_LIMIT = 1_000_000;
const JP_WEEKLY_LIMIT = 10_000_000;
const JP_TRANSCRIPTION_ROLLING_5H_SECONDS = 1_000_000;
const JP_TRANSCRIPTION_WEEKLY_SECONDS = 10_000_000;
const JP_AI_ACTIONS_ROLLING_5H_LIMIT = 1_000_000;
const JP_AI_ACTIONS_WEEKLY_LIMIT = 10_000_000;

type UsageEvent = {
  id: string;
  ts: string;
  units: number;
  actionUnits: number;
  kind: "managed" | "transcription" | "aiAction";
};

type ManagedUsageGroupPolicy = {
  rolling5hLimit: number;
  weeklyLimit: number;
  transcriptionRolling5hSeconds: number;
  transcriptionWeeklySeconds: number;
  aiActionsRolling5hLimit: number;
  aiActionsWeeklyLimit: number;
  quotaMultiplier: number;
};

type ManagedUsagePolicy = {
  estimatePerRequest: number;
  globalMultiplier: number;
  matchedCohort: string | null;
  quotaProfileId: string | null;
  group: ManagedUsageGroupPolicy;
};

type PolicyProfileAssignment = {
  uiProfile?: string;
  capabilityProfile?: string;
  quotaProfile?: string;
  llmProfile?: string;
  voiceRoutingProfile?: string;
  promptProfile?: string;
  settingsDefaultsProfile?: string;
};

type AccountPolicyAssignment = {
  accountHandle: string;
  accountId: string;
  policyId: string;
  policyLabel: string;
  updatedAt: string;
};

type AccountSegmentsAssignment = {
  accountHandle: string;
  accountId: string;
  segments: string[];
  updatedAt: string;
};

type AccountBudgetAssignment = {
  accountHandle: string;
  accountId: string;
  budget: ControlPlaneAdminPolicyBudget;
  updatedAt: string;
};

type AccountGroupsAssignment = {
  accountHandle: string;
  accountId: string;
  groups: string[];
  updatedAt: string;
};

type AccountVariantsStore = {
  variants: ControlPlaneAdminAccountVariantOption[];
  deletedBuiltIns: string[];
  engines: ControlPlaneAdminEngineOption[];
  deletedBuiltInEngines: string[];
  prompts: ControlPlaneAdminPromptOption[];
  deletedBuiltInPrompts: string[];
  groups: ControlPlaneAdminGroupOption[];
  deletedBuiltInGroups: string[];
  policyVariants: Record<string, string[]>;
  policyEngines: Record<string, ControlPlaneAdminPolicyEngineSelection>;
  policyBudgets: Record<string, ControlPlaneAdminPolicyBudget>;
};

const VARIANT_PRESET_EFFECTS: Record<string, string[]> = {
  access: ["adminAccess: elevated", "safeMutations: allowedWithConfirmation"],
  manualTesting: ["rollout: manual", "feedbackPriority: high"],
  debug: ["showDebugTools: true", "verboseDiagnostics: true"],
  voiceQuality: ["voiceMode: best", "postProcess: on"],
  lowCost: ["modelTier: low-cost", "postProcess: minimal"],
  newUi: ["uiVariant: next", "showAdvancedSettings: true"],
  privateAlpha: ["alphaFeatures: private", "requiresManualReview: true"],
  trial: ["quotaTier: trial", "advancedSettings: limited"],
  custom: ["customOverride: define-before-production"],
};

const BUILT_IN_GROUPS: ControlPlaneAdminGroupOption[] = [
  { id: "friends", label: "Friends", description: "Usuarios cercanos y amigos con feedback manual.", policyId: "pro", policyLabel: "Pro", source: "built-in" },
  { id: "private-alpha", label: "Private alpha", description: "Usuarios en alpha privada con acceso controlado.", policyId: "alpha-full", policyLabel: "Alpha Full", source: "built-in" },
  { id: "trial", label: "Trial", description: "Usuarios de prueba con límites bajos.", policyId: "alpha-basic", policyLabel: "Alpha Basic", source: "built-in" },
  { id: "paid", label: "Paid", description: "Usuarios pagos o habilitados comercialmente.", policyId: "pro", policyLabel: "Pro", source: "built-in" },
];

const BUILT_IN_ACCOUNT_VARIANTS: ControlPlaneAdminAccountVariantOption[] = [
  { id: "owner", label: "Owner", description: "acceso owner y cambios rápidos", preset: "access", effects: VARIANT_PRESET_EFFECTS.access, source: "built-in" },
  { id: "friend", label: "Amigo", description: "usuario cercano para pruebas manuales", preset: "manualTesting", effects: VARIANT_PRESET_EFFECTS.manualTesting, source: "built-in" },
  { id: "tester", label: "Tester", description: "recibe variantes en prueba", preset: "manualTesting", effects: VARIANT_PRESET_EFFECTS.manualTesting, source: "built-in" },
  { id: "trial", label: "Trial", description: "usuario en prueba controlada", preset: "trial", effects: VARIANT_PRESET_EFFECTS.trial, source: "built-in" },
  { id: "debug-tools", label: "Debug tools", description: "muestra herramientas/debug avanzado", preset: "debug", effects: VARIANT_PRESET_EFFECTS.debug, source: "built-in" },
  { id: "best-voice", label: "Best voice", description: "prioriza calidad de voz y post-proceso", preset: "voiceQuality", effects: VARIANT_PRESET_EFFECTS.voiceQuality, source: "built-in" },
  { id: "cheap-model", label: "Cheap model", description: "prioriza costo bajo", preset: "lowCost", effects: VARIANT_PRESET_EFFECTS.lowCost, source: "built-in" },
  { id: "new-ui", label: "New UI", description: "habilita variantes nuevas de UI", preset: "newUi", effects: VARIANT_PRESET_EFFECTS.newUi, source: "built-in" },
  { id: "private-alpha", label: "Private alpha", description: "features alpha privadas", preset: "privateAlpha", effects: VARIANT_PRESET_EFFECTS.privateAlpha, source: "built-in" },
];

const BUILT_IN_PROMPTS: ControlPlaneAdminPromptOption[] = [
  { id: "none", label: "Sin prompt", kind: "assistant", version: "v1", summary: "No aplica prompt de sistema.", content: "", source: "built-in" },
  { id: "transcriptBase", label: "Transcript base", kind: "transcription", version: "v1", summary: "Español rioplatense técnico; conserva comandos, URLs, modelos, archivos y puntuación hablada literal.", content: "Transcribe el audio con precisión. Mantén español rioplatense cuando corresponda, conserva términos técnicos, nombres de modelos, URLs, comandos, paths y puntuación hablada cuando sea claramente intencional.", source: "built-in" },
  { id: "postProcessBase", label: "Post-process base", kind: "postprocess", version: "v1", summary: "Limpia dictado español/bilingüe con cambios mínimos; reconstruye tokens técnicos y listas cuando está claro.", content: "Limpia el dictado manteniendo el significado. Corrige errores evidentes de STT, reconstruye términos técnicos, puntuación y listas cuando sea claro. No agregues explicaciones ni cambies intención.", source: "built-in" },
  { id: "selectionTransformBase", label: "Selection transform base", kind: "selectionTransform", version: "v1", summary: "Reescribe el texto seleccionado según la instrucción del usuario preservando intención y formato.", content: "Aplica la instrucción del usuario al texto seleccionado. Devuelve solo el texto final transformado. Preserva formato, intención y tono salvo que la instrucción pida lo contrario.", source: "built-in" },
  { id: "translateBase", label: "Translate base", kind: "selectionTransform", version: "v1", summary: "Traduce de forma fiel y natural, preservando significado, tono e intención.", content: "Traduce el texto de forma fiel y natural. Conserva significado, tono, formato y términos técnicos. Devuelve solo la traducción.", source: "built-in" },
  { id: "assistant.quickChat", label: "Assistant quick chat", kind: "assistant", version: "v1", summary: "Respuesta rápida de bajo costo para assistant/default targets.", content: "Respondé de forma breve, útil y directa.", source: "built-in" },
];

const BUILT_IN_POLICY_ENGINES: ControlPlaneAdminEngineOption[] = [
  { id: "stt-off", label: "STT off", kind: "transcription", tier: "off", provider: "none", model: "off", notes: "No usa transcripción managed.", promptKey: "none", promptSummary: "Sin prompt.", source: "built-in" },
  { id: "stt-groq-whisper-turbo", label: "Groq Whisper Turbo", kind: "transcription", tier: "balanced", provider: "groq", model: "whisper-large-v3-turbo", notes: "Default histórico de Fixvox: mejor balance calidad/precio/velocidad para dictado managed.", promptKey: "transcriptBase", promptSummary: "Español rioplatense técnico; conserva comandos, URLs, modelos, archivos y puntuación hablada literal.", source: "built-in" },
  { id: "postprocess-off", label: "Postprocess off", kind: "postprocess", tier: "off", provider: "none", model: "off", notes: "Sin post-proceso managed.", promptKey: "none", promptSummary: "Sin prompt.", source: "built-in" },
  { id: "postprocess-groq-gpt-oss-120b", label: "Groq GPT-OSS 120B post", kind: "postprocess", tier: "balanced", provider: "groq", model: "openai/gpt-oss-120b", notes: "Default histórico de post-proceso: buena calidad/precio/velocidad para cleanup bilingüe.", promptKey: "postProcessBase", promptSummary: "Limpia dictado español/bilingüe con cambios mínimos; reconstruye tokens técnicos y listas cuando está claro.", source: "built-in" },
  { id: "transform-off", label: "Transform off", kind: "selectionTransform", tier: "off", provider: "none", model: "off", notes: "Sin transformación de selección managed.", promptKey: "none", promptSummary: "Sin prompt.", source: "built-in" },
  { id: "transform-groq-llama-70b", label: "Groq Llama 70B transform", kind: "selectionTransform", tier: "balanced", provider: "groq", model: "llama-3.3-70b-versatile", notes: "Default histórico para traducción/transformación de selección.", promptKey: "selectionTransformBase", promptSummary: "Reescribe el texto seleccionado según la instrucción del usuario preservando intención y formato.", source: "built-in" },
  { id: "translate-groq-llama-70b", label: "Groq Llama 70B translate", kind: "selectionTransform", tier: "balanced", provider: "groq", model: "llama-3.3-70b-versatile", notes: "Ruta histórica de traducción natural/fiel.", promptKey: "translateBase", promptSummary: "Traduce de forma fiel y natural, preservando significado, tono e intención.", source: "built-in" },
  { id: "assistant-groq-8b-instant", label: "Groq 8B assistant", kind: "postprocess", tier: "cheap", provider: "groq", model: "llama-3.1-8b-instant", notes: "Ruta histórica barata/rápida para assistant/default targets; disponible para profiles económicos.", promptKey: "assistant.quickChat", promptSummary: "Prompt base vacío en política actual; útil para respuestas rápidas de bajo costo.", source: "built-in" },
  { id: "postprocess-openrouter-premium", label: "OpenRouter post premium", kind: "postprocess", tier: "premium", provider: "openrouter", model: "anthropic/claude-sonnet-4", notes: "Opción premium editable para cuentas habilitadas; no era el default histórico.", promptKey: "postProcessBase", promptSummary: "Mismo prompt de cleanup; modelo premium para mayor calidad cuando justifique costo.", source: "built-in" },
  { id: "transform-openrouter-premium", label: "OpenRouter transform premium", kind: "selectionTransform", tier: "premium", provider: "openrouter", model: "anthropic/claude-sonnet-4", notes: "Opción premium editable para transformación/traducción avanzada; no era el default histórico.", promptKey: "selectionTransformBase", promptSummary: "Mismo prompt de transformación; modelo premium para casos habilitados.", source: "built-in" },
];

const BUILT_IN_POLICY_ASSIGNMENTS: Record<string, PolicyProfileAssignment> = {
  "alpha-basic": {
    uiProfile: "alpha-basic",
    capabilityProfile: "basic",
    llmProfile: "locked-presets",
    settingsDefaultsProfile: "alpha-lulu",
  },
  "alpha-full": {
    uiProfile: "alpha-full",
    capabilityProfile: "full",
    llmProfile: "allow-presets",
    settingsDefaultsProfile: "alpha-lulu",
  },
  pro: {
    uiProfile: "alpha-full",
    capabilityProfile: "full",
    quotaProfile: "pro-unlimited",
    llmProfile: "pro-best-voice",
    voiceRoutingProfile: "pro-post-process",
    promptProfile: "pro-prompts",
    settingsDefaultsProfile: "alpha-lulu",
  },
};

const BUILT_IN_POLICY_PROFILES: Record<string, Record<string, Record<string, unknown>>> = {
  ui: {
    "alpha-basic": {
      ui: {
        hideProviderModelSelectors: true,
        hidePresetProviderModelOverrides: true,
        showAdvancedSettings: false,
        showDebugTools: false,
      },
    },
    "alpha-full": {
      ui: {
        hideProviderModelSelectors: false,
        hidePresetProviderModelOverrides: false,
        showAdvancedSettings: true,
        showDebugTools: false,
      },
    },
  },
  capabilities: {
    basic: {
      features: {
        "assistant.mode": false,
        "assistant.quickChat": false,
        "presets.edit": false,
        "presets.run": false,
        "results.history": false,
      },
    },
    full: {
      features: {
        "assistant.mode": true,
        "assistant.quickChat": true,
        "presets.edit": true,
        "presets.run": true,
        "results.history": true,
      },
    },
  },
  llm: {
    "locked-presets": {
      llm: {
        presetOverridePolicy: "deny",
      },
    },
    "allow-presets": {
      llm: {
        presetOverridePolicy: "allow",
      },
    },
    "pro-best-voice": {
      llm: {
        presetOverridePolicy: "allow",
        targets: {
          postProcess: {
            provider: "groq",
            model: "llama-3.3-70b-versatile",
            policy: "locked",
          },
          presetFallback: {
            provider: "groq",
            model: "llama-3.3-70b-versatile",
            policy: "default",
          },
        },
      },
    },
  },
  voiceRouting: {
    "pro-post-process": {
      voiceRouting: {
        cohortAssignments: {
          pro: "quality",
        },
        policies: {
          quality: {
            runtime: {
              sttPromptEnabled: true,
              postProcessEnabled: true,
            },
          },
        },
      },
    },
  },
  prompts: {
    "pro-prompts": {
      prompts: {
        postProcessBase: {
          text: "Clean Spanish/bilingual dictation with minimal edits. Preserve wording, language mix, and verb tense. Convert spoken punctuation commands when clear; keep literal words when uncertain. Preserve or reconstruct clear technical tokens: app punto svelte -> app.svelte; voice doc output ts -> voice-dock-output.ts; banRanDev/bun randev -> bun run dev; npmRanDev/npm randev -> npm run dev; fixbox.local -> fixvox.local; fixbox.dev -> fixvox.dev; llama 3.370B versatile -> llama-3.3-70b-versatile. Prefer same-paragraph sentence breaks; do not add blank lines except around numbered lists. If a sentence is immediately followed by primero/segundo/tercero items, end that sentence with a colon, format 1/2/3 on separate lines, use comma after items 1 and 2 and period after the final item, then resume following prose after the list.",
          policy: "default",
        },
      },
    },
  },
  settingsDefaults: {
    "alpha-lulu": {
      userSettingsDefaults: {
        appearance: {
          themeId: "github-light",
        },
        hotkeys: {
          pushToTalk: "Alt+Space",
          voiceRecord: "Alt+Ctrl+Space",
        },
        voice: {
          assistantWakeWords: "lulu",
          assistantModeToggleWords: "modo lulu,lulu",
        },
      },
    },
  },
  quota: {
    "alpha-basic": {
      rolling5hLimit: 80,
      weeklyLimit: 700,
      transcriptionRolling5hSeconds: 3_600,
      transcriptionWeeklySeconds: 10_800,
      aiActionsRolling5hLimit: 20,
      aiActionsWeeklyLimit: 100,
      quotaMultiplier: 1,
    },
    "alpha-full": {
      rolling5hLimit: 150,
      weeklyLimit: 1500,
      transcriptionRolling5hSeconds: 10_800,
      transcriptionWeeklySeconds: 72_000,
      aiActionsRolling5hLimit: 80,
      aiActionsWeeklyLimit: 700,
      quotaMultiplier: 1,
    },
    "pro-unlimited": {
      rolling5hLimit: JP_ROLLING_5H_LIMIT,
      weeklyLimit: JP_WEEKLY_LIMIT,
      transcriptionRolling5hSeconds: JP_TRANSCRIPTION_ROLLING_5H_SECONDS,
      transcriptionWeeklySeconds: JP_TRANSCRIPTION_WEEKLY_SECONDS,
      aiActionsRolling5hLimit: JP_AI_ACTIONS_ROLLING_5H_LIMIT,
      aiActionsWeeklyLimit: JP_AI_ACTIONS_WEEKLY_LIMIT,
      quotaMultiplier: 1,
    },
  },
};

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sanitizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sanitizeInviteCode(value: unknown): string | null {
  const candidate = sanitizeString(value);
  return candidate ? candidate.toUpperCase() : null;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => sanitizeString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function sanitizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function nowIso(value?: string | null): string {
  const candidate = sanitizeString(value);
  if (!candidate) return new Date().toISOString();
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function shouldPersistDeviceRecord(
  previous: DeviceRecord | null,
  mappedDeviceId: string | null,
  nextRecord: DeviceRecord,
): boolean {
  if (!previous) return true;
  if (mappedDeviceId !== nextRecord.deviceId) return true;
  if (previous.installId !== nextRecord.installId) return true;
  if (previous.accountId !== nextRecord.accountId) return true;
  if (previous.activated !== nextRecord.activated) return true;
  if (previous.policyId !== nextRecord.policyId) return true;
  if (previous.policyLabel !== nextRecord.policyLabel) return true;
  if (previous.status !== nextRecord.status) return true;
  if (JSON.stringify(previous.cohorts) !== JSON.stringify(nextRecord.cohorts)) return true;
  if (previous.appVersion !== nextRecord.appVersion) return true;
  if (previous.platform !== nextRecord.platform) return true;
  if (previous.arch !== nextRecord.arch) return true;
  if (previous.hostname !== nextRecord.hostname) return true;

  const previousLastSeenMs = Date.parse(previous.lastSeenAt);
  const nextLastSeenMs = Date.parse(nextRecord.lastSeenAt);
  if (!Number.isFinite(previousLastSeenMs) || !Number.isFinite(nextLastSeenMs)) {
    return true;
  }

  return (nextLastSeenMs - previousLastSeenMs) >= DEVICE_WRITE_MIN_INTERVAL_MS;
}

function devicePolicyAssignmentChanged(previous: DeviceRecord, nextRecord: DeviceRecord): boolean {
  return previous.activated !== nextRecord.activated
    || previous.policyId !== nextRecord.policyId
    || previous.policyLabel !== nextRecord.policyLabel
    || previous.status !== nextRecord.status
    || JSON.stringify(previous.cohorts) !== JSON.stringify(nextRecord.cohorts);
}

function productCapabilitiesForPolicyTemplate(policyId: string | null): string[] {
  switch ((policyId ?? "").trim().toLowerCase()) {
    case "pro":
      return [
        "translate",
        "dictation",
        "postprocess",
        "selection_transform",
        "assistant_actions",
        "custom_prompts",
        "advanced_settings",
        "managed_stt",
        "managed_llm",
      ];
    case "alpha-full":
    case "dictation-basic":
      return ["dictation", "postprocess", "managed_stt", "managed_llm"];
    case "translate-only":
      return ["translate", "managed_llm"];
    default:
      return [];
  }
}

function buildDeviceRegisterAuthPolicy(record: DeviceRecord, providers: string[]): DeviceRegisterResponse["auth"] {
  if (record.accountId) {
    return {
      required: false,
      providers,
      accessMode: "signed_in",
      provider: "google",
      userId: "user redacted",
      userRedacted: "user redacted",
      groupLabel: record.policyLabel ?? "Basic",
      policyTemplateId: record.policyId ?? "basic-anonymous",
      policyTemplateLabel: record.policyLabel ?? "Basic",
      capabilities: productCapabilitiesForPolicyTemplate(record.policyId),
      redacted: true,
    };
  }

  return {
    required: false,
    providers,
    accessMode: "anonymous",
    redacted: true,
  };
}

function buildDeviceKey(deviceId: string): string {
  return `control:device:${deviceId}`;
}

function buildInstallKey(installId: string): string {
  return `control:install:${installId}`;
}

async function buildAccountHandle(accountId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accountId));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `acc_${hex.slice(0, 16)}`;
}

function buildAccountPolicyKey(accountHandle: string): string {
  return `control:account:${accountHandle}:policy`;
}

function buildAccountSegmentsKey(accountHandle: string): string {
  return `control:account:${accountHandle}:segments`;
}

function buildAccountBudgetKey(accountHandle: string): string {
  return `control:account:${accountHandle}:budget`;
}

function buildAccountGroupsKey(accountHandle: string): string {
  return `control:account:${accountHandle}:groups`;
}

function buildAccountVariantsKey(): string {
  return "control:account:variants";
}

function redactLongIdentifier(value: string | null | undefined): string {
  const candidate = value?.trim() ?? "";
  if (!candidate || candidate.length <= 10) return "redacted";
  return `${candidate.slice(0, 6)}…${candidate.slice(-4)}`;
}

function redactAccountId(_accountId: string): string {
  return "account redacted";
}

function redactAccountUser(accountId: string): { userRedacted: string; userEmail: string | null; provider: string | null } {
  const [providerRaw = "", ...rest] = accountId.split(":");
  const provider = providerRaw.trim().toLowerCase() || null;
  const value = rest.join(":").trim();
  if (provider === "google" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    const email = value.toLowerCase();
    const [local, domain] = email.split("@");
    const initial = local?.[0] ?? "u";
    return { provider, userEmail: email, userRedacted: `${initial}…@${domain}` };
  }
  if (provider === "google") return { provider, userEmail: null, userRedacted: "google user redacted" };
  return { provider, userEmail: null, userRedacted: "user redacted" };
}

function buildFeedbackKey(id: string): string {
  return `control:feedback:${id}`;
}

function buildUsageEventsKey(deviceId: string): string {
  return `control:usage:${deviceId}:events`;
}

function cloneJsonRecord<T extends Record<string, unknown>>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeJsonRecord(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainRecord(value) && isPlainRecord(target[key])) {
      mergeJsonRecord(target[key] as Record<string, unknown>, value);
      continue;
    }
    target[key] = cloneJsonRecord({ value }).value;
  }
}

function normalizeDeviceRecord(value: DeviceRecord | null): DeviceRecord | null {
  if (!value) return null;
  const previous = value as Partial<DeviceRecord>;
  const status = previous.status === "revoked" || previous.status === "disabled"
    ? previous.status
    : "active";
  return {
    ...value,
    activated: Boolean(previous.activated) || Boolean(previous.policyId),
    policyId: sanitizeString(previous.policyId),
    policyLabel: sanitizeString(previous.policyLabel),
    status,
    activatedAt: sanitizeString(previous.activatedAt),
  };
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return Math.max(0, readNumber(value, fallback));
}

function readNestedRecord(source: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | null {
  const value = source?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function resolveManagedUsagePolicy(runtimePolicy: Record<string, unknown>, record: DeviceRecord): ManagedUsagePolicy {
  const managedUsage = readNestedRecord(runtimePolicy, "managedUsage") ?? {};
  const groups = readNestedRecord(managedUsage, "groups") ?? {};
  const assignment = record.policyId ? resolvePolicyProfileAssignment(runtimePolicy, record.policyId) : null;
  const quotaProfileId = assignment?.quotaProfile ?? null;
  const quotaProfileRecord = quotaProfileId ? resolvePolicyProfile(runtimePolicy, "quota", quotaProfileId) : null;
  const groupKeys = Object.keys(groups).filter((key) => readNestedRecord(groups, key));
  const matchedCohort = (record.policyId && readNestedRecord(groups, record.policyId) ? record.policyId : null)
    ?? record.cohorts.find((cohort) => readNestedRecord(groups, cohort))
    ?? (readNestedRecord(groups, "default") ? "default" : null)
    ?? (groupKeys.length === 1 ? groupKeys[0] : null);
  const groupRecord = quotaProfileRecord ?? (matchedCohort ? readNestedRecord(groups, matchedCohort) : null) ?? {};
  return {
    estimatePerRequest: Math.max(1, readNumber(managedUsage.estimatePerRequest, 1)),
    globalMultiplier: Math.max(0, readNumber(managedUsage.globalMultiplier, 1)),
    matchedCohort,
    quotaProfileId: quotaProfileRecord ? quotaProfileId : null,
    group: {
      rolling5hLimit: readPositiveNumber(groupRecord.rolling5hLimit, 20),
      weeklyLimit: readPositiveNumber(groupRecord.weeklyLimit, 120),
      transcriptionRolling5hSeconds: readPositiveNumber(groupRecord.transcriptionRolling5hSeconds, 60 * 60),
      transcriptionWeeklySeconds: readPositiveNumber(groupRecord.transcriptionWeeklySeconds, 6 * 60 * 60),
      aiActionsRolling5hLimit: readPositiveNumber(groupRecord.aiActionsRolling5hLimit, 40),
      aiActionsWeeklyLimit: readPositiveNumber(groupRecord.aiActionsWeeklyLimit, 300),
      quotaMultiplier: Math.max(0, readNumber(groupRecord.quotaMultiplier, 1)),
    },
  };
}

function effectiveLimit(baseLimit: number, policy: ManagedUsagePolicy): number {
  return Math.max(0, Math.floor(baseLimit * policy.group.quotaMultiplier * policy.globalMultiplier));
}

function normalizeUsageEvents(value: unknown): UsageEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
      const ts = sanitizeString(record?.ts);
      const units = readNumber(record?.units, 0);
      const actionUnits = readNumber(record?.actionUnits, units);
      const kind = record?.kind === "transcription" || record?.kind === "aiAction" ? record.kind : "managed";
      if (!ts || units <= 0 || !Number.isFinite(Date.parse(ts))) return null;
      return {
        id: sanitizeString(record?.id) ?? crypto.randomUUID(),
        ts,
        units,
        actionUnits: Math.max(0, actionUnits),
        kind,
      };
    })
    .filter((entry): entry is UsageEvent => Boolean(entry));
}

async function readUsageEvents(store: KvNamespaceLike, deviceId: string, nowMs: number): Promise<UsageEvent[]> {
  const oldestMs = nowMs - WEEKLY_MS;
  return normalizeUsageEvents(parseJson<unknown>(await store.get(buildUsageEventsKey(deviceId)), []))
    .filter((event) => Date.parse(event.ts) >= oldestMs)
    .sort((left, right) => left.ts.localeCompare(right.ts));
}

async function writeUsageEvents(store: KvNamespaceLike, deviceId: string, events: UsageEvent[]): Promise<void> {
  await store.put(buildUsageEventsKey(deviceId), JSON.stringify(events), {
    expirationTtl: USAGE_EVENT_TTL_SECONDS,
  });
}

async function readRecentDeviceIndex(store: KvNamespaceLike): Promise<RecentIndexEntry[]> {
  return parseJson<RecentIndexEntry[]>(await store.get(DEVICE_RECENT_INDEX_KEY), []);
}

async function writeRecentDeviceIndex(store: KvNamespaceLike, items: RecentIndexEntry[]): Promise<void> {
  await store.put(DEVICE_RECENT_INDEX_KEY, JSON.stringify(items.slice(0, DEVICE_RECENT_LIMIT)), {
    expirationTtl: DEVICE_TTL_SECONDS,
  });
}

async function indexDeviceRecord(store: KvNamespaceLike, record: DeviceRecord): Promise<void> {
  const recent = await readRecentDeviceIndex(store);
  const nextRecent = [
    { id: record.deviceId, ts: record.lastSeenAt },
    ...recent.filter((entry) => entry.id !== record.deviceId),
  ];
  await writeRecentDeviceIndex(store, nextRecent);
}

function buildUsageWindow(events: UsageEvent[], nowMs: number, windowMs: number, limit: number): ManagedUsageWindow {
  const cutoffMs = nowMs - windowMs;
  const windowEvents = events.filter((event) => Date.parse(event.ts) >= cutoffMs);
  const used = windowEvents.reduce((sum, event) => sum + event.units, 0);
  const nextRecoveryMs = windowEvents.length > 0 ? Date.parse(windowEvents[0].ts) + windowMs : nowMs;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt: new Date(nextRecoveryMs).toISOString(),
  };
}

function buildActionUsageWindow(events: UsageEvent[], nowMs: number, windowMs: number, limit: number): ManagedUsageWindow {
  const cutoffMs = nowMs - windowMs;
  const windowEvents = events.filter((event) => Date.parse(event.ts) >= cutoffMs);
  const used = windowEvents.reduce((sum, event) => sum + event.actionUnits, 0);
  const nextRecoveryMs = windowEvents.length > 0 ? Date.parse(windowEvents[0].ts) + windowMs : nowMs;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt: new Date(nextRecoveryMs).toISOString(),
  };
}

function deriveQuotaState(windows: Record<ManagedUsageWindowName, ManagedUsageWindow>): Pick<ManagedQuotaLimits, "state" | "blockedWindow"> {
  const blockedWindow = windows.rolling5h.remaining <= 0 ? "rolling5h" : windows.weekly.remaining <= 0 ? "weekly" : null;
  const lowestRemainingRatio = Math.min(
    windows.rolling5h.limit > 0 ? windows.rolling5h.remaining / windows.rolling5h.limit : 0,
    windows.weekly.limit > 0 ? windows.weekly.remaining / windows.weekly.limit : 0,
  );
  return {
    blockedWindow,
    state: blockedWindow ? (windows.rolling5h.limit === 0 || windows.weekly.limit === 0 ? "paused" : "blocked") : lowestRemainingRatio <= 0.15 ? "almost_used" : "ok",
  };
}

function buildManagedUsageLimits(record: DeviceRecord, policy: ManagedUsagePolicy, events: UsageEvent[], nowMs: number): ManagedUsageLimits {
  const windows = {
    rolling5h: buildActionUsageWindow(events, nowMs, ROLLING_5H_MS, effectiveLimit(policy.group.rolling5hLimit, policy)),
    weekly: buildActionUsageWindow(events, nowMs, WEEKLY_MS, effectiveLimit(policy.group.weeklyLimit, policy)),
  };
  const { state, blockedWindow } = deriveQuotaState(windows);
  return {
    unit: "managedUsageUnit",
    state,
    blockedWindow,
    windows,
    policy: {
      policyId: record.policyId,
      matchedCohort: policy.quotaProfileId ?? policy.matchedCohort,
      quotaMultiplier: policy.group.quotaMultiplier,
      globalMultiplier: policy.globalMultiplier,
    },
  };
}

function buildManagedQuotaLimits(
  record: DeviceRecord,
  policy: ManagedUsagePolicy,
  events: UsageEvent[],
  nowMs: number,
  options: {
    kind: UsageEvent["kind"];
    unit: ManagedQuotaLimits["unit"];
    label: string;
    rolling5hLimit: number;
    weeklyLimit: number;
  },
): ManagedQuotaLimits {
  const quotaEvents = events.filter((event) => event.kind === options.kind);
  const windows = {
    rolling5h: buildUsageWindow(quotaEvents, nowMs, ROLLING_5H_MS, effectiveLimit(options.rolling5hLimit, policy)),
    weekly: buildUsageWindow(quotaEvents, nowMs, WEEKLY_MS, effectiveLimit(options.weeklyLimit, policy)),
  };
  const { state, blockedWindow } = deriveQuotaState(windows);
  return {
    unit: options.unit,
    label: options.label,
    state,
    blockedWindow,
    windows,
    policy: {
      policyId: record.policyId,
      matchedCohort: policy.quotaProfileId ?? policy.matchedCohort,
      quotaMultiplier: policy.group.quotaMultiplier,
      globalMultiplier: policy.globalMultiplier,
    },
  };
}

async function buildDeviceLimits(store: KvNamespaceLike, runtimePolicy: Record<string, unknown>, record: DeviceRecord): Promise<DeviceLimits> {
  const nowMs = Date.now();
  const policy = resolveManagedUsagePolicy(runtimePolicy, record);
  const events = await readUsageEvents(store, record.deviceId, nowMs);
  return {
    managedUsage: buildManagedUsageLimits(record, policy, events, nowMs),
    transcription: buildManagedQuotaLimits(record, policy, events, nowMs, {
      kind: "transcription",
      unit: "audioSecond",
      label: "Transcription",
      rolling5hLimit: policy.group.transcriptionRolling5hSeconds,
      weeklyLimit: policy.group.transcriptionWeeklySeconds,
    }),
    aiActions: buildManagedQuotaLimits(record, policy, events, nowMs, {
      kind: "aiAction",
      unit: "aiAction",
      label: "AI actions",
      rolling5hLimit: policy.group.aiActionsRolling5hLimit,
      weeklyLimit: policy.group.aiActionsWeeklyLimit,
    }),
  };
}

function getRetryAfterSeconds(limits: ManagedUsageLimits): number | null {
  const blockedWindow = limits.blockedWindow;
  if (!blockedWindow) return null;
  const resetMs = Date.parse(limits.windows[blockedWindow].resetsAt);
  if (!Number.isFinite(resetMs)) return null;
  return Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
}

function getQuotaRetryAfterSeconds(limits: ManagedUsageLimits | ManagedQuotaLimits): number | null {
  const blockedWindow = limits.blockedWindow;
  if (!blockedWindow) return null;
  const resetMs = Date.parse(limits.windows[blockedWindow].resetsAt);
  if (!Number.isFinite(resetMs)) return null;
  return Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
}

function parseUsageKind(value: unknown): UsageEvent["kind"] {
  return value === "transcription" || value === "aiAction" ? value : "managed";
}

function resolveUsageEstimate(payload: ExecutionPreflightPayload, kind: UsageEvent["kind"], policy: ManagedUsagePolicy): number {
  const rawEstimate = readNumber(payload.estimate, Number.NaN);
  if (Number.isFinite(rawEstimate) && rawEstimate > 0) {
    return Math.ceil(rawEstimate);
  }
  return kind === "transcription" ? 60 : policy.estimatePerRequest;
}

function quotaWouldExceed(limits: ManagedUsageLimits | ManagedQuotaLimits, estimate: number): ManagedUsageWindowName | null {
  if (limits.windows.rolling5h.used + estimate > limits.windows.rolling5h.limit) return "rolling5h";
  if (limits.windows.weekly.used + estimate > limits.windows.weekly.limit) return "weekly";
  return null;
}

function markBlocked<T extends ManagedUsageLimits | ManagedQuotaLimits>(limits: T, blockedWindow: ManagedUsageWindowName): T {
  limits.blockedWindow = blockedWindow;
  limits.state = limits.windows[blockedWindow].limit === 0 ? "paused" : "blocked";
  return limits;
}

function applyPolicyProfiles(basePolicy: Record<string, unknown>, policyId: string | null): Record<string, unknown> {
  const next = cloneJsonRecord(basePolicy);
  if (!policyId) return next;

  const assignment = resolvePolicyProfileAssignment(basePolicy, policyId);
  if (!assignment) return next;

  const profileRefs: Array<[string, string | undefined]> = [
    ["ui", assignment.uiProfile],
    ["capabilities", assignment.capabilityProfile],
    ["llm", assignment.llmProfile],
    ["voiceRouting", assignment.voiceRoutingProfile],
    ["prompts", assignment.promptProfile],
    ["settingsDefaults", assignment.settingsDefaultsProfile],
  ];
  for (const [kind, profileId] of profileRefs) {
    const profile = profileId ? resolvePolicyProfile(basePolicy, kind, profileId) : null;
    if (profile) mergeJsonRecord(next, profile);
  }
  return next;
}

function resolvePolicyProfileAssignment(basePolicy: Record<string, unknown>, policyId: string): PolicyProfileAssignment | null {
  const configuredAssignments = readNestedRecord(basePolicy, "policyAssignments");
  const configured = configuredAssignments ? readNestedRecord(configuredAssignments, policyId) : null;
  const builtIn = BUILT_IN_POLICY_ASSIGNMENTS[policyId] ?? null;
  if (configured) {
    return {
      uiProfile: sanitizeString(configured.uiProfile) ?? builtIn?.uiProfile,
      capabilityProfile: sanitizeString(configured.capabilityProfile) ?? builtIn?.capabilityProfile,
      quotaProfile: sanitizeString(configured.quotaProfile) ?? builtIn?.quotaProfile,
      llmProfile: sanitizeString(configured.llmProfile) ?? builtIn?.llmProfile,
      voiceRoutingProfile: sanitizeString(configured.voiceRoutingProfile) ?? builtIn?.voiceRoutingProfile,
      promptProfile: sanitizeString(configured.promptProfile) ?? builtIn?.promptProfile,
      settingsDefaultsProfile: sanitizeString(configured.settingsDefaultsProfile) ?? builtIn?.settingsDefaultsProfile,
    };
  }
  return builtIn;
}

function buildAdminProfileAssignment(basePolicy: Record<string, unknown>, policyId: string | null): ControlPlaneAdminDeviceRow["profiles"] {
  const assignment = policyId ? resolvePolicyProfileAssignment(basePolicy, policyId) : null;
  return {
    uiProfile: assignment?.uiProfile ?? null,
    capabilityProfile: assignment?.capabilityProfile ?? null,
    quotaProfile: assignment?.quotaProfile ?? null,
    llmProfile: assignment?.llmProfile ?? null,
    settingsDefaultsProfile: assignment?.settingsDefaultsProfile ?? null,
  };
}

function formatPolicyLabel(policyId: string): string {
  return policyId
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ") || policyId;
}

function buildAdminPolicyOptions(basePolicy: Record<string, unknown>): ControlPlaneAdminPolicyOption[] {
  const options = new Map<string, ControlPlaneAdminPolicyOption>();
  const addOption = (policyId: string | null, source: ControlPlaneAdminPolicyOption["source"]) => {
    if (!policyId || policyId === "default" || options.has(policyId)) return;
    const builtInLabel = policyId === "alpha-basic" ? "Alpha Basic" : policyId === "alpha-full" ? "Alpha Full" : policyId === "jp" ? "JP" : null;
    options.set(policyId, {
      policyId,
      policyLabel: builtInLabel ?? formatPolicyLabel(policyId),
      source,
    });
  };

  for (const policyId of Object.keys(BUILT_IN_POLICY_ASSIGNMENTS)) {
    addOption(policyId, "built-in");
  }

  const assignments = readNestedRecord(basePolicy, "policyAssignments");
  for (const policyId of Object.keys(assignments ?? {})) {
    addOption(policyId, "assignment");
  }

  const managedUsage = readNestedRecord(basePolicy, "managedUsage");
  const groups = readNestedRecord(managedUsage, "groups");
  for (const policyId of Object.keys(groups ?? {})) {
    if (readNestedRecord(groups, policyId)) {
      addOption(policyId, "quota-group");
    }
  }

  return [...options.values()].sort((left, right) => left.policyId.localeCompare(right.policyId));
}

async function buildControlPlaneAdminDeviceRow(
  store: KvNamespaceLike,
  policy: Record<string, unknown>,
  record: DeviceRecord,
): Promise<ControlPlaneAdminDeviceRow> {
  return {
    deviceId: record.deviceId,
    installId: record.installId,
    policyId: record.policyId,
    policyLabel: record.policyLabel,
    cohorts: record.cohorts,
    status: record.status,
    lastSeenAt: record.lastSeenAt,
    profiles: buildAdminProfileAssignment(policy, record.policyId),
    limits: await buildDeviceLimits(store, policy, record),
  };
}

async function readRecentDeviceRecords(store: KvNamespaceLike): Promise<DeviceRecord[]> {
  const recent = await readRecentDeviceIndex(store);
  const records = await Promise.all(recent.map(async (entry) => (
    normalizeDeviceRecord(parseJson<DeviceRecord | null>(await store.get(buildDeviceKey(entry.id)), null))
  )));
  return records
    .filter((record): record is DeviceRecord => Boolean(record))
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
}

async function readAccountPolicyAssignment(store: KvNamespaceLike, accountId: string): Promise<AccountPolicyAssignment | null> {
  const accountHandle = await buildAccountHandle(accountId);
  const assignment = parseJson<AccountPolicyAssignment | null>(await store.get(buildAccountPolicyKey(accountHandle)), null);
  if (!assignment || assignment.accountId !== accountId || assignment.accountHandle !== accountHandle) return null;
  return assignment;
}

async function readAccountSegmentsAssignment(store: KvNamespaceLike, accountId: string): Promise<AccountSegmentsAssignment | null> {
  const accountHandle = await buildAccountHandle(accountId);
  const assignment = parseJson<AccountSegmentsAssignment | null>(await store.get(buildAccountSegmentsKey(accountHandle)), null);
  if (!assignment || assignment.accountId !== accountId || assignment.accountHandle !== accountHandle) return null;
  return assignment;
}

async function readAccountBudgetAssignment(store: KvNamespaceLike, accountId: string): Promise<AccountBudgetAssignment | null> {
  const accountHandle = await buildAccountHandle(accountId);
  const assignment = parseJson<AccountBudgetAssignment | null>(await store.get(buildAccountBudgetKey(accountHandle)), null);
  if (!assignment || assignment.accountId !== accountId || assignment.accountHandle !== accountHandle) return null;
  return { ...assignment, budget: sanitizePolicyBudget(assignment.budget, null) };
}

async function readAccountGroupsAssignment(store: KvNamespaceLike, accountId: string): Promise<AccountGroupsAssignment | null> {
  const accountHandle = await buildAccountHandle(accountId);
  const assignment = parseJson<AccountGroupsAssignment | null>(await store.get(buildAccountGroupsKey(accountHandle)), null);
  if (!assignment || assignment.accountId !== accountId || assignment.accountHandle !== accountHandle) return null;
  return assignment;
}

function sanitizeVariantId(value: unknown): string | null {
  const candidate = sanitizeString(value)?.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return candidate && candidate.length >= 2 && candidate.length <= 48 ? candidate : null;
}

function sanitizeEngineId(value: unknown): string | null {
  return sanitizeVariantId(value);
}

function sanitizeEngineKind(value: unknown): ControlPlaneAdminEngineKind | null {
  return value === "transcription" || value === "postprocess" || value === "selectionTransform" ? value : null;
}

async function readAccountVariantsStore(store: KvNamespaceLike): Promise<AccountVariantsStore> {
  const raw = parseJson<unknown>(await store.get(buildAccountVariantsKey()), null);
  if (Array.isArray(raw)) return { variants: raw as ControlPlaneAdminAccountVariantOption[], deletedBuiltIns: [], engines: [], deletedBuiltInEngines: [], prompts: [], deletedBuiltInPrompts: [], groups: [], deletedBuiltInGroups: [], policyVariants: {}, policyEngines: {}, policyBudgets: {} };
  if (raw && typeof raw === "object") {
    const record = raw as Partial<AccountVariantsStore>;
    const rawPolicyVariants = record.policyVariants && typeof record.policyVariants === "object" ? record.policyVariants : {};
    const rawPolicyEngines = record.policyEngines && typeof record.policyEngines === "object" ? record.policyEngines : {};
    const rawPolicyBudgets = record.policyBudgets && typeof record.policyBudgets === "object" ? record.policyBudgets : {};
    return {
      variants: Array.isArray(record.variants) ? record.variants : [],
      deletedBuiltIns: sanitizeStringArray(record.deletedBuiltIns),
      engines: Array.isArray(record.engines) ? record.engines : [],
      deletedBuiltInEngines: sanitizeStringArray(record.deletedBuiltInEngines),
      prompts: Array.isArray(record.prompts) ? record.prompts : [],
      deletedBuiltInPrompts: sanitizeStringArray(record.deletedBuiltInPrompts),
      groups: Array.isArray(record.groups) ? record.groups : [],
      deletedBuiltInGroups: sanitizeStringArray(record.deletedBuiltInGroups),
      policyVariants: Object.fromEntries(Object.entries(rawPolicyVariants).map(([policyId, variants]) => [policyId, sanitizeStringArray(variants)])),
      policyEngines: sanitizePolicyEnginesMap(rawPolicyEngines as Record<string, unknown>),
      policyBudgets: sanitizePolicyBudgetsMap(rawPolicyBudgets as Record<string, unknown>),
    };
  }
  return { variants: [], deletedBuiltIns: [], engines: [], deletedBuiltInEngines: [], prompts: [], deletedBuiltInPrompts: [], groups: [], deletedBuiltInGroups: [], policyVariants: {}, policyEngines: {}, policyBudgets: {} };
}

async function writeAccountVariantsStore(store: KvNamespaceLike, value: AccountVariantsStore): Promise<void> {
  await store.put(buildAccountVariantsKey(), JSON.stringify(value), { expirationTtl: ACCOUNT_POLICY_TTL_SECONDS });
}

function normalizeAccountVariantOption(option: Partial<ControlPlaneAdminAccountVariantOption>, source: "built-in" | "custom" = "custom"): ControlPlaneAdminAccountVariantOption | null {
  const id = sanitizeVariantId(option?.id);
  const label = sanitizeString(option?.label);
  const description = sanitizeString(option?.description);
  const preset = sanitizeString(option?.preset) ?? "custom";
  const effects = sanitizeStringArray(option?.effects);
  if (!id || !label || !description) return null;
  return { id, label, description, preset, effects: effects.length ? effects : (VARIANT_PRESET_EFFECTS[preset] ?? VARIANT_PRESET_EFFECTS.custom), source };
}

async function readAccountVariantOptions(store: KvNamespaceLike): Promise<ControlPlaneAdminAccountVariantOption[]> {
  const stored = await readAccountVariantsStore(store);
  const deleted = new Set(stored.deletedBuiltIns.map((id) => sanitizeVariantId(id)).filter((id): id is string => Boolean(id)));
  const byId = new Map<string, ControlPlaneAdminAccountVariantOption>();
  for (const option of BUILT_IN_ACCOUNT_VARIANTS) if (!deleted.has(option.id)) byId.set(option.id, option);
  for (const option of stored.variants) {
    const normalized = normalizeAccountVariantOption(option, "custom");
    if (!normalized) continue;
    byId.set(normalized.id, normalized);
  }
  return [...byId.values()];
}

function normalizeGroupOption(option: Partial<ControlPlaneAdminGroupOption>, source: "built-in" | "custom" = "custom"): ControlPlaneAdminGroupOption | null {
  const id = sanitizeVariantId(option?.id);
  const label = sanitizeString(option?.label);
  const description = sanitizeString(option?.description) ?? "Grupo personalizado";
  const policyId = sanitizeString(option?.policyId) ?? null;
  const policyLabel = policyId ? sanitizeString(option?.policyLabel) ?? formatPolicyLabel(policyId) : null;
  if (!id || !label) return null;
  return { id, label, description, policyId, policyLabel, source };
}

async function readGroupOptions(store: KvNamespaceLike): Promise<ControlPlaneAdminGroupOption[]> {
  const stored = await readAccountVariantsStore(store);
  const deleted = new Set(stored.deletedBuiltInGroups.map((id) => sanitizeVariantId(id)).filter((id): id is string => Boolean(id)));
  const byId = new Map<string, ControlPlaneAdminGroupOption>();
  for (const option of BUILT_IN_GROUPS) if (!deleted.has(option.id)) byId.set(option.id, option);
  for (const option of stored.groups) {
    const normalized = normalizeGroupOption(option, "custom");
    if (!normalized) continue;
    byId.set(normalized.id, normalized);
  }
  return [...byId.values()];
}

function sanitizeAccountGroups(value: unknown, groupOptions: ControlPlaneAdminGroupOption[]): string[] {
  const allowed = new Set(groupOptions.map((option) => option.id));
  return [...new Set(sanitizeStringArray(value).map((group) => sanitizeVariantId(group)).filter((group): group is string => Boolean(group) && allowed.has(group)))];
}

function normalizeEngineOption(option: Partial<ControlPlaneAdminEngineOption>, source: "built-in" | "custom" = "custom"): ControlPlaneAdminEngineOption | null {
  const id = sanitizeEngineId(option?.id);
  const label = sanitizeString(option?.label);
  const kind = sanitizeEngineKind(option?.kind);
  const tier = sanitizeString(option?.tier) ?? "custom";
  const provider = sanitizeString(option?.provider) ?? "custom";
  const model = sanitizeString(option?.model) ?? "custom";
  const notes = sanitizeString(option?.notes) ?? "motor personalizado";
  const promptKey = sanitizeString(option?.promptKey) ?? "custom";
  const promptSummary = sanitizeString(option?.promptSummary) ?? "Prompt editable/custom.";
  if (!id || !label || !kind) return null;
  return { id, label, kind, tier, provider, model, notes, promptKey, promptSummary, source };
}

async function readPolicyEngineOptions(store: KvNamespaceLike): Promise<ControlPlaneAdminEngineOption[]> {
  const stored = await readAccountVariantsStore(store);
  const deleted = new Set(stored.deletedBuiltInEngines.map((id) => sanitizeEngineId(id)).filter((id): id is string => Boolean(id)));
  const byId = new Map<string, ControlPlaneAdminEngineOption>();
  for (const option of BUILT_IN_POLICY_ENGINES) if (!deleted.has(option.id)) byId.set(option.id, option);
  for (const option of stored.engines) {
    const normalized = normalizeEngineOption(option, "custom");
    if (!normalized) continue;
    byId.set(normalized.id, normalized);
  }
  return [...byId.values()];
}

function sanitizePromptKind(value: unknown): ControlPlaneAdminPromptOption["kind"] | null {
  return value === "assistant" ? "assistant" : sanitizeEngineKind(value);
}

function normalizePromptOption(option: Partial<ControlPlaneAdminPromptOption>, source: "built-in" | "custom" = "custom"): ControlPlaneAdminPromptOption | null {
  const id = sanitizeString(option?.id)?.trim();
  const label = sanitizeString(option?.label);
  const kind = sanitizePromptKind(option?.kind);
  const version = sanitizeString(option?.version) ?? "v1";
  const summary = sanitizeString(option?.summary) ?? "Prompt personalizado.";
  const content = typeof option?.content === "string" ? option.content : "";
  if (!id || !label || !kind) return null;
  return { id, label, kind, version, summary, content, source };
}

async function readPromptOptions(store: KvNamespaceLike): Promise<ControlPlaneAdminPromptOption[]> {
  const stored = await readAccountVariantsStore(store);
  const deleted = new Set(stored.deletedBuiltInPrompts.map((id) => sanitizeString(id)).filter((id): id is string => Boolean(id)));
  const byId = new Map<string, ControlPlaneAdminPromptOption>();
  for (const option of BUILT_IN_PROMPTS) if (!deleted.has(option.id)) byId.set(option.id, option);
  for (const option of stored.prompts) {
    const normalized = normalizePromptOption(option, "custom");
    if (!normalized) continue;
    byId.set(normalized.id, normalized);
  }
  return [...byId.values()];
}

function sanitizeAccountSegments(value: unknown, variantOptions: ControlPlaneAdminAccountVariantOption[]): string[] {
  const allowed = new Set(variantOptions.map((option) => option.id));
  return [...new Set(sanitizeStringArray(value).map((segment) => sanitizeVariantId(segment)).filter((segment): segment is string => Boolean(segment) && allowed.has(segment)))];
}

function variantIds(options: ControlPlaneAdminAccountVariantOption[]): string[] {
  return options.map((option) => option.id);
}

function sanitizePolicyVariantsMap(value: Record<string, string[]>, variantOptions: ControlPlaneAdminAccountVariantOption[]): Record<string, string[]> {
  return Object.fromEntries(Object.entries(value).map(([policyId, variants]) => [policyId, sanitizeAccountSegments(variants, variantOptions)]).filter(([, variants]) => variants.length > 0));
}

function defaultEngineId(kind: ControlPlaneAdminEngineKind): string {
  return kind === "transcription" ? "stt-groq-whisper-turbo" : kind === "postprocess" ? "postprocess-groq-gpt-oss-120b" : "transform-groq-llama-70b";
}

function defaultPolicyEngineSelection(policyId: string | null): ControlPlaneAdminPolicyEngineSelection {
  const normalized = sanitizeString(policyId)?.toLowerCase();
  return normalized === "alpha-basic"
    ? { transcription: "stt-groq-whisper-turbo", postprocess: "postprocess-off", selectionTransform: "transform-off" }
    : { transcription: "stt-groq-whisper-turbo", postprocess: "postprocess-groq-gpt-oss-120b", selectionTransform: "transform-groq-llama-70b" };
}

function sanitizePolicyEngineSelection(value: unknown, engineOptions?: ControlPlaneAdminEngineOption[], policyId?: string | null): ControlPlaneAdminPolicyEngineSelection {
  const defaults = defaultPolicyEngineSelection(policyId ?? null);
  const withDefaults = value && typeof value === "object" ? { ...defaults, ...(value as Record<string, unknown>) } : defaults;
  return sanitizePolicyEngineSelectionValue(withDefaults, engineOptions);
}

function sanitizePolicyEngineSelectionValue(value: unknown, engineOptions?: ControlPlaneAdminEngineOption[]): ControlPlaneAdminPolicyEngineSelection {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const pick = (key: ControlPlaneAdminEngineKind): string => {
    const selected = sanitizeEngineId(record[key]) ?? defaultEngineId(key);
    if (!engineOptions) return selected;
    return engineOptions.some((engine) => engine.kind === key && engine.id === selected) ? selected : defaultEngineId(key);
  };
  return {
    transcription: pick("transcription"),
    postprocess: pick("postprocess"),
    selectionTransform: pick("selectionTransform"),
  };
}

function sanitizePolicyEnginesMap(value: Record<string, unknown>, engineOptions?: ControlPlaneAdminEngineOption[]): Record<string, ControlPlaneAdminPolicyEngineSelection> {
  return Object.fromEntries(Object.entries(value).map(([policyId, engines]) => [policyId, sanitizePolicyEngineSelection(engines, engineOptions, policyId)]));
}

function sanitizeBudgetAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(4)) : null;
}

function defaultPolicyBudget(policyId: string | null): ControlPlaneAdminPolicyBudget {
  const normalized = sanitizeString(policyId)?.toLowerCase();
  if (normalized === "pro") return { dailyUsd: 5, monthlyUsd: 50, mode: "warn" };
  if (normalized === "alpha-full") return { dailyUsd: 1, monthlyUsd: 10, mode: "block" };
  if (normalized === "alpha-basic") return { dailyUsd: 0.25, monthlyUsd: 2, mode: "block" };
  return { dailyUsd: 0.5, monthlyUsd: 5, mode: "block" };
}

function sanitizePolicyBudget(value: unknown, policyId: string | null): ControlPlaneAdminPolicyBudget {
  const defaults = defaultPolicyBudget(policyId);
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    dailyUsd: sanitizeBudgetAmount(record.dailyUsd) ?? defaults.dailyUsd,
    monthlyUsd: sanitizeBudgetAmount(record.monthlyUsd) ?? defaults.monthlyUsd,
    mode: record.mode === "warn" ? "warn" : record.mode === "block" ? "block" : defaults.mode,
  };
}

function sanitizePolicyBudgetsMap(value: Record<string, unknown>): Record<string, ControlPlaneAdminPolicyBudget> {
  return Object.fromEntries(Object.entries(value).map(([policyId, budget]) => [policyId, sanitizePolicyBudget(budget, policyId)]));
}

function resolvePreflightEngineKind(payload: ExecutionPreflightPayload, usageKind: UsageEvent["kind"]): ControlPlaneAdminEngineKind {
  const explicit = sanitizeEngineKind(payload.engineKind);
  if (explicit) return explicit;
  return usageKind === "transcription" ? "transcription" : usageKind === "aiAction" ? "postprocess" : "postprocess";
}

function resolvePolicyEnginesForPreflight(
  policyId: string | null,
  storedSelection: ControlPlaneAdminPolicyEngineSelection | undefined,
  engineOptions: ControlPlaneAdminEngineOption[],
  selectedKind: ControlPlaneAdminEngineKind,
): ExecutionEngineResolution["engines"] {
  const selection = sanitizePolicyEngineSelection(storedSelection, engineOptions, policyId);
  const findEngine = (kind: ControlPlaneAdminEngineKind): ControlPlaneAdminEngineOption | null => {
    const id = selection[kind] ?? defaultEngineId(kind);
    return engineOptions.find((engine) => engine.kind === kind && engine.id === id) ?? null;
  };
  const byKind = {
    transcription: findEngine("transcription"),
    postprocess: findEngine("postprocess"),
    selectionTransform: findEngine("selectionTransform"),
  };
  return { selectedKind, selected: byKind[selectedKind], byKind };
}

export async function getControlPlaneAdminVariantConfig(store: KvNamespaceLike): Promise<ControlPlaneAdminVariantConfig> {
  const variantOptions = await readAccountVariantOptions(store);
  const engineOptions = await readPolicyEngineOptions(store);
  const promptOptions = await readPromptOptions(store);
  const stored = await readAccountVariantsStore(store);
  return {
    variantOptions,
    availableSegments: variantIds(variantOptions),
    engineOptions,
    promptOptions,
    policyVariants: sanitizePolicyVariantsMap(stored.policyVariants, variantOptions),
    policyEngines: sanitizePolicyEnginesMap(stored.policyEngines, engineOptions),
    policyBudgets: sanitizePolicyBudgetsMap(stored.policyBudgets),
  };
}

function resolvePolicyOptionLabel(options: ControlPlaneAdminPolicyOption[], policyId: string, fallback?: string | null): string {
  return sanitizeString(fallback) ?? options.find((option) => option.policyId === policyId)?.policyLabel ?? formatPolicyLabel(policyId);
}

type EffectiveRuntimeProfile = ExecutionEngineResolution["profile"];

async function resolveEffectiveRuntimeProfile(
  store: KvNamespaceLike,
  runtimePolicy: Record<string, unknown>,
  record: DeviceRecord,
): Promise<EffectiveRuntimeProfile> {
  const accountHandle = record.accountId ? await buildAccountHandle(record.accountId) : null;
  const accountAssignment = record.accountId ? await readAccountPolicyAssignment(store, record.accountId) : null;
  const accountBudget = record.accountId ? (await readAccountBudgetAssignment(store, record.accountId))?.budget ?? null : null;
  const groupOptions = record.accountId ? await readGroupOptions(store) : [];
  const groupsAssignment = record.accountId ? await readAccountGroupsAssignment(store, record.accountId) : null;
  const activeGroups = sanitizeAccountGroups(groupsAssignment?.groups ?? [], groupOptions);
  const policyOptions = buildAdminPolicyOptions(runtimePolicy);
  const groupMatch = activeGroups
    .map((groupId) => groupOptions.find((option) => option.id === groupId && option.policyId))
    .find((option): option is ControlPlaneAdminGroupOption & { policyId: string } => Boolean(option?.policyId && policyOptions.some((policy) => policy.policyId === option.policyId)));

  if (accountAssignment) {
    return {
      policyId: accountAssignment.policyId,
      policyLabel: accountAssignment.policyLabel,
      policySource: "account",
      accountHandle,
      accountBudget,
      groups: activeGroups,
      matchedGroup: null,
    };
  }

  const deviceOverride = record.policyId && record.policyId !== DEFAULT_POLICY_ID && policyOptions.some((option) => option.policyId === record.policyId)
    ? { policyId: record.policyId, policyLabel: record.policyLabel ?? resolvePolicyOptionLabel(policyOptions, record.policyId) }
    : null;
  if (deviceOverride) {
    return {
      policyId: deviceOverride.policyId,
      policyLabel: deviceOverride.policyLabel,
      policySource: "device",
      accountHandle,
      accountBudget,
      groups: activeGroups,
      matchedGroup: null,
    };
  }

  if (groupMatch) {
    return {
      policyId: groupMatch.policyId,
      policyLabel: groupMatch.policyLabel ?? resolvePolicyOptionLabel(policyOptions, groupMatch.policyId),
      policySource: "group",
      accountHandle,
      accountBudget,
      groups: activeGroups,
      matchedGroup: groupMatch.id,
    };
  }

  return {
    policyId: record.policyId,
    policyLabel: record.policyLabel,
    policySource: "base",
    accountHandle,
    accountBudget,
    groups: activeGroups,
    matchedGroup: null,
  };
}

async function buildControlPlaneAdminAccountRow(
  store: KvNamespaceLike,
  accountId: string,
  records: DeviceRecord[],
): Promise<ControlPlaneAdminAccountRow> {
  const assignment = await readAccountPolicyAssignment(store, accountId);
  const segmentsAssignment = await readAccountSegmentsAssignment(store, accountId);
  const budgetAssignment = await readAccountBudgetAssignment(store, accountId);
  const groupsAssignment = await readAccountGroupsAssignment(store, accountId);
  const variantOptions = await readAccountVariantOptions(store);
  const groupOptions = await readGroupOptions(store);
  const activeVariants = sanitizeAccountSegments(segmentsAssignment?.segments ?? [], variantOptions);
  const activeGroups = sanitizeAccountGroups(groupsAssignment?.groups ?? [], groupOptions);
  const accountHandle = await buildAccountHandle(accountId);
  const sorted = [...records].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
  const runtimePolicy = await getRuntimePolicy(store);
  const effectiveProfile = sorted[0]
    ? await resolveEffectiveRuntimeProfile(store, runtimePolicy.policy as Record<string, unknown>, sorted[0])
    : {
      policyId: assignment?.policyId ?? null,
      policyLabel: assignment?.policyLabel ?? null,
      policySource: assignment ? "account" as const : "base" as const,
      accountHandle,
      accountBudget: budgetAssignment?.budget ?? null,
      groups: activeGroups,
      matchedGroup: null,
    };
  const accountUser = redactAccountUser(accountId);
  return {
    accountHandle,
    accountIdRedacted: redactAccountId(accountId),
    userRedacted: accountUser.userRedacted,
    userEmail: accountUser.userEmail,
    provider: accountUser.provider,
    variants: activeVariants,
    segments: activeVariants,
    groups: activeGroups,
    policyId: assignment?.policyId ?? null,
    policyLabel: assignment?.policyLabel ?? null,
    effectivePolicyId: effectiveProfile.policyId,
    effectivePolicyLabel: effectiveProfile.policyLabel,
    effectivePolicySource: effectiveProfile.policySource,
    matchedGroup: effectiveProfile.matchedGroup,
    accountBudget: budgetAssignment?.budget ?? null,
    deviceCount: sorted.length,
    devices: sorted.slice(0, 20).map((record) => ({
      deviceIdRedacted: redactLongIdentifier(record.deviceId),
      policyId: record.policyId,
      policyLabel: record.policyLabel,
      status: record.status,
      lastSeenAt: record.lastSeenAt,
    })),
    lastSeenAt: sorted[0]?.lastSeenAt ?? assignment?.updatedAt ?? new Date(0).toISOString(),
  };
}

function resolvePolicyProfile(basePolicy: Record<string, unknown>, kind: string, profileId: string): Record<string, unknown> | null {
  const configuredProfiles = readNestedRecord(basePolicy, "policyProfiles");
  const configuredKind = configuredProfiles ? readNestedRecord(configuredProfiles, kind) : null;
  const configuredProfile = configuredKind ? readNestedRecord(configuredKind, profileId) : null;
  if (configuredProfile) return configuredProfile;
  return BUILT_IN_POLICY_PROFILES[kind]?.[profileId] ?? null;
}

export function parseExecutionMode(value: unknown): ExecutionMode | null {
  const mode = sanitizeString(value)?.toLowerCase();
  return mode === "managed" || mode === "byok" ? mode : null;
}

async function readRecentFeedbackIndex(store: KvNamespaceLike): Promise<RecentIndexEntry[]> {
  return parseJson<RecentIndexEntry[]>(await store.get(FEEDBACK_RECENT_INDEX_KEY), []);
}

async function writeRecentFeedbackIndex(store: KvNamespaceLike, items: RecentIndexEntry[]): Promise<void> {
  await store.put(FEEDBACK_RECENT_INDEX_KEY, JSON.stringify(items.slice(0, FEEDBACK_RECENT_LIMIT)), {
    expirationTtl: FEEDBACK_TTL_SECONDS,
  });
}

export async function registerDevice(
  store: KvNamespaceLike,
  payload: DeviceRegisterPayload,
  options: { authProviders?: string[]; accountId?: string | null } = {},
): Promise<DeviceRegisterResponse> {
  const installId = sanitizeString(payload.installId);
  if (!installId) {
    throw new Error("installId is required");
  }

  const existingDeviceId = sanitizeString(payload.deviceId);
  const mappedDeviceId = parseJson<string | null>(await store.get(buildInstallKey(installId)), null);
  const deviceId = existingDeviceId ?? mappedDeviceId ?? `dev_${crypto.randomUUID()}`;
  const recordKey = buildDeviceKey(deviceId);
  const previous = normalizeDeviceRecord(parseJson<DeviceRecord | null>(await store.get(recordKey), null));
  const ts = nowIso(payload.ts);
  const accountId = sanitizeString(options.accountId) ?? previous?.accountId ?? null;
  const accountAssignment = accountId ? await readAccountPolicyAssignment(store, accountId) : null;
  const policyId = accountAssignment?.policyId ?? previous?.policyId ?? DEFAULT_POLICY_ID;
  const policyLabel = accountAssignment?.policyLabel ?? previous?.policyLabel ?? DEFAULT_POLICY_LABEL;
  const status = previous?.status ?? "active";
  const nextRecord: DeviceRecord = {
    deviceId,
    installId,
    accountId,
    activated: status === "active",
    policyId,
    policyLabel,
    status,
    activatedAt: previous?.activatedAt ?? ts,
    firstSeenAt: previous?.firstSeenAt ?? ts,
    lastSeenAt: ts,
    appVersion: sanitizeString(payload.version),
    platform: sanitizeString(payload.platform),
    arch: sanitizeString(payload.arch),
    hostname: sanitizeString(payload.hostname),
    cohorts: resolveActivationCohorts(policyId, previous?.cohorts ?? []),
    experiments: previous?.experiments ?? null,
    feedback: previous?.feedback ?? {
      enabled: true,
      sampleRate: 1,
      postErrorPrompt: true,
      postExperimentPrompt: true,
    },
  };

  if (shouldPersistDeviceRecord(previous, mappedDeviceId, nextRecord)) {
    await store.put(recordKey, JSON.stringify(nextRecord), {
      expirationTtl: DEVICE_TTL_SECONDS,
    });
    await store.put(buildInstallKey(installId), JSON.stringify(deviceId), {
      expirationTtl: DEVICE_TTL_SECONDS,
    });
    await indexDeviceRecord(store, nextRecord);
  }

  const runtimePolicy = await getRuntimePolicy(store);
  const recipePolicy = await getRecipePolicy(store);
  const profile = await resolveEffectiveRuntimeProfile(store, runtimePolicy.policy as Record<string, unknown>, nextRecord);
  const effectiveRecord: DeviceRecord = { ...nextRecord, policyId: profile.policyId, policyLabel: profile.policyLabel };
  const isActivePolicy = nextRecord.activated && nextRecord.status === "active" && Boolean(profile.policyId);
  const effectivePolicy = applyPolicyProfiles(runtimePolicy.policy as Record<string, unknown>, isActivePolicy ? profile.policyId : null);
  const defaults = buildRegisterDefaultsFromRuntimePolicy(effectivePolicy as never, effectiveRecord.cohorts);
  defaults.recipePolicy = recipePolicy.policy;
  const limits = await buildDeviceLimits(store, effectivePolicy as Record<string, unknown>, effectiveRecord);

  return {
    ok: true,
    deviceId,
    activated: isActivePolicy,
    policyId: isActivePolicy ? profile.policyId : null,
    policyLabel: isActivePolicy ? profile.policyLabel : null,
    accountId: null,
    minVersion: null,
    auth: buildDeviceRegisterAuthPolicy(effectiveRecord, options.authProviders ?? []),
    features: buildFeatureFlagsFromRuntimePolicy(effectivePolicy as never),
    defaults,
    cohorts: nextRecord.cohorts,
    experiments: nextRecord.experiments,
    feedback: nextRecord.feedback,
    limits,
    telemetry: {
      enabled: true,
      intervalMs: 60_000,
      batchSize: 20,
    },
    transportPolicy: buildTransportPolicyFromRuntimePolicy(runtimePolicy.policy),
  };
}

export async function activateDevice(
  store: KvNamespaceLike,
  payload: DeviceActivatePayload,
  inviteCodes: Record<string, DeviceInviteDefinition>,
): Promise<DeviceActivateResponse> {
  const inviteCode = sanitizeInviteCode(payload.inviteCode);
  if (!inviteCode) {
    throw new Error("invite_code_required");
  }

  const invite = inviteCodes[inviteCode];
  if (!invite) {
    throw new Error("invalid_invite_code");
  }

  const installId = sanitizeString(payload.installId);
  if (!installId) {
    throw new Error("installId is required");
  }

  const existingDeviceId = sanitizeString(payload.deviceId);
  const mappedDeviceId = parseJson<string | null>(await store.get(buildInstallKey(installId)), null);
  const deviceId = existingDeviceId ?? mappedDeviceId ?? `dev_${crypto.randomUUID()}`;
  const recordKey = buildDeviceKey(deviceId);
  const previous = normalizeDeviceRecord(parseJson<DeviceRecord | null>(await store.get(recordKey), null));
  const ts = nowIso(payload.ts);
  const nextRecord: DeviceRecord = {
    deviceId,
    installId,
    accountId: previous?.accountId ?? null,
    activated: true,
    policyId: invite.policyId,
    policyLabel: invite.policyLabel,
    status: "active",
    activatedAt: previous?.activatedAt ?? ts,
    firstSeenAt: previous?.firstSeenAt ?? ts,
    lastSeenAt: ts,
    appVersion: sanitizeString(payload.version),
    platform: sanitizeString(payload.platform),
    arch: sanitizeString(payload.arch),
    hostname: sanitizeString(payload.hostname),
    cohorts: resolveActivationCohorts(invite.policyId, previous?.cohorts ?? ["alpha-private"]),
    experiments: previous?.experiments ?? null,
    feedback: previous?.feedback ?? {
      enabled: true,
      sampleRate: 1,
      postErrorPrompt: true,
      postExperimentPrompt: true,
    },
  };

  await store.put(recordKey, JSON.stringify(nextRecord), {
    expirationTtl: DEVICE_TTL_SECONDS,
  });
  await store.put(buildInstallKey(installId), JSON.stringify(deviceId), {
    expirationTtl: DEVICE_TTL_SECONDS,
  });
  await indexDeviceRecord(store, nextRecord);

  return {
    ok: true,
    deviceId,
    activated: true,
    policyId: invite.policyId,
    policyLabel: invite.policyLabel,
  };
}

export async function listControlPlaneAdminDevices(
  store: KvNamespaceLike,
  options: { limit?: number | null; cursor?: string | null } = {},
): Promise<ControlPlaneAdminDeviceList> {
  const runtimePolicy = await getRuntimePolicy(store);
  const recent = await readRecentDeviceIndex(store);
  const limit = Math.min(100, Math.max(1, Number(options.limit ?? 50) || 50));
  const offset = Math.max(0, Number(options.cursor ?? 0) || 0);
  const window = recent.slice(offset, offset + limit);
  const policy = runtimePolicy.policy as Record<string, unknown>;
  const devices = (await Promise.all(window.map(async (entry) => {
    const record = normalizeDeviceRecord(parseJson<DeviceRecord | null>(await store.get(buildDeviceKey(entry.id)), null));
    if (!record) return null;
    return buildControlPlaneAdminDeviceRow(store, policy, record);
  }))).filter((entry): entry is ControlPlaneAdminDeviceRow => Boolean(entry));

  return {
    ok: true,
    source: runtimePolicy.source,
    updatedAt: runtimePolicy.updatedAt,
    policyOptions: buildAdminPolicyOptions(policy),
    devices,
    nextCursor: recent.length > offset + window.length ? String(offset + window.length) : null,
  };
}

export async function listControlPlaneAdminAccounts(
  store: KvNamespaceLike,
  options: { limit?: number | null; cursor?: string | null } = {},
): Promise<ControlPlaneAdminAccountList> {
  const runtimePolicy = await getRuntimePolicy(store);
  const records = await readRecentDeviceRecords(store);
  const groups = new Map<string, DeviceRecord[]>();
  for (const record of records) {
    if (!record.accountId) continue;
    groups.set(record.accountId, [...(groups.get(record.accountId) ?? []), record]);
  }
  const limit = Math.min(100, Math.max(1, Number(options.limit ?? 50) || 50));
  const offset = Math.max(0, Number(options.cursor ?? 0) || 0);
  const accounts = (await Promise.all([...groups.entries()].map(([accountId, accountRecords]) => (
    buildControlPlaneAdminAccountRow(store, accountId, accountRecords)
  )))).sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
  const page = accounts.slice(offset, offset + limit);
  const policy = runtimePolicy.policy as Record<string, unknown>;
  const variantConfig = await getControlPlaneAdminVariantConfig(store);

  return {
    ok: true,
    source: runtimePolicy.source,
    updatedAt: runtimePolicy.updatedAt,
    policyOptions: buildAdminPolicyOptions(policy),
    availableSegments: variantConfig.availableSegments,
    variantOptions: variantConfig.variantOptions,
    groupOptions: await readGroupOptions(store),
    policyVariants: variantConfig.policyVariants,
    policyEngines: variantConfig.policyEngines,
    accounts: page,
    nextCursor: accounts.length > offset + page.length ? String(offset + page.length) : null,
  };
}

async function resolveAdminAccountId(
  store: KvNamespaceLike,
  payload: { accountHandle?: string | null; accountId?: string | null },
): Promise<{ accountId: string; accountHandle: string; records: DeviceRecord[] }> {
  const requestedHandle = sanitizeString(payload.accountHandle);
  let accountId = sanitizeString(payload.accountId);
  const records = await readRecentDeviceRecords(store);
  if (!accountId && requestedHandle) {
    for (const record of records) {
      if (!record.accountId) continue;
      if (await buildAccountHandle(record.accountId) === requestedHandle) {
        accountId = record.accountId;
        break;
      }
    }
  }
  if (!accountId) throw new Error("account not found");
  const accountHandle = await buildAccountHandle(accountId);
  if (requestedHandle && requestedHandle !== accountHandle) throw new Error("account not found");
  return { accountId, accountHandle, records };
}

export async function assignControlPlaneAdminAccountPolicy(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminAccountPolicyPayload,
): Promise<ControlPlaneAdminAccountPolicyResponse> {
  const runtimePolicy = await getRuntimePolicy(store);
  const policy = runtimePolicy.policy as Record<string, unknown>;
  const policyOptions = buildAdminPolicyOptions(policy);
  const variantOptions = await readAccountVariantOptions(store);
  const policyId = sanitizeString(payload.policyId);
  if (!policyId) {
    throw new Error("policyId is required");
  }
  if (!policyOptions.some((option) => option.policyId === policyId)) {
    throw new Error("unknown policyId");
  }

  const { accountId, accountHandle, records } = await resolveAdminAccountId(store, payload);
  const policyLabel = resolvePolicyOptionLabel(policyOptions, policyId, payload.policyLabel);
  const updatedAt = new Date().toISOString();
  const assignment: AccountPolicyAssignment = { accountHandle, accountId, policyId, policyLabel, updatedAt };
  await store.put(buildAccountPolicyKey(accountHandle), JSON.stringify(assignment), {
    expirationTtl: ACCOUNT_POLICY_TTL_SECONDS,
  });

  let devicesUpdated = 0;
  for (const record of records) {
    if (record.accountId !== accountId) continue;
    const nextRecord: DeviceRecord = {
      ...record,
      activated: record.status === "active",
      policyId,
      policyLabel,
      cohorts: resolveActivationCohorts(policyId, record.cohorts),
    };
    await store.put(buildDeviceKey(record.deviceId), JSON.stringify(nextRecord), {
      expirationTtl: DEVICE_TTL_SECONDS,
    });
    await indexDeviceRecord(store, nextRecord);
    devicesUpdated += 1;
  }

  const accountRecords = (await readRecentDeviceRecords(store)).filter((record) => record.accountId === accountId);
  return {
    ok: true,
    source: runtimePolicy.source,
    updatedAt: runtimePolicy.updatedAt,
    policyOptions,
    availableSegments: variantIds(variantOptions),
    variantOptions,
    account: await buildControlPlaneAdminAccountRow(store, accountId, accountRecords),
    devicesUpdated,
  };
}

export async function assignControlPlaneAdminAccountBudget(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminAccountBudgetPayload,
): Promise<ControlPlaneAdminAccountBudgetResponse> {
  const runtimePolicy = await getRuntimePolicy(store);
  const policy = runtimePolicy.policy as Record<string, unknown>;
  const policyOptions = buildAdminPolicyOptions(policy);
  const variantOptions = await readAccountVariantOptions(store);
  const { accountId, accountHandle, records } = await resolveAdminAccountId(store, payload);
  const budget = sanitizePolicyBudget(payload.budget, null);
  const updatedAt = new Date().toISOString();
  const assignment: AccountBudgetAssignment = { accountHandle, accountId, budget, updatedAt };
  await store.put(buildAccountBudgetKey(accountHandle), JSON.stringify(assignment), {
    expirationTtl: ACCOUNT_POLICY_TTL_SECONDS,
  });
  return {
    ok: true,
    source: runtimePolicy.source,
    updatedAt: runtimePolicy.updatedAt,
    policyOptions,
    availableSegments: variantIds(variantOptions),
    variantOptions,
    account: await buildControlPlaneAdminAccountRow(store, accountId, records),
  };
}

export async function createControlPlaneAdminGroup(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminGroupPayload,
): Promise<{ ok: true; source: "default" | "stored"; updatedAt: string; group: ControlPlaneAdminGroupOption; groupOptions: ControlPlaneAdminGroupOption[] }> {
  const runtimePolicy = await getRuntimePolicy(store);
  const label = sanitizeString(payload.label);
  if (!label) throw new Error("label is required");
  const id = sanitizeVariantId(payload.id) ?? sanitizeVariantId(label);
  if (!id) throw new Error("invalid group id");
  const policyOptions = buildAdminPolicyOptions(runtimePolicy.policy as Record<string, unknown>);
  const policyId = sanitizeString(payload.policyId) ?? null;
  if (policyId && !policyOptions.some((option) => option.policyId === policyId)) throw new Error("unknown policyId");
  const policyLabel = policyId ? resolvePolicyOptionLabel(policyOptions, policyId, payload.policyLabel) : null;
  const group = normalizeGroupOption({ ...payload, id, label, policyId, policyLabel }, "custom");
  if (!group) throw new Error("invalid group payload");
  const stored = await readAccountVariantsStore(store);
  await writeAccountVariantsStore(store, {
    ...stored,
    groups: [...stored.groups.filter((option) => sanitizeVariantId(option.id) !== id), group].sort((left, right) => left.id.localeCompare(right.id)),
    deletedBuiltInGroups: stored.deletedBuiltInGroups.filter((deletedId) => sanitizeVariantId(deletedId) !== id),
  });
  return { ok: true, source: runtimePolicy.source, updatedAt: runtimePolicy.updatedAt, group, groupOptions: await readGroupOptions(store) };
}

export async function assignControlPlaneAdminAccountGroups(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminAccountGroupsPayload,
): Promise<ControlPlaneAdminAccountGroupsResponse> {
  const runtimePolicy = await getRuntimePolicy(store);
  const policy = runtimePolicy.policy as Record<string, unknown>;
  const policyOptions = buildAdminPolicyOptions(policy);
  const groupOptions = await readGroupOptions(store);
  const { accountId, accountHandle, records } = await resolveAdminAccountId(store, payload);
  const groups = sanitizeAccountGroups(payload.groups, groupOptions);
  const updatedAt = new Date().toISOString();
  const assignment: AccountGroupsAssignment = { accountHandle, accountId, groups, updatedAt };
  await store.put(buildAccountGroupsKey(accountHandle), JSON.stringify(assignment), {
    expirationTtl: ACCOUNT_POLICY_TTL_SECONDS,
  });
  return {
    ok: true,
    source: runtimePolicy.source,
    updatedAt: runtimePolicy.updatedAt,
    policyOptions,
    groupOptions,
    account: await buildControlPlaneAdminAccountRow(store, accountId, records),
  };
}

export async function assignControlPlaneAdminAccountSegments(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminAccountSegmentsPayload,
): Promise<ControlPlaneAdminAccountSegmentsResponse> {
  const runtimePolicy = await getRuntimePolicy(store);
  const policy = runtimePolicy.policy as Record<string, unknown>;
  const policyOptions = buildAdminPolicyOptions(policy);
  const variantOptions = await readAccountVariantOptions(store);
  const { accountId, accountHandle } = await resolveAdminAccountId(store, payload);
  const segments = sanitizeAccountSegments(payload.variants ?? payload.segments, variantOptions);
  const updatedAt = new Date().toISOString();
  const assignment: AccountSegmentsAssignment = { accountHandle, accountId, segments, updatedAt };
  await store.put(buildAccountSegmentsKey(accountHandle), JSON.stringify(assignment), {
    expirationTtl: ACCOUNT_POLICY_TTL_SECONDS,
  });
  const accountRecords = (await readRecentDeviceRecords(store)).filter((record) => record.accountId === accountId);
  return {
    ok: true,
    source: runtimePolicy.source,
    updatedAt: runtimePolicy.updatedAt,
    policyOptions,
    availableSegments: variantIds(variantOptions),
    variantOptions,
    account: await buildControlPlaneAdminAccountRow(store, accountId, accountRecords),
  };
}

export async function createControlPlaneAdminAccountVariant(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminAccountVariantPayload,
): Promise<ControlPlaneAdminAccountVariantResponse> {
  const runtimePolicy = await getRuntimePolicy(store);
  const label = sanitizeString(payload.label);
  if (!label) throw new Error("label is required");
  const id = sanitizeVariantId(payload.id) ?? sanitizeVariantId(label);
  if (!id) throw new Error("invalid variant id");
  const preset = sanitizeString(payload.preset) ?? "custom";
  const description = sanitizeString(payload.description) ?? "variante personalizada";
  const effects = VARIANT_PRESET_EFFECTS[preset] ?? VARIANT_PRESET_EFFECTS.custom;
  const stored = await readAccountVariantsStore(store);
  const variant: ControlPlaneAdminAccountVariantOption = { id, label, description, preset, effects, source: "custom" };
  const nextStore: AccountVariantsStore = {
    ...stored,
    variants: [...stored.variants.filter((option) => sanitizeVariantId(option.id) !== id), variant].sort((left, right) => left.id.localeCompare(right.id)),
    deletedBuiltIns: stored.deletedBuiltIns.filter((deletedId) => sanitizeVariantId(deletedId) !== id),
  };
  await writeAccountVariantsStore(store, nextStore);
  const variantOptions = await readAccountVariantOptions(store);
  return {
    ok: true,
    source: runtimePolicy.source,
    updatedAt: runtimePolicy.updatedAt,
    variant,
    variantOptions,
    availableSegments: variantIds(variantOptions),
  };
}

export async function assignControlPlaneAdminPolicyVariants(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminPolicyVariantsPayload,
): Promise<ControlPlaneAdminVariantConfig & { ok: true; source: "default" | "stored"; updatedAt: string }> {
  const runtimePolicy = await getRuntimePolicy(store);
  const policy = runtimePolicy.policy as Record<string, unknown>;
  const policyOptions = buildAdminPolicyOptions(policy);
  const policyId = sanitizeString(payload.policyId);
  if (!policyId) throw new Error("policyId is required");
  if (!policyOptions.some((option) => option.policyId === policyId)) throw new Error("unknown policyId");
  const stored = await readAccountVariantsStore(store);
  const variantOptions = await readAccountVariantOptions(store);
  const variants = sanitizeAccountSegments(payload.variants, variantOptions);
  const nextPolicyVariants = { ...stored.policyVariants };
  if (variants.length) nextPolicyVariants[policyId] = variants;
  else delete nextPolicyVariants[policyId];
  await writeAccountVariantsStore(store, { ...stored, policyVariants: nextPolicyVariants });
  const config = await getControlPlaneAdminVariantConfig(store);
  return { ok: true, source: runtimePolicy.source, updatedAt: runtimePolicy.updatedAt, ...config };
}

export async function assignControlPlaneAdminPolicyEngines(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminPolicyEnginesPayload,
): Promise<ControlPlaneAdminVariantConfig & { ok: true; source: "default" | "stored"; updatedAt: string }> {
  const runtimePolicy = await getRuntimePolicy(store);
  const policy = runtimePolicy.policy as Record<string, unknown>;
  const policyOptions = buildAdminPolicyOptions(policy);
  const policyId = sanitizeString(payload.policyId);
  if (!policyId) throw new Error("policyId is required");
  if (!policyOptions.some((option) => option.policyId === policyId)) throw new Error("unknown policyId");
  const stored = await readAccountVariantsStore(store);
  const engineOptions = await readPolicyEngineOptions(store);
  await writeAccountVariantsStore(store, { ...stored, policyEngines: { ...stored.policyEngines, [policyId]: sanitizePolicyEngineSelection(payload.engines, engineOptions) } });
  const config = await getControlPlaneAdminVariantConfig(store);
  return { ok: true, source: runtimePolicy.source, updatedAt: runtimePolicy.updatedAt, ...config };
}

export async function assignControlPlaneAdminPolicyBudget(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminPolicyBudgetPayload,
): Promise<ControlPlaneAdminVariantConfig & { ok: true; source: "default" | "stored"; updatedAt: string }> {
  const runtimePolicy = await getRuntimePolicy(store);
  const policy = runtimePolicy.policy as Record<string, unknown>;
  const policyOptions = buildAdminPolicyOptions(policy);
  const policyId = sanitizeString(payload.policyId);
  if (!policyId) throw new Error("policyId is required");
  if (!policyOptions.some((option) => option.policyId === policyId)) throw new Error("unknown policyId");
  const stored = await readAccountVariantsStore(store);
  await writeAccountVariantsStore(store, { ...stored, policyBudgets: { ...stored.policyBudgets, [policyId]: sanitizePolicyBudget(payload.budget, policyId) } });
  const config = await getControlPlaneAdminVariantConfig(store);
  return { ok: true, source: runtimePolicy.source, updatedAt: runtimePolicy.updatedAt, ...config };
}

export async function createControlPlaneAdminEngine(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminEnginePayload,
): Promise<ControlPlaneAdminVariantConfig & { ok: true; source: "default" | "stored"; updatedAt: string; engine: ControlPlaneAdminEngineOption }> {
  const runtimePolicy = await getRuntimePolicy(store);
  const label = sanitizeString(payload.label);
  if (!label) throw new Error("label is required");
  const id = sanitizeEngineId(payload.id) ?? sanitizeEngineId(label);
  if (!id) throw new Error("invalid engine id");
  const engine = normalizeEngineOption({ ...payload, id, label }, "custom");
  if (!engine) throw new Error("invalid engine payload");
  const stored = await readAccountVariantsStore(store);
  await writeAccountVariantsStore(store, {
    ...stored,
    engines: [...stored.engines.filter((option) => sanitizeEngineId(option.id) !== id), engine].sort((left, right) => left.id.localeCompare(right.id)),
    deletedBuiltInEngines: stored.deletedBuiltInEngines.filter((deletedId) => sanitizeEngineId(deletedId) !== id),
  });
  const config = await getControlPlaneAdminVariantConfig(store);
  return { ok: true, source: runtimePolicy.source, updatedAt: runtimePolicy.updatedAt, engine, ...config };
}

export async function deleteControlPlaneAdminEngine(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminEngineDeletePayload,
): Promise<ControlPlaneAdminVariantConfig & { ok: true; source: "default" | "stored"; updatedAt: string; engine: ControlPlaneAdminEngineOption }> {
  const runtimePolicy = await getRuntimePolicy(store);
  const id = sanitizeEngineId(payload.id);
  if (!id) throw new Error("engine id is required");
  const stored = await readAccountVariantsStore(store);
  const isBuiltIn = BUILT_IN_POLICY_ENGINES.some((option) => option.id === id);
  const fallbackByKind = Object.fromEntries(BUILT_IN_POLICY_ENGINES.filter((engine) => engine.id === id).map((engine) => [engine.kind, defaultEngineId(engine.kind)]));
  const policyEngines = Object.fromEntries(Object.entries(stored.policyEngines).map(([policyId, engines]) => [policyId, {
    ...engines,
    transcription: engines.transcription === id ? fallbackByKind.transcription ?? defaultEngineId("transcription") : engines.transcription,
    postprocess: engines.postprocess === id ? fallbackByKind.postprocess ?? defaultEngineId("postprocess") : engines.postprocess,
    selectionTransform: engines.selectionTransform === id ? fallbackByKind.selectionTransform ?? defaultEngineId("selectionTransform") : engines.selectionTransform,
  }]));
  await writeAccountVariantsStore(store, {
    ...stored,
    engines: stored.engines.filter((option) => sanitizeEngineId(option.id) !== id),
    deletedBuiltInEngines: isBuiltIn ? [...new Set([...stored.deletedBuiltInEngines, id])] : stored.deletedBuiltInEngines.filter((deletedId) => sanitizeEngineId(deletedId) !== id),
    policyEngines,
  });
  const config = await getControlPlaneAdminVariantConfig(store);
  return { ok: true, source: runtimePolicy.source, updatedAt: runtimePolicy.updatedAt, engine: { id, label: id, kind: "postprocess", tier: "custom", provider: "deleted", model: "deleted", notes: "deleted", promptKey: "deleted", promptSummary: "deleted", source: "custom" }, ...config };
}

export async function createControlPlaneAdminPrompt(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminPromptPayload,
): Promise<ControlPlaneAdminVariantConfig & { ok: true; source: "default" | "stored"; updatedAt: string; prompt: ControlPlaneAdminPromptOption }> {
  const runtimePolicy = await getRuntimePolicy(store);
  const label = sanitizeString(payload.label);
  if (!label) throw new Error("label is required");
  const id = sanitizeString(payload.id)?.trim() || sanitizeString(label)?.replace(/\s+/g, ".");
  if (!id) throw new Error("invalid prompt id");
  const prompt = normalizePromptOption({ ...payload, id, label }, "custom");
  if (!prompt) throw new Error("invalid prompt payload");
  const stored = await readAccountVariantsStore(store);
  await writeAccountVariantsStore(store, {
    ...stored,
    prompts: [...stored.prompts.filter((option) => sanitizeString(option.id) !== id), prompt].sort((left, right) => left.id.localeCompare(right.id)),
    deletedBuiltInPrompts: stored.deletedBuiltInPrompts.filter((deletedId) => sanitizeString(deletedId) !== id),
  });
  const config = await getControlPlaneAdminVariantConfig(store);
  return { ok: true, source: runtimePolicy.source, updatedAt: runtimePolicy.updatedAt, prompt, ...config };
}

export async function deleteControlPlaneAdminPrompt(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminPromptDeletePayload,
): Promise<ControlPlaneAdminVariantConfig & { ok: true; source: "default" | "stored"; updatedAt: string; prompt: ControlPlaneAdminPromptOption }> {
  const runtimePolicy = await getRuntimePolicy(store);
  const id = sanitizeString(payload.id)?.trim();
  if (!id) throw new Error("prompt id is required");
  const stored = await readAccountVariantsStore(store);
  const isBuiltIn = BUILT_IN_PROMPTS.some((option) => option.id === id);
  await writeAccountVariantsStore(store, {
    ...stored,
    prompts: stored.prompts.filter((option) => sanitizeString(option.id) !== id),
    deletedBuiltInPrompts: isBuiltIn ? [...new Set([...stored.deletedBuiltInPrompts, id])] : stored.deletedBuiltInPrompts.filter((deletedId) => sanitizeString(deletedId) !== id),
  });
  const config = await getControlPlaneAdminVariantConfig(store);
  return { ok: true, source: runtimePolicy.source, updatedAt: runtimePolicy.updatedAt, prompt: { id, label: id, kind: "assistant", version: "deleted", summary: "deleted", content: "", source: "custom" }, ...config };
}

export async function deleteControlPlaneAdminAccountVariant(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminAccountVariantDeletePayload,
): Promise<ControlPlaneAdminAccountVariantResponse> {
  const runtimePolicy = await getRuntimePolicy(store);
  const id = sanitizeVariantId(payload.id);
  if (!id) throw new Error("variant id is required");
  const stored = await readAccountVariantsStore(store);
  const isBuiltIn = BUILT_IN_ACCOUNT_VARIANTS.some((option) => option.id === id);
  const nextPolicyVariants = Object.fromEntries(Object.entries(stored.policyVariants).map(([policyId, variants]) => [policyId, variants.filter((variantId) => sanitizeVariantId(variantId) !== id)]).filter(([, variants]) => variants.length > 0));
  const nextStore: AccountVariantsStore = {
    ...stored,
    variants: stored.variants.filter((option) => sanitizeVariantId(option.id) !== id),
    deletedBuiltIns: isBuiltIn ? [...new Set([...stored.deletedBuiltIns, id])] : stored.deletedBuiltIns.filter((deletedId) => sanitizeVariantId(deletedId) !== id),
    policyVariants: nextPolicyVariants,
  };
  await writeAccountVariantsStore(store, nextStore);
  const variantOptions = await readAccountVariantOptions(store);
  return {
    ok: true,
    source: runtimePolicy.source,
    updatedAt: runtimePolicy.updatedAt,
    variant: { id, label: id, description: "deleted", preset: "custom", effects: [], source: "custom" },
    variantOptions,
    availableSegments: variantIds(variantOptions),
  };
}

export async function assignControlPlaneAdminDevicePolicy(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminDevicePolicyPayload,
): Promise<ControlPlaneAdminDevicePolicyResponse> {
  const deviceId = sanitizeString(payload.deviceId);
  const policyId = sanitizeString(payload.policyId);
  if (!deviceId) {
    throw new Error("deviceId is required");
  }
  if (!policyId) {
    throw new Error("policyId is required");
  }

  const runtimePolicy = await getRuntimePolicy(store);
  const policy = runtimePolicy.policy as Record<string, unknown>;
  const policyOptions = buildAdminPolicyOptions(policy);
  const policyOption = policyOptions.find((option) => option.policyId === policyId);
  if (!policyOption) {
    throw new Error("unknown policyId");
  }

  const record = normalizeDeviceRecord(parseJson<DeviceRecord | null>(await store.get(buildDeviceKey(deviceId)), null));
  if (!record) {
    throw new Error("device not found");
  }

  const policyLabel = sanitizeString(payload.policyLabel) ?? policyOption.policyLabel;
  const nextRecord: DeviceRecord = {
    ...record,
    activated: record.status === "active",
    policyId,
    policyLabel,
    cohorts: resolveActivationCohorts(policyId, record.cohorts),
  };
  if (devicePolicyAssignmentChanged(record, nextRecord)) {
    await store.put(buildDeviceKey(deviceId), JSON.stringify(nextRecord), {
      expirationTtl: DEVICE_TTL_SECONDS,
    });
    await indexDeviceRecord(store, nextRecord);
  }

  return {
    ok: true,
    source: runtimePolicy.source,
    updatedAt: runtimePolicy.updatedAt,
    policyOptions,
    device: await buildControlPlaneAdminDeviceRow(store, policy, nextRecord),
  };
}

function resolveActivationCohorts(policyId: string, current: string[]): string[] {
  const base = current.filter((entry) => entry !== "alpha-full" && entry !== "alpha-basic" && entry !== "alpha-private" && entry !== "jp");
  return [...base, policyId];
}

export async function resolveExecutionEngineForDevice(
  store: KvNamespaceLike,
  payload: { deviceId?: string | null; usageKind?: string | null; engineKind?: string | null },
): Promise<ExecutionEngineResolution | null> {
  const deviceId = sanitizeString(payload.deviceId);
  if (!deviceId) return null;
  const record = normalizeDeviceRecord(parseJson<DeviceRecord | null>(await store.get(buildDeviceKey(deviceId)), null));
  if (!record || record.status !== "active") return null;
  const kind = parseUsageKind(payload.usageKind);
  const selectedKind = resolvePreflightEngineKind(payload, kind);
  const runtimePolicy = await getRuntimePolicy(store);
  const profile = await resolveEffectiveRuntimeProfile(store, runtimePolicy.policy as Record<string, unknown>, record);
  const variantConfig = await getControlPlaneAdminVariantConfig(store);
  const engines = resolvePolicyEnginesForPreflight(profile.policyId, variantConfig.policyEngines[profile.policyId ?? ""], variantConfig.engineOptions, selectedKind);
  return {
    profile,
    engines,
  };
}

export async function evaluateExecutionPreflight(
  store: KvNamespaceLike,
  payload: ExecutionPreflightPayload,
): Promise<ExecutionPreflightResponse> {
  const mode = parseExecutionMode(payload.mode);
  if (mode === "byok") {
    return {
      ok: true,
      allowed: true,
      reason: null,
    };
  }

  const explicitDeviceId = sanitizeString(payload.deviceId);
  const installId = sanitizeString(payload.installId);
  if (!installId) {
    return {
      ok: true,
      allowed: false,
      reason: "device_not_registered",
    };
  }

  const mappedDeviceId = parseJson<string | null>(await store.get(buildInstallKey(installId)), null);
  if (!mappedDeviceId || (explicitDeviceId && explicitDeviceId !== mappedDeviceId)) {
    return {
      ok: true,
      allowed: false,
      reason: "device_not_registered",
    };
  }

  const deviceId = mappedDeviceId;

  const record = parseJson<DeviceRecord | null>(await store.get(buildDeviceKey(deviceId)), null);
  const normalizedRecord = normalizeDeviceRecord(record);
  if (!normalizedRecord || normalizedRecord.installId !== installId || normalizedRecord.status !== "active") {
    return {
      ok: true,
      allowed: false,
      reason: "device_not_registered",
    };
  }

  const runtimePolicy = await getRuntimePolicy(store);
  const kind = parseUsageKind(payload.usageKind);
  const profile = await resolveEffectiveRuntimeProfile(store, runtimePolicy.policy as Record<string, unknown>, normalizedRecord);
  const effectiveRecord: DeviceRecord = { ...normalizedRecord, policyId: profile.policyId, policyLabel: profile.policyLabel };
  const effectivePolicy = applyPolicyProfiles(runtimePolicy.policy as Record<string, unknown>, profile.policyId);
  const limits = await buildDeviceLimits(store, effectivePolicy as Record<string, unknown>, effectiveRecord);
  const policy = resolveManagedUsagePolicy(effectivePolicy as Record<string, unknown>, effectiveRecord);
  const selectedKind = resolvePreflightEngineKind(payload, kind);
  const variantConfig = await getControlPlaneAdminVariantConfig(store);
  const engines = resolvePolicyEnginesForPreflight(profile.policyId, variantConfig.policyEngines[profile.policyId ?? ""], variantConfig.engineOptions, selectedKind);
  const estimate = resolveUsageEstimate(payload, kind, policy);
  const actionEstimate = kind === "managed" ? estimate : 1;
  const quota = kind === "transcription" ? limits.transcription : kind === "aiAction" ? limits.aiActions : limits.managedUsage;
  const blockedWindow = quotaWouldExceed(quota, estimate) ?? quotaWouldExceed(limits.managedUsage, actionEstimate);
  if (blockedWindow) {
    markBlocked(quota, blockedWindow);
    markBlocked(limits.managedUsage, blockedWindow);
    return {
      ok: true,
      allowed: false,
      reason: "quota_exceeded",
      retryAfterSeconds: getQuotaRetryAfterSeconds(quota),
      limits,
      profile,
      engines,
    };
  }

  const now = new Date();
  const events = await readUsageEvents(store, deviceId, now.getTime());
  events.push({ id: crypto.randomUUID(), ts: now.toISOString(), units: estimate, actionUnits: actionEstimate, kind });
  await writeUsageEvents(store, deviceId, events);
  const updatedLimits = await buildDeviceLimits(store, effectivePolicy as Record<string, unknown>, effectiveRecord);

  return {
    ok: true,
    allowed: true,
    reason: null,
    retryAfterSeconds: null,
    limits: updatedLimits,
    profile,
    engines,
  };
}

export async function persistFeedbackEvent(store: KvNamespaceLike, input: FeedbackEvent): Promise<void> {
  await store.put(buildFeedbackKey(input.id), JSON.stringify(input), {
    expirationTtl: FEEDBACK_TTL_SECONDS,
  });

  const recent = await readRecentFeedbackIndex(store);
  const nextRecent = [{ id: input.id, ts: input.ts }, ...recent.filter((entry) => entry.id !== input.id)];
  await writeRecentFeedbackIndex(store, nextRecent);
}

export async function listFeedbackEvents(
  store: KvNamespaceLike,
  filters: FeedbackListFilters = {},
): Promise<{ items: FeedbackEvent[]; nextCursor: string | null }> {
  const recent = await readRecentFeedbackIndex(store);
  const limit = Math.min(100, Math.max(1, Number(filters.limit ?? 50) || 50));
  const offset = Math.max(0, Number(filters.cursor ?? 0) || 0);
  const window = recent.slice(offset, offset + 250);
  const events = (await Promise.all(
    window.map(async (entry) => parseJson<FeedbackEvent | null>(await store.get(buildFeedbackKey(entry.id)), null)),
  )).filter((entry): entry is FeedbackEvent => Boolean(entry))
    .sort((left, right) => right.ts.localeCompare(left.ts));

  const query = sanitizeString(filters.q)?.toLowerCase() ?? "";
  const filtered = events.filter((event) => {
    if (filters.type && event.type !== filters.type) return false;
    if (filters.source && event.source !== filters.source) return false;
    if (filters.deviceId && event.deviceId !== filters.deviceId) return false;
    if (!query) return true;
    const haystack = [
      event.type,
      event.source,
      event.message,
      event.deviceId ?? "",
      event.installId ?? "",
      event.accountId ?? "",
      JSON.stringify(event.context ?? {}),
      JSON.stringify(event.experiments ?? {}),
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  const items = filtered.slice(0, limit);
  const nextCursor = filtered.length > limit
    ? String(offset + limit)
    : (recent.length > offset + window.length ? String(offset + window.length) : null);
  return { items, nextCursor };
}

export function buildFeedbackEvent(payload: unknown): FeedbackEvent {
  const record = sanitizeRecord(payload);
  if (!record) {
    throw new Error("invalid feedback payload");
  }

  const type = sanitizeString(record.type);
  const message = sanitizeString(record.message);
  const source = sanitizeString(record.source) ?? "manual";
  if (!type || !message) {
    throw new Error("feedback type and message are required");
  }
  if (!["bug", "confusing", "idea", "love-it"].includes(type)) {
    throw new Error("invalid feedback type");
  }

  return {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    type: type as FeedbackEvent["type"],
    source,
    message,
    deviceId: sanitizeString(record.deviceId),
    installId: sanitizeString(record.installId),
    accountId: sanitizeString(record.accountId),
    appVersion: sanitizeString(record.appVersion),
    loggedIn: Boolean(record.loggedIn),
    cohorts: sanitizeStringArray(record.cohorts),
    experiments: sanitizeRecord(record.experiments),
    features: sanitizeRecord(record.features),
    context: sanitizeRecord(record.context),
  };
}
