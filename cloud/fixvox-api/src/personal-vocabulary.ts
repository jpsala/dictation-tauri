/**
 * Account-scoped personal vocabulary contracts and validation.
 *
 * This module deliberately contains no provider/runtime integration.  The
 * vocabulary is a host-side projection and is never part of an upstream
 * prompt or provider request.
 */

export const PERSONAL_VOCABULARY_LIMITS = {
  maxRulesPerAccount: 500,
  maxCandidatesPerRule: 8,
  maxSpokenLength: 256,
  maxWrittenLength: 256,
  maxNoteLength: 280,
  maxIdLength: 128,
} as const;

export type PersonalVocabularyMode = "automatic" | "ask";

export type PersonalVocabularyCandidate = {
  id: string;
  written: string;
};

export type PersonalVocabularyRule = {
  id: string;
  revision: string;
  spoken: string;
  candidates: PersonalVocabularyCandidate[];
  defaultCandidateId?: string;
  mode: PersonalVocabularyMode;
  enabled: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonalVocabularySnapshot = {
  revision: string;
  rules: PersonalVocabularyRule[];
  /** Opaque account binding used only by host-owned caches. */
  scope?: string;
};

export type PersonalVocabularyCandidateInput = {
  id?: string;
  written: string;
};

export type PersonalVocabularyMutationInput = {
  spoken: string;
  candidates: PersonalVocabularyCandidateInput[];
  defaultCandidateId?: string | null;
  mode: PersonalVocabularyMode;
  enabled?: boolean;
  note?: string | null;
  /** Ephemeral save-boundary consent; never persisted in the rule snapshot. */
  automaticConfirmed?: boolean;
};

export type PersonalVocabularyUpdateInput = Partial<PersonalVocabularyMutationInput>;

export type PersonalVocabularyRepository = {
  getSnapshot(accountId: string): Promise<PersonalVocabularySnapshot>;
  createRule(input: {
    accountId: string;
    expectedRevision: string;
    mutation: PersonalVocabularyMutationInput;
  }): Promise<{ rule: PersonalVocabularyRule; vocabularyRevision: string }>;
  updateRule(input: {
    accountId: string;
    ruleId: string;
    expectedRevision: string;
    mutation: PersonalVocabularyUpdateInput;
  }): Promise<{ rule: PersonalVocabularyRule; vocabularyRevision: string }>;
  deleteRule(input: {
    accountId: string;
    ruleId: string;
    expectedRevision: string;
  }): Promise<{ vocabularyRevision: string }>;
};

export class VocabularyValidationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export class StaleVocabularyRevisionError extends Error {
  constructor() {
    super("stale_vocabulary_revision");
  }
}

export class VocabularyRuleNotFoundError extends Error {
  constructor() {
    super("vocabulary_rule_not_found");
  }
}

export class VocabularyConflictError extends Error {
  constructor() {
    super("vocabulary_conflict");
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeVocabularySpoken(value: string): string {
  let normalized = "";
  for (let offset = 0; offset < value.length;) {
    const codePoint = value.codePointAt(offset);
    if (codePoint === undefined) break;
    const width = codePoint > 0xffff ? 2 : 1;
    normalized += value
      .slice(offset, offset + width)
      .normalize("NFKD")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{M}/gu, "");
    offset += width;
  }
  return normalized.replace(/\s+/gu, " ").trim();
}

function hasDangerousPlaceholder(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]|\{\{|\}\}|\$\{|\[\[|\]\]/u.test(value);
}

const COMMON_TRIGGER_WORDS = new Set([
  "a", "an", "and", "as", "at", "be", "by", "de", "del", "el", "en", "for", "from",
  "in", "is", "it", "la", "las", "le", "los", "of", "on", "or", "para", "por", "que",
  "the", "to", "un", "una", "y",
]);

function automaticConfirmationRequired(spoken: string): boolean {
  const normalized = normalizeVocabularySpoken(spoken);
  const nonWhitespaceLength = [...normalized].filter((character) => !/\s/u.test(character)).length;
  if (normalized.length > 0 && nonWhitespaceLength <= 3) return true;
  const words = normalized.split(" ").filter(Boolean);
  return words.length > 0 && words.every((word) => COMMON_TRIGGER_WORDS.has(word));
}

function boundedText(value: unknown, field: string, maxLength: number, required = true): string {
  if (typeof value !== "string") throw new VocabularyValidationError(`${field}_invalid`);
  const isEmpty = value.trim().length === 0;
  if (required && isEmpty) throw new VocabularyValidationError(`${field}_required`);
  if (!required && isEmpty) return "";
  if (value.length > maxLength) throw new VocabularyValidationError(`${field}_too_long`);
  if (hasDangerousPlaceholder(value)) throw new VocabularyValidationError(`${field}_placeholder`);
  return value;
}

function candidateId(value: unknown): string {
  const id = boundedText(value, "candidate_id", PERSONAL_VOCABULARY_LIMITS.maxIdLength);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(id)) {
    throw new VocabularyValidationError("candidate_id_invalid");
  }
  return id;
}

function validateExpectedRevision(value: string): string {
  if (!/^\d+$/u.test(value) || (value.length > 1 && value.startsWith("0"))) {
    throw new VocabularyValidationError("expected_revision_invalid");
  }
  return value;
}

function validateCandidates(value: unknown, mode: PersonalVocabularyMode): PersonalVocabularyCandidateInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PERSONAL_VOCABULARY_LIMITS.maxCandidatesPerRule) {
    throw new VocabularyValidationError("candidates_invalid");
  }
  const seen = new Set<string>();
  const candidates = value.map((raw) => {
    if (!isRecord(raw)) throw new VocabularyValidationError("candidate_invalid");
    if (Object.keys(raw).some((key) => !["id", "written"].includes(key))) {
      throw new VocabularyValidationError("candidate_invalid");
    }
    const written = boundedText(raw.written, "written", PERSONAL_VOCABULARY_LIMITS.maxWrittenLength);
    const id = raw.id === undefined ? undefined : candidateId(raw.id);
    if (id && seen.has(id)) throw new VocabularyValidationError("candidate_id_duplicate");
    if (id) seen.add(id);
    return id ? { id, written } : { written };
  });
  if (mode === "automatic" && candidates.length !== 1) {
    throw new VocabularyValidationError("automatic_requires_one_candidate");
  }
  return candidates;
}

