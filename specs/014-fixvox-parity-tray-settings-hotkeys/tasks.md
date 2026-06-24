# Tasks: Fixvox Parity - Tray, Settings, Hotkeys, Quick Pick, Postprocess

## Phase 1: Setup And Documentation

- [x] T001 Create spec/plan/tasks for Fixvox parity scope.
- [x] T002 Document Grammarly-like focused input intelligence in `docs/topics/grammarly-like-input-intelligence.md`.

## Phase 2: Checkpoint A - Tray / Background Lifecycle

- [x] T003 Add source tests/guards for Tauri tray menu IDs and tray-icon feature.
- [x] T004 Implement Rust tray with Show Dock, Hide Dock, Settings, Quit and left-click toggle.
- [x] T005 Verify `cd src-tauri && cargo check`, `npm run test:pipeline`, and a dev status smoke.
- [x] T006 Record redacted evidence and update docs.

Checkpoint A evidence (2026-06-23): `npm run test:pipeline` OK (53 files / 250 tests), `npm run build` OK, `cd src-tauri && cargo check` OK, `npm run dev:desktop:restart` OK with `dictation-tauri` running as `Dictation Dock`. Tauri logs show clean compile/run after enabling `tray-icon`. Follow-up: main dock window has `skipTaskbar: true` so the tray/background app does not show a dock entry in the Windows taskbar. Dev operations now include `npm run dev:desktop:refresh`, and restart runs `-Refresh`, so the hidden/no-taskbar dock can be re-shown/topmost without killing the app.

## Phase 3: Checkpoint B - Dock Polish: No-Activate, Drag, Position

- [ ] T007 Remove focus stealing from tray/show/refresh paths; use no-activate/topmost show semantics for the dock.
- [ ] T008 Add provider-free tests/guards for no-activate and no taskbar dock behavior.
- [ ] T009 Implement dock drag via Rust/Tauri native `start_dragging()` first; keep Win32 manual drag as fallback only if needed.
- [ ] T010 Persist/restore dock position locally and keep the dock re-instantiable/refreshable.
- [ ] T011 Add optional idle monitor-follow design or first implementation after persisted position is stable.

Rust options captured 2026-06-23: prefer Tauri native `start_dragging()` exposed through a Rust command; persist after move events; if transparent/no-decoration/skip-taskbar breaks native drag, fallback to Win32 cursor polling + `SetWindowPos` like Fixvox.

## Phase 4: Checkpoint C - Settings And Hotkey Schema

- [ ] T012 Add provider-free settings/hotkey defaults contract and tests.
- [ ] T013 Expose settings snapshot to renderer via safe seam.
- [ ] T014 Add compact settings placeholder or tray Settings event handling.

## Phase 5: Checkpoint D - Quick Pick / Command Palette

- [ ] T015 Define quick-pick command IDs and provider-free routing tests.
- [ ] T016 Add first compact quick-pick UI surface.

## Phase 6: Checkpoint E - Postprocess Seam

- [ ] T017 Add transcript postprocess adapter contract and tests.
- [ ] T018 Wire postprocess between STT and delivery without provider calls by default.

## Phase 7: Checkpoint F - Focused Input Intelligence

- [ ] T019 Design focused input metadata host command with UIA/Win32 fallback and no raw text storage.
- [ ] T020 Implement provider-free/side-effect-safe metadata command and tests.
- [ ] T021 Feed metadata into dock positioning/delivery confidence in a gated smoke.
