# Tasks: Desktop Dictation Control And Delivery

**Input**: Design documents from `specs/010-desktop-dictation-control-delivery/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/desktop-dictation-control-delivery.md`, `quickstart.md`

**Tests**: Required for every implementation slice. Default tests must remain provider-free and must not register real hotkeys, access real clipboard/focus APIs, or require microphone hardware.

**Organization**: Tasks are grouped by user story. Execute in Small Batches and stop at checkpoints for verification. This task list intentionally keeps real hotkey/tray/paste automation gated or deferred until fake contracts pass.

## Phase 1: Setup And Guardrails

**Purpose**: Establish focused test surfaces and keep provider/desktop side effects out of defaults.

- [x] T001 Add focused desktop-control test directory and fixtures in `tests/desktop-control/desktop-control-fixtures.ts`
- [x] T002 [P] Add import/side-effect guard test proving default tests do not import real desktop hotkey/clipboard adapters in `tests/desktop-control/desktop-side-effect-guard.test.ts`
- [x] T003 [P] Add quickstart safe-check notes to `specs/010-desktop-dictation-control-delivery/quickstart.md` if commands change
- [x] T004 Confirm `.env`, artifacts, transcripts, reports, provider payloads, and any desktop evidence remain ignored/untracked

**Checkpoint**: Provider-free and desktop-side-effect-free test harness exists.

---

## Phase 2: Foundational Contracts (Blocking Prerequisites)

**Purpose**: Define typed session/control/delivery contracts before changing app behavior.

**CRITICAL**: No real hotkey/tray/paste work begins until this phase is complete.

### Tests for Foundation

- [x] T005 [P] Add session state transition tests in `tests/desktop-control/session-controller.test.ts`
- [x] T006 [P] Add non-overlap/control dedupe tests in `tests/desktop-control/session-controller.test.ts`
- [x] T007 [P] Add delivery evidence contract tests forbidding default `paste_observed` in `tests/desktop-control/delivery-evidence.test.ts`
- [x] T008 [P] Add fake control event contract tests in `tests/desktop-control/desktop-control-events.test.ts`

### Implementation for Foundation

- [x] T009 Create desktop control/session types in `src/desktop-control/types.ts`
- [x] T010 Create delivery port types/helpers in `src/delivery/types.ts`
- [x] T011 Implement delivery evidence derivation helpers in `src/delivery/evidence.ts`
- [x] T012 Export only renderer-safe contracts from local module indexes if needed
- [x] T013 Verify foundation tests pass without providers or desktop side effects

**Checkpoint**: Contracts compile and tests prove state, no-overlap, fake events, and delivery evidence semantics.

---

## Phase 3: User Story 1 - Control A Dictation Session End-To-End (Priority: P1) MVP

**Goal**: App controls route through one session controller that owns start/stop/cancel/retry and avoids overlapping capture/runtime/delivery.

**Independent Test**: `npm run test:pipeline -- tests/desktop-control/session-controller.test.ts` verifies start, stop, cancel, retry, terminal states, and no-overlap with fake adapters.

### Tests for User Story 1

- [x] T014 [P] [US1] Add fake start→listening and stop→review success test in `tests/desktop-control/session-controller.test.ts`
- [x] T015 [P] [US1] Add cancellation during capture/transcription/delivery tests in `tests/desktop-control/session-controller.test.ts`
- [x] T016 [P] [US1] Add retry-from-clip and record-again guidance tests in `tests/desktop-control/session-controller.test.ts`
- [x] T017 [P] [US1] Add App/controller seam test proving app controls call the controller path in `tests/desktop-control/app-session-controller.test.ts`

### Implementation for User Story 1

- [x] T018 [US1] Implement `DesktopDictationController` in `src/desktop-control/controller.ts`
- [x] T019 [US1] Adapt existing capture and host-runtime calls behind controller dependencies without changing provider routing
- [x] T020 [US1] Wire `src/App.tsx` start/stop/cancel/submit controls through the controller or a narrow controller facade
- [x] T021 [US1] Preserve existing readiness UI and provider explicit gate while routing session state through the controller
- [x] T022 [US1] Verify focused session/App tests pass

**Checkpoint**: US1 is complete when in-window controls exercise one session lifecycle and no-overlap through fakes.

---

## Phase 4: User Story 2 - Deliver Text With Honest Desktop Evidence (Priority: P1)

**Goal**: Transcript review/manual copy/fake delivery are modeled by a delivery port and evidence is not ad-hoc or overstated.

**Independent Test**: `npm run test:pipeline -- tests/desktop-control/delivery-evidence.test.ts` verifies delivery statuses and forbidden paste observation.

### Tests for User Story 2

- [x] T023 [P] [US2] Add review-only available delivery tests in `tests/desktop-control/delivery-evidence.test.ts`
- [x] T024 [P] [US2] Add fake copy success/failure tests in `tests/desktop-control/delivery-evidence.test.ts`
- [x] T025 [P] [US2] Add fake paste-send tests proving `paste_sent`/`uncertain`, never observed, in `tests/desktop-control/delivery-evidence.test.ts`
- [x] T026 [P] [US2] Add App copy fallback test proving transcript remains visible after delivery failure in `tests/desktop-control/app-delivery.test.ts`

### Implementation for User Story 2

- [x] T027 [US2] Implement review-only and fake/copy delivery adapters in `src/delivery/`
- [x] T028 [US2] Move or wrap current `src/App.tsx` copy fallback semantics behind the delivery port where feasible
- [x] T029 [US2] Feed delivery evidence back into session/pipeline summary without claiming paste observation
- [x] T030 [US2] Verify delivery tests and existing runtime delivery tests pass

