import { describe, expect, it } from "vitest";
import { analyzeAudioVoiceActivity, classifyAudioSpeech } from "../../src/capture/audio-analysis";

const sampleRateHz = 16_000;

function samplesFor(ms: number, amplitude: number): Int16Array {
  const length = Math.round((sampleRateHz * ms) / 1000);
  const samples = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = Math.round(Math.sin(index / 3) * amplitude * 32767);
  }
  return samples;
}

function concat(...chunks: Int16Array[]): Int16Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

describe("audio speech analysis", () => {
  it("classifies silence as local no-speech with redacted evidence", () => {
    const decision = classifyAudioSpeech({ samples: samplesFor(900, 0), sampleRateHz });

    expect(decision).toMatchObject({
      class: "no-speech",
      reason: "local_voice_activity_no_speech",
      redacted: true,
      voiceActivity: {
        hasSpeech: false,
        voicedFrameCount: 0,
      },
    });
  });

  it("classifies accidental tiny captures as too short", () => {
    const decision = classifyAudioSpeech({ samples: samplesFor(80, 0.6), sampleRateHz });

    expect(decision.class).toBe("too-short");
    expect(decision.reason).toBe("audio_too_short_for_speech_detection");
  });

  it("allows speech after initial silence to proceed", () => {
    const samples = concat(samplesFor(450, 0), samplesFor(520, 0.45));
    const decision = classifyAudioSpeech({ samples, sampleRateHz });

    expect(decision).toMatchObject({
      class: "speech",
      reason: "local_voice_activity_detected",
      redacted: true,
    });
    expect(decision.voiceActivity.voicedMs).toBeGreaterThanOrEqual(180);
  });

  it("reports duration and ppm metrics without raw samples", () => {
    const activity = analyzeAudioVoiceActivity({ samples: samplesFor(300, 0.25), sampleRateHz });

    expect(activity.durationMs).toBe(300);
    expect(activity.rmsPpm).toBeGreaterThan(0);
    expect(activity.peakPpm).toBeGreaterThan(0);
    expect(JSON.stringify(activity)).not.toContain("samples");
  });
});
