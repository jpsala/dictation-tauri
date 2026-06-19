# Tasks: Host Runtime Transcription Boundary

**Input**: Design documents from `specs/006-host-runtime-transcription-boundary/`

**Prerequisites**: `spec.md`, `plan.md`, `contracts/host-runtime-transcription.md`

**Tests**: Required. Host boundary work must prove readiness, path validation, dry-run behavior, fake real-provider success/failure, redaction, and no provider calls in default scripts before any UI wiring.

**Organization**: Tasks are grouped by user story and intentionally defer broad UI/provider wiring, hotkeys, tray, selected text, and paste observation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create focused host-runtime test surfaces and keep AOS/dirty-worktree separation explicit.

- [X] T001 Add focused host-runtime test directory and fixtures in `tests/host-runtime/`
- [X] T002 Add safe-check notes for host runtime boundary to `specs/006-host-runtime-transcription-boundary/quickstart.md`
- [X] T003 Confirm `.env`, artifacts, transcripts, reports, and provider payloads remain ignored/untracked in 006 checks
- [X] T004 Preserve unrelated AOS `.agents/.pi` dirty work until JP explicitly decides whether to commit or revert it

**Checkpoint**: No provider calls, no secrets read by tests, and no AOS migration mixed into product commits.

---

## Phase 2: Foundational Host Boundary (Blocking Prerequisites)

**Purpose**: Define typed host runtime contracts, artifact path policy, config/readiness mapping, and redaction before wiring any UI/Tauri command.

**CRITICAL**: No user story work begins until this phase is complete.

### Tests for Foundation

- [X] T005 [P] Add host artifact path validation tests in `tests/host-runtime/artifact-policy.test.ts`
- [X] T006 [P] Add host readiness redaction/config tests in `tests/host-runtime/readiness.test.ts`
- [X] T007 [P] Add host response redaction tests in `tests/host-runtime/redaction.test.ts`

### Implementation for Foundation

- [X] T008 Create host runtime types in `src/host-runtime/types.ts`
- [X] T009 Implement allowed artifact path validation in `src/host-runtime/artifact-policy.ts`
- [X] T010 Implement redacted host runtime error helpers in `src/host-runtime/redaction.ts`
- [X] T011 Implement host readiness mapping from injected env/config in `src/host-runtime/readiness.ts`
- [X] T012 Verify foundational host-runtime tests pass without `.env`, audio reads, fetch, or provider calls

**Checkpoint**: Host boundary primitives compile and tests prove config/readiness/path/redaction semantics.

---

## Phase 3: User Story 1 - Inspect Host Runtime Readiness (Priority: P1)

**Goal**: The app can ask the host whether transcription is configured without reading audio or exposing secrets.

**Independent Test**: `npm run test:pipeline -- tests/host-runtime/readiness.test.ts` proves configured/unconfigured readiness, provider/model labels, and redacted setup reasons.

### Tests for User Story 1

- [X] T013 [P] [US1] Add missing-config readiness test in `tests/host-runtime/readiness.test.ts`
- [X] T014 [P] [US1] Add configured Groq readiness test with underscore and hyphen env keys in `tests/host-runtime/readiness.test.ts`
- [X] T015 [P] [US1] Add test proving readiness does not read audio or call fetch/provider in `tests/host-runtime/readiness.test.ts`

### Implementation for User Story 1

- [X] T016 [US1] Implement `createHostRuntimeReadiness()` in `src/host-runtime/readiness.ts`
- [X] T017 [US1] Add optional `HostRuntimeClient.getReadiness()` fake/browser client in `src/host-runtime/client.ts`
- [X] T018 [US1] Verify focused readiness tests pass

**Checkpoint**: Readiness can safely drive setup UI/recovery without provider calls.

---

## Phase 4: User Story 2 - Transcribe Through Host Boundary (Priority: P1)

**Goal**: A captured audio artifact can be transcribed through a fakeable host boundary that owns config/audio/fetch/report concerns.

**Independent Test**: `npm run test:pipeline -- tests/host-runtime/transcribe.test.ts` proves fake success, setup failure, provider failure, missing audio, empty transcript, and report/transcript artifact policy.

### Tests for User Story 2

- [X] T019 [P] [US2] Add fake successful host transcription test in `tests/host-runtime/transcribe.test.ts`
- [X] T020 [P] [US2] Add missing config/no audio read/no fetch test in `tests/host-runtime/transcribe.test.ts`
- [X] T021 [P] [US2] Add provider failure redaction test in `tests/host-runtime/transcribe.test.ts`
- [X] T022 [P] [US2] Add missing/out-of-root audio path test in `tests/host-runtime/transcribe.test.ts`
- [X] T023 [P] [US2] Add empty/unusable transcript mapping test in `tests/host-runtime/transcribe.test.ts`

