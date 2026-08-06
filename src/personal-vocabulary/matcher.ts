import {
  normalizeVocabularyText,
  normalizeVocabularyTrigger,
  originalSpanForNormalizedRange,
} from "./normalization";
import type {
  AutomaticVocabularyReplacement,
  PersonalVocabularyCandidate,
  PersonalVocabularyRule,
  PersonalVocabularySnapshot,
  TextSpan,
  VocabularyChoice,
  VocabularyChoiceGroup,
  VocabularyChoiceMap,
  VocabularyIssue,
  VocabularyMatch,
  VocabularyOccurrence,
  VocabularyResolutionPlan,
  VocabularyRuleValidation,
  VocabularyRuleValidationOptions,
  VocabularySnapshotCompilation,
  VocabularySnapshotValidation,
} from "./types";
import { KEEP_ORIGINAL_CANDIDATE_ID } from "./types";

export const DEFAULT_SHORT_TRIGGER_MAX_LENGTH = 3;

// A deliberately conservative multilingual guard. It is only a warning; the
// save boundary decides whether an explicit user confirmation was supplied.
export const DEFAULT_COMMON_TRIGGER_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "de",
  "del",
  "el",
  "en",
  "for",
  "from",
  "in",
  "is",
  "it",
  "la",
  "las",
  "le",
  "los",
  "of",
  "on",
  "or",
  "para",
  "por",
  "que",
  "the",
  "to",
  "un",
  "una",
  "y",
]);

type IndexedRule = Readonly<{
  rule: PersonalVocabularyRule;
  normalizedTrigger: string;
  order: number;
}>;

type IndexedOccurrence = Readonly<{
  indexedRule: IndexedRule;
  normalizedStart: number;
  normalizedEnd: number;
  span: TextSpan;
  normalizedSpan: TextSpan;
  matchedText: string;
}>;

