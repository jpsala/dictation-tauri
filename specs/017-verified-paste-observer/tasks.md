# Tasks: Verified Paste Observer And Target Confidence

**Input**: `specs/017-verified-paste-observer/spec.md`, `plan.md`

**Tests**: Default tasks are provider-free and must not access real clipboard/focus APIs, send paste keys, call providers, read selected text, or require microphone hardware.

## Phase 1: Checkpoint A - Provider-Free Observer Contract

- [x] T001 Add provider-free tests for verified paste observation promotion, low-confidence downgrade, unsupported/mismatch/timeout behavior, observer error redaction, and no-observer compatibility.
- [x] T002 Implement `src/delivery/observation.ts` with observer types and evidence derivation helpers.
- [x] T003 Wire optional observer support into `src/delivery/tauri-desktop-delivery.ts` while preserving default `paste_sent` behavior.
- [x] T004 Export observer contracts from `src/delivery/index.ts`.
- [x] T005 Run focused tests and `npm run build`.

## Phase 2: Gated Native Windows Observer

- [x] T006 Design Windows host observer strategy: a Rust-owned `observe_desktop_paste` command polls readable Win32 text surfaces on the saved target, returns only status/confidence/reason/snapshot metadata, and never returns raw target contents.
- [x] T007 Implement native observer behind explicit `VITE_ENABLE_NATIVE_PASTE_OBSERVER=1` renderer gate; default delivery still has no observer and remains `paste_sent`.
- [x] T008 Run controlled manual smoke after explicit approval and record redacted evidence.

## Checkpoint A Done When

The app has a safe seam for verified observers, default behavior remains honest `paste_sent`, and no default check performs real desktop side effects.

## Native Observer Checkpoint Done When

With `VITE_ENABLE_NATIVE_PASTE_OBSERVER=1`, a controlled Windows target can promote `paste_sent` to `paste_observed` only when the native observer confirms high-confidence insertion. Without the gate, behavior stays unchanged.

Status: done 2026-06-23 with computer-use evidence. The dock exposes `data-delivery-status="paste_observed"` plus accessible text `Delivery status: paste_observed`, and computer-use verified the scratch Notepad target contained the inserted text.
