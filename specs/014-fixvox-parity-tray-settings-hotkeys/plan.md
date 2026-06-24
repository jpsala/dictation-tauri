# Implementation Plan: Fixvox Parity - Tray, Settings, Hotkeys, Quick Pick, Postprocess

## Summary

Move from a verified dictation loop to a daily-driver Fixvox-like desktop app. Implement in checkpoints: tray/background first, then settings/hotkey contract, quick pick, postprocess seam, and finally focused-input intelligence.

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

## Checkpoint B - Settings And Hotkey Schema

- Add provider-free TS/Rust contract for settings defaults:
  - dictation key: `Alt+Space`.
  - fallback key: `Ctrl+Shift+F9`.
  - future: stop-submit, paste-last, quick-pick.
- Expose settings snapshot to renderer without durable persistence first.
- UI placeholder only if needed.

## Checkpoint C - Quick Pick / Command Palette

- Define command IDs: record/toggle, stop-submit, paste-last-safe, copy, retry, settings.
- Initial UI can be a compact dock companion/menu; no global picker hotkey until gated.

## Checkpoint D - Postprocess Seam

- Add provider-free postprocess adapter after STT before delivery.
- First presets: none, clean spacing, maybe punctuation-safe placeholder.
- Provider-based rewrite remains gated/future.

## Checkpoint E - Focused Input Intelligence

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
