
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  getVocabularyRuleWarnings,
  validateVocabularyRule,
} from "./matcher";
import { normalizeVocabularyTrigger } from "./normalization";
import type {
  PersonalVocabularyCandidate,
  PersonalVocabularyRule,
  PersonalVocabularySnapshot,
  VocabularyRuleMode,
} from "./types";

export type TeachCorrectionMode = VocabularyRuleMode;

export type TeachCorrectionAction = "replace_and_remember" | "remember_only";

export type TeachCorrectionDraft = Readonly<{
  spoken: string;
  written: string;
  alternatives: readonly string[];
  mode: TeachCorrectionMode;
  automaticConfirmed: boolean;
  note?: string;
}>;

export type TeachCorrectionSelection = Readonly<{
  selectionId: string;
  selectedText: string;
  truncated: boolean;
  target: unknown;
}>;

export type TeachCorrectionConflictChoice = "replace" | "add_alternative";

/**
 * Redacted, ephemeral context shown before reconciling a trigger that already
 * exists. The full rule stays in the save boundary so its ID/revision remain
 * exact without putting personal text in telemetry or persisted state.
 */
export type TeachCorrectionConflict = Readonly<{
  ruleId: string;
  revision: string;
  spoken: string;
  candidates: readonly string[];
}>;

export type VocabularyMutation = Readonly<{
  spoken: string;
  candidates: readonly Readonly<{ id?: string; written: string }>[];
  defaultCandidateId?: string | null;
  mode: TeachCorrectionMode;
  enabled: boolean;
  note?: string | null;
  automaticConfirmed?: boolean;
}>;

export type VocabularyMutationResult = Readonly<{
  rule?: PersonalVocabularyRule;
  vocabularyRevision?: string;
  cacheStatus?: string;
  status?: string;
}>;

export type VocabularyClient = Readonly<{
  readSnapshot: () => Promise<PersonalVocabularySnapshot>;
  refresh: () => Promise<unknown>;
  createRule: (input: {
    expectedRevision: string;
    mutation: VocabularyMutation;
  }) => Promise<VocabularyMutationResult>;
  updateRule: (input: {
    ruleId: string;
    expectedRevision: string;
    mutation: VocabularyMutation;
  }) => Promise<VocabularyMutationResult>;
  deleteRule: (input: {
    ruleId: string;
    expectedRevision: string;
  }) => Promise<VocabularyMutationResult>;
  replaceCapturedSelection: (input: {
    target: unknown;
    selectionId: string;
    expectedSelection: string;
    selectionTruncated: boolean;
    replacement: string;
  }) => Promise<ReplaceCapturedSelectionResult>;
}>;

export type ReplaceCapturedSelectionResult = Readonly<{
  status: "replaced" | "selection_changed" | "target_unavailable";
  reason: string;
  capturedLength?: number;
}>;

export type TeachCorrectionValidation = Readonly<{
  ok: boolean;
  errors: readonly string[];
  warnings: readonly string[];
}>;

export type TeachCorrectionSaveResult = Readonly<{
  status:
    | "saved_and_replaced"
    | "saved_only"
    | "saved_selection_unchanged"
    | "invalid"
    | "conflict"
    | "network_error";
  rule?: PersonalVocabularyRule;
  vocabularyRevision?: string;
  replacement?: ReplaceCapturedSelectionResult;
  cacheRefreshError?: string;
  error?: string;
  draftPreserved: boolean;
}>;

export type TeachCorrectionCreateInput = Readonly<{
  draft: TeachCorrectionDraft;
  snapshot: PersonalVocabularySnapshot;
  action: TeachCorrectionAction;
  selection?: TeachCorrectionSelection;
  existingRule?: PersonalVocabularyRule;
  conflictChoice?: TeachCorrectionConflictChoice;
}>;

export const EMPTY_TEACH_CORRECTION_DRAFT: TeachCorrectionDraft = Object.freeze({
  spoken: "",
  written: "",
  alternatives: [],
  mode: "ask",
  automaticConfirmed: false,
});

const DEFAULT_CANDIDATE_ID = "candidate-primary";

function preserveNonEmptyText(value: string | undefined): string {
  return value && value.trim().length > 0 ? value : "";
}

export function createTeachCorrectionDraft(spoken = ""): TeachCorrectionDraft {
  return {
    ...EMPTY_TEACH_CORRECTION_DRAFT,
    spoken: preserveNonEmptyText(spoken),
  };
}

export function createTeachCorrectionDraftFromRule(
  rule: PersonalVocabularyRule,
): TeachCorrectionDraft {
  const primary = rule.candidates.find((candidate) => candidate.id === rule.defaultCandidateId)
    ?? rule.candidates[0];
  return {
    spoken: rule.spoken,
    written: primary?.written ?? "",
    alternatives: rule.candidates
      .filter((candidate) => candidate.id !== primary?.id)
      .map((candidate) => candidate.written),
    mode: rule.mode,
    // The persisted rule shape does not carry a confirmation bit. An Ask rule
    // must never arrive pre-confirmed when the editor switches it to Automatic.
    automaticConfirmed: rule.mode === "automatic",
    ...(rule.note ? { note: rule.note } : {}),
  };
}