type SelectedMatch = Readonly<{
  match: VocabularyMatch;
  indexedRule: IndexedRule;
  occurrence: IndexedOccurrence;
}>;

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function issue(
  code: VocabularyIssue["code"],
  message: string,
  severity: VocabularyIssue["severity"],
  ruleId?: string,
): VocabularyIssue {
  return Object.freeze({
    code,
    message,
    severity,
    ...(ruleId ? { ruleId } : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonWhitespaceLength(value: string): number {
  return [...value].filter((character) => !/\s/u.test(character)).length;
}

function normalizedWords(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

function hasCommonWords(
  normalizedTrigger: string,
  commonWords: ReadonlySet<string>,
): boolean {
  const words = normalizedWords(normalizedTrigger);
  return words.length > 0 && words.every((word) => commonWords.has(word));
}

function cautionWarnings(
  rule: Pick<PersonalVocabularyRule, "id" | "spoken">,
  options: VocabularyRuleValidationOptions = {},
): VocabularyIssue[] {
  const normalizedTrigger = normalizeVocabularyTrigger(rule.spoken);
  const shortMax =
    options.shortTriggerMaxLength ?? DEFAULT_SHORT_TRIGGER_MAX_LENGTH;
  const commonWords = options.commonWords ?? DEFAULT_COMMON_TRIGGER_WORDS;
  const warnings: VocabularyIssue[] = [];

  if (
    normalizedTrigger.length > 0 &&
    nonWhitespaceLength(normalizedTrigger) <= shortMax
  ) {
    warnings.push(
      issue(
        "trigger-short",
        "Short vocabulary triggers can match ordinary prose; ask for explicit automatic confirmation.",
        "warning",
        rule.id,
      ),
    );
  }
  if (hasCommonWords(normalizedTrigger, commonWords)) {
    warnings.push(
      issue(
        "trigger-common",
        "Common-word triggers can match ordinary prose; prefer Ask or explicit confirmation.",
        "warning",
        rule.id,
      ),
    );
  }
  return warnings;
}

function candidateById(
  rule: Pick<PersonalVocabularyRule, "candidates">,
  id: string | undefined,
): PersonalVocabularyCandidate | undefined {
  return id === undefined
    ? undefined
    : rule.candidates.find((candidate) => candidate.id === id);
}

export function effectiveAutomaticCandidate(
  rule: Pick<PersonalVocabularyRule, "candidates" | "defaultCandidateId">,
): PersonalVocabularyCandidate | undefined {
  if (rule.defaultCandidateId !== undefined) {
    return candidateById(rule, rule.defaultCandidateId);
  }
  return rule.candidates.length === 1 ? rule.candidates[0] : undefined;
}

function structuralRuleErrors(
  rule: PersonalVocabularyRule,
): VocabularyIssue[] {
  const errors: VocabularyIssue[] = [];
  const normalizedTrigger =
    isRecord(rule) && typeof rule.spoken === "string"
      ? normalizeVocabularyTrigger(rule.spoken)
      : "";

  if (!isRecord(rule) || typeof rule.id !== "string" || rule.id.length === 0) {
    errors.push(issue("invalid-rule", "Vocabulary rule id is required.", "error"));
  }
  if (typeof rule.spoken !== "string" || normalizedTrigger.length === 0) {
    errors.push(
      issue(
        "empty-trigger",
        "Vocabulary rule trigger must contain non-whitespace text.",
        "error",
        rule.id,
      ),
    );
  }
  if (!Array.isArray(rule.candidates)) {
    errors.push(
      issue(
        "invalid-rule",
        "Vocabulary rule candidates must be an array.",
        "error",
        rule.id,
      ),
    );
    return errors;
  }

  const ids = new Set<string>();
  for (const candidate of rule.candidates) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      candidate.id.length === 0
    ) {
      errors.push(
        issue(
          "invalid-rule",
          "Every vocabulary candidate needs a non-empty id.",
          "error",
          rule.id,
        ),
      );
      continue;
    }
    if (ids.has(candidate.id)) {
      errors.push(
        issue(
          "duplicate-candidate-id",
          "Vocabulary candidate ids must be unique within a rule.",
          "error",
          rule.id,
        ),
      );
    }
    ids.add(candidate.id);
    if (typeof candidate.written !== "string" || candidate.written.trim().length === 0) {
      errors.push(
        issue(
          "empty-candidate",
          "Every vocabulary candidate needs written text.",
          "error",
          rule.id,
        ),
      );
    }
  }

  if (
    rule.defaultCandidateId !== undefined &&
    !ids.has(rule.defaultCandidateId)
  ) {
    errors.push(
      issue(
        "missing-default-candidate",
        "The default candidate id must refer to one of the candidates.",
        "error",
        rule.id,
      ),
    );
  }

  if (rule.mode === "automatic") {
    if (!effectiveAutomaticCandidate(rule)) {
      errors.push(
        issue(
          "automatic-candidate-count",
          "Automatic vocabulary rules need exactly one effective candidate.",
          "error",
          rule.id,
        ),
      );
    }
  } else if (rule.mode === "ask") {
    if (rule.candidates.length === 0) {
      errors.push(
        issue(
          "ask-candidate-count",
          "Ask vocabulary rules need at least one candidate.",
          "error",
          rule.id,
        ),
      );
    }
  } else {
    errors.push(
      issue("invalid-rule", "Vocabulary rule mode is invalid.", "error", rule.id),
    );
  }

  return errors;
}

/** Warnings shown before a rule is made automatic. */
export function getVocabularyRuleWarnings(
  rule: Pick<PersonalVocabularyRule, "id" | "spoken">,
  options: VocabularyRuleValidationOptions = {},
): readonly VocabularyIssue[] {
  return freezeArray(cautionWarnings(rule, options));
}

/**
 * Validate a rule at the store boundary. Short/common automatic triggers are
 * rejected unless the caller records an explicit confirmation action.
 */
export function validateVocabularyRule(
  rule: PersonalVocabularyRule,
  options: VocabularyRuleValidationOptions = {},
): VocabularyRuleValidation {
  const warnings = cautionWarnings(rule, options);
  const errors = structuralRuleErrors(rule);
  const requireConfirmation =
    options.requireExplicitAutomaticConfirmation ?? true;
  if (
    requireConfirmation &&
    rule.mode === "automatic" &&
    warnings.length > 0 &&
    options.automaticConfirmed !== true
  ) {
    errors.push(
      issue(
        "automatic-confirmation-required",
        "Short or common automatic triggers require explicit user confirmation.",
        "error",
        rule.id,
      ),
    );
  }
  return Object.freeze({
    ok: errors.length === 0,
    warnings: freezeArray(warnings),
    errors: freezeArray(errors),
  });
}

export function validateVocabularySnapshot(
  snapshot: PersonalVocabularySnapshot,
  options: VocabularyRuleValidationOptions = {},
): VocabularySnapshotValidation {
  const warnings: VocabularyIssue[] = [];
  const errors: VocabularyIssue[] = [];
  const rules = Array.isArray(snapshot?.rules) ? snapshot.rules : [];
  const normalizedTriggers = new Map<
    string,
    Array<{ rule: PersonalVocabularyRule; candidate?: PersonalVocabularyCandidate }>
  >();

  for (const rule of rules) {
    const validation = validateVocabularyRule(rule, options);
    warnings.push(...validation.warnings);
    errors.push(...validation.errors);
    const normalizedTrigger = normalizeVocabularyTrigger(rule.spoken);
    const entries = normalizedTriggers.get(normalizedTrigger) ?? [];
    entries.push({
      rule,
      candidate:
        rule.mode === "automatic" ? effectiveAutomaticCandidate(rule) : undefined,
    });
    normalizedTriggers.set(normalizedTrigger, entries);
  }

  for (const entries of normalizedTriggers.values()) {
    const automatic = entries.filter(
      (entry) => entry.rule.mode === "automatic" && entry.candidate,
    );
    const written = new Set(
      automatic.map((entry) => entry.candidate?.written ?? ""),
    );
    if (written.size > 1) {
      errors.push(
        issue(
          "automatic-conflict",
          "Two automatic rules cannot replace the same normalized trigger differently.",
          "error",
          automatic[0]?.rule.id,
        ),
      );
    }
  }

  return Object.freeze({
    ok: errors.length === 0,
    warnings: freezeArray(warnings),
    errors: freezeArray(errors),
  });
}

function cloneCandidate(candidate: PersonalVocabularyCandidate): PersonalVocabularyCandidate {
  return Object.freeze({ id: candidate.id, written: candidate.written });
}

function cloneRule(rule: PersonalVocabularyRule): PersonalVocabularyRule {
  return Object.freeze({
    ...rule,
    candidates: freezeArray(rule.candidates.map(cloneCandidate)),
  });
}

/** Copy/freeze a snapshot for use by a resolver without mutating the caller. */
export function compileVocabularySnapshot(
  snapshot: PersonalVocabularySnapshot,
): VocabularySnapshotCompilation {
  const copiedRules = Array.isArray(snapshot?.rules)
    ? snapshot.rules.map(cloneRule)
    : [];
  const copiedSnapshot = Object.freeze({
    revision: typeof snapshot?.revision === "string" ? snapshot.revision : "",
    rules: freezeArray(copiedRules),
  });
  // Runtime matching only rejects structural errors. The explicit confirmation
  // gate belongs to the mutation/UI boundary and is not recoverable here.
  const validation = validateVocabularySnapshot(copiedSnapshot, {
    requireExplicitAutomaticConfirmation: false,
  });
  return Object.freeze({
    snapshot: copiedSnapshot,
    rules: freezeArray(
      copiedRules.filter((rule) =>
        validateVocabularyRule(rule, {
          requireExplicitAutomaticConfirmation: false,
        }).errors.length === 0,
      ),
    ),
    warnings: validation.warnings,
    errors: validation.errors,
  });
}

function isWordLike(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}\p{M}\p{Pc}]/u.test(character);
}

function codePointBefore(value: string, offset: number): string | undefined {
  if (offset <= 0) {
    return undefined;
  }
  const previousUnit = value.charCodeAt(offset - 1);
  const startsSurrogatePair =
    previousUnit >= 0xdc00 &&
    previousUnit <= 0xdfff &&
    offset >= 2 &&
    value.charCodeAt(offset - 2) >= 0xd800 &&
    value.charCodeAt(offset - 2) <= 0xdbff;
  const start = startsSurrogatePair ? offset - 2 : offset - 1;
  const codePoint = value.codePointAt(start);
  if (codePoint === undefined) {
    return undefined;
  }
  const width = codePoint > 0xffff ? 2 : 1;
  return value.slice(offset - width, offset);
}

function codePointAt(value: string, offset: number): string | undefined {
  if (offset < 0 || offset >= value.length) {
    return undefined;
  }
  const codePoint = value.codePointAt(offset);
  if (codePoint === undefined) {
    return undefined;
  }
  return value.slice(offset, offset + (codePoint > 0xffff ? 2 : 1));
}

function passesBoundary(
  normalized: string,
  start: number,
  end: number,
  trigger: string,
): boolean {
  const triggerCharacters = [...trigger];
  const first = triggerCharacters[0];
  const last = triggerCharacters.at(-1);
  const previous = codePointBefore(normalized, start);
  const next = codePointAt(normalized, end);
  return !(
    (isWordLike(first) && isWordLike(previous)) ||
    (isWordLike(last) && isWordLike(next))
  );
}

function findOccurrences(
  normalizedText: ReturnType<typeof normalizeVocabularyText>,
  indexedRule: IndexedRule,
): IndexedOccurrence[] {
  const occurrences: IndexedOccurrence[] = [];
  const { normalized } = normalizedText;
  const trigger = indexedRule.normalizedTrigger;
  if (!trigger) {
    return occurrences;
  }

  let from = 0;
  while (from <= normalized.length - trigger.length) {
    const found = normalized.indexOf(trigger, from);
    if (found < 0) {
      break;
    }
    const end = found + trigger.length;
    if (passesBoundary(normalized, found, end, trigger)) {
      const originalSpan = originalSpanForNormalizedRange(
        normalizedText,
        found,
        end,
      );
      if (originalSpan) {
        occurrences.push(
          Object.freeze({
            indexedRule,
            normalizedStart: found,
            normalizedEnd: end,
            span: originalSpan,
            normalizedSpan: Object.freeze({ start: found, end }),
            matchedText: normalizedText.original.slice(
              originalSpan.start,
              originalSpan.end,
            ),
          }),
        );
      }
    }
    // Advance one canonical code unit so adjacent/repeated occurrences are
    // found; overlap resolution happens after all spans are collected.
    from = found + 1;
  }
  return occurrences;
}

function toVocabularyMatch(occurrence: IndexedOccurrence): VocabularyMatch {
  const { rule } = occurrence.indexedRule;
  return Object.freeze({
    ruleId: rule.id,
    ruleRevision: rule.revision,
    mode: rule.mode,
    trigger: rule.spoken,
    normalizedTrigger: occurrence.indexedRule.normalizedTrigger,
    matchedText: occurrence.matchedText,
    span: occurrence.span,
    normalizedSpan: occurrence.normalizedSpan,
    candidates: rule.candidates,
  });
}

function spansOverlap(left: TextSpan, right: TextSpan): boolean {
  return left.start < right.end && right.start < left.end;
}

/**
 * Global overlap priority: the longest canonical trigger wins even when it
 * starts later than a shorter overlapping trigger. Equal-length candidates
 * remain deterministic by their source position and then snapshot order.
 */
function compareOccurrences(left: IndexedOccurrence, right: IndexedOccurrence): number {
  const leftLength = left.normalizedEnd - left.normalizedStart;
  const rightLength = right.normalizedEnd - right.normalizedStart;
  if (leftLength !== rightLength) {
    return rightLength - leftLength;
  }
  if (left.normalizedStart !== right.normalizedStart) {
    return left.normalizedStart - right.normalizedStart;
  }
  return left.indexedRule.order - right.indexedRule.order;
}

function compareMatches(left: VocabularyMatch, right: VocabularyMatch): number {
  if (left.span.start !== right.span.start) {
    return left.span.start - right.span.start;
  }
  if (left.span.end !== right.span.end) {
    return left.span.end - right.span.end;
  }
  return left.ruleId.localeCompare(right.ruleId);
}

function uniqueCandidates(
  candidates: readonly PersonalVocabularyCandidate[],
): readonly PersonalVocabularyCandidate[] {
  const seen = new Set<string>();
  const result: PersonalVocabularyCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue;
    }
    seen.add(candidate.id);
    result.push(candidate);
  }
  return freezeArray(result);
}

