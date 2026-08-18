---
status: blocked
started: 2026-08-18
updated: 2026-08-18
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
---

# Stop & Submit Hotkey Reliability

## Objective

Close the physical Win+Space `stopAndSubmit` path without changing Alt+Space:
keydown starts only when idle; keyup stops/submits with forced Enter.

## Current state

- Host-owned editable/persistent action hotkey exists; default is `Win+Space`.
- Native hook emits `stop_submit_pressed` on keydown and `stop_submit` on keyup.
- Renderer preserves a release received during `requesting_permission`/`arming`.
- Alt+Space remains on its normal pressed/released channel.
- A hook condition was corrected so capture-mode state cannot consume Alt+Space release.
- Native layer verified in vivo (2026-08-18): `Alt+Space` (`captured keydown`/`keyup`) and `Win+Space` (`stop-submit captured keydown win_down=true`/`keyup`) both fire in the `WH_KEYBOARD_LL` hook of a real Tauri instance. The suppressed Win-up branch calls `release_modifiers()` before swallowing the keyup, so the Win key is not left logically held (confirmed by synthetic `VK_LWIN`/`VK_RWIN` releases and clean `GetAsyncKeyState`).
- Temporary raw key diagnostic (`native key vk=…`) removed; semantic `captured keydown/keyup` state logs kept.
- Automated Rust (16), Vitest (8), build and context checks pass.

## Gate and next batch

The physical dock smoke (recording → stop) is still not demonstrated. The voice dock is gated behind account setup: this dev instance reports readiness phase `service_unavailable` (`fixvox-setup-readiness.v1.json`), so `TauriAccountGate` keeps the dock on `Verificando tu cuenta…` and a capture never reaches `recording`. Reaching the dock requires a signed-in account (OAuth/cloud), outside provider-free smoke invariants.

Next batch: with an account-ready instance, hold `Alt+Space` (dock → recording) then release (dock → stop), and `Win+Space` down/up during an active capture (dock → stop/submit). Confirm the frontend `stop_submit → requestStopSubmit → stopCapture` path with `forcePressEnterAfterPasteRef=true` live. Keep the same invariants: no provider calls, paste, selection, or audio/transcript persistence. Do not call the behavior final until both physical paths (native + dock) are confirmed.
