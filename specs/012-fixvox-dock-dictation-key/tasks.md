# Tasks: Fixvox-Like Voice Dock And Dictation Key

**Input**: Design documents from `specs/012-fixvox-dock-dictation-key/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/voice-dock-and-dictation-key.md`, `quickstart.md`

**Tests**: Required for every implementation checkpoint. Default tests must remain provider-free and must not register real hotkeys, access clipboard/focus APIs, send paste keys, call providers, read selected text, or require microphone hardware.

**Organization**: Intentionally fewer, larger checkpoint tasks to avoid dragging this out. Execute one checkpoint at a time; each checkpoint should be reviewable, testable, and reversible with one commit.

## Phase 1: Spec Setup And Guardrails

**Purpose**: Lock the minimum path and references before implementation.

- [x] T001 Create `specs/012-fixvox-dock-dictation-key/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/voice-dock-and-dictation-key.md`, `quickstart.md`, and `tasks.md`.
- [x] T002 Link durable Fixvox dock/hotkey reference from `PRODUCT.md`, `DESIGN.md`, `docs/topics/*`, `docs/TOPICS.md`, and `docs/WORKING_MEMORY.md`.
- [x] T003 Run `bun scripts/context-index.ts` and `bun scripts/agent-context-audit.ts` after spec/docs creation.

**Checkpoint**: Specs exist and future sessions know Fixvox dock/hotkeys are the UX reference.

---

## Phase 2: Checkpoint A - Contracts And State Machines (RED/GREEN)

**Goal**: Prove dock visual semantics and dictation-key hold/tap behavior without Tauri side effects.

**Independent Test**:

```powershell
npm run test:pipeline -- tests/voice-dock tests/desktop-control/dictation-key.test.ts
```

- [x] T004 [P] Add provider-free dock visual semantics tests in `tests/voice-dock/dock-visual-semantics.test.ts` covering idle, arming/recording, processing, failed, cancelled, and uncertain recovery.
- [x] T005 [P] Add provider-free dictation-key tests in `tests/desktop-control/dictation-key.test.ts` covering long hold, short tap latch, second press stop, release-before-start race, duplicate event ignore, and Escape cancel.
- [x] T006 Add side-effect guard coverage proving new `src/voice-dock/*` and `src/desktop-control/dictation-key.ts` do not import Tauri, clipboard/focus, providers, or hotkey registration.
- [x] T007 Implement `src/voice-dock/types.ts`, `src/voice-dock/visual-semantics.ts`, and `src/voice-dock/index.ts` from the contract.
- [x] T008 Implement `src/desktop-control/dictation-key.ts` as the renderer-safe hold/tap resolver that emits existing controller actions.
- [x] T009 Verify Checkpoint A with focused tests and `npm run test:pipeline -- tests/desktop-control` if desktop-control contracts changed.

**Checkpoint A Done When**: Dock/key behavior is green in tests with no real desktop side effects.

---

## Phase 3: Checkpoint B - Compact Dock UI In React (RED/GREEN)

**Goal**: Replace the large test-panel feeling with a compact Fixvox-like dock surface wired to existing app state.

**Independent Test**:

```powershell
npm run test:pipeline -- tests/voice-dock tests/desktop-control/app-delivery.test.ts
npm run visual:check
```

- [x] T010 Add dock UI render tests in `tests/voice-dock/voice-dock-ui.test.tsx` or the existing App test seam, asserting compact controls, state chip/copy, VU/dots affordance, recovery actions, and no `paste_observed` wording.
- [x] T011 Implement `src/voice-dock/VoiceDock.tsx` and dock styles in `src/styles.css`, adapting Fixvox ergonomics while preserving `DESIGN.md` accessibility and reduced-motion expectations.
- [x] T012 Wire `src/App.tsx` to render the dock as the primary usable surface while preserving any necessary dev/debug evidence behind compact details or secondary sections.
- [x] T013 Verify Checkpoint B with focused UI tests, `npm run visual:check`, and `npm run build`.

