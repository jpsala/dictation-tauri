# Quickstart: Fixvox Audio Runtime Parity

## Provider-Free Checks

```powershell
npm run test:pipeline -- tests/capture tests/desktop-control tests/settings tests/voice-dock
npm run build
cd src-tauri && cargo check
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
