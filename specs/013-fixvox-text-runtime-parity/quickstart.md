# Quickstart: Fixvox Text Runtime Parity

## Safe Provider-Free Checks

```powershell
npm run test:pipeline -- tests/fixvox-text-runtime
npm run test:pipeline -- tests/fixvox-text-runtime tests/host-runtime tests/desktop-control
npm run build
cd src-tauri && cargo check
```

## Full Closeout Checks

```powershell
npm run test:pipeline
npm run build
npm run visual:check
cd src-tauri && cargo check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

## Gated Local Smoke

Managed STT + managed postprocess smoke can reuse the Fixvox managed harness with a local ignored audio artifact:

```powershell
bun scripts/fixvox-managed-smoke.ts --allow-provider-call --postprocess --audio artifacts/microphone-capture/audio/<capture>.wav
```

For full desktop delivery parity, run the existing E2E harness after launching Tauri:

```powershell
npm run tauri:dev
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/desktop-dictation-e2e.ps1 -AllowDesktopSideEffects -AllowProviderCall -AllowClipboardMutation -RunId <id>
```

Evidence rules:

- Do not write raw transcript text to durable docs by default.
- Prefer lengths/hashes/provider/model/request IDs/sanitizer reason.
- Raw local debug artifacts are allowed only when explicitly useful and kept ignored/local.

TTS parity probes (local generated artifacts, ignored):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File artifacts/tts-parity/generate-tts.ps1
bun scripts/fixvox-managed-smoke.ts --allow-provider-call --postprocess --audio artifacts/tts-parity/audio/<case>.wav
node artifacts/tts-parity/analyze-redacted.mjs
node artifacts/tts-parity/analyze-tauri-redacted.mjs
```

These probes are for local smoke evidence only; keep `artifacts/tts-parity/` ignored and do not promote raw transcripts to docs.

## Current Status

Implemented through Checkpoint 4 on 2026-06-25.

- Provider-free/runtime checks passed: `npm run test:pipeline` (54 files / 268 tests), `npm run build`, `cd src-tauri && cargo fmt --check && cargo check`.
- `npm run visual:check` passed on retry (first attempt had desktop `page.goto` timeout; narrow project passed on first attempt).
- Context checks passed: `bun scripts/context-index.ts && bun scripts/agent-context-audit.ts` with 4 known warnings about hot context size.
- Gated managed smoke with postprocess ran using ignored audio artifact `capture-native-1782385262858.wav`:
  - Command: `bun scripts/fixvox-managed-smoke.ts --allow-provider-call --postprocess --audio artifacts/microphone-capture/audio/capture-native-1782385262858.wav`
  - Current passing report: `artifacts/microphone-capture/reports/fixvox-managed-smoke-2026-06-25T12-11-08-175Z.json`
  - Result: managed STT ok (`transcriptLength: 384`, request metadata present) and managed postprocess ok (`postprocessOutputLength: 387`, request metadata present). No raw transcript/output was printed in chat/docs.
  - Investigation note: an earlier postprocess smoke returned `empty` because the harness sent the transcript as a plain chat user message instead of the Fixvox postprocess wrapper. `scripts/fixvox-managed-smoke.ts` now uses `buildRawVoicePostProcessSystemPrompt` and `buildRawVoicePostProcessUserMessage` from `src/fixvox-text-runtime`.
  - Earlier STT-only managed smoke also passed: `artifacts/microphone-capture/reports/fixvox-managed-smoke-2026-06-25T11-49-00-673Z.json`.
- Visible CUA smoke after follow-up dock fixes moved the real `Dictation Dock`, ran Start -> Stop & review, and created a fresh ignored WAV without printing transcript text.
- TTS validation (redacted) passed managed harness and real Tauri/Rust runtime for fillers/corrections, technical identifiers and neutral Spanish question punctuation; evidence lives in ignored `artifacts/tts-parity/*redacted*.json` plus redacted reports under `artifacts/microphone-capture/reports/`.
- TTS caveat: the exact Argentine phrase using `sentis` with Microsoft Sabina (es-MX) failed at STT recognition for the question words, so postprocess correctly did not invent `¿...?`. A clearer neutral `Como estas hoy` case passed with opening/closing question marks and `fallbackToRaw: false`.
