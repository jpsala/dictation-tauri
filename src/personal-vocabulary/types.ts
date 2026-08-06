/**
 * Shared, account-scoped vocabulary contracts.
 *
 * The matcher treats snapshots as immutable input.  The cloud/store layer can
 * use the same shapes with mutable arrays at its boundary; the readonly views
 * here make it harder for a resolver to accidentally change a cached snapshot.
 */

export type VocabularyRuleMode = "automatic" | "ask";
/** Alias used by the cloud/store contract. */
export type PersonalVocabularyMode = VocabularyRuleMode;

export type PersonalVocabularyCandidate = Readonly<{
  id: string;
  written: string;
}>;

/** The persisted rule shape agreed by the vocabulary technical plan. */
export type PersonalVocabularyRule = Readonly<{
  id: string;
  revision: string;
  spoken: string;
  candidates: readonly PersonalVocabularyCandidate[];
  defaultCandidateId?: string;
  mode: VocabularyRuleMode;
  enabled: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
}>;

export type PersonalVocabularySnapshot = Readonly<{
  revision: string;
  rules: readonly PersonalVocabularyRule[];
  /** Opaque host/cache scope; never used as matcher input. */
  scope?: string;
}>;

// Short aliases keep the contract pleasant at integration boundaries.
export type VocabularyCandidate = PersonalVocabularyCandidate;
export type VocabularyRule = PersonalVocabularyRule;
export type VocabularySnapshot = PersonalVocabularySnapshot;

/** UTF-16 offsets, matching String#slice and DOM text ranges. */
export type TextSpan = Readonly<{
  start: number;
  end: number;
}>;

/**
 * Canonical text plus one source span for every UTF-16 code unit in it.
 * Repeated spans are intentional when one source code point expands during
 * Unicode normalization (for example, a ligature or an accented character).
 */
export type NormalizedVocabularyText = Readonly<{
  original: string;
  normalized: string;
  spans: readonly TextSpan[];
  /** A descriptive alias for callers that prefer the mapping terminology. */
  spanMap: readonly TextSpan[];
}>;

export type VocabularyWarningCode =
  | "trigger-short"
  | "trigger-common"
  | "automatic-confirmation-required";

export type VocabularyErrorCode =
  | "invalid-rule"
  | "empty-trigger"
  | "empty-candidate"
  | "duplicate-candidate-id"
  | "missing-default-candidate"
  | "automatic-candidate-count"
  | "ask-candidate-count"
  | "automatic-conflict";

export type VocabularyIssue = Readonly<{
  code: VocabularyWarningCode | VocabularyErrorCode;
  message: string;
  severity: "warning" | "error";
  ruleId?: string;
}>;

export type VocabularyRuleValidation = Readonly<{
  ok: boolean;
  warnings: readonly VocabularyIssue[];
  errors: readonly VocabularyIssue[];
}>;

export type VocabularySnapshotValidation = Readonly<{
  ok: boolean;
  warnings: readonly VocabularyIssue[];
  errors: readonly VocabularyIssue[];
}>;

export type VocabularyMatch = Readonly<{
  ruleId: string;
  ruleRevision: string;
  mode: VocabularyRuleMode;
  trigger: string;
  normalizedTrigger: string;
  matchedText: string;
  span: TextSpan;
  normalizedSpan: TextSpan;
  candidates: readonly PersonalVocabularyCandidate[];
}>;

export type AutomaticVocabularyReplacement = Readonly<{
  match: VocabularyMatch;
  candidate: PersonalVocabularyCandidate;
  replacement: string;
}>;

export type VocabularyOccurrence = Readonly<{
  match: VocabularyMatch;
}>;

export const KEEP_ORIGINAL_CANDIDATE_ID = "__keep_original__" as const;

export type VocabularyChoice =
  | typeof KEEP_ORIGINAL_CANDIDATE_ID
  | string;

export type VocabularyChoiceGroup = Readonly<{
  /** Stable for the same normalized trigger within one resolver plan. */
  id: string;
  trigger: string;
  normalizedTrigger: string;
  occurrences: readonly VocabularyOccurrence[];
  candidates: readonly PersonalVocabularyCandidate[];
  /** Alias used by picker-facing consumers. */
  options: readonly PersonalVocabularyCandidate[];
  includeOriginal: true;
}>;

export type VocabularyResolutionPlan = Readonly<{
  originalText: string;
  snapshotRevision: string;
  normalizedText: NormalizedVocabularyText;
  /** Every span found before overlap resolution. */
  candidateMatches: readonly VocabularyMatch[];
  allMatches: readonly VocabularyMatch[];
  /** Stable, non-overlapping spans selected for the one-pass plan. */
  matches: readonly VocabularyMatch[];
  automatic: readonly AutomaticVocabularyReplacement[];
  askGroups: readonly VocabularyChoiceGroup[];
  /** Picker-friendly alias for askGroups. */
  pendingGroups: readonly VocabularyChoiceGroup[];
  /** Original text with automatic matches applied, and ask matches preserved. */
  automaticText: string;
  text: string;
  hasPendingChoices: boolean;
}>;

export type VocabularyRuleValidationOptions = Readonly<{
  /** Defaults to three non-whitespace code points. */
  shortTriggerMaxLength?: number;
  /** Override the default language-independent common-word guard. */
  commonWords?: ReadonlySet<string>;
  /** Required for short/common automatic triggers by default. */
  requireExplicitAutomaticConfirmation?: boolean;
  /** Set by the explicit user action in a store/UI boundary. */
  automaticConfirmed?: boolean;
}>;

export type VocabularySnapshotCompilation = Readonly<{
  snapshot: PersonalVocabularySnapshot;
  rules: readonly PersonalVocabularyRule[];
  warnings: readonly VocabularyIssue[];
  errors: readonly VocabularyIssue[];
}>;

export type VocabularyChoiceMap =
  | ReadonlyMap<string, VocabularyChoice>
  | Readonly<Record<string, VocabularyChoice>>
  | ReadonlyArray<Readonly<{ groupId: string; choice: VocabularyChoice }>>;
