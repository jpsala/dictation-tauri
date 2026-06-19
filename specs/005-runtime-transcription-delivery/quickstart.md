# Quickstart: Runtime Transcription And Delivery

This feature starts from the MVP3 baseline: native Tauri microphone capture can
produce a local WAV artifact, and an explicitly approved provider smoke already
proved one captured clip can be transcribed while keeping artifacts ignored.

005 turns that smoke into a reliable runtime path with typed setup/provider
failures, retry/recovery, transcript review/manual copy, and honest delivery
evidence.

## Routine Safe Checks

Run these during normal development. They must not call real providers or require
credentials:

```powershell
npm run test:pipeline
npm run synthetic-audio:stt:dry-run
npm run microphone-capture:check
npm run microphone-capture:dry-run
npm run runtime-transcription:check
npm run runtime-transcription:groq:dry-run
npm run build
npm run visual:check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Focused 005 tests should live under:

```powershell
npm run test:pipeline -- tests/runtime-transcription
npm run test:pipeline -- tests/runtime-transcription/groq-stt.test.ts
npm run test:pipeline -- tests/capture/captured-audio-pipeline.test.ts tests/capture/delivery-evidence.test.ts
```

The Groq STT adapter is CI-safe by default: it requires injected API key,
`fetch`, and audio-reader boundaries. Tests use fake fetch/audio data and must
not read `.env`, open real audio, or call the provider.

The reusable runtime script is also safe by default:

```powershell
npm run runtime-transcription:check
npm run runtime-transcription:groq:dry-run
```

`groq-real` is intentionally not exposed as an npm script. It requires explicit
approval and the `--allow-provider-call` flag:

```powershell
bun scripts/runtime-transcription.ts --mode groq-real --allow-provider-call --audio artifacts/microphone-capture/audio/<ignored-file>.wav
```

The script prints only a redacted summary; transcript text and the full report
remain under ignored `artifacts/microphone-capture/` paths.

## Local Artifact Paths

Runtime evidence remains local and ignored:

```text
artifacts/microphone-capture/
├── audio/
├── transcripts/
├── provider-payloads/
└── reports/
```

Rules:

- Do not commit real audio, real transcripts, provider payloads, reports, `.env`,
  or tokens.
- Do not print secrets or raw provider payloads in terminal output or assistant
  replies.
- Redacted reports may include provider/model, latency, redacted request id, and
  outcome classification.

## Expected Runtime Outcomes

A configured run with a short captured clip should end with:

- transcript text available for review/manual copy;
- provider/model and latency evidence;
- redacted request evidence when available;
- delivery evidence no stronger than what was proved.

A missing setup/provider failure should end with:

- no lost captured clip;
- redacted diagnostic;
- recovery action such as inspect setup, retry from same clip, or record again.

An empty/unusable transcript should end with:

- explicit empty/unusable status;
- no delivery success claim;
- recovery action.

## Optional Real-Provider Verification

Run only when JP explicitly approves using local credentials and local captured
audio.

Preconditions:

1. A captured clip exists under `artifacts/microphone-capture/audio/`.
2. Provider credentials/configuration exist in ignored local environment.
3. The command/path being used writes transcripts/reports only under ignored
   `artifacts/microphone-capture/` paths.

After the run, verify:

```powershell
git status --short --ignored artifacts .env
git ls-files artifacts .env
```

Expected result:

- `git ls-files artifacts .env` prints nothing.
- `.env` and `artifacts/` appear only as ignored/untracked local data.
- No raw provider payload is source-controlled.
- No `paste_observed` claim appears unless a verified observation path exists.

### Latest Approved Local Check

Date: 2026-06-19.

With explicit JP approval, the gated Groq runtime adapter transcribed the ignored
captured WAV `artifacts/microphone-capture/audio/capture-native-1781319419097.wav`.

Redacted result:

- Status: `ok`.
- Provider/model: `groq` / `whisper-large-v3`.
- Latency: 960 ms.
- Request id: redacted in the local report.
- Transcript length: 11 characters; transcript text is not documented here.
- Transcript/report paths: written only under ignored `artifacts/microphone-capture/` paths.
- Raw provider payload stored: `false`.
- `git ls-files artifacts .env` printed nothing.

## Out Of Scope For This Feature

- Global hotkeys.
- Tray controls.
- Real selected-text capture/replacement.
- Settings expansion.
- Durable history/product persistence.
- Verified paste observation.
- Provider calls in default CI-safe scripts.
