import {
  syntheticAudioDifficulties,
  syntheticAudioFormats,
  syntheticAudioGoldStatuses,
  syntheticAudioSensitivityLevels,
  syntheticAudioSourceTypes,
  syntheticAudioVersionPolicies,
  type SyntheticAudioFixture,
  type SyntheticAudioGoldStatus,
  type TranscriptionQualityCorpusManifest,
} from "./synthetic-audio-manifest";

export type EvidenceState<T> = {
  configured: T;
  resolved?: T;
  observed?: T;
};

export type TranscriptionQualityPromptIdentity =
  | {
      id: string;
      version: string;
      sha256?: never;
      chars?: never;
    }
  | {
      id: string;
      version: string;
      sha256: string;
      chars: number;
    };
export type TranscriptionQualitySttMetadataPolicy =
  | { mode: "none" }
  | {
      mode: "bounded-verbose";
      maxWords: number;
      maxSegments: number;
    };

export const transcriptionQualityMaterializationReasons = [
  "provider_text_kept",
  "empty_provider_text",
  "no_speech_probability",
  "complete_hallucination",
  "trailing_hallucination_removed",
  "whitespace_normalized",
] as const;

export type TranscriptionQualityMaterializationReason =
  (typeof transcriptionQualityMaterializationReasons)[number];


export type TranscriptionQualityCandidateRecipe = {
  audioPrep: { mode: string; configHash: string };
  stt: {
    provider: string;
    model: string;
    prompt: TranscriptionQualityPromptIdentity;
    language: string;
    temperature: number;
    responseFormat: string;
    evaluationRecipeId: string;
    metadata: TranscriptionQualitySttMetadataPolicy;
  };
  materialization: { mode: string; configHash: string };
  postprocess: null | {
    provider: string;
    model: string;
    prompt: TranscriptionQualityPromptIdentity;
    cleanupLevel: "light" | "medium" | "strong";
    prosody: "off" | "advisory";
    sanitizerVersion: string;
  };
  vocabulary:
    | { mode: "off" }
    | { mode: "rules"; rulesHash: string; resolution: "automatic" | "ask" };
};

export type TranscriptionQualityCandidate = {
  candidateId: string;
  candidateVersion: string;
  recipe: EvidenceState<TranscriptionQualityCandidateRecipe>;
};

export type TranscriptionQualityCandidateReceipt = {
  candidateId: string;
  candidateVersion: string;
  recipeHash: string;
  evaluationRecipeId: string;
};

export type TranscriptionQualityProviderCalls =
  | { enabled: false; maxRequests: 0 }
  | {
      enabled: true;
      maxRequests: number;
      maxCostUsd: number;
      authorization: "explicit-user-approval";
    };

export type TranscriptionQualityExecutionKind = "gate-a" | "gate-b" | "vocabulary-replay";

export const transcriptionQualityExecutionErrorCodes = [
  "laboratory_execution_unauthorized",
  "laboratory_execution_definition_mismatch",
  "laboratory_execution_source_incomplete",
  "laboratory_execution_grant_expired",
  "laboratory_execution_grant_mismatch",
  "laboratory_execution_grant_reused",
  "laboratory_execution_budget_exhausted",
  "snapshot_prerequisite_unavailable",
  "snapshot_not_found",
  "snapshot_stale",
  "snapshot_kind_not_allowlisted",
  "snapshot_read_out_of_bounds",
] as const;

export type TranscriptionQualityExecutionErrorCode =
  (typeof transcriptionQualityExecutionErrorCodes)[number];

export type TranscriptionQualityVocabularySnapshotIdentity = Readonly<{
  snapshotId: string;
  revision: string;
  sha256: string;
  source: "personal-vocabulary";
  scope: "redacted";
  ruleCount: number;
  capturedAt: string;
}>;

export type TranscriptionQualityExecutionReceipt = Readonly<{
  schemaVersion: 1;
  kind: TranscriptionQualityExecutionKind;
  definitionHash: string;
  estimateHash: string;
  executionId: string | null;
  requestCount: number;
  maxRequests: number;
  observedCostUsd: number | null;
  maxCostUsd: number;
  sourceRunId: string | null;
  vocabularySnapshot: TranscriptionQualityVocabularySnapshotIdentity | null;
  providerCalls: number;
  sttCalls: number;
  status: "unavailable" | "accepted" | "running" | "completed" | "aborted";
  errorCode: TranscriptionQualityExecutionErrorCode | null;
}>;

