import { describe, expect, it } from "vitest";
import {
  createAudioOptimizationPolicy,
  planAudioOptimization,
  resolveAudioOptimizationResult,
} from "../../src/capture/audio-optimization";

describe("audio optimization threshold policy", () => {
  it("skips short/small recordings without conversion", () => {
    const decision = planAudioOptimization({
      durationMs: 2_000,
      sizeBytes: 96_000,
      mimeType: "audio/wav",
      policy: createAudioOptimizationPolicy({ minDurationMs: 30_000, minSizeBytes: 1_000_000 }),
    });

    expect(decision).toEqual({
      status: "skipped",
      reason: "below_optimization_threshold",
      source: "original",
      originalBytes: 96_000,
      uploadBytes: 96_000,
      mimeType: "audio/wav",
      redacted: true,
    });
  });

  it("plans conversion for long recordings above thresholds", () => {
    const decision = planAudioOptimization({
      durationMs: 45_000,
      sizeBytes: 4_800_000,
      mimeType: "audio/wav",
      policy: createAudioOptimizationPolicy({ minDurationMs: 30_000, minSizeBytes: 1_000_000 }),
    });

    expect(decision).toMatchObject({
      status: "apply",
      reason: "above_optimization_threshold",
      source: "optimized",
      originalBytes: 4_800_000,
      uploadBytes: 4_800_000,
      targetMimeType: "audio/mpeg",
      redacted: true,
    });
  });

  it("records applied conversion only when optimized artifact is smaller", () => {
    const result = resolveAudioOptimizationResult(
      planAudioOptimization({ durationMs: 45_000, sizeBytes: 4_800_000, mimeType: "audio/wav" }),
      { ok: true, optimizedBytes: 1_900_000, mimeType: "audio/mpeg" },
    );

    expect(result).toMatchObject({
      status: "applied",
      reason: "optimized_audio_smaller",
      source: "optimized",
      originalBytes: 4_800_000,
      uploadBytes: 1_900_000,
      mimeType: "audio/mpeg",
      redacted: true,
    });
  });

  it("falls back to original audio when conversion fails or is not smaller", () => {
    const plan = planAudioOptimization({ durationMs: 45_000, sizeBytes: 4_800_000, mimeType: "audio/wav" });

    expect(resolveAudioOptimizationResult(plan, { ok: false, reason: "ffmpeg_unavailable" })).toMatchObject({
      status: "fallback",
      reason: "ffmpeg_unavailable_original_audio_used",
      source: "original",
      originalBytes: 4_800_000,
      uploadBytes: 4_800_000,
      redacted: true,
    });

    expect(
      resolveAudioOptimizationResult(plan, { ok: true, optimizedBytes: 5_000_000, mimeType: "audio/mpeg" }),
    ).toMatchObject({
      status: "fallback",
      reason: "optimized_audio_not_smaller_original_audio_used",
      source: "original",
      uploadBytes: 4_800_000,
      redacted: true,
    });
  });
});
