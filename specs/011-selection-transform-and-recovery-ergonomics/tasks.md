# Tasks: Selection Transform And Recovery Ergonomics

**Input**: Design documents from `specs/011-selection-transform-and-recovery-ergonomics/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/selection-transform-and-recovery.md`, `quickstart.md`

**Tests**: Required for every implementation slice. Default tests must remain provider-free and must not read real selected text, register hotkeys, access real clipboard/focus APIs, send paste keys, or require microphone hardware.

**Organization**: Tasks are grouped by user story. Execute in Small Batches and stop at checkpoints for verification. Real OS selection capture and paste observation remain gated follow-ups.

## Phase 1: Setup And Guardrails

**Purpose**: Establish the spec and keep selection/delivery side effects out of defaults.

- [x] T001 Create `specs/011-selection-transform-and-recovery-ergonomics/spec.md`
- [x] T002 Create `specs/011-selection-transform-and-recovery-ergonomics/plan.md`
- [x] T003 [P] Create research/data-model/contracts/quickstart docs for fixture-first selection transform
- [x] T004 Add or extend side-effect guard tests proving default selection-transform code does not read real selection/clipboard/focus APIs
- [x] T005 Confirm `.env`, artifacts, transcripts, selected-text samples, reports, and provider payloads remain ignored/untracked

**Checkpoint**: 011 documentation and guardrails exist before implementation grows.

---

## Phase 2: Foundational Contracts (Blocking Prerequisites)

**Purpose**: Define typed selection context, transform request/result, routing, and evidence contracts.

**CRITICAL**: No real OS selection capture begins until this phase is complete.

### Tests for Foundation

- [x] T006 [P] Add selection context fixture tests in `tests/selection-transform/selection-context.test.ts`
- [x] T007 [P] Add direct dictation vs selection-transform routing tests in `tests/selection-transform/selection-routing.test.ts`
- [x] T008 [P] Add redaction/secret-looking target evidence tests in `tests/selection-transform/selection-context.test.ts`

### Implementation for Foundation

- [x] T009 Create selection-transform types in `src/selection-transform/types.ts`
- [x] T010 Implement selection context normalization helpers in `src/selection-transform/context.ts`
- [x] T011 Implement selection routing helper in `src/selection-transform/routing.ts`
- [x] T012 Export only renderer-safe contracts from `src/selection-transform/index.ts`
- [x] T013 Verify foundation tests pass without providers or desktop side effects

**Checkpoint**: Contracts compile and tests prove routing, missing selection behavior, and redacted evidence semantics.

---

## Phase 3: User Story 1 - Model Selection Context Without OS Capture (Priority: P1) MVP

**Goal**: Simulate selected text and target metadata through fixtures without reading the desktop.

**Independent Test**: `npm run test:pipeline -- tests/selection-transform/selection-context.test.ts tests/selection-transform/selection-routing.test.ts`

### Tests for User Story 1

- [x] T014 [P] [US1] Add selected text fixture route test in `tests/selection-transform/selection-routing.test.ts`
- [x] T015 [P] [US1] Add no-selection fallback/direct dictation test in `tests/selection-transform/selection-routing.test.ts`
- [x] T016 [P] [US1] Add long/empty/whitespace selected text normalization tests in `tests/selection-transform/selection-context.test.ts`

### Implementation for User Story 1

- [x] T017 [US1] Implement fixture `SelectionContext` helpers in `src/selection-transform/context.ts`
- [x] T018 [US1] Implement direct-vs-transform route classification in `src/selection-transform/routing.ts`
- [x] T019 [US1] Verify US1 focused tests pass

**Checkpoint**: Selection-aware routing can be exercised with synthetic fixtures only.

---

## Phase 4: User Story 2 - Transform Selected Text With Safe Presets (Priority: P1)

**Goal**: Provide deterministic provider-free transform presets before managed postprocess.

**Independent Test**: `npm run test:pipeline -- tests/selection-transform/fixture-transform.test.ts`

### Tests for User Story 2

- [x] T020 [P] [US2] Add rewrite preset fixture test in `tests/selection-transform/fixture-transform.test.ts`
- [x] T021 [P] [US2] Add shorten preset fixture test in `tests/selection-transform/fixture-transform.test.ts`
- [x] T022 [P] [US2] Add unsupported preset recovery test in `tests/selection-transform/fixture-transform.test.ts`

### Implementation for User Story 2

- [x] T023 [US2] Implement fixture transform presets in `src/selection-transform/fixture-transform.ts`
- [x] T024 [US2] Attach transform evidence and recovery actions without provider calls
- [x] T025 [US2] Verify preset tests pass

**Checkpoint**: Fixture transforms prove the selection transform shape without cloud/provider calls.

---

## Phase 5: User Story 3 - Reuse The Last Result Ephemerally (Priority: P2)

**Goal**: Keep/reuse the latest output in memory for recovery without durable history.

**Independent Test**: `npm run test:pipeline -- tests/desktop-control/app-delivery.test.ts`

### Tests for User Story 3

- [x] T026 [P] [US3] Add safe paste-last recovery evidence test in `tests/desktop-control/app-delivery.test.ts`
- [x] T027 [P] [US3] Add no-latest-result recovery test in `tests/desktop-control/app-delivery.test.ts` or a focused App seam test

