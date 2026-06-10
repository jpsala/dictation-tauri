# Quickstart: Real Microphone Capture

MVP3 is planned but not implemented yet. This quickstart defines the intended
verification flow for the first implementation batches.

## Current Safe Checks

These should remain green before and after microphone work:

```powershell
npm run synthetic-audio:fixtures
npm run synthetic-audio:stt:dry-run
npm run test:pipeline
npm run build
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

## Planned Artifact Paths

Captured microphone artifacts are local development data:

```text
artifacts/microphone-capture/
├── audio/
├── transcripts/
└── reports/
```

Rules:

- Do not commit real audio, real transcripts, provider payloads, or capture logs.
- Keep repo status clean for tracked files after manual capture checks.
- Document any move from repo-local `artifacts/` to app-data storage before
  closing an implementation batch.

## Planned Manual Capture Check

After capture UI and adapter tasks exist:

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
  `artifacts/microphone-capture/` or a documented app-data path.
- No real audio/transcript files are tracked by git.
- If provider setup is missing, the app reports a redacted setup state.

## Planned Automated Checks

Future tasks should add:

```powershell
npm run test:pipeline -- tests/capture/capture-contract.test.ts
```

Expected coverage:

- Permission/setup states.
- No-overlap capture guard.
- Fake capture artifact metadata.
- Pipeline event ledger with capture metadata.
- Delivery evidence that does not claim paste observation.

## Out Of Scope For MVP3 First Cut

- Global hotkeys.
- Tray controls.
- Real selected-text capture.
- Settings UI.
- Durable history.
- Paste observation.
- Broad filesystem access from React.
