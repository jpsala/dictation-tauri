# Implementation Plan: Synthetic Audio STT

**Branch**: `main` | **Date**: 2026-06-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-synthetic-audio-stt/spec.md`

## Summary

Prepare MVP 2 as the first real model milestone: define controlled synthetic
audio fixtures, add a local STT harness around the existing pipeline
service/ports/event ledger, and introduce a direct local `ModelGateway` adapter
for real transcription over fixture audio. This plan intentionally excludes
real microphone capture, hotkeys, tray, real selected text, real clipboard/paste,
settings UI, and durable product persistence.

The implementation should keep MVP 1 architecture intact. The UI remains an
observer; `PipelineService` owns run state, cancellation, no-overlap, event
emission, and summary derivation. Provider calls and secrets stay outside React
and enter through a local script or future Tauri/host boundary.

## Technical Context

**Language/Version**: TypeScript 6.0.x, React 19.x, Rust 1.89.x remains present for Tauri shell but is not required for the initial planning batch.

**Primary Dependencies**: Existing React/Vite/Tauri stack and Vitest pipeline tests. MVP 2 may add a small Node/TypeScript harness dependency only if needed for multipart STT requests or audio metadata.

**Storage**: No product persistence. Version synthetic fixture manifests and expected text only. Generated audio, transcripts, provider payloads, and benchmark reports are local/gitignored artifacts.

**Testing**: `npm run test:pipeline`, fixture manifest validation, dry-run/mock STT tests, optional local real-provider STT command when credentials are present, `bun scripts/context-index.ts`, and `bun scripts/agent-context-audit.ts`.

**Target Platform**: Windows desktop development through the existing Tauri/Vite repo; MVP 2 harness must run without microphone permissions or desktop delivery side effects.

**Project Type**: Desktop app with pure TypeScript pipeline domain, local fixture/STT harness, and future Tauri side-effect boundary.

**Performance Goals**: One fixture STT run should produce evidence in a developer-acceptable time budget and record actual latency. No fixed product latency target is set until real microphone flow exists.

**Constraints**:

- No real microphone capture.
- No global hotkeys, tray, settings UI, selected-text capture, real clipboard insertion, or paste observation.
- No durable product persistence.
- No provider keys in React UI, docs, git, event output, or assistant responses.
- No provider calls in this planning batch.
- Real STT is local/dev only and must have a dry-run/mock path for routine checks.
- Generated audio, transcripts, provider payloads, and reports default to gitignored local paths.

**Scale/Scope**: A small synthetic fixture set, one direct local STT adapter path, dry-run validation, one or more local evidence reports, and preservation of all MVP 1 pipeline guarantees.

**Architecture Guardrails**:

- Keep pipeline by ports/adapters.
- Keep `ModelGateway` direct local as the first real adapter.
- Keep UI observational; it may dispatch commands and render state but never owns STT/provider transitions.
- Keep Tauri/Rust for future side effects and host boundaries.
- Close MVP 2 by evidence: fixture validation, run ledger, summary, report, artifact policy.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Human-Centered Outcomes: PASS. MVP 2 proves real transcription quality before asking for manual microphone testing.
- Privacy And Data Boundaries: PASS. Secrets are local-only and generated audio/transcripts/reports are not committed.
- Durable Operational State: PASS. No product persistence is introduced; artifact policy defines local vs versioned paths.
- Spec-Led Incremental Delivery: PASS. Tasks are split by fixture contract, gateway harness, and evidence reporting.
- Surface-Appropriate Design: PASS. No durable UI expansion is required; any UI remains state-observational.

## Project Structure

### Documentation (this feature)

```text
specs/003-synthetic-audio-stt/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── synthetic-audio-stt.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── pipeline/
│   ├── events.ts
│   ├── fixtures.ts
│   ├── ports.ts
│   ├── runner.ts
│   ├── service.ts
│   └── types.ts
├── model-gateway/
│   ├── mock.ts
│   ├── direct-stt.ts
│   └── types.ts
└── test-fixtures/
    ├── simulated-dictation.ts
    └── synthetic-audio-manifest.ts

scripts/
└── synthetic-audio-stt.ts

tests/
├── pipeline/
│   └── existing MVP 1 tests remain green
└── synthetic-audio-stt/
    ├── manifest-validation.test.ts
    ├── dry-run-stt.test.ts
    └── report-generation.test.ts

artifacts/
└── synthetic-audio-stt/     # gitignored local audio/transcripts/reports

src-tauri/
└── unchanged unless a later task explicitly chooses a host boundary
```

**Structure Decision**: Keep fixture metadata and tests in TypeScript so they
reuse MVP 1 contracts. Use `scripts/synthetic-audio-stt.ts` as the first local
harness if implementation needs a command entrypoint. Generated artifacts live
under `artifacts/synthetic-audio-stt/` and must be gitignored. Do not add
Tauri/Rust commands until a desktop side effect or host-secret boundary is
explicitly required by an implementation task.

## Phase 0 Research

Captured in [research.md](research.md).

## Phase 1 Design

Captured in [data-model.md](data-model.md), [contracts/synthetic-audio-stt.md](contracts/synthetic-audio-stt.md), and [quickstart.md](quickstart.md).

## Constitution Check Post-Design

- Human-Centered Outcomes: PASS. Stories produce fixture/STT evidence before manual microphone work.
- Privacy And Data Boundaries: PASS. Artifact policy separates versioned metadata from generated/sensitive data.
- Durable Operational State: PASS. Reports are local evidence, not product storage.
- Spec-Led Incremental Delivery: PASS. Tasks are independently testable and all implementation items remain pending.
- Surface-Appropriate Design: PASS. UI is explicitly observer-only and no UI expansion is planned for closure.

## Complexity Tracking

No constitution violations or justified complexity exceptions.
