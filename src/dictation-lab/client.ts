import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  adaptResultHistoryEntryToLabEvidence,
  selectEligibleRuns,
} from "./evaluation";

import type {
  AccountsResponse,
  AuditResponse,
  ConfigurationResponse,
  LabArtifactIndex,
  LabExperimentDefinition,
  LabGateSource,
  LabMetadataExperimentPlan,
  JsonObject,
  JsonValue,
  LabHumanVerdictMutation,
  LabSampleSummary,
  LaboratoryCatalog,
  LaboratoryLoad,
  LaboratoryResourceName,
  LaboratoryResourceState,
  LaboratorySession,
  LaboratoryVocabularySnapshotIdentity,
  ProfileMutationReceipt,
  ProfilePreviewChange,
  ProfilePreviewReceipt,
  ProfilesResponse,
  ProfileValidationReceipt,
  ProfileVersionMetadata,
  RecipeDefinition,
} from "./types";
export type DictationLabRequest =
  | { kind: "session" }
  | { kind: "profiles" }
  | { kind: "configuration" }
  | { kind: "engineCatalog" }
  | { kind: "accounts" }
  | { kind: "devices" }
  | { kind: "audit" }
  | { kind: "usage" }
  | { kind: "laboratoryCatalog" }
  | { kind: "pricing" }
  | {
      kind: "validateProfile";
      profileId: string;
      expectedRevision: number;
      definition: RecipeDefinition;
    }
  | {
      kind: "previewProfile";
      profileId: string;
      expectedRevision: number;
      baseVersion?: number;
      definition: RecipeDefinition;
    }
  | {
      kind: "applyProfile";
      profileId: string;
      expectedRevision: number;
      definition: RecipeDefinition;
      confirmation: JsonObject;
    }
  | {
      kind: "rollbackProfile";
      profileId: string;
      expectedRevision: number;
      targetVersion: number;
      confirmation: JsonObject;
    }
  | {
      kind: "assignAccount";
      accountHandle: string;
      policyId: string;
      policyLabel?: string;
    };

export type DictationLabRunDetail = {
  run: JsonObject;
  summary: JsonObject;
  resultCount: number;
  availability: {
    status: "available" | "partial" | "unavailable";
    missing: string[];
  };
};

export type DictationLabAudioCapability = {
  available: boolean;
  kind: "audio";
  mimeType: string;
  bytes: number;
  audioId: string;
  readable: boolean;
};
export type DictationLabVerdictReceipt = {
  ok: true;
  revision: number;
  summary: {
    runId: string;
    sampleId: string;
    candidateId: string;
    verdict: LabHumanVerdictMutation["verdict"];
    contentHash: string;
  };
};

export class DictationLabUnavailableError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DictationLabUnavailableError";
    this.code = code;
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DictationLabUnavailableError(
      "DICTATION_LAB_RESPONSE_INVALID",
      "El servidor devolvió una respuesta no reconocida.",
    );
  }
  return value as Record<string, unknown>;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stableDefinitionFingerprint(value: unknown): string {
  return stableJson(value);
}

export function diffDefinition(
  before: unknown,
  after: unknown,
): ProfilePreviewChange[] {
  const changes: ProfilePreviewChange[] = [];
  const visit = (left: unknown, right: unknown, path: string): void => {
    if (stableJson(left) === stableJson(right)) return;
    if (
      left &&
      right &&
      typeof left === "object" &&
      typeof right === "object" &&
      !Array.isArray(left) &&
      !Array.isArray(right)
    ) {
      const leftRecord = left as Record<string, unknown>;
      const rightRecord = right as Record<string, unknown>;
      const keys = [
        ...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]),
      ].sort((a, b) => a.localeCompare(b));
      for (const key of keys)
        visit(leftRecord[key], rightRecord[key], path ? `${path}.${key}` : key);
      return;
    }
    changes.push({
      kind:
        left === undefined ? "add" : right === undefined ? "remove" : "change",
      path: path || "$",
      before: left === undefined ? null : (left as JsonValue),
      after: right === undefined ? null : (right as JsonValue),
    });
  };
  visit(before, after, "");
  return changes;
}