export function normalizeTeachCorrectionDraft(
  draft: Partial<TeachCorrectionDraft>,
): TeachCorrectionDraft {
  return {
    spoken: preserveNonEmptyText(draft.spoken),
    written: preserveNonEmptyText(draft.written),
    alternatives: (draft.alternatives ?? [])
      .filter((value) => value.trim().length > 0),
    mode: draft.mode === "automatic" ? "automatic" : "ask",
    automaticConfirmed: draft.automaticConfirmed === true,
    ...(draft.note && draft.note.trim().length > 0 ? { note: draft.note } : {}),
  };
}

function draftCandidates(draft: TeachCorrectionDraft): ReadonlyArray<{ id?: string; written: string }> {
  const written = draft.written;
  const alternatives = draft.alternatives
    .filter((value) => value.trim().length > 0 && value !== written);
  return [
    ...(written.trim().length > 0 ? [{ id: DEFAULT_CANDIDATE_ID, written }] : []),
    ...alternatives.map((value, index) => ({ id: `candidate-alternative-${index + 1}`, written: value })),
  ];
}

function assignUniqueCandidateIds(
  candidates: ReadonlyArray<{ id?: string; written: string }>,
  existing: ReadonlyArray<PersonalVocabularyCandidate>,
): ReadonlyArray<PersonalVocabularyCandidate> {
  const usedIds = new Set(existing.map((candidate) => candidate.id));
  let nextAlternativeIndex = 1;
  return candidates.map((candidate) => {
    const preferredId = candidate.id;
    let id = preferredId && !usedIds.has(preferredId) ? preferredId : undefined;
    while (!id || usedIds.has(id)) {
      const nextId = `candidate-alternative-${nextAlternativeIndex}`;
      nextAlternativeIndex += 1;
      if (!usedIds.has(nextId)) {
        id = nextId;
      }
    }
    usedIds.add(id);
    return { id, written: candidate.written };
  });
}

function draftRule(draft: TeachCorrectionDraft): PersonalVocabularyRule {
  const candidates = draftCandidates(draft) as PersonalVocabularyCandidate[];
  return {
    id: "draft-teach-correction",
    revision: "0",
    spoken: draft.spoken,
    candidates,
    defaultCandidateId: candidates[0]?.id,
    mode: draft.mode,
    enabled: true,
    ...(draft.note ? { note: draft.note } : {}),
    createdAt: "draft",
    updatedAt: "draft",
  };
}

export function validateTeachCorrectionDraft(
  draftInput: Partial<TeachCorrectionDraft>,
): TeachCorrectionValidation {
  const draft = normalizeTeachCorrectionDraft(draftInput);
  const errors: string[] = [];
  if (!draft.spoken) errors.push("spoken_required");
  if (!draft.written) errors.push("written_required");

  if (!errors.length) {
    const rule = draftRule(draft);
    const validation = validateVocabularyRule(rule, {
      automaticConfirmed: draft.automaticConfirmed,
    });
    errors.push(...validation.errors.map((issue) => issue.code));
  }

  const warnings = !draft.spoken
    ? []
    : getVocabularyRuleWarnings({ id: "draft-teach-correction", spoken: draft.spoken })
      .map((issue) => issue.code);
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze([...new Set(errors)]),
    warnings: Object.freeze([...new Set(warnings)]),
  });
}

export function buildTeachCorrectionMutation(
  draftInput: Partial<TeachCorrectionDraft>,
  options: {
    existingRule?: PersonalVocabularyRule;
    conflictChoice?: TeachCorrectionConflictChoice;
  } = {},
): VocabularyMutation {
  const draft = normalizeTeachCorrectionDraft(draftInput);
  const incoming = draftCandidates(draft);
  const existing = options.existingRule;
  const addAlternative = existing && options.conflictChoice === "add_alternative";
  const incomingAlternatives = addAlternative
    ? incoming.filter((candidate) => !existing.candidates.some((current) => current.written === candidate.written))
    : incoming;
  const incomingWithUniqueIds = addAlternative
    ? assignUniqueCandidateIds(incomingAlternatives, existing.candidates)
    : incoming;
  const candidates = addAlternative
    ? [
        ...existing.candidates,
        ...incomingWithUniqueIds,
      ]
    : incomingWithUniqueIds;
  const defaultCandidateId = addAlternative
    ? existing.defaultCandidateId ?? existing.candidates[0]?.id ?? candidates[0]?.id
    : candidates[0]?.id;
  return {
    spoken: draft.spoken,
    candidates,
    defaultCandidateId,
    mode: addAlternative ? "ask" : draft.mode,
    enabled: true,
    ...(draft.note ? { note: draft.note } : {}),
    ...(draft.automaticConfirmed ? { automaticConfirmed: true } : {}),
  };
}

