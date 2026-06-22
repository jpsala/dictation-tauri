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
