export type DictationSoundCue = "start" | "stop" | "success" | "error" | "no-speech";

export type SoundCuePolicy = {
  enabled: boolean;
};

export type SoundCueRequest = {
  cue: DictationSoundCue;
  status: "queued" | "skipped" | "failed";
  reason: string;
  redacted: true;
};

export function createSoundCuePolicy(input: { dictationSoundCuesEnabled?: boolean } | undefined): SoundCuePolicy {
  return { enabled: input?.dictationSoundCuesEnabled === true };
}

export function requestDictationSoundCue(
  policy: SoundCuePolicy,
  cue: DictationSoundCue,
  play: (cue: DictationSoundCue) => void | Promise<void> = defaultNoopCuePlayer,
): SoundCueRequest {
  if (!policy.enabled) {
    return {
      cue,
      status: "skipped",
      reason: "sound_cues_disabled",
      redacted: true,
    };
  }

  try {
    void Promise.resolve(play(cue)).catch(() => undefined);
    return {
      cue,
      status: "queued",
      reason: "sound_cue_queued_non_blocking",
      redacted: true,
    };
  } catch {
    return {
      cue,
      status: "failed",
      reason: "sound_cue_request_failed_non_blocking",
      redacted: true,
    };
  }
}

function defaultNoopCuePlayer() {
  // Host/browser audio playback backend is intentionally added separately.
  // The cue request contract must remain non-blocking and safe when playback is unavailable.
}