function profileVersion(value: unknown): ProfileVersionMetadata {
  const candidate = object(value);
  const status = String(candidate.status);
  if (
    !Number.isInteger(candidate.version) ||
    !["draft", "published", "historical"].includes(status) ||
    !Number.isInteger(candidate.authorityRevision) ||
    typeof candidate.createdAt !== "string" ||
    (candidate.publishedAt !== null &&
      typeof candidate.publishedAt !== "string")
  ) {
    throw new DictationLabUnavailableError(
      "DICTATION_LAB_PROFILE_VERSION_INVALID",
      "Una versión de perfil no conserva metadata canónica.",
    );
  }
  return {
    version: Number(candidate.version),
    status: status as ProfileVersionMetadata["status"],
    authorityRevision: Number(candidate.authorityRevision),
    createdAt: candidate.createdAt,
    publishedAt: candidate.publishedAt as string | null,
    definition: structuredClone(
      object(candidate.definition),
    ) as RecipeDefinition,
  };
}

function laboratoryCatalog(value: unknown): LaboratoryCatalog {
  const response = object(value);
  const candidate = object(
    response.ok === true && response.catalog ? response.catalog : value,
  );
  for (const key of [
    "engines",
    "prompts",
    "sttRecipes",
    "postprocessRecipes",
    "prosodyModes",
    "vocabularyModes",
    "materializations",
  ]) {
    if (!Array.isArray(candidate[key]))
      throw new DictationLabUnavailableError(
        "DICTATION_LAB_CATALOG_INVALID",
        "El catálogo del laboratorio no está disponible.",
      );
  }
  if (
    candidate.schemaVersion !== 1 ||
    (candidate.sttRecipes as unknown[]).length !== 4 ||
    (candidate.postprocessRecipes as unknown[]).length !== 3
  ) {
    throw new DictationLabUnavailableError(
      "DICTATION_LAB_CATALOG_INVALID",
      "El catálogo del laboratorio no coincide con la autoridad evaluativa.",
    );
  }
  return candidate as LaboratoryCatalog;
}

function vocabularySnapshotIdentity(
  value: unknown,
): LaboratoryVocabularySnapshotIdentity {
  const candidate = object(value);
  if (
    typeof candidate.snapshotId !== "string" ||
    typeof candidate.revision !== "string" ||
    typeof candidate.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(candidate.sha256) ||
    candidate.source !== "personal-vocabulary" ||
    candidate.scope !== "redacted" ||
    !Number.isInteger(candidate.ruleCount) ||
    typeof candidate.capturedAt !== "string"
  ) {
    throw new DictationLabUnavailableError(
      "snapshot_stale",
      "La identidad del snapshot de vocabulario no es válida.",
    );
  }
  return candidate as LaboratoryVocabularySnapshotIdentity;
}

function resource(
  status: LaboratoryResourceState["status"],
  code: string | null = null,
): LaboratoryResourceState {
  return { status, code };
}

function unavailableCode(reason: PromiseSettledResult<unknown>): string | null {
  if (reason.status === "fulfilled") return null;
  const value = reason.reason as { code?: unknown };
  return typeof value?.code === "string"
    ? value.code
    : "DICTATION_LAB_RESOURCE_UNAVAILABLE";
}

async function request<T>(payload: DictationLabRequest): Promise<T> {
  if (!isTauri()) {
    throw new DictationLabUnavailableError(
      "DICTATION_LAB_TAURI_REQUIRED",
      "El laboratorio está disponible únicamente en la aplicación de escritorio.",
    );
  }
  return invoke<T>("request_dictation_lab", { request: payload });
}

function session(value: unknown): LaboratorySession {
  const candidate = object(value);
  if (
    candidate.ok !== true ||
    !["viewer", "editor", "publisher", "owner"].includes(String(candidate.role))
  ) {
    throw new DictationLabUnavailableError(
      "DICTATION_LAB_SESSION_INVALID",
      "La sesión de Control Room no está disponible.",
    );
  }
  return candidate as LaboratorySession;
}

