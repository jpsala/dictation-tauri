# Research: Fixvox-Like Voice Dock And Dictation Key

## Decision: Fixvox is the UX reference, not the architecture source

**Decision**: Adapt the behavior and ergonomics from `C:/dev/fixvox`, especially `src/app/views/voice-dock/` and `src/app/backend/hotkeys.ts`, but do not port Electrobun/Bun architecture or copy implementation files.

**Rationale**: JP explicitly finds the Fixvox dock and hotkeys useful end-to-end. Dictation Tauri already has a Rust/Tauri runtime boundary and should keep side effects host-owned.

**Alternatives considered**:

- Copy Fixvox files: rejected because Svelte/Electrobun/Bun architecture does not match this Tauri/React app.
- Continue polishing the current large panel: rejected as the main path because it does not match the desired daily-use ergonomics.

## Decision: One spec, four implementation checkpoints

**Decision**: Keep dock and dictation-key work in one spec, but split implementation into four checkpoints: contracts, dock UI, Tauri key integration, gated real smokes/Alt+Space decision.

**Rationale**: Splitting into too many specs would slow implementation. Combining everything into one batch would mix UI, hotkeys, Tauri events, manual side effects, and optional Alt+Space risk.

**Alternatives considered**:

- Separate specs for dock and hotkeys: rejected for now because the UX depends on them working together.
- Implement Alt+Space first: rejected because Windows-reserved hotkeys could delay the usable dock.

## Decision: Validate hold/tap semantics with provider-free TS first

**Decision**: Implement a small provider-free `dictation-key` resolver that consumes synthetic `pressed`/`released`/`cancel` events and emits controller actions.

**Rationale**: Fixvox's key behavior is subtle: hold-to-record, short-press toggle, second press stop, release races, dedupe, and in-flight guards. These can be proven without real hotkey registration.

**Alternatives considered**:

- Encode behavior directly in React: rejected because hotkey semantics should be independent of UI.
- Encode behavior only in Rust: rejected for first slice because tests and UI need a renderer-safe state model.

## Decision: Reuse existing controller/runtime for real dictation

**Decision**: Dock actions and dictation-key decisions must route through the existing `DesktopDictationController` / app-session facade.

**Rationale**: Specs 010/011 already hardened session states, no-overlap, recovery, and delivery evidence. A parallel dock runtime would reintroduce bugs.

**Alternatives considered**:

- New dock-specific pipeline: rejected as duplicate state.
- Keep current App buttons as primary UX: rejected as not Fixvox-like enough.

## Decision: Dock VU/dots can start synthetic/fallback

**Decision**: The dock should have VU/dots feedback. If real amplitude is not yet exposed from Rust capture, first runtime may use active animation while tests use synthetic levels.

**Rationale**: Fixvox's live audio feedback is valuable, but exposing true amplitude can be a separate host-capture refinement. The usable dock should not wait on amplitude telemetry.

**Alternatives considered**:

- Block until real amplitude stream exists: rejected because it delays usable UI.
- Omit VU/dots: rejected because it loses an important part of the Fixvox dock feel.

## Decision: Alt+Space is a gated compatibility decision

**Decision**: Treat `Alt+Space` as the target ergonomic default only after proving a robust Tauri/Rust route. Do not add AutoHotkey as a dependency.

**Rationale**: Fixvox needed a special native hook because Windows reserves `Alt+Space`. Tauri's global shortcut plugin may not be enough. The app can become usable first with the same hold/tap semantics on a safe fallback key.

**Alternatives considered**:

- Make Alt+Space mandatory in the first implementation: rejected due risk.
- Ignore Alt+Space permanently: rejected because JP asked to respect Fixvox hotkeys.

## Decision: No paste automation, selection capture, Quick Chat, or history in first slices

**Decision**: This spec focuses on dock + dictation key + existing transcript/recovery flow. Real paste automation, selection capture, Quick Chat, result history, and `Alt+Q` remain outside the first implementation slices.

**Rationale**: Each of those crosses separate side-effect or product gates and would slow the core usable loop.
