# Research: Selection Transform And Recovery Ergonomics

## Decision: Start selection-aware work with fixtures and contracts

**Decision**: Do not capture real selected text from Windows in the first 011 slice. Define `SelectionContext` and transform contracts, then test with synthetic fixtures.

**Rationale**: `docs/topics/selection-and-assistant-actions.md` already says real selected text is post-MVP and fixtures are allowed first. Real capture requires focus/clipboard/UI Automation choices and can leak sensitive text.

**Alternatives considered**:

- Clipboard roundtrip immediately: rejected for first slice because it mutates user clipboard and requires target/focus policy.
- UI Automation immediately: rejected for first slice because previous Fixvox learnings warn against fragile UIA/Koffi/Python/PowerShell hot paths.
- App-specific adapters: parked until there is a concrete target app.

## Decision: Provider-free transform presets before managed postprocess

**Decision**: Implement deterministic fixture-backed transforms before calling managed cloud postprocess.

**Rationale**: Default checks must stay provider-free; deterministic transforms prove routing, evidence, and recovery without cost/secrets.

**Alternatives considered**:

- Managed postprocess first: rejected because provider gates and policy should be integrated only after safe contracts pass.
- Prompt-only design docs: rejected because tests should prove behavior before UI/product copy grows.

## Decision: Latest result is in-memory only

**Decision**: Store the latest transcript/transform output only in process memory for this spec.

**Rationale**: Paste-last is useful, but result history is sensitive and marked `research` in `fixvox-capability-map`. In-memory state gives ergonomics without persistence commitments.

**Alternatives considered**:

- Durable history: rejected pending privacy/retention spec.
- No latest result: rejected because recovery/paste-last is an early post-MVP candidate and can be safe if ephemeral.

## Decision: Recovery UI builds on 010 evidence semantics

**Decision**: Reuse 010 delivery evidence (`available`, `copied`, `paste_sent`, `uncertain`, `failed`) and recovery actions. Do not introduce `paste_observed`.

**Rationale**: 010 already hardened evidence and redaction. The next step is clearer presentation and actions, not stronger claims.

**Alternatives considered**:

- Add paste observation now: rejected because no verified observer exists.
- Hide uncertainty: rejected by product principle "Recovery beats confidence theater".

## Decision: Real hotkey remains in 010, selection capture remains future 011

**Decision**: The optional real hotkey spike is tracked in `010` because it controls dictation start/stop. Real selection capture is not part of that spike and remains future gated work from 011.

**Rationale**: Mixing hotkey registration, selected-text capture, transform routing, and recovery UI would violate Small Batch discipline.

## Decision: Minimal Windows selection capture route

**Decision**: The first real Windows selection capture route, if later approved, should be host-owned and non-mutating by default: a Tauri/Rust command attempts Windows UI Automation against the current foreground/focused text control and returns a typed `SelectionCaptureOutcome`. It must not be callable from default tests, must not run on app startup, and must not use clipboard roundtrips, paste keys, provider calls, or durable storage in the initial implementation.

**Rationale**: Selected text is sensitive and Windows does not provide a universal selected-text API for all applications. UI Automation can retrieve selected text from cooperating text controls without mutating the user's clipboard, while failures are expected and can be mapped honestly to direct dictation or review-only recovery. Keeping this in Rust/Tauri preserves the existing desktop side-effect boundary from 010.

**Failure behavior**:

- `unsupported_platform`: non-Windows or unavailable host adapter; route to direct dictation.
- `no_foreground_target`: no eligible foreground/focused target; route to direct dictation.
- `unsupported_target`: target exposes no usable UI Automation text selection pattern; show recovery and keep direct dictation available.
- `no_selection`: target is usable but has no non-empty selection; direct dictation remains the default route.
- `timeout`: capture exceeds a short bounded timeout; do not retry indefinitely.
- Target metadata that looks secret-like or too detailed is redacted in evidence; redaction is metadata, not a separate success claim.

**Guardrails for later implementation**:

- Host result shape follows `SelectionCaptureOutcome`, with explicit status/reason and redacted target evidence.
- Captured text may flow into an in-memory `SelectionContext` for the active transform only; do not log or persist raw selection.
- Limit captured text length before crossing to the renderer and mark truncation in evidence.
- Clipboard roundtrip (`Ctrl+C`, read/restore clipboard) is not part of this route; it requires a separate explicit decision because it mutates clipboard/focus and may send keys.
- Replace-selection/paste automation remains out of scope; captured selection only enables transform/review routing.

**Alternatives considered**:

- Clipboard roundtrip first: rejected for T036 because it mutates clipboard and typically requires sending copy keys to the foreground app.
- Third-party capture library first: deferred until boundary tests exist; useful only if it preserves non-mutating defaults and exposes deterministic failure statuses.
- Screenshot/OCR selection detection: rejected for now due privacy risk, fragility, and false positives.
- App-specific adapters: deferred until a concrete target app requires higher reliability.