export function parseProfilesResponse(value: unknown): ProfilesResponse {
  const candidate = object(value);
  if (candidate.ok !== true || !Array.isArray(candidate.profiles)) {
    throw new DictationLabUnavailableError(
      "DICTATION_LAB_PROFILES_INVALID",
      "El catálogo de perfiles no está disponible.",
    );
  }
  const profiles = candidate.profiles.map((raw) => {
    const profile = object(raw);
    if (
      typeof profile.profileId !== "string" ||
      typeof profile.label !== "string" ||
      typeof profile.lifecycleStatus !== "string" ||
      !Number.isInteger(profile.revision) ||
      !Array.isArray(profile.versions)
    ) {
      throw new DictationLabUnavailableError(
        "DICTATION_LAB_PROFILE_INVALID",
        "Un perfil no conserva identidad y revisión canónicas.",
      );
    }
    const versions = profile.versions.map(profileVersion);
    const published =
      profile.published === null ? null : profileVersion(profile.published);
    const draft = profile.draft === null ? null : profileVersion(profile.draft);
    return {
      profileId: profile.profileId,
      label: profile.label,
      lifecycleStatus: profile.lifecycleStatus,
      revision: Number(profile.revision),
      activePublishedVersion:
        profile.activePublishedVersion === null
          ? null
          : Number(profile.activePublishedVersion),
      currentDraftVersion:
        profile.currentDraftVersion === null
          ? null
          : Number(profile.currentDraftVersion),
      published,
      draft,
      versions,
      history: versions.filter((version) => version.status === "historical"),
    };
  });
  return { ok: true, profiles };
}

function configuration(value: unknown): ConfigurationResponse {
  const candidate = object(value);
  if (
    candidate.ok !== true ||
    !Array.isArray(candidate.engineOptions) ||
    !Array.isArray(candidate.promptOptions)
  ) {
    throw new DictationLabUnavailableError(
      "DICTATION_LAB_CONFIGURATION_INVALID",
      "La configuración de Control Room no está disponible.",
    );
  }
  return candidate as ConfigurationResponse;
}

function accounts(value: unknown): AccountsResponse {
  const candidate = object(value);
  if (candidate.ok !== true || !Array.isArray(candidate.accounts)) {
    throw new DictationLabUnavailableError(
      "DICTATION_LAB_ACCOUNTS_INVALID",
      "Las asignaciones de cuenta no están disponibles.",
    );
  }
  return candidate as AccountsResponse;
}

function audit(value: unknown): AuditResponse {
  const candidate = object(value);
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.records)) {
    throw new DictationLabUnavailableError(
      "DICTATION_LAB_AUDIT_INVALID",
      "La auditoría no está disponible.",
    );
  }
  return candidate as AuditResponse;
}
function resultHistory(value: unknown): LaboratoryLoad["runs"] {
  if (!Array.isArray(value)) {
    throw new DictationLabUnavailableError(
      "DICTATION_LAB_HISTORY_INVALID",
      "El historial local no está disponible.",
    );
  }
  return selectEligibleRuns(
    value.map((entry) => adaptResultHistoryEntryToLabEvidence(object(entry))),
    {
      source: "dictation",
      limit: 50,
    },
  );
}

export type DictationLabClient = {
  load(): Promise<LaboratoryLoad>;
  reloadProfiles(): Promise<ProfilesResponse>;
  reloadAudit(): Promise<AuditResponse>;
  listArtifacts(): Promise<LabArtifactIndex>;
  loadRun(runId: string): Promise<DictationLabRunDetail>;
  loadSample(
    runId: string,
    sampleId: string,
    candidateId: string,
  ): Promise<LabSampleSummary>;
  readPrivateText(
    runId: string,
    sampleId: string,
    candidateId: string,
    kind: "raw" | "final" | "gold",
  ): Promise<string>;
  recordVerdict(
    mutation: LabHumanVerdictMutation,
  ): Promise<DictationLabVerdictReceipt>;
  resolveAudio(
    runId: string,
    sampleId: string,
    candidateId?: string,
  ): Promise<DictationLabAudioCapability>;
  captureVocabularySnapshot(): Promise<LaboratoryVocabularySnapshotIdentity>;
  listVocabularySnapshots(): Promise<
    readonly LaboratoryVocabularySnapshotIdentity[]
  >;
  resolveVocabularySnapshot(
    snapshotId: string,
  ): Promise<LaboratoryVocabularySnapshotIdentity>;
  validateDraft(
    profileId: string,
    expectedRevision: number,
    definition: RecipeDefinition,
  ): Promise<ProfileValidationReceipt>;
  previewDraft(
    profileId: string,
    expectedRevision: number,
    baseVersion: number | undefined,
    definition: RecipeDefinition,
  ): Promise<ProfilePreviewReceipt>;
  applyProfile(
    profileId: string,
    expectedRevision: number,
    definition: RecipeDefinition,
    phrase: string,
  ): Promise<ProfileMutationReceipt>;
  rollbackProfile(
    profileId: string,
    expectedRevision: number,
    targetVersion: number,
    phrase: string,
  ): Promise<ProfileMutationReceipt>;
  assignAccount(
    accountHandle: string,
    policyId: string,
    policyLabel?: string,
  ): Promise<unknown>;
};

