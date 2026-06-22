# Feature Specification: Desktop Dictation Control And Delivery

**Feature Branch**: `[010-desktop-dictation-control-delivery]`

**Created**: 2026-06-22

**Status**: Draft

**Input**: Post-009 fan-out decision: managed Fixvox STT and managed postprocess work; the next product slice should turn the existing capture/transcription runtime into a desktop-usable dictation loop with safe controls and honest delivery evidence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Control A Dictation Session End-To-End (Priority: P1)

A user can start, stop, cancel, retry, and observe one active dictation session from the app without creating overlapping captures, transcriptions, postprocess calls, or delivery attempts.

**Why this priority**: The app already has capture and managed transcription pieces. A session-level controller is the safest next layer before adding global hotkeys or background behavior.

**Independent Test**: With fake capture, fake host runtime, and fake delivery adapters, run start → stop → transcribe/postprocess → review and prove no-overlap, terminal states, cancellation, and retry behavior without provider calls or desktop side effects.

**Acceptance Scenarios**:

1. **Given** no active session, **When** the user starts dictation, **Then** the system enters a visible listening state and does not call a provider yet.
2. **Given** listening is active, **When** the user stops dictation, **Then** the captured clip is finalized, submitted through the existing host runtime boundary, and the session progresses to transcript review or a redacted terminal failure.
3. **Given** a session is active, **When** a second start/submit action is requested, **Then** the system rejects the overlapping action with recoverable guidance and preserves the original session.
4. **Given** capture, transcription, or delivery is in progress, **When** cancellation is accepted, **Then** the session reaches a terminal cancelled state and does not deliver partial text.

---

### User Story 2 - Deliver Text With Honest Desktop Evidence (Priority: P1)

A user receives successful dictation text through a delivery path that records only evidence the app can prove, while always keeping transcript review and manual copy fallback available.

**Why this priority**: Dictation becomes useful when text can leave the app, but product safety depends on not claiming paste observation or target insertion without proof.

**Independent Test**: Use fake delivery adapters to verify `available`, `copied`, `paste_sent`, `failed`, and `uncertain` states; assert that no default path emits `paste_observed`.

**Acceptance Scenarios**:

1. **Given** transcript text is available, **When** no desktop delivery is attempted, **Then** the session reports `available` and exposes manual copy.
2. **Given** transcript text is available and copy succeeds, **When** copy fallback runs, **Then** delivery evidence becomes `copied`, not `paste_observed`.
3. **Given** an unverified paste/send action is later enabled, **When** the action is sent, **Then** delivery evidence is at most `paste_sent` or `uncertain` unless a future observer proves insertion.
4. **Given** delivery fails, **When** the user inspects the result, **Then** transcript review remains visible with redacted recovery guidance.

---

### User Story 3 - Trigger Dictation From A Minimal Desktop Control (Priority: P2)

A user can trigger the same session controller through a host-owned desktop control, starting with fake/test events and then a minimal global hotkey once the contract is proven.

**Why this priority**: Desktop dictation should work while another app is focused, but global shortcuts and background lifecycle are side effects that must be introduced after session/delivery contracts are safe.

**Independent Test**: Feed fake host control events into the session controller and verify toggle start/stop/cancel behavior without registering a real global shortcut. A later gated manual check can register one fixed shortcut locally.

**Acceptance Scenarios**:

1. **Given** a fake host toggle event and no active session, **When** the event arrives, **Then** dictation starts through the same controller used by the app button.
2. **Given** a fake host toggle event during listening, **When** the event arrives, **Then** dictation stops and submits the captured clip through the same safe pipeline.
3. **Given** the host cannot register the real desktop control, **When** readiness is shown, **Then** the UI displays redacted setup guidance and keeps in-window controls available.

---

### User Story 4 - Recover Clearly Across Control, Runtime, And Delivery Failures (Priority: P2)

A user can understand what failed and what to do next when capture, host readiness, managed preflight, transcription, postprocess, desktop control, or delivery fails.

**Why this priority**: Failures are common in desktop dictation. Clear recovery prevents the app from feeling broken while preserving privacy and avoiding false claims.

**Independent Test**: Fake each failure class and verify redacted messages, retry-from-clip when possible, record-again guidance when needed, and copy fallback when text exists.

**Acceptance Scenarios**:

1. **Given** capture setup fails, **When** the session ends, **Then** the user sees record-again/device guidance without provider details.
2. **Given** managed cloud/preflight fails before transcription, **When** the session ends, **Then** the user sees setup/quota/backend guidance and no silent direct Groq fallback.
3. **Given** delivery fails after text is produced, **When** recovery is shown, **Then** the user can still copy or review the transcript.

---

### User Story 5 - Keep Background/Tray Behavior Minimal And Explicit (Priority: P3)

A user can optionally keep the app available for desktop dictation without accidentally quitting or adding broad tray/settings behavior before it is needed.

**Why this priority**: Background operation matters for hotkeys, but tray/window lifecycle can sprawl. It should be minimal and explicit.

**Independent Test**: Verify lifecycle state and UI copy with fakes. Real tray behavior remains a later gated slice if required.

**Acceptance Scenarios**:

