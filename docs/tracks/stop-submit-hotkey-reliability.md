---
status: blocked
started: 2026-08-18
updated: 2026-08-21
priority: high
owner: JP
related:
  - docs/topics/fixvox-dock-and-hotkeys-reference.md
  - docs/WORKING_MEMORY.md
topic: docs/topics/fixvox-dock-and-hotkeys-reference.md
source_refs:
  - src-tauri/src/desktop_control.rs
  - src/desktop-control/tauri-host-control.ts
  - src/App.tsx
  - tests/desktop-control/tauri-host-control.test.ts
  - src/desktop-control/dictation-key.ts
  - tests/desktop-control/app-hotkey-toggle.test.ts
  - tests/desktop-control/dictation-key.test.ts
---

# Stop & Submit Hotkey Reliability

## Objective

Close the physical Win+Space `stopAndSubmit` path without changing Alt+Space.
Use the same hold/tap semantics: a long press starts and keyup stops/submits
with forced Enter; a short press starts and latches, and the next press stops
and submits. A reviewed previous run must not block the next start.
## Current state

- Host-owned editable/persistent action hotkey exists; default is `Win+Space`.
- Native hook emits `stop_submit_pressed` on keydown and `stop_submit` on keyup.
- Renderer routes both events through the existing Alt+Space dictation-key
  resolver, including short-press latch, second-press stop and start-release
  race handling.
- `reviewing` is restartable; only an active capture/session blocks a new start.
- Win+Space masking is now the product default whenever the configured action
  is the exact `Win+Space` chord; the temporary
  `DICTATION_TAURI_WIN_SPACE_MASK_MODE` gate and legacy modifier-release path
  were removed.
- The native mask consumes Space-down, autorepeat and Space-up, injects only
  marked `VK_E8` events, lets physical Win-up pass, and ignores only its own
  `LLKHF_INJECTED + dwExtraInfo` pair.
- Rust provider-free coverage, `cargo check` and real hook installation pass.
- Pre-fix physical evidence showed the native Win+Space cycle starting
  `Recording` but not stopping when its release raced the asynchronous start.
  A later Alt+Space ended that capture and caused one unintended real desktop
  delivery; do not repeat that smoke path.
- A safe physical start/cancel smoke on 2026-08-21 confirmed one masked
  Win+Space activation, no Windows input-switcher window, `Recording`, and
  return to idle via Escape without provider or paste. The full hold/tap
  stop-submit cycle remains blocked because release can execute provider/paste.

## Gate and next batch

The physical stop/submit path remains blocked for this batch. An account-ready
instance can perform provider/paste delivery when a real `stop_submit` is
exercised, and the task explicitly forbids that side effect. The next safe
batch is a provider-free integration harness for the renderer
`pressed`/`released` bridge, plus the existing native state-machine tests. Do
not call the behavior final until that harness closes the release path without
provider, paste, selection or audio/transcript persistence.