function choiceCandidatesForRule(
  rule: PersonalVocabularyRule,
): readonly PersonalVocabularyCandidate[] {
  if (rule.mode === "ask") {
    return rule.candidates;
  }
  const candidate = effectiveAutomaticCandidate(rule);
  return candidate ? [candidate] : [];
}

/**
 * Candidate ids are rule-local in persisted snapshots. Once several rules are
 * combined into one Ask group, namespace ids in the ephemeral plan so a
 * picker choice cannot select the wrong rule's candidate. Written text is
 * compared exactly to retain safe deduplication of equivalent alternatives.
 */
function combinedChoiceCandidates(
  rules: readonly PersonalVocabularyRule[],
): readonly PersonalVocabularyCandidate[] {
  const seenWritten = new Set<string>();
  const seenIds = new Set<string>();
  const combined: PersonalVocabularyCandidate[] = [];

  for (const rule of rules) {
    for (const candidate of choiceCandidatesForRule(rule)) {
      if (seenWritten.has(candidate.written)) {
        continue;
      }
      const baseId = `combined:${encodeURIComponent(rule.id)}:candidate:${encodeURIComponent(candidate.id)}`;
      let choiceId = baseId;
      let suffix = 2;
      while (seenIds.has(choiceId)) {
        choiceId = `${baseId}:${suffix}`;
        suffix += 1;
      }
      seenWritten.add(candidate.written);
      seenIds.add(choiceId);
      combined.push(
        Object.freeze({
          id: choiceId,
          written: candidate.written,
        }),
      );
    }
  }
  return freezeArray(combined);
}

