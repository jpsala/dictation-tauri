# Feature Specification: Synthetic Audio STT

**Feature Branch**: `003-synthetic-audio-stt`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "MVP 2: audio sintetico + STT real sobre fixtures. Preparar SpecKit, no implementar runtime real todavia."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Define Synthetic Audio Fixtures (Priority: P1)

As the project owner, I want a controlled fixture manifest for synthetic dictation audio so that MVP 2 can run repeatable STT checks without microphone capture or manual speech.

**Why this priority**: Real STT needs audio inputs with known expected text. The fixture contract must exist before any provider call, benchmark runner, or adapter implementation.

**Independent Test**: A manifest validation check loads all fixture entries, confirms required metadata and expected text, and verifies that missing local audio is reported as a setup issue rather than a product failure.

**Acceptance Scenarios**:

1. **Given** a clean checkout with only source-controlled fixture metadata, **When** fixture validation runs, **Then** every fixture has an id, language, expected text, intended audio path, source type, and sensitivity classification.
2. **Given** generated audio artifacts are absent, **When** fixture validation runs, **Then** the result explains which local artifact must be generated or restored without requiring microphone access.
3. **Given** a fixture contains expected text, **When** it is used for STT evaluation, **Then** the comparison target is deterministic and versioned if it is synthetic and non-sensitive.

---

### User Story 2 - Run Real STT Over Fixtures (Priority: P2)

As a developer, I want a local harness to transcribe synthetic fixture audio through the first real `ModelGateway` adapter so that provider behavior can be measured against expected text before microphone work.

**Why this priority**: This is the first real model integration. It must prove the adapter contract without moving secrets into the React UI or introducing desktop side effects.

**Independent Test**: A command runs one configured fixture through a real local STT adapter when provider credentials are available and emits a structured report with provider/model, timings, transcript, expected text comparison, and redacted errors. A separate dry-run/mock path remains available when credentials are absent.

**Acceptance Scenarios**:

1. **Given** a fixture audio file exists and local provider variables are configured, **When** the harness transcribes the fixture, **Then** it records transcript text, provider, model, latency, and request metadata that excludes secrets.
2. **Given** provider variables are absent, **When** the real STT command is requested, **Then** it fails with a setup status and redacted diagnostic details rather than reading or printing secrets.
3. **Given** the STT provider returns an error, **When** the harness completes, **Then** the pipeline event ledger reaches a terminal error state with no misleading final text.
4. **Given** the STT adapter succeeds, **When** the run summary is derived, **Then** it uses the same pipeline service and event-ledger contract as MVP 1.

---

### User Story 3 - Produce Benchmark Evidence (Priority: P3)

As a developer, I want each fixture STT run to produce local evidence so that quality, latency, cost, and artifact handling are inspectable across repeated runs.

**Why this priority**: MVP 2 closes on evidence, not on a UI demo. The evidence must be useful for provider/model decisions and for deciding when microphone work is worth starting.

**Independent Test**: A report-generation check reads one or more run summaries and writes a local report that compares expected text, transcript, optional postprocess output, latency, estimated cost, and artifact paths without committing generated audio or transcripts.

**Acceptance Scenarios**:

1. **Given** a completed fixture STT run, **When** the report is inspected, **Then** it includes fixture id, audio metadata, provider/model, latency, cost estimate when available, expected text, transcript, optional postprocess output, and redacted errors.
2. **Given** generated artifacts are written locally, **When** repository status is checked, **Then** audio, transcripts, and reports live in documented gitignored paths unless a spec explicitly marks a synthetic manifest or phrase list as versioned.
3. **Given** multiple STT runs exist for the same fixture, **When** reports are compared, **Then** the result identifies provider/model differences without treating any local artifact as durable product storage.

### Edge Cases

