import { invoke, isTauri } from "@tauri-apps/api/core";
import { adaptResultHistoryEntryToLabEvidence, selectEligibleRuns } from "./evaluation";

import type {
  AccountsResponse,
  AuditResponse,
  ConfigurationResponse,
  JsonObject,
  LaboratoryLoad,
  LaboratorySession,
  ProfileMutationReceipt,
  ProfilePreviewReceipt,
  ProfilesResponse,
  ProfileValidationReceipt,
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
  | { kind: "pricing" }
  | { kind: "validateProfile"; profileId: string; expectedRevision: number; definition: RecipeDefinition }
  | { kind: "previewProfile"; profileId: string; expectedRevision: number; baseVersion?: number; definition: RecipeDefinition }
  | { kind: "applyProfile"; profileId: string; expectedRevision: number; definition: RecipeDefinition; confirmation: JsonObject }
  | { kind: "rollbackProfile"; profileId: string; expectedRevision: number; targetVersion: number; confirmation: JsonObject }
  | { kind: "assignAccount"; accountHandle: string; policyId: string; policyLabel?: string };

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
    throw new DictationLabUnavailableError("DICTATION_LAB_RESPONSE_INVALID", "El servidor devolvió una respuesta no reconocida.");
  }
  return value as Record<string, unknown>;
}

async function request<T>(payload: DictationLabRequest): Promise<T> {
  if (!isTauri()) {
    throw new DictationLabUnavailableError("DICTATION_LAB_TAURI_REQUIRED", "El laboratorio está disponible únicamente en la aplicación de escritorio.");
  }
  return invoke<T>("request_dictation_lab", { request: payload });
}

function session(value: unknown): LaboratorySession {
  const candidate = object(value);
  if (candidate.ok !== true || !["viewer", "editor", "publisher", "owner"].includes(String(candidate.role))) {
    throw new DictationLabUnavailableError("DICTATION_LAB_SESSION_INVALID", "La sesión de Control Room no está disponible.");
  }
  return candidate as LaboratorySession;
}

export function parseProfilesResponse(value: unknown): ProfilesResponse {
  const candidate = object(value);
  if (candidate.ok !== true || !Array.isArray(candidate.profiles)) {
    throw new DictationLabUnavailableError("DICTATION_LAB_PROFILES_INVALID", "El catálogo de perfiles no está disponible.");
  }
  const normalized = candidate.profiles.map((raw) => {
    const profile = object(raw);
    const versions = Array.isArray(profile.versions) ? profile.versions.map((rawVersion) => {
      const version = object(rawVersion);
      const definition = object(version.definition);
      return {
        ...definition,
        version: Number(version.version),
        status: String(version.status) === "draft" ? "draft" as const : "published" as const,
      } as RecipeDefinition;
    }) : [];
    const activeVersion = Number(profile.activePublishedVersion);
    const draftVersion = Number(profile.currentDraftVersion);
    return {
      profileId: String(profile.profileId),
      label: String(profile.label),
      revision: Number(profile.revision),
      published: versions.find((version) => version.version === activeVersion && version.status !== "draft") ?? null,
      draft: versions.find((version) => version.version === draftVersion && version.status === "draft") ?? null,
      history: versions.filter((version) => version.status !== "draft"),
    };
  });
  return { ok: true, profiles: normalized };
}

function configuration(value: unknown): ConfigurationResponse {
  const candidate = object(value);
  if (candidate.ok !== true || !Array.isArray(candidate.engineOptions) || !Array.isArray(candidate.promptOptions)) {
    throw new DictationLabUnavailableError("DICTATION_LAB_CONFIGURATION_INVALID", "La configuración de Control Room no está disponible.");
  }
  return candidate as ConfigurationResponse;
}

function accounts(value: unknown): AccountsResponse {
  const candidate = object(value);
  if (candidate.ok !== true || !Array.isArray(candidate.accounts)) {
    throw new DictationLabUnavailableError("DICTATION_LAB_ACCOUNTS_INVALID", "Las asignaciones de cuenta no están disponibles.");
  }
  return candidate as AccountsResponse;
}