function buildChoiceGroups(
  matches: readonly SelectedMatch[],
): readonly VocabularyChoiceGroup[] {
  const groups = new Map<
    string,
    { trigger: string; normalizedTrigger: string; occurrences: VocabularyOccurrence[]; candidates: PersonalVocabularyCandidate[] }
  >();

  for (const selected of matches) {
    if (selected.indexedRule.rule.mode !== "ask") {
      continue;
    }
    const key = selected.indexedRule.normalizedTrigger;
    const existing = groups.get(key) ?? {
      trigger: selected.indexedRule.rule.spoken,
      normalizedTrigger: key,
      occurrences: [],
      candidates: [],
    };
    existing.occurrences.push({ match: selected.match });
    existing.candidates.push(...selected.indexedRule.rule.candidates);
    groups.set(key, existing);
  }

  return freezeArray(
    [...groups.entries()].map(([normalizedTrigger, group]) => {
      const candidates = uniqueCandidates(group.candidates);
      return Object.freeze({
        id: `ask:${normalizedTrigger}`,
        trigger: group.trigger,
        normalizedTrigger,
        occurrences: freezeArray(group.occurrences),
        candidates,
        options: candidates,
        includeOriginal: true as const,
      });
    }),
  );
}

function selectNonOverlapping(
  matches: readonly SelectedMatch[],
): readonly SelectedMatch[] {
  const selected: SelectedMatch[] = [];
  for (const candidate of [...matches].sort((left, right) =>
    compareOccurrences(left.occurrence, right.occurrence),
  )) {
    if (
      selected.some((selectedMatch) =>
        spansOverlap(
          selectedMatch.occurrence.normalizedSpan,
          candidate.occurrence.normalizedSpan,
        ),
      )
    ) {
      continue;
    }
    selected.push(candidate);
  }
  return freezeArray(
    selected.sort((left, right) =>
      compareOccurrences(left.occurrence, right.occurrence),
    ),
  );
}