export const TRANSCRIPTION_QUALITY_WIRE_EXAMPLES = Object.freeze({
  vocabularySnapshot: Object.freeze({
    snapshotId: "pv-snapshot-0123456789ab",
    revision: "revision-1",
    sha256: "0".repeat(64),
    source: "personal-vocabulary" as const,
    scope: "redacted" as const,
    ruleCount: 0,
    capturedAt: "2026-08-13T00:00:00.000Z",
  }),
  unavailableExecution: Object.freeze({
    schemaVersion: 1 as const,
    kind: "gate-a" as const,
    definitionHash: "0".repeat(64),
    estimateHash: "0".repeat(64),
    executionId: null,
    requestCount: 0,
    maxRequests: 12,
    observedCostUsd: null,
    maxCostUsd: 0.005,
    sourceRunId: null,
    vocabularySnapshot: null,
    providerCalls: 0,
    sttCalls: 0,
    status: "unavailable" as const,
    errorCode: "laboratory_execution_unauthorized" as const,
  }),
});

export type TranscriptionQualityRun = {
  schemaVersion: 1;
  runId: string;
  runnerVersion: string;
  corpus: { corpusId: string; corpusVersion: string };
  candidates: readonly EvidenceState<TranscriptionQualityCandidateReceipt>[];
  sampleIds: readonly string[];
  providerCalls: TranscriptionQualityProviderCalls;
  resultPath: string;
  startedAt?: string;
  finishedAt?: string;
};

export type TranscriptionQualityResultIdentity = {
  sttProvider?: string;
  sttModel?: string;
  sttEngineId?: string;
  sttPromptId?: string;
  sttPromptSha256?: string;
  language?: string;
  responseFormat?: string;
  postprocessProvider?: string;
  postprocessModel?: string;
  postprocessPromptSha256?: string;
};

export type TranscriptionQualityRawSource =
  | { kind: "produced" }
  | { kind: "reused"; sourceRunId: string; sourceSampleId: string };

export type TranscriptionQualitySttMetadataReceipt =
  | {
      status: "not-observed";
      redacted: true;
    }
  | {
      status: "observed";
      redacted: true;
      privateRef: string;
      bounds: {
        maxWords: number;
        maxSegments: number;
      };
      counts: {
        words: number;
        segments: number;
        droppedWords: number;
        droppedSegments: number;
      };
      durationMs?: number;
      noSpeechProbability?: number;
      averageLogProbability?: number;
    };

export type TranscriptionQualityEntityScores = {
  expected: number;
  matched: number;
  falseReplacements: number;
  exactMatchRate?: number;
};

export type TranscriptionQualityStructureScores = {
  punctuation: number;
  lists: number;
};

export type TranscriptionQualitySemanticSafetyScores = {
  omissions: number;
  additions: number;
  translationDrift: number;
  intentDrift: number;
  instructionFollowing: number;
};

export type TranscriptionQualitySampleResult = {
  schemaVersion: 1;
  runId: string;
  sampleId: string;
  candidateId: string;
  audio: {
    sha256: string;
    original: { format: string; bytes: number; durationMs: number };
    upload: { format: string; bytes: number; source: string };
  };
  identity: EvidenceState<TranscriptionQualityResultIdentity>;
  rawSource: TranscriptionQualityRawSource;
  text: {
    goldRef: string;
    rawTranscriptRef: string;
    finalTextRef: string;
    goldLength: number;
    rawTranscriptLength: number;
    finalTextLength: number;
  };
  stages: {
    stt: {
      status: "ok" | "no-speech" | "error";
      metadata: TranscriptionQualitySttMetadataReceipt;
    };
    materialization: {
      status: "kept" | "changed" | "discarded";
      reasons: readonly TranscriptionQualityMaterializationReason[];
    };
    postprocess: {
      status: "off" | "ok" | "fallback" | "error";
      sanitizerReason?: string;
    };
    vocabulary: { status: "off" | "unchanged" | "changed" };
  };
  timingsMs: {
    audioPrep: number;
    stt: number;
    postprocess: number;
    total: number;
  };
  costUsd: {
    stt?: number;
    postprocess?: number;
    total?: number;
    source: string;
  };
  scores: {
    wer?: number;
    cer?: number;
    entities?: TranscriptionQualityEntityScores;
    structure?: TranscriptionQualityStructureScores;
    semanticSafety?: TranscriptionQualitySemanticSafetyScores;
    robustness?: number;
  };
  errors: readonly { stage: string; code: string }[];
};