**Checkpoint B Done When**: The app visually behaves like a compact dock in safe/dev mode and review/copy recovery still works.

---

## Phase 4: Checkpoint C - Tauri Dictation Key Press/Release Integration (RED/GREEN + Gated Smoke)

**Goal**: Drive the existing real dictation loop through the new dictation-key semantics, starting with the current safe shortcut before Alt+Space.

**Independent Test**:

```powershell
npm run test:pipeline -- tests/desktop-control/dictation-key.test.ts tests/desktop-control/app-hotkey-toggle.test.ts tests/desktop-control/desktop-control-events.test.ts
cd src-tauri && cargo check
```

- [x] T014 Extend `src-tauri/src/desktop_control.rs` tests and payloads to model `pressed` and `released` events for the current safe shortcut, preserving cfg guards and compile safety.
- [x] T015 Update `src/desktop-control/tauri-host-control.ts` and related tests so Tauri payloads map to `DictationKeyEvent`/controller actions instead of toggle-only assumptions.
- [x] T016 Wire `src/App.tsx` or `src/desktop-control/app-session.ts` so key decisions route through `DesktopDictationController` without deriving state from UI booleans.
- [x] T017 With explicit local approval, run one manual Tauri smoke using the current safe shortcut and record redacted evidence in `quickstart.md`.

**Checkpoint C Done When**: Current shortcut supports Fixvox-like hold/tap semantics through the real controller path, or a documented blocker identifies why the safe shortcut remains toggle-only temporarily.

**Checkpoint C Status**: Done 2026-06-23 with safe checks green and redacted manual Tauri smoke evidence in `quickstart.md`; Alt+Space remains gated.

---

## Phase 5: Checkpoint D - Floating Dock And Recovery Polish (GREEN)

**Goal**: Make the dock usable as a desktop utility surface rather than just a full-size product window.

**Independent Test**:

```powershell
npm run test:pipeline -- tests/voice-dock tests/desktop-control
npm run build
cd src-tauri && cargo check
npm run visual:check
```

