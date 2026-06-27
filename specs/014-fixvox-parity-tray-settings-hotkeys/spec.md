# Feature Specification: Fixvox Parity - Tray, Settings, Hotkeys, Quick Pick, Postprocess

**Feature Branch**: `014-fixvox-parity-tray-settings-hotkeys`  
**Created**: 2026-06-23  
**Status**: Active  
**Input**: Continue after verified paste observer and computer-use smoke; JP wants remaining Fixvox-like workflow: tray, settings, hotkeys, quick pick, and post-processing.

## User Story

As JP, I want Dictation Tauri to feel like the working Fixvox app: always available in the background, controlled by a visible dictation key and tray, configurable enough for daily use, with quick actions and post-processing available without opening a large app window.

## Scope

### In

- Tray/background lifecycle for the existing dock: show/hide/toggle from system tray, quit from tray, keep hotkeys alive.
- Settings contract for dictation key/hotkey labels and future provider/postprocess toggles.
- Hotkey surface aligned with Fixvox: primary dictation key, fallback key, future stop-submit/paste-last/quick-pick IDs.
- Quick pick / command palette contract for nearby actions such as record, paste last, copy, retry, settings.
- Postprocess contract for transcript transforms after STT and before delivery, provider-free first.
- Focused input intelligence plan inspired by Grammarly/Fixvox: use Windows UI Automation metadata and bounding rects before attempting advanced inline UI.

### Out For First Checkpoint

- No installer/autostart yet.
- No durable settings storage until the schema and defaults are tested.
- No real selection replacement or inline underlines.
- No provider-based post-processing by default.

## Acceptance Criteria

1. Tray exists in Tauri dev and can show/hide/toggle the existing dock while keeping app process/hotkeys alive.
2. Tray has stable menu IDs for show/hide/toggle/settings/quit so future tests and computer-use can reason about it.
3. Settings/hotkeys/quick-pick/postprocess are documented as explicit contracts before implementation.
4. Default checks remain provider-free and do not perform real desktop side effects.
5. Any real tray/hotkey smoke records redacted evidence only.
