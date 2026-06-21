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
```

Expected script flow:

1. Host-compatible smoke registers/loads device id in the same app-data JSON used by Rust.
2. Calls `/v2/execution/preflight` before provider work.
3. Uses the latest ignored WAV artifact under `artifacts/microphone-capture/audio/`.
4. Calls Fixvox managed STT with `X-Device-Id`, no vendor bearer token.
5. Writes a transcript artifact plus redacted report under ignored `artifacts/microphone-capture/`.

Optional UI flow after the script has registered a device:

```powershell
npm run tauri:dev
```

Then confirm readiness says managed cloud is ready, capture WAV, and use `Transcribe with provider`.

Do not paste full secrets, full device id, audio, transcript payloads, or provider bodies into docs/chat.