function audit(value: unknown): AuditResponse {
  const candidate = object(value);
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.records)) {
    throw new DictationLabUnavailableError("DICTATION_LAB_AUDIT_INVALID", "La auditoría no está disponible.");
  }
  return candidate as AuditResponse;
}
function resultHistory(value: unknown): LaboratoryLoad["runs"] {
  if (!Array.isArray(value)) {
    throw new DictationLabUnavailableError("DICTATION_LAB_HISTORY_INVALID", "El historial local no está disponible.");
  }
  return selectEligibleRuns(value.map((entry) => adaptResultHistoryEntryToLabEvidence(object(entry))), {
    source: "dictation",
    limit: 50,
  });
}

export type DictationLabClient = {
  load(): Promise<LaboratoryLoad>;
  reloadProfiles(): Promise<ProfilesResponse>;
  reloadAudit(): Promise<AuditResponse>;
  validateDraft(profileId: string, expectedRevision: number, definition: RecipeDefinition): Promise<ProfileValidationReceipt>;
  previewDraft(profileId: string, expectedRevision: number, baseVersion: number | undefined, definition: RecipeDefinition): Promise<ProfilePreviewReceipt>;
  applyProfile(profileId: string, expectedRevision: number, definition: RecipeDefinition, phrase: string): Promise<ProfileMutationReceipt>;
  rollbackProfile(profileId: string, expectedRevision: number, targetVersion: number, phrase: string): Promise<ProfileMutationReceipt>;
  assignAccount(accountHandle: string, policyId: string, policyLabel?: string): Promise<unknown>;
};

export function createDictationLabClient(): DictationLabClient {
  return {
    async load() {
      // Fail fast on operator authorization before fanning out read requests.
      // A rejected laboratory session must not consume the shared desktop host
      // with catalog/history work or affect the dictation dock.
      const sessionValue = await request<unknown>({ kind: "session" });
      const authorizedSession = session(sessionValue);
      const [profilesValue, configurationValue, accountsValue, auditValue, historyValue] = await Promise.all([
        request<unknown>({ kind: "profiles" }),
        request<unknown>({ kind: "configuration" }),
        request<unknown>({ kind: "accounts" }),
        request<unknown>({ kind: "audit" }),
        invoke<unknown[]>("list_result_history_entries"),
      ]);
      return {
        session: authorizedSession,
        profiles: parseProfilesResponse(profilesValue),
        configuration: configuration(configurationValue),
        accounts: accounts(accountsValue),
        audit: audit(auditValue),
        runs: resultHistory(historyValue),
      };
    },
    async reloadProfiles() {
      return parseProfilesResponse(await request<unknown>({ kind: "profiles" }));
    },
    async reloadAudit() {
      return audit(await request<unknown>({ kind: "audit" }));
    },
    async validateDraft(profileId, expectedRevision, definition) {
      return request<ProfileValidationReceipt>({ kind: "validateProfile", profileId, expectedRevision, definition });
    },
    async previewDraft(profileId, expectedRevision, baseVersion, definition) {
      return request<ProfilePreviewReceipt>({ kind: "previewProfile", profileId, expectedRevision, baseVersion, definition });
    },
    async applyProfile(profileId, expectedRevision, definition, phrase) {
      return request<ProfileMutationReceipt>({
        kind: "applyProfile",
        profileId,
        expectedRevision,
        definition,
        confirmation: { action: "apply", profileKey: profileId, expectedRevision, phrase },
      });
    },
    async rollbackProfile(profileId, expectedRevision, targetVersion, phrase) {
      return request<ProfileMutationReceipt>({
        kind: "rollbackProfile",
        profileId,
        expectedRevision,
        targetVersion,
        confirmation: { action: "rollback", profileKey: profileId, expectedRevision, targetVersion, phrase },
      });
    },
    async assignAccount(accountHandle, policyId, policyLabel) {
      return request<unknown>({ kind: "assignAccount", accountHandle, policyId, policyLabel });
    },
  };
}
