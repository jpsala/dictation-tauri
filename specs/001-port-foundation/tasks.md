# Tasks: Port Foundation

**Input**: Design documents from `specs/001-port-foundation/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`

**Tests**: Included because MVP 0 success criteria require repeatable build, visual smoke, Rust/Tauri check, and context audit.

**Organization**: One P1 user story for MVP 0. Execution stops at explicit checkpoints so JP can approve the next increment.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the frontend scaffold and dependency manifest without domain features.

- [x] T001 Create npm manifest with MVP 0 scripts and minimal dependencies in package.json
- [x] T002 Configure strict TypeScript and Vite dev server in tsconfig.json and vite.config.ts
- [x] T003 Create neutral React entrypoint and placeholder surface in index.html, src/main.tsx, src/App.tsx, src/styles.css, and src/vite-env.d.ts
- [x] T004 Install npm dependencies and generate package-lock.json

**Checkpoint A**: Frontend dependencies and placeholder app exist.

---

## Phase 2: User Story 1 - App Base Verificable (Priority: P1) MVP

**Goal**: JP and future agents can run a minimal Dictation Tauri app base with documented checks and no implicit product behavior.

**Independent Test**: `npm run build`, `npm run visual:check`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `bun scripts/agent-context-audit.ts` pass.

### Tests for User Story 1

- [ ] T005 [P] [US1] Configure Playwright visual smoke test in playwright.config.ts and tests/visual/app-smoke.spec.ts

### Implementation for User Story 1

- [ ] T006 [US1] Create minimal Tauri Rust crate in src-tauri/Cargo.toml, src-tauri/build.rs, src-tauri/src/main.rs, and src-tauri/src/lib.rs
- [ ] T007 [US1] Configure Tauri app, main window, and minimal capability in src-tauri/tauri.conf.json and src-tauri/capabilities/default.json

**Checkpoint B**: Frontend and Tauri app base are independently buildable.

---

## Phase 3: Documentation And Verification

**Purpose**: Promote real commands and verification evidence into stable docs.

- [ ] T008 Update official MVP 0 commands and structure in docs/DEVELOPMENT.md
- [ ] T009 Update active working memory to point at specs/001-port-foundation/plan.md and current MVP 0 checkpoint in docs/WORKING_MEMORY.md
- [ ] T010 Run MVP 0 verification commands from specs/001-port-foundation/quickstart.md
- [ ] T011 Refresh context index and audit with bun scripts/context-index.ts and bun scripts/agent-context-audit.ts

**Checkpoint C**: MVP 0 foundation is verified and docs are synchronized.

---

## Dependencies & Execution Order

- Phase 1 must complete before Tauri work.
- T005 can run after T003 and before or during T006/T007.
- T006 must complete before T007.
- Phase 3 starts only after Checkpoint B passes.
- Stop after Checkpoint A if JP wants to review the web base before Tauri.
- Stop after Checkpoint B if JP wants to run the app before docs closeout.

## Parallel Opportunities

- T005 can be implemented in parallel with T006 because it touches only Playwright files.

## Implementation Strategy

1. Complete Phase 1 and verify `npm run build`.
2. Stop for approval if requested.
3. Complete Tauri files and verify `cargo check`.
4. Run `npm run visual:check`.
5. Update docs, regenerate context index, and run context audit.
6. Mark completed tasks with `[x]` as each task is finished.