export function createDictationLabClient(): DictationLabClient {
  return {
    async load() {
      const settled = await Promise.allSettled([
        request<unknown>({ kind: "session" }),
        request<unknown>({ kind: "profiles" }),
        request<unknown>({ kind: "configuration" }),
        invoke<unknown>("get_dictation_lab_catalog"),
        invoke<LabExperimentDefinition>("get_dictation_lab_local_plan"),
        invoke<LabGateSource[]>("list_dictation_lab_gate_sources"),
        request<unknown>({ kind: "accounts" }),
        request<unknown>({ kind: "audit" }),
        invoke<unknown[]>("list_result_history_entries"),
        invoke<unknown[]>("list_dictation_lab_vocabulary_snapshots"),
      ]);
      const [
        sessionValue,
        profilesValue,
        configurationValue,
        catalogValue,
        localReplayValue,
        gateSourcesValue,
        accountsValue,
        auditValue,
        historyValue,
        vocabularyValue,
      ] = settled;
      if (localReplayValue.status === "rejected") throw localReplayValue.reason;
      const authorizedSession =
        sessionValue.status === "fulfilled"
          ? session(sessionValue.value)
          : null;
      const parsedCatalog =
        catalogValue.status === "fulfilled"
          ? laboratoryCatalog(catalogValue.value)
          : null;
      const gateSources =
        gateSourcesValue.status === "fulfilled" ? gateSourcesValue.value : [];
      const gateASource = gateSources.find(
        (source) =>
          source.kind === "gate-a" &&
          source.status === "completed" &&
          source.completedRequestCount === 12 &&
          source.canonicalRawRefCount === 3,
      );
      const metadataExperiment = gateASource
        ? await invoke<LabMetadataExperimentPlan>(
            "plan_dictation_lab_metadata_experiment",
            { executionId: gateASource.executionId },
          ).catch(() => null)
        : null;
      const grantAuthorityAvailable = Boolean(
        authorizedSession &&
        ["editor", "publisher", "owner"].includes(authorizedSession.role) &&
        parsedCatalog?.providerAuthorization.status === "available",
      );
      const publishAvailable = Boolean(
        authorizedSession?.recentGoogle &&
        ["publisher", "owner"].includes(authorizedSession.role),
      );
      return {
        session: authorizedSession,
        profiles:
          profilesValue.status === "fulfilled"
            ? parseProfilesResponse(profilesValue.value)
            : { ok: true, profiles: [] },
        configuration:
          configurationValue.status === "fulfilled"
            ? configuration(configurationValue.value)
            : {
                ok: true,
                engineOptions: [],
                promptOptions: [],
                groupOptions: [],
              },
        catalog: parsedCatalog,
        localReplay: localReplayValue.value,
        gateSources,
        metadataExperiment,
        accounts:
          accountsValue.status === "fulfilled"
            ? accounts(accountsValue.value)
            : { ok: true, accounts: [], nextCursor: null },
        audit:
          auditValue.status === "fulfilled"
            ? audit(auditValue.value)
            : { schemaVersion: 1, records: [] },
        runs:
          historyValue.status === "fulfilled"
            ? resultHistory(historyValue.value)
            : [],
        vocabularySnapshots:
          vocabularyValue.status === "fulfilled"
            ? vocabularyValue.value.map(vocabularySnapshotIdentity)
            : [],
        resources: {
          session: resource(
            sessionValue.status === "fulfilled" ? "available" : "unavailable",
            unavailableCode(sessionValue),
          ),
          profiles: resource(
            profilesValue.status === "fulfilled" ? "available" : "unavailable",
            unavailableCode(profilesValue),
          ),
          configuration: resource(
            configurationValue.status === "fulfilled"
              ? "available"
              : "unavailable",
            unavailableCode(configurationValue),
          ),
          catalog: resource(
            catalogValue.status === "fulfilled" ? "available" : "unavailable",
            unavailableCode(catalogValue),
          ),
          accounts: resource(
            accountsValue.status === "fulfilled" ? "available" : "unavailable",
            unavailableCode(accountsValue),
          ),
          audit: resource(
            auditValue.status === "fulfilled" ? "available" : "unavailable",
            unavailableCode(auditValue),
          ),
          history: resource(
            historyValue.status === "fulfilled" ? "available" : "unavailable",
            unavailableCode(historyValue),
          ),
          localReplay: resource("available"),
          grantAuthority: resource(
            grantAuthorityAvailable ? "available" : "unavailable",
            grantAuthorityAvailable ? null : "grant-authority-unavailable",
          ),
          gateASource: resource(
            gateASource ? "available" : "unavailable",
            gateASource ? null : "gate-a-source-incomplete",
          ),
          gateBSource: resource(
            gateASource ? "available" : "unavailable",
            gateASource ? null : "gate-b-source-incomplete",
          ),
          publishCapability: resource(
            publishAvailable ? "available" : "unavailable",
            publishAvailable ? null : "recent-auth-required",
          ),
          vocabularySnapshots: resource(
            vocabularyValue.status === "fulfilled"
              ? "available"
              : "unavailable",
            unavailableCode(vocabularyValue),
          ),
        } satisfies Record<LaboratoryResourceName, LaboratoryResourceState>,
      };
    },
    async reloadProfiles() {
      return parseProfilesResponse(
        await request<unknown>({ kind: "profiles" }),
      );
    },
    async reloadAudit() {
      return audit(await request<unknown>({ kind: "audit" }));
    },
    async listArtifacts() {
      return invoke<LabArtifactIndex>("list_dictation_lab_artifacts");
    },
    async loadRun(runId) {
      return invoke<DictationLabRunDetail>("load_dictation_lab_run", { runId });
    },
    async loadSample(runId, sampleId, candidateId) {
      return invoke<LabSampleSummary>("load_dictation_lab_sample", {
        runId,
        sampleId,
        candidateId,
      });
    },
    async readPrivateText(runId, sampleId, candidateId, kind) {
      return invoke<string>("read_dictation_lab_private_text", {
        runId,
        sampleId,
        candidateId,
        kind,
      });
    },
    async resolveAudio(runId, sampleId, candidateId) {
      return invoke<DictationLabAudioCapability>(
        "resolve_dictation_lab_audio",
        { runId, sampleId, candidateId },
      );
    },
    async captureVocabularySnapshot() {
      return vocabularySnapshotIdentity(
        await invoke<unknown>("capture_dictation_lab_vocabulary_snapshot"),
      );
    },
    async listVocabularySnapshots() {
      const values = await invoke<unknown[]>(
        "list_dictation_lab_vocabulary_snapshots",
      );
      return values.map(vocabularySnapshotIdentity);
    },
    async resolveVocabularySnapshot(snapshotId) {
      return vocabularySnapshotIdentity(
        await invoke<unknown>("resolve_dictation_lab_vocabulary_snapshot", {
          snapshotId,
        }),
      );
    },
    async recordVerdict(mutation) {
      return invoke<DictationLabVerdictReceipt>(
        "record_dictation_lab_verdict",
        { mutation },
      );
    },
    async validateDraft(profileId, expectedRevision, definition) {
      return request<ProfileValidationReceipt>({
        kind: "validateProfile",
        profileId,
        expectedRevision,
        definition,
      });
    },
    async previewDraft(profileId, expectedRevision, baseVersion, definition) {
      return request<ProfilePreviewReceipt>({
        kind: "previewProfile",
        profileId,
        expectedRevision,
        baseVersion,
        definition,
      });
    },
    async applyProfile(profileId, expectedRevision, definition, phrase) {
      return request<ProfileMutationReceipt>({
        kind: "applyProfile",
        profileId,
        expectedRevision,
        definition,
        confirmation: {
          action: "apply",
          profileKey: profileId,
          expectedRevision,
          phrase,
        },
      });
    },
    async rollbackProfile(profileId, expectedRevision, targetVersion, phrase) {
      return request<ProfileMutationReceipt>({
        kind: "rollbackProfile",
        profileId,
        expectedRevision,
        targetVersion,
        confirmation: {
          action: "rollback",
          profileKey: profileId,
          expectedRevision,
          targetVersion,
          phrase,
        },
      });
    },
    async assignAccount(accountHandle, policyId, policyLabel) {
      return request<unknown>({
        kind: "assignAccount",
        accountHandle,
        policyId,
        policyLabel,
      });
    },
  };
}
