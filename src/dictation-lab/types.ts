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

export type RecipeRuntimeOperation = {
  engineId?: string;
  promptId?: string;
  language?: string;
  enabled?: boolean;
  [key: string]: JsonValue | undefined;
};

export type RecipeDefinition = JsonObject & {
  schemaVersion?: number;
  profileId?: string;
  label?: string;
  version?: number;
  status?: "draft" | "published";
  runtime?: JsonObject & {
    transcription?: RecipeRuntimeOperation;
    postprocess?: RecipeRuntimeOperation;
    selectionTransform?: RecipeRuntimeOperation;
  };
  semanticSafety?: JsonObject;
  vocabulary?: JsonObject;
  defaults?: JsonObject;
  limits?: JsonObject;
  userControls?: JsonObject;
  access?: JsonObject & { capabilities?: JsonValue[] };
};

export type LaboratoryProfile = {
  profileId: string;
  label: string;
  revision: number;
  published: RecipeDefinition | null;
  draft: RecipeDefinition | null;
  history: RecipeDefinition[];
};

export type ProfilesResponse = { ok: true; profiles: LaboratoryProfile[] };

export type EngineOption = {
  id: string;
  kind: string;
  provider?: string;
  model?: string;
  providerLabel?: string;
  modelLabel?: string;
  lifecycleStatus?: string;
  availability?: string;
  revision?: number;
};

export type PromptOption = { id: string; kind: string; version: string; source?: string };
export type ConfigurationResponse = {
  ok: true;
  engineOptions: EngineOption[];
  promptOptions: PromptOption[];
  groupOptions: Array<{ id: string; label: string; policyId?: string | null }>;
};

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
  path: string;
  before: JsonValue;
  after: JsonValue;
};

export type ProfilePreviewReceipt = {
  ok: true;
  data: {
    profileId: string;
    revision: number;
    baseVersion: number | null;
    candidateLabel: string;
    changed: boolean;
    changes: ProfilePreviewChange[];
    truncated: boolean;
  };
};

export type EvidenceIdentity = {
  configured: JsonValue | null;
  resolved: JsonValue | null;
  observed: JsonValue | null;
};

export type LaboratoryLoad = {
  session: LaboratorySession;
  profiles: ProfilesResponse;
  configuration: ConfigurationResponse;
  accounts: AccountsResponse;
  audit: AuditResponse;
  runs: readonly LabRunEvidence[];
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
