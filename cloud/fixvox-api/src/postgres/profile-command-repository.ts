/// <reference path="../bun-runtime.d.ts" />

import { StaleProfileRevisionError } from "./profile-publication-repository.ts";

const CAPABILITIES = new Set(["translate", "dictation", "postprocess", "selection_transform", "assistant_actions", "custom_prompts", "advanced_settings", "debug_tools", "managed_stt", "managed_llm", "admin_settings"]);
const PROFILE_KEYS = new Set(["schemaVersion", "label", "access", "runtime", "limits", "userControls", "defaults"]);
const RUNTIME_KEYS = ["transcription", "postprocess", "selectionTransform"] as const;

type SqlExecutor = Bun.SQL;
type LockedProfile = { id: string; profile_id: string; label: string; revision: string; active_published_version: number | null };
type ReceiptRow = { audit_id: string; source_version: number | null; resulting_version: number; revision: string; definition: Record<string, unknown> | string };
export type ProfileCommandResult = { profileId: string; label: string; previousVersion: number | null; resultingVersion: number; revision: number; auditId: string; idempotentReplay: boolean };

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") { const object = value as Record<string, unknown>; return `{${Object.keys(object).sort((left, right) => left.localeCompare(right)).map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`; }
  return JSON.stringify(value);
}
function fingerprint(value: unknown): string { return new Bun.CryptoHasher("sha256").update(stableJson(value)).digest("hex"); }
function definition(value: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof value !== "string") return value;
  try { const parsed: unknown = JSON.parse(value); return record(parsed); }
  catch { throw new Error("profile_definition_invalid"); }
}
function commandResult(profileId: string, row: ReceiptRow, idempotentReplay: boolean): ProfileCommandResult {
  const value = definition(row.definition);
  return { profileId, label: String(value.label ?? profileId), previousVersion: row.source_version, resultingVersion: row.resulting_version, revision: Number(row.revision), auditId: row.audit_id, idempotentReplay };
}

async function validateDefinition(sql: SqlExecutor, value: Record<string, unknown>): Promise<void> {
  if (Object.keys(value).some((key) => !PROFILE_KEYS.has(key)) || value.schemaVersion !== 1) throw new Error("profile_definition_invalid");
  if (typeof value.label !== "string" || value.label.trim().length < 1 || value.label.trim().length > 80) throw new Error("profile_definition_invalid");
  const access = record(value.access);
  if (Object.keys(access).some((key) => key !== "capabilities") || !Array.isArray(access.capabilities) || access.capabilities.some((item) => typeof item !== "string" || !CAPABILITIES.has(item))) throw new Error("profile_definition_invalid");
  const runtime = record(value.runtime);
  if (Object.keys(runtime).some((key) => !RUNTIME_KEYS.includes(key as typeof RUNTIME_KEYS[number])) || RUNTIME_KEYS.some((key) => !runtime[key])) throw new Error("profile_definition_invalid");
  const engineIds: string[] = [];
  const promptIds: string[] = [];
  for (const key of RUNTIME_KEYS) {
    const operation = record(runtime[key]);
    if (Object.keys(operation).some((name) => !["engineId", "promptId"].includes(name)) || typeof operation.engineId !== "string" || !operation.engineId.trim()) throw new Error("profile_definition_invalid");
    engineIds.push(operation.engineId.trim());
    if (operation.promptId !== undefined) { if (typeof operation.promptId !== "string" || !operation.promptId.trim()) throw new Error("profile_definition_invalid"); promptIds.push(operation.promptId.trim()); }
  }
  const enginePlaceholders = [...new Set(engineIds)].map((_, index) => `$${index + 1}`).join(", ");
  const engines = await sql.unsafe<{ engine_id: string }>(`SELECT engine_id FROM engines WHERE enabled AND engine_id IN (${enginePlaceholders})`, [...new Set(engineIds)]);
  if (engines.length !== new Set(engineIds).size) throw new Error("profile_reference_invalid");
  if (promptIds.length) {
    const uniquePrompts = [...new Set(promptIds)];
    const promptPlaceholders = uniquePrompts.map((_, index) => `$${index + 1}`).join(", ");
    const prompts = await sql.unsafe<{ prompt_id: string }>(`SELECT prompt_id FROM prompts WHERE enabled AND prompt_id IN (${promptPlaceholders})`, uniquePrompts);
    if (prompts.length !== uniquePrompts.length) throw new Error("profile_reference_invalid");
  }
  const limits = record(value.limits);
  if (!['block', 'warn'].includes(String(limits.mode)) || Object.keys(limits).some((key) => !["mode", "dailyUsd", "monthlyUsd", "quotaProfile"].includes(key))) throw new Error("profile_definition_invalid");
  for (const amount of [limits.dailyUsd, limits.monthlyUsd]) if (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) throw new Error("profile_definition_invalid");
  const controls = record(value.userControls);
  if (Object.values(controls).some((entry) => !["hidden", "visible-locked", "editable"].includes(String(entry)))) throw new Error("profile_definition_invalid");
  const defaults = record(value.defaults);
  if (Object.values(defaults).some((entry) => !["string", "number", "boolean"].includes(typeof entry))) throw new Error("profile_definition_invalid");
}

