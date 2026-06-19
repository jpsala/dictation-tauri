# Implementation Plan: Host Runtime Transcription Boundary

**Branch**: `main` | **Date**: 2026-06-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-host-runtime-transcription-boundary/spec.md`

## Summary

Introduce a safe host-owned boundary for real runtime transcription before any provider wiring enters React. The boundary should own local config lookup, captured-audio reads, provider fetch injection, transcript/report artifact writes, and redacted evidence. React remains a command/observer surface and can use fake host clients until a Tauri command is implemented.

This feature builds directly on 005: `ModelGateway`, `createGroqSttGateway`, `scripts/runtime-transcription.ts`, runtime redaction/recovery helpers, and honest delivery evidence. The first implementation should avoid provider calls in CI and avoid direct Groq imports in `src/App.tsx`.

## Technical Context

**Language/Version**: TypeScript 6.0.x, React 19.x, Vite 8.x, Tauri 2.11.x, Rust 1.89.x.

**Primary Dependencies**: Existing TypeScript runtime modules, `ModelGateway`, `createGroqSttGateway`, `PipelineService`, Tauri `invoke` pattern, Rust native capture commands. No new package dependency planned.

**Storage**: Local ignored development artifacts under `artifacts/microphone-capture/`. No durable product history or app-data retention in the first slice.

**Testing**: Vitest for host boundary helpers and fake host clients; existing `npm run test:pipeline`; `npm run build`; `npm run runtime-transcription:check`; `npm run runtime-transcription:groq:dry-run`; context index/audit for docs.

**Target Platform**: Windows desktop Tauri, with browser/dev fake fallback for tests.

**Project Type**: Desktop app with pure TypeScript pipeline domain, React UI, and Tauri/Rust host side effects.

**Constraints**:

- No provider calls by default or in CI.
- No secrets in React, reports, git, assistant output, or user-visible logs.
- Host boundary must be fakeable in unit tests.
- Captured artifact paths must be validated before reads.
- No UI claim stronger than evidence supports.
- Avoid broad desktop ergonomics: no hotkeys, tray, selected text, focus/paste automation.

## Constitution Check

- Human-Centered Outcomes: PASS. The boundary makes real transcription setup understandable without unsafe UI secrets.
- Privacy And Data Boundaries: PASS. Credentials/audio/provider calls move to host-owned code and stay redacted.
- Durable Operational State: PASS. No product persistence introduced.
- Spec-Led Incremental Delivery: PASS. This plan precedes implementation and defines small slices.
- Surface-Appropriate Design: PASS. UI remains honest command/observer; side effects stay host-side.

## Project Structure

```text
specs/006-host-runtime-transcription-boundary/
├── spec.md
├── plan.md
├── contracts/
│   └── host-runtime-transcription.md
└── tasks.md

src/
├── host-runtime/                  # proposed TS host boundary helpers/client types
├── model-gateway/
├── pipeline/
└── App.tsx                        # optional later fake-host UI wiring only

src-tauri/src/
├── lib.rs
├── native_capture.rs
└── runtime_transcription.rs       # possible later Tauri command if chosen

tests/
└── host-runtime/                  # proposed focused host boundary tests
```

**Structure Decision**: Start with TypeScript host boundary contracts/helpers and tests, because they can reuse the committed runtime script and `ModelGateway` without introducing Rust HTTP/env complexity. Add Tauri command only after the TypeScript boundary is stable or if UI wiring requires `invoke`.

## Phase 0 Research

Key findings from 005 and current repo:

- React currently uses `createCapturedAudioTranscriptionAdapter()` default shell and does not import Groq.
- `createGroqSttGateway` now requires injected API key, `fetch`, and `readAudioFile`; no implicit provider call boundary remains.
- `scripts/runtime-transcription.ts` already proves reusable local host behavior with safe npm wrappers and an explicit `--allow-provider-call` real mode.
- Tauri has existing invoke commands for native microphone capture in `src-tauri/src/lib.rs` and `src-tauri/src/native_capture.rs`.
- `src-tauri/capabilities/default.json` currently grants only `core:default`; additional invoke permissions may be needed if a new command is exposed.

## Phase 1 Design

Contract: [contracts/host-runtime-transcription.md](contracts/host-runtime-transcription.md)

Design decisions:

1. Readiness and transcription responses must be typed and redacted.
2. Host boundary should be injectable/fakeable; UI tests should not depend on Tauri or real providers.
3. First implementation can be TypeScript script/host helper; Tauri command is a follow-up slice unless necessary.
4. `groq-real` remains manual/gated; no npm default can call a provider.
5. Any future UI wiring must use a host client abstraction, not `createGroqSttGateway` directly.

## Constitution Check Post-Design

- Human-Centered Outcomes: PASS.
- Privacy And Data Boundaries: PASS.
- Durable Operational State: PASS.
- Spec-Led Incremental Delivery: PASS.
- Surface-Appropriate Design: PASS.

## Complexity Tracking

No constitution violations. The Tauri command is deliberately deferred unless a small batch explicitly owns Rust/capability changes and tests.