export type TranscriptionQualityValidationCode =
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_ID"
  | "INVALID_VERSION"
  | "INVALID_SHA256"
  | "INVALID_ENUM"
  | "INVALID_PATH"
  | "PATH_OUTSIDE_ALLOWLIST"
  | "DUPLICATE_SAMPLE"
  | "EMPTY_CORPUS"
  | "GOLD_POLICY_MISMATCH"
  | "SOURCE_POLICY_MISMATCH"
  | "INCOMPLETE_CANDIDATE"
  | "INVALID_EVIDENCE_STATE"
  | "PROVIDER_CALLS_DISALLOWED"
  | "CORPUS_MISMATCH"
  | "SAMPLE_OUTSIDE_RUN"
  | "RESULT_COUNT_MISMATCH"
  | "RESULT_IDENTITY_MISMATCH"
  | "COLLAPSED_TEXT_REFS"
  | "INVALID_REPLAY_SOURCE"
  | "INVALID_NUMBER"
  | "PRIVATE_INLINE_TEXT"
  | "INVALID_GOLD_SCORING";

export class TranscriptionQualityValidationError extends Error {
  constructor(
    readonly code: TranscriptionQualityValidationCode,
    readonly path: string,
  ) {
    super(`${code}: ${path}`);
    this.name = "TranscriptionQualityValidationError";
  }
}

const stableIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const reasonPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const corpusPrivateRoot = "artifacts/transcription-quality/corpus";
const audioRoots = [
  "artifacts/synthetic-audio-stt/audio",
  "docs/reference/ops/audio/human",
  corpusPrivateRoot,
] as const;
const syntheticGoldRoot = "src/test-fixtures";
const humanGoldRoots = [
  "docs/reference/ops/voice-reference-manifest.yaml",
  corpusPrivateRoot,
] as const;
const humanAudioRoots = [
  "docs/reference/ops/audio/human",
  corpusPrivateRoot,
] as const;
const allowedLocalHumanSampleKeys: Readonly<Record<string, true>> = {
  id: true,
  language: true,
  audioArtifactPath: true,
  audioSha256: true,
  audioBytes: true,
  sourceType: true,
  format: true,
  durationMs: true,
  categories: true,
  difficulty: true,
  goldRef: true,
  goldStatus: true,
  sensitivity: true,
  versionPolicy: true,
};

function invalid(
  code: TranscriptionQualityValidationCode,
  path: string,
): never {
  throw new TranscriptionQualityValidationError(code, path);
}

function validateId(value: string, path: string): void {
  if (!stableIdPattern.test(value)) invalid("INVALID_ID", path);
}

function validateVersion(value: string, path: string): void {
  if (!stableIdPattern.test(value)) invalid("INVALID_VERSION", path);
}

export function validateTranscriptionQualitySha256(
  value: string,
  path: string,
): void {
  if (!sha256Pattern.test(value) || /^0{64}$/.test(value)) {
    invalid("INVALID_SHA256", path);
  }
}

function validateFiniteNonNegative(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) invalid("INVALID_NUMBER", path);
}

function normalizeWorkspacePath(value: string, path: string): string {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:\//.test(value)
  ) {
    invalid("INVALID_PATH", path);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    invalid("INVALID_PATH", path);
  }
  return value;
}

function validateAllowedPath(
  value: string,
  roots: readonly string[],
  path: string,
): void {
  const normalized = normalizeWorkspacePath(value, path);
  if (!roots.some((root) => normalized === root || normalized.startsWith(`${root}/`))) {
    invalid("PATH_OUTSIDE_ALLOWLIST", path);
  }
}

function validateString(value: string, path: string): void {
  if (value.trim().length === 0 || value !== value.trim()) {
    invalid("INCOMPLETE_CANDIDATE", path);
  }
}

function validateEvidenceState<T>(
  state: EvidenceState<T>,
  path: string,
  validateValue: (value: T, valuePath: string) => void,
): void {
  if (!state || !("configured" in state) || state.configured === undefined) {
    invalid("INVALID_EVIDENCE_STATE", `${path}.configured`);
  }
  validateValue(state.configured, `${path}.configured`);
  if ("resolved" in state && state.resolved !== undefined) {
    validateValue(state.resolved, `${path}.resolved`);
  }
  if ("observed" in state && state.observed !== undefined) {
    validateValue(state.observed, `${path}.observed`);
  }
}

