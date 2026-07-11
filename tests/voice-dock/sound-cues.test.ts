import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSoundCuePolicy, requestDictationSoundCue } from "../../src/voice-dock/sound-cues";

describe("dictation sound cues", () => {
  it("skips cue requests when disabled", () => {
    const play = vi.fn();

    expect(requestDictationSoundCue(createSoundCuePolicy({ dictationSoundCuesEnabled: false }), "start", play)).toEqual({
      cue: "start",
      status: "skipped",
      reason: "sound_cues_disabled",
      redacted: true,
    });
    expect(play).not.toHaveBeenCalled();
  });

  it("queues cue requests without awaiting playback", () => {
    const play = vi.fn(async () => {
      throw new Error("audio device unavailable");
    });

    expect(requestDictationSoundCue(createSoundCuePolicy({ dictationSoundCuesEnabled: true }), "success", play)).toEqual({
      cue: "success",
      status: "queued",
      reason: "sound_cue_queued_non_blocking",
      redacted: true,
    });
    expect(play).toHaveBeenCalledWith("success");
  });

  it("turns synchronous playback failures into non-blocking evidence", () => {
    const play = vi.fn(() => {
      throw new Error("playback failed");
    });

    expect(requestDictationSoundCue(createSoundCuePolicy({ dictationSoundCuesEnabled: true }), "error", play)).toMatchObject({
      cue: "error",
      status: "failed",
      reason: "sound_cue_request_failed_non_blocking",
      redacted: true,
    });
  });

  it("wires start/stop/success/no-speech/error cues from the app flow", () => {
    const source = readFileSync("src/App.tsx", "utf8");

    expect(source).toContain("queueDictationSoundCue(\"start\")");
    expect(source).toContain("queueDictationSoundCue(\"stop\")");
    expect(source).toContain("queueDictationSoundCue(summary.transcript ? \"success\" : \"no-speech\")");
    expect(source).toContain("queueDictationSoundCue(\"error\")");
    expect(source).toContain("requestDictationSoundCue(soundCuePolicyRef.current, cue)");
  });
});
