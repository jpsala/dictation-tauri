# Tasks: Runtime Transcription And Delivery

**Input**: Design documents from `specs/005-runtime-transcription-delivery/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required. This feature must cover success, setup failure, provider failure, empty transcript, cancellation, no-overlap, retry/recovery, and delivery uncertainty before implementation is considered complete. Real-provider checks are optional/local/gated and are not CI defaults.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. Execute in Small Batches and stop at checkpoints for verification. This task list intentionally excludes global hotkeys, tray controls, selected-text replacement, durable history, settings expansion, and paste observation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare focused runtime transcription test surfaces and keep artifact/privacy policy explicit without calling real providers.

- [X] T001 Add focused runtime transcription test directory and fixtures in `tests/runtime-transcription/runtime-fixtures.ts`
- [X] T002 [P] Add 005 safe-check notes to `specs/005-runtime-transcription-delivery/quickstart.md`
- [X] T003 [P] Confirm runtime artifacts remain covered by `.gitignore` and document any gap in `specs/005-runtime-transcription-delivery/quickstart.md`

**Checkpoint**: No provider calls, no new dependency, and no tracked real audio/transcripts/payloads/reports.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define typed runtime outcomes, redaction, recovery, and empty-transcript classification before adding provider behavior.

**CRITICAL**: No user story work begins until this phase is complete.

### Tests for Foundation

- [X] T004 [P] Add redaction and runtime outcome tests in `tests/runtime-transcription/runtime-transcription.test.ts`
- [X] T005 [P] Add empty/unusable transcript classification tests in `tests/runtime-transcription/runtime-transcription.test.ts`
- [X] T006 [P] Add recovery action matrix tests in `tests/runtime-transcription/recovery-actions.test.ts`

### Implementation for Foundation

- [X] T007 Create runtime transcription types and helpers in `src/model-gateway/runtime-transcription.ts`
- [X] T008 Implement redacted runtime error mapping in `src/model-gateway/runtime-transcription.ts`
- [X] T009 Implement empty/unusable transcript classification in `src/model-gateway/runtime-transcription.ts`
- [X] T010 Implement recovery action derivation in `src/model-gateway/runtime-transcription.ts`
- [X] T011 Export runtime helpers through existing module paths only where needed in `src/model-gateway/runtime-transcription.ts`
- [X] T012 Verify foundational runtime tests pass without provider credentials or network calls

**Checkpoint**: Typed runtime outcomes compile, tests prove redaction/empty/recovery semantics, and existing capture/pipeline tests still pass.

---

## Phase 3: User Story 1 - Transcribe Captured Dictation (Priority: P1) MVP

**Goal**: A captured audio artifact can be submitted through the runtime transcription boundary and yields transcript text or a clear recoverable setup/provider failure without losing the clip.

**Independent Test**: `npm run test:pipeline -- tests/runtime-transcription/runtime-pipeline.test.ts` verifies success, missing audio, missing provider setup, provider failure, cancellation, and active-run overlap with fake gateways.

### Tests for User Story 1

- [X] T013 [P] [US1] Add captured-clip success runtime pipeline test in `tests/runtime-transcription/runtime-pipeline.test.ts`
- [X] T014 [P] [US1] Add missing/unreadable audio setup failure tests in `tests/runtime-transcription/runtime-pipeline.test.ts`
- [X] T015 [P] [US1] Add provider setup and provider failure tests in `tests/runtime-transcription/runtime-pipeline.test.ts`
- [X] T016 [P] [US1] Add cancellation and active-run no-overlap tests in `tests/runtime-transcription/runtime-pipeline.test.ts`

### Implementation for User Story 1

- [X] T017 [US1] Adapt `createCapturedAudioTranscriptionAdapter` to preserve provider/model/latency/request evidence and redacted failure categories in `src/model-gateway/direct-stt.ts`
- [X] T018 [US1] Route empty runtime transcription results to explicit pipeline failure/recovery semantics in `src/model-gateway/direct-stt.ts`
- [X] T019 [US1] Extend pipeline transcript/STT event evidence only as needed in `src/pipeline/types.ts` and `src/pipeline/events.ts`
- [X] T020 [US1] Verify `npm run test:pipeline -- tests/runtime-transcription/runtime-pipeline.test.ts tests/capture/captured-audio-pipeline.test.ts` passes

**Checkpoint**: US1 is complete when fake/dry-run tests prove captured clip -> typed transcription outcome and no-overlap without real provider calls.

---

## Phase 4: User Story 2 - Recover And Review Text Safely (Priority: P2)

**Goal**: The user can review successful transcript text, copy it manually, and see safe recovery actions for setup/provider/empty/cancelled outcomes.

**Independent Test**: `npm run test:pipeline -- tests/runtime-transcription/recovery-actions.test.ts tests/capture/delivery-evidence.test.ts` verifies recovery for success, setup failure, provider failure, empty transcript, cancellation, and failed/uncertain delivery.

### Tests for User Story 2

- [X] T021 [P] [US2] Add transcript availability/manual-copy recovery tests in `tests/runtime-transcription/recovery-actions.test.ts`
- [X] T022 [P] [US2] Add setup/provider/empty/cancelled recovery tests in `tests/runtime-transcription/recovery-actions.test.ts`
- [X] T023 [P] [US2] Add UI recovery state tests or focused pure helper tests in `tests/capture/delivery-evidence.test.ts`

### Implementation for User Story 2

- [X] T024 [US2] Wire runtime recovery actions into existing app helper state in `src/App.tsx`
- [X] T025 [US2] Render or expose transcript review/manual-copy state without claiming delivery success in `src/App.tsx`
- [X] T026 [US2] Ensure failed transcription preserves captured clip retry guidance in `src/App.tsx` and `src/model-gateway/runtime-transcription.ts`
- [X] T027 [US2] Verify `npm run test:pipeline -- tests/runtime-transcription/recovery-actions.test.ts tests/capture/delivery-evidence.test.ts` passes

**Checkpoint**: US2 is complete when every terminal transcription outcome has a safe next action and successful text can be manually recovered.

---

## Phase 5: User Story 3 - Deliver With Honest Evidence (Priority: P3)

**Goal**: Delivery evidence distinguishes available/copied/failed/uncertain states and never claims paste observation without verified target evidence.

**Independent Test**: `npm run test:pipeline -- tests/runtime-transcription/delivery-evidence.test.ts tests/capture/delivery-evidence.test.ts` verifies delivery available, copied, failed, uncertain, and forbidden paste-observation claims.

### Tests for User Story 3

- [X] T028 [P] [US3] Add runtime delivery availability/copied/failed/uncertain tests in `tests/runtime-transcription/delivery-evidence.test.ts`
- [X] T029 [P] [US3] Add regression test forbidding `paste_observed` in runtime summaries without observation evidence in `tests/runtime-transcription/delivery-evidence.test.ts`

### Implementation for User Story 3

- [X] T030 [US3] Extend delivery evidence derivation for runtime transcript outcomes in `src/pipeline/events.ts`
- [X] T031 [US3] Keep copy fallback evidence as `copied` and unverified sends as `paste_sent` or `uncertain` in `src/App.tsx` and `src/pipeline/events.ts`
- [X] T032 [US3] Verify delivery evidence tests pass and no runtime summary can emit `paste_observed` by default

**Checkpoint**: US3 is complete when delivery evidence is honest for runtime transcription and manual recovery remains available.

---

## Phase 6: Optional Local Real-Provider Verification (Gated)

**Purpose**: Prove one configured local run can transcribe a short captured artifact while keeping secrets/artifacts local and ignored. Execute only with explicit JP approval.

- [ ] T033 [US1] With explicit approval, run one local real-provider transcription against an existing ignored captured clip
- [ ] T034 [US1] Write only redacted evidence under `artifacts/microphone-capture/reports/` and transcript under `artifacts/microphone-capture/transcripts/`
- [ ] T035 [US1] Verify `git status --short --ignored artifacts .env` and `git ls-files artifacts .env` show no tracked secrets/artifacts
- [ ] T036 [US1] Update `specs/005-runtime-transcription-delivery/quickstart.md` with the redacted verification result, without transcript text or secrets

**Checkpoint**: Optional provider evidence is local, redacted, ignored, and not required for CI-safe closure.

---

## Phase 7: Polish & Verification

**Purpose**: Close the feature without expanding desktop side effects or persistence.

- [X] T037 Run `npm run test:pipeline`
- [X] T038 Run `npm run synthetic-audio:stt:dry-run`
- [X] T039 Run `npm run microphone-capture:check`
- [X] T040 Run `npm run microphone-capture:dry-run`
- [X] T041 Run `npm run build`
- [X] T042 Run `npm run visual:check`
- [X] T043 Run `bun scripts/context-index.ts`
- [X] T044 Run `bun scripts/agent-context-audit.ts`
- [X] T045 Inspect `git status --short --ignored` and confirm no real audio, transcripts, provider payloads, reports, or secrets are tracked
- [X] T046 Update `docs/WORKING_MEMORY.md` and relevant docs/topics with 005 status if implementation changes behavior durably

**Checkpoint**: 005 is verified by automated runtime tests, regression checks, docs sync, and honest git/artifact hygiene.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 must complete before Phase 2.
- Phase 2 blocks all user stories.
- User Story 1 is the MVP and should complete before US2/US3.
- User Story 2 depends on US1 transcript/failure outcomes.
- User Story 3 depends on US1/US2 transcript availability and recovery semantics.
- Phase 6 is optional/gated and can run only after US1 is CI-safe.
- Phase 7 starts after the desired implementation scope is complete.

### User Story Dependencies

- **US1 (P1)**: Depends on foundational runtime types/helpers only.
- **US2 (P2)**: Depends on US1 outcome semantics and can be tested with fake summaries.
- **US3 (P3)**: Depends on transcript availability and delivery summaries; remains testable with fake adapters.

### Small Batch Gates

- Batch 1: Planning/design artifacts only; close with generated `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and `tasks.md`.
- Batch 2: Phase 1 + Phase 2 foundational tests/helpers; close with focused Vitest green.
- Batch 3: US1 runtime transcription boundary; close with fake/dry-run runtime pipeline tests green.
- Batch 4: US2 recovery/review UI/helper state; close with recovery tests green.
- Batch 5: US3 delivery evidence; close with no `paste_observed` regression tests green.
- Batch 6: Optional local real-provider verification only with explicit approval.
- Batch 7: Full verification/docs sync.

