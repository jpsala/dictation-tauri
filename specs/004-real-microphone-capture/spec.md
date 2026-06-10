# Feature Specification: Real Microphone Capture

**Feature Branch**: `004-real-microphone-capture`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "MVP 3: captura real de microfono para dictado end-to-end. Preparar la especificacion antes de implementar permisos, grabacion y side effects desktop."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture A Real Dictation Clip (Priority: P1)

As JP, I want to start and stop microphone capture from the app so that a real spoken phrase can become an audio input for the existing dictation pipeline.

**Why this priority**: MVP 3 starts when the project can replace synthetic audio with a real local microphone clip while preserving the pipeline architecture proven in MVP 1 and MVP 2.

**Independent Test**: A microphone capture check can request permission, record a short local clip, stop capture, and hand the resulting audio artifact to the same pipeline contract used by fixture runs.

**Acceptance Scenarios**:

1. **Given** the app is idle and microphone access is available, **When** JP starts capture and then stops it, **Then** the system produces one local audio artifact with metadata sufficient for transcription.
2. **Given** microphone permission has not been granted, **When** JP starts capture, **Then** the app shows a clear setup or permission state and does not start a pipeline run.
3. **Given** capture is active, **When** JP stops capture, **Then** the active capture reaches a terminal state and the system prevents overlapping captures.

---

### User Story 2 - Transcribe Captured Audio Through The Pipeline (Priority: P2)

As JP, I want captured microphone audio to use the existing transcription gateway and pipeline events so that real dictation behaves like the fixture-validated path.

**Why this priority**: Real capture only becomes useful when it reuses `PipelineService`, the event ledger, and the `ModelGateway` contract instead of creating a separate UI-owned flow.

**Independent Test**: A captured or recorded local audio artifact can be submitted to a dry-run-safe transcription path and, when a real provider is configured, to the same real-provider shell without exposing secrets or bypassing pipeline ownership.

**Acceptance Scenarios**:

1. **Given** a captured audio artifact exists, **When** it is submitted for transcription, **Then** the event ledger records capture metadata, transcription status, transcript or redacted error, and terminal state.
2. **Given** no real provider is configured, **When** captured audio is submitted, **Then** the system reports a redacted setup state and preserves the dry-run checks.
3. **Given** transcription succeeds, **When** the run summary is derived, **Then** it includes transcript text, timing metadata, and the artifact reference without treating local audio as durable product history.

---

### User Story 3 - Deliver Or Recover The Result (Priority: P3)

As JP, I want the transcribed text to become available for delivery or recovery so that real dictation does not silently lose text.

**Why this priority**: MVP 3 should prove an end-to-end user outcome, but paste observation and advanced desktop automation can remain later work. The first cut must be honest about delivery certainty.

**Independent Test**: A real or stubbed captured run can complete with text available in the app and a copy-fallback or delivery evidence state that does not claim paste observation unless verified.

**Acceptance Scenarios**:

1. **Given** a captured run has transcript text, **When** delivery is requested, **Then** the text becomes available through the configured delivery path or recovery view.
2. **Given** delivery cannot be verified, **When** the run completes, **Then** the summary distinguishes text availability, copy fallback, paste sent, paste observed, or uncertain delivery.
3. **Given** capture or transcription fails, **When** JP returns to the app, **Then** the failure state explains the recoverable next action without exposing secrets or raw provider diagnostics.

### Edge Cases

