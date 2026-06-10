# Quickstart: Simulated Pipeline

## Prerequisites

- MVP 0 foundation is present and buildable.
- Node.js/npm, Rust/Cargo, and Bun are available as documented in `docs/DEVELOPMENT.md`.
- No microphone, provider credentials, `.env`, hotkeys, tray, clipboard permissions, or external services are required.

## Install

```powershell
npm install
```

## Expected Commands After Implementation

The implementation tasks should add a focused pipeline verification command.

```powershell
npm run test:pipeline
```

Expected:

- Successful fixture reaches `done`.
- Failure fixture reaches `error`.
- Cancellation fixture reaches `cancelled`.
- A second run cannot corrupt an active run.
- The event ledger can reconstruct state order and terminal outcome.
- Uncertain delivery is distinct from delivered.
- `delivered` means simulated delivery only.
- No provider credentials or microphone access are requested.

## Existing Regression Checks

```powershell
npm run build
npm run visual:check
$env:CARGO_TARGET_DIR="target-codex-check"; cargo check --manifest-path src-tauri/Cargo.toml
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Expected:

- Frontend build remains green.
- Visual smoke still renders the app.
- Tauri crate still compiles if touched.
- Context index and audit pass after docs/spec updates.

## MVP 1 Done When

- `npm run test:pipeline` passes.
- At least one successful, one failure/recovery, and one cancellation path are verified.
- Active-run overlap prevention is verified.
- Successful fixture output is deterministic.
- Run event ledgers expose fixture id, state order, terminal state, output or redacted error, and delivery result.
- Run summaries are derived from the event ledger.
- No real audio, provider routing, global hotkey, tray, settings UI, product persistence, real selected-text capture, or real clipboard insertion was added.
