# Quickstart: Real Microphone Capture

MVP3 is implemented through the CI-safe path: fake capture, WebView recorder
adapter boundaries, captured-audio pipeline submission, STT shell routing, and
honest delivery evidence are test-covered without recording real audio or
calling a real provider.

On Windows Tauri runtime, real microphone capture currently uses the native
Rust/Tauri fallback. The WebView `getUserMedia` route stayed pending without an
operable permission prompt during the manual check, so it remains a tested
adapter boundary rather than the active Windows runtime route.

Real microphone recording and real-provider transcription remain optional manual
checks. They require explicit JP approval before running.

## Current Safe Checks

These are the implemented routine checks for MVP3 closure:

```powershell
npm run synthetic-audio:fixtures
npm run synthetic-audio:stt:dry-run
npm run microphone-capture:check
npm run microphone-capture:dry-run
npm run test:pipeline
npm run build
npm run visual:check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

`npm run microphone-capture:check` and `npm run microphone-capture:dry-run`
are dry-run artifact/capture helpers. They must not request microphone
permission, record audio, read `.env`, require provider credentials, or call a
provider.

## Artifact Paths

Captured microphone artifacts are local development data:

```text
artifacts/microphone-capture/
├── audio/
├── transcripts/
├── provider-payloads/
└── reports/
```

Rules:

- Do not commit real audio, real transcripts, provider payloads, or capture logs.
- Keep provider payloads local under `artifacts/microphone-capture/provider-payloads/`
  if optional real-provider checks are approved later.
- Keep repo status clean for tracked files after manual capture checks.
- Document any move from repo-local `artifacts/` to app-data storage before
  closing an implementation batch.

The repo-local paths are:

```text
artifacts/microphone-capture/audio/
artifacts/microphone-capture/transcripts/
artifacts/microphone-capture/provider-payloads/
artifacts/microphone-capture/reports/
```

## Optional Manual Capture Check

Run this only when JP explicitly approves recording local microphone audio:

1. Start the Tauri app:

   ```powershell
   npm run tauri:dev
   ```

2. Use the in-app capture control to start recording.
3. Speak a short phrase.
4. Stop capture.
5. Confirm UI shows a terminal capture state and a transcription/setup state.
6. Confirm generated files remain ignored:

   ```powershell
   git status --short --ignored
   ```

Expected result:

- One local captured-audio artifact is created under
  `artifacts/microphone-capture/audio/`.
- No real audio/transcript files are tracked by git.
- If provider setup is missing, the app reports a redacted setup state.

## Automated Coverage

The capture and delivery evidence coverage lives in:

```powershell
npm run microphone-capture:check
npm run microphone-capture:dry-run
npm run test:pipeline -- tests/capture/capture-contract.test.ts
npm run test:pipeline -- tests/capture/webview-recorder.test.ts
npm run test:pipeline -- tests/capture/captured-audio-pipeline.test.ts
npm run test:pipeline -- tests/capture/delivery-evidence.test.ts
```

Expected coverage:

- Permission/setup states.
- No-overlap capture guard.
- Fake capture artifact metadata.
- Pipeline event ledger with capture metadata.
- Delivery evidence that does not claim paste observation.
- Redacted provider setup failures without provider calls.
- UI smoke flow for fake capture, cancellation, and captured-run submission.

## Out Of Scope For MVP3 First Cut

- Global hotkeys.
- Tray controls.
- Real selected-text capture.
- Settings UI.
- Durable history.
- Paste observation.
- Broad filesystem access from React.