export function findVocabularyRuleForSpoken(
  snapshot: PersonalVocabularySnapshot,
  spoken: string,
): PersonalVocabularyRule | undefined {
  const normalized = normalizeVocabularyTrigger(spoken);
  return snapshot.rules.find((rule) => normalizeVocabularyTrigger(rule.spoken) === normalized);
}

export function summarizeTeachCorrectionConflict(
  rule: PersonalVocabularyRule,
): TeachCorrectionConflict {
  return {
    ruleId: rule.id,
    revision: rule.revision,
    spoken: rule.spoken,
    candidates: rule.candidates.map((candidate) => candidate.written),
  };
}

function classifySaveError(error: unknown): "conflict" | "network_error" {
  const text = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null
      ? JSON.stringify(error) ?? String(error)
      : String(error);
  return /stale|conflict|409|revision/i.test(text) ? "conflict" : "network_error";
}

export async function saveTeachCorrection(
  input: TeachCorrectionCreateInput,
  client: VocabularyClient,
): Promise<TeachCorrectionSaveResult> {
  const draft = normalizeTeachCorrectionDraft(input.draft);
  const validation = validateTeachCorrectionDraft(draft);
  if (!validation.ok) {
    return {
      status: "invalid",
      error: validation.errors.join(","),
      draftPreserved: true,
    };
  }

  const mutation = buildTeachCorrectionMutation(draft, {
    existingRule: input.existingRule,
    conflictChoice: input.conflictChoice,
  });
  let saved: VocabularyMutationResult;
  try {
    saved = input.existingRule
      ? await client.updateRule({
          ruleId: input.existingRule.id,
          expectedRevision: input.existingRule.revision,
          mutation,
        })
      : await client.createRule({
          expectedRevision: input.snapshot.revision,
          mutation,
        });
  } catch (error) {
    return {
      status: classifySaveError(error),
      error: error instanceof Error ? error.message : "vocabulary_mutation_failed",
      draftPreserved: true,
    };
  }

  let cacheRefreshError: string | undefined;
  try {
    await client.refresh();
  } catch (error) {
    cacheRefreshError = error instanceof Error ? error.message : "vocabulary_refresh_failed";
  }

  if (input.action === "remember_only" || !input.selection) {
    return {
      status: "saved_only",
      rule: saved.rule,
      vocabularyRevision: saved.vocabularyRevision,
      ...(cacheRefreshError ? { cacheRefreshError } : {}),
      draftPreserved: false,
    };
  }

  let replacement: ReplaceCapturedSelectionResult;
  try {
    replacement = await client.replaceCapturedSelection({
      target: input.selection.target,
      selectionId: input.selection.selectionId,
      expectedSelection: input.selection.selectedText,
      selectionTruncated: input.selection.truncated,
      replacement: draft.written,
    });
  } catch (error) {
    replacement = {
      status: "target_unavailable",
      reason: error instanceof Error ? error.message : "replace_selection_failed",
    };
  }

  return {
    status: replacement.status === "replaced" ? "saved_and_replaced" : "saved_selection_unchanged",
    rule: saved.rule,
    vocabularyRevision: saved.vocabularyRevision,
    replacement,
    ...(cacheRefreshError ? { cacheRefreshError } : {}),
    draftPreserved: false,
  };
}

export type TauriInvokeLike = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function createTauriVocabularyClient(
  invokeImpl: TauriInvokeLike = invoke as TauriInvokeLike,
): VocabularyClient {
  const unsupported = () => {
    throw new Error("tauri_runtime_unavailable");
  };
  return {
    readSnapshot: () => {
      if (!isTauri()) return unsupported();
      return invokeImpl<PersonalVocabularySnapshot>("get_fixvox_personal_vocabulary_snapshot");
    },
    refresh: () => {
      if (!isTauri()) return unsupported();
      return invokeImpl("refresh_fixvox_personal_vocabulary");
    },
    createRule: (input) => {
      if (!isTauri()) return unsupported();
      return invokeImpl<VocabularyMutationResult>("create_fixvox_personal_vocabulary_rule", {
        expectedRevision: input.expectedRevision,
        mutation: input.mutation,
      });
    },
    updateRule: (input) => {
      if (!isTauri()) return unsupported();
      return invokeImpl<VocabularyMutationResult>("update_fixvox_personal_vocabulary_rule", {
        ruleId: input.ruleId,
        expectedRevision: input.expectedRevision,
        mutation: input.mutation,
      });
    },
    deleteRule: (input) => {
      if (!isTauri()) return unsupported();
      return invokeImpl<VocabularyMutationResult>("delete_fixvox_personal_vocabulary_rule", {
        ruleId: input.ruleId,
        expectedRevision: input.expectedRevision,
      });
    },
    replaceCapturedSelection: (input) => {
      if (!isTauri()) return unsupported();
      return invokeImpl<ReplaceCapturedSelectionResult>("replace_captured_selection_if_unchanged", {
        target: input.target,
        selectionId: input.selectionId,
        expectedSelection: input.expectedSelection,
        selectionTruncated: input.selectionTruncated,
        replacement: input.replacement,
      });
    },
  };
}
