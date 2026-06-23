# Tasks: Verified Paste Observer And Target Confidence

**Input**: `specs/013-verified-paste-observer/spec.md`, `plan.md`

**Tests**: Default tasks are provider-free and must not access real clipboard/focus APIs, send paste keys, call providers, read selected text, or require microphone hardware.

## Phase 1: Checkpoint A - Provider-Free Observer Contract

- [x] T001 Add provider-free tests for verified paste observation promotion, low-confidence downgrade, unsupported/mismatch/timeout behavior, observer error redaction, and no-observer compatibility.
- [x] T002 Implement `src/delivery/observation.ts` with observer types and evidence derivation helpers.
- [x] T003 Wire optional observer support into `src/delivery/tauri-desktop-delivery.ts` while preserving default `paste_sent` behavior.
- [x] T004 Export observer contracts from `src/delivery/index.ts`.
- [x] T005 Run focused tests and `npm run build`.

## Phase 2: Future Gated Native Observer

- [ ] T006 Design Windows host observer strategy with UI Automation/file-fixture fallback and no raw target text storage.
- [ ] T007 Implement native observer behind explicit gate.
- [ ] T008 Run controlled manual smoke only after explicit approval and record redacted evidence.

## Checkpoint A Done When

The app has a safe seam for verified observers, default behavior remains honest `paste_sent`, and no default check performs real desktop side effects.
