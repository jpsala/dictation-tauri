# Implementation Plan: Runtime Transcription And Delivery

**Branch**: `main` | **Date**: 2026-06-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-runtime-transcription-delivery/spec.md`

## Summary

Turn the post-MVP3 provider smoke into a project-owned runtime path: submit a
captured microphone artifact to an explicitly configured transcription boundary,
record redacted run evidence, preserve retry/recovery from the same clip, expose
transcript text for manual review/copy, and keep delivery claims honest. The
first implementation should build on the existing `PipelineService`, capture
artifact metadata, event ledger, and `ModelGateway` port rather than adding broad
desktop ergonomics.

The runtime slice must stay narrower than a full dictation product shell: no
global hotkeys, tray controls, selected-text replacement, history database,
settings expansion, or paste-observation claim. It may add a testable runtime
transcription gateway/adapter and local ignored reports if needed for evidence,
but provider calls remain explicit/gated and secrets never enter UI, git, reports,
or assistant output.

## Technical Context

**Language/Version**: TypeScript 6.0.x, React 19.x, Vite 8.x, Tauri 2.11.x, Rust 1.89.x.

**Primary Dependencies**: Existing React/Vite/Tauri stack, existing `PipelineService`, existing capture gateway/artifact types, existing `ModelGateway` interface, existing direct STT shell, Vitest, Playwright, native Tauri microphone capture (`cpal`/`hound`) as the active Windows capture route. No new dependency is planned for the first runtime boundary; provider SDK use must be justified in a later task if direct `fetch` is insufficient.

**Storage**: No durable product persistence. Real audio, transcripts, provider payloads, and evidence reports remain local and gitignored under `artifacts/microphone-capture/`. Runtime summaries may carry transcript text in memory for review/manual copy. Any product history, app-data store, retention policy, or settings persistence requires a separate spec or explicit extension.

**Testing**: `npm run test:pipeline` for unit/integration coverage, focused Vitest files under `tests/runtime-transcription/` and existing `tests/capture/`, `npm run synthetic-audio:stt:dry-run`, `npm run microphone-capture:check`, `npm run microphone-capture:dry-run`, `npm run build`, `npm run visual:check`, `bun scripts/context-index.ts`, and `bun scripts/agent-context-audit.ts`. Optional real-provider verification is local/gated and must prove ignored artifacts remain untracked.

**Target Platform**: Windows desktop development through the existing Tauri/Vite repo. The runtime boundary should remain platform-neutral in TypeScript, with desktop side effects kept behind Tauri/Rust or provider adapters.

**Project Type**: Desktop app with pure TypeScript pipeline domain, React observer/command surface, and Tauri/Rust host boundary for desktop side effects.

**Performance Goals**:

- For a short captured clip and configured local provider, produce transcript availability evidence in under 10 seconds.
- Classify missing setup or provider failure immediately enough to show a recovery action without losing the clip.
- Keep UI state feedback responsive; long transcription work must not block render/event updates.

**Constraints**:

- One active capture/transcription/delivery run at a time.
- Transcript availability is distinct from delivery success.
- Manual copy/review must remain available whenever transcription succeeds.
- No provider credentials, raw provider payloads, real transcript artifacts, or raw diagnostics in git, user-visible logs, reports, docs, or assistant output.
- No `paste_observed` unless a verified target-observation implementation exists.
- Provider calls are not CI defaults; real-provider checks require local credentials/artifacts and explicit approval.
- Existing MVP1/MVP2/MVP3 regression checks must stay green.

**Scale/Scope**: One local user, one main window, short dictation clips, one active runtime run, local/dev evidence artifacts, and manual recovery/copy as the first reliable delivery mechanism.

**Architecture Guardrails**:

- Keep the project-owned transcription interface as the boundary (`ModelGateway` or a small runtime wrapper around it).
- Preserve `PipelineService` as active-run owner for no-overlap, cancellation, event ledger, and terminal summary.
- Add recovery/delivery evidence as typed outcomes, not strings sprinkled through UI.
- Keep UI as command/observer; it may render transcript/recovery and trigger copy, but it must not own provider semantics.
- Keep provider-specific implementation out of React and outside source-controlled artifacts.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Human-Centered Outcomes: PASS. The feature turns captured speech into useful text or clear recovery instead of exposing provider internals.
- Privacy And Data Boundaries: PASS. Real audio/transcripts/provider details stay local/gitignored and redacted; provider submission is an explicit approved boundary.
- Durable Operational State: PASS. No accidental product persistence is introduced; local artifacts are development evidence only.
- Spec-Led Incremental Delivery: PASS. This plan creates design artifacts and tasks before implementation, and tasks are scoped by user story/small batch.
- Surface-Appropriate Design: PASS. The app remains an operational desktop dictation surface with visible confidence/recovery rather than hidden automation.

## Project Structure

### Documentation (this feature)

```text
specs/005-runtime-transcription-delivery/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── runtime-transcription-delivery.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── capture/
│   ├── types.ts
│   ├── artifact-policy.ts
│   └── native-tauri-gateway.ts
├── model-gateway/
│   ├── types.ts
│   ├── direct-stt.ts
│   └── runtime-transcription.ts       # planned runtime wrapper/policy if needed
├── pipeline/
│   ├── events.ts
│   ├── ports.ts
│   ├── service.ts
│   └── types.ts
└── App.tsx

tests/
├── capture/
├── pipeline/
└── runtime-transcription/              # planned focused runtime tests

artifacts/
└── microphone-capture/                  # gitignored local audio/transcripts/reports
```

**Structure Decision**: Reuse the existing capture, model-gateway, and pipeline
modules. Add a small runtime transcription/recovery module only if the current
`direct-stt.ts` adapter cannot express setup/provider/empty/cancel/retry states
cleanly. Keep evidence derivation in `src/pipeline/events.ts` and host/provider
side effects behind ports/adapters.

## Phase 0 Research

Captured in [research.md](research.md).

## Phase 1 Design

Captured in [data-model.md](data-model.md), [contracts/runtime-transcription-delivery.md](contracts/runtime-transcription-delivery.md), and [quickstart.md](quickstart.md).

## Constitution Check Post-Design

- Human-Centered Outcomes: PASS. User stories map to independent increments: transcribe, recover/review, deliver honestly.
- Privacy And Data Boundaries: PASS. The data model and contract require redaction and local ignored artifacts.
- Durable Operational State: PASS. Runtime state is in-memory/event-ledger only; durable product storage is explicitly deferred.
- Spec-Led Incremental Delivery: PASS. Tasks separate foundational contracts, US1, US2, US3, and verification.
- Surface-Appropriate Design: PASS. Delivery starts with review/manual copy and evidence, not overconfident desktop automation.

## Complexity Tracking

No constitution violations or justified complexity exceptions.
