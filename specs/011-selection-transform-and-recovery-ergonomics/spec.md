# Feature Specification: Selection Transform And Recovery Ergonomics

**Feature Branch**: `[011-selection-transform-and-recovery-ergonomics]`

**Created**: 2026-06-22

**Status**: Draft

**Input**: User direction after `010` safe scope: "hace todo lo que puedas" across selected-text spec, paste/recovery batch, and optional real hotkey spike while preserving existing side-effect gates.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Model Selection Context Without OS Capture (Priority: P1)

A developer can run provider-free tests that simulate selected text and target metadata so selection-aware dictation behavior is designed before any real OS selection capture is attempted.

**Why this priority**: Selection transform is the first early post-MVP expansion, but real selection capture is a desktop side effect. Contracts and fixtures must come first.

**Independent Test**: Provider-free tests construct a selected-text context, pass it through a transform request, and verify redacted evidence without reading the real desktop selection.

**Acceptance Scenarios**:

1. **Given** fixture selected text and a spoken instruction transcript, **When** a selection transform request is created, **Then** the request includes redacted target/selection evidence and no real OS capture is required.
2. **Given** no selected text is available, **When** the dictation flow evaluates routing, **Then** it remains a direct dictation flow and does not imply replace-selection delivery.

---

### User Story 2 - Transform Selected Text With Safe Presets (Priority: P1)

A developer can verify a small set of deterministic or provider-free selection transform presets, such as rewrite, shorten, or bulletize, using fixtures before connecting managed postprocess.

**Why this priority**: Selection transform differentiates the product from plain STT, but quality and privacy must be measurable before real text capture/provider calls.

**Independent Test**: Fixture tests run preset transforms against sample selected text and assert expected output/recovery for unsupported presets.

**Acceptance Scenarios**:

1. **Given** selected text and a supported preset, **When** transform runs in provider-free mode, **Then** an output is produced with preset id/model evidence and no provider call.
2. **Given** an unsupported preset, **When** transform runs, **Then** the flow fails with actionable recovery and preserves the original selection text in fixture scope only.

---

### User Story 3 - Reuse The Last Result Ephemerally (Priority: P2)

After a transcript is available, the app keeps the latest output in memory so the user can copy or paste-last without requiring durable history.

**Why this priority**: Paste-last is useful and small, but persistent result history is sensitive and still a research item.

**Independent Test**: UI/provider-free tests produce a transcript summary, verify latest-result state is populated, and verify copy-last/recovery behavior after a delivery failure.

**Acceptance Scenarios**:

1. **Given** a completed run with output, **When** the user chooses paste/copy last, **Then** the app uses the latest in-process output and records honest delivery evidence.
2. **Given** no latest output exists, **When** paste/copy last is requested, **Then** the app shows a safe recovery message instead of using stale or durable history.

---

### User Story 4 - Recovery UI Makes Uncertain Delivery Actionable (Priority: P2)

When delivery is uncertain or failed, the UI offers clear next actions such as copy, paste-last, retry captured run, or record again without claiming paste observation.

**Why this priority**: 010 already models recovery; the next step is ergonomic presentation that keeps transcripts recoverable.

**Independent Test**: Visual/provider-free tests render failed/uncertain delivery summaries and verify the recovery actions and copy fallback remain visible.

**Acceptance Scenarios**:

1. **Given** delivery failed but transcript text exists, **When** the review surface renders, **Then** it offers copy fallback and preserves review text.
2. **Given** delivery was only sent or copied, **When** evidence renders, **Then** the UI labels confidence honestly and never displays `paste_observed`.

---

### Edge Cases

- Selected text is very long, empty, whitespace-only, or includes secret-looking data.
- User changes foreground target between capture and delivery.
- Transform output is empty or lower quality than original selected text.
- Last result is cleared by app reload, cancellation, or new empty/error run.
- Clipboard copy fails after transcript review is available.
- Provider/managed postprocess is unavailable; provider-free fixtures must still pass.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define renderer-safe types for optional selection context, including selected text, target evidence, confidence, and redaction metadata.
- **FR-002**: System MUST keep real OS selection capture out of default tests and out of the first implementation slice.
- **FR-003**: System MUST route direct dictation and selection transform separately; missing selected text MUST fall back to direct dictation or a clear recovery state.
- **FR-004**: System MUST support provider-free transform fixtures before managed/provider transforms.
- **FR-005**: System MUST record transform evidence without printing secrets, full raw targets, or provider payloads.
- **FR-006**: System MUST maintain only the latest output in memory for paste/copy-last; durable result history is out of scope.
- **FR-007**: System MUST preserve transcript/review text after delivery failure and expose copy fallback.
- **FR-008**: System MUST NOT claim `paste_observed` unless a future verified observer contract exists.
- **FR-009**: System MUST keep managed/provider calls behind explicit gates consistent with earlier specs.
- **FR-010**: System MUST keep real desktop side effects (selection capture, focus, paste automation) host-owned and gated behind future tasks.

### Key Entities

- **SelectionContext**: Optional selected text plus target evidence and confidence, sourced from fixtures first and later host capture.
- **SelectionTransformRequest**: Selected text, transcript/instruction, preset id, mode, and provider gate.
- **SelectionTransformResult**: Output text, action (`replace_selection`, `insert`, `copy`), evidence, and recovery hints.
- **LatestResult**: Ephemeral in-process output from the most recent successful transcript/transform.
- **RecoveryAction**: User-facing action such as copy manually, copy last, retry, record again, or inspect setup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Provider-free tests cover direct dictation vs selection-transform routing without real selection capture.
- **SC-002**: At least three fixture transform cases pass: rewrite, shorten, and unsupported preset recovery.
- **SC-003**: Latest-result behavior is covered by UI or controller tests and does not persist across app reload by design.
- **SC-004**: Delivery/recovery UI tests verify copy fallback remains available after delivery failure.
- **SC-005**: Default verification (`npm run test:pipeline`, `npm run build`, `cd src-tauri && cargo check`) remains provider-free.

## Assumptions

- Initial implementation is TypeScript/provider-free and fixture-backed.
- Real OS selection capture, replace-selection observation, and durable history require later explicit approval/spec tasks.
- Existing 010 controller/delivery evidence contracts remain the base for recovery and delivery confidence.
- Managed cloud postprocess can be connected later through the existing host/runtime boundaries, not from React directly.