### Implementation for User Story 2

- [X] T024 [US2] Implement `createHostRuntimeTranscriber()` using injected env, fetch, audio reader, and report writer in `src/host-runtime/transcriber.ts`
- [X] T025 [US2] Reuse `createGroqSttGateway` only inside host-runtime/script boundary, never from React UI
- [X] T026 [US2] Write redacted reports/transcripts only through allowed artifact policy helpers
- [X] T027 [US2] Verify focused host transcription tests pass without real provider calls

**Checkpoint**: Host transcription is repeatable and fakeable, while real provider execution remains explicit/gated.

---

## Phase 5: User Story 3 - Keep UI Honest And Provider-Free (Priority: P2)

**Goal**: UI/pipeline can consume a host client abstraction without importing provider-specific code or receiving secrets.

**Independent Test**: UI/helper tests prove fake host outcomes map to transcript review/recovery/delivery evidence; import guard prevents `src/App.tsx` from importing `model-gateway/groq-stt`.

### Tests for User Story 3

- [X] T028 [P] [US3] Add fake host client success/recovery mapping tests in `tests/host-runtime/ui-client.test.ts` or existing UI helper tests
- [X] T029 [P] [US3] Add regression test/import scan ensuring `src/App.tsx` does not import provider-specific Groq modules
- [X] T030 [P] [US3] Add visual test only if UI text changes; otherwise document UI wiring deferred

### Implementation for User Story 3

- [X] T031 [US3] Add provider-free `HostRuntimeClient` interface exports for future UI wiring in `src/host-runtime/client.ts`
- [X] T032 [US3] Optionally expose browser/dev fake client; defer real Tauri `invoke` wiring unless this batch owns it explicitly
- [X] T033 [US3] Document that React renderer remains provider-free until a Tauri/backend command owns secrets/audio reads

**Checkpoint**: UI boundary is ready for future wiring without exposing secrets or overclaiming delivery.

---

## Phase 6: Optional Tauri Command Spike (Gated By Batch Scope)

**Purpose**: Add a minimal Tauri command only if the TypeScript host boundary is stable and the batch explicitly owns Rust/capability changes.

- [X] T034 [US2] Add Rust/TS command contract notes for `get_runtime_transcription_readiness` and `transcribe_captured_audio`
- [X] T035 [US2] Add command registration plan in `src-tauri/src/lib.rs` and any capability implications
- [X] T036 [US2] If implemented, add no-provider-call smoke/build check for command registration

**Checkpoint**: Tauri command work is either explicitly implemented and verified, or deferred without blocking TypeScript host boundary completion.

---

## Phase 7: Polish & Verification

**Purpose**: Close the feature without provider calls or unrelated AOS migration.

- [X] T037 Run `npm run test:pipeline -- tests/host-runtime`
- [X] T038 Run `npm run test:pipeline`
- [X] T039 Run `npm run runtime-transcription:check`
- [X] T040 Run `npm run runtime-transcription:groq:dry-run`
- [X] T041 Run `npm run build`
- [X] T042 Run `bun scripts/context-index.ts`
- [X] T043 Run `bun scripts/agent-context-audit.ts`
- [X] T044 Inspect `git status --short --ignored artifacts .env` and `git ls-files artifacts .env`
- [X] T045 Update `docs/WORKING_MEMORY.md` and relevant docs/topics with 006 status if behavior/docs changed durably

**Checkpoint**: 006 is verified by host-runtime tests, existing runtime checks, docs sync, and git/artifact hygiene.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 before Phase 2.
- Phase 2 blocks all user stories.
- US1 readiness and US2 transcription can proceed after foundation, but US2 should reuse US1 config semantics.
- US3 depends on host client interface from US1/US2.
- Phase 6 is optional and should not start until TypeScript host boundary is green.
- Phase 7 closes the chosen scope.

### Parallel Examples

```text
# Safe read-only/explorer
Task: inspect Tauri command/capability pattern for optional Phase 6.

# Safe worker ownership if approved
Worker A: tests/host-runtime/artifact-policy.test.ts + src/host-runtime/artifact-policy.ts
Worker B: tests/host-runtime/readiness.test.ts + src/host-runtime/readiness.ts
Worker C: tests/host-runtime/transcribe.test.ts + src/host-runtime/transcriber.ts

# Reserved to orchestrator
specs/006-host-runtime-transcription-boundary/*, docs/WORKING_MEMORY.md, package scripts, git commits.
```

### Notes

- Do not commit `.env`, artifacts, transcripts, provider payloads, or real reports.
- Do not mix AOS `.agents/.pi` migration changes with product host-runtime commits.
- Do not add provider SDK dependencies unless a later task justifies why `fetch` is insufficient.
