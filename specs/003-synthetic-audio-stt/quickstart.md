# Quickstart: Synthetic Audio STT

## Purpose

Use this guide for MVP 2 synthetic fixture/STT checks. The implemented commands
are dry-run/local only: they do not call providers, require microphone access, or
generate audio.

## Routine Checks

Validate the source-controlled fixture manifest and artifact policy:

```powershell
npm run synthetic-audio:fixtures
```

Run the dry-run STT harness and write a local evidence report:

```powershell
npm run synthetic-audio:stt:dry-run
```

Run the MVP 1 and MVP 2 regression suite:

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
2. Generate or restore local audio artifacts under `artifacts/synthetic-audio-stt/audio/` when a future real-provider/local-audio run needs them.
3. Run the dry-run/mock STT path without provider credentials.
4. Write local dry-run reports under `artifacts/synthetic-audio-stt/reports/`.
5. Keep transcripts and provider payload outputs, when introduced, under `artifacts/synthetic-audio-stt/transcripts/` and `artifacts/synthetic-audio-stt/provider-payloads/`.
6. Confirm generated audio, transcripts, payloads, and reports stay gitignored.

The current direct local STT adapter is a redacted setup/provider-error shell.
No real-provider fixture command is enabled in this MVP 2 closeout.

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

## Implemented Command Outputs

- `npm run synthetic-audio:fixtures`: prints fixture count, expected text lengths,
  artifact setup status, `providerCallsEnabled: false`, and `audioRequired: false`.
- `npm run synthetic-audio:stt:dry-run`: runs the first synthetic fixture through
  the mock STT adapter and writes a JSON report under
  `artifacts/synthetic-audio-stt/reports/`.
- `npm run test:pipeline`: runs pipeline, synthetic fixture, dry-run STT, and
  report-generation tests.

## Closeout Checks For Implementation Batches

At minimum:

```powershell
npm run synthetic-audio:fixtures
npm run synthetic-audio:stt:dry-run
npm run test:pipeline
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Optional real-provider STT remains a local future check and must only be added
when a command exists, generated/restored audio is present, and credentials are
available without printing secrets.