function validatePrompt(
  prompt: TranscriptionQualityPromptIdentity,
  path: string,
): void {
  validateId(prompt.id, `${path}.id`);
  validateVersion(prompt.version, `${path}.version`);
  if (prompt.sha256 !== undefined) {
    validateTranscriptionQualitySha256(prompt.sha256, `${path}.sha256`);
    validateFiniteNonNegative(prompt.chars, `${path}.chars`);
    if (!Number.isInteger(prompt.chars)) invalid("INVALID_NUMBER", `${path}.chars`);
  }
}

function validateCandidateRecipe(
  recipe: TranscriptionQualityCandidateRecipe,
  path: string,
): void {
  validateString(recipe.audioPrep.mode, `${path}.audioPrep.mode`);
  validateTranscriptionQualitySha256(
    recipe.audioPrep.configHash,
    `${path}.audioPrep.configHash`,
  );
  validateString(recipe.stt.provider, `${path}.stt.provider`);
  validateString(recipe.stt.model, `${path}.stt.model`);
  validatePrompt(recipe.stt.prompt, `${path}.stt.prompt`);
  validateString(recipe.stt.language, `${path}.stt.language`);
  validateFiniteNonNegative(recipe.stt.temperature, `${path}.stt.temperature`);
  validateString(recipe.stt.responseFormat, `${path}.stt.responseFormat`);
  validateId(recipe.stt.evaluationRecipeId, `${path}.stt.evaluationRecipeId`);
  if (recipe.stt.metadata.mode === "bounded-verbose") {
    for (const field of ["maxWords", "maxSegments"] as const) {
      const value = recipe.stt.metadata[field];
      if (!Number.isInteger(value) || value <= 0) {
        invalid("INVALID_NUMBER", `${path}.stt.metadata.${field}`);
      }
    }
  } else if (recipe.stt.metadata.mode !== "none") {
    invalid("INVALID_ENUM", `${path}.stt.metadata.mode`);
  }
  validateString(recipe.materialization.mode, `${path}.materialization.mode`);
  validateTranscriptionQualitySha256(
    recipe.materialization.configHash,
    `${path}.materialization.configHash`,
  );
  if (recipe.postprocess) {
    validateString(recipe.postprocess.provider, `${path}.postprocess.provider`);
    validateString(recipe.postprocess.model, `${path}.postprocess.model`);
    validatePrompt(recipe.postprocess.prompt, `${path}.postprocess.prompt`);
    validateVersion(
      recipe.postprocess.sanitizerVersion,
      `${path}.postprocess.sanitizerVersion`,
    );
  }
  if (recipe.vocabulary.mode === "rules") {
    validateTranscriptionQualitySha256(
      recipe.vocabulary.rulesHash,
      `${path}.vocabulary.rulesHash`,
    );
  }
}

function validateCandidateReceipt(
  receipt: TranscriptionQualityCandidateReceipt,
  path: string,
): void {
  validateId(receipt.candidateId, `${path}.candidateId`);
  validateVersion(receipt.candidateVersion, `${path}.candidateVersion`);
  validateTranscriptionQualitySha256(receipt.recipeHash, `${path}.recipeHash`);
  validateId(receipt.evaluationRecipeId, `${path}.evaluationRecipeId`);
}

