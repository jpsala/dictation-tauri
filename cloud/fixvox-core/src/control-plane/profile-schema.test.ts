/// <reference path="../../../fixvox-api/src/bun-test.d.ts" />
import { describe, expect, test } from "bun:test";
import { LEGACY_PROFILE_DEFAULTS, materializeProfileDefaults, validateBuiltinProfileDefinition, type BuiltinProfileDefinition } from "./profile-schema.ts";

const valid: BuiltinProfileDefinition = {
  label: "Profile test", schemaVersion: 1, profileId: "profile-test", version: 1, status: "published", access: { capabilities: ["dictation", "managed_stt"] },
  runtime: { transcription: { engineId: "stt-groq-whisper-turbo", promptId: "transcriptBase" }, postprocess: { engineId: "postprocess-groq-gpt-oss-120b", promptId: "postProcessBase" }, selectionTransform: { engineId: "transform-groq-llama-70b", promptId: "selectionTransformBase" } },
  limits: { mode: "warn", dailyUsd: 1, monthlyUsd: 5 }, userControls: { "appearance.themeId": "editable" }, defaults: {},
};

describe("built-in profile schema", () => {
  test("materializes immutable deterministic legacy defaults", () => {
    const materialized = materializeProfileDefaults({ "appearance.themeId": "dark" });
    expect(materialized["appearance.themeId"]).toBe("dark");
    expect(LEGACY_PROFILE_DEFAULTS["appearance.themeId"]).toBe("github-light");
    expect(Object.isFrozen(materialized)).toBe(true);
  });
  test("validates references and safe limits", () => {
    expect(() => validateBuiltinProfileDefinition(valid)).not.toThrow();
    expect(() => validateBuiltinProfileDefinition({ ...valid, runtime: { ...valid.runtime, transcription: { engineId: "missing", promptId: "transcriptBase" } } })).toThrow("builtin_profile_unknown_engine:transcription");
    expect(() => validateBuiltinProfileDefinition({ ...valid, limits: { mode: "warn", dailyUsd: -1 } })).toThrow("builtin_profile_invalid_limit");

  });
  test("does not require or copy prompt bodies", () => {
    expect(JSON.stringify(valid)).not.toContain("Reescribí");
    expect(() => validateBuiltinProfileDefinition({ ...valid, defaults: { secret: "no" } })).toThrow("builtin_profile_sensitive_field");
  });
});
