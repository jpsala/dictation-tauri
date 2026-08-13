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
