# Feature Specification: Runtime Transcription And Delivery

**Feature Branch**: `[005-runtime-transcription-delivery]`

**Created**: 2026-06-19

**Status**: Draft

**Input**: User description: "Define the post-MVP3 runtime path that turns a captured microphone clip into useful text, exposes safe recovery, and delivers the result honestly before adding broad desktop ergonomics."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Transcribe Captured Dictation (Priority: P1)

A user records a short dictation clip, submits it for transcription, and receives usable text or a clear recoverable failure without losing the captured audio.

**Why this priority**: MVP3 proves capture. The next product value is turning that captured speech into text through an approved, observable runtime path.

**Independent Test**: Can be tested with an existing captured-audio artifact and configured transcription access by submitting one run and verifying a completed transcript or a setup/provider failure with recovery instructions.

**Acceptance Scenarios**:

1. **Given** a captured-audio artifact exists and transcription access is configured, **When** the user submits the clip, **Then** the system returns transcript text with provider/model, timing, and request evidence that does not expose secrets.
2. **Given** a captured-audio artifact exists but transcription access is missing or invalid, **When** the user submits the clip, **Then** the system reports a setup/provider failure with redacted diagnostics and keeps the clip available for retry.
3. **Given** a captured-audio artifact has already been submitted, **When** the user attempts a second overlapping transcription for the same active run, **Then** the system prevents overlap and preserves the original run state.

---

### User Story 2 - Recover And Review Text Safely (Priority: P2)

A user can review the transcription result, copy it manually, and understand what happened if transcription, post-processing, or delivery fails.

**Why this priority**: The workflow must remain trustworthy even when automatic delivery is not yet proven or when providers fail.

**Independent Test**: Can be tested by forcing success, setup failure, provider failure, and empty transcript outcomes and verifying the visible recovery action for each terminal state.

**Acceptance Scenarios**:

1. **Given** a completed transcription with text, **When** the run finishes, **Then** the text is available for review and manual copy.
2. **Given** transcription fails before text is produced, **When** the run finishes, **Then** the user sees a recoverable next action such as retry with the same clip, inspect setup, or record again.
3. **Given** transcription returns no useful text, **When** the run finishes, **Then** the system marks the result as empty or unusable rather than pretending delivery succeeded.

---

### User Story 3 - Deliver With Honest Evidence (Priority: P3)

A user can request delivery of the transcript to the current working context, while the system reports only what it can actually prove.

**Why this priority**: Delivery is valuable, but false confidence is worse than a visible copy fallback. This sets the foundation for later focus/clipboard automation.

**Independent Test**: Can be tested by simulating delivery available, copied, failed, and uncertain states and verifying that no paste observation is claimed unless there is a verified observation path.

**Acceptance Scenarios**:

1. **Given** transcript text is available, **When** the user copies or sends it through the supported delivery action, **Then** the system records the attempted delivery evidence and leaves manual recovery available.
2. **Given** delivery cannot be verified, **When** the run finishes, **Then** the system reports an uncertain or fallback state rather than claiming the text was pasted.
3. **Given** a future verified paste-observation path exists, **When** delivery is observed, **Then** the system may report paste observation with target evidence and confidence.

---

### Edge Cases

- Captured audio file is missing, unreadable, too large, too short, or has unsupported format.
- Transcription access is absent, expired, rate-limited, unavailable, or returns a redacted provider error.
- A provider returns a transcript in the wrong language, an empty transcript, or text that looks like a hallucinated non-speech result.
- The user cancels or retries while a transcription or delivery run is active.
- The app restarts after capture but before transcription or delivery completes.
- Clipboard or target-app delivery fails after text is already available.
- Local reports, transcripts, or payloads could accidentally expose secrets, raw provider diagnostics, or private dictation content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a user submit a captured-audio artifact for transcription through an explicitly configured transcription boundary.
- **FR-002**: The system MUST keep provider credentials and secret values out of user-visible logs, reports, source-controlled files, and application UI.
- **FR-003**: The system MUST preserve enough run evidence to explain success, setup failure, provider failure, cancellation, and retryability without storing raw provider payloads in source control.
- **FR-004**: The system MUST return transcript availability as a distinct outcome from delivery success.
- **FR-005**: The system MUST make successful transcript text available for review and manual copy before any claimed automatic delivery success.
- **FR-006**: The system MUST prevent overlapping capture/transcription/delivery runs that could corrupt run evidence or duplicate provider calls.
- **FR-007**: The system MUST classify delivery evidence as available, copied, failed, uncertain, or observed only when each state is supported by matching evidence.
- **FR-008**: The system MUST NOT claim paste observation unless a verified observation path exists for the target context.
- **FR-009**: The system MUST keep real audio, transcripts, provider payloads, and generated reports local and ignored by version control unless the user explicitly requests a controlled exception.
- **FR-010**: The system MUST support retrying a failed transcription from the same captured clip when the clip is still available.
- **FR-011**: The system MUST provide user-facing recovery guidance for missing audio, missing provider configuration, provider failure, empty transcript, cancellation, and delivery uncertainty.
- **FR-012**: The system MUST record provider/model identity, latency, and request-evidence presence when available, while redacting identifiers or diagnostics that should not be shared.

### Key Entities *(include if feature involves data)*

- **Captured Clip**: A local audio artifact created by microphone capture, with path, duration/size metadata, format evidence, and capture time.
- **Transcription Run**: One attempt to turn a captured clip into text, with status, provider/model label, timing, retryability, and redacted error information.
- **Transcript Result**: The text outcome of a run, including availability, empty/unusable classification, and local recovery location when stored.
- **Delivery Evidence**: The state describing whether text is merely available, copied, failed, uncertain, or observed with proof.
- **Recovery Action**: A safe next action offered to the user after a terminal state, such as retry, inspect setup, copy manually, record again, or view local artifact location.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A configured local run can transcribe one previously captured microphone artifact and produce transcript availability evidence in under 10 seconds for a short clip.
- **SC-002**: 100% of setup/provider failure paths expose redacted diagnostics and a retry or recovery action without printing secret values.
- **SC-003**: 100% of delivery summaries avoid `paste observed` claims unless verified observation evidence exists.
- **SC-004**: Generated real audio, transcripts, provider payloads, and reports remain untracked by version control after verification commands run.
- **SC-005**: Users can recover useful text by manual copy whenever transcription succeeds but delivery is failed or uncertain.
- **SC-006**: Regression checks cover success, setup failure, provider failure, empty transcript, cancellation, no-overlap, and delivery uncertainty.

## Assumptions

- MVP3 native microphone capture and captured-audio pipeline remain the baseline input path.
- Initial real transcription may use local developer credentials or an approved local proxy, but the product boundary remains the project-owned transcription interface.
- Human review/manual copy is acceptable for the first runtime delivery slice; global hotkeys, tray controls, selected-text replacement, history storage, and broad settings remain out of scope for this feature.
- Local personal/dev mode permits using captured audio and provider credentials for gated verification, while still forbidding secret leakage and source-controlled private artifacts.
- Durable product persistence beyond local ignored artifacts requires a separate spec or explicit extension of this one.
