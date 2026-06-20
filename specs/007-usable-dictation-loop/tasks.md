# Tasks: Usable Dictation Loop

**Input**: Design documents from `specs/007-usable-dictation-loop/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/usable-dictation-loop.md`, `quickstart.md`

**Tests**: Required. UI host-client wiring must be covered with fake/unavailable host clients and provider-free import guard before any real provider work. Real provider calls remain manual/gated and never run in default checks.

**Organization**: Tasks are grouped by user story and deliberately split UI wiring from real host-provider implementation. Do not implement broad desktop ergonomics in this spec.

## Phase 1: Setup And Guardrails

**Purpose**: Establish focused 007 test surfaces and preserve provider-free defaults.

- [X] T001 Add/adjust focused 007 host-client UI tests in `tests/host-runtime/` for the production mapping path
- [X] T002 Update visual smoke expectations if UI copy changes from "STT shell" to "host transcription"
- [X] T003 Confirm provider-free import guard still protects `src/App.tsx`
- [X] T004 Confirm `.env`, artifacts, transcripts, reports, and provider payloads remain ignored/untracked in 007 checks

**Checkpoint**: Tests describe the desired UI host-client behavior before production UI wiring changes.

---

## Phase 2: User Story 1 - Run Dictation Through Host Client (Priority: P1)

**Goal**: Captured artifacts submitted from the UI go through `HostRuntimeClient`, not the old direct-local STT shell.

**Independent Test**: Fake host client success maps to transcript review and copy availability without provider imports in `src/App.tsx`.

### Tests for User Story 1

- [X] T005 [P] [US1] Add/extend fake host success UI/pipeline test proving transcript review, provider/model/latency, and `available` delivery evidence
- [X] T006 [P] [US1] Add unavailable host fallback test proving setup guidance and retryable clip state
- [X] T007 [P] [US1] Add provider failure mapping test proving retry recovery and redacted diagnostics

### Implementation for User Story 1

- [X] T008 [US1] Create or extract a production host-client transcription adapter that maps `HostTranscriptionResponse` into the `PipelineService` transcription adapter shape
- [X] T009 [US1] Replace `src/App.tsx` direct-local STT shell adapter with host-client adapter wiring
- [X] T010 [US1] Update submit/status copy in `src/App.tsx` from credential-free STT shell language to honest host transcription language
- [X] T011 [US1] Verify focused host-runtime tests pass without provider calls

**Checkpoint**: The UI submission path uses `HostRuntimeClient`; while Rust is still a stub, the app shows setup-needed instead of direct-local shell behavior.

---

## Phase 3: User Story 2 - Inspect Host Readiness From The App (Priority: P1)

**Goal**: The app displays host transcription readiness/setup state without reading secrets or blocking capture.

**Independent Test**: Mock readiness outcomes and verify UI labels for configured/unconfigured host state.

### Tests for User Story 2

- [X] T012 [P] [US2] Add readiness configured UI test with provider/model labels and no secret leakage
- [X] T013 [P] [US2] Add readiness unavailable/setup-error UI test with redacted guidance
- [X] T014 [P] [US2] Add readiness failure fallback test proving capture remains available

### Implementation for User Story 2

- [X] T015 [US2] Add host runtime selection helper for Tauri invoke vs browser unavailable client
- [X] T016 [US2] Load/refresh readiness in `src/App.tsx` through `HostRuntimeClient.getReadiness()`
- [X] T017 [US2] Render compact readiness evidence in the status grid or nearby setup line following `PRODUCT.md`/`DESIGN.md`
- [X] T018 [US2] Verify UI/readiness tests and provider-free guard pass

**Checkpoint**: Users can see why transcription is or is not ready before submitting a captured run.

---

## Phase 4: User Story 4 - Copy Recovered Text Honestly (Priority: P3)

**Goal**: Manual copy remains reliable and delivery evidence stays honest.

**Independent Test**: Copy success/failure tests prove transcript remains recoverable and no paste observation is claimed.

### Tests for User Story 4

