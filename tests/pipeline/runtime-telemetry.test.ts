import { describe, expect, it } from "vitest";
import {
  createRuntimeTelemetryStage,
  createSafeRedactedRunSummary,
  formatSafeRedactedRunSummary,
  runtimeTelemetryLooksRedacted,
} from "../../src/pipeline/runtime-telemetry";
import type { RuntimeTelemetryStage } from "../../src/pipeline/types";

describe("runtime telemetry stage contract", () => {
  it("models redacted capture/audio-prep/STT/postprocess/delivery stages", () => {
    const stages: RuntimeTelemetryStage[] = [
      createRuntimeTelemetryStage({
        stage: "capture",
        status: "ok",
        durationMs: 1200,
        redacted: true,
      }),
      createRuntimeTelemetryStage({
        stage: "audio-prep",
        status: "fallback",
        reason: "ffmpeg_unavailable_original_audio_used",
        audio: {
          durationMs: 1200,
          originalBytes: 64000,
          uploadBytes: 64000,
          mimeType: "audio/wav",
          source: "wav",
          voiceActivity: {
            durationMs: 1200,
            voicedMs: 360,
            frameCount: 40,
            voicedFrameCount: 12,
            rmsPpm: 12000,
            peakPpm: 90000,
            hasSpeech: true,
          },
        },
        redacted: true,
      }),
      createRuntimeTelemetryStage({
        stage: "stt",
        status: "ok",
        provider: "groq",
        model: "whisper-large-v3-turbo",
        profileId: "pro",
        engineId: "stt-groq-whisper-turbo",
        promptId: "transcriptBase",
        redacted: true,
      }),
      createRuntimeTelemetryStage({
        stage: "postprocess",
        status: "skipped",
        reason: "policy_disabled",
        redacted: true,
      }),
      createRuntimeTelemetryStage({
        stage: "delivery",
        status: "ok",
        target: { processName: "chrome.exe", inputLike: true, confidence: "medium" },
        delivery: { strategy: "direct_input", evidenceStatus: "paste_sent", confidence: "medium" },
        redacted: true,
      }),
    ];

    expect(stages.map((stage) => stage.stage)).toEqual([
      "capture",
      "audio-prep",
      "stt",
      "postprocess",
      "delivery",
    ]);
    expect(runtimeTelemetryLooksRedacted(stages)).toBe(true);
  });

  it("rejects telemetry that appears to include raw transcript or selected text", () => {
    const leakyStage = createRuntimeTelemetryStage({
      stage: "stt",
      status: "ok",
      reason: "rawTranscript: hola mundo",
      redacted: true,
    });

    expect(runtimeTelemetryLooksRedacted([leakyStage])).toBe(false);
  });

  it("covers successful dictation stages without raw transcript/audio", () => {
    const stages: RuntimeTelemetryStage[] = [
      createRuntimeTelemetryStage({ stage: "capture", status: "ok", durationMs: 950, redacted: true }),
      createRuntimeTelemetryStage({
        stage: "audio-prep",
        status: "ok",
        audio: {
          durationMs: 950,
          originalBytes: 32000,
          uploadBytes: 32000,
          mimeType: "audio/wav",
          source: "wav",
        },
        redacted: true,
      }),
      createRuntimeTelemetryStage({
        stage: "stt",
        status: "ok",
        provider: "fixvox-cloud",
        model: "whisper-large-v3-turbo",
        engineId: "stt-fixvox-managed",
        redacted: true,
      }),
      createRuntimeTelemetryStage({
        stage: "postprocess",
        status: "ok",
        provider: "groq",
        model: "openai/gpt-oss-120b",
        promptId: "preset.como-yo-es",
        redacted: true,
      }),
      createRuntimeTelemetryStage({
        stage: "delivery",
        status: "ok",
        target: { processName: "chrome.exe", inputLike: true, confidence: "medium" },
        delivery: { strategy: "paste_send", evidenceStatus: "paste_sent", confidence: "medium" },
        redacted: true,
      }),
    ];

    expect(stages.map((stage) => stage.stage)).toEqual(["capture", "audio-prep", "stt", "postprocess", "delivery"]);
    expect(runtimeTelemetryLooksRedacted(stages)).toBe(true);
    expect(JSON.stringify(stages)).not.toContain("final dictated text");
  });

  it("covers host no-speech after audio preparation", () => {
    const stages: RuntimeTelemetryStage[] = [
      createRuntimeTelemetryStage({ stage: "capture", status: "ok", durationMs: 420, redacted: true }),
      createRuntimeTelemetryStage({
        stage: "audio-prep",
        status: "ok",
        audio: {
          durationMs: 420,
          originalBytes: 16000,
          uploadBytes: 16000,
          mimeType: "audio/wav",
          source: "microphone",
          voiceActivity: {
            durationMs: 420,
            voicedMs: 0,
            frameCount: 14,
            voicedFrameCount: 0,
            rmsPpm: 0,
            peakPpm: 0,
            hasSpeech: false,
          },
        },
        redacted: true,
      }),
      createRuntimeTelemetryStage({
        stage: "stt",
        status: "skipped",
        reason: "host_no_speech_provider_call_skipped",
        redacted: true,
      }),
    ];

    expect(stages.find((stage) => stage.stage === "stt")).toMatchObject({ status: "skipped" });
    expect(runtimeTelemetryLooksRedacted(stages)).toBe(true);
  });

  it("covers conversion fallback while preserving original audio metadata only", () => {
    const stage = createRuntimeTelemetryStage({
      stage: "audio-prep",
      status: "fallback",
      reason: "conversion_failed_original_audio_used",
      audio: {
        durationMs: 45_000,
        originalBytes: 4_800_000,
        uploadBytes: 4_800_000,
        mimeType: "audio/wav",
        source: "wav",
      },
      redacted: true,
    });

    expect(stage).toMatchObject({
      stage: "audio-prep",
      status: "fallback",
      audio: { originalBytes: 4_800_000, uploadBytes: 4_800_000, source: "wav" },
    });
    expect(runtimeTelemetryLooksRedacted([stage])).toBe(true);
  });

  it("covers delivery uncertainty distinctly from text availability", () => {
    const stage = createRuntimeTelemetryStage({
      stage: "delivery",
      status: "fallback",
      reason: "delivery_uncertain_after_clipboard_fallback",
      target: { processName: "unknown", inputLike: false, confidence: "low" },
      delivery: { strategy: "clipboard_fallback", evidenceStatus: "uncertain", confidence: "low" },
      redacted: true,
    });

    expect(stage.delivery).toMatchObject({ evidenceStatus: "uncertain" });
    expect(stage.target).toMatchObject({ confidence: "low" });
    expect(runtimeTelemetryLooksRedacted([stage])).toBe(true);
  });

  it("creates a small redacted run summary with delivery confidence and recovery guidance", () => {
    const summary = createSafeRedactedRunSummary({
      runId: "run with spaces",
      fixtureId: "microphone",
      inputKind: "microphone",
      events: [],
      states: ["done"],
      terminalState: "done",
      transcript: "secret dictated content must not appear",
      output: "secret dictated content must not appear",
      deliveryEvidence: {
        status: "paste_sent",
        output: "secret dictated content must not appear",
        reason: "Paste command was sent without observation.",
      },
      runtimeTelemetryStages: [
        createRuntimeTelemetryStage({
          stage: "delivery",
          status: "ok",
          delivery: { strategy: "paste_send", evidenceStatus: "paste_sent", confidence: "medium" },
          redacted: true,
        }),
      ],
      durationMs: 123,
    });

    expect(summary).toMatchObject({
      runId: "run_with_spaces",
      delivery: {
        status: "paste_sent",
        confidence: "sent_unverified",
        nextStep: "Verify the target; if text is missing, copy or paste last.",
      },
      outputChars: "secret dictated content must not appear".length,
      redacted: true,
    });
    const formatted = formatSafeRedactedRunSummary({
      runId: "run with spaces",
      fixtureId: "microphone",
      inputKind: "microphone",
      events: [],
      states: ["done"],
      terminalState: "done",
      output: "secret dictated content must not appear",
      deliveryEvidence: { status: "paste_sent", output: "secret dictated content must not appear" },
      durationMs: 123,
    });

    expect(JSON.stringify(summary)).not.toContain("secret dictated content");
    expect(formatted).not.toContain("secret dictated content");
  });

  it("summarizes long output by count only without tripping size limits", () => {
    const longOutput = "x".repeat(20_000);
    const summary = createSafeRedactedRunSummary({
      runId: "run-long-output",
      fixtureId: "microphone",
      inputKind: "microphone",
      events: [],
      states: ["done"],
      terminalState: "done",
      output: longOutput,
      deliveryEvidence: { status: "paste_sent", output: longOutput },
      durationMs: 321,
    });
    const formatted = formatSafeRedactedRunSummary({
      runId: "run-long-output",
      fixtureId: "microphone",
      inputKind: "microphone",
      events: [],
      states: ["done"],
      terminalState: "done",
      output: longOutput,
      deliveryEvidence: { status: "paste_sent", output: longOutput },
      durationMs: 321,
    });

    expect(summary).toMatchObject({
      outputChars: 20_000,
      delivery: { status: "paste_sent", confidence: "sent_unverified" },
      redacted: true,
    });
    expect(JSON.stringify(summary)).not.toContain(longOutput.slice(0, 100));
    expect(formatted).toContain("20000 chars");
    expect(formatted).not.toContain(longOutput.slice(0, 100));
  });

  it("drops redacted run summaries that fail size or redaction guards", () => {
    const leakyTelemetry = createRuntimeTelemetryStage({
      stage: "stt",
      status: "ok",
      reason: "rawTranscript: this should block dogfood summaries",
      redacted: true,
    });
    const base = {
      runId: "run-guard",
      fixtureId: "microphone",
      inputKind: "microphone" as const,
      events: [],
      states: ["done" as const],
      terminalState: "done" as const,
      output: "safe text that is measured only",
      deliveryEvidence: { status: "failed" as const, output: "safe text that is measured only" },
      durationMs: 42,
    };

    expect(createSafeRedactedRunSummary({ ...base, runtimeTelemetryStages: [leakyTelemetry] })).toBeUndefined();
    expect(createSafeRedactedRunSummary(base, { maxSerializedLength: 20 })).toBeUndefined();
  });
});
