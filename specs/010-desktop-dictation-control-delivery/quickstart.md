# Quickstart: Desktop Dictation Control And Delivery

## Safe Default Verification

These commands must not call Fixvox/Groq, register global hotkeys, access real clipboard/focus APIs, or require microphone hardware:

```powershell
npm run test:pipeline
npm run build
cd src-tauri && cargo check
```

If UI copy/layout changes:

```powershell
npm run visual:check
```

If docs/spec index changes:

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

## Expected Safe Demo Shape

Using fakes/tests only:

1. Start a desktop dictation session through the app button or fake host control event.
2. Stop the session and finalize a fake captured artifact.
3. Submit through the existing host runtime adapter/fake host response.
4. Show transcript review.
5. Run delivery as review-only or fake copy.
6. Verify delivery evidence is `available`, `copied`, `failed`, `uncertain`, or `paste_sent`, never `paste_observed`.

## Gated Manual Checks

Only after explicit approval and after provider-free tests pass:

```powershell
# Placeholder examples; exact commands must be added by the implementation batch.
npm run tauri:dev
# Manually trigger one fixed hotkey or desktop control event.
# Optionally submit one ignored captured WAV through managed Fixvox cloud if approved.
```

Manual evidence rules:

- Redact secrets, full device ids, request ids if secret-like, transcript content, and private window titles.
- Keep audio/transcripts/reports under ignored artifact roots.
- Do not claim paste observation unless a verified observer exists.
- Run artifact hygiene checks before closing:

```powershell
git status --short --ignored artifacts .env
git ls-files artifacts .env
```

## Non-Goals During Quickstart

- No selected-text capture or replace-selection.
- No full tray/settings/remapping UI.
- No durable dictation history.
- No default provider calls.
- No paste observation claims.