- [X] T019 [P] [US4] Add copy fallback success test for host transcript summaries
- [X] T020 [P] [US4] Add clipboard unavailable/failure test keeping transcript review visible
- [X] T021 [P] [US4] Add guard/assertion that UI summaries do not contain `paste_observed`

### Implementation for User Story 4

- [X] T022 [US4] Adjust copy fallback copy/status only if host-client summary shape requires it
- [X] T023 [US4] Verify copy fallback tests pass

**Checkpoint**: Successful transcripts can be copied manually and failures remain recoverable.

---

## Phase 5: User Story 3 - Real Host Provider Path (Priority: P2, Gated)

**Goal**: Replace the Rust unavailable stub with an explicitly gated host-side real-provider implementation.

**CRITICAL**: Do not begin this phase until UI host-client wiring is green and the implementation route is chosen. This phase may require explicit JP approval before real provider verification.

### Tests/Design for User Story 3

- [X] T024 [US3] Decide and document host-provider implementation route: native Rust HTTP/multipart vs local host-side script/sidecar reuse
- [X] T025 [P] [US3] Add no-provider-call unit/smoke tests for real host path setup errors, missing audio, path validation, empty transcript, provider failure, and redaction
- [X] T026 [P] [US3] Add artifact write/read tests or command smoke proving reports/transcripts stay under allowed roots

### Implementation for User Story 3

- [X] T027 [US3] Implement selected host-provider path behind explicit local gating with no default provider calls
- [X] T028 [US3] Ensure `get_runtime_transcription_readiness` reports configured/unconfigured state from host-side config without exposing secrets
- [X] T029 [US3] Ensure `transcribe_captured_audio` validates paths before reads and returns typed host responses
- [X] T030 [US3] Run CI-safe checks without provider calls
- [X] T031 [US3] If JP approves, run one local real-provider verification on an ignored WAV artifact and record only redacted evidence

**Checkpoint**: The app can transcribe one captured WAV through the host boundary when explicitly configured and approved, while default checks remain safe.

---

## Phase 6: Polish & Verification

**Purpose**: Close 007 without secrets, false delivery claims, or unrelated desktop ergonomics.

- [X] T032 Run `npm run test:pipeline -- tests/host-runtime`
- [X] T033 Run `npm run test:pipeline`
- [X] T034 Run `npm run build`
- [X] T035 Run `cd src-tauri && cargo check`
- [X] T036 Run `npm run visual:check` if UI text/layout changed
- [X] T037 Run `git status --short --ignored artifacts .env` and `git ls-files artifacts .env`
- [X] T038 Update `docs/WORKING_MEMORY.md` and relevant docs/topics with 007 status if behavior/docs changed durably
- [X] T039 Run `bun scripts/context-index.ts` and `bun scripts/agent-context-audit.ts`

**Checkpoint**: 007 is verified by host-runtime/UI tests, build checks, artifact hygiene, and docs sync.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 before implementation.
- Phase 2 can start after tests in Phase 1 define UI host-client behavior.
- Phase 3 depends on host runtime selection/helper from Phase 2 or can be implemented in the same small batch if kept small.
- Phase 4 depends on host transcript summary shape from Phase 2.
- Phase 5 depends on Phases 2-4 being green and requires an explicit route decision.
- Phase 6 closes the chosen scope.

### Parallel Examples

```text
# Safe explorers
Task: inspect exact App test/visual updates needed for host-client wiring.
Task: inspect Rust provider implementation route options without editing.

# Safe workers only after ownership is clear
Worker A: tests/host-runtime host-client UI mapping tests only.
Worker B: src/host-runtime adapter/helper only.
Worker C: src/App.tsx only after tests/helper contract is fixed.

# Reserved to orchestrator
specs/007-usable-dictation-loop/*, docs/WORKING_MEMORY.md, package scripts, git commits, real provider verification.
```

### Notes

- Do not commit `.env`, artifacts, transcripts, provider payloads, or real reports.
- Do not add provider SDK/dependencies in the UI wiring batch.
- Do not add hotkeys, tray, selected text, history, settings expansion, or paste observation in 007 first slices.
- If a task becomes large, split it before implementation and close one checkpoint at a time.
