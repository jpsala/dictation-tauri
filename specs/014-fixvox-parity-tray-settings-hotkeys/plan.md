# Implementation Plan: Fixvox Parity - Tray, Settings, Hotkeys, Quick Pick, Postprocess

## Summary

Move from a verified dictation loop to a daily-driver Fixvox-like desktop app. Implement in checkpoints: tray/background first, then no-activate/movable dock polish, settings/hotkey contract, quick pick, postprocess seam, and finally focused-input intelligence.

## Technical Context

- Stack: React/Vite/TypeScript strict, Tauri v2, Rust 2021.
- Existing loop: compact dock, Alt+Space + Ctrl+Shift+F9 fallback, real capture/STT, saved-target paste, native observer gated to `paste_observed`.
- Tauri tray requires `tauri` feature `tray-icon` and Rust `TrayIconBuilder`.
- Windows input intelligence should use UI Automation patterns first, Win32 fallbacks second.

## Checkpoint A - Tray / Background Lifecycle

- Add Tauri tray icon with stable menu IDs.
- Left click toggles dock visibility.
- Menu includes Show Dock, Hide Dock, Settings (placeholder), Quit.
- Close/hide behavior keeps app running; Quit exits.
- Verify with cargo check, source tests, and computer-use/manual status when possible.

## Checkpoint B - Dock Polish: No-Activate, Drag, Position

Fixvox dock behavior to preserve:

- The dock should be a utility overlay, not a normal app window.
- It should not appear in the taskbar (`skipTaskbar: true` done).
- It should not steal focus from the user's input (`showWindowNoActivate`/no-activate equivalent still pending).
- It should be movable by dragging the dock, with position persisted.
- It should be restorable/topmost without killing the app (`npm run dev:desktop:refresh` done for dev).
- It should eventually follow the cursor monitor while idle, like Fixvox.

Rust/Tauri options for draggable dock:

1. Prefer first: expose a Rust command that calls Tauri's native `start_dragging()` on the `main` window, triggered from renderer pointer down after a small drag threshold.
2. Persist position after move events in a local app config file; keep raw user text out of this storage.
3. If native Tauri dragging fails with transparent/decorations-off/skip-taskbar, fall back to a Win32 manual drag loop using cursor polling + `SetWindowPos`, similar to Fixvox.
4. Keep show/hide no-activate and topmost host-owned in Rust; avoid `set_focus()` except explicit Settings/main-window flows.

## Checkpoint C - Settings And Hotkey Schema

- Add provider-free TS/Rust contract for settings defaults:
  - dictation key: `Alt+Space`.
  - fallback key: `Ctrl+Shift+F9`.
  - stop-submit: `Alt+Shift+Space`.
  - paste-last: `Alt+Shift+X`.
  - quick-pick: `Alt+Q`.
  - show dock on startup: true.
  - dock skin: compact flat / skin 4 equivalent.
- Expose settings snapshot to renderer without durable persistence first.
- UI placeholder only if needed.

## Checkpoint D - Quick Pick / Command Palette

- Define command IDs: record/toggle, stop-submit, paste-last-safe, copy, retry, settings.
- Initial UI can be a compact dock companion/menu; no global picker hotkey until gated.

## Checkpoint E - Postprocess Seam

- Add provider-free postprocess adapter after STT before delivery.
- First presets: none, clean spacing, maybe punctuation-safe placeholder.
- Provider-based rewrite remains gated/future.

## Checkpoint F - Focused Input Intelligence

- Design/implement host-owned metadata capture:
  - focused element/window/process/control type/bounding rect;
  - supported UIA patterns;
  - editable confidence;
  - no raw target text by default.
- Feed into dock positioning and delivery/observer.

## Checks

```powershell
npm run test:pipeline
npm run build
cd src-tauri && cargo check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Gated/manual:

```powershell
npm run dev:desktop:restart
npm run dev:desktop:status
# computer-use: inspect Dictation Dock, tray behavior if visible, and target app smoke evidence
```
