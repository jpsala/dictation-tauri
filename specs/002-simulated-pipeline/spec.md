# Feature Specification: Simulated Pipeline

**Feature Branch**: `002-simulated-pipeline`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "MVP 1: pipeline simulado automatizable con fixtures/mock antes de audio real."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run A Complete Simulated Dictation Flow (Priority: P1)

As the project owner, I want a complete dictation pipeline to run from a controlled fixture or simulated input so that the product flow can be validated before using a real microphone or external transcription.

**Why this priority**: This is the first useful product behavior after MVP 0. It proves the flow shape and observable states without depending on manual speech, provider keys, microphone permissions, or delivery integrations.

**Independent Test**: A test or runner starts from an idle state, executes a simulated successful dictation session, and verifies the ordered states and final generated text.

**Acceptance Scenarios**:

1. **Given** the app has no active run, **When** a successful simulated dictation fixture is executed, **Then** the run moves through idle, listening, transcribing, delivering, and done with final text available.
2. **Given** the simulated transcription has known expected text, **When** the run completes, **Then** the final output matches the expected fixture output.
3. **Given** no microphone or provider credentials are available, **When** the simulated flow runs, **Then** the flow still completes without requesting real audio, external services, or secrets.

---

### User Story 2 - Observe Failures And Recovery Paths (Priority: P2)

As the project owner, I want simulated error and recovery paths so that the app can prove failure behavior before real dictation introduces harder-to-repeat failures.

**Why this priority**: Dictation UX depends on trust. The app must not silently lose text or imply successful delivery when a simulated phase fails.

**Independent Test**: A failure fixture injects an error at one pipeline phase and verifies that the run reaches an error state with a clear recovery action.

**Acceptance Scenarios**:

1. **Given** a fixture that fails transcription, **When** the run executes, **Then** the run reaches error and exposes a readable reason without producing misleading final text.
2. **Given** a fixture that cannot confirm delivery, **When** the run executes, **Then** the run reports delivery as uncertain and exposes copy fallback text.
3. **Given** a run is cancelled before completion, **When** cancellation is requested, **Then** the run reaches cancelled and does not later report done.

---

### User Story 3 - Review Development Evidence (Priority: P3)

As a developer, I want each simulated run to expose enough structured evidence to debug the pipeline and prepare later STT/audio work.

**Why this priority**: MVP 1 is a bridge to audio and provider work. Useful evidence now reduces guessing when MVP 2 adds synthetic audio and real STT.

**Independent Test**: A run event ledger and derived summary can be inspected after success, failure, and cancellation, with phase names, timings or ordering, input identifier, output text when available, delivery evidence, and redacted errors.

**Acceptance Scenarios**:

1. **Given** a successful fixture run, **When** the run summary is inspected, **Then** it includes fixture identity, phase order, final output, and delivery result.
2. **Given** a failed fixture run, **When** the run summary is inspected, **Then** it includes the failed phase and a redacted error message.
3. **Given** a run is active, **When** another run is requested before the first reaches a terminal state, **Then** the pipeline service rejects or defers the second run without corrupting the active run.

### Edge Cases

- A new run is requested while another run is active.
- A fixture is missing, malformed, or has no expected output.
- A simulated transcription returns empty text.
- Delivery is simulated as unavailable or uncertain.
- A run is cancelled during listening, transcribing, or delivering.
- A failure occurs after partial output exists.
- A previous run's result must not leak into the next run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support a complete simulated dictation flow without real microphone access.
- **FR-002**: The system MUST support controlled fixture inputs with expected output text.
- **FR-003**: The system MUST represent the run state using a bounded state set that includes idle, listening, transcribing, delivering, done, error, and cancelled.
- **FR-004**: The system MUST expose state transitions in an order that can be verified by automated checks.
- **FR-005**: The system MUST provide a mock transcription result for simulated runs.
- **FR-006**: The system MUST provide a simulated delivery result that distinguishes successful delivery, copy fallback, and uncertain delivery.
- **FR-007**: The system MUST support at least one successful fixture and at least one failure fixture.
- **FR-008**: The system MUST prevent overlapping active runs unless a later specification explicitly defines concurrency.
- **FR-009**: The system MUST make cancellation observable and terminal for a run.
- **FR-010**: The system MUST expose a run summary with fixture identity, observed states, final text when available, delivery result, and redacted error details when applicable.
- **FR-011**: The system MUST NOT require provider credentials, real audio devices, global hotkeys, tray behavior, real clipboard insertion, or product persistence to complete MVP 1.
- **FR-012**: The system MUST NOT capture real selected text; selected text may only appear as a controlled fixture value.
- **FR-013**: The system MUST expose a typed event ledger for every run, and the run summary MUST be derivable from that ledger.
- **FR-014**: The system MUST keep fixture-backed transcription and delivery behind mockable ports/adapters so later STT and delivery adapters can replace them without changing UI ownership.
- **FR-015**: The system MUST keep the UI out of transition ownership; UI surfaces may dispatch commands and observe events/state only.
- **FR-016**: The system MUST treat `delivered` as simulated delivery only and MUST NOT imply real paste observation.

### Key Entities *(include if feature involves data)*

- **Pipeline Run**: One attempt to process simulated dictation from input through completion, failure, or cancellation.
- **Pipeline State**: The current and historical phase labels for a run.
- **Pipeline Event**: A typed record emitted during a run, used as the primary debugging/evidence stream.
- **Pipeline Service**: The execution owner that starts runs, prevents overlap, handles cancellation, emits events, and returns summaries.
- **Fixture Input**: A controlled test input with an identifier, optional simulated source text, expected output, and optional failure mode.
- **Mock Transcription Result**: A simulated transcription response containing text or a controlled error.
- **Delivery Result**: The outcome of making generated text available, including delivered, copied fallback, uncertain, failed, or skipped.
- **Run Summary**: A developer-facing record of what happened during one run, excluding secrets and sensitive real user data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A successful simulated run can complete in under 5 seconds on the development machine without microphone access or provider credentials.
- **SC-002**: Automated checks verify the successful flow and at least one error or recovery flow.
- **SC-003**: Every run reaches exactly one terminal state: done, error, or cancelled.
- **SC-004**: The successful fixture produces expected output text with 100% deterministic repeatability across repeated local runs.
- **SC-005**: A new session can understand how to run and verify MVP 1 from project documentation in five files or fewer.
- **SC-006**: No real audio, transcript history, provider key, selected text capture, or durable product persistence is required for the MVP 1 closeout.
- **SC-007**: Cancellation, active-run overlap prevention, event order, and summary derivation are covered by automated tests.

## Assumptions

- MVP 1 is a product-flow and verification milestone, not an audio or provider milestone.
- The first simulated delivery path may use controlled output or copy fallback semantics rather than real insertion into another application.
- UI exposure may be minimal; logs, test output, or a small visible state surface are acceptable as long as states are observable.
- Real microphone capture remains MVP 3.
- Real STT against synthetic or local audio remains MVP 2.
- Product persistence remains undecided; any local artifacts used for development must stay non-contractual unless a later decision defines them.
- The MVP 1 state names remain the current technical contract: idle, listening, transcribing, delivering, done, error, cancelled. Product UI may label `done` as completed and `error` as failed.
