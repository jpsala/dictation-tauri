# Implementation Plan: Real Microphone Capture

**Branch**: `main` | **Date**: 2026-06-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-real-microphone-capture/spec.md`

## Summary

Plan MVP 3 as the first real microphone milestone: add explicit in-app
start/stop capture, produce a local captured-audio artifact and metadata, and
feed that artifact into the existing `PipelineService`/event-ledger/
`ModelGateway` flow. The first implementation should prove manual capture and
honest delivery evidence; it must not add global hotkeys, tray controls,
selected-text capture, history, settings UI, or durable product persistence.

The preferred first capture route is WebView `getUserMedia` + `MediaRecorder`
behind a `CaptureGateway`/capture adapter contract, because it lets the React
surface request permission and capture a short clip with the least new Rust
surface. A minimal Tauri/Rust command may be added only to persist captured
audio to the documented gitignored local artifact path or to replace WebView
capture if the Windows WebView spike fails. Pipeline state ownership remains in
TypeScript; desktop side effects remain behind explicit host boundaries.

## Technical Context

**Language/Version**: TypeScript 6.0.x, React 19.x, Vite 8.x, Tauri 2.11.x, Rust 1.89.x.

**Primary Dependencies**: Existing React/Vite/Tauri stack, browser `MediaDevices.getUserMedia`, browser `MediaRecorder`, native Rust `cpal` fallback for Windows microphone capture, `hound` for local WAV artifacts, existing `PipelineService`, existing `ModelGateway` dry-run/direct shell, Vitest, Playwright. WebView APIs remain test-covered, but native capture is the active Windows route after the WebView2 permission spike stayed pending.

**Storage**: No product persistence. Captured microphone audio, transcripts, provider payloads, and capture reports are local/gitignored artifacts under `artifacts/microphone-capture/` during development. If app-data storage is introduced later, it must be documented before implementation closes.

**Testing**: `npm run test:pipeline`, MVP 2 dry-run commands, capture adapter unit tests with fake streams/blobs, pipeline integration tests with captured-audio metadata, Playwright/Tauri visual smoke for UI state, optional manual capture check, `bun scripts/context-index.ts`, and `bun scripts/agent-context-audit.ts`.

**Target Platform**: Windows desktop development through the existing Tauri/Vite repo. Cross-platform microphone behavior is not a first-batch requirement, but permission/capability decisions must not block later macOS/Linux support.

**Project Type**: Desktop app with pure TypeScript pipeline domain, React observer/command surface, and Tauri/Rust host boundary for desktop side effects when needed.

**Performance Goals**:

- Start capture state feedback within 300 ms of user action in normal local dev.
- Stop-submit should hand an artifact/metadata object to the pipeline within 1 second after recorder finalization for short clips.
- No fixed provider transcription latency target; measure and report actual latency.

**Constraints**:

- Explicit in-app start/stop only for this feature.
- No global hotkeys, tray controls, settings UI, selected-text capture, history storage, or durable product persistence.
- No provider keys in React UI, docs, git, event output, logs, or assistant responses.
- Captured audio and real transcripts are sensitive local artifacts and must not be committed.
- Preserve MVP 1 lifecycle guarantees and MVP 2 dry-run checks.
- Do not claim paste observation unless it is implemented and verified.
- Any Tauri command/capability added for capture or artifact writing must be minimal and documented.

**Scale/Scope**: One active capture session, one active pipeline run, short dictation clips, one main window, manual app controls, and local development artifacts only.

**Architecture Guardrails**:

- Add a capture port/adapter rather than putting capture lifecycle into `PipelineService` internals.
- Keep UI as a command/observer layer; it may request capture and render state but must not own transcription/provider transitions.
- Extend the event ledger with capture lifecycle evidence; summary remains derived from events.
- Keep delivery evidence explicit: available, copied, paste sent, paste observed, failed, or uncertain.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Human-Centered Outcomes: PASS. MVP 3 targets the first real spoken dictation path while keeping failure/recovery visible.
- Privacy And Data Boundaries: PASS. Real audio/transcripts are local/gitignored, and secrets remain outside React and git.
- Durable Operational State: PASS. No product history or persistence is introduced; artifacts are development evidence only.
- Spec-Led Incremental Delivery: PASS. Planning precedes permissions/capture implementation, and future tasks should split capture, pipeline, UI, and docs.
- Surface-Appropriate Design: PASS. UI scope is operational and minimal: explicit controls plus visible states.

## Project Structure

### Documentation (this feature)

```text
specs/004-real-microphone-capture/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── microphone-capture.md
└── tasks.md             # created by /speckit-tasks, not this batch
```

### Source Code (repository root)

```text
src/
├── capture/
│   ├── types.ts
│   ├── webview-recorder.ts
│   └── artifact-policy.ts
├── pipeline/
│   ├── events.ts
│   ├── ports.ts
│   ├── service.ts
│   └── types.ts
├── model-gateway/
│   ├── direct-stt.ts
│   ├── mock.ts
│   └── types.ts
└── App.tsx

src-tauri/
├── capabilities/
│   └── default.json       # update only when a real command/capability is added
└── src/
    └── lib.rs             # optional minimal artifact persistence command

tests/
├── capture/
│   └── capture-contract.test.ts
├── pipeline/
│   └── existing MVP 1 tests remain green
└── synthetic-audio-stt/
    └── existing MVP 2 checks remain green

artifacts/
└── microphone-capture/     # gitignored local audio/transcripts/reports
```

**Structure Decision**: Add capture-specific TypeScript modules under
`src/capture/` for contracts, pure policy, and WebView recorder adapter.
Use `src-tauri` only for a minimal host command if artifact persistence cannot
remain in-memory or if WebView capture fails. Keep all real audio under
`artifacts/microphone-capture/` during development and gitignored by default.

## Phase 0 Research

Captured in [research.md](research.md).

## Phase 1 Design

Captured in [data-model.md](data-model.md), [contracts/microphone-capture.md](contracts/microphone-capture.md), and [quickstart.md](quickstart.md).

## Constitution Check Post-Design

- Human-Centered Outcomes: PASS. User stories map to visible capture, transcription, and recoverable delivery states.
- Privacy And Data Boundaries: PASS. Data model and quickstart keep real audio/transcripts local and gitignored.
- Durable Operational State: PASS. Capture artifacts are development evidence, not product history.
- Spec-Led Incremental Delivery: PASS. The design supports future task batches for contracts, WebView spike, pipeline integration, UI, and manual verification.
- Surface-Appropriate Design: PASS. The planned UI remains a compact operational desktop dictation control.

## Complexity Tracking

No constitution violations or justified complexity exceptions.