### Parallel Opportunities

- T002 and T003 can run in parallel after planning because they only inspect/update quickstart/artifact policy.
- T004, T005, and T006 can be authored in parallel after test fixture names are stable.
- T013, T014, T015, and T016 can be authored in parallel because they target separate runtime pipeline scenarios.
- T021, T022, and T023 can be authored in parallel after recovery helper contracts are stable.
- T028 and T029 can be authored in parallel before delivery derivation implementation.
- T037-T045 are independent verification commands but should be reported in order.

---

## Parallel Example: Foundation

```text
Task: "T004 [P] Add redaction and runtime outcome tests in tests/runtime-transcription/runtime-transcription.test.ts"
Task: "T006 [P] Add recovery action matrix tests in tests/runtime-transcription/recovery-actions.test.ts"
```

After tests define the contract, implement `src/model-gateway/runtime-transcription.ts` sequentially to avoid drifting outcome names.

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 setup.
2. Complete Phase 2 foundational runtime types/helpers with tests.
3. Complete Phase 3 / US1 with fake/dry-run provider behavior.
4. Stop and verify without real provider calls.

### Incremental Delivery

1. Add runtime outcome and recovery primitives.
2. Map captured audio transcription through the runtime boundary.
3. Preserve transcript availability separately from delivery.
4. Expose safe manual recovery/copy.
5. Harden delivery evidence.
6. Optionally run local real-provider verification only with explicit approval.

### Scope Guardrails

- Do not call providers by default.
- Do not add broad dependencies or provider SDKs unless a task explicitly justifies it.
- Do not print, commit, or summarize secrets, raw provider diagnostics, real audio, real transcripts, or provider payloads.
- Do not add global hotkeys, tray controls, settings expansion, selected-text capture/replacement, durable history, or paste observation.
- Keep UI changes operational and minimal; durable design work must use `PRODUCT.md`, `DESIGN.md`, and the local `impeccable` skill.
- Preserve unrelated dirty worktree changes, especially preexisting `package.json` and `package-lock.json` edits.