function mergeSameSpanMatches(
  occurrences: readonly IndexedOccurrence[],
): readonly SelectedMatch[] {
  // Group exact spans before overlap resolution. Otherwise an earlier sort
  // winner could hide a same-span Ask rule behind an automatic rule.
  const grouped = new Map<string, IndexedOccurrence[]>();
  for (const occurrence of occurrences) {
    const key = `${occurrence.normalizedStart}:${occurrence.normalizedEnd}`;
    const sameSpan = grouped.get(key) ?? [];
    sameSpan.push(occurrence);
    grouped.set(key, sameSpan);
  }

  const merged = [...grouped.values()].map((sameSpan) => {
    const first = sameSpan[0]!;
    if (sameSpan.length === 1) {
      return {
        match: toVocabularyMatch(first),
        indexedRule: first.indexedRule,
        occurrence: first,
      } satisfies SelectedMatch;
    }

    const rules = sameSpan.map((occurrence) => occurrence.indexedRule.rule);
    const automaticCandidates = rules.map(effectiveAutomaticCandidate);
    const needsChoice = rules.some((rule) => rule.mode === "ask");
    const automaticConflict =
      rules.every((rule) => rule.mode === "automatic") &&
      new Set(
        automaticCandidates.map((candidate) => candidate?.written ?? ""),
      ).size > 1;

    if (!needsChoice && !automaticConflict) {
      return {
        match: toVocabularyMatch(first),
        indexedRule: first.indexedRule,
        occurrence: first,
      } satisfies SelectedMatch;
    }

    const mergedRule = Object.freeze({
      ...first.indexedRule.rule,
      mode: "ask" as const,
      defaultCandidateId: undefined,
      candidates: combinedChoiceCandidates(rules),
    });
    const mergedIndexedRule = Object.freeze({
      ...first.indexedRule,
      rule: mergedRule,
    });
    const mergedOccurrence = Object.freeze({
      ...first,
      indexedRule: mergedIndexedRule,
    });
    return {
      match: toVocabularyMatch(mergedOccurrence),
      indexedRule: mergedIndexedRule,
      occurrence: mergedOccurrence,
    } satisfies SelectedMatch;
  });

  return freezeArray(
    merged.sort((left, right) =>
      compareOccurrences(left.occurrence, right.occurrence),
    ),
  );
}