function validateResultIdentity(identity: TranscriptionQualityResultIdentity, path: string): void {
  if (identity.sttProvider !== undefined) validateString(identity.sttProvider, `${path}.sttProvider`);
  if (identity.sttModel !== undefined) validateString(identity.sttModel, `${path}.sttModel`);
  if (identity.sttEngineId !== undefined) validateString(identity.sttEngineId, `${path}.sttEngineId`);
  if (identity.sttPromptId !== undefined) validateString(identity.sttPromptId, `${path}.sttPromptId`);
  if (identity.sttPromptSha256 !== undefined) validateTranscriptionQualitySha256(identity.sttPromptSha256, `${path}.sttPromptSha256`);
  if (identity.language !== undefined) validateString(identity.language, `${path}.language`);
  if (identity.responseFormat !== undefined) validateString(identity.responseFormat, `${path}.responseFormat`);
  if (identity.postprocessProvider !== undefined) validateString(identity.postprocessProvider, `${path}.postprocessProvider`);
  if (identity.postprocessModel !== undefined) validateString(identity.postprocessModel, `${path}.postprocessModel`);
  if (identity.postprocessPromptSha256 !== undefined) validateTranscriptionQualitySha256(identity.postprocessPromptSha256, `${path}.postprocessPromptSha256`);
}
function validateSample(sample: SyntheticAudioFixture, index: number): void {
  const base = `samples[${index}]`;
  validateId(sample.id, `${base}.id`);
  validateString(sample.language, `${base}.language`);
  validateTranscriptionQualitySha256(sample.audioSha256, `${base}.audioSha256`);
  if (sample.audioBytes !== undefined) {
    if (!Number.isInteger(sample.audioBytes) || sample.audioBytes <= 0) {
      invalid("INVALID_NUMBER", `${base}.audioBytes`);
    }
  }
  if (!syntheticAudioSourceTypes.includes(sample.sourceType)) invalid("INVALID_ENUM", `${base}.sourceType`);
  if (!syntheticAudioFormats.includes(sample.format)) invalid("INVALID_ENUM", `${base}.format`);
  if (!syntheticAudioDifficulties.includes(sample.difficulty)) invalid("INVALID_ENUM", `${base}.difficulty`);
  if (!syntheticAudioGoldStatuses.includes(sample.goldStatus)) invalid("INVALID_ENUM", `${base}.goldStatus`);
  if (!syntheticAudioSensitivityLevels.includes(sample.sensitivity)) invalid("INVALID_ENUM", `${base}.sensitivity`);
  if (!syntheticAudioVersionPolicies.includes(sample.versionPolicy)) invalid("INVALID_ENUM", `${base}.versionPolicy`);
  if (sample.categories.length === 0) invalid("INVALID_ENUM", `${base}.categories`);
  for (const [categoryIndex, category] of sample.categories.entries()) validateId(category, `${base}.categories[${categoryIndex}]`);
  if (sample.durationMs !== undefined) validateFiniteNonNegative(sample.durationMs, `${base}.durationMs`);
  if (sample.sourceType === "generated-tts" && (sample.sensitivity !== "synthetic" || sample.versionPolicy !== "versioned-metadata")) invalid("SOURCE_POLICY_MISMATCH", base);
  if (sample.sourceType === "local-human-reference" && (sample.sensitivity !== "local-sensitive" || sample.versionPolicy !== "gitignored-artifact")) invalid("SOURCE_POLICY_MISMATCH", base);
  if (sample.sensitivity === "synthetic" && sample.versionPolicy !== "versioned-metadata") invalid("SOURCE_POLICY_MISMATCH", base);
  if (sample.sensitivity === "local-sensitive" && sample.versionPolicy !== "gitignored-artifact") invalid("SOURCE_POLICY_MISMATCH", base);
  if (sample.sensitivity === "unknown" && sample.versionPolicy === "versioned-metadata") invalid("SOURCE_POLICY_MISMATCH", base);
  if (sample.goldStatus === "approved" && sample.sensitivity === "unknown") invalid("GOLD_POLICY_MISMATCH", `${base}.goldStatus`);
  if (sample.sourceType === "generated-tts" && (!sample.expectedText || sample.expectedText.trim().length === 0)) invalid("INCOMPLETE_CANDIDATE", `${base}.expectedText`);
  const allowedAudioRoots =
    sample.sourceType === "local-human-reference" ? humanAudioRoots : audioRoots;
  validateAllowedPath(
    sample.audioArtifactPath,
    allowedAudioRoots,
    `${base}.audioArtifactPath`,
  );
  if (sample.sensitivity === "local-sensitive") {
    for (const key of Object.keys(sample)) {
      if (allowedLocalHumanSampleKeys[key] !== true) {
        invalid("PRIVATE_INLINE_TEXT", `${base}.${key}`);
      }
    }
  }
  const goldRoots =
    sample.sourceType === "local-human-reference"
      ? humanGoldRoots
      : sample.sensitivity === "synthetic" &&
          sample.versionPolicy === "versioned-metadata"
        ? [syntheticGoldRoot]
        : [corpusPrivateRoot];
  validateAllowedPath(sample.goldRef, goldRoots, `${base}.goldRef`);
}


