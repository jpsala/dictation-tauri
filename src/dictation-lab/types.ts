import type { LabRunEvidence } from "./evaluation";

export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type LaboratoryRole = "viewer" | "editor" | "publisher" | "owner";

export type LaboratorySession = {
  ok: true;
  role: LaboratoryRole;
  principalKey: string;
  recentGoogle: boolean;
};

/** The only runtime fields accepted by profile definitions. */
export type RecipeRuntimeOperation = JsonObject & {
  engineId: string;
  promptId?: string;
};

export type RecipeRuntime = JsonObject & {
  transcription: RecipeRuntimeOperation;
  postprocess: RecipeRuntimeOperation;
  selectionTransform: RecipeRuntimeOperation;
};

export type ProfileAccess = JsonObject & {
  capabilities: string[];
};

export type ProfileLimits = JsonObject & {
  mode: "block" | "warn";
  dailyUsd?: number;
  monthlyUsd?: number;
  quotaProfile?: string;
};

export type ProfileUserControls = JsonObject & {
  [key: string]: "hidden" | "visible-locked" | "editable";
};

export type ProfileDefaults = JsonObject & {
  [key: string]: string | number | boolean;
};

/** Canonical mutation payload. Version/profile metadata is deliberately outside this object. */
export type RecipeDefinition = {
  schemaVersion: 1;
  label: string;
  access: ProfileAccess;
  runtime: RecipeRuntime;
  limits: ProfileLimits;
  userControls: ProfileUserControls;
  defaults: ProfileDefaults;
  [key: string]: JsonValue;
};

export type ProfileVersionStatus = "draft" | "published" | "historical";

/** Server-owned metadata wrapped around one canonical definition. */
export type ProfileVersionMetadata = {
  version: number;
  status: ProfileVersionStatus;
  authorityRevision: number;
  createdAt: string;
  publishedAt: string | null;
  definition: RecipeDefinition;
};

export type LaboratoryProfile = {
  profileId: string;
  label: string;
  lifecycleStatus: string;
  revision: number;
  activePublishedVersion: number | null;
  currentDraftVersion: number | null;
  published: ProfileVersionMetadata | null;
  draft: ProfileVersionMetadata | null;
  versions: ProfileVersionMetadata[];
  /** Derived convenience list; every item retains its nested lifecycle metadata. */
  history: ProfileVersionMetadata[];
};

export type ProfilesResponse = { ok: true; profiles: LaboratoryProfile[] };

export type EngineOption = {
  id: string;
  kind: "transcription" | "postprocess" | "selectionTransform" | string;
  provider?: string;
  model?: string;
  providerLabel?: string;
  modelLabel?: string;
  lifecycleStatus?: string;
  availability?: string;
  revision?: number;
};

export type PromptOption = { id: string; kind: string; version: string; source?: string; lifecycleStatus?: string; availability?: string };
export type ConfigurationResponse = {
  ok: true;
  engineOptions: EngineOption[];
  promptOptions: PromptOption[];
  groupOptions: Array<{ id: string; label: string; policyId?: string | null }>;
};

export type CatalogEntryAvailability = {
  status: "available" | "partial" | "unavailable";
  reasonCode: string | null;
};

export type CatalogCompatibility = {
  profileRuntimeKinds: Array<"transcription" | "postprocess" | "selectionTransform">;
  prosodyModes: Array<"off" | "advisory">;
  requiresVocabularySnapshot: boolean;
};

export type LaboratoryCatalogEntry = {
  id: string;
  label: string;
  version: string;
  lifecycleStatus: "active" | "retired" | "experimental";
  availability: CatalogEntryAvailability;
  executionModes: Array<"provider-free-replay" | "provider-real">;
  compatibility: CatalogCompatibility;
  profileMaterialization: {
    engineId?: string;
    promptId?: string;
    defaults?: Record<string, string | number | boolean>;
  } | null;
};

export type LaboratoryCatalog = {
  schemaVersion: 1;
  revision: string;
  engines: LaboratoryCatalogEntry[];
  prompts: LaboratoryCatalogEntry[];
  sttRecipes: LaboratoryCatalogEntry[];
  postprocessRecipes: LaboratoryCatalogEntry[];
  prosodyModes: LaboratoryCatalogEntry[];
  vocabularyModes: Array<LaboratoryCatalogEntry & {
    snapshotPrerequisite: {
      required: boolean;
      immutableIdentityFields: readonly ["snapshotId", "revision", "source"];
    };
  }>;
  materializations: LaboratoryCatalogEntry[];
  providerAuthorization: {
    status: "unavailable";
    reasonCode: "authoritative_one_shot_grant_unavailable";
  };
};

export type CatalogResponse = { ok: true; catalog: LaboratoryCatalog };

export type AccountSummary = {
  accountHandle: string;
  label: string | null;
  status: string;
  lastSeenAt: string;
};
export type AccountsResponse = { ok: true; accounts: AccountSummary[]; nextCursor: string | null };

export type AuditRecord = {
  action: string;
  targetType: string;
  result: string;
  occurredAt: string;
  [key: string]: JsonValue;
};
export type AuditResponse = { schemaVersion: 1; records: AuditRecord[] };

export type ProfileMutationReceipt = {
  ok: true;
  data: {
    profile: { key: string; label: string; publishedVersion: number; revision: number };
    publication: { previousVersion: number | null; resultingVersion: number };
    audit: { id: string; action: "apply" | "rollback"; result: "success" };
    idempotentReplay: boolean;
  };
};
export type ProfileValidationReceipt = {
  ok: true;
  data: { profileId: string; revision: number; valid: true };
};

