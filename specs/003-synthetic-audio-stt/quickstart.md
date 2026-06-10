# Quickstart: Synthetic Audio STT

## Purpose

Use this guide when implementing MVP 2 tasks. This planning batch does not call
providers or generate audio.

## Routine Checks

Run the MVP 1 regression suite:

```powershell
npm run test:pipeline
```

Refresh agent/docs indexes:

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

## Expected MVP 2 Flow

1. Validate the source-controlled synthetic fixture manifest.
2. Generate or restore local audio artifacts under `artifacts/synthetic-audio-stt/`.
3. Run the dry-run/mock STT path without provider credentials.
4. Run a real local STT fixture only when local provider variables are present.
5. Write local reports under `artifacts/synthetic-audio-stt/reports/`.
6. Confirm generated audio, transcripts, payloads, and reports stay gitignored.

## Artifact Rules

Version:

- fixture manifest;
- synthetic expected text;
- source code, contracts, tests, and docs.

Keep local/gitignored:

- generated audio;
- human/reference audio;
- transcripts from provider calls;
- raw provider payloads;
- benchmark reports;
- `.env` and tokens.

## Scope Guardrails

Do not implement these in MVP 2:

- microphone capture;
- global hotkeys;
- tray integration;
- real clipboard/paste or paste observation;
- real selected-text capture;
- settings UI;
- product persistence.

## Provider Variables

Implementation may look for provider configuration by variable name only, such
as local OpenAI/Groq/OpenRouter/xAI keys or provider/model overrides. Do not
print values in logs, reports, commits, or assistant responses.

## Closeout Checks For Implementation Batches

At minimum:

```powershell
npm run test:pipeline
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

When implementation adds fixture/STT commands, add the specific dry-run command
and optional real-provider command to this file before closing that batch.