- [x] T018 Decide and implement the least-risk Tauri window path in `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, and/or renderer startup: compact main-window mode first or separate floating dock window if safe.
- [x] T019 Add/reuse recovery actions for copy, retry, record-again, and paste-last safe from the dock without adding paste automation or durable history.
- [x] T020 Run a visual/manual dock smoke and record redacted evidence in `quickstart.md` without raw transcript content.

**Checkpoint D Done When**: JP can use a compact dock-like surface for the existing dictation loop, with honest recovery, without relying on the old large test panel.

**Checkpoint D Status**: Done 2026-06-23 for the dev dock path: transparent Fixvox-like 7-dot dock, live mic VU, recording controls, compact status/recovery chip, real host STT on explicit stop, and manual hotkey smoke evidence in `quickstart.md`; tray remains future work.

### Post-D Gated Paste-Sent Batch

**Status**: Done 2026-06-23 with explicit approval for controlled smoke.

- Implemented saved-target insert-at-cursor delivery for Tauri dev: capture foreground target before recording, focus it after STT, write clipboard temporarily, send `Ctrl+V`, restore previous clipboard.
- Evidence remains honest: status is only `paste_sent`; no `paste_observed` without a verified observer.
- Controlled Notepad smoke changed the scratch target from 0 to 10 bytes and restored a clipboard sentinel; raw transcript was not recorded.
- Still out of scope: selection/replace, Alt+Space, tray/background, durable history, and verified paste observer.

---

## Phase 6: Gated Alt+Space Decision (Optional But Important)

**Goal**: Decide whether to converge to Fixvox's `Alt+Space` default now or leave it as documented future work.

- [ ] T021 Inspect Tauri/global-shortcut behavior for `Alt+Space` in a gated local spike; do not make it default before evidence.
- [ ] T022 If `Alt+Space` is unreliable, document a Rust-owned native-hook/fallback design or keep configurable fallback key; do not add AutoHotkey.
- [ ] T023 If `Alt+Space` is reliable, update docs/defaults/tests and run an explicit manual smoke with redacted evidence.

**Checkpoint**: Alt+Space status is decided honestly and does not block the usable dock.

---

## Phase 7: Closeout

- [x] T024 Run default safe checks: `npm run test:pipeline`, `npm run build`, `cd src-tauri && cargo check`.
- [x] T025 Run `npm run visual:check` if dock UI changed in the batch.
- [x] T026 Run artifact hygiene checks: `git status --short --ignored artifacts .env` and `git ls-files artifacts .env`.
- [x] T027 Update `docs/WORKING_MEMORY.md`, this `tasks.md`, and any relevant topics with final behavior and gates.
- [x] T028 Run `bun scripts/context-index.ts` and `bun scripts/agent-context-audit.ts`.

**Final Checkpoint**: Done 2026-06-23 for the safe shortcut/dev dock/saved-target `paste_sent` scope. Alt+Space, tray/background, selection/replace, and verified paste observer remain future/gated work.

---

## Phase 8: Checkpoint E - Rust-Native Fixvox Dock Parity (New Follow-Up)

**Goal**: Make Dictation Tauri's dock as close to Fixvox's dock as possible, using Rust/Windows APIs where that gives better fidelity than renderer-only behavior.

**Decision From 2026-06-24**: JP wants the dock to match Fixvox's dock closely, not just be "Fixvox-like". Prefer a Rust/Tauri-owned Windows surface for no-activate, always-on-top, rounded/hit-test behavior, positioning, foreground-target preservation, and future Alt+Space/native hook work. Keep the web renderer for the dock visuals unless a native-drawn surface becomes necessary.

**Fixvox Reference Target**:

- Primary visual target: `C:/dev/fixvox/src/app/views/voice-dock/DockSkin4.svelte`.
- Window/runtime target: `C:/dev/fixvox/src/app/backend/voice-dock-window.ts`.
- Visual semantics target: `C:/dev/fixvox/src/app/views/voice-dock/dock-visual-semantics.ts`.
- Expected idle geometry: transparent `164x64` utility window, centered seven-dot pill, no titlebar/chrome, no white WebView background.
- Expected recording geometry: side controls appear around the central seven-dot VU, green stop/check affordance, optional enter-submit affordance, red cancel affordance.
- Expected runtime behavior: always-on-top utility overlay, no focus stealing while idle/recording, target app focus preserved until explicit delivery, honest `paste_sent` vs `paste_observed` evidence.

**Independent Safe Tests**:

```powershell
npm run test:pipeline -- tests/voice-dock tests/desktop-control
npm run visual:check
npm run build
cd src-tauri && cargo check
```

**Gated Manual/Computer-Use Smoke**:

```powershell
npm run tauri:dev
# Launch/reference Fixvox dock separately if available.
# Use computer-use/manual visual smoke side-by-side until Dictation Dock matches Fixvox Dock closely.
```

Evidence rules: record screenshots/observations only under ignored artifacts or redacted quickstart notes; do not record raw transcripts, selected text, secrets, provider payloads, or clipboard contents.

- [x] T029 Capture a concrete Fixvox Skin4 parity checklist in `quickstart.md`: geometry, dot sizes/heights, dot gaps, opacity/gradients, side controls, status chip placement, processing/error behavior, hover/click/context affordances, no-activate expectations, and any deliberate deviations.
- [x] T030 Add/adjust provider-free dock parity tests for the visual contract: seven dots, compact idle footprint, recording controls, processing chip, reduced-motion behavior, no `paste_observed` wording, and no developer panel leakage.
- [x] T031 Refine `src/voice-dock/VoiceDock.tsx` and `src/styles.css` against Fixvox Skin4 constants before changing native behavior; keep renderer tests provider-free.
- [x] T032 Move shell fidelity into Rust/Tauri where needed: transparent no-chrome window, always-on-top/no-activate behavior, rounded hit region or hit-test behavior, monitor-aware bottom/near-cursor positioning, DPI-safe sizing, and focus preservation.
- [x] T033 Add compile-guarded Rust coverage or diagnostics for any Windows API path introduced; no default check may register real hooks, send keys, or touch clipboard/focus.
- [x] T034 Run a computer-use/manual side-by-side smoke loop against Fixvox and iterate until idle, recording, processing, and recovery states are visually close enough for JP review.
- [x] T035 Run one gated real dictation smoke after parity changes: shortcut -> live VU -> fresh WAV -> managed STT -> saved-target `paste_sent` or recovery, with redacted evidence only.
- [x] T036 Update `docs/topics/fixvox-dock-and-hotkeys-reference.md`, `docs/WORKING_MEMORY.md`, and this task list with final parity status, deviations, checks, and follow-up gates.

**Checkpoint E Done When**: Computer-use/manual smoke shows the Dictation Dock and Fixvox Dock side-by-side with close visual/behavioral parity for idle, recording, processing, and recovery; safe checks pass; Rust/Tauri native window behavior is documented; any remaining deviations are explicit and accepted.

**Checkpoint E Status**: Done 2026-06-24. T030-T036 closed with provider-free parity tests, renderer Skin4 refinement, Rust/Tauri no-activate/toolWindow shell, side-by-side Fixvox smoke, post-parity real dictation E2E, and final docs. JP accepted remaining deviations as follow-ups. Follow-up Lote 1 later closed the largest dock-specific gaps: blue enter-submit, visual preset/assistant indicators, idle rounded hit-region, and state-aware native resize. Context menu remains a minimal future surface; real assistant/selection/replace/history stay gated.

---

## Phase 9: Observer Hardening Follow-Up

**Goal**: Harden the internal bounded observer before any product claim of `paste_observed` in a real E2E.

- [x] T037 Add internal Rust observer tests for no-observation, positive observation, repeated-text insertion, unchanged target text, missing `after`, empty text, and Windows line-ending normalization.
- [x] T038 Refine the observer predicate to require an increased normalized occurrence count instead of only "after contains output and before did not".
- [x] T039 Add renderer evidence coverage proving only the Tauri verified-observer path may elevate to `paste_observed`.
- [x] T040 Run focused/full provider-free checks and `cargo check`; keep real observer smoke gated for a later explicit E2E.

**Status**: Done 2026-06-24. Internal/provider-free hardening passed first, then a controlled observer E2E passed with product UI delivery status `paste_observed` in `artifacts/desktop-control/dictation-e2e/20260624-observer-paste-observed-e2e-verified/report.json`. The harness now waits for UI `Listening` before speaking and logs product delivery evidence via CDP. Caveat: fixture token matching was non-gating in the observer run because ambient/user speech can be captured; use separate STT-quality smokes for transcript-content assertions.

---

## Phase 10: Companion Window Sync Follow-Up

**Goal**: Turn the separate `dock-companion` Tauri window from a placeholder into a real synchronized recovery/history/settings surface without adding risky desktop side effects.

- [x] T041 Add provider-free companion snapshot coverage proving recovery/history/settings sync does not include raw transcript or selected text.
- [x] T042 Implement renderer-side `dock-companion://state` sync from the main dock to the companion window with redacted history metadata only.
- [x] T043 Update docs with current companion status and remaining action/layout gaps.

