# Feature Specification: Fixvox Text Runtime Parity

**Feature Branch**: `[013-fixvox-text-runtime-parity]`

**Created**: 2026-06-25

**Status**: Draft

**Input**: JP clarified that Dictation Tauri should stop inventing the text/dictation process. For everything after the dock/user gesture and before final delivery, use what already works in Fixvox: recording/audio preparation, transcription service, prompts, routing/policy, postprocess, sanitizer, fallback, and materialized text behavior.

## Decision

Fixvox is the canonical implementation for the **process** of dictation text. Dictation Tauri keeps its own Tauri/Rust shell for windows, dock, hotkeys, tray, focus/clipboard, and packaging, but the text runtime must be adopted from Fixvox as directly as practical.

This is a change from earlier wording of "Fixvox as reference/adapt" for voice runtime. New rule:

> For dictation/text processing, prefer `adopt` from Fixvox over reinterpretation. Differences require a documented technical reason.

## User Scenarios & Testing

### User Story 1 - Same Text Process As Fixvox (P1)

JP dictates through Dictation Tauri and gets the same final text quality and behavior as Fixvox for normal dictation.

**Independent Test**: A fixture/golden test builds the same effective STT and postprocess requests as Fixvox for representative inputs, including prompt text, provider/model selection, postprocess user message shape, sanitizer behavior, and fallback behavior.

**Acceptance Scenarios**:

1. **Given** normal dictation audio, **When** Dictation Tauri prepares transcription, **Then** it uses the same effective Fixvox service contract, model/prompt policy, headers/device identity, and response parsing for the current managed runtime.
2. **Given** STT returns raw transcript text, **When** postprocess is enabled by the Fixvox-equivalent policy, **Then** Dictation Tauri builds the same system prompt and user message shape as Fixvox and calls the same managed chat completion contract.
3. **Given** postprocess returns explanation-like, empty, or too-long output, **When** the sanitizer runs, **Then** Dictation Tauri falls back/cleans exactly like Fixvox.
4. **Given** postprocess is disabled by policy, **When** output is materialized, **Then** Dictation Tauri uses raw transcript and records the same kind of redacted runtime evidence.

### User Story 2 - Copy/Adapt Code, Not Behavior (P1)

The implementation uses Fixvox code or a minimal extraction of it instead of rebuilding equivalent logic from memory.

**Independent Test**: Source annotations and focused tests identify the Fixvox source file/function for each copied/adapted process primitive.

**Acceptance Scenarios**:

1. **Given** a process primitive such as `buildRawVoicePostProcessSystemPrompt`, **When** it exists in Dictation Tauri, **Then** its source file/function in Fixvox is referenced in code or docs.
2. **Given** a divergence is necessary because Dictation Tauri uses Tauri/Rust instead of legacy Fixvox desktop internals, **When** the divergence is implemented, **Then** the behavior-level contract remains Fixvox-equivalent and the reason is documented.

### User Story 3 - Side-By-Side Parity Evidence (P2)

The team can compare Fixvox and Dictation Tauri against the same fixture/audio without exposing sensitive transcript contents in durable docs.

**Independent Test**: A local/gated parity harness produces redacted evidence: request shapes, provider/model IDs, text lengths/hashes, phase timings, and pass/fail parity notes.

**Acceptance Scenarios**:

1. **Given** a controlled audio sample, **When** the parity harness runs both paths or compares against a Fixvox captured snapshot, **Then** it reports whether raw transcript and final materialized output match or differ in a useful redacted way.
2. **Given** evidence is written to artifacts/docs, **When** it contains transcript-sensitive data, **Then** raw text is omitted unless JP explicitly requests otherwise for a local-only debug artifact.

## Requirements

- **FR-001**: Dictation Tauri MUST treat Fixvox as canonical for text/dictation processing: audio preparation, transcription request, prompt policy, postprocess, sanitizer, fallback, and output materialization.
- **FR-002**: Dictation Tauri MUST NOT invent new prompts, cleanup rules, or output processing for normal dictation unless a documented Fixvox divergence is approved.
- **FR-003**: The implementation MUST copy or minimally extract the Fixvox process primitives that are pure enough to reuse, especially prompt builders and sanitizer logic.
- **FR-004**: The implementation MUST keep Tauri-specific UI/shell/focus/clipboard/window code separate from the Fixvox text runtime compatibility layer.
- **FR-005**: The managed cloud service contracts MUST match Fixvox for `/v1/audio/transcriptions` and `/v1/chat/completions` where those are the active Fixvox contracts.
- **FR-006**: Provider/model/policy resolution MUST follow Fixvox effective runtime behavior for the local managed setup, including postprocess enablement and target selection.
- **FR-007**: Default automated tests MUST remain provider-free and must validate request construction, prompt text, sanitizer behavior, and routing decisions without calling real providers.
- **FR-008**: Real managed provider calls and side-by-side smokes are gated/local; evidence must be redacted by default.
- **FR-009**: If Fixvox currently depends on legacy Fixvox desktop app state for a process decision, Dictation Tauri MUST either port the minimum state/policy needed or document the temporary gap.
- **FR-010**: Normal dictation parity is first. Selection transform, assistant mode, Quick Chat, wake words, and full preset UX remain out of scope unless they are required by the normal dictation path.

## Out Of Scope

- Replacing the Tauri dock/hotkeys/tray/companion UI with Fixvox UI code.
- Depending on a running Fixvox desktop app.
- Porting all Fixvox assistant, picker, wake-word, settings UI, or selection-transform UX in this slice.
- Logging raw transcripts to durable docs by default.

## Key Entities

- **FixvoxTextRuntime**: Compatibility layer in Dictation Tauri that exposes the normal dictation text process using Fixvox-equivalent behavior.
- **FixvoxTextRuntimePolicy**: Effective provider/model/prompt/postprocess enablement and service target configuration.
- **RawTranscript**: STT output before cleanup/postprocess.
- **MaterializedTextOutput**: Final text after postprocess/sanitizer/fallback and before delivery.
- **ParityEvidence**: Redacted local artifact for comparing request shape, raw/final text hashes/lengths, provider/model, timings, and route decisions.

## Success Criteria

- **SC-001**: Focused provider-free tests prove copied/adapted Fixvox prompt builders and sanitizer match Fixvox fixtures.
- **SC-002**: Request-preview tests prove Dictation Tauri builds the same STT and chat-completion contracts as Fixvox for managed runtime.
- **SC-003**: The real dock stop path uses Fixvox-equivalent materialized text output, not raw STT direct-to-paste except when Fixvox policy disables postprocess.
- **SC-004**: A gated parity smoke records redacted evidence for at least one controlled audio sample.
- **SC-005**: `npm run test:pipeline`, `npm run build`, and `cd src-tauri && cargo check` pass.