export function validateTranscriptionQualityCorpusManifest(
  manifest: TranscriptionQualityCorpusManifest,
): void {
  if (manifest.schemaVersion !== 1) {
    invalid("INVALID_SCHEMA_VERSION", "schemaVersion");
  }
  validateId(manifest.corpusId, "corpusId");
  validateVersion(manifest.corpusVersion, "corpusVersion");
  if (manifest.samples.length === 0) invalid("EMPTY_CORPUS", "samples");
  const ids = new Set<string>();
  manifest.samples.forEach((sample, index) => {
    validateSample(sample, index);
    if (ids.has(sample.id)) invalid("DUPLICATE_SAMPLE", `samples[${index}].id`);
    ids.add(sample.id);
  });
}

export function validateTranscriptionQualityCandidate(
  candidate: TranscriptionQualityCandidate,
): void {
  validateId(candidate.candidateId, "candidateId");
  validateVersion(candidate.candidateVersion, "candidateVersion");
  validateEvidenceState(candidate.recipe, "recipe", validateCandidateRecipe);
}

export function validateTranscriptionQualityRun(
  run: TranscriptionQualityRun,
  corpus: TranscriptionQualityCorpusManifest,
): void {
  if (run.schemaVersion !== 1) invalid("INVALID_SCHEMA_VERSION", "schemaVersion");
  validateId(run.runId, "runId");
  validateVersion(run.runnerVersion, "runnerVersion");
  validateId(run.corpus.corpusId, "corpus.corpusId");
  validateVersion(run.corpus.corpusVersion, "corpus.corpusVersion");
  if (
    run.corpus.corpusId !== corpus.corpusId ||
    run.corpus.corpusVersion !== corpus.corpusVersion
  ) {
    invalid("CORPUS_MISMATCH", "corpus");
  }
  if (run.candidates.length === 0) invalid("INCOMPLETE_CANDIDATE", "candidates");
  const candidateIds = new Set<string>();
  run.candidates.forEach((candidate, index) => {
    validateEvidenceState(candidate, `candidates[${index}]`, validateCandidateReceipt);
    if (candidateIds.has(candidate.configured.candidateId)) {
      invalid("INCOMPLETE_CANDIDATE", `candidates[${index}].configured.candidateId`);
    }
    candidateIds.add(candidate.configured.candidateId);
  });
  if (run.providerCalls.enabled) {
    if (
      !Number.isInteger(run.providerCalls.maxRequests) ||
      run.providerCalls.maxRequests <= 0
    ) {
      invalid("INVALID_NUMBER", "providerCalls.maxRequests");
    }
    validateFiniteNonNegative(
      run.providerCalls.maxCostUsd,
      "providerCalls.maxCostUsd",
    );
    if (run.providerCalls.authorization !== "explicit-user-approval") {
      invalid("PROVIDER_CALLS_DISALLOWED", "providerCalls.authorization");
    }
  } else if (run.providerCalls.maxRequests !== 0) {
    invalid("PROVIDER_CALLS_DISALLOWED", "providerCalls");
  }
  if (run.sampleIds.length === 0) invalid("EMPTY_CORPUS", "sampleIds");
  const corpusIds = new Set(corpus.samples.map((sample) => sample.id));
  const runIds = new Set<string>();
  for (const [index, sampleId] of run.sampleIds.entries()) {
    validateId(sampleId, `sampleIds[${index}]`);
    if (!corpusIds.has(sampleId)) invalid("SAMPLE_OUTSIDE_RUN", `sampleIds[${index}]`);
    if (runIds.has(sampleId)) invalid("DUPLICATE_SAMPLE", `sampleIds[${index}]`);
    runIds.add(sampleId);
  }
  const expectedResultPath = `artifacts/transcription-quality/${run.runId}/results.jsonl`;
  validateAllowedPath(run.resultPath, [
    `artifacts/transcription-quality/${run.runId}`,
  ], "resultPath");
  if (run.resultPath !== expectedResultPath) invalid("INVALID_PATH", "resultPath");
  for (const timestampField of ["startedAt", "finishedAt"] as const) {
    const value = run[timestampField];
    if (value !== undefined && !isoTimestampPattern.test(value)) {
      invalid("INVALID_NUMBER", timestampField);
    }
  }
}

