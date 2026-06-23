# Implementation Plan: Fixvox-Like Voice Dock And Dictation Key

**Branch**: `[012-fixvox-dock-dictation-key]` | **Date**: 2026-06-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-fixvox-dock-dictation-key/spec.md`

## Summary

Turn the working technical dictation loop into a usable Fixvox-like desktop experience with the fewest safe implementation checkpoints: shared dock/key contracts, compact React dock UI, one hold/tap dictation-key state machine, wiring into the existing `DesktopDictationController`, then gated real-window/hotkey smokes. Alt+Space compatibility is important but explicitly separated so it does not block the usable dock.

## Technical Context

**Language/Version**: TypeScript strict, React, Vite; Rust 2021; Tauri v2

**Primary Dependencies**: Existing React/Vite app, `DesktopDictationController`, Tauri v2 invoke/event boundary, current Rust `tauri-plugin-global-shortcut` path, existing capture/runtime/delivery adapters. No new dependency is required for the first provider-free slices.

**Storage**: No new durable storage in the first implementation. Dock position/settings and configurable hotkey are deferred unless explicitly included in a later gated batch.

**Testing**: Vitest through `npm run test:pipeline`; Playwright visual smoke through `npm run visual:check`; TypeScript build through `npm run build`; Rust compile through `cd src-tauri && cargo check`.

**Target Platform**: Windows desktop through Tauri v2 first. Browser/dev must render fixture/fake states without real microphone or hotkeys.

**Project Type**: Desktop app with React renderer and Rust/Tauri host.

**Performance Goals**: Dock state updates should feel immediate. Provider-free dock/key tests should run within the existing test suite. Runtime hotkey handling must dedupe repeated key events within a short window and avoid overlapping recording sessions.

**Constraints**:

- Default tests must not register real hotkeys, access real clipboard/focus APIs, send paste keys, call providers, capture real selected text, or require microphone hardware.
- Do not introduce AutoHotkey as a product dependency.
- Do not implement real paste automation or selected-text capture in this spec's first slices.
- Do not create a parallel dictation runtime; dock and key actions must route through existing controller/app-session seams.
- Any Tauri window/capability/native-hook change must be compile-guarded and documented before manual smoke.

**Scale/Scope**: One local desktop user, one active dictation session at a time, one primary dock surface.

## Constitution Check

- **Human-Centered Outcomes**: Pass. The goal is JP's usable dock/hotkey workflow, not internal refactor.
- **Privacy And Data Boundaries**: Pass. Default checks are provider-free and do not expose transcripts or selected text.
- **Durable Operational State**: Pass. No new persistence in first slices; hotkey config/dock position deferred.
- **Spec-Led Incremental Delivery**: Pass. Tasks are grouped into four large but verifiable checkpoints to avoid microbatch drag.
- **Surface-Appropriate Design**: Pass. Dock follows `PRODUCT.md`, `DESIGN.md`, and `docs/topics/fixvox-dock-and-hotkeys-reference.md`.

## Project Structure

### Documentation (this feature)

```text
specs/012-fixvox-dock-dictation-key/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   └── voice-dock-and-dictation-key.md
├── quickstart.md
└── tasks.md
```

### Source Code (expected touch points)

```text
src/
├── App.tsx                         # wire compact dock surface to existing app state
├── styles.css                      # dock utility overlay styling, visual states
├── voice-dock/                     # new renderer-safe dock state/components
│   ├── types.ts
│   ├── visual-semantics.ts
│   ├── VoiceDock.tsx
│   └── index.ts
├── desktop-control/
│   ├── dictation-key.ts            # provider-free hold/tap resolver
│   ├── tauri-host-control.ts       # pressed/released payload mapping
│   └── app-session.ts              # reuse existing facade, only small additions if needed
└── delivery/                       # reuse evidence; no paste_observed expansion

src-tauri/src/
├── desktop_control.rs              # emit pressed/released/cancel-capable payloads for current shortcut
└── lib.rs                          # only if dock window behavior or command registration changes

tests/
├── voice-dock/
│   ├── dock-visual-semantics.test.ts
│   └── voice-dock-ui.test.tsx
├── desktop-control/
│   ├── dictation-key.test.ts
│   └── app-hotkey-toggle.test.ts
└── visual/
    └── app-smoke.spec.ts
```

**Structure Decision**: Add a small `src/voice-dock/` module for renderer-safe dock state and componentry, plus `src/desktop-control/dictation-key.ts` for hotkey semantics. Keep Rust/Tauri work limited to event payload semantics until the dock is visually and behaviorally proven with provider-free tests.

## Implementation Phases

### Phase 0 - Research Lock

Use `docs/topics/fixvox-dock-and-hotkeys-reference.md` and the Fixvox files it cites as the UX source. Lock the minimal path: dock UI + hold/tap semantics first, Alt+Space compatibility gated later.

### Phase 1 - RED/GREEN: Dock And Dictation-Key Contracts

Write provider-free tests for dock visual semantics and dictation-key press/release decisions, then implement the small TS contracts/helpers.

### Phase 2 - GREEN: Compact React Dock Surface

Build `VoiceDock` and wire it to existing app/session state. Keep current buttons available only if needed for dev/debug, but the usable surface should become the dock-like UI.

### Phase 3 - GREEN: Tauri Press/Release Integration

Extend current Tauri global-shortcut event payload from toggle-only toward `pressed`/`released` semantics for the current safe shortcut, then route through `dictation-key.ts` to the existing controller.

### Phase 4 - Gated Runtime Smokes And Alt+Space Decision

Run manual Tauri smoke with the safe shortcut. Separately, with explicit approval, test or spike `Alt+Space`. If robust, document default migration; if not, keep a configurable fallback and defer a Rust native hook decision.

### Phase 5 - Verification And Docs Sync

Run focused tests, full safe checks, visual smoke, cargo check, artifact hygiene, and update Working Memory/tasks.

## Checks

Default safe checks:

```powershell
npm run test:pipeline -- tests/voice-dock tests/desktop-control/dictation-key.test.ts tests/desktop-control/app-hotkey-toggle.test.ts
npm run test:pipeline
npm run build
cd src-tauri && cargo check
```

Additional UI check:

```powershell
npm run visual:check
```

Docs/context checks:

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Gated/local only:

```powershell
npm run tauri:dev
# manual: current dictation key -> fresh WAV -> managed STT -> review -> copy fallback
# optional manual: Alt+Space compatibility smoke
```

## Privacy / Security

- Audio, transcripts, prompts, targets, and recovery logs are sensitive.
- Tests must use synthetic transcript text only.
- Manual smoke evidence must be redacted and must not include raw transcript content, selected text, provider payloads, or secrets.
- No new clipboard/focus/paste automation enters this spec unless a later explicit gate updates the plan.

## Open Questions

- Can Tauri's global-shortcut plugin reliably deliver release events for the current safe shortcut on Windows?
- Can `Alt+Space` be supported robustly without opening the Windows system menu and without AutoHotkey?
- Should the first dock be a compact main window, a second floating window, or a main-window mode that later becomes floating? The implementation should choose the least risky path that gives JP a usable dock quickly.