**Status**: Done 2026-06-24. `src/voice-dock/companion-state.ts` now projects a redacted companion snapshot; the main dock emits it to the `dock-companion` window via Tauri events when recovery/history/settings are visible; `CompanionSurface` renders synced cards instead of the previous static placeholder. Remaining follow-up: companion-local actions and closer Fixvox companion layout/actions.

---

## Phase 11: Dock Move And Post-Insert Feedback Follow-Up

**Goal**: Close the next JP-observed parity gaps: the dock must be movable with saved position, and post-insert feedback should settle like Fixvox instead of leaving a persistent recovery chip on the dock.

- [x] T044 Add provider-free visual semantics coverage for sent/observed insertion returning the dock to quiet idle without recovery actions.
- [x] T045 Add drag-to-move wiring from the dock orb without breaking normal click-to-start behavior.
- [x] T046 Add Rust/Tauri persisted dock position storage, restore, and work-area clamp.
- [x] T047 Keep `npm run tauri:dev` live for JP testing and document remaining visual side-by-side gap.

**Status**: Done 2026-06-24. `VoiceDock` now distinguishes click vs drag with a small movement threshold and delegates native dragging to Tauri from `App.tsx`; Rust exposes `save_dock_shell_position` and restores/clamps `dock-position.v1.json` from app data. Visual semantics now collapse sent/verified insertions back to idle, matching Fixvox's successful completion behavior more closely. Remaining follow-up: dedicated side-by-side visual smoke for drag/restore/post-insert and further micro-polish of dot/chip timing.