export function validateTranscriptionQualitySampleResult(
  result: TranscriptionQualitySampleResult,
  run: TranscriptionQualityRun,
  corpus: TranscriptionQualityCorpusManifest,
): void {
  if (result.schemaVersion !== 1) invalid("INVALID_SCHEMA_VERSION", "schemaVersion");
  if (result.runId !== run.runId) invalid("RESULT_IDENTITY_MISMATCH", "runId");
  if (!run.sampleIds.includes(result.sampleId)) {
    invalid("SAMPLE_OUTSIDE_RUN", "sampleId");
  }
  const sample = corpus.samples.find((entry) => entry.id === result.sampleId);
  if (!sample) invalid("SAMPLE_OUTSIDE_RUN", "sampleId");
  const candidateReceipts = run.candidates.flatMap((candidate) => [
    candidate.configured,
    candidate.resolved,
    candidate.observed,
  ]).filter((value): value is TranscriptionQualityCandidateReceipt => value !== undefined);
  if (!candidateReceipts.some((value) => value.candidateId === result.candidateId)) {
    invalid("RESULT_IDENTITY_MISMATCH", "candidateId");
  }
  validateTranscriptionQualitySha256(result.audio.sha256, "audio.sha256");
  if (result.audio.sha256 !== sample.audioSha256) {
    invalid("RESULT_IDENTITY_MISMATCH", "audio.sha256");
  }
  validateFiniteNonNegative(result.audio.original.bytes, "audio.original.bytes");
  validateFiniteNonNegative(
    result.audio.original.durationMs,
    "audio.original.durationMs",
  );
  validateFiniteNonNegative(result.audio.upload.bytes, "audio.upload.bytes");
  validateString(result.audio.original.format, "audio.original.format");
  validateString(result.audio.upload.format, "audio.upload.format");
  validateString(result.audio.upload.source, "audio.upload.source");
  validateEvidenceState(result.identity, "identity", validateResultIdentity);

  const privateRoot = `artifacts/transcription-quality/${run.runId}/private/${result.sampleId}`;
  validateAllowedPath(result.text.rawTranscriptRef, [privateRoot], "text.rawTranscriptRef");
  validateAllowedPath(result.text.finalTextRef, [privateRoot], "text.finalTextRef");
  validateAllowedPath(
    result.text.goldRef,
    sample.sensitivity === "synthetic" ? [syntheticGoldRoot] : [corpusPrivateRoot],
    "text.goldRef",
  );
  if (result.text.goldRef !== sample.goldRef) {
    invalid("RESULT_IDENTITY_MISMATCH", "text.goldRef");
  }
  if (result.text.rawTranscriptRef === result.text.finalTextRef) {
    invalid("COLLAPSED_TEXT_REFS", "text.finalTextRef");
  }
  for (const field of [
    "goldLength",
    "rawTranscriptLength",
    "finalTextLength",
  ] as const) {
    const value = result.text[field];
    validateFiniteNonNegative(value, `text.${field}`);
    if (!Number.isInteger(value)) invalid("INVALID_NUMBER", `text.${field}`);
  }

  if (result.rawSource.kind === "reused") {
    validateId(result.rawSource.sourceRunId, "rawSource.sourceRunId");
    validateId(result.rawSource.sourceSampleId, "rawSource.sourceSampleId");
  } else if (result.rawSource.kind !== "produced") {
    invalid("INVALID_REPLAY_SOURCE", "rawSource.kind");
  }

  for (const reason of result.stages.materialization.reasons) {
    if (!transcriptionQualityMaterializationReasons.includes(reason)) {
      invalid("INVALID_ENUM", "stages.materialization.reasons");
    }
  }
  if (
    result.stages.postprocess.sanitizerReason !== undefined &&
    !reasonPattern.test(result.stages.postprocess.sanitizerReason)
  ) {
    invalid("INVALID_ENUM", "stages.postprocess.sanitizerReason");
  }
  const metadata = result.stages.stt.metadata;
  if (metadata.status === "observed") {
    const metadataRoot = `artifacts/transcription-quality/${run.runId}/private/${result.sampleId}`;
    validateAllowedPath(metadata.privateRef, [metadataRoot], "stages.stt.metadata.privateRef");
    for (const field of ["maxWords", "maxSegments"] as const) {
      const value = metadata.bounds[field];
      if (!Number.isInteger(value) || value <= 0) {
        invalid("INVALID_NUMBER", `stages.stt.metadata.bounds.${field}`);
      }
    }
    for (const [field, value] of Object.entries(metadata.counts)) {
      if (!Number.isInteger(value) || value < 0) {
        invalid("INVALID_NUMBER", `stages.stt.metadata.counts.${field}`);
      }
    }
    if (
      metadata.counts.words > metadata.bounds.maxWords ||
      metadata.counts.segments > metadata.bounds.maxSegments
    ) {
      invalid("INVALID_NUMBER", "stages.stt.metadata.counts");
    }
    for (const field of [
      "durationMs",
      "noSpeechProbability",
      "averageLogProbability",
    ] as const) {
      const value = metadata[field];
      if (value !== undefined) {
        validateFiniteNonNegative(
          field === "averageLogProbability" ? Math.abs(value) : value,
          `stages.stt.metadata.${field}`,
        );
      }
    }
    if (
      metadata.noSpeechProbability !== undefined &&
      metadata.noSpeechProbability > 1
    ) {
      invalid("INVALID_NUMBER", "stages.stt.metadata.noSpeechProbability");
    }
  } else if (metadata.status !== "not-observed") {
    invalid("INVALID_ENUM", "stages.stt.metadata.status");
  }
  for (const [index, error] of result.errors.entries()) {
    if (!reasonPattern.test(error.stage) || !reasonPattern.test(error.code)) {
      invalid("INVALID_ENUM", `errors[${index}]`);
    }
  }
  for (const [key, value] of Object.entries(result.timingsMs)) {
    validateFiniteNonNegative(value, `timingsMs.${key}`);
  }
  for (const [key, value] of Object.entries(result.costUsd)) {
    if (key !== "source" && value !== undefined) {
      validateFiniteNonNegative(value as number, `costUsd.${key}`);
    }
  }
  validateString(result.costUsd.source, "costUsd.source");
  for (const field of ["wer", "cer", "robustness"] as const) {
    const value = result.scores[field];
    if (value !== undefined) validateFiniteNonNegative(value, `scores.${field}`);
  }
  for (const [dimension, values] of Object.entries(result.scores)) {
    if (
      dimension === "wer" ||
      dimension === "cer" ||
      dimension === "robustness" ||
      values === undefined
    ) {
      continue;
    }
    for (const [field, value] of Object.entries(values)) {
      if (value !== undefined) {
        validateFiniteNonNegative(value, `scores.${dimension}.${field}`);
      }
    }
  }
}

