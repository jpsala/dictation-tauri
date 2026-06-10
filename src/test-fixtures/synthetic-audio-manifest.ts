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

export type SyntheticAudioFixture = {
  id: string;
  language: string;
  expectedText: string;
  audioArtifactPath: string;
  sourceType: SyntheticAudioSourceType;
  format: SyntheticAudioFormat;
  durationMs?: number;
  sensitivity: SyntheticAudioSensitivity;
  versionPolicy: SyntheticAudioVersionPolicy;
  notes?: string;
};

export const syntheticAudioFixtures = [
  {
    id: "en-clean-note",
    language: "en",
    expectedText:
      "Create a short project note about testing the dictation pipeline.",
    audioArtifactPath:
      "artifacts/synthetic-audio-stt/audio/en-clean-note.wav",
    sourceType: "generated-tts",
    format: "wav",
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
    sourceType: "generated-tts",
    format: "wav",
    sensitivity: "synthetic",
    versionPolicy: "versioned-metadata",
    notes: "Initial Spanish synthetic fixture; audio may be generated locally.",
  },
] as const satisfies readonly SyntheticAudioFixture[];

export type SyntheticAudioFixtureId =
  (typeof syntheticAudioFixtures)[number]["id"];
