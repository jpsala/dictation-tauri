# Implementation Plan: Port Foundation

**Branch**: `001-port-foundation` | **Date**: 2026-06-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-port-foundation/spec.md`

## Summary

Create the first MVP 0 foundation for Dictation Tauri: a minimal, verifiable
React/Vite/Tauri application with documented commands, strict TypeScript,
minimal Tauri capabilities, Rust 2021 backend wiring, and Playwright visual
verification. This cut intentionally avoids dictation, audio capture, provider
selection, persistence contracts, selected-text capture, tray/global shortcuts,
and durable product UI.

The technical scaffold adopts the proven base from `C:\dev\chat\copyq-tauri`
while excluding CopyQ-specific clipboard/storage/Win32 dependencies and Fixvox
runtime architecture.

## Technical Context

**Language/Version**: TypeScript 6.0.x, React 19.x, Rust 1.89.0, Rust edition 2021, Node.js 24.16.0, npm 11.13.0

**Primary Dependencies**: Vite 8.x, `@vitejs/plugin-react`, `@tauri-apps/api` 2.x, `@tauri-apps/cli` 2.x, `tauri` 2.x, `tauri-build` 2.x, Playwright 1.x

**Storage**: N/A for MVP 0. No app settings, transcript history, audio cache, or product persistence in this cut.

**Testing**: `npm run build`, `npm run visual:check`, `cargo check` with an agent-local target dir, and `bun scripts/agent-context-audit.ts`

**Target Platform**: Windows desktop through Tauri v2 WebView

**Project Type**: Desktop app with React frontend and Rust/Tauri backend

**Performance Goals**: App base builds locally and renders the initial window quickly enough for visual verification; no runtime dictation latency goals apply yet.

**Constraints**:

- Keep Tauri capabilities minimal: start with `core:default`.
- Do not add clipboard, SQLite, Win32, notification, tray, global shortcut, microphone, STT, or LLM dependencies in MVP 0.
- Do not create product persistence as a side effect.
- Do not build durable app shell, voice dock, settings, preview, or recovery UI before `PRODUCT.md` and `DESIGN.md`.
- Keep generated/runtime artifacts out of source unless explicitly documented.

**Scale/Scope**: One Tauri app, one main window, one neutral placeholder React surface, one visual smoke test, and documented commands.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Human-Centered Outcomes: PASS. The cut gives JP and agents a runnable base before product features.
- Privacy And Data Boundaries: PASS. No dictation data, audio, transcripts, external STT/LLM calls, or secrets are introduced.
- Durable Operational State: PASS. No durable app state is created; `docs/DEVELOPMENT.md` remains the storage authority.
- Spec-Led Incremental Delivery: PASS. Work proceeds through spec, plan, research, data model, quickstart, tasks, implementation, and verification.
- Surface-Appropriate Design: PASS. The UI is a neutral technical placeholder, not a durable product surface.

## Project Structure

### Documentation (this feature)

```text
specs/001-port-foundation/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

No `contracts/` directory is required for this cut because MVP 0 exposes no
external API, command schema, provider interface, or product data contract.

### Source Code (repository root)

```text
package.json
package-lock.json
tsconfig.json
vite.config.ts
playwright.config.ts
index.html
src/
├── main.tsx
├── App.tsx
└── styles.css
tests/
└── visual/
    └── app-smoke.spec.ts
src-tauri/
├── Cargo.toml
├── build.rs
├── tauri.conf.json
├── capabilities/
│   └── default.json
└── src/
    ├── lib.rs
    └── main.rs
```

**Structure Decision**: Use a single Vite frontend at repository root and the
standard Tauri backend under `src-tauri/`. This matches the CopyQ Tauri stack
shape without adopting its domain modules.

## Phase 0 Research

Captured in [research.md](research.md).

## Phase 1 Design

Captured in [data-model.md](data-model.md) and [quickstart.md](quickstart.md).
Contracts are intentionally skipped for MVP 0.

## Constitution Check Post-Design

- Human-Centered Outcomes: PASS. The first independently testable increment is a runnable base.
- Privacy And Data Boundaries: PASS. No data boundary is opened.
- Durable Operational State: PASS. No storage is introduced.
- Spec-Led Incremental Delivery: PASS. `tasks.md` will execute this plan incrementally.
- Surface-Appropriate Design: PASS. Durable UI remains deferred until product/design docs exist.

## Complexity Tracking

No constitution violations or justified complexity exceptions.
