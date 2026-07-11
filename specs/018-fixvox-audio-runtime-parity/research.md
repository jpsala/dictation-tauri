# Research: Fixvox Audio Runtime Parity

Created: 2026-07-02

## Source Findings

### Dictation Tauri current state

- `src-tauri/src/runtime_transcription.rs` already has a host-side `prepare_speech_upload_payload` path for real provider calls:
  - analyzes WAV voice activity (`analyze_wav_voice_activity`),
  - returns `NO_SPEECH_DETECTED` locally when `has_speech=false`,
  - attempts ffmpeg MP3 conversion for long/large WAVs,
  - emits `HostAudioPrepEvidence` with original/upload bytes, mime/source/file, compression timing/ratio, duration and voice activity.
- That logic currently lives inside the host transcription path. It is not yet a shared provider-free contract available to the TS capture/session tests, Settings prefs, auto-stop, sound cues, or pipeline telemetry summary.
- `src-tauri/src/native_capture.rs` captures microphone samples with CPAL and writes WAV artifacts. It exposes live VU level but does not yet expose an auto-stop silence decision, mute-output session, or cue events.
- `src/pipeline/types.ts` has capture/transcription/delivery events and delivery evidence, but no normalized stage telemetry type for capture/audio-prep/STT/postprocess/delivery.

### Fixvox reference signals

- Fixvox Settings exposes `voice.muteOutputDuringRecording`, `autoStopAfterSilenceEnabled`, `auto-stop-silence-ms`, and `dictationSoundCuesEnabled` in `C:/dev/fixvox/src/app/views/settings/App.svelte`.
- Fixvox generated debug docs show recording events carrying `muteOutputDuringRecording=true` and telemetry/debug events by execution.
- Fixvox keeps telemetry/debug as operational evidence; Dictation Tauri should adapt this with stricter redaction and avoid raw audio/transcripts in docs or chat.

## Decisions for this spec

1. Start with a shared provider-free TypeScript audio analysis contract mirroring the host VAD concepts: duration, frames, voiced frames/ms, RMS/peak ppm, and classification.
2. Keep Rust host VAD/MP3 path as the real-provider source, then converge names/evidence toward the shared telemetry contract.
3. Implement auto-stop after the classifier exists, because it depends on reliable silence windows.
4. Keep mute-output and sound cues host-owned and gated because they touch local OS state.
5. Add stage telemetry as a redacted contract first, then wire each stage incrementally.

## Open implementation notes

- Threshold defaults should initially match the existing Rust host constants where practical; if not exposed, keep TS defaults conservative and verify against fixtures.
- MP3 conversion depends on ffmpeg availability. Failure must be telemetry, not a dictation failure when original audio is usable.
- Sound cues must never block recording or delivery.
