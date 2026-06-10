# Quickstart: Port Foundation

## Prerequisites

- Windows PowerShell.
- Node.js 24.x and npm 11.x.
- Rust/Cargo 1.89.x.
- Bun available for repository context scripts.

## Install

```powershell
npm install
```

## Frontend Dev

```powershell
npm run dev
```

Expected: Vite serves the app at `http://127.0.0.1:1420`.

## Frontend Build

```powershell
npm run build
```

Expected: TypeScript and Vite complete successfully and write `dist/`.

## Visual Smoke Test

```powershell
npm run visual:check
```

Expected: Playwright opens the Vite app and verifies the MVP 0 placeholder.

## Tauri Dev

```powershell
npm run tauri:dev
```

Expected: Tauri opens a `Dictation Tauri` desktop window.

## Tauri/Rust Check

```powershell
$env:CARGO_TARGET_DIR="target-codex-check"; cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Rust/Tauri code compiles without building into the default shared
target directory.

## Context Audit

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Expected: generated context index is fresh and the audit passes.

## MVP 0 Done When

- `npm run build` passes.
- `npm run visual:check` passes.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- `bun scripts/agent-context-audit.ts` passes.
- `docs/DEVELOPMENT.md` documents the real commands.
