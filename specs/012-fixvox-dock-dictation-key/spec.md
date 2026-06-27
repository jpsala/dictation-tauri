# Feature Specification: Fixvox-Like Voice Dock And Dictation Key

**Feature Branch**: `[012-fixvox-dock-dictation-key]`

**Created**: 2026-06-23

**Status**: Draft

**Input**: JP asked to respect the aesthetics, functionality, and end-to-end ergonomics of the dock and hotkeys in `C:\dev\fixvox`, and then asked to create the specs in the fewest practical steps so implementation does not drag on.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compact Fixvox-Like Voice Dock (Priority: P1)

JP can use a compact dock-like surface instead of the current large test panel, with clear visual states for idle, arming, recording, processing, completion, failure, and recovery.

**Why this priority**: The current app already has a working technical dictation loop, but it does not feel usable because the primary surface is still a test panel. Fixvox's dock is the desired ergonomic reference.

**Independent Test**: Provider-free UI tests render the dock in each state with synthetic controller/session data and assert visible labels, controls, VU/dots affordance, and no false paste-observed claim.

**Acceptance Scenarios**:

1. **Given** the app is idle, **When** the dock renders, **Then** it shows a compact launcher/mic affordance and no active stop/cancel controls.
2. **Given** capture is arming or recording, **When** the dock renders, **Then** stop/cancel controls are available and live VU/dots feedback is visible or simulated.
3. **Given** transcription or delivery is running, **When** the dock renders, **Then** a short processing chip communicates the current stage such as Transcribing, Cleaning up, Preparing output, or Delivering.
4. **Given** delivery is failed or uncertain, **When** the dock/recovery renders, **Then** copy/retry/recovery is visible and the UI does not claim observed paste.

---

### User Story 2 - One Dictation Key With Hold/Tap Semantics (Priority: P1)

JP can use one dictation key like Fixvox: hold to record a quick phrase and release to submit, or tap quickly to latch recording and tap again to stop longer dictation.

**Why this priority**: Fixvox's hotkey behavior is central to usability. A fixed toggle-only `Ctrl+Shift+F9` shortcut is a technical checkpoint, not the final UX.

**Independent Test**: Provider-free tests feed synthetic key `pressed`/`released` events into a dictation-key resolver and verify hold-to-stop, short-press latch, second press stop, duplicate guards, and Escape cancel routing.

**Acceptance Scenarios**:

1. **Given** no recording is active, **When** the dictation key is pressed and held longer than the short-press threshold, **Then** recording starts and stops/submits on release.
2. **Given** no recording is active, **When** the dictation key is pressed and released before the short-press threshold, **Then** recording stays latched until the next dictation-key action.
3. **Given** recording is latched, **When** the dictation key is pressed again, **Then** the app stops/submits the recording without starting a second session.
4. **Given** recording is active, **When** Escape is received, **Then** the app cancels and returns to honest recovery/idle state.

---

### User Story 3 - Dock Drives The Existing Real Dictation Loop (Priority: P2)

The Fixvox-like dock and dictation key drive the existing Tauri host capture/transcription flow that already passed E2E with managed Fixvox STT and copy fallback.

**Why this priority**: The UI must connect to the proven runtime path, not create a parallel demo-only implementation.

**Independent Test**: Controller seam tests prove dock actions and Tauri hotkey events call `DesktopDictationController`; gated manual smoke proves the real shortcut/dock path can produce a fresh WAV, transcribe, show review/recovery, and copy fallback.

**Acceptance Scenarios**:

1. **Given** the dock start action, **When** the user clicks the dock mic, **Then** the existing desktop controller starts capture.
2. **Given** the dock stop action, **When** capture stops, **Then** the existing host runtime/transcription path produces the same transcript review and delivery evidence as the current app.
3. **Given** the dock copy recovery action, **When** transcript text exists, **Then** copy fallback works without claiming paste observation.

---

### User Story 4 - Alt+Space Compatibility Decision (Priority: P3 / Gated)

The product has a clear decision path for converging to Fixvox's `Alt+Space` default if Tauri/Rust can support it robustly without AutoHotkey or unsafe side effects.

**Why this priority**: `Alt+Space` is the desired Fixvox-like default, but Windows reserves it and implementation can become fragile. It should not block the dock and hold/tap semantics.

**Independent Test**: A gated local spike records whether Tauri/global-shortcut can provide reliable press/release for `Alt+Space`; if not, a Rust-owned native hook/fallback decision is documented before implementation.

**Acceptance Scenarios**:

1. **Given** the current safe shortcut works with press/release semantics, **When** Alt+Space support is not yet proven, **Then** the app remains usable with a configurable/fallback dictation key.
2. **Given** explicit local approval for an Alt+Space smoke, **When** the smoke runs, **Then** evidence is recorded without secrets/transcripts and the spec states whether Alt+Space becomes default or remains future work.

