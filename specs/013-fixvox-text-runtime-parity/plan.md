# Implementation Plan: Fixvox Text Runtime Parity

**Branch**: `[013-fixvox-text-runtime-parity]` | **Date**: 2026-06-25 | **Spec**: [spec.md](spec.md)

## Summary

Stop treating Fixvox's dictation/text process as inspiration. Adopt it as the behavior contract and copy/extract the working process code where practical. Dictation Tauri remains a Tauri/Rust desktop shell, but normal dictation text must flow through Fixvox-equivalent recording/audio preparation, managed STT, prompt policy, raw voice postprocess, sanitizer, fallback, and output materialization.

## Technical Context

**Language/Version**: TypeScript strict, React/Vite; Rust 2021; Tauri v2.

**Primary Dependencies**: Existing Dictation Tauri pipeline, Rust managed STT client, Fixvox source at `C:/dev/fixvox`, managed Fixvox cloud contracts.

**Fixvox Canonical Files To Audit First**:

- `C:/dev/fixvox/src/app/backend/voice-dock-output.ts` — route selection, materialization, postprocess flow.
- `C:/dev/fixvox/src/app/backend/voice-dock-processing.ts` — raw voice postprocess prompts, user message, sanitizer, selection transform helpers.
- `C:/dev/fixvox/src/app/backend/settings-types.ts` — default transcript and postprocess prompts/settings.
- `C:/dev/fixvox/src/app/backend/voice-execution-plan.ts` — effective voice runtime plan.
- `C:/dev/fixvox/src/app/backend/voice-runtime-policy.ts` — postprocess enablement policy.
- `C:/dev/fixvox/src/app/backend/managed-runtime.ts` and `managed-proxy.ts` — managed service resolution/contracts.
- `C:/dev/fixvox/src/app/backend/last-pipeline-snapshot.ts` and debug flow files — evidence shape for raw/final comparison.

**Testing**: Provider-free Vitest for prompt/sanitizer/request previews; Rust unit/compile tests for request construction if hosted in Rust; gated local smoke for managed provider parity.

**Constraints**:

- No dependency on a running Fixvox app.
- No raw transcript in durable docs/artifacts by default.
- No new UI scope in this feature beyond wiring the existing dock stop path to the new materialized text output.
- Any behavior divergence from Fixvox must be explicitly documented.

## Implementation Shape

Create a small compatibility layer rather than spreading Fixvox rules through the app:

```text
src/fixvox-text-runtime/
├── prompts.ts              # copied/adapted default prompts and prompt builders
├── postprocess.ts          # copied/adapted user message + sanitizer
├── policy.ts               # minimal effective runtime policy for normal dictation
├── materialize.ts          # raw transcript -> final output using Fixvox-equivalent flow
├── evidence.ts             # redacted parity evidence helpers
└── index.ts

src-tauri/src/
├── fixvox_text_runtime.rs  # only if chat/postprocess call is host-owned in Rust
├── fixvox_cloud.rs         # extend existing managed chat preview/call if needed
└── runtime_transcription.rs # return raw transcript + materialized/final output as needed
```

The exact TypeScript/Rust split should be chosen in Checkpoint 1. Prefer host-owned provider calls/secrets in Rust; pure prompt/sanitizer logic can live in TS if it remains provider-free and testable.

## Fewest-Step Plan

### Checkpoint 1 — Lock the Fixvox Process Contract

**Goal**: Produce a precise map of the current Fixvox normal-dictation process and choose the minimal code to copy/extract.

**Steps**:

1. Trace Fixvox normal dictation from stop-recording through `transcription.completed`, `route.selected`, optional `post_process.request/completed`, and `processing.output_materialized`.
2. Record the effective defaults: STT prompt/model/provider, postprocess enablement source, postprocess provider/model, system prompt, user message shape, sanitizer and fallback rules.
3. Decide TypeScript vs Rust ownership for managed chat postprocess calls, preserving host-owned secrets.
4. Add fixture/golden tests that fail until Dictation Tauri has matching prompt builders and sanitizer behavior.

**Validation**:

```powershell
npm run test:pipeline -- tests/fixvox-text-runtime
```

### Checkpoint 2 — Copy/Extract The Pure Fixvox Text Runtime

**Goal**: Bring over the process primitives that do not depend on legacy Fixvox desktop UI/runtime.

**Steps**:

1. Create `src/fixvox-text-runtime/*` with source annotations pointing to the Fixvox file/function copied or adapted.
2. Copy/adapt `DEFAULT_V2_TRANSCRIPT_PROMPT`, `DEFAULT_V2_VOICE_POST_PROCESS_PROMPT`, `buildRawVoicePostProcessSystemPrompt`, `buildRawVoicePostProcessUserMessage`, and `sanitizeRawVoicePostProcessOutput`.
3. Implement minimal normal-dictation policy resolution equivalent to Fixvox for managed runtime defaults.
4. Add tests for prompt exactness, cleanup levels, sanitizer fallback, disabled postprocess, and policy-derived route metadata.

**Validation**:

```powershell
npm run test:pipeline -- tests/fixvox-text-runtime
npm run build
```

### Checkpoint 3 — Wire The Existing Tauri Runtime To Materialized Fixvox Output

**Goal**: The real dock stop path should use Fixvox-equivalent final text, not raw STT direct-to-delivery except when Fixvox would do that.

**Steps**:

1. Extend the managed host runtime to call `/v1/chat/completions` for postprocess when policy enables it, using existing `fixvox_cloud` managed chat request builders or their exact equivalent.
2. Preserve raw transcript internally but expose/insert the materialized final output.
3. Record redacted runtime evidence: raw length/hash, final length/hash, provider/model, postprocess ran/skipped/failed, sanitizer reason, request IDs/metadata.
4. Keep provider-free tests by mocking host responses and request previews; real provider call remains gated.

**Validation**:

```powershell
npm run test:pipeline -- tests/fixvox-text-runtime tests/host-runtime tests/desktop-control
npm run build
cd src-tauri && cargo check
```

### Checkpoint 4 — Parity Smoke And Closeout

**Goal**: Prove against at least one controlled sample that Dictation Tauri follows Fixvox's process.

**Steps**:

1. Add or reuse a local parity harness that compares Dictation Tauri output against a Fixvox captured snapshot or runs the same controlled audio through both available paths.
2. Run one gated managed smoke with redacted evidence only.
3. Update `docs/WORKING_MEMORY.md`, `docs/topics/*`, and this spec with any remaining divergence.
4. Leave the live Tauri dev instance in a usable state if the batch touches dock runtime.

**Validation**:

```powershell
npm run test:pipeline
npm run build
npm run visual:check
cd src-tauri && cargo check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

## Explicit Non-Goals

- Do not redesign the dock in this spec.
- Do not port Fixvox UI/windows/server architecture.
- Do not implement selection transform/assistant mode unless the normal dictation path already requires a small shared primitive.
- Do not hide differences: if exact parity is blocked by app architecture, document the smallest divergence and why.

## Open Questions For Checkpoint 1

- Is Fixvox's current local policy disabling raw postprocess for JP's default profile, or should Dictation Tauri enable the default postprocess prompt for parity? Evidence must come from Fixvox effective runtime/debug snapshots, not assumption.
- Does Fixvox compress/convert captured audio before managed STT in the current path, or is it sending the captured WAV directly? Adopt whatever the current working path does.
- Which Fixvox managed policy endpoint should Dictation Tauri use for effective postprocess enablement if local env/policy is incomplete?
