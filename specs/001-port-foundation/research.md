# Research: Port Foundation

## Decision: Adopt npm/Vite/React/Tauri base from CopyQ Tauri

Rationale: `C:\dev\chat\copyq-tauri` is the accepted technical reference for a
working Tauri v2 app on JP's Windows machine. Reusing its stack family reduces
new decisions while keeping Dictation Tauri independent.

Alternatives considered:

- Fresh Tauri template: lower context fit and likely version drift.
- Bun/Electrobun from Fixvox: rejected by project decisions; Fixvox is a
  functional reference, not the architecture for this repo.

## Decision: Keep MVP 0 dependencies minimal

Rationale: The foundation should prove the app can build and render before
adding dictation, storage, tray, global shortcuts, Win32 delivery, provider
routing, or UI systems. This keeps the first verification small and isolates
future failures.

Alternatives considered:

- Copy all CopyQ dependencies: rejected because clipboard/storage/Win32
  dependencies are domain-specific and explicitly out of scope.
- Add Mantine immediately: deferred until `PRODUCT.md` and `DESIGN.md` exist
  and a durable UI surface is designed.

## Decision: Start with `core:default` Tauri capability only

Rationale: The first window does not need drag regions, notifications,
filesystem, shell, clipboard, microphone, global shortcut, or tray permissions.
Minimal capabilities satisfy the constitution and keep the permissions model
clear.

Alternatives considered:

- Include window management permissions from CopyQ: deferred until custom
  chrome or multi-window behavior is implemented.
- Include microphone permissions now: rejected for MVP 0; microphone capture
  starts in MVP 3.

## Decision: Use a neutral placeholder UI

Rationale: MVP 0 needs a visible app window for smoke testing but should not
lock in product UI. Durable UI requires `PRODUCT.md`, `DESIGN.md`, and the
local `impeccable` workflow.

Alternatives considered:

- Build app shell or voice dock now: rejected because it would create durable
  design decisions before the approved design context exists.

## Decision: Verify in layers

Rationale: The first cut should prove the frontend build, visual render,
Tauri/Rust compile path, and docs context independently. The checks are:
`npm run build`, `npm run visual:check`, `cargo check`, and
`bun scripts/agent-context-audit.ts`.

Alternatives considered:

- Only run Tauri dev manually: insufficient for repeatable SDD verification.
- Skip Playwright until later: rejected because MVP 0 success requires a
  verifiable window/surface.