1. **Given** background mode is not implemented, **When** the main window closes, **Then** the app behaves as today and does not claim background hotkey support.
2. **Given** a future tray slice is enabled, **When** the user closes the window, **Then** hide-vs-quit behavior is explicit and quit remains available.

### Edge Cases

- Host control event arrives while capture permission is pending.
- Start/stop toggles arrive rapidly or out of order.
- App window is unfocused while a session is active.
- Target app focus changes between start and delivery.
- Captured artifact is missing, stale, unreadable, or outside allowed roots.
- Managed cloud is configured but device/preflight/backend policy denies execution.
- Provider returns empty/unusable transcript or postprocess returns no useful output.
- Clipboard API or future host clipboard adapter is unavailable or denied.
- Delivery sends keystrokes/paste but target insertion cannot be observed.
- App is closed or restarted with an in-memory session.
- Desktop control registration fails or conflicts with another app.
- Any error includes secret-looking diagnostics, request ids, transcript text, or file paths that require redaction.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST introduce a session-level dictation controller that owns one active dictation attempt from control event through capture, host runtime, review, delivery, and terminal state.
- **FR-002**: The controller MUST prevent overlapping sessions and overlapping provider/delivery attempts.
- **FR-003**: The controller MUST support start, stop, cancel, retry-from-clip when a clip exists, and record-again guidance when no reusable clip exists.
- **FR-004**: Default tests and builds MUST NOT register global hotkeys, access real clipboard/focus APIs, call providers, or require microphone hardware.
- **FR-005**: React MUST continue to use renderer-safe ports/clients and MUST NOT own provider secrets, raw provider payloads, desktop side-effect internals, or silent fallback decisions.
- **FR-006**: Managed Fixvox cloud MUST remain the primary real STT/postprocess route when configured; direct Groq MUST remain explicit BYOK/dev fallback only.
- **FR-007**: Desktop control events MUST flow into the same controller path as in-window controls.
- **FR-008**: A real global hotkey MUST be host-owned, minimal, and gated behind tests/fakes before manual local verification.
- **FR-009**: Delivery evidence MUST distinguish `available`, `copied`, `paste_sent`, `failed`, `uncertain`, and future `paste_observed`.
- **FR-010**: No default path MAY emit or render `paste_observed` without a future verified target-observation contract.
- **FR-011**: Successful text MUST remain available for transcript review/manual copy even when delivery fails.
- **FR-012**: Delivery and recovery state SHOULD be ledger-derived rather than ad-hoc UI mutation where feasible.
- **FR-013**: Desktop target/focus evidence, if captured, MUST be best-effort, redacted, and explicitly separate from paste observation.
- **FR-014**: Generated audio, transcripts, reports, provider payloads, and sensitive desktop evidence MUST remain ignored/untracked unless JP explicitly requests a controlled exception.
- **FR-015**: UI copy MUST make cloud/provider use and delivery certainty honest before any action that sends audio/transcript externally or attempts desktop side effects.

### Key Entities

- **Desktop Dictation Session**: One end-to-end attempt, including control source, capture artifact, host runtime result, optional postprocess result, delivery evidence, recovery action, and terminal state.
- **Desktop Control Event**: A button, fake host event, or future global hotkey/tray event mapped to start, stop, cancel, or retry.
- **Delivery Request**: A request to make final text available outside the app, with strategy such as review-only, copy fallback, or future paste/send.
- **Delivery Evidence**: The proof level and status of delivery, never stronger than observed evidence.
- **Desktop Target Snapshot**: Optional best-effort metadata about the focused target before/after dictation; not proof of insertion.
- **Recovery Action**: A user-facing next step derived from terminal outcome and available artifacts/text.
- **Desktop Control Readiness**: Redacted readiness for hotkey/background/delivery capabilities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Provider-free tests prove one session can start, stop, complete, cancel, reject overlap, retry, and expose terminal state through fake adapters.
- **SC-002**: Delivery tests prove `available`, `copied`, `paste_sent`, `failed`, and `uncertain` behavior while forbidding default `paste_observed`.
- **SC-003**: Fake desktop control events exercise the same controller as app buttons without real hotkey registration.
- **SC-004**: Default verification (`npm run test:pipeline`, `npm run build`, `cd src-tauri && cargo check`) passes without provider calls or desktop side effects.
- **SC-005**: Any optional real hotkey/provider/delivery smoke is explicitly gated, local, redacted, and leaves secrets/artifacts untracked.
- **SC-006**: UI readiness explains managed cloud, direct BYOK fallback, desktop control, and delivery certainty without exposing secrets.

## Assumptions

- `009-fixvox-cloud-runtime-port` remains the source of truth for managed Fixvox cloud transport and fail-closed behavior.
- Existing native capture and host runtime commands remain available and should be orchestrated rather than rewritten.
- The first implementation batch can use fake desktop control and fake delivery adapters; real global hotkey/tray/paste can follow after contracts are green.
- Manual copy/review remains an acceptable first delivery path.
- Selected-text capture, replace-selection, Quick Chat, Assistant Mode, settings UI, durable dictation history, and verified paste observation are out of scope for this spec unless a later task explicitly narrows and approves one of them.
