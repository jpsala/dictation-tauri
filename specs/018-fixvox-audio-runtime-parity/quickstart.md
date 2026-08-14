# Quickstart: Fixvox Audio Runtime Parity

## Provider-Free Checks

```powershell
npm run test:pipeline -- tests/capture tests/desktop-control tests/settings tests/voice-dock
npm run build
cd src-tauri && cargo check
```

Low-volume enhancement is host-owned and enabled by default. It is a no-op at
or above `-48 dBFS` RMS. Below that threshold it targets `-34 dBFS`, caps gain
at `+18 dB`, and preserves at least `-6 dBFS` peak headroom before the MP3
upload is encoded. The Dictation setting can disable it.
When gain is actually applied, the dock shows a passive `Mejorado +N dB`
notice for 3.5 seconds. Skipped and fallback outcomes do not show it.

Focused provider-free verification:

```powershell
cd src-tauri
cargo test low_level_normalization --lib
cargo test audio_prep_applies_gain_only_to_low_level_speech_when_enabled --lib
```

## Expected Gated Smokes

Run only when the relevant side effects are approved:

```powershell
npm run tauri:dev:hidden -- -StopExisting
npm run auto-stop:smoke -- -AllowMicrophone -StopExisting
npm run audio-mute-cues:smoke -- -AllowDesktopSideEffects -StopExisting
# future scripts expected from later tasks:
# npm run audio-prep:smoke -- -AllowMicrophone -StopExisting
```

## Privacy Rules

- Do not commit or print raw audio/transcripts.
- Store evidence under `artifacts/...` with lengths, hashes, durations, IDs, and redacted reasons only.
- Output mute must restore previous state on success, cancel, and error.
