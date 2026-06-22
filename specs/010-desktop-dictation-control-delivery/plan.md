# Implementation Plan: Desktop Dictation Control And Delivery

**Branch**: `[010-desktop-dictation-control-delivery]` | **Date**: 2026-06-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-desktop-dictation-control-delivery/spec.md`

## Summary

Build a session-level desktop dictation control layer above the existing capture, pipeline, host runtime, and managed Fixvox cloud path. The feature should make dictation controllable and recoverable as one end-to-end session, introduce honest delivery ports, and prepare a minimal host-owned desktop control path without adding unverified paste observation, broad tray/settings work, or provider calls in default checks.

## Technical Context

**Language/Version**: TypeScript strict, React, Vite; Rust 2021; Tauri v2

**Primary Dependencies**: Existing React/Vite app, Tauri commands, `PipelineService`, native capture, host runtime client, Rust `cpal`/`hound`/`reqwest` path from previous specs

**Storage**: In-memory session state for this spec; existing ignored artifacts under `artifacts/microphone-capture/`; existing Fixvox device state in app-data JSON from 009. No durable dictation history.

**Testing**: `npm run test:pipeline`, focused Vitest tests under `tests/`, `npm run build`, `cd src-tauri && cargo check`; optional `npm run visual:check` if UI layout/copy changes.

**Target Platform**: Windows desktop via Tauri v2 first; browser/dev uses fake/unavailable adapters.

**Project Type**: Desktop app with React renderer and Rust/Tauri host.

**Performance Goals**: Control events should update visible state immediately; no avoidable duplicate provider calls; no provider call until capture is stopped and submitted.

**Constraints**:

- Default checks must not call Fixvox/Groq or access real microphone/clipboard/hotkey/focus side effects.
- Managed cloud remains fail-closed; direct Groq remains explicit BYOK/dev fallback only.
- No `paste_observed` claim without a future verified observer contract.
- Minimal Tauri capabilities/dependencies; add desktop plugins only when a task explicitly needs them.
- Do not store transcript history durably in this spec.

**Scale/Scope**: One local desktop user, one active dictation session at a time, first usable desktop-control/delivery slice.

## Constitution Check

- **Human-Centered Outcomes**: Pass. The spec is framed around controlling dictation and safely receiving text.
- **Privacy And Data Boundaries**: Pass with guardrails. Audio/transcripts remain sensitive; default checks avoid provider/desktop side effects; artifacts remain ignored.
- **Durable Operational State**: Pass. No new durable product history is introduced; existing device state remains owned by 009.
- **Spec-Led Incremental Delivery**: Pass. Tasks are split into RED/GREEN batches with independently verifiable checkpoints.
- **Surface-Appropriate Design**: Pass. UI work remains operational and must use existing `PRODUCT.md`/`DESIGN.md` guidance when touched.

## Project Structure

### Documentation (this feature)

```text
specs/010-desktop-dictation-control-delivery/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── desktop-dictation-control-delivery.md
└── tasks.md
```

### Source Code (expected touch points)

```text
src/
├── App.tsx
├── capture/
├── desktop-control/              # new TS session/control contracts if needed
├── delivery/                     # new renderer-safe delivery ports if needed
├── host-runtime/
└── pipeline/

tests/
├── capture/
├── desktop-control/              # new focused provider-free tests
├── host-runtime/
└── runtime-transcription/

src-tauri/
├── Cargo.toml                    # only if a gated desktop plugin/dependency is introduced
├── capabilities/                 # only if a real host command/plugin needs permission
└── src/
    ├── lib.rs
    ├── native_capture.rs
    ├── runtime_transcription.rs
    └── desktop_control.rs        # later host-owned control boundary if needed
```

**Structure Decision**: Start with TypeScript controller/contracts and fake adapters. Only add Rust/Tauri desktop-control modules after provider-free contracts are green and a concrete host side effect is needed.

## Implementation Phases

### Phase 0 - Research Lock

Document decisions from 005/007/009 and fan-out: copy fallback first, no paste observation, managed cloud primary, global hotkey host-owned, tray/background deferred.

### Phase 1 - RED: Provider-Free Contracts

Add tests for session state, no-overlap, fake control events, delivery evidence, and forbidden `paste_observed`. These tests must fail before implementation and must not use real providers or desktop APIs.

### Phase 2 - GREEN: Session Controller

Introduce a `DesktopDictationSession`/controller boundary that orchestrates existing capture, `PipelineService`, host runtime adapter, cancellation, retry, terminal state, and recovery. Keep app buttons wired through this boundary before adding hotkeys.

### Phase 3 - GREEN: Delivery Port And Evidence

Move delivery semantics behind a renderer-safe delivery port. Start with review-only and copy fallback/fake adapters. Keep evidence ledger-derived where feasible and never stronger than proof.

### Phase 4 - GREEN: Desktop Control Boundary

Add fake host control events first. If still valuable, add a minimal Tauri-host command/event path for one fixed toggle shortcut. Do not add settings UI, tray lifecycle, or remapping in the first hotkey batch.

### Phase 5 - Gated Manual Validation

Only with explicit local approval, run any real hotkey/provider/delivery smoke. Evidence must be redacted, artifacts ignored, and no secrets printed.

## Checks

Default safe checks:

```powershell
npm run test:pipeline
npm run build
cd src-tauri && cargo check
```

Additional checks when relevant:

```powershell
npm run visual:check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Gated/local only:

```powershell
# Example only; exact command should be added when a real hotkey/provider smoke exists.
npm run tauri:dev
```

## Privacy / Security

- Audio, transcripts, prompt inputs, request ids, provider payloads, focus/target metadata, and delivery evidence are sensitive by default.
- Do not print or commit `.env`, full device ids, transcripts, audio paths containing private names, provider payloads, or raw desktop target metadata.
- Any cloud/provider use must stay behind explicit UI/action gates and existing managed preflight behavior.
- Any future paste/focus implementation must distinguish sent input from observed insertion.

## Open Questions

- Which fixed shortcut should the first local hotkey smoke use? This can wait until fake event tests pass.
- Should the first real delivery side effect be host clipboard copy, renderer clipboard copy, or no automatic copy? The safe default is review-only plus explicit manual copy.
- Should tray/background be part of this spec or a follow-up after hotkey works? Current plan parks it as P3/future.