export function applyVocabularyReplacements(
  originalText: string,
  replacements: readonly Readonly<{ span: TextSpan; replacement: string }>[],
): string {
  const ordered = [...replacements]
    .filter(
      (replacement) =>
        Number.isInteger(replacement.span.start) &&
        Number.isInteger(replacement.span.end) &&
        replacement.span.start >= 0 &&
        replacement.span.end >= replacement.span.start &&
        replacement.span.end <= originalText.length,
    )
    .sort((left, right) => left.span.start - right.span.start);
  let cursor = 0;
  let output = "";
  for (const replacement of ordered) {
    if (replacement.span.start < cursor) {
      // Fail closed for an accidental overlap; a compiled plan is non-overlap.
      continue;
    }
    output += originalText.slice(cursor, replacement.span.start);
    output += replacement.replacement;
    cursor = replacement.span.end;
  }
  return output + originalText.slice(cursor);
}

function choicesToMap(choices: VocabularyChoiceMap | undefined): ReadonlyMap<string, VocabularyChoice> {
  if (!choices) {
    return new Map();
  }
  if (choices instanceof Map) {
    return choices;
  }
  if (Array.isArray(choices)) {
    return new Map(choices.map((choice) => [choice.groupId, choice.choice]));
  }
  return new Map(Object.entries(choices));
}