export type ProfilePreviewChange = {
  kind: "add" | "remove" | "change";
  path: string;
  before: JsonValue | null;
  after: JsonValue | null;
};

export type ProfilePreviewReceipt = {
  ok: true;
  data: {
    profileId: string;
    revision: number;
    baseVersion: number | null;
    candidateLabel: string;
    candidateFingerprint: string;
    changed: boolean;
    changes: ProfilePreviewChange[];
    truncated: boolean;
  };
};

export type EvidenceIdentityLayer = {
  availability: LabAvailability;
  value: JsonValue | null;
  source: string | null;
};

export type EvidenceIdentity = {
  configured: JsonValue | null;
  resolved: JsonValue | null;
  observed: JsonValue | null;
  configuredState?: EvidenceIdentityLayer;
  resolvedState?: EvidenceIdentityLayer;
  observedState?: EvidenceIdentityLayer;
};

export type LaboratoryResourceName =
  | "profiles"
  | "configuration"
  | "catalog"
  | "accounts"
  | "audit"
  | "history";

export type LaboratoryResourceState = {
  status: "available" | "partial" | "unavailable";
  code: string | null;
};

export type LaboratoryLoad = {
  session: LaboratorySession;
  profiles: ProfilesResponse;
  configuration: ConfigurationResponse;
  catalog: LaboratoryCatalog | null;
  accounts: AccountsResponse;
  audit: AuditResponse;
  runs: readonly LabRunEvidence[];
  resources: Record<LaboratoryResourceName, LaboratoryResourceState>;
};

export type LabAvailability = {
  status: "available" | "partial" | "unavailable";
  missing: string[];
};

export type LabArtifactRef = {
  id: string;
  kind: "run" | "corpus" | "sample" | "private-text" | "audio";
  availability: LabAvailability;
};

export type LabArtifactIndex = {
  schemaVersion: 1;
  rootId: "transcription-quality";
  generatedAt: string;
  runs: LabRunSummary[];
  corpora: LabCorpusSummary[];
  availability: LabAvailability;
};

export type LabCorpusSummary = {
  corpusId: string;
  version: string;
  sampleCount: number;
  approvedGoldCount: number;
  audioAvailableCount: number;
  categories: string[];
  difficulties: string[];
  artifact: LabArtifactRef;
};

export type LabRunSummary = {
  runId: string;
  schemaVersion: string;
  status: "planned" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string | null;
  completedAt: string | null;
  corpusId: string;
  sampleCount: number;
  candidateCount: number;
  resultCount: number;
  providerCalls: { enabled: boolean; maxRequests: number; observedRequests: number | null };
  estimatedCostUsd: number | null;
  observedCostUsd: number | null;
  candidates: LabCandidateSummary[];
  availability: LabAvailability;
};

export type LabMetricValue = {
  value: number | null;
  unit: "ratio" | "count" | "milliseconds" | "usd";
  availability: LabAvailability;
};

export type LabCandidateSummary = {
  candidateId: string;
  label: string;
  recipe: JsonObject;
  identity: EvidenceIdentity;
  sampleCount: number;
  coverage: LabMetricValue;
  wer: LabMetricValue;
  cer: LabMetricValue;
  entityAccuracy: LabMetricValue;
  structureAccuracy: LabMetricValue;
  semanticSafety: LabMetricValue;
  latency: LabMetricValue;
  cost: LabMetricValue;
  fallbackCount: LabMetricValue;
  regressionReasons: string[];
  availability: LabAvailability;
};

export type LabSampleSummary = {
  runId: string;
  sampleId: string;
  candidateId: string;
  language: string;
  categories: string[];
  difficulty: string;
  sensitivity: string;
  goldStatus: string;
  audio: LabArtifactRef;
  raw: LabArtifactRef;
  final: LabArtifactRef;
  gold: LabArtifactRef;
  scores: {
    wer: number | null;
    cer: number | null;
    entities: number | null;
    structure: number | null;
    semanticSafety: number | null;
  };
  fallback: { used: boolean | null; reasons: string[] };
  latencyMs: number | null;
  costUsd: number | null;
  availability: LabAvailability;
};

export type LabExperimentDefinition = {
  schemaVersion: 1;
  mode: "provider-free-replay" | "provider-real";
  corpusId: string;
  sampleIds: string[];
  sttRecipes: string[];
  materializations: string[];
  postprocessRecipes: string[];
  prosodyModes: Array<"off" | "advisory">;
  vocabularyModes: Array<"off" | "automatic" | "ask">;
  baselineCandidateId: string | null;
};

export type LabExperimentEstimate = {
  definitionHash: string;
  sampleCount: number;
  candidateCount: number;
  combinationCount: number;
  sttCalls: number;
  postprocessCalls: number;
  reusedRawCount: number;
  maxRequests: number;
  maxCostUsd: number;
  providerRequired: boolean;
  oneVariableWarnings: string[];
};

export type LabJobSnapshot = {
  jobId: string;
  state: "queued" | "running" | "completed" | "failed" | "cancelled";
  mode: LabExperimentDefinition["mode"];
  estimate: LabExperimentEstimate;
  completedUnits: number;
  totalUnits: number;
  runId: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LabHumanVerdictMutation = {
  runId: string;
  sampleId: string;
  candidateId: string;
  verdict: "better" | "same" | "lost-content" | "added-content" | "changed-intent" | "improved-structure" | "improved-terms";
  expectedRevision: number | null;
};

export type PromotionDraft = {
  profileId: string;
  expectedRevision: number;
  sourceRunId: string;
  sourceCandidateId: string;
  definition: RecipeDefinition;
  provenance: {
    kind: "transcription-quality-candidate";
    runId: string;
    candidateId: string;
  };
};
