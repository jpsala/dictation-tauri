export type AudioSpeechClass = "speech" | "no-speech" | "too-short" | "uncertain";

export type AudioVoiceActivity = {
  durationMs: number;
  frameCount: number;
  voicedFrameCount: number;
  voicedMs: number;
  rmsPpm: number;
  peakPpm: number;
  hasSpeech: boolean;
};

export type AudioSpeechDecision = {
  class: AudioSpeechClass;
  reason: string;
  voiceActivity: AudioVoiceActivity;
  redacted: true;
};

export type AnalyzeAudioInput = {
  samples: ArrayLike<number>;
  sampleRateHz: number;
  channelCount?: number;
};

export type AnalyzeAudioOptions = {
  frameMs?: number;
  minDurationMs?: number;
  minVoicedMs?: number;
  rmsThreshold?: number;
  peakThreshold?: number;
};

const DEFAULT_FRAME_MS = 30;
const DEFAULT_MIN_DURATION_MS = 180;
const DEFAULT_MIN_VOICED_MS = 180;
const DEFAULT_RMS_THRESHOLD = 0.012;
const DEFAULT_PEAK_THRESHOLD = 0.08;
const PCM_I16_MAX = 32768;

function ppm(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1_000_000);
}

function normalizedSample(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value >= -1 && value <= 1) {
    return value;
  }
  return Math.max(-1, Math.min(1, value / PCM_I16_MAX));
}

export function analyzeAudioVoiceActivity(
  input: AnalyzeAudioInput,
  options: AnalyzeAudioOptions = {},
): AudioVoiceActivity {
  const sampleRateHz = Math.max(1, input.sampleRateHz);
  const channelCount = Math.max(1, input.channelCount ?? 1);
  const frameMs = options.frameMs ?? DEFAULT_FRAME_MS;
  const minVoicedMs = options.minVoicedMs ?? DEFAULT_MIN_VOICED_MS;
  const rmsThreshold = options.rmsThreshold ?? DEFAULT_RMS_THRESHOLD;
  const peakThreshold = options.peakThreshold ?? DEFAULT_PEAK_THRESHOLD;
  const samplesPerFrame = Math.max(1, Math.round((sampleRateHz * channelCount * frameMs) / 1000));
  const durationMs = Math.round((input.samples.length / (sampleRateHz * channelCount)) * 1000);

  let frameCount = 0;
  let voicedFrameCount = 0;
  let totalSquares = 0;
  let totalSamples = 0;
  let peak = 0;

  for (let offset = 0; offset < input.samples.length; offset += samplesPerFrame) {
    const end = Math.min(input.samples.length, offset + samplesPerFrame);
    let frameSquares = 0;
    let frameSamples = 0;
    let framePeak = 0;

    for (let index = offset; index < end; index += 1) {
      const sample = normalizedSample(input.samples[index] ?? 0);
      const absolute = Math.abs(sample);
      framePeak = Math.max(framePeak, absolute);
      frameSquares += sample * sample;
      frameSamples += 1;
    }

    if (frameSamples === 0) {
      continue;
    }

    const frameRms = Math.sqrt(frameSquares / frameSamples);
    if (frameRms >= rmsThreshold || framePeak >= peakThreshold) {
      voicedFrameCount += 1;
    }
    frameCount += 1;
    totalSquares += frameSquares;
    totalSamples += frameSamples;
    peak = Math.max(peak, framePeak);
  }

  const voicedMs = voicedFrameCount * frameMs;
  const rms = totalSamples > 0 ? Math.sqrt(totalSquares / totalSamples) : 0;

  return {
    durationMs,
    frameCount,
    voicedFrameCount,
    voicedMs,
    rmsPpm: ppm(rms),
    peakPpm: ppm(peak),
    hasSpeech: voicedMs >= minVoicedMs,
  };
}

export function classifyAudioSpeech(
  input: AnalyzeAudioInput,
  options: AnalyzeAudioOptions = {},
): AudioSpeechDecision {
  const voiceActivity = analyzeAudioVoiceActivity(input, options);
  const minDurationMs = options.minDurationMs ?? DEFAULT_MIN_DURATION_MS;

  if (voiceActivity.durationMs < minDurationMs) {
    return {
      class: "too-short",
      reason: "audio_too_short_for_speech_detection",
      voiceActivity,
      redacted: true,
    };
  }

  if (voiceActivity.hasSpeech) {
    return {
      class: "speech",
      reason: "local_voice_activity_detected",
      voiceActivity,
      redacted: true,
    };
  }

  return {
    class: "no-speech",
    reason: "local_voice_activity_no_speech",
    voiceActivity,
    redacted: true,
  };
}
