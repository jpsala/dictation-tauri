import { invoke, isTauri } from "@tauri-apps/api/core";
import type { DictationSoundCue } from "../voice-dock/sound-cues";

export async function playHostDictationSoundCue(cue: DictationSoundCue): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await invoke("play_dictation_sound_cue", { cue });
}
