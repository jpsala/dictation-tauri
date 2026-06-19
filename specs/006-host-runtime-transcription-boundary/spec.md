# Feature Specification: Host Runtime Transcription Boundary

**Feature Branch**: `[006-host-runtime-transcription-boundary]`

**Created**: 2026-06-19

**Status**: Draft

**Input**: User direction after 005: move real-provider runtime transcription toward the app without exposing secrets in React. Keep provider calls explicit/gated and use a host-side/Tauri/backend boundary before any UI wiring.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect Host Runtime Readiness (Priority: P1)

A user or developer can ask the app host whether runtime transcription is available without exposing credentials or reading audio.

**Why this priority**: The UI must not guess provider availability or receive secrets. A readiness boundary gives safe setup feedback before any provider call.

**Independent Test**: Invoke the host-readiness path with fake/env-less setup and verify it reports configured/unconfigured status, provider/model labels, artifact policy, and redacted diagnostics without reading `.env` values or audio contents.

**Acceptance Scenarios**:

1. **Given** no runtime provider config is available, **When** readiness is checked, **Then** the host returns `configured: false` with a redacted setup reason and no secret values.
2. **Given** local provider config exists, **When** readiness is checked, **Then** the host returns provider/model labels and `configured: true` without returning the key or raw env values.
3. **Given** the UI renders readiness, **When** setup is missing, **Then** it can show inspect-setup guidance without attempting transcription.

---

### User Story 2 - Transcribe Through Host Boundary (Priority: P1)

A captured audio artifact can be submitted to a host-side boundary that owns credential lookup, audio reads, provider fetch, transcript/report artifacts, and redaction.

**Why this priority**: React must remain a command/observer surface. The host boundary is the safe place for credentials, filesystem reads, and provider transport.

**Independent Test**: Use fake host/fetch/audio readers to submit a captured artifact and verify success, setup failure, provider failure, and missing audio outcomes without real provider calls.

**Acceptance Scenarios**:

1. **Given** a captured artifact and fake configured provider, **When** the host transcription command runs, **Then** it returns transcript availability evidence, provider/model, latency, redacted request evidence, and ignored artifact paths.
2. **Given** provider config is missing, **When** the host command runs, **Then** it fails before reading audio or calling fetch and returns redacted setup guidance.
3. **Given** a provider returns an error, **When** the host command runs, **Then** the response contains a redacted provider error and keeps the captured clip retryable.

---

### User Story 3 - Keep UI Honest And Provider-Free (Priority: P2)

The app can surface host-boundary outcomes while keeping API keys, raw provider payloads, and full local transcripts out of UI logs and source control.

**Why this priority**: Users need visible progress/recovery, but product safety depends on not letting the renderer own secrets or overclaim delivery.

**Independent Test**: Use a fake host client in UI/pipeline tests to prove the UI can render readiness/transcript/recovery states without direct provider adapter imports or secret fields.

**Acceptance Scenarios**:

1. **Given** a successful host transcription result, **When** the UI receives it, **Then** transcript review/manual copy remains available and delivery status remains no stronger than `available`/`copied`/`uncertain`.
2. **Given** a setup/provider failure, **When** the UI receives it, **Then** it shows redacted recovery guidance and keeps retry-from-clip available when possible.
3. **Given** a future Tauri command implementation, **When** React calls it, **Then** React never receives provider credentials or raw provider payloads.

---

### Edge Cases

- Tauri host command unavailable in browser/dev fallback.
- Captured artifact path is missing, outside the allowed artifact root, or unreadable.
- `.env` uses legacy hyphenated keys (`GROQ-API-KEY`) or underscore keys.
- Provider call is attempted without explicit local approval flag in dev scripts.
- Provider succeeds with empty/unusable transcript.
- Provider failure includes secret-looking diagnostics.
- App restarts between capture and transcription.
- Transcript/report write fails after provider success.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a host-owned runtime transcription boundary before wiring real provider calls into the React UI.
- **FR-002**: The React renderer MUST NOT read provider credentials, `.env`, raw provider payloads, or full provider diagnostics.
- **FR-003**: The host boundary MUST validate captured artifact paths before reading audio.
- **FR-004**: The host boundary MUST resolve local provider configuration and return only redacted readiness/transcription evidence.
- **FR-005**: Provider calls MUST remain disabled in CI/default scripts and enabled only through explicit/gated local paths.
- **FR-006**: Successful host transcription MUST return transcript text or a safe transcript artifact reference plus provider/model/latency/redacted request evidence.
- **FR-007**: Failed host transcription MUST return typed setup/provider/missing-audio/empty outcomes with redacted recovery guidance.
- **FR-008**: Generated audio, transcripts, reports, and provider payloads MUST remain under ignored `artifacts/microphone-capture/` or an explicitly documented local app-data path.
- **FR-009**: No host/UI path may emit `paste_observed` without verified target observation evidence.
- **FR-010**: The boundary MUST be testable with fake env, fake audio reader, and fake fetch without real provider calls.

### Key Entities

- **Host Runtime Config**: Redacted provider/model/readiness information resolved outside React.
- **Host Transcription Request**: Captured artifact reference, run id, language/model hints, and explicit mode.
- **Host Transcription Response**: Typed success/failure outcome with transcript/recovery/evidence and no secrets.
- **Runtime Artifact Policy**: Allowed roots and file-write rules for local audio, reports, transcripts, and provider payloads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Readiness checks return redacted setup state without reading audio or calling providers.
- **SC-002**: Fake host transcription tests cover success, setup failure, provider failure, missing audio, and empty transcript.
- **SC-003**: No source-controlled file or command output contains provider credentials, raw provider payloads, or real transcript text.
- **SC-004**: Existing 005 pipeline/runtime tests remain green after introducing the host boundary.
- **SC-005**: Any UI wiring uses a fake/mock host client in tests and does not import provider-specific code into `src/App.tsx`.

## Assumptions

- 005 is complete and provides `ModelGateway`, Groq STT adapter, runtime script, redaction, recovery, and honest delivery evidence.
- First product slice may be TypeScript host/script helpers plus Tauri command design; actual React UI provider wiring can remain deferred if the Tauri boundary is not ready.
- Local personal/dev mode permits reading `.env` and real audio when explicitly approved, but not printing or committing secrets/transcripts.
- The first host boundary should be direct-local; proxied backend remains a later adapter unless explicitly selected.