export function validateMutationInput(
  raw: unknown,
  options: { partial?: boolean; enforceAutomaticConfirmation?: boolean } = {},
): PersonalVocabularyMutationInput | PersonalVocabularyUpdateInput {
  if (!isRecord(raw)) throw new VocabularyValidationError("mutation_invalid");
  const allowed = ["spoken", "candidates", "defaultCandidateId", "mode", "enabled", "note", "automaticConfirmed"];
  if (Object.keys(raw).some((key) => !allowed.includes(key))) throw new VocabularyValidationError("mutation_invalid");
  const partial = options.partial === true;
  const result: PersonalVocabularyUpdateInput = {};
  if (!partial || raw.spoken !== undefined) {
    const spoken = boundedText(raw.spoken, "spoken", PERSONAL_VOCABULARY_LIMITS.maxSpokenLength);
    if (!normalizeVocabularySpoken(spoken)) throw new VocabularyValidationError("spoken_empty_after_normalization");
    result.spoken = spoken;
  }
  if (!partial || raw.candidates !== undefined) {
    // A missing mode is allowed on PATCH and is completed from the existing
    // rule by the repository before this validator is called a second time.
    const mode = raw.mode === "automatic" || raw.mode === "ask" ? raw.mode : "ask";
    result.candidates = validateCandidates(raw.candidates, mode);
  }
  if (!partial || raw.mode !== undefined) {
    if (raw.mode !== "automatic" && raw.mode !== "ask") throw new VocabularyValidationError("mode_invalid");
    result.mode = raw.mode;
  }
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== "boolean") throw new VocabularyValidationError("enabled_invalid");
    result.enabled = raw.enabled;
  }
  if (raw.automaticConfirmed !== undefined) {
    if (typeof raw.automaticConfirmed !== "boolean") throw new VocabularyValidationError("automatic_confirmation_invalid");
    result.automaticConfirmed = raw.automaticConfirmed;
  }
  if (!partial || raw.note !== undefined) {
    if (raw.note === null) {
      result.note = null;
    } else if (raw.note === undefined) {
      if (!partial) result.note = undefined;
    } else {
      result.note = boundedText(raw.note, "note", PERSONAL_VOCABULARY_LIMITS.maxNoteLength, false);
    }
  }
  if (raw.defaultCandidateId !== undefined) {
    if (raw.defaultCandidateId === null) result.defaultCandidateId = null;
    else result.defaultCandidateId = candidateId(raw.defaultCandidateId);
  }
  if (result.defaultCandidateId && result.candidates && !result.candidates.some((candidate) => candidate.id === result.defaultCandidateId)) {
    throw new VocabularyValidationError("default_candidate_invalid");
  }
  if (result.mode === "automatic" && result.candidates && result.candidates.length !== 1) {
    throw new VocabularyValidationError("automatic_requires_one_candidate");
  }
  if (options.enforceAutomaticConfirmation !== false && result.mode === "automatic" && result.spoken && result.candidates && raw.automaticConfirmed !== true && automaticConfirmationRequired(result.spoken)) {
    throw new VocabularyValidationError("automatic_confirmation_required");
  }
  return result;
}

export function parseExpectedRevision(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") throw new VocabularyValidationError("expected_revision_invalid");
  return validateExpectedRevision(String(value));
}

export function validateRuleForStorage(rule: PersonalVocabularyRule): void {
  boundedText(rule.id, "rule_id", PERSONAL_VOCABULARY_LIMITS.maxIdLength);
  parseExpectedRevision(rule.revision);
  const mutation = validateMutationInput({
    spoken: rule.spoken,
    candidates: rule.candidates,
    ...(rule.defaultCandidateId ? { defaultCandidateId: rule.defaultCandidateId } : {}),
    mode: rule.mode,
    enabled: rule.enabled,
    ...(rule.note !== undefined ? { note: rule.note } : {}),
  }, { enforceAutomaticConfirmation: false }) as PersonalVocabularyMutationInput;
  if (mutation.spoken === undefined || mutation.candidates === undefined || mutation.mode === undefined || mutation.enabled === undefined) {
    throw new VocabularyValidationError("rule_invalid");
  }
  if (!rule.createdAt || !rule.updatedAt) throw new VocabularyValidationError("timestamps_invalid");
}
