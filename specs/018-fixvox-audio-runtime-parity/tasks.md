# Tasks: Fixvox Audio Runtime Parity

**Input**: `specs/018-fixvox-audio-runtime-parity/spec.md`, `plan.md`

**Small Batch Rule**: Execute one story/batch at a time. Stop after verification and update this file/docs if behavior changes.

## Phase 1: Foundations

- [x] T001 Read current capture/runtime paths and Fixvox source references for VAD, mute, auto-stop, compression, and telemetry; record concise findings in `research.md`.
- [x] T002 [P] Add provider-free fixtures/helpers for silence, too-short audio, speech after initial silence, and long audio metadata under `tests/capture/`.
- [x] T003 Define redacted runtime telemetry stage contract for capture/audio-prep/STT/postprocess/delivery in `src/pipeline/types.ts` or adjacent module, with tests asserting no raw transcript/audio fields.

## Phase 2: US1 - Local VAD/no-speech (P1)

**Goal**: Reject unusable audio locally before provider calls.

**Independent Test**: Silence fixture returns no-speech with zero managed transcription path; speech fixture proceeds.

- [x] T004 [US1] Write failing tests in `tests/capture/` for silence, too-short, and speech-after-silence classification.
- [x] T005 [US1] Implement local audio classification in `src/capture/` and/or `src-tauri/src/` with redacted decision output.
- [x] T006 [US1] Integrate local no-speech decision into the capture/pipeline path so provider calls are skipped for no-speech/too-short.
- [x] T007 [US1] Verify with `npm run test:pipeline -- tests/capture tests/desktop-control` and `npm run build`.

## Phase 3: US2 - Auto-stop by silence (P1)

**Goal**: Stop recording automatically after configurable silence.

**Independent Test**: Controlled stream/fixture with speech then silence stops within tolerance; short pause does not stop.

- [x] T008 [US2] Add preferences/contract for auto-stop enablement and silence duration.
- [x] T009 [US2] Write failing controller/session tests for auto-stop, short pauses, and disabled mode.
- [x] T010 [US2] Implement auto-stop state transition without changing manual stop behavior.
- [x] T011 [US2] Verify with focused tests and a gated live smoke plan/script.

## Phase 4: US3 - Long-audio optimization (P2)

**Goal**: Convert/compress long recordings before upload with safe fallback.

**Independent Test**: Long fixture produces smaller optimized artifact or redacted fallback; short fixture skips conversion.

- [x] T012 [US3] Add threshold policy and tests for skip/apply/fail/fallback decisions.
- [x] T013 [US3] Implement optimization path and metadata capture without deleting original audio before fallback decision.
- [x] T014 [US3] Integrate optimized artifact into managed transcription request preview/runtime.
- [x] T015 [US3] Verify with provider-free tests, `npm run build`, and `cd src-tauri && cargo check`.

## Phase 5: US4/US5 - Mute output and sound cues (P2/P3)

**Goal**: Mute output during recording, restore safely, and optionally play small state cues.

**Independent Test**: Host-owned smoke verifies mute/restore on success/cancel/error; cue failures do not affect dictation.

- [x] T016 [US4] Add mute-output preference plumbing from Cloud/user settings to runtime.
- [x] T017 [US4] Add host-owned mute/restore implementation with tests or static guards for restore paths.
- [x] T018 [US5] Add sound cue preference and non-blocking cue requests for start/stop/success/error.
- [x] T019 [US4/US5] Add gated smoke script for mute/restore and cue events.

## Phase 6: US6 - Stage telemetry (P2)

**Goal**: Emit redacted per-stage telemetry for debug and future tuning.

**Independent Test**: Successful and failure runs include required stages and pass redaction assertions.

- [x] T020 [US6] Add telemetry stage tests for successful dictation, no-speech, conversion fallback, and delivery uncertainty.
- [x] T021 [US6] Wire stage telemetry through capture, audio prep, STT, postprocess, and delivery summary.
- [x] T022 [US6] Surface concise telemetry in artifacts/debug output without raw transcript/audio.
- [x] T023 [US6] Run `npm run test:pipeline`, `npm run build`, and `cd src-tauri && cargo check`.

## Phase 7: Docs/Closeout

- [x] T024 Update `docs/WORKING_MEMORY.md` and relevant topics/tracks with final behavior, evidence, commands, and remaining gaps.
- [x] T025 Run `bun scripts/context-index.ts && bun scripts/agent-context-audit.ts`.

## Dependencies & Execution Order

- T001-T003 block all implementation.
- T004-T007 (US1) should complete before T008-T011 (US2), because auto-stop depends on silence classification.
- T012-T015 can start after T003 and may run after or alongside US2 if file ownership is separated.
- T016-T019 touch host side effects and should wait until capture behavior is stable.
- T020-T023 can start once individual stages emit enough data.
