# Feature Specification: Usable Dictation Loop

**Feature Branch**: `[007-usable-dictation-loop]`

**Created**: 2026-06-19

**Status**: Draft

**Input**: User chose "Spec 007 primero" after `aos-fanout` identified the next usability gap: the app can capture real audio and has a host-runtime boundary, but React still submits captured audio through the local STT shell and the Tauri host transcription command is still a safe unavailable stub.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run Dictation Through Host Client (Priority: P1)

A user captures audio in the app, submits the captured artifact, and the renderer routes transcription through `HostRuntimeClient` instead of direct provider or local STT shell code.

**Why this priority**: This is the smallest safe bridge from completed 006 boundary work to a usable app surface. It keeps React provider-free while making the UI exercise the same command boundary that will later own real transcription.

**Independent Test**: With a fake host client, run capture-result submission and verify transcript success, setup failure, provider failure, and recovery mapping without importing provider-specific modules into `src/App.tsx`.

**Acceptance Scenarios**:

1. **Given** a captured artifact exists and a fake host client returns transcript text, **When** the user submits the run, **Then** the UI shows transcript review, provider/model/latency evidence, and copy fallback availability.
2. **Given** a captured artifact exists but the Tauri host command returns setup unavailable, **When** the user submits the run, **Then** the UI shows redacted setup guidance and keeps the clip available for retry.
3. **Given** the app is running in browser/dev fallback, **When** transcription is submitted, **Then** the unavailable host client returns an honest setup state rather than pretending transcription ran.

---

### User Story 2 - Inspect Host Readiness From The App (Priority: P1)

A user can see whether host transcription is available before and after capture without the renderer reading credentials, `.env`, audio contents, or provider payloads.

**Why this priority**: Usability requires clear setup status. The app should tell JP whether the next failure is missing host support, missing provider config, missing audio, or provider failure.

**Independent Test**: Mock `HostRuntimeClient.getReadiness()` and verify the UI displays configured/unconfigured status and redacted reason without fetch/audio/provider calls.

**Acceptance Scenarios**:

1. **Given** readiness is unavailable, **When** the app loads or refreshes readiness, **Then** it shows "Host transcription unavailable" or equivalent setup guidance.
2. **Given** readiness is configured with provider/model labels, **When** the app renders status, **Then** provider/model are visible but no secret values are present.
3. **Given** readiness check fails unexpectedly, **When** the UI handles it, **Then** the failure is redacted and does not block capture.

---

### User Story 3 - Transcribe With A Real Host Provider Path (Priority: P2)

A locally configured Tauri host path can transcribe one captured WAV artifact through an explicitly gated provider call and return text to the UI with redacted evidence.

**Why this priority**: This is the first point where the app becomes useful for actual dictation, but it has more risk than provider-free UI wiring because it touches credentials, filesystem reads, and provider HTTP.

**Independent Test**: In CI-safe checks, use fake host/provider dependencies to prove success/failure mapping without provider calls. In approved local verification, submit one ignored captured WAV with an explicit allow flag and verify transcript/report artifacts remain ignored and redacted.

**Acceptance Scenarios**:

1. **Given** a captured WAV under `artifacts/microphone-capture/audio/` and local provider config, **When** a real host transcription is explicitly allowed, **Then** the host returns transcript text, provider/model, latency, redacted request evidence, and ignored artifact paths.
2. **Given** provider config is missing or invalid, **When** transcription is requested, **Then** the host returns a setup/provider error before leaking secrets or raw payloads.
3. **Given** the audio path is outside the allowed root, **When** transcription is requested, **Then** the host rejects it before reading audio or calling a provider.

---

### User Story 4 - Copy Recovered Text Honestly (Priority: P3)

A user can manually copy any successful transcript while the app reports only evidence it can prove.

**Why this priority**: Manual copy is the first usable delivery. It avoids false paste-observation claims while still making dictation useful.

**Independent Test**: Simulate transcript success and clipboard success/failure, then verify delivery evidence is `available`, `copied`, `failed`, or `uncertain`, never `paste_observed`.

**Acceptance Scenarios**:

1. **Given** transcript text is available, **When** the user copies it, **Then** the UI records copied fallback if clipboard write succeeds.
2. **Given** clipboard write is unavailable or fails, **When** copy is requested, **Then** the UI keeps transcript text visible and reports recoverable failure.
3. **Given** no verified paste observation exists, **When** any delivery summary is shown, **Then** it never claims paste was observed.

---

### Edge Cases

- Tauri host command unavailable or denied by capability configuration.
- Browser/dev fallback lacks Tauri invoke and returns unavailable setup state.
- Captured artifact path is missing, stale, outside allowed root, or unreadable.
- Host readiness succeeds but transcription setup fails later.
- Real provider returns empty/unusable transcript.
- Provider error includes secret-looking diagnostics.
- User starts/cancels/captures again while transcription is running.
- Clipboard API is unavailable in WebView/browser.
- App restarts between capture and transcription.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The renderer MUST submit captured artifacts through `HostRuntimeClient`, not through provider-specific modules or the old direct local STT shell.
- **FR-002**: `src/App.tsx` MUST remain provider-free and MUST NOT import `model-gateway/groq-stt` or provider credential helpers.
- **FR-003**: The app MUST expose host transcription readiness with redacted configured/unconfigured status.
- **FR-004**: Browser/dev fallback MUST use a fake or unavailable host client and MUST NOT call providers.
- **FR-005**: Tauri runtime MUST call host transcription through fixed invoke command names from 006.
- **FR-006**: Host transcription requests MUST include run id, captured artifact path, mode, and explicit provider-call allowance state.
- **FR-007**: Real provider calls MUST remain disabled in default/CI checks and require explicit local approval/gating.
- **FR-008**: Host-side real transcription MUST validate artifact paths before reading audio.
- **FR-009**: Host-side real transcription MUST keep provider credentials, raw provider payloads, and unredacted diagnostics out of React, reports, git, and assistant output.
- **FR-010**: Successful transcription MUST render transcript review and manual copy fallback.
- **FR-011**: Failed transcription MUST render redacted recovery guidance and preserve retry-from-clip when possible.
- **FR-012**: Delivery evidence MUST NOT claim paste observation unless a later verified observation path exists.
- **FR-013**: Generated audio, transcripts, reports, and provider payloads MUST remain ignored/untracked unless JP explicitly requests a controlled exception.

### Key Entities

- **Host Client Runtime**: The renderer-safe interface selected per environment: Tauri invoke client in desktop, unavailable/fake client in browser/tests.
- **Usable Dictation Run**: One user-facing run from captured artifact submission through transcript/recovery/copy state.
- **Readiness Surface**: UI state showing whether host transcription is configured and why not, without secrets.
- **Transcript Review**: The visible in-memory transcript and safe provider/model/latency evidence used for manual copy.
- **Copy Fallback Evidence**: Honest delivery state derived from copy attempt result, not paste observation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `src/App.tsx` submits captured artifacts through `HostRuntimeClient` and passes provider-free import guard tests.
- **SC-002**: Fake host UI tests cover success, setup failure, provider failure, unavailable host fallback, and transcript review/copy recovery.
- **SC-003**: Tauri/browser client selection is covered without real provider calls.
- **SC-004**: Default checks (`npm run test:pipeline`, `npm run build`, `cargo check`, and visual smoke when UI text changes) pass without provider calls.
- **SC-005**: An approved local real-provider verification can transcribe one captured WAV and leave `.env` and `artifacts/` untracked.
- **SC-006**: No UI, report, source file, or command output includes provider credentials or raw provider payloads.

## Assumptions

- Specs 005 and 006 remain the source of truth for runtime response types, redaction, recovery actions, artifact policy, and host command names.
- The first implementation batch can wire UI to the host client while the Tauri host command still returns an unavailable setup state.
- The real-provider host implementation may require a separate small batch and an explicit technical decision between native Rust HTTP and a local host-side script/sidecar route.
- Manual copy is sufficient for the first usable delivery path; hotkeys, tray, selected text replacement, history, settings, and paste observation remain out of scope.