- Generated audio is missing, corrupt, empty, or uses an unsupported format.
- Manifest text and audio content are mismatched.
- Provider credentials are absent, malformed, expired, or only available under alternate local variable names.
- STT returns empty text, low-confidence text, partial text, non-deterministic punctuation, or wrong language.
- Provider reports no cost headers or no request id.
- Network/provider timeout occurs after partial metadata exists.
- A second run is requested while the pipeline service has an active real STT run.
- Local artifacts contain real user audio or transcript data and therefore must remain gitignored.
- Optional postprocess is unavailable; STT evidence must still be valid.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST define a source-controlled fixture manifest for synthetic audio STT evaluation.
- **FR-002**: The fixture manifest MUST include fixture id, language, expected text, audio artifact path, audio source type, format, duration if known, sensitivity classification, and versioning policy.
- **FR-003**: The system MUST distinguish source-controlled synthetic metadata from generated/local artifacts.
- **FR-004**: The system MUST keep generated audio, transcripts, provider responses, and benchmark reports out of version control unless a later spec explicitly promotes a synthetic artifact.
- **FR-005**: The system MUST support fixture validation without microphone access, hotkeys, tray behavior, real clipboard/paste, selected-text capture, settings UI, or product persistence.
- **FR-006**: The system MUST add a `ModelGateway` real local adapter contract for STT that matches the mockable port used by MVP 1.
- **FR-007**: The first real `ModelGateway` adapter MUST resolve provider credentials only from local host/script/Tauri boundaries, never from React UI state.
- **FR-008**: The STT result MUST include transcript text or a redacted error, provider, model, latency, request id when available, cost estimate when available, and audio metadata.
- **FR-009**: The pipeline service MUST remain the owner of active runs, cancellation/no-overlap, event emission, and summary derivation.
- **FR-010**: The UI MUST remain an observer of pipeline events and MUST NOT own STT transitions or provider calls.
- **FR-011**: The system MUST allow a dry-run or mock verification path that does not call providers, for routine checks and CI-safe validation.
- **FR-012**: The system MUST provide a real-provider path that can run locally when required environment variables are present.
- **FR-013**: The system MUST redact secrets and sensitive provider diagnostics from events, reports, logs, test output, and assistant responses.
- **FR-014**: The system MUST compare transcript output against expected fixture text using a documented normalization policy.
- **FR-015**: The system MUST record STT evidence as local reports with fixture id, expected text, transcript, optional postprocess output, provider/model, latency, cost estimate, and artifact paths.
- **FR-016**: The system MUST keep optional postprocess as a separate measured stage and MUST NOT make it required for closing STT fixture validation.
- **FR-017**: The system MUST NOT implement real microphone capture, global hotkeys, tray integration, real selected-text capture, real clipboard/paste, settings UI, or durable product persistence in MVP 2.
- **FR-018**: Tauri/Rust side effects MUST be deferred unless a task explicitly requires a host boundary for secrets or filesystem access; no desktop side effect is required by this planning batch.

### Key Entities *(include if feature involves data)*

- **Synthetic Audio Fixture**: A controlled dictation sample with expected text and metadata that can be used for repeatable STT evaluation.
- **Fixture Manifest**: The versioned index of synthetic fixtures and their artifact policy.
- **Audio Artifact**: A generated or local audio file used by the harness; normally gitignored and replaceable.
- **ModelGateway Adapter**: A provider-specific implementation of the transcription port, starting with a direct local adapter.
- **STT Run**: One pipeline execution that transcribes a fixture audio artifact through a gateway adapter.
- **STT Result**: Transcript or redacted error plus provider/model/timing/cost/audio metadata.
- **Benchmark Report**: Local evidence produced from one or more STT runs; not durable product storage.
- **Artifact Policy**: Rules that classify paths as versioned, gitignored local, app data, or temporary.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fixture manifest validation check passes for all versioned synthetic fixtures without microphone access or provider credentials.
- **SC-002**: A dry-run/mock STT path remains green through `npm run test:pipeline`.
- **SC-003**: A local real-provider STT run can transcribe at least one synthetic fixture when credentials are present and produce a structured evidence report.
- **SC-004**: The report includes provider/model, latency, cost estimate when available, expected text, transcript, and artifact paths for every completed run.
- **SC-005**: Generated audio, transcripts, provider payloads, and reports do not appear in `git status` unless intentionally versioned as synthetic metadata.
- **SC-006**: MVP 1 cancellation, no-overlap, event ledger, and summary tests remain green after MVP 2 fixture/STT work.
- **SC-007**: A new agent can understand how to generate/restore audio artifacts, run dry checks, run a real STT fixture, and inspect reports from the spec quickstart.

## Assumptions

- MVP 2 is a model/fixture evidence milestone, not a microphone or desktop-delivery milestone.
- The initial real adapter is direct local through `ModelGateway`; proxied routing remains a later spike.
- Provider choice can be configured locally, but the spec does not require hardcoding one provider as product truth.
- Local development may use `.env` or environment variables by name, but this batch must not call providers or print secrets.
- Synthetic expected text can be versioned when non-sensitive; generated audio and transcripts should default to gitignored local artifacts.
- Human audio samples may be used only as local reference artifacts if a later task explicitly chooses them; they are not source-controlled fixtures for MVP 2.
- Postprocess can be measured after STT but remains optional and separate from transcription validation.
