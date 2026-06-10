# Implementation Plan: Simulated Pipeline

**Branch**: `main` | **Date**: 2026-06-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-simulated-pipeline/spec.md`

## Summary

Create MVP 1 as a deterministic simulated dictation pipeline that can run from
controlled fixtures and mock transcription/delivery results before any real
audio, provider, hotkey, tray, clipboard insertion, or product persistence work.

The implementation will keep the core pipeline in TypeScript so it can be
tested without Tauri/Rust or browser state. The runtime should expose a
service/runner contract that owns active runs, cancellation, event emission, and
summary derivation. A minimal React development surface may observe the same
pipeline events, but the first closure condition is an automated runner/test
path with success, failure, cancellation, no-overlap, and uncertain delivery
cases.

## Technical Context

**Language/Version**: TypeScript 6.0.x, React 19.x, Rust 1.89.x remains present for Tauri shell but is not part of MVP 1 pipeline logic.

**Primary Dependencies**: Existing React/Vite/Tauri stack; add a lightweight TypeScript test runner in the Vite ecosystem for deterministic pipeline tests.

**Storage**: N/A for product storage. Fixtures are static source artifacts. Run summaries are in-memory/test output only unless a later decision defines artifact retention.

**Testing**: `npm run build`, existing `npm run visual:check`, new pipeline test command, and `bun scripts/agent-context-audit.ts`. `cargo check` remains a regression gate when Tauri files are touched.

**Target Platform**: Windows desktop development through the existing Tauri/Vite project; pipeline tests must run without desktop permissions.

**Project Type**: Desktop app with pure TypeScript domain pipeline and optional React observation surface.

**Performance Goals**: Successful simulated run completes in under 5 seconds locally; deterministic tests should complete quickly enough for routine Small Batch verification.

**Constraints**:

- No microphone access.
- No external STT/LLM/provider calls.
- No provider keys or `.env` requirement.
- No hotkeys, tray, settings, notification, real selected-text capture, real clipboard insertion, or product persistence.
- No Rust/Tauri command contract unless implementation proves the pipeline must cross the desktop boundary in MVP 1.
- State must be observable and testable.

**Scale/Scope**: One simulated dictation pipeline, a small controlled fixture set, success/failure/cancellation/uncertain-delivery paths, and developer-facing evidence for one run at a time.

**Architecture Guardrails**:

- Keep UI out of transition ownership; UI can dispatch run/cancel commands and observe events.
- Use mockable ports/adapters for transcription and delivery even while backed by fixtures.
- Use an event ledger as primary evidence and derive run summaries from it.
- Add no Tauri/Rust commands or capabilities until a desktop side effect is required.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Human-Centered Outcomes: PASS. The plan validates the user's dictation workflow before manual voice testing.
- Privacy And Data Boundaries: PASS. No real audio, transcript history, provider call, `.env`, or durable product storage is introduced.
- Durable Operational State: PASS. Run state is in-memory/test output; fixtures are source-controlled only when synthetic and non-sensitive.
- Spec-Led Incremental Delivery: PASS. This plan prepares MVP 1 after spec and before tasks/implementation.
- Surface-Appropriate Design: PASS. Any UI remains compact, state-first, and governed by `PRODUCT.md` and `DESIGN.md`.

## Project Structure

### Documentation (this feature)

```text
specs/002-simulated-pipeline/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── simulated-pipeline.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── App.tsx
├── main.tsx
├── styles.css
├── pipeline/
│   ├── events.ts
│   ├── fixtures.ts
│   ├── pipeline.ts
│   ├── ports.ts
│   ├── runner.ts
│   ├── service.ts
│   └── types.ts
└── test-fixtures/
    └── simulated-dictation.ts

tests/
├── pipeline/
│   ├── pipeline-success.test.ts
│   ├── pipeline-failure.test.ts
│   └── pipeline-cancellation.test.ts
└── visual/
    └── app-smoke.spec.ts

src-tauri/
└── unchanged for MVP 1 unless a later task explicitly needs desktop wiring
```

**Structure Decision**: Keep MVP 1 pipeline logic in `src/pipeline/` as pure
TypeScript and keep controlled fixtures in `src/test-fixtures/`. Place tests in
`tests/pipeline/` so product-flow checks are separate from Playwright visual
checks. If the current implementation remains simpler, `events.ts`, `ports.ts`,
and `service.ts` may start folded into existing files, but the public contract
must still behave as service + ports + event ledger. Do not add Tauri/Rust
commands, persistence, provider routing, or real desktop delivery in this
feature.

## Phase 0 Research

Captured in [research.md](research.md).

## Phase 1 Design

Captured in [data-model.md](data-model.md), [contracts/simulated-pipeline.md](contracts/simulated-pipeline.md), and [quickstart.md](quickstart.md).

## Constitution Check Post-Design

- Human-Centered Outcomes: PASS. User-visible trust concerns are modeled through state and recovery paths.
- Privacy And Data Boundaries: PASS. Controlled synthetic fixtures only; no real audio or provider calls.
- Durable Operational State: PASS. No product persistence; run summaries are transient verification artifacts.
- Spec-Led Incremental Delivery: PASS. Tasks must split success path, failure/recovery path, cancellation, and docs verification into Small Batches.
- Surface-Appropriate Design: PASS. UI remains optional/minimal and must follow `PRODUCT.md`/`DESIGN.md`.

## Complexity Tracking

No constitution violations or justified complexity exceptions.