---

## Dependencies & Execution Order

- Phase 1 is complete before implementation.
- Phase 2 blocks Phases 3-5 because UI and Tauri integration need stable contracts.
- Phase 3 can start after Phase 2 and should land before real Tauri hotkey integration.
- Phase 4 depends on Phase 2 and should integrate with Phase 3's UI state.
- Phase 5 depends on Phase 3 and Phase 4.
- Phase 6 is optional/gated and must not block the usable dock.
- Phase 7 closed the safe shortcut/dev dock/saved-target scope.
- Phase 8 is complete for closer Fixvox parity and Rust/Windows shell fidelity; accepted deviations remain future gated follow-ups.

## Parallel Opportunities

```text
# Safe explorers/reviewers
- Review Fixvox dock skins and summarize only the UI details needed for Checkpoint B.
- Review Tauri global-shortcut release event support and Alt+Space limitations read-only.
- Review accessibility/reduced-motion expectations for the dock.

# Safe workers after ownership is clear
- Worker A: tests/voice-dock/* only.
- Worker B: src/voice-dock/* only after tests are written.
- Worker C: tests/desktop-control/dictation-key.test.ts + src/desktop-control/dictation-key.ts only.
- Worker D: visual smoke tests only.

# Reserved to orchestrator
- specs/012-fixvox-dock-dictation-key/*, docs/WORKING_MEMORY.md, PRODUCT.md, DESIGN.md, src/App.tsx, src/styles.css, src-tauri/src/*, tauri.conf.json, package scripts, git commits, manual smokes.
```

## Notes