**Checkpoint**: US2 is complete when text delivery is recoverable, tested, and never overclaims evidence.

---

## Phase 5: User Story 3 - Minimal Desktop Control Event (Priority: P2)

**Goal**: Fake host control events exercise the same controller path as app buttons; real hotkey remains gated until fake path is green.

**Independent Test**: `npm run test:pipeline -- tests/desktop-control/desktop-control-events.test.ts` verifies fake toggle start/stop and setup failure handling.

### Tests for User Story 3

- [x] T031 [P] [US3] Add fake toggle event starts idle session test in `tests/desktop-control/desktop-control-events.test.ts`
- [x] T032 [P] [US3] Add fake toggle event stops listening session test in `tests/desktop-control/desktop-control-events.test.ts`
- [x] T033 [P] [US3] Add desktop control readiness unavailable test in `tests/desktop-control/desktop-control-events.test.ts`

### Implementation for User Story 3

- [x] T034 [US3] Implement fake host control event adapter in `src/desktop-control/fake-host-control.ts`
- [x] T035 [US3] Expose desktop control readiness through renderer-safe state without registering real shortcuts
- [x] T036 [US3] Wire fake control events to the controller in tests or dev-only harness
- [x] T037 [US3] Verify fake control tests pass

**Checkpoint**: Fake host events prove hotkey semantics before any real OS integration.

---

## Phase 6: User Story 4 - Recover Clearly Across Failures (Priority: P2)

**Goal**: Capture, host runtime, managed preflight, desktop control, and delivery failures produce redacted, actionable recovery.

**Independent Test**: Focused tests fake each failure class and assert next actions.

- [x] T038 [P] [US4] Add failure matrix tests in `tests/desktop-control/recovery.test.ts`
- [x] T039 [US4] Implement recovery mapping extensions in `src/desktop-control/recovery.ts` or existing recovery helper modules
- [x] T040 [US4] Render recovery messages in `src/App.tsx` only as needed for new controller/delivery states
- [x] T041 [US4] Verify recovery tests pass

**Checkpoint**: Every terminal failure has a safe next action and redacted message.

---

## Phase 7: Gated Real Desktop Control Spike (Optional)

**Purpose**: Only after Phases 1-6 are green, optionally validate one host-owned real control path locally.

- [x] T042 [US3] Decide exact fixed shortcut and implementation route before adding dependencies or capabilities
- [x] T043 [US3] Add no-side-effect Rust/TS tests or compile checks for the selected host control boundary
- [x] T044 [US3] Implement minimal host-owned desktop control path in `src-tauri/src/desktop_control.rs` only if approved by the preceding decision
- [x] T045 [US3] Update `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, and `src-tauri/capabilities/` only for the minimal approved route
- [x] T046 [US3] With explicit local approval, run one manual hotkey smoke and record redacted evidence in `specs/010-desktop-dictation-control-delivery/quickstart.md`

**Checkpoint**: Real desktop control is optional, gated, minimal, and redacted.

---

## Phase 8: Polish & Verification

- [x] T047 Run `npm run test:pipeline -- tests/desktop-control`
- [x] T048 Run `npm run test:pipeline`
- [x] T049 Run `npm run build`
- [x] T050 Run `cd src-tauri && cargo check`
- [x] T051 Run `npm run visual:check` if UI text/layout changed
- [x] T052 Run artifact hygiene checks: `git status --short --ignored artifacts .env` and `git ls-files artifacts .env`
- [x] T053 Update `docs/WORKING_MEMORY.md` and relevant topics if behavior/docs changed durably
- [x] T054 Run `bun scripts/context-index.ts` and `bun scripts/agent-context-audit.ts`

**Checkpoint**: 010 has green safe checks, updated tasks, and no tracked secrets/artifacts.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 before implementation.
- Phase 2 blocks all user stories.
- Phase 3 and Phase 4 are both P1; Phase 3 should land first if App wiring would otherwise conflict.
- Phase 5 depends on Phase 3 controller semantics.
- Phase 6 depends on Phase 3/4 terminal state and delivery shapes.
- Phase 7 depends on fake desktop control path being green and requires explicit local approval for manual smoke.
- Phase 8 closes the chosen scope.

### Parallel Opportunities

```text
# Safe explorers/reviewers
Task: inspect App wiring and propose controller seam.
Task: inspect existing runtime delivery tests for reusable assertions.
Task: review no-paste-observed evidence contract.

# Safe workers after ownership is clear
Worker A: tests/desktop-control/session-controller.test.ts only.
Worker B: tests/desktop-control/delivery-evidence.test.ts only.
Worker C: src/delivery/* only after delivery contract tests are fixed.
Worker D: src/desktop-control/* only after session contract tests are fixed.

# Reserved to orchestrator
specs/010-desktop-dictation-control-delivery/*, docs/WORKING_MEMORY.md, package scripts, Cargo dependencies/capabilities, git commits, manual hotkey/provider verification.
```

### Notes

- Do not add real desktop plugins/dependencies in the same batch as controller tests.
- Do not implement selected-text capture, replace-selection, Quick Chat, Assistant Mode, durable history, or full tray/settings in 010 first slices.
- If a task touches `src/App.tsx`, keep the batch small and run focused UI/visual checks.
- If a task becomes large or mixes desktop side effects with controller logic, split it before implementation.
