/// <reference path="../bun-runtime.d.ts" />

import {
  PERSONAL_VOCABULARY_LIMITS,
  StaleVocabularyRevisionError,
  VocabularyConflictError,
  VocabularyRuleNotFoundError,
  VocabularyValidationError,
  type PersonalVocabularyCandidate,
  type PersonalVocabularyMutationInput,
  type PersonalVocabularyRepository,
  type PersonalVocabularyRule,
  type PersonalVocabularySnapshot,
  type PersonalVocabularyUpdateInput,
  isRecord,
  normalizeVocabularySpoken,
  parseExpectedRevision,
  validateRuleForStorage,
  validateMutationInput,
} from "../personal-vocabulary.ts";

type VocabularyRow = {
  id: string;
  revision: string;
  spoken: string;
  candidates: PersonalVocabularyCandidate[] | string;
  default_candidate_id: string | null;
  mode: "automatic" | "ask";
  enabled: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type RevisionRow = { revision: string };

function parseCandidates(value: PersonalVocabularyRowValue): PersonalVocabularyCandidate[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) throw new VocabularyValidationError("candidates_invalid");
  return parsed as PersonalVocabularyCandidate[];
}

type PersonalVocabularyRowValue = PersonalVocabularyCandidate[] | string;

function toRule(row: VocabularyRow): PersonalVocabularyRule {
  const candidates = parseCandidates(row.candidates);
  const rule: PersonalVocabularyRule = {
    id: row.id,
    revision: String(row.revision),
    spoken: row.spoken,
    candidates,
    ...(row.default_candidate_id ? { defaultCandidateId: row.default_candidate_id } : {}),
    mode: row.mode,
    enabled: row.enabled,
    ...(row.note ? { note: row.note } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
  validateRuleForStorage(rule);
  return rule;
}

function ensureAccountId(accountId: string): string {
  if (!/^[0-9a-f-]{36}$/iu.test(accountId)) throw new VocabularyValidationError("account_invalid");
  return accountId;
}

function ensureRuleId(ruleId: string): string {
  if (!/^[0-9a-f-]{36}$/iu.test(ruleId)) throw new VocabularyValidationError("rule_id_invalid");
  return ruleId;
}

function candidatePayload(candidates: Array<{ id?: string; written: string }>): PersonalVocabularyCandidate[] {
  return candidates.map((candidate) => ({
    id: candidate.id ?? crypto.randomUUID(),
    written: candidate.written,
  }));
}

function validateCompleteMutation(mutation: PersonalVocabularyMutationInput): PersonalVocabularyMutationInput {
  const validated = validateMutationInput(mutation) as PersonalVocabularyMutationInput;
  if (!validated.spoken || !validated.candidates || !validated.mode) {
    throw new VocabularyValidationError("mutation_invalid");
  }
  if (validated.mode === "automatic" && validated.candidates.length !== 1) {
    throw new VocabularyValidationError("automatic_requires_one_candidate");
  }
  const { automaticConfirmed: _automaticConfirmed, ...persisted } = validated;
  return { ...persisted, enabled: validated.enabled ?? true };
}

function mergeMutation(existing: PersonalVocabularyRule, input: PersonalVocabularyUpdateInput): PersonalVocabularyMutationInput {
  const candidates = input.candidates ?? existing.candidates.map((candidate) => ({ ...candidate }));
  const mode = input.mode ?? existing.mode;
  const merged: PersonalVocabularyMutationInput = {
    spoken: input.spoken ?? existing.spoken,
    candidates,
    mode,
    enabled: input.enabled ?? existing.enabled,
    ...(input.automaticConfirmed !== undefined ? { automaticConfirmed: input.automaticConfirmed } : {}),
    ...(input.defaultCandidateId !== undefined
      ? (input.defaultCandidateId ? { defaultCandidateId: input.defaultCandidateId } : {})
      : (existing.defaultCandidateId ? { defaultCandidateId: existing.defaultCandidateId } : {})),
    ...(input.note !== undefined ? (input.note ? { note: input.note } : {}) : (existing.note ? { note: existing.note } : {})),
  };
  return validateCompleteMutation(merged);
}

export class PostgresPersonalVocabularyRepository implements PersonalVocabularyRepository {
  constructor(private readonly sql: Bun.SQL) {}

  async getSnapshot(accountId: string): Promise<PersonalVocabularySnapshot> {
    const safeAccountId = ensureAccountId(accountId);
    return this.sql.begin(async (tx) => {
      const revisionRows = await tx.unsafe<RevisionRow>(`
        SELECT revision::text FROM personal_vocabulary_revisions WHERE account_id = $1::uuid FOR SHARE
      `, [safeAccountId]);
      const rows = await tx.unsafe<VocabularyRow>(`
        SELECT id::text, revision::text, spoken, candidates, default_candidate_id,
               mode, enabled, note, created_at::text, updated_at::text
        FROM personal_vocabulary_rules
        WHERE account_id = $1::uuid
        ORDER BY created_at ASC, id ASC
      `, [safeAccountId]);
      return {
        revision: String(revisionRows[0]?.revision ?? "0"),
        rules: rows.map(toRule),
      };
    });
  }

  async createRule(input: {
    accountId: string;
    expectedRevision: string;
    mutation: PersonalVocabularyMutationInput;
  }): Promise<{ rule: PersonalVocabularyRule; vocabularyRevision: string }> {
    const accountId = ensureAccountId(input.accountId);
    const expectedRevision = parseExpectedRevision(input.expectedRevision);
    const mutation = validateCompleteMutation(input.mutation);
    return this.sql.begin(async (tx) => {
      const revision = await this.lockRevision(tx, accountId);
      this.ensureExpectedRevision(revision, expectedRevision);
      const count = await tx.unsafe<{ count: string }>(`
        SELECT count(*)::text FROM personal_vocabulary_rules WHERE account_id = $1::uuid
      `, [accountId]);
      if (Number(count[0]?.count ?? "0") >= PERSONAL_VOCABULARY_LIMITS.maxRulesPerAccount) {
        throw new VocabularyValidationError("rules_limit");
      }
      const normalizedSpoken = normalizeVocabularySpoken(mutation.spoken);
      await this.rejectAutomaticConflict(tx, accountId, normalizedSpoken, mutation.mode);
      const nextRevision = incrementRevision(revision);
      const id = crypto.randomUUID();
      const candidates = candidatePayload(mutation.candidates);
      const now = new Date().toISOString();
      const rows = await tx.unsafe<VocabularyRow>(`
        INSERT INTO personal_vocabulary_rules
          (id, account_id, revision, spoken_key, spoken, candidates, default_candidate_id, mode, enabled, note, created_at, updated_at)
        VALUES ($1::uuid, $2::uuid, $3::bigint, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::timestamptz, $11::timestamptz)
        RETURNING id::text, revision::text, spoken, candidates, default_candidate_id,
                  mode, enabled, note, created_at::text, updated_at::text
      `, [
        id, accountId, nextRevision, normalizedSpoken, mutation.spoken, JSON.stringify(candidates),
        mutation.defaultCandidateId ?? (mutation.mode === "automatic" ? candidates[0]?.id ?? null : null), mutation.mode, mutation.enabled ?? true,
        mutation.note ?? null, now,
      ]);
      await this.advanceRevision(tx, accountId, nextRevision);
      return { rule: toRule(rows[0]), vocabularyRevision: nextRevision };
    });
  }

  async updateRule(input: {
    accountId: string;
    ruleId: string;
    expectedRevision: string;
    mutation: PersonalVocabularyUpdateInput;
  }): Promise<{ rule: PersonalVocabularyRule; vocabularyRevision: string }> {
    const accountId = ensureAccountId(input.accountId);
    const ruleId = ensureRuleId(input.ruleId);
    const expectedRevision = parseExpectedRevision(input.expectedRevision);
    if (!isRecord(input.mutation)) throw new VocabularyValidationError("mutation_invalid");
    return this.sql.begin(async (tx) => {
      const revision = await this.lockRevision(tx, accountId);
      this.ensureExpectedRevision(revision, expectedRevision);
      const rows = await tx.unsafe<VocabularyRow>(`
        SELECT id::text, revision::text, spoken, candidates, default_candidate_id,
               mode, enabled, note, created_at::text, updated_at::text
        FROM personal_vocabulary_rules WHERE id = $1::uuid AND account_id = $2::uuid FOR UPDATE
      `, [ruleId, accountId]);
      const existing = rows[0] ? toRule(rows[0]) : null;
      if (!existing) throw new VocabularyRuleNotFoundError();
      const mutation = mergeMutation(existing, input.mutation);
      const normalizedSpoken = normalizeVocabularySpoken(mutation.spoken);
      await this.rejectAutomaticConflict(tx, accountId, normalizedSpoken, mutation.mode, ruleId);
      const nextRevision = incrementRevision(revision);
      const candidates = candidatePayload(mutation.candidates);
      const updated = await tx.unsafe<VocabularyRow>(`
        UPDATE personal_vocabulary_rules
        SET revision = $3::bigint, spoken_key = $4, spoken = $5, candidates = $6::jsonb,
            default_candidate_id = $7, mode = $8, enabled = $9, note = $10, updated_at = now()
        WHERE id = $1::uuid AND account_id = $2::uuid
        RETURNING id::text, revision::text, spoken, candidates, default_candidate_id,
                  mode, enabled, note, created_at::text, updated_at::text
      `, [
        ruleId, accountId, nextRevision, normalizedSpoken, mutation.spoken, JSON.stringify(candidates),
        mutation.defaultCandidateId ?? (mutation.mode === "automatic" ? candidates[0]?.id ?? null : null), mutation.mode, mutation.enabled ?? true,
        mutation.note ?? null,
      ]);
      await this.advanceRevision(tx, accountId, nextRevision);
      return { rule: toRule(updated[0]), vocabularyRevision: nextRevision };
    });
  }

  async deleteRule(input: {
    accountId: string;
    ruleId: string;
    expectedRevision: string;
  }): Promise<{ vocabularyRevision: string }> {
    const accountId = ensureAccountId(input.accountId);
    const ruleId = ensureRuleId(input.ruleId);
    const expectedRevision = parseExpectedRevision(input.expectedRevision);
    return this.sql.begin(async (tx) => {
      const revision = await this.lockRevision(tx, accountId);
      this.ensureExpectedRevision(revision, expectedRevision);
      const deleted = await tx.unsafe<{ id: string }>(`
        DELETE FROM personal_vocabulary_rules WHERE id = $1::uuid AND account_id = $2::uuid RETURNING id::text
      `, [ruleId, accountId]);
      if (!deleted[0]) throw new VocabularyRuleNotFoundError();
      const nextRevision = incrementRevision(revision);
      await this.advanceRevision(tx, accountId, nextRevision);
      return { vocabularyRevision: nextRevision };
    });
  }

  private async lockRevision(tx: Bun.SQL, accountId: string): Promise<string> {
    await tx.unsafe(`
      INSERT INTO personal_vocabulary_revisions (account_id, revision)
      VALUES ($1::uuid, 0)
      ON CONFLICT (account_id) DO NOTHING
    `, [accountId]);
    const rows = await tx.unsafe<RevisionRow>(`
      SELECT revision::text FROM personal_vocabulary_revisions WHERE account_id = $1::uuid FOR UPDATE
    `, [accountId]);
    return String(rows[0]?.revision ?? "0");
  }

  private ensureExpectedRevision(current: string, expected: string): void {
    if (current !== expected) throw new StaleVocabularyRevisionError();
  }

  private async advanceRevision(tx: Bun.SQL, accountId: string, nextRevision: string): Promise<void> {
    await tx.unsafe(`
      UPDATE personal_vocabulary_revisions SET revision = $2::bigint, updated_at = now() WHERE account_id = $1::uuid
    `, [accountId, nextRevision]);
  }

  private async rejectAutomaticConflict(
    tx: Bun.SQL,
    accountId: string,
    normalizedSpoken: string,
    mode: PersonalVocabularyMode,
    excludeRuleId?: string,
  ): Promise<void> {
    if (mode !== "automatic") return;
    const rows = await tx.unsafe<{ id: string }>(`
      SELECT id::text FROM personal_vocabulary_rules
      WHERE account_id = $1::uuid AND spoken_key = $2 AND enabled AND mode = 'automatic'
        AND ($3::uuid IS NULL OR id <> $3::uuid)
      LIMIT 1
    `, [accountId, normalizedSpoken, excludeRuleId ?? null]);
    if (rows[0]) throw new VocabularyConflictError();
  }
}

function incrementRevision(value: string): string {
  try {
    return (BigInt(value) + 1n).toString();
  } catch {
    throw new VocabularyValidationError("revision_invalid");
  }
}

// Kept local to this module to avoid making the public contract depend on
// repository internals.
type PersonalVocabularyMode = "automatic" | "ask";
