# Tasks: Fixvox Parity - Tray, Settings, Hotkeys, Quick Pick, Postprocess

## Phase 1: Setup And Documentation

- [x] T001 Create spec/plan/tasks for Fixvox parity scope.
- [x] T002 Document Grammarly-like focused input intelligence in `docs/topics/grammarly-like-input-intelligence.md`.

## Phase 2: Checkpoint A - Tray / Background Lifecycle

- [x] T003 Add source tests/guards for Tauri tray menu IDs and tray-icon feature.
- [x] T004 Implement Rust tray with Show Dock, Hide Dock, Settings, Quit and left-click toggle.
- [x] T005 Verify `cd src-tauri && cargo check`, `npm run test:pipeline`, and a dev status smoke.
- [x] T006 Record redacted evidence and update docs.

Checkpoint A evidence (2026-06-23): `npm run test:pipeline` OK (53 files / 250 tests), `npm run build` OK, `cd src-tauri && cargo check` OK, `npm run dev:desktop:restart` OK with `dictation-tauri` running as `Dictation Dock`. Tauri logs show clean compile/run after enabling `tray-icon`.

## Phase 3: Checkpoint B - Settings And Hotkey Schema

- [ ] T007 Add provider-free settings/hotkey defaults contract and tests.
- [ ] T008 Expose settings snapshot to renderer via safe seam.
- [ ] T009 Add compact settings placeholder or tray Settings event handling.

## Phase 4: Checkpoint C - Quick Pick / Command Palette

- [ ] T010 Define quick-pick command IDs and provider-free routing tests.
- [ ] T011 Add first compact quick-pick UI surface.

## Phase 5: Checkpoint D - Postprocess Seam

- [ ] T012 Add transcript postprocess adapter contract and tests.
- [ ] T013 Wire postprocess between STT and delivery without provider calls by default.

## Phase 6: Checkpoint E - Focused Input Intelligence

- [ ] T014 Design focused input metadata host command with UIA/Win32 fallback and no raw text storage.
- [ ] T015 Implement provider-free/side-effect-safe metadata command and tests.
- [ ] T016 Feed metadata into dock positioning/delivery confidence in a gated smoke.
