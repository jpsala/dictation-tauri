export const syntheticAudioSourceTypes = [
  "generated-tts",
  "local-human-reference",
  "external-reference",
] as const;

export type SyntheticAudioSourceType =
  (typeof syntheticAudioSourceTypes)[number];

export const syntheticAudioFormats = ["wav", "mp3", "m4a", "webm"] as const;

export type SyntheticAudioFormat = (typeof syntheticAudioFormats)[number];

export const syntheticAudioSensitivityLevels = [
  "synthetic",
  "local-sensitive",
  "unknown",
] as const;

export type SyntheticAudioSensitivity =
  (typeof syntheticAudioSensitivityLevels)[number];

export const syntheticAudioVersionPolicies = [
  "versioned-metadata",
  "gitignored-artifact",
  "temporary",
] as const;

export type SyntheticAudioVersionPolicy =
  (typeof syntheticAudioVersionPolicies)[number];

export const syntheticAudioGoldStatuses = [
  "approved",
  "provisional",
  "shadow-only",
] as const;

export type SyntheticAudioGoldStatus =
  (typeof syntheticAudioGoldStatuses)[number];

export const syntheticAudioDifficulties = ["baseline", "hard", "edge"] as const;

export type SyntheticAudioDifficulty =
  (typeof syntheticAudioDifficulties)[number];

export type SyntheticAudioFixture = {
  id: string;
  language: string;
  expectedText?: string;
  audioArtifactPath: string;
  audioSha256: string;
  audioBytes?: number;
  sourceType: SyntheticAudioSourceType;
  format: SyntheticAudioFormat;
  durationMs?: number;
  categories: readonly string[];
  difficulty: SyntheticAudioDifficulty;
  goldRef: string;
  goldStatus: SyntheticAudioGoldStatus;
  sensitivity: SyntheticAudioSensitivity;
  versionPolicy: SyntheticAudioVersionPolicy;
  notes?: string;
};

export type TranscriptionQualityCorpusManifest = {
  schemaVersion: 1;
  corpusId: string;
  corpusVersion: string;
  samples: readonly SyntheticAudioFixture[];
};

export const syntheticAudioFixtures = [
  {
    id: "en-clean-note",
    language: "en",
    expectedText:
      "Create a short project note about testing the dictation pipeline.",
    audioArtifactPath:
      "artifacts/synthetic-audio-stt/audio/en-clean-note.wav",
    audioSha256:
      "ddd7cfa3d264fba932b8e0d723626a5b195921ea1aa3ee2f43f25bf397331f9e",
    sourceType: "generated-tts",
    format: "wav",
    categories: ["clean-dictation", "short"],
    difficulty: "baseline",
    goldRef: "src/test-fixtures/synthetic-audio-manifest.ts",
    goldStatus: "approved",
    sensitivity: "synthetic",
    versionPolicy: "versioned-metadata",
    notes: "Initial non-sensitive synthetic fixture for manifest validation.",
  },
  {
    id: "es-short-reminder",
    language: "es",
    expectedText: "Recordame revisar los fixtures del pipeline.",
    audioArtifactPath:
      "artifacts/synthetic-audio-stt/audio/es-short-reminder.wav",
    audioSha256:
      "58135cbe9cc83ebb637de09de3f9a0e8524b0803c247f1cce83495bb238d0441",
    sourceType: "generated-tts",
    format: "wav",
    categories: ["rioplatense", "short"],
    difficulty: "baseline",
    goldRef: "src/test-fixtures/synthetic-audio-manifest.ts",
    goldStatus: "approved",
    sensitivity: "synthetic",
    versionPolicy: "versioned-metadata",
    notes: "Initial Spanish synthetic fixture; audio may be generated locally.",
  },
] as const satisfies readonly SyntheticAudioFixture[];

export const syntheticAudioCorpusManifest = {
  schemaVersion: 1,
  corpusId: "synthetic-audio-stt",
  corpusVersion: "1.0.0",
  samples: syntheticAudioFixtures,
} as const satisfies TranscriptionQualityCorpusManifest;

export type SyntheticAudioFixtureId =
  (typeof syntheticAudioFixtures)[number]["id"];
