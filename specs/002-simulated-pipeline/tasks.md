# Tasks: Simulated Pipeline

**Input**: Design documents from `specs/002-simulated-pipeline/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required because MVP 1 success criteria require automated verification of successful, failure/recovery, cancellation, and deterministic output paths.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. Execute in Small Batches and stop at checkpoints for verification.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the focused TypeScript test path needed by all pipeline stories.

- [x] T001 Add Vitest dependency and `test:pipeline` script in `package.json` and `package-lock.json`
- [x] T002 Configure pipeline test discovery in `vitest.config.ts`

**Checkpoint**: `npm run test:pipeline` is available and can fail because no tests or pipeline exist yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared contracts and controlled synthetic fixtures before story implementation.

**CRITICAL**: No user story work begins until this phase is complete.

- [x] T003 Create pipeline contract types in `src/pipeline/types.ts`
- [x] T004 [P] Create synthetic simulated dictation fixtures in `src/test-fixtures/simulated-dictation.ts`
- [x] T005 Create fixture lookup helpers in `src/pipeline/fixtures.ts`

**Checkpoint**: Shared types and fixtures exist; no runtime behavior is implemented yet.

---

## Phase 3: User Story 1 - Run A Complete Simulated Dictation Flow (Priority: P1) MVP

**Goal**: A controlled fixture can execute a successful simulated dictation run and produce deterministic final text.

**Independent Test**: `npm run test:pipeline -- tests/pipeline/pipeline-success.test.ts` verifies state order, terminal state `done`, expected output, and no provider/microphone dependency.

### Tests for User Story 1

- [x] T006 [P] [US1] Add success flow test in `tests/pipeline/pipeline-success.test.ts`

### Implementation for User Story 1

- [x] T007 [US1] Implement successful state transition runner in `src/pipeline/pipeline.ts`
- [x] T008 [US1] Implement fixture-backed run entrypoint in `src/pipeline/runner.ts`
- [x] T009 [US1] Verify `npm run test:pipeline -- tests/pipeline/pipeline-success.test.ts` passes

**Checkpoint**: User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 - Observe Failures And Recovery Paths (Priority: P2)

**Goal**: Simulated transcription failure and uncertain delivery paths are observable and do not imply successful delivery.

**Independent Test**: `npm run test:pipeline -- tests/pipeline/pipeline-failure.test.ts` verifies `error`, redacted reasons, `uncertain` delivery, and copy fallback semantics.

### Tests for User Story 2

- [x] T010 [P] [US2] Add failure and recovery tests in `tests/pipeline/pipeline-failure.test.ts`

### Implementation for User Story 2

- [x] T011 [US2] Implement fixture failure modes in `src/pipeline/pipeline.ts`
- [x] T012 [US2] Implement simulated delivery outcomes in `src/pipeline/runner.ts`
- [x] T013 [US2] Implement redacted pipeline errors in `src/pipeline/types.ts` and `src/pipeline/pipeline.ts`
- [x] T014 [US2] Verify `npm run test:pipeline -- tests/pipeline/pipeline-failure.test.ts` passes

**Checkpoint**: User Stories 1 and 2 both pass independently.

---

## Phase 5: User Story 3 - Review Development Evidence (Priority: P3)

**Goal**: Every simulated run exposes an event ledger and derived run summary; cancellation is terminal; overlapping runs are prevented.

**Independent Test**: `npm run test:pipeline -- tests/pipeline/pipeline-cancellation.test.ts` verifies cancellation, active-run overlap prevention, terminal-state rules, event order, and summary derivation.

### Tests for User Story 3

- [x] T015 [P] [US3] Add cancellation, no-overlap, event ledger, and run summary tests in `tests/pipeline/pipeline-cancellation.test.ts`

### Implementation for User Story 3

- [x] T016 [US3] Implement or extract typed pipeline events and summary derivation in `src/pipeline/pipeline.ts` or `src/pipeline/events.ts`
- [x] T017 [US3] Implement `PipelineService`/runner ownership for cancellation, active-run guard, run ids, and observer emission in `src/pipeline/runner.ts` or `src/pipeline/service.ts`
- [x] T018 [US3] Verify `npm run test:pipeline -- tests/pipeline/pipeline-cancellation.test.ts` passes

**Checkpoint**: All user stories are independently functional.

---

## Phase 6: Polish & Verification

**Purpose**: Close MVP 1 without expanding scope.

- [x] T019 Update MVP 1 commands and status in `docs/DEVELOPMENT.md`
- [x] T020 Update active state in `docs/WORKING_MEMORY.md` and relevant topics if behavior changed
- [x] T021 Run `npm run test:pipeline`
- [x] T022 Run `npm run build`
- [x] T023 Run `npm run visual:check`
- [x] T024 Run `$env:CARGO_TARGET_DIR="target-codex-check"; cargo check --manifest-path src-tauri/Cargo.toml` if `src-tauri/` changed
- [x] T025 Run `bun scripts/context-index.ts` and `bun scripts/agent-context-audit.ts`

**Checkpoint**: MVP 1 pipeline is verified and docs are synchronized.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 must complete before Phase 2.
- Phase 2 blocks all user stories.
- User Story 1 is the MVP and should be completed before US2/US3 unless work is split across isolated sessions.
- User Story 2 can start after Phase 2, but final verification should also keep US1 green.
- User Story 3 can start after Phase 2, but final verification should keep US1 and US2 green.
- Phase 6 starts only after desired user stories are complete.

### User Story Dependencies

- **US1 (P1)**: No dependency after Phase 2.
- **US2 (P2)**: Uses shared runner behavior from US1 but remains independently testable through failure fixtures.
- **US3 (P3)**: Uses shared runner behavior from US1 and US2 but remains independently testable through cancellation fixtures.

### Small Batch Gates

- Batch 1: Phase 1 only; close with test command available.
- Batch 2: Phase 2 only; close with type/fixture review.
- Batch 3: US1 only; close with `pipeline-success` test passing.
- Batch 4: US2 only; close with success and failure tests passing.
- Batch 5: US3 only; close with all pipeline tests passing.
- Batch 6: Phase 6 docs/checks only.

### Parallel Opportunities

- T004 can run in parallel with T003 if the fixture author follows the contract names from `contracts/simulated-pipeline.md`.
- T006, T010, and T015 touch separate test files, but should be sequenced by priority unless different sessions are coordinating.
- T019 and T020 can run in parallel after behavior is verified because they touch different docs.

---

## Parallel Example: User Story 1

```text
Task: "T006 [P] [US1] Add success flow test in tests/pipeline/pipeline-success.test.ts"
```

After T006 exists and fails for missing implementation, complete T007 and T008 sequentially because they both define the runner contract.

---

## Implementation Strategy

### MVP First

1. Complete Phase 1.
2. Complete Phase 2.
3. Complete Phase 3 / US1.
4. Stop and validate `npm run test:pipeline -- tests/pipeline/pipeline-success.test.ts`.

### Incremental Delivery

1. Add US1 success flow and verify.
2. Add US2 failure/recovery and verify both US1 and US2.
3. Add US3 cancellation/evidence and verify all pipeline tests.
4. Run Phase 6 to synchronize docs and regression checks.

### Scope Guardrails

- Do not add microphone capture.
- Do not add provider calls or real `ModelGateway` adapters.
- Do not add hotkeys, tray, notification, settings, or product persistence.
- Do not add real selected-text capture.
- Do not add real clipboard insertion or paste observation.
- Keep any UI changes minimal and state-observational; durable app shell or voice dock requires a separate UI task.
- Keep fixture-backed transcription/delivery behind mockable ports/adapters if implementation changes touch those paths.
- Treat `delivered` as simulated delivery only; do not imply real paste observation.