### Implementation for User Story 3

- [x] T028 [US3] Implement safe paste-last recovery helper in `src/App.tsx`
- [x] T029 [US3] Add safe paste-last UI affordance disabled until transcript exists in `src/App.tsx`
- [x] T030 [US3] Verify focused App delivery tests pass

**Checkpoint**: Paste-last recovery is UI/evidence-only, sends no keys, and never claims paste observation.

---

## Phase 6: User Story 4 - Recovery UI Makes Uncertain Delivery Actionable (Priority: P2)

**Goal**: Make failed/uncertain delivery states clearer while preserving review/copy fallback.

**Independent Test**: focused App delivery tests plus `npm run visual:check` if layout changes.

### Tests for User Story 4

- [x] T031 [P] [US4] Add recovery UI test for delivery failure preserving review and copy fallback in `tests/desktop-control/app-delivery.test.ts` or visual tests
- [x] T032 [P] [US4] Add visual smoke assertion that initial app does not claim paste observed in `tests/visual/app-smoke.spec.ts`

### Implementation for User Story 4

- [x] T033 [US4] Render latest-result recovery copy in `src/App.tsx` when transcript review exists
- [x] T034 [US4] Refine compact recovery action row if needed in `src/styles.css`
- [x] T035 [US4] Verify recovery-focused tests and visual checks pass

**Checkpoint**: Users see actionable recovery without confidence theater.

---

## Phase 7: Gated Real Selection Capture Design (Optional)

**Purpose**: Only after fixture selection contracts are green, decide a minimal host-owned selection capture route.

- [x] T036 [US1] Decide real Windows selection capture route and failure behavior before adding dependencies/capabilities
- [x] T037 [US1] Add no-side-effect Rust/TS boundary tests or compile checks for selected route
- [x] T038 [US1] Implement minimal host-owned selection capture command boundary only if approved by the preceding decision
- [ ] T039 [US1] With explicit local approval, run one manual selection capture smoke and record redacted evidence in `quickstart.md`

**Checkpoint**: Real selection capture remains optional, gated, minimal, and redacted.

---

## Phase 8: Polish & Verification

- [x] T048 Add latest-result helper/tests for in-memory dictation and selection-transform recovery without durable history
- [x] T049 Wire copy/paste-last App recovery paths to the latest-result helper so failed or empty runs cannot become reusable results
- [x] T040 Run `npm run test:pipeline -- tests/selection-transform tests/desktop-control/app-delivery.test.ts`
- [x] T041 Run `npm run test:pipeline`
- [x] T042 Run `npm run build`
- [x] T043 Run `cd src-tauri && cargo check`
- [x] T044 Run `npm run visual:check` if UI text/layout changed
- [x] T045 Run artifact hygiene checks: `git status --short --ignored artifacts .env` and `git ls-files artifacts .env`
- [x] T046 Update `docs/WORKING_MEMORY.md` and relevant topics if behavior/docs changed durably
- [x] T047 Run `bun scripts/context-index.ts` and `bun scripts/agent-context-audit.ts`

**Checkpoint**: 011 selected scope has green safe checks, updated tasks, and no tracked secrets/artifacts.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 before implementation.
- Phase 2 blocks fixture transform stories.
- Phase 3 and Phase 4 are P1; Phase 3 should land before transform presets.
- Phase 5 can land independently using existing 010 delivery evidence.
- Phase 6 depends on existing recovery/delivery UI state.
- Phase 7 depends on Phase 2/3 and requires explicit approval for real OS capture.
- Phase 8 closes the chosen scope.

### Parallel Opportunities

```text
# Safe explorers/reviewers
Task: inspect Windows selection capture options without editing. Done for T036: selected host-owned non-mutating Windows UI Automation first route; clipboard roundtrip deferred behind a separate gate.
Task: inspect Fixvox selection transform prompts/fixtures without copying sensitive data.
Task: review recovery UI copy against PRODUCT.md/DESIGN.md.

# Safe workers after ownership is clear
Worker A: tests/selection-transform/selection-context.test.ts only.
Worker B: src/selection-transform/* only after tests are written.
Worker C: tests/desktop-control/app-delivery.test.ts only.
Worker D: visual smoke tests only.

# Reserved to orchestrator
specs/011-selection-transform-and-recovery-ergonomics/*, docs/WORKING_MEMORY.md, package scripts, Cargo dependencies/capabilities, git commits, manual provider/desktop verification.
```

### Notes

- 2026-06-24: T038 implemented only the explicit Tauri command boundary `capture_selection_context`, registered in `src-tauri/src/lib.rs`. It returns typed redacted outcomes and target metadata without invoking from the renderer by default. The Windows path intentionally remains non-mutating and returns `no_selection` until a separate approved UI Automation selected-text reader/smoke is done; T039 remains open.
- Do not add real selection capture, paste automation, focus APIs, or clipboard mutation in the same batch as selection contracts.
- Do not implement Quick Chat, Assistant Mode, `Alt+Q`, durable history, preset settings, or full tray/background in 011 first slices.
- If a task touches `src/App.tsx`, keep the batch small and run focused UI/visual checks.
- If a task becomes large or mixes desktop side effects with fixture transforms, split it before implementation.