---

### Edge Cases

- The key is pressed twice quickly or release arrives before start finishes.
- A recording start is in flight when a stop/cancel arrives.
- The active target changes while recording or processing.
- Real provider or managed preflight is unavailable.
- Microphone capture fails after the dock enters arming.
- Transcript exists but delivery/copy fails.
- The dock loses focus or is not visible while a hotkey event arrives.
- `Alt+Space` opens or conflicts with the Windows system menu.
- The dock is rendered in browser/dev without Tauri or microphone hardware.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a compact voice dock surface that adapts the Fixvox dock ergonomics documented in `docs/topics/fixvox-dock-and-hotkeys-reference.md`.
- **FR-002**: Dock UI MUST expose state through text/ARIA plus visual affordance; state MUST NOT rely on color alone.
- **FR-003**: Dock UI MUST render idle, arming/listening, processing/transcribing, completed/review, failed, cancelled, and uncertain recovery states.
- **FR-004**: Dock UI MUST show active stop/cancel controls only when recording/arming is active.
- **FR-005**: Dock UI SHOULD show VU/dots feedback during recording; if real amplitude is not yet available, tests may use synthetic levels and runtime may use a clear active animation.
- **FR-006**: System MUST implement one dictation-key semantics model with `pressed`, `released`, `cancel`, and dedupe/in-flight handling.
- **FR-007**: Dictation-key semantics MUST support hold-to-record and short-press toggle behavior with a documented threshold.
- **FR-008**: The existing `Ctrl+Shift+F9` shortcut MAY remain as the technical fallback, but the UX goal MUST be a configurable `Dictation key` compatible with Fixvox behavior.
- **FR-009**: Alt+Space support MUST be treated as gated until a Tauri/Rust route proves reliable on Windows; AutoHotkey MUST NOT become a product dependency.
- **FR-010**: Dock and hotkey default tests MUST remain provider-free and MUST NOT require real microphone hardware, real hotkey registration, clipboard/focus access, paste keys, or real selected text.
- **FR-011**: Dock actions MUST route through `DesktopDictationController` or its existing app-session facade; they MUST NOT create a parallel dictation state machine for capture/transcription.
- **FR-012**: Delivery/recovery UI MUST preserve transcript review and copy fallback when paste/delivery is uncertain or failed.
- **FR-013**: System MUST NOT claim `paste_observed` unless a separate verified observer contract exists.
- **FR-014**: Any new Tauri permissions, capabilities, windows, or native hooks MUST be documented in this spec/plan before implementation.

### Key Entities

- **VoiceDockState**: Derived UI state for dock phase, status text, controls, recovery, VU/dots levels, and accessibility label.
- **DictationKeyEvent**: Host or test event carrying `pressed`, `released`, or `cancel` with timestamp, shortcut, source, and optional target snapshot.
- **DictationKeyDecision**: Result of resolving a key event into controller actions: start, stop, cancel, ignore, latch, or defer.
- **DockCommand**: User action from the dock such as start, stop, stop-submit, cancel, retry, copy transcript, or paste-last safe.
- **DockRecoveryState**: User-facing recovery copy/action derived from session summary and delivery evidence.
- **DockWindowConfig**: Minimal geometry/behavior for the compact dock window or compact main-window mode.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Provider-free tests prove dock visual semantics for idle, arming/listening, processing, failed, and uncertain recovery states.
- **SC-002**: Provider-free tests prove dictation-key hold/tap semantics, dedupe, in-flight handling, and cancel behavior.
- **SC-003**: Dock actions call the existing controller/app-session path and preserve the current E2E runtime behavior.
- **SC-004**: A visual check or screenshot-based smoke verifies the dock is compact and Fixvox-like enough to replace the large test panel for day-to-day use.
- **SC-005**: Default verification (`npm run test:pipeline`, `npm run build`, `cd src-tauri && cargo check`) remains provider-free.
- **SC-006**: Gated manual smoke records whether current shortcut and/or Alt+Space can drive a real fresh WAV -> managed STT -> review -> copy fallback flow.

## Assumptions

- The first implementation should minimize steps by reusing the existing controller/runtime instead of rewriting capture, STT, or delivery.
- Real paste automation, selected-text capture, result history, Quick Chat, Assistant Mode, and `Alt+Q` are not part of the first dock/hotkey implementation slice.
- `Alt+Space` is the desired ergonomic direction, but can be a follow-up if it would delay the usable dock.
- Fixvox is a UX/product reference; legacy Fixvox desktop internals code is not copied as architecture.
