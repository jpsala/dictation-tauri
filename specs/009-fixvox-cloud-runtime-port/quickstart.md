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
npm run tauri:dev
```

Expected flow:

1. Host registers/loads device id.
2. Readiness says managed cloud is ready.
3. Capture WAV artifact.
4. `Transcribe with provider` uses Fixvox managed STT.
5. UI shows transcript plus backend/provider metadata.

Do not paste full secrets, full device id, audio, transcript payloads, or provider bodies into docs/chat.
