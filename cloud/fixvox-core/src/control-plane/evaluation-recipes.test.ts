import { describe, expect, test } from "bun:test";
import {
  EVALUATION_RECIPES,
  POSTPROCESS_EVALUATION_RECIPES,
  buildBoundedSttMetadata,
  resolveEvaluationRecipe,
  resolvePostprocessEvaluationRecipe,
} from "./evaluation-recipes";
describe("transcription quality evaluation recipes", () => {
  test("exposes exactly the four server-owned prompt/language combinations", () => {
    expect(EVALUATION_RECIPES.map(({ id }) => id)).toEqual([
      "transcription-quality-v1-short-auto",
      "transcription-quality-v1-rich-auto",
      "transcription-quality-v1-short-es",
      "transcription-quality-v1-rich-es",
    ]);
    expect(() => resolveEvaluationRecipe("unknown-recipe")).toThrow("evaluation_recipe_unknown");
  });

  test("exposes exactly two bounded GPT-OSS postprocess variants", () => {
    expect(POSTPROCESS_EVALUATION_RECIPES.map(({ id, variant }) => [id, variant])).toEqual([
      ["transcription-quality-v1-postprocess-120b-plain", "without-prosody"],
      ["transcription-quality-v1-postprocess-120b-prosody", "with-prosody"],
    ]);
    expect(POSTPROCESS_EVALUATION_RECIPES.every(({ model, temperature, maxCompletionTokens }) => model === "openai/gpt-oss-120b" && temperature === 0 && maxCompletionTokens === 512)).toBe(true);
    expect(() => resolvePostprocessEvaluationRecipe("unknown-recipe")).toThrow("postprocess_evaluation_recipe_unknown");
  });

  test("bounds private arrays and keeps human text out of the public receipt", () => {
    const bounded = buildBoundedSttMetadata(
      {
        text: "PRIVATE TRANSCRIPT",
        words: [{ word: "PRIVATE WORD" }, { word: "SECOND" }],
        segments: [{ text: "PRIVATE SEGMENT" }, { text: "SECOND" }],
        duration: 1.25,
        no_speech_prob: 0.2,
        avg_logprob: -0.4,
      },
      "sample-1",
      { maxWords: 1, maxSegments: 1 },
    );
    expect(bounded.public).toEqual({
      status: "observed",
      redacted: true,
      bounds: { maxWords: 1, maxSegments: 1 },
      counts: { words: 1, segments: 1, droppedWords: 1, droppedSegments: 1 },
      durationMs: 1250,
      noSpeechProbability: 0.2,
      averageLogProbability: -0.4,
    });
    expect(JSON.stringify(bounded.public)).not.toContain("PRIVATE");
    expect(bounded.private.words).toHaveLength(1);
    expect(bounded.private.segments).toHaveLength(1);
  });
  test("conservatively aggregates segment-only Groq metrics", () => {
    const bounded = buildBoundedSttMetadata({
      segments: [
        { no_speech_prob: 0.1, avg_logprob: -0.2 },
        { no_speech_prob: 0.7, avg_logprob: -1.1 },
      ],
    }, "sample-segments");
    expect(bounded.public.noSpeechProbability).toBe(0.7);
    expect(bounded.public.averageLogProbability).toBe(-1.1);
  });
});
