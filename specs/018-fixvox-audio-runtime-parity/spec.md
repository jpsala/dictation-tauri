# Feature Specification: Fixvox Audio Runtime Parity

**Feature Branch**: `[018-fixvox-audio-runtime-parity]`

**Created**: 2026-07-02

**Status**: Complete

**Input**: User description: "Implement the Fixvox audio/runtime parity capabilities JP wants now: robust local VAD/no-speech, MP3 compression/conversion for long audio, mute output during recording, sound cues, auto-stop by silence, and richer telemetry for STT/postprocess/delivery stages. Stop phrase is out of scope."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Avoid sending non-speech audio (Priority: P1)

As a dictation user, JP wants the app to detect silence or unusable recordings before managed transcription, so empty recordings fail quickly and safely without wasting provider calls.

**Why this priority**: Reliable no-speech detection is the base for auto-stop, cost control, and trust in the dictation loop.

**Independent Test**: Use quiet/silence and speech fixtures. Silence must return a local no-speech result; speech must continue to transcription.

**Acceptance Scenarios**:

1. **Given** a recording with only silence/background noise below threshold, **When** dictation stops, **Then** the system reports local no-speech and does not submit audio for transcription.
2. **Given** a recording with clear speech after initial silence, **When** dictation stops, **Then** the system treats it as speech and continues transcription.
3. **Given** a very short accidental recording, **When** the local audio check runs, **Then** the system returns a recoverable local no-speech/too-short outcome with no raw transcript.

---

### User Story 2 - Stop automatically after silence (Priority: P1)

As a dictation user, JP wants the app to finish recording automatically after he stops speaking, so he does not need to manually stop every dictation.

**Why this priority**: Auto-stop turns VAD into workflow improvement and brings behavior closer to Fixvox.

**Independent Test**: Use a controlled recording stream or fixture with speech followed by silence. The recording must stop after the configured silence duration.

**Acceptance Scenarios**:

1. **Given** auto-stop is enabled and the user pauses longer than the configured silence duration, **When** silence is detected, **Then** recording stops and proceeds as manual submit.
2. **Given** auto-stop is enabled and the user pauses briefly below the configured duration, **When** speech resumes, **Then** recording continues.
3. **Given** auto-stop is disabled, **When** silence exceeds the threshold, **Then** the app keeps recording until manual stop.

---

### User Story 3 - Optimize recordings before upload (Priority: P2)

As a dictation user, JP wants recordings above the useful size threshold compressed before managed transcription, so upload time and bandwidth are lower without meaningfully changing transcript quality.

**Why this priority**: It reduces latency and cost risk for long dictations, but depends on trustworthy audio prep.

**Independent Test**: Use audio fixtures below and above `160000` bytes. Smaller audio stays unchanged; audio at or above the threshold produces an optimized artifact with equivalent duration and expected metadata.

**Acceptance Scenarios**:

1. **Given** a recording under the optimization threshold, **When** audio prep runs, **Then** original audio is used and telemetry records conversion skipped.
2. **Given** a recording above the threshold, **When** audio prep runs, **Then** the system creates an optimized artifact and uses it for transcription.
3. **Given** conversion fails while original audio is usable, **When** audio prep completes, **Then** the system falls back safely and records the failure in redacted telemetry.

---

### User Story 4 - Mute output while recording (Priority: P2)

As a dictation user, JP wants system/app output muted during recording and restored afterward, so speaker audio does not leak into microphone capture.

**Why this priority**: It improves real-world capture quality and mirrors a useful Fixvox behavior, but touches local system state and must be safe.

**Independent Test**: Use a host-controlled smoke that verifies mute is applied at recording start and restored on success, cancel, and error.

**Acceptance Scenarios**:

1. **Given** mute-output is enabled, **When** recording starts, **Then** output is muted before meaningful capture begins.
2. **Given** output was muted by the app, **When** recording completes, is canceled, or errors, **Then** output is restored to the previous state.
3. **Given** mute-output is disabled or unavailable, **When** recording starts, **Then** recording continues and redacted telemetry records skipped/failed mute.

---

### User Story 5 - Hear lightweight dictation cues (Priority: P3)

As a dictation user, JP wants small optional sounds for start, stop/auto-stop, success, and error/no-speech, so he can understand state without watching the dock.

**Why this priority**: It improves ergonomics but should remain optional and non-blocking.

**Independent Test**: Enable cues and verify state transitions request the correct cue without blocking dictation.

**Acceptance Scenarios**:

1. **Given** sound cues are enabled, **When** recording starts, **Then** a start cue is played or queued without delaying capture.
2. **Given** recording stops manually or by silence, **When** capture ends, **Then** a stop cue is played.
3. **Given** transcription/delivery succeeds or fails locally, **When** outcome is known, **Then** a success or error/no-speech cue is played.
4. **Given** sound cues are disabled or unavailable, **When** dictation runs, **Then** no cue is played and the core flow is unaffected.

---

### User Story 6 - Inspect redacted runtime telemetry by stage (Priority: P2)

