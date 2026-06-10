# Tasks: Synthetic Audio STT

**Input**: Design documents from `specs/003-synthetic-audio-stt/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required because MVP 2 closes on automated fixture validation, dry-run/mock STT behavior, evidence reports, and preservation of MVP 1 pipeline guarantees. Real-provider checks remain local/conditional when credentials are present.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. Execute in Small Batches and stop at checkpoints for verification. All tasks are pending; this planning batch does not implement runtime behavior.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish artifact policy and command scaffolding without provider calls.

- [X] T001 Add `artifacts/synthetic-audio-stt/` local artifact patterns to `.gitignore`
- [X] T002 Add fixture/STT command placeholders to `package.json` without enabling real provider calls
- [X] T003 Document MVP 2 artifact paths and commands in `docs/DEVELOPMENT.md`

**Checkpoint**: `git status --short --ignored` proves generated artifact paths are ignored; no provider call is possible yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared fixture and gateway contracts before story implementation.

**CRITICAL**: No user story work begins until this phase is complete.

- [X] T004 Create synthetic audio fixture types in `src/test-fixtures/synthetic-audio-manifest.ts`
- [X] T005 [P] Create `ModelGateway` STT contract types in `src/model-gateway/types.ts`
- [X] T006 [P] Create synthetic audio artifact policy helper in `src/test-fixtures/synthetic-audio-artifacts.ts`
- [X] T007 Add dry-run fixture validation test scaffold in `tests/synthetic-audio-stt/manifest-validation.test.ts`

**Checkpoint**: Contracts compile and the manifest validation test can run without audio files, microphone access, provider credentials, or secrets.

---

## Phase 3: User Story 1 - Define Synthetic Audio Fixtures (Priority: P1) MVP

**Goal**: A source-controlled fixture manifest defines repeatable synthetic STT samples and reports missing local audio as setup state.

**Independent Test**: `npm run test:pipeline -- tests/synthetic-audio-stt/manifest-validation.test.ts` verifies manifest shape, expected text, artifact policy, and missing-audio setup reporting.

### Tests for User Story 1

- [X] T008 [P] [US1] Add manifest validation assertions in `tests/synthetic-audio-stt/manifest-validation.test.ts`

### Implementation for User Story 1

- [X] T009 [US1] Add initial synthetic fixture manifest entries in `src/test-fixtures/synthetic-audio-manifest.ts`
- [X] T010 [US1] Implement fixture artifact existence/setup status in `src/test-fixtures/synthetic-audio-artifacts.ts`
- [X] T011 [US1] Wire fixture lookup into existing pipeline fixture helpers in `src/pipeline/fixtures.ts`
- [X] T012 [US1] Verify manifest validation passes without real audio or provider credentials

**Checkpoint**: User Story 1 is functional and testable independently.

---

## Phase 4: User Story 2 - Run Real STT Over Fixtures (Priority: P2)

**Goal**: A local harness can run a fixture through the first direct local `ModelGateway` STT adapter while preserving MVP 1 service ownership and a credential-free dry path.

**Independent Test**: Dry-run tests pass without provider credentials; an optional local real-provider command transcribes one fixture when credentials are present and emits redacted structured output.

### Tests for User Story 2

- [ ] T013 [P] [US2] Add dry-run STT adapter tests in `tests/synthetic-audio-stt/dry-run-stt.test.ts`
- [ ] T014 [P] [US2] Add pipeline integration test for STT result events in `tests/synthetic-audio-stt/dry-run-stt.test.ts`

### Implementation for User Story 2

- [ ] T015 [US2] Implement mock/dry-run gateway adapter in `src/model-gateway/mock.ts`
- [ ] T016 [US2] Implement direct local STT adapter shell in `src/model-gateway/direct-stt.ts`
- [ ] T017 [US2] Add local STT harness entrypoint in `scripts/synthetic-audio-stt.ts`
- [ ] T018 [US2] Connect STT adapter results to `PipelineService` events and summaries in `src/pipeline/service.ts`
- [ ] T019 [US2] Add redacted setup/provider error handling in `src/model-gateway/direct-stt.ts`
- [ ] T020 [US2] Verify dry-run STT tests and `npm run test:pipeline` pass

**Checkpoint**: The dry-run path is green and the optional real-provider command is documented but not required for CI-safe verification.

---

## Phase 5: User Story 3 - Produce Benchmark Evidence (Priority: P3)

**Goal**: Fixture STT runs produce local evidence reports comparing expected text, transcript, optional postprocess output, latency, cost, and artifact paths.

**Independent Test**: `npm run test:pipeline -- tests/synthetic-audio-stt/report-generation.test.ts` verifies local report shape and gitignored artifact location using dry-run data.

### Tests for User Story 3

- [ ] T021 [P] [US3] Add report-generation tests in `tests/synthetic-audio-stt/report-generation.test.ts`

### Implementation for User Story 3

- [ ] T022 [US3] Implement transcript normalization/comparison helper in `src/model-gateway/types.ts` or `src/model-gateway/comparison.ts`
- [ ] T023 [US3] Implement local report writer in `scripts/synthetic-audio-stt.ts`
- [ ] T024 [US3] Include provider/model/latency/cost/artifact metadata in report output
- [ ] T025 [US3] Verify generated reports remain under gitignored `artifacts/synthetic-audio-stt/`

**Checkpoint**: Evidence reports are generated locally from dry-run data and do not become product persistence.

---

## Phase 6: Polish & Verification

**Purpose**: Close MVP 2 implementation without expanding scope.

- [ ] T026 Update `specs/003-synthetic-audio-stt/quickstart.md` with final implemented commands
- [ ] T027 Update `docs/WORKING_MEMORY.md` and relevant topics with MVP 2 implementation status
- [ ] T028 Run `npm run test:pipeline`
- [ ] T029 Run `bun scripts/context-index.ts`
- [ ] T030 Run `bun scripts/agent-context-audit.ts`
- [ ] T031 Run optional local real-provider STT fixture command if credentials and generated audio are present

**Checkpoint**: MVP 2 is verified by fixture validation, dry-run tests, artifact policy, MVP 1 regression, docs sync, and optional real-provider evidence.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 must complete before Phase 2.
- Phase 2 blocks all user stories.
- User Story 1 is the MVP and should complete before US2.
- User Story 2 depends on US1 fixture contracts and uses the gateway contracts from Phase 2.
- User Story 3 depends on US2 run summaries and adapter metadata.
- Phase 6 starts only after the desired stories are complete.

### User Story Dependencies

- **US1 (P1)**: No dependency after Phase 2.
- **US2 (P2)**: Depends on US1 fixture manifest and artifact status.
- **US3 (P3)**: Depends on US2 STT run summaries and adapter metadata.

### Small Batch Gates

- Batch 1: Phase 1 only; close with ignored artifact paths and no provider calls.
- Batch 2: Phase 2 only; close with contracts and scaffold tests.
- Batch 3: US1 only; close with manifest validation green.
- Batch 4: US2 dry-run only; close with `npm run test:pipeline` green.
- Batch 5: US2 optional real-provider evidence; close only when local credentials/audio exist.
- Batch 6: US3 report generation; close with report tests and ignored artifacts.
- Batch 7: Phase 6 docs/checks only.

### Parallel Opportunities

- T005 and T006 can run in parallel after T004 names are agreed.
- T008 can run before T009/T010 as a failing test.
- T013 and T014 touch the same file and should be coordinated, but can be authored before adapter implementation.
- T021 can be prepared while US2 implementation is stabilizing if report contract fields remain unchanged.

---

## Parallel Example: User Story 1

```text
Task: "T008 [P] [US1] Add manifest validation assertions in tests/synthetic-audio-stt/manifest-validation.test.ts"
Task: "T009 [US1] Add initial synthetic fixture manifest entries in src/test-fixtures/synthetic-audio-manifest.ts"
```

After the validation test exists, complete artifact helper work sequentially so missing-audio setup semantics are consistent.

---

## Implementation Strategy

### MVP First

1. Complete Phase 1.
2. Complete Phase 2.
3. Complete Phase 3 / US1.
4. Stop and validate manifest behavior without provider credentials.

### Incremental Delivery

1. Add fixture manifest and artifact policy.
2. Add dry-run gateway path and preserve MVP 1 pipeline tests.
3. Add direct real STT adapter behind local provider configuration.
4. Add local evidence reports and artifact checks.
5. Update quickstart/docs and run closeout checks.

### Scope Guardrails

- Do not add microphone capture.
- Do not add hotkeys, tray, notifications, settings, real selected-text capture, real clipboard insertion, or paste observation.
- Do not add durable product persistence.
- Do not put provider keys or provider calls in React UI.
- Do not call providers in planning/doc-only batches.
- Keep generated audio, transcripts, provider payloads, and reports gitignored by default.
