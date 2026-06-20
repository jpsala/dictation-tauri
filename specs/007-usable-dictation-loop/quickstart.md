# Quickstart: Usable Dictation Loop

## Safe Default Checks

These commands must remain provider-free:

```powershell
npm run test:pipeline -- tests/host-runtime
npm run test:pipeline
npm run build
cd src-tauri && cargo check
npm run visual:check
```

## Expected First Slice Behavior

Before real provider support is wired in Rust/Tauri:

1. Browser/dev uses unavailable host client.
2. Tauri uses `createTauriHostRuntimeClient(invoke)`.
3. `get_runtime_transcription_readiness` can report unavailable/configured state.
4. `transcribe_captured_audio` may still return `HOST_RUNTIME_UNAVAILABLE`.
5. UI should show setup guidance honestly, not direct-local STT shell copy.

## Manual Real Provider Verification *(Gated Later)*

Do not run provider calls by default. The selected implementation route is native Rust HTTP/multipart inside the Tauri host, still behind explicit local gating. If a later 007 task implements that path and JP approves a local run, verify:

```powershell
npm run tauri:dev
```

Then capture a short clip, submit it once with the explicit provider-call gate enabled, and inspect that:

- transcript text appears in the app
- provider/model/latency evidence is redacted/safe
- report/transcript artifacts stay under `artifacts/microphone-capture/`
- no raw provider payload is stored unless a later spec enables it

Artifact hygiene check:

```powershell
git status --short --ignored artifacts .env
git ls-files artifacts .env
```

`git ls-files artifacts .env` must print nothing.

## Out Of Scope Checks

Do not add or require these for 007 first slices:

- hotkeys
- tray
- selected text replacement
- paste observation
- history persistence
- broad settings UI
- provider calls in CI/default scripts