As JP debugging dictation quality, latency, and delivery, he wants stage-level telemetry for capture, audio prep, STT, postprocess, and delivery without raw text/audio leaks.

**Why this priority**: This makes regressions diagnosable and supports future model/runtime tuning.

**Independent Test**: Use provider-free and managed smokes that assert telemetry contains stage names, durations, IDs, decisions, lengths/hashes, and no raw transcript/audio content.

**Acceptance Scenarios**:

1. **Given** a successful dictation, **When** the run completes, **Then** telemetry includes capture, audio-prep, STT, postprocess decision, and delivery stage summaries.
2. **Given** no-speech or conversion failure, **When** the run ends early or falls back, **Then** telemetry records reason and stage without raw audio or transcript.
3. **Given** delivery target changes, **When** delivery completes or fails, **Then** telemetry records start/final target metadata, strategy, confidence, and evidence status in redacted form.

### Edge Cases

- Silence at the beginning followed by speech must not be rejected as no-speech.
- Speech with long mid-sentence pauses must not auto-stop unless the pause exceeds configured duration.
- Background music/system output during recording should be reduced by mute-output when enabled, but inability to mute must not block dictation.
- Very long audio must not create unbounded artifacts or logs.
- Audio conversion failure must not delete or lose original captured audio before fallback decision.
- Sound cue playback failure must not fail dictation.
- Telemetry must not store raw audio, raw transcript, selected text, secrets, full device IDs, or tokens.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST classify captured audio locally as usable speech, no-speech, too-short, or uncertain before managed transcription.
- **FR-002**: System MUST avoid managed transcription calls for audio classified as no-speech or too-short.
- **FR-003**: System MUST allow speech after initial silence to proceed when speech is detected within the recording.
- **FR-004**: System MUST support an auto-stop setting that stops recording after a configurable silence duration.
- **FR-005**: System MUST ignore pauses shorter than the configured silence duration for auto-stop.
- **FR-006**: System MUST support disabling auto-stop.
- **FR-007**: System MUST optimize recordings before upload when `originalBytes >= 160000`.
- **FR-008**: System MUST record whether audio optimization was skipped, applied, failed, or fell back.
- **FR-009**: System MUST preserve a safe fallback path when optimization fails and original audio is usable.
- **FR-010**: System MUST support a mute-output preference that attempts to mute output while recording and restore prior state after success, cancel, or error.
- **FR-011**: System MUST NOT leave output muted if dictation fails, is canceled, or errors after muting.
- **FR-012**: System MUST support optional sound cues for start, stop/auto-stop, success, and error/no-speech outcomes.
- **FR-013**: System MUST allow sound cues to be disabled without changing dictation behavior.
- **FR-014**: System MUST emit redacted telemetry for capture, audio-prep, STT, postprocess, and delivery stages.
- **FR-015**: Telemetry MUST include stage duration, decision/status, safe model/profile/prompt identifiers when available, audio size/duration metadata, target metadata, delivery strategy, and evidence status.
- **FR-016**: Telemetry MUST NOT include raw audio, raw transcript text, selected text, tokens, secrets, or full persistent identifiers.
- **FR-017**: System MUST keep production mutations/deploys and real foreground target side effects behind existing approval gates.
- **FR-018**: Stop phrase detection is out of scope for this feature.

### Key Entities *(include if feature involves data)*

- **Audio Prep Decision**: Local decision describing speech usability, silence/no-speech status, optimization status, duration, size, and redacted reasons.
- **Silence Policy**: User/runtime settings controlling no-speech thresholds, auto-stop enablement, and silence duration.
- **Output Mute Session**: Temporary state recording whether output was muted by the app and what must be restored.
- **Sound Cue Event**: Non-blocking cue request tied to a dictation state transition.
- **Runtime Telemetry Stage**: Redacted per-stage record for capture, audio-prep, STT, postprocess, or delivery.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Silence-only fixture runs are rejected locally as no-speech with zero managed transcription requests.
- **SC-002**: Speech fixtures with initial silence continue to transcription in at least 95% of controlled test runs.
- **SC-003**: Auto-stop ends recording within 500 ms of the configured silence duration in controlled local smoke runs.
- **SC-004**: Audio fixtures at or above `160000` bytes produce an optimized artifact at least 40% smaller than original or record a safe fallback reason.
- **SC-005**: Output mute is restored after success, cancel, and error in all host-owned smoke paths.
- **SC-006**: Sound cue failures do not change final dictation outcome in tests.
- **SC-007**: Telemetry for successful and failed runs contains all required stages and passes raw-content redaction assertions.
- **SC-008**: Existing provider-free pipeline/build checks continue to pass after the feature is enabled behind preferences/policy.

## Assumptions

- The first implementation targets JP's local desktop dictation workflow.
- Existing Fixvox Cloud policy defaults may sync user preferences, but local app settings remain the immediate source for personal/dev behavior.
- Provider-free tests and synthetic/local audio fixtures are the default validation path; real provider calls and foreground target smokes remain gated.
- Sound cues are optional and small; no custom sound design work is required for v1.
- Stop phrase detection remains out of scope even though Fixvox has related voice-command behavior.