- No microphone device is available.
- Microphone permission is denied, revoked, or not yet requested.
- The selected input device changes during capture.
- Capture starts but produces empty, silent, corrupt, clipped, or unsupported audio.
- Capture runs too long or is stopped immediately.
- A second capture is requested while capture or transcription is active.
- The app window loses focus while capture is active.
- Provider setup is missing after capture succeeds.
- Transcription returns empty text, wrong language, timeout, or redacted provider error.
- Local audio, transcripts, and logs contain real user data and must stay out of version control.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow JP to initiate and stop one microphone capture session from an explicit app action.
- **FR-002**: The system MUST represent microphone permission as a visible setup state before or during the first capture attempt.
- **FR-003**: The system MUST prevent overlapping capture sessions and overlapping pipeline runs.
- **FR-004**: The system MUST produce a local audio artifact and metadata for each successful capture.
- **FR-005**: The audio metadata MUST include a capture id, start time, end time or duration, format, sample information when known, sensitivity classification, and artifact policy.
- **FR-006**: Captured audio artifacts, transcripts, provider payloads, and capture logs MUST remain local and gitignored by default.
- **FR-007**: Captured audio MUST enter the existing pipeline through a port or adapter boundary rather than direct UI-owned transcription logic.
- **FR-008**: The pipeline service MUST remain the owner of active runs, cancellation/no-overlap, event emission, and summary derivation.
- **FR-009**: The event ledger MUST include capture lifecycle evidence sufficient to reconstruct whether a run used synthetic audio, local fixture audio, or microphone audio.
- **FR-010**: The transcription path for captured audio MUST reuse the `ModelGateway` contract or an explicitly compatible adapter contract.
- **FR-011**: The system MUST preserve credential-free dry-run checks for routine verification.
- **FR-012**: The system MUST report missing microphone permission, missing provider setup, capture failure, and transcription failure as redacted setup or runtime states.
- **FR-013**: The system MUST NOT print or commit secrets, provider keys, raw provider diagnostics, real audio, or real transcripts.
- **FR-014**: The first MVP3 delivery path MUST make transcript text available and record delivery certainty without claiming paste observation unless observation is implemented and verified.
- **FR-015**: The system MUST NOT add global hotkeys, tray controls, real selected-text capture, settings UI, history storage, or durable product persistence in the first MVP3 capture batch.
- **FR-016**: Any new desktop permission or capability required for capture MUST be documented before implementation closes.
- **FR-017**: The app MUST expose clear states for idle, permission/setup needed, listening, transcribing, delivering or available, completed, failed, and cancelled.
- **FR-018**: Tests and local checks MUST be able to exercise the capture pipeline boundary without requiring JP to repeatedly speak during automated verification.

### Key Entities *(include if feature involves data)*

- **Capture Session**: One user-initiated microphone recording attempt with lifecycle state and timing metadata.
- **Microphone Permission State**: Whether capture is available, needs setup, denied, or failed.
- **Captured Audio Artifact**: A local, sensitive audio file produced by a capture session.
- **Capture Metadata**: Non-secret data describing a captured artifact and how it may be used.
- **Dictation Run**: The pipeline execution that consumes captured or fixture audio and produces transcript or error evidence.
- **Delivery Evidence**: The recorded certainty level for text availability, copy fallback, paste sent, paste observed, or uncertain delivery.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: JP can complete a start/stop capture flow for a short spoken phrase and see a terminal capture state.
- **SC-002**: A successful capture creates exactly one local audio artifact under a documented gitignored path.
- **SC-003**: A captured audio run reaches a terminal pipeline state with transcript text or a redacted setup/error state.
- **SC-004**: Existing MVP 1 pipeline tests and MVP 2 dry-run checks remain green after microphone capture work.
- **SC-005**: Repository status remains free of real audio, real transcripts, provider payloads, and secrets after capture tests.
- **SC-006**: The UI displays distinct states for permission/setup needed, listening, transcribing, completed, failed, and cancelled.
- **SC-007**: Delivery evidence never claims paste observation unless an implementation actually verifies observation.

## Assumptions

- MVP 3 begins with explicit in-app start/stop capture; global hotkeys and tray controls are later features.
- Real selected-text capture remains out of scope for MVP 3.
- Delivery may start with text availability and copy fallback; paste observation is not required for the first capture milestone.
- Captured user audio and transcripts are sensitive local development artifacts, not source-controlled fixtures.
- The project may use local credentials or provider setup in development, but they remain outside React UI state and out of version control.
- Automated verification should continue to prefer fixtures, dry-run adapters, and capture-boundary tests before asking JP for repeated manual dictation.
