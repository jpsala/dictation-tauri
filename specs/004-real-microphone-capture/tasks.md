# Tasks: Real Microphone Capture

**Input**: Design documents from `specs/004-real-microphone-capture/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required for capture contracts, fake capture boundaries, pipeline integration, dry-run gateway behavior, delivery evidence, and MVP 1/MVP 2 regression. Real microphone and real-provider checks are manual/optional and are not required for CI-safe closure.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. Execute in Small Batches and stop at checkpoints for verification. All tasks are pending; this planning batch does not implement microphone capture, permissions, Tauri commands, UI, provider calls, or real audio recording.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish local artifact policy, command scaffolding, and docs notes without recording audio or calling providers.

- [X] T001 Add `artifacts/microphone-capture/` local artifact patterns to `.gitignore`
- [X] T002 Add capture command/check placeholders to `package.json` without enabling real microphone or provider calls
- [X] T003 Document MVP 3 artifact paths, no-secret rules, and optional manual checks in `docs/DEVELOPMENT.md`
- [X] T004 [P] Update `specs/004-real-microphone-capture/quickstart.md` with exact planned local paths and CI-safe command names

**Checkpoint**: `git status --short --ignored` proves microphone artifacts are ignored; no command records real audio or calls a provider by default.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define capture contracts, artifact policy, and fake/testable boundaries before any real microphone or UI work.

**CRITICAL**: No user story work begins until this phase is complete.

- [X] T005 Create capture contract types in `src/capture/types.ts`
- [X] T006 [P] Create microphone capture artifact policy helper in `src/capture/artifact-policy.ts`
- [X] T007 [P] Create capture gateway port scaffold in `src/capture/gateway.ts`
- [X] T008 [P] Add capture contract tests with fake streams/artifacts in `tests/capture/capture-contract.test.ts`
- [X] T009 Add capture metadata/event extension tests in `tests/capture/capture-events.test.ts`
- [X] T010 Extend pipeline event/input types for microphone capture evidence in `src/pipeline/events.ts` and `src/pipeline/types.ts`
- [X] T011 Verify capture contract tests run without microphone access, real audio files, provider credentials, or provider calls

**Checkpoint**: Capture contracts compile and tests exercise fake metadata only.

---

## Phase 3: User Story 1 - Capture A Real Dictation Clip (Priority: P1) MVP

**Goal**: The app can expose explicit start/stop capture states and produce one local captured-audio artifact, with fake/testable behavior first and a gated manual WebView spike later.

**Independent Test**: `npm run test:pipeline -- tests/capture/capture-contract.test.ts tests/capture/webview-recorder.test.ts` verifies permission/setup states, no-overlap guard, stop/cancel behavior, metadata shape, and fake artifact creation without requiring repeated manual speech.

### Tests for User Story 1

- [X] T012 [P] [US1] Add WebView recorder adapter tests with mocked `MediaDevices` and `MediaRecorder` in `tests/capture/webview-recorder.test.ts`
- [X] T013 [P] [US1] Add permission/setup state tests in `tests/capture/webview-recorder.test.ts`
- [X] T014 [P] [US1] Add no-overlap and stop/cancel tests in `tests/capture/capture-contract.test.ts`

### Implementation for User Story 1

- [ ] T015 [US1] Implement fake capture gateway for automated tests in `src/capture/fake-gateway.ts`
- [ ] T016 [US1] Implement WebView `MediaRecorder` adapter behind `CaptureGateway` in `src/capture/webview-recorder.ts`
- [ ] T017 [US1] Implement recorder MIME selection and safe extension mapping in `src/capture/webview-recorder.ts`
- [ ] T018 [US1] Implement capture terminal/error state mapping with redacted messages in `src/capture/webview-recorder.ts`
- [ ] T019 [US1] Add minimal app command/state wiring for explicit start/stop capture in `src/App.tsx`
- [ ] T020 [US1] Add permission/setup/listening/stopping/captured/failed/cancelled UI states in `src/App.tsx` and `src/styles.css`
- [ ] T021 [US1] Verify automated capture tests pass without real microphone access

### Manual / Optional Verification for User Story 1

- [ ] T022 [US1] Manually run `npm run tauri:dev` and perform one short real microphone start/stop check, only when JP approves recording local audio
- [ ] T023 [US1] Confirm generated real microphone files remain ignored with `git status --short --ignored`
- [ ] T024 [US1] Document whether WebView2 microphone permission works or requires a future Rust fallback in `specs/004-real-microphone-capture/research.md`

**Checkpoint**: US1 closes for CI-safe implementation when fake/adapter tests pass; manual microphone evidence is optional and gated.

---

## Phase 4: User Story 2 - Transcribe Captured Audio Through The Pipeline (Priority: P2)

**Goal**: Captured audio metadata/artifacts enter the existing `PipelineService` and `ModelGateway` dry-run/direct shell without provider calls by default.

**Independent Test**: `npm run test:pipeline -- tests/capture/captured-audio-pipeline.test.ts tests/synthetic-audio-stt/dry-run-stt.test.ts` verifies capture metadata events, dry-run setup states, redacted errors, terminal summaries, and no provider calls.

### Tests for User Story 2

- [ ] T025 [P] [US2] Add captured-audio pipeline integration tests in `tests/capture/captured-audio-pipeline.test.ts`
- [ ] T026 [P] [US2] Add missing-provider setup tests for captured audio in `tests/capture/captured-audio-pipeline.test.ts`
- [ ] T027 [P] [US2] Add no-overlap capture/run guard tests in `tests/capture/captured-audio-pipeline.test.ts`

### Implementation for User Story 2

- [ ] T028 [US2] Add captured-audio input adapter from `CaptureResult` to pipeline input in `src/pipeline/ports.ts`
- [ ] T029 [US2] Connect capture metadata events to `PipelineService` in `src/pipeline/service.ts`
- [ ] T030 [US2] Extend run summary derivation with `inputKind: "microphone"` and safe capture metadata in `src/pipeline/events.ts`
- [ ] T031 [US2] Route captured audio artifacts through existing `ModelGateway` dry-run/direct shell in `src/model-gateway/direct-stt.ts`
- [ ] T032 [US2] Preserve credential-free dry-run behavior and redacted provider setup states in `src/model-gateway/direct-stt.ts`
- [ ] T033 [US2] Wire captured-run submission from app command state to `PipelineService` in `src/App.tsx`
- [ ] T034 [US2] Verify `npm run test:pipeline` passes without provider credentials or provider calls

### Manual / Optional Verification for User Story 2

- [ ] T035 [US2] Optionally run a real-provider captured-audio transcription only when local credentials, a captured artifact, and explicit JP approval are present
- [ ] T036 [US2] Confirm optional provider output is redacted in logs/reports and no real transcript/audio/provider payload is tracked by git

**Checkpoint**: US2 closes for CI-safe implementation on dry-run pipeline tests; real-provider evidence remains optional/local.

---

## Phase 5: User Story 3 - Deliver Or Recover The Result (Priority: P3)

**Goal**: Completed captured runs expose transcript text availability and honest delivery evidence without claiming paste observation.

**Independent Test**: `npm run test:pipeline -- tests/capture/delivery-evidence.test.ts` verifies `available`, `copied`, `failed`, and `uncertain` states and forbids `paste_observed` unless a verified observation path exists.

### Tests for User Story 3

- [ ] T037 [P] [US3] Add delivery evidence tests for captured runs in `tests/capture/delivery-evidence.test.ts`
- [ ] T038 [P] [US3] Add copy fallback honesty tests in `tests/capture/delivery-evidence.test.ts`
- [ ] T039 [P] [US3] Add failed capture/transcription recovery message tests in `tests/capture/delivery-evidence.test.ts`

### Implementation for User Story 3

- [ ] T040 [US3] Extend delivery evidence types to include captured-run statuses in `src/pipeline/types.ts`
- [ ] T041 [US3] Implement transcript availability summary for captured runs in `src/pipeline/events.ts`
- [ ] T042 [US3] Add copy fallback command/state without paste observation claims in `src/App.tsx`
- [ ] T043 [US3] Render recoverable next actions for capture/transcription/delivery failures in `src/App.tsx`
- [ ] T044 [US3] Verify delivery evidence tests pass and no summary can emit `paste_observed` without verified observation

**Checkpoint**: US3 closes when transcript availability and copy fallback evidence are honest and test-covered.

---

## Phase 6: Polish & Verification

**Purpose**: Close MVP 3 without expanding desktop side effects or persistence.

- [ ] T045 Update `specs/004-real-microphone-capture/quickstart.md` with final implemented commands and manual gates
- [ ] T046 Update `docs/WORKING_MEMORY.md` and relevant topics with MVP 3 implementation status
- [ ] T047 Run `npm run test:pipeline`
- [ ] T048 Run `npm run synthetic-audio:stt:dry-run`
- [ ] T049 Run `npm run build`
- [ ] T050 Run `npm run visual:check`
- [ ] T051 Run `$env:CARGO_TARGET_DIR="target-codex-check"; cargo check --manifest-path src-tauri/Cargo.toml` if `src-tauri/` changed
- [ ] T052 Run `bun scripts/context-index.ts`
- [ ] T053 Run `bun scripts/agent-context-audit.ts`
- [ ] T054 Inspect `git status --short --ignored` and confirm no real audio, real transcripts, provider payloads, or secrets are tracked

**Checkpoint**: MVP 3 is verified by fake capture tests, dry-run pipeline tests, regression checks, ignored artifact paths, docs sync, and optional/manual evidence only when explicitly gated.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 must complete before Phase 2.
- Phase 2 blocks all user stories.
- User Story 1 is the MVP and should complete before US2.
- User Story 2 depends on US1 capture artifacts/metadata and the existing MVP 2 `ModelGateway` shell.
- User Story 3 depends on US2 run summaries and transcript/setup states.
- Phase 6 starts only after the desired user stories are complete.

### User Story Dependencies

- **US1 (P1)**: No dependency after Phase 2; manual real microphone verification is optional and gated.
- **US2 (P2)**: Depends on US1 capture metadata/artifact shape but remains testable with fake artifacts.
- **US3 (P3)**: Depends on US2 captured-run summary fields and remains testable with stubbed transcript/delivery outcomes.

### Small Batch Gates

- Batch 1: Phase 1 only; close with ignored artifact paths and no new real capture/provider behavior.
- Batch 2: Phase 2 only; close with capture contracts and fake-boundary tests.
- Batch 3: US1 fake/adapter tests only; close before any manual microphone check.
- Batch 4: US1 minimal UI/WebView spike; close with automated tests and optional gated manual check.
- Batch 5: US2 dry-run pipeline integration only; close with `npm run test:pipeline` green and no provider calls.
- Batch 6: US2 optional real-provider evidence; run only with explicit approval and local credentials/artifacts.
- Batch 7: US3 delivery evidence; close with no paste-observation claims.
- Batch 8: Phase 6 docs/checks only.

### Parallel Opportunities

- T004 can run in parallel with T001-T003 because it only updates the feature quickstart.
- T006, T007, T008, and T009 can run in parallel after T005 names are stable.
- T012, T013, and T014 can be authored in parallel because they target separate test concerns.
- T025, T026, and T027 can be authored in parallel before pipeline implementation.
- T037, T038, and T039 can be authored in parallel before delivery implementation.
- T045 and T046 can run in parallel after behavior is verified because they touch different docs.

---

## Parallel Example: User Story 1

```text
Task: "T012 [P] [US1] Add WebView recorder adapter tests with mocked MediaDevices and MediaRecorder in tests/capture/webview-recorder.test.ts"
Task: "T014 [P] [US1] Add no-overlap and stop/cancel tests in tests/capture/capture-contract.test.ts"
```

After fake tests define the expected contract, complete WebView adapter and UI state wiring sequentially to avoid drifting permission and capture lifecycle semantics.

---

## Implementation Strategy

### MVP First

1. Complete Phase 1.
2. Complete Phase 2.
3. Complete Phase 3 / US1 through fake and adapter tests.
4. Stop and validate without real microphone access.
5. Run the optional manual microphone check only with explicit approval.

### Incremental Delivery

1. Add artifact policy and docs for microphone capture.
2. Add capture contracts and fake-boundary tests.
3. Add WebView recorder adapter and minimal explicit capture UI.
4. Feed captured metadata/artifacts into `PipelineService` and `ModelGateway` dry-run shell.
5. Add transcript availability and copy fallback evidence.
6. Run closeout checks and docs sync.

### Scope Guardrails

- Do not call providers by default.
- Do not print, commit, or summarize secrets, raw provider diagnostics, real audio, real transcripts, or provider payloads.
- Do not generate or record real audio except in explicitly gated manual tasks.
- Do not add global hotkeys, tray controls, settings UI, selected-text capture, history storage, durable product persistence, or paste observation.
- Do not add broad filesystem access from React.
- Add Tauri commands/capabilities only if a host boundary is required; document any new command before closing that implementation batch.
- Keep UI changes operational and minimal; durable design work must use `PRODUCT.md`, `DESIGN.md`, and the local `impeccable` skill.
