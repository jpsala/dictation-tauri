# Tasks: Fixvox Text Runtime Parity

**Input**: `spec.md`, `plan.md`

**Organization**: Fewest practical checkpoints. Each checkpoint should be reviewable, tested, and reversible with one commit. Process parity work should prefer copying/extracting Fixvox behavior over inventing replacements.

## Phase 1: Checkpoint 1 — Lock Fixvox Process Contract

**Goal**: Know exactly what Fixvox currently does for normal dictation text from recording stop to final materialized output.

**Independent Test**:

```powershell
npm run test:pipeline -- tests/fixvox-text-runtime
```

- [x] T001 Audit Fixvox normal dictation flow across `voice-dock-output.ts`, `voice-dock-processing.ts`, `settings-types.ts`, `voice-execution-plan.ts`, `voice-runtime-policy.ts`, `managed-runtime.ts`, and managed proxy/client files.
- [x] T002 Document the exact effective process in `specs/013-fixvox-text-runtime-parity/research.md`: audio preparation, STT endpoint/fields, provider/model, STT prompt, postprocess enablement source, postprocess provider/model, prompts, sanitizer, fallback, and materialized output.
- [x] T003 Add failing provider-free tests under `tests/fixvox-text-runtime/` for prompt exactness, postprocess user message shape, sanitizer behavior, and disabled/enabled postprocess route metadata.
- [x] T004 Decide and document which parts live in TS vs Rust, preserving Rust/host ownership of provider calls and secrets.

**Checkpoint Done When**: The parity target is documented with Fixvox file/function references and RED tests capture the behavior we need to adopt.

**Checkpoint 1 Evidence (2026-06-25)**: `research.md` documents the audited Fixvox process and TS/Rust ownership decision. `npm run test:pipeline -- tests/fixvox-text-runtime` is intentionally RED because `../../src/fixvox-text-runtime` does not exist yet.

---

## Phase 2: Checkpoint 2 — Copy/Extract Pure Fixvox Runtime Primitives

**Goal**: Bring over the pure text-process primitives with minimal behavior changes.

**Independent Test**:

```powershell
npm run test:pipeline -- tests/fixvox-text-runtime
npm run build
```

- [x] T005 Create `src/fixvox-text-runtime/` with source annotations for copied/adapted Fixvox functions.
- [x] T006 Copy/adapt default transcript and voice postprocess prompts from Fixvox `settings-types.ts`.
- [x] T007 Copy/adapt raw voice postprocess prompt builder, user-message builder, cleanup levels, and sanitizer from Fixvox `voice-dock-processing.ts`.
- [x] T008 Implement minimal normal-dictation policy/materialization helpers that match Fixvox route decisions for raw transcript vs postprocess.
- [x] T009 Turn RED tests green and add regression coverage for explanation-like output, too-long output, empty output, Spanish question punctuation, spoken corrections, fillers, technical identifiers, and disabled postprocess.

**Checkpoint Done When**: Provider-free tests prove Dictation Tauri has the same prompt/sanitizer/materialization primitives as Fixvox for normal dictation.

**Checkpoint 2 Evidence (2026-06-25)**: `src/fixvox-text-runtime/index.ts` contains pure copied/adapted Fixvox prompts, prompt builders, sanitizer, policy/route helpers, managed request previews, and normal materialization fallback. `npm run test:pipeline -- tests/fixvox-text-runtime` passed (2 files / 13 tests). `npm run build` passed.

---

## Phase 3: Checkpoint 3 — Wire Real Tauri Runtime To Fixvox-Equivalent Final Output

**Goal**: Existing dock stop/submit path uses Fixvox-equivalent final text before delivery.

**Independent Test**:

```powershell
npm run test:pipeline -- tests/fixvox-text-runtime tests/host-runtime tests/desktop-control
npm run build
cd src-tauri && cargo check
```

- [x] T010 Extend managed host runtime to call the same Fixvox managed `/v1/chat/completions` postprocess contract when policy enables postprocess.
- [x] T011 Preserve raw transcript internally while exposing/inserting the materialized final output and redacted evidence metadata.
- [x] T012 Update desktop controller/app-session seams so delivery uses materialized output, with raw-STT fallback only when Fixvox policy/sanitizer would fall back.
- [x] T013 Add mocked/provider-free tests for managed STT + managed chat request previews, postprocess skipped/failed/completed, sanitizer fallback, and final delivery text selection.

**Checkpoint Done When**: The real runtime path no longer bypasses Fixvox text materialization, and safe tests/build/cargo check pass.

**Checkpoint 3 Evidence (2026-06-25)**: `HostTranscriptionRequest` carries optional `postProcess` policy through TS/Tauri. TS host runtime materializes final output with Fixvox prompt/sanitizer helpers and redacted evidence. Rust/Tauri managed runtime calls Fixvox `/v1/chat/completions` when `postProcess.enabled` is true, falls back to raw transcript on provider/sanitizer failure, and writes redacted postprocess evidence. App real/Tauri runtime passes the Fixvox managed postprocess policy before delivery. Checks passed: `npm run test:pipeline -- tests/fixvox-text-runtime tests/host-runtime tests/desktop-control` (25 files / 128 tests), `npm run build`, `cd src-tauri && cargo fmt --check && cargo check`.

---

## Phase 4: Checkpoint 4 — Gated Parity Smoke And Docs Closeout

**Goal**: Verify with controlled evidence that Dictation Tauri follows Fixvox's text process.

**Independent Checks**:

```powershell
npm run test:pipeline
npm run build
npm run visual:check
cd src-tauri && cargo check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

- [x] T014 Add or reuse a local parity harness comparing Dictation Tauri output against Fixvox output/snapshot for the same controlled audio, with raw text redacted by default.
- [x] T015 Run one gated managed provider smoke and record redacted evidence in `quickstart.md`.
- [x] T016 Update `docs/WORKING_MEMORY.md`, relevant topics, and this tasks file with final behavior and known divergences.
- [x] T017 Keep/live-restart `npm run tauri:dev` if the runtime path changed and JP needs to test immediately.

**Checkpoint Done When**: Redacted parity evidence exists, checks pass, and docs say Fixvox text process is now the canonical adopted path.

**Checkpoint 4 Evidence (2026-06-25)**: Reused `scripts/fixvox-managed-smoke.ts` as the gated managed parity harness and updated it to use canonical Fixvox postprocess primitives from `src/fixvox-text-runtime`. Initial smoke exposed a harness divergence (`empty` postprocess because transcript was sent as a plain chat message); after switching the harness to `buildRawVoicePostProcessSystemPrompt` + `buildRawVoicePostProcessUserMessage`, managed smoke passed STT and postprocess with redacted evidence in `artifacts/microphone-capture/reports/fixvox-managed-smoke-2026-06-25T12-11-08-175Z.json`. Full checks passed before the harness fix: `npm run test:pipeline` (54 files / 268 tests), `npm run build`, `npm run visual:check` on retry, `cd src-tauri && cargo fmt --check && cargo check`, `bun scripts/context-index.ts && bun scripts/agent-context-audit.ts` (4 known warnings).
