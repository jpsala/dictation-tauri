# Quickstart: Host Runtime Transcription Boundary

006 defines the safe bridge from runtime transcription toward the app: React stays provider-free, while a host/Tauri/backend boundary owns local config lookup, audio reads, provider fetch, transcript/report artifacts, and redacted evidence.

## Routine Safe Checks

These commands must not call real providers or require credentials:

```powershell
npm run test:pipeline
npm run runtime-transcription:check
npm run runtime-transcription:groq:dry-run
npm run build
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Focused 006 tests should live under:

```powershell
npm run test:pipeline -- tests/host-runtime
```

## Boundary Rules

- React may use only a provider-free host client abstraction.
- React must not import `src/model-gateway/groq-stt.ts`.
- Readiness checks must not read audio, `.env` values, or call providers.
- Real provider calls remain explicit/gated and host-owned.
- Captured artifact paths must be validated before reads.
- Reports/transcripts stay under ignored `artifacts/microphone-capture/` paths.
- `git ls-files artifacts .env` must print nothing after verification.

## Intended Command Shape

Safe/default commands:

```powershell
npm run runtime-transcription:check
npm run runtime-transcription:groq:dry-run
```

Optional real-provider command remains manual and explicit:

```powershell
bun scripts/runtime-transcription.ts --mode groq-real --allow-provider-call --audio artifacts/microphone-capture/audio/<ignored-file>.wav
```

Tauri command names for the first host boundary slice:

```text
get_runtime_transcription_readiness
transcribe_captured_audio
```

A safe first implementation may be a stub that returns redacted unavailable/setup-error responses. Real provider wiring remains host-owned and gated; React must call commands through `HostRuntimeClient` only.

## Out Of Scope

- Global hotkeys.
- Tray controls.
- Selected-text replacement.
- Paste/focus automation.
- Raw provider payload storage.
- Durable transcript history.
- Direct provider calls from React.