export function validateTranscriptionQualityRunResults(
  run: TranscriptionQualityRun,
  corpus: TranscriptionQualityCorpusManifest,
  candidates: readonly TranscriptionQualityCandidate[],
  results: readonly TranscriptionQualitySampleResult[],
): void {
  validateTranscriptionQualityCorpusManifest(corpus);
  candidates.forEach(validateTranscriptionQualityCandidate);
  validateTranscriptionQualityRun(run, corpus);
  const runCandidateIds = new Set(run.candidates.flatMap((candidate) => [
    candidate.configured.candidateId,
    candidate.resolved?.candidateId,
    candidate.observed?.candidateId,
  ]).filter((value): value is string => value !== undefined));
  if (candidates.some((candidate) => !runCandidateIds.has(candidate.candidateId))) {
    invalid("RESULT_IDENTITY_MISMATCH", "candidates");
  }
  if (results.length !== run.sampleIds.length * candidates.length) {
    invalid("RESULT_COUNT_MISMATCH", "results");
  }
  const combinations = new Set<string>();
  results.forEach((result, index) => {
    validateTranscriptionQualitySampleResult(result, run, corpus);
    const key = `${result.sampleId}\0${result.candidateId}`;
    if (combinations.has(key)) {
      invalid("DUPLICATE_SAMPLE", `results[${index}]`);
    }
    combinations.add(key);
  });
  for (const sampleId of run.sampleIds) {
    for (const candidate of candidates) {
      if (!combinations.has(`${sampleId}\0${candidate.candidateId}`)) {
        invalid("RESULT_COUNT_MISMATCH", "results");
      }
    }
  }
}

export type { TranscriptionQualityCorpusManifest };
export function isTranscriptionQualityGoldScoreable(
  status: SyntheticAudioGoldStatus,
): boolean {
  return status === "approved";
}

export function assertTranscriptionQualityGoldScoreable(
  status: SyntheticAudioGoldStatus,
): void {
  if (!isTranscriptionQualityGoldScoreable(status)) {
    invalid("INVALID_GOLD_SCORING", "goldStatus");
  }
}