export function applyVocabularyChoices(
  plan: VocabularyResolutionPlan,
  choices?: VocabularyChoiceMap,
): string {
  const choiceMap = choicesToMap(choices);
  const replacements: Array<{ span: TextSpan; replacement: string }> = [
    ...plan.automatic.map((replacement) => ({
      span: replacement.match.span,
      replacement: replacement.replacement,
    })),
  ];

  for (const group of plan.askGroups) {
    const choice = choiceMap.get(group.id);
    if (!choice || choice === KEEP_ORIGINAL_CANDIDATE_ID) {
      continue;
    }
    const candidate = group.candidates.find((option) => option.id === choice);
    if (!candidate) {
      continue;
    }
    for (const occurrence of group.occurrences) {
      replacements.push({
        span: occurrence.match.span,
        replacement: candidate.written,
      });
    }
  }
  return applyVocabularyReplacements(plan.originalText, replacements);
}

/**
 * Detect and plan every replacement against the original text. No replacement
 * is fed back into matching, so a written candidate can never trigger another
 * rule in the same pass.
 */
export function matchVocabulary(
  originalText: string,
  snapshot: PersonalVocabularySnapshot,
): VocabularyResolutionPlan {
  const compiled = compileVocabularySnapshot(snapshot);
  const normalizedText = normalizeVocabularyText(originalText);
  const indexedRules: IndexedRule[] = compiled.rules
    .filter((rule) => rule.enabled)
    .map((rule, order) =>
      Object.freeze({
        rule,
        normalizedTrigger: normalizeVocabularyTrigger(rule.spoken),
        order,
      }),
    )
    .filter((rule) => rule.normalizedTrigger.length > 0);

  const candidateOccurrences = indexedRules.flatMap((indexedRule) =>
    findOccurrences(normalizedText, indexedRule),
  );
  const candidateMatches = freezeArray(
    candidateOccurrences
      .slice()
      .sort(compareOccurrences)
      .map(toVocabularyMatch),
  );
  const sameSpanMatches = mergeSameSpanMatches(candidateOccurrences);
  const selectedMatches = selectNonOverlapping(sameSpanMatches);
  const matches = freezeArray(
    selectedMatches.map((selected) => selected.match).sort(compareMatches),
  );

  const automatic: AutomaticVocabularyReplacement[] = [];
  for (const selected of selectedMatches) {
    if (selected.indexedRule.rule.mode !== "automatic") {
      continue;
    }
    const candidate = effectiveAutomaticCandidate(selected.indexedRule.rule);
    if (!candidate) {
      continue;
    }
    automatic.push(
      Object.freeze({
        match: selected.match,
        candidate,
        replacement: candidate.written,
      }),
    );
  }
  automatic.sort((left, right) => compareMatches(left.match, right.match));
  const frozenAutomatic = freezeArray(automatic);
  const askGroups = buildChoiceGroups(selectedMatches);
  const automaticText = applyVocabularyReplacements(
    originalText,
    frozenAutomatic.map((replacement) => ({
      span: replacement.match.span,
      replacement: replacement.replacement,
    })),
  );

  return Object.freeze({
    originalText,
    snapshotRevision: compiled.snapshot.revision,
    normalizedText,
    candidateMatches,
    allMatches: candidateMatches,
    matches,
    automatic: frozenAutomatic,
    askGroups,
    pendingGroups: askGroups,
    automaticText,
    text: automaticText,
    hasPendingChoices: askGroups.length > 0,
  });
}

/** Apply automatic replacements, or apply supplied Ask choices too. */
export function resolveVocabulary(
  originalText: string,
  snapshot: PersonalVocabularySnapshot,
  choices?: VocabularyChoiceMap,
): string {
  const plan = matchVocabulary(originalText, snapshot);
  return choices ? applyVocabularyChoices(plan, choices) : plan.automaticText;
}

export const applyVocabulary = resolveVocabulary;

/** Compile once when a controller wants to reuse a snapshot for many strings. */
export function createVocabularyMatcher(snapshot: PersonalVocabularySnapshot) {
  const compiledSnapshot = compileVocabularySnapshot(snapshot).snapshot;
  return (originalText: string): VocabularyResolutionPlan =>
    matchVocabulary(originalText, compiledSnapshot);
}
