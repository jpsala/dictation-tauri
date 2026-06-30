# Tasks: Fixvox Cloud Consolidation

## Phase 1: Bootstrap Cloud Source

- [x] T001 Copy Fixvox Cloud Worker from `C:/dev/fixvox/proxy` into `cloud/fixvox-proxy`, excluding `node_modules`, `.wrangler`, and `.dev.vars`.
- [x] T002 Add root scripts for `cloud:test`, `cloud:dev`, and gated `cloud:deploy`.
- [x] T003 Ensure local secret files (`.dev.vars`) are ignored in this repo.
- [x] T004 Run provider-free Worker tests from the copied location.

## Phase 2: Ownership Docs

- [x] T005 Create consolidation spec/plan/tasks.
- [x] T006 Update active track and working memory to make this repo the future owner of Fixvox Tauri Cloud.
- [x] T007 Refresh context index and audit.

## Phase 3: Cutover Deploy (Gated)

- [x] T008 With explicit JP approval, deploy `cloud/fixvox-proxy` from this repo.
- [x] T009 Rerun T021 redacted login/link smoke against production after deploy from this repo.
- [x] T010 Record Worker version ID and evidence.

## Phase 4: Legacy Demotion

- [ ] T011 Document `C:/dev/fixvox` as legacy/reference for new Tauri Cloud work.
- [ ] T012 Remove remaining docs that say Cloud changes must be made in `C:/dev/fixvox`, replacing them with this repo path.

## Guardrails

- No push.
- No deploy without explicit approval.
- Do not copy or commit `.dev.vars`, `.env*`, tokens, invite codes, account IDs, transcripts, selected text, or audio.
- Do not modify or revert pre-existing `C:/dev/fixvox` generated-debug changes.
- Keep the copied Worker behavior equivalent before intentional cutover changes.
