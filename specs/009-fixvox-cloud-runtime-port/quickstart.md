# Quickstart: Fixvox Cloud Runtime Port

## Safe local checks

```powershell
npm run test:pipeline
npm run build
cd src-tauri && cargo check
```

These must not call Fixvox or Groq.

## Manual cloud smoke, gated

Only after implementation and JP approval:

```powershell
$env:FIXVOX_BACKEND_URL="https://auth-fixvox.jpsala.dev"
bun scripts/fixvox-managed-smoke.ts --allow-provider-call

# Optional postprocess lane through managed /v1/chat/completions:
bun scripts/fixvox-managed-smoke.ts --allow-provider-call --postprocess
```

Expected script flow:

1. Host-compatible smoke registers/loads device id in the same app-data JSON used by Rust.
2. Calls `/v2/execution/preflight` before provider work.
3. Uses the latest ignored WAV artifact under `artifacts/microphone-capture/audio/`.
4. Calls Fixvox managed STT with `X-Device-Id`, no vendor bearer token.
5. With `--postprocess`, calls `/v2/execution/preflight` for `aiAction`, then managed `/v1/chat/completions` with `X-Device-Id` and no vendor bearer token.
6. Writes transcript/postprocess artifacts plus redacted report under ignored `artifacts/microphone-capture/`.

Optional UI flow after the script has registered a device:

```powershell
npm run tauri:dev
```

Then confirm readiness says managed cloud is ready, capture WAV, and use `Transcribe with provider`.

Do not paste full secrets, full device id, audio, transcript payloads, or provider bodies into docs/chat.

## Manual Evidence

### 2026-06-23: managed STT smoke passed from hotkey WAV

User approval: JP answered `go` after the assistant identified the next checkpoint as a real provider/cloud smoke.

Command shape:

```powershell
npm run test:pipeline -- tests/desktop-control
cd src-tauri && cargo check
npm run runtime-transcription:check
bun scripts/fixvox-managed-smoke.ts --allow-provider-call --audio artifacts/microphone-capture/audio/capture-native-1782219726497.wav
```

Redacted result:

- Input audio: prior ignored hotkey-capture artifact `artifacts/microphone-capture/audio/capture-native-1782219726497.wav`.
- Provider path: `fixvox-cloud` managed STT.
- Model: `whisper-large-v3`.
- Status: `ok`.
- Latency: `683ms`.
- Request id/metadata present: yes, redacted.
- Transcript length: `10`; transcript text not pasted into docs/chat.
- Transcript artifact: `artifacts/microphone-capture/transcripts/fixvox-managed-smoke-2026-06-23T14-23-02-368Z.txt` (ignored).
- Redacted report: `artifacts/microphone-capture/reports/fixvox-managed-smoke-2026-06-23T14-23-02-368Z.json` (ignored).
- Raw provider payload stored: false.

Scope note: the same session attempted to create a fresh WAV through the versioned hotkey smoke first. Rust logged/received two `Ctrl+Shift+F9` events in the diagnostic run, but no new audio artifact was produced, so the provider smoke intentionally used the last known-good real hotkey WAV instead of overstating E2E success.

### 2026-06-23: managed STT passed on fresh hotkey WAV and app E2E

User approval: JP selected `E2E con copy real`, explicitly allowing provider/cloud calls plus local desktop/clipboard side effects for this smoke.

Command shape:

```powershell
npm run test:pipeline -- tests/desktop-control
cd src-tauri && cargo check
npm run runtime-transcription:check
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/desktop-hotkey-smoke.ps1 -AllowDesktopSideEffects -InitialDelaySeconds 12
bun scripts/fixvox-managed-smoke.ts --allow-provider-call --audio artifacts/microphone-capture/audio/capture-native-1782226487236.wav
powershell -NoProfile -ExecutionPolicy Bypass -File artifacts/desktop-control/e2e-review-copy-smoke.ps1 -AllowDesktopSideEffects -AllowProviderCall -InitialDelaySeconds 12
```

Redacted result:

- Fresh hotkey WAV for script-managed STT: `artifacts/microphone-capture/audio/capture-native-1782226487236.wav` (`960044` bytes).
- Provider path: `fixvox-cloud` managed STT.
- Model: `whisper-large-v3`.
- Status: `ok`.
- Latency: `708ms`.
- Request id/metadata present: yes, redacted.
- Transcript length: `1`; transcript text not pasted into docs/chat.
- Transcript artifact: `artifacts/microphone-capture/transcripts/fixvox-managed-smoke-2026-06-23T14-55-40-606Z.txt` (ignored).
- Redacted report: `artifacts/microphone-capture/reports/fixvox-managed-smoke-2026-06-23T14-55-40-606Z.json` (ignored).
- Full app E2E also passed: hotkey produced `artifacts/microphone-capture/audio/capture-native-1782226670693.wav`, app transcript review became visible, and `Copy transcript` changed clipboard to non-empty text. Report: `artifacts/desktop-control/e2e-review-copy-20260623-115733.json` (ignored).
- Raw provider payload stored: false; no transcript content stored in redacted reports.