- The first implementation target was usable dock + hold/tap semantics; Checkpoint E then completed closer Fixvox Skin4 parity for the dock itself.
- 2026-06-24: T031 refined the React/CSS dock toward Skin4 before native shell work: central `66x28` seven-dot core, `31px` side controls with Skin4 spacing, two-line compact companion chip, named Skin4 dot constants, hover/focus polish, and stronger reduced-motion handling. Provider-free checks passed: `npm run test:pipeline -- tests/voice-dock`, `npm run test:pipeline -- tests/voice-dock tests/desktop-control`, `npm run build`, and `npm run visual:check`.
- 2026-06-24: T032/T033 added Rust-owned dock shell setup in `src-tauri/src/dock_shell.rs`: window starts hidden/focus=false/skipTaskbar=true, setup sizes/positions it bottom-center within monitor work area, reapplies always-on-top, and on Windows uses `SetWindowLongPtrW`/`SetWindowPos` with `WS_EX_NOACTIVATE`, `WS_EX_TOOLWINDOW`, no `WS_EX_APPWINDOW`, `SWP_NOACTIVATE`, and `SWP_SHOWWINDOW`. Added pure geometry/style tests; `cargo test dock_shell` is blocked by this environment's known `STATUS_ENTRYPOINT_NOT_FOUND`, but `cd src-tauri && cargo check` passed. CUA/Win32 smoke launched `npm run tauri:dev` and verified `Dictation Dock` rect `164x64`, foreground stayed in terminal, `noActivate=true`, `toolWindow=true`, `appWindow=false`; evidence in ignored `artifacts/desktop-control/dock-shell-smoke/20260624-114946/report.json`.
- 2026-06-24: T034 side-by-side smoke ran against the already-running Fixvox `Voice Dock` and a fresh `Dictation Dock`. Evidence in ignored `artifacts/desktop-control/dock-parity-smoke/20260624-124835/summary.json` plus cropped idle/recording/recovery screenshots. Result: idle and recording are close in size, transparency, seven-dot geometry, live VU, no-activate/toolWindow/taskbar behavior, and foreground preservation. Deviations for JP review: Dictation lacks Fixvox's blue enter-submit control, idle hit-region narrowing, state-aware resize for processing/error, context menu/preset/assistant indicators. Dictation stop against an ephemeral fixture reached compact `Transcript ready`; Fixvox stop returned to idle too quickly to capture a processing chip in this run.
- 2026-06-24: added a reusable real desktop dictation E2E harness at `scripts/desktop-dictation-e2e.ps1` and package alias `desktop-control:e2e`. Passing run `artifacts/desktop-control/dictation-e2e/20260624-104246/report.json` validates Cua health, Tauri dock, target fixture, hotkey start/stop, speech-synthesized audio fixture, real provider STT, `paste_sent`, clipboard restoration, and cleanup.
- 2026-06-24: T035 post-parity real dictation smoke passed with `scripts/desktop-dictation-e2e.ps1` run id `20260624-T035-post-parity`. Evidence: `artifacts/desktop-control/dictation-e2e/20260624-T035-post-parity/report.json`; validated Cua health, `Dictation Dock`, fixture target foreground, `Ctrl+Shift+F9` start/stop, synthetic speech fixture, fresh WAV `capture-native-1782317452217.wav`, managed STT, target `paste_sent`, token match, clipboard sentinel restoration, and cleanup. Raw target text remains only in ignored artifacts; no `paste_observed` claim.
- 2026-06-24: T036 final docs closed Checkpoint E. JP chose `Aceptar como follow-ups` for remaining deviations instead of implementing them in that batch: blue enter-submit, native hit-region, state-aware resize, context menu, preset badge, and assistant indicators. Checkpoint E was complete with those gaps explicitly gated as future work.
- 2026-06-24: Lote 1 follow-up implemented the largest dock-specific parity gaps in one larger batch: separate green `Stop & review`, blue `Stop & submit`, red `Cancel`; paste-then-Enter is only requested by `Stop & submit` and still reports `paste_sent`, not `paste_observed`; visual-only `activePreset` badge and assistant indicator state; Rust/Tauri `update_dock_shell_state`; idle rounded hit-region via `CreateRoundRectRgn`/`SetWindowRgn`; state-aware `SetWindowPos(... SWP_NOACTIVATE ...)` resize (`164x64` idle/recording, `260x90` review/error/cancelled). CUA feedback used real `Dictation Dock` plus a controlled Notepad-style context, not browsers; evidence in `artifacts/desktop-control/dock-lote1-smoke/20260624-renderer-native/report.json`.
- Keep current `Ctrl+Shift+F9` as fallback until Alt+Space is proven.
- Selected-text capture, verified paste observation, Quick Chat, Assistant Mode, result history, or `Alt+Q` remain out of this spec's first landing.
- If any checkpoint starts mixing unrelated gates or risky side effects, stop and split the checkpoint before coding.
