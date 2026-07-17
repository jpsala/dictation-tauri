/// <reference path="../../../fixvox-api/src/bun-test.d.ts" />
import { describe, expect, test } from "bun:test";
import { materializeBuiltinProfileVersions } from "./profile-materialization.ts";

const input = { profileId: "alpha-basic", label: "Alpha Basic", capabilities: ["dictation", "managed_stt"] as const, runtime: { transcription: { engineId: "stt-groq-whisper-turbo", promptId: "transcriptBase" }, postprocess: { engineId: "postprocess-groq-gpt-oss-120b", promptId: "postProcessBase" }, selectionTransform: { engineId: "transform-groq-llama-70b", promptId: "selectionTransformBase" } }, limits: { mode: "warn" as const }, userControls: { "appearance.themeId": "editable" as const }, defaults: {} };
describe("profile materialization", () => {
  test("is deterministic and does not mutate adapter inputs", () => {
    const before = JSON.stringify(input);
    const result = materializeBuiltinProfileVersions([input]);
    expect(result).toHaveLength(1);
    expect(result[0]?.profileId).toBe("alpha-basic");
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
  });
  test("fails closed for invalid references", () => {
    expect(() => materializeBuiltinProfileVersions([{ ...input, runtime: { ...input.runtime, transcription: { engineId: "missing", promptId: "transcriptBase" } } }])).toThrow("builtin_profile_unknown_engine:transcription");
  });
});