export class PostgresProfileCommandRepository {
  constructor(private readonly databaseUrl: string) {}

  async apply(input: { profileId: string; expectedRevision: number; definition: Record<string, unknown>; actorRefHash: string; confirmation: string }): Promise<ProfileCommandResult> {
    const commandFingerprint = fingerprint({ action: "apply", ...input });
    return this.execute(input.profileId, input.expectedRevision, input.actorRefHash, commandFingerprint, async (tx) => {
      await validateDefinition(tx, input.definition);
      return { action: "profile.apply", targetVersion: null, definition: input.definition, label: String(input.definition.label) };
    });
  }

  async rollback(input: { profileId: string; targetVersion: number; expectedRevision: number; actorRefHash: string; confirmation: string }): Promise<ProfileCommandResult> {
    const commandFingerprint = fingerprint({ action: "rollback", ...input });
    return this.execute(input.profileId, input.expectedRevision, input.actorRefHash, commandFingerprint, async (tx, profile) => {
      const targets = await tx.unsafe<{ definition: Record<string, unknown> | string }>(`SELECT definition FROM profile_versions WHERE profile_id = $1::uuid AND version = $2 AND status <> 'draft'`, [profile.id, input.targetVersion]);
      if (!targets[0]) throw new Error("profile_version_not_found");
      const target: Record<string, unknown> = { ...definition(targets[0].definition), basedOnVersion: input.targetVersion };
      return { action: "profile.rollback", targetVersion: input.targetVersion, definition: target, label: String(target.label ?? profile.label) };
    });
  }

  private async execute(profileId: string, expectedRevision: number, actorRefHash: string, commandFingerprint: string, build: (tx: SqlExecutor, profile: LockedProfile) => Promise<{ action: string; targetVersion: number | null; definition: Record<string, unknown>; label: string }>): Promise<ProfileCommandResult> {
    const sql = new Bun.SQL(this.databaseUrl);
    try {
      return await sql.begin(async (tx) => {
        const profiles = await tx.unsafe<LockedProfile>(`SELECT id::text, profile_id, label, revision::text, active_published_version FROM profiles WHERE profile_id = $1 FOR UPDATE`, [profileId]);
        const profile = profiles[0];
        if (!profile) throw new Error("profile_not_found");
        const receipts = await tx.unsafe<ReceiptRow>(`
          SELECT a.audit_id::text, a.source_version, a.resulting_version, (a.safe_metadata->>'authorityRevision') AS revision, pv.definition
          FROM audit_records a JOIN profile_versions pv ON pv.profile_id = $1::uuid AND pv.version = a.resulting_version
          WHERE a.actor_ref_hash = $2 AND a.target_ref_hash = $3
            AND a.safe_metadata->>'commandFingerprint' = $4
          ORDER BY a.sequence_id DESC LIMIT 1
        `, [profile.id, actorRefHash, profileId, commandFingerprint]);
        if (receipts[0]) return commandResult(profileId, receipts[0], true);
        if (!Number.isInteger(expectedRevision) || Number(profile.revision) !== expectedRevision) throw new StaleProfileRevisionError();
        const command = await build(tx, profile);
        const versions = await tx.unsafe<{ version: number }>(`SELECT coalesce(max(version), 0)::integer AS version FROM profile_versions WHERE profile_id = $1::uuid`, [profile.id]);
        const resultingVersion = Number(versions[0]?.version ?? 0) + 1;
        if (profile.active_published_version !== null) await tx.unsafe(`UPDATE profile_versions SET status = 'historical' WHERE profile_id = $1::uuid AND version = $2 AND status = 'published'`, [profile.id, profile.active_published_version]);
        await tx.unsafe(`INSERT INTO profile_versions (profile_id, version, status, definition, authority_revision, created_by, published_by, published_at) VALUES ($1::uuid, $2, 'published', $3::jsonb, $4, $5, $5, now())`, [profile.id, resultingVersion, JSON.stringify(command.definition), expectedRevision + 1, actorRefHash]);
        const updated = await tx.unsafe<{ revision: string }>(`UPDATE profiles SET label = $2, active_published_version = $3, revision = revision + 1, updated_at = now() WHERE id = $1::uuid RETURNING revision::text`, [profile.id, command.label, resultingVersion]);
        const revision = Number(updated[0]?.revision);
        const audits = await tx.unsafe<{ audit_id: string }>(`INSERT INTO audit_records (actor_ref_hash, action, target_type, target_ref_hash, source_version, target_version, resulting_version, result, safe_metadata) VALUES ($1, $2, 'profile', $3, $4, $5, $6, 'success', jsonb_build_object('commandFingerprint', $7::text, 'authorityRevision', $8::bigint)) RETURNING audit_id::text`, [actorRefHash, command.action, profileId, profile.active_published_version, command.targetVersion ?? resultingVersion, resultingVersion, commandFingerprint, revision]);
        return { profileId, label: command.label, previousVersion: profile.active_published_version, resultingVersion, revision, auditId: audits[0].audit_id, idempotentReplay: false };
      });
    } finally { await sql.close(); }
  }
}
