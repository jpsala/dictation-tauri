# Implementation Plan: Selection Transform And Recovery Ergonomics

**Branch**: `[011-selection-transform-and-recovery-ergonomics]` | **Date**: 2026-06-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-selection-transform-and-recovery-ergonomics/spec.md`

## Summary

Add early post-MVP selection-transform and recovery ergonomics without jumping straight to real OS selection capture. Start with renderer-safe contracts, fixture-backed selected text, provider-free transform presets, ephemeral latest-result state, and clearer recovery UI. Real selection capture, paste observation, preset settings, and durable history stay gated follow-ups.

## Technical Context

**Language/Version**: TypeScript strict, React, Vite; Rust 2021; Tauri v2

**Primary Dependencies**: Existing React/Vite app, 010 desktop controller/delivery contracts, `PipelineService`, host runtime client, Tauri invoke boundary. No new dependency required for first selection/recovery slices.

**Storage**: In-memory latest result only. No durable result history, no settings store, no selection text persistence.

**Testing**: `npm run test:pipeline` and focused Vitest tests under `tests/desktop-control` or new `tests/selection-transform`; `npm run build`; `cd src-tauri && cargo check`; `npm run visual:check` if UI layout changes.

**Target Platform**: Windows desktop via Tauri v2 first; browser/dev uses fixtures and unavailable/fake adapters.

**Project Type**: Desktop app with React renderer and Rust/Tauri host.

**Performance Goals**: Selection routing and latest-result UI updates should be immediate; provider-free transform fixtures should run within the existing Vitest suite.

**Constraints**:

- Default checks must not read real OS selection, clipboard/focus targets, microphone, or providers.
- Do not claim paste observation; reuse 010 delivery evidence semantics.
- Do not persist selected text or result history in this spec.
- Keep React provider-free; managed/provider postprocess must remain behind host/runtime gates.
- Avoid broad App refactors unless needed for a focused UI test.

**Scale/Scope**: One local desktop user, one active dictation/transform session at a time, first selection-aware slice.

## Constitution Check

- **Human-Centered Outcomes**: Pass. The feature improves recoverability and prepares contextual writing.
- **Privacy And Data Boundaries**: Pass with guardrails. Selected text is sensitive and starts fixture-only; latest result is ephemeral.
- **Durable Operational State**: Pass. No durable history/settings are introduced.
- **Spec-Led Incremental Delivery**: Pass. Tasks must start with contracts/tests and proceed in small batches.
- **Surface-Appropriate Design**: Pass. UI changes must follow `PRODUCT.md` and `DESIGN.md`.

## Project Structure

### Documentation (this feature)

```text
specs/011-selection-transform-and-recovery-ergonomics/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   └── selection-transform-and-recovery.md
├── quickstart.md
└── tasks.md
```

### Source Code (expected touch points)

```text
src/
├── App.tsx                         # only for focused latest-result/recovery UI slices
├── desktop-control/                # reuse controller/recovery types where possible
├── delivery/                       # reuse evidence; no paste_observed expansion
├── selection-transform/            # new renderer-safe contracts/fixtures if needed
└── pipeline/                       # only if routing summary needs selection context

tests/
├── desktop-control/                # recovery/latest-result UI tests if App seam is reused
└── selection-transform/            # provider-free selection context and preset tests
```

**Structure Decision**: Start with a new `src/selection-transform/` module for contracts, fixture transforms, and routing helpers. Keep UI wiring small and reuse `src/delivery` evidence types. Do not add Rust modules for real selection capture until fixture contracts are green.

## Implementation Phases

### Phase 0 - Research Lock

Record decisions: selection real was outside MVP 0-3; early post-MVP starts with fixtures/contracts; latest result is ephemeral; recovery UI builds on 010 evidence.

### Phase 1 - RED: Selection Contracts And Routing

Add provider-free tests for `SelectionContext`, direct vs selection-transform routing, redaction, and unsupported/missing selection behavior.

### Phase 2 - GREEN: Fixture Transform Presets

Implement deterministic fixture-backed presets (`rewrite`, `shorten`, `bulletize` or equivalent) with evidence and recovery. No provider calls.

### Phase 3 - GREEN: Latest Result And Recovery UI

Add ephemeral latest-result state and focused UI tests for copy-last/recovery after delivery failure. Preserve review text.

### Phase 4 - Gated Host Selection Capture Design

Only after phases 1-3 pass, decide a real host capture route. This phase is design/contract-only unless explicitly approved for OS side effects.

### Phase 5 - Verification

Run focused tests, full `npm run test:pipeline`, `npm run build`, `cd src-tauri && cargo check`, visual check if UI changes, context index/audit if docs changed.

## Checks

Default safe checks:

```powershell
npm run test:pipeline
npm run build
cd src-tauri && cargo check
```

Additional checks when relevant:

```powershell
npm run test:pipeline -- tests/selection-transform
npm run visual:check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Gated/local only:

```powershell
# Future only: real selection capture or paste automation smoke requires explicit approval.
npm run tauri:dev
```

## Privacy / Security

- Selected text, transformed text, transcripts, targets, and recovery logs are sensitive.
- Fixture text can be versioned only when it is synthetic/non-sensitive.
- Do not print raw selection or transcripts in docs; tests may contain synthetic fixture strings.
- Latest result is in-memory only and should clear on reload/process restart.
- Any future provider transform must redact request ids, payloads, and secret-looking strings before UI display.

## Open Questions

- Which real Windows selection capture route is reliable enough for later: clipboard roundtrip, UI Automation, focused-control APIs, or app-specific adapters?
- Should selection transform default to replace-selection, insert-after-selection, or copy result when target confidence is low?
- Which presets become product defaults before settings exist?
