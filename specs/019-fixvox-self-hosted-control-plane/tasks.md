# Tasks: Fixvox Self-Hosted Control Plane

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/http-api.md`

**Execution rule**: Manual staged work only. Execute one checkpoint at a time, run its checks, update this file/docs, and stop. Do not use Taskflow or bulk-complete this plan unless JP explicitly changes that preference.

## Checkpoint A - Freeze contracts and current authority

**Goal**: Establish a provider-free behavioral baseline before moving code.

- [x] T001 Inventory all public/runtime/Admin routes from `cloud/fixvox-proxy/src/index.ts` into contract fixtures under `tests/cloud-contract/`.
- [x] T002 Record normalized request/response/error schemas and safe headers for required Tauri/Admin routes; update `contracts/http-api.md` where gaps appear.
- [x] T003 Add redaction assertions that reject raw IDs, OAuth state/tokens, provider keys, transcripts, selected text, and audio bodies.
- [x] T004 Add a deterministic Worker-handler contract runner using mocked providers and in-memory storage.
- [x] T005 Capture active Worker version/bundle hash and safe live authority projection in ignored evidence; no production mutation.
- [x] T006 Run `npm run cloud:test`, contract tests, and Wrangler dry-run.

**Checkpoint A verification**:

```powershell
npm run cloud:test
npm run test:pipeline -- tests/cloud-contract
cd cloud/fixvox-proxy; npx wrangler deploy --dry-run
```

**Stop condition**: Every required endpoint has a fixture or an explicit scoped deferral. No infrastructure provisioning.

**Checkpoint A evidence (2026-07-14)**: 70 HTTP fixtures plus one scheduled boundary cover the current Worker/usage-counter surface. The normalized provider-free runner passed with zero real upstream calls; report: `artifacts/self-hosted-control-plane/checkpoint-a/worker-contract-report.json`. Authority/version evidence is redacted and ignored at `artifacts/self-hosted-control-plane/checkpoint-a/authority-baseline.json`; it records Worker version 153, a local bundle-manifest hash, and the documented read-only profile projection. Wrangler dry-run passed without deployment. No PostgreSQL/VPS/DNS/secrets/import/Admin production mutation/provider call was performed.

---

## Checkpoint B - Introduce platform-neutral ports

**Goal**: Separate business rules from Cloudflare APIs without changing production behavior.

- [x] T007 Create `cloud/fixvox-core/src/ports/` interfaces for control-plane storage, profile publication, usage quotas, auth sessions, request events, clock/IDs, providers, and jobs.
- [x] T008 Move one low-risk read-only policy/profile resolution slice into `fixvox-core` with unchanged tests.
- [x] T009 Adapt `fixvox-proxy` KV/DO code to the new ports for that slice.
- [x] T010 Continue extraction by bounded modules: device binding, profiles/publication, auth, preflight/quota, provider proxy, Admin.
- [x] T011 Keep Worker `index.ts` as adapter/routing composition, not duplicate business authority.
- [x] T012 Verify local dry-run bundle behavior and all cloud/contract tests after each extraction batch.

**Checkpoint B gate**: No API/schema behavior change and no deploy.

**Lean Checkpoint Loop v0.1 receipt (2026-07-14)**

- Protocol / checkpoint / class / scope: v0.1 / B / L1 / T007-T012; capable single owner; hard stop before T013.
- Completed tasks: T007-T012; no install, provider, secret, production, deploy, real-data, Admin mutation, or Checkpoint C action.
- Files changed: new `cloud/fixvox-core/src/{ports,auth,control-plane,execution,jobs}/`; Worker adapters plus scoped proxy/store/job tests and Spec 019 state docs.
- Decisions/invariants: real injected seams, not façade-only ports; Worker remains runtime adapter; endpoint/schema/error behavior unchanged.
- Focused checks: core 5 pass; control-plane store 37 pass; scheduled tasks 6 pass; managed execution + scheduled 39 pass; compatibility correction core + store 42 pass.
- Close check: initial combined gate green; one justified rerun after the correction finished with cloud 136/136, contract 4/4, and Wrangler dry-run green.
- Failures/repairs: zero deterministic gate failures; one review-detected compatibility repair preserved legacy label formatting and mapped-ID parsing; one trivial metrics-command quoting error did not consume budget.
- Advisor: one L1 architecture trigger; result was to require real seams for policy, binding, quota, auth, provider/events/jobs, publication, and Admin.
- Metrics: 6 tasks, 5 focused invocations, 2 broad close invocations (1 justified rerun), 0 human interruptions, 0 out-of-scope changes, about 14 minutes implementation-to-receipt.
- Remaining risk/repo state: pre-existing dirty worktree preserved; no commit; direct scoped diagnostics retain two pre-existing structural findings in `control-plane-store.ts`, while standalone LSP lacks Worker/Bun ambient types; deterministic gates are green.
- Next checkpoint/gate: T013/Checkpoint C is not started and requires fresh authorization before dependencies or PostgreSQL tooling.

---

## Checkpoint C - PostgreSQL foundation

**Goal**: Build an isolated transactional authority locally.

**Authorization/status (2026-07-15)**: JP authorized starting Checkpoint C and then explicitly approved `winget install --exact --id PostgreSQL.PostgreSQL.17 --version 17.10-2 --source winget`. Bun 1.2.20 provides native `Bun.SQL`, so no npm database driver or ORM is planned. Local discovery found no `psql`, `pg_isready`, Docker, or Podman. The authorized PostgreSQL 17 Winget attempt reached the official EnterpriseDB download URL but failed before installation with HTTP 403 (`0x80190193`). JP then explicitly authorized PostgreSQL 16 via `winget install --exact --id PostgreSQL.PostgreSQL.16 --version 16.14-2 --source winget`; that official download failed with the same 403 before installation. No PostgreSQL system change was made. Implementation may advance through dependency-free scaffolding, migrations, checksum logic, and unit tests while a manual/local installation path remains blocked. No VPS, production, Cloudflare, secrets, real-data, provider, deploy, or Admin mutation effects are authorized.

- [x] T013 Confirm Bun runtime and PostgreSQL tooling/dependencies; request install/package authorization before adding anything.
- [x] T014 Create `cloud/fixvox-api/` and migrations for authority, accounts/devices/bindings, profiles/versions, engines/prompts, assignments, auth, audit, and usage.
- [x] T015 Add migration checksum/version table and fail-closed startup when schema is incompatible.
- [x] T016 Implement PostgreSQL repositories for device/install binding and effective profile resolution.
- [x] T017 Implement immutable profile publication/audit transactions with stale revision protection.
- [x] T018 Implement transactional quota reservations/events, idempotency, expiry/release, and `pro-unlimited` no-event semantics.
- [x] T019 Add isolated PostgreSQL test harness and cleanup that never points to production.
- [x] T020 Add concurrency tests for at least 20 synthetic preflight/quota requests.
- [x] T021 Add backup manifest generation using safe counts/hashes only.

**Checkpoint C gate**: PostgreSQL tests pass locally; Cloudflare remains authority.

### Checkpoint C receipt (2026-07-15)

- JP installed PostgreSQL 18.4 locally after the PostgreSQL 17/16 Winget downloads were blocked upstream. With explicit authorization, local-only authentication was recovered through a temporary localhost `trust` window; `pg_hba.conf` was restored immediately to `scram-sha-256`, the service was restarted, and generated credentials were stored only in ignored `.env.postgres.local`.
- Created isolated non-superuser role/database `fixvox_test`; the harness verifies the database name before cleanup and never points to production.
- Added dependency-free `cloud/fixvox-api/` using Bun 1.2.20 `Bun.SQL`; no npm database driver or ORM was added.
- Migrations 0001-0002 cover the full initial authority model, checksum/version tracking, immutable profile-history guards, and append-only audit guards. Raw audio/transcript content columns are absent.
- Added repositories for install/device binding conflict protection, account/device/group/fallback effective-profile resolution, transactional profile publication with stale revision protection, and quota reserve/consume/release semantics. `pro-unlimited` writes no reservation/event.
- The 20-request concurrency test admits exactly 10 reservations against limit 10 with no over-admission. Idempotent retry, single consume event, release behavior, migration idempotency, database-ahead/checksum failure, and safe backup manifest counts/hashes are covered.
- Verification: TypeScript no-emit passed; migration verify/current schema v2 passed; unit 4/4 and PostgreSQL integration 11/11 passed. Backup manifest contains schema/authority, bounded counts, and projection hashes only.
- Cloudflare remains authority; no VPS, provider, production, deploy, import, Admin mutation, or real user data was touched. Checkpoint D remains unstarted.

---

## Checkpoint D - Product-Owned Self-hosted Bun API

**Goal**: Serve canonical Dictation Tauri and Control Room flows locally with mocked providers. Worker routes are migration evidence; only named temporary aliases require compatibility.

### Product-first recalibration (2026-07-16)

- [x] D-R1 Build the 73-fixture/72-route consumer and disposition map (`canonical`, `redesign`, `temporary-compat`, `drop`) plus the scheduled boundary.
- [ ] D-R2 Specify typed canonical contracts for desktop bootstrap/session, transcription, runtime actions and Admin-BFF domain calls; name every alias owner and retirement condition.
- [ ] D-R3 Reconcile `spec.md`, `plan.md`, `contracts/http-api.md`, this task list and the closure track around canonical-flow gates rather than Worker equality.
- [ ] D-R4 Review the product contract and migration slices before any runtime, Tauri or Admin implementation.

### D-R1 receipt (2026-07-17)

- `contracts/product-route-disposition.md` maps all 73 fixture IDs exactly once, reconciles 72 method/path pairs, preserves both `/desktop/login` scenarios, and records the single scheduled boundary.
- Current Dictation Tauri endpoints and Control Room `proxyAdmin(...)` calls are mapped separately from Worker-only legacy routes. Result: 1 exact canonical route, 9 redesigns, 39 temporary compatibility routes, and 24 drops; every temporary route has an owner, replacement, and retirement condition.
- Mechanical validation covered the exact fixture set, 72 routes, scheduled boundary, eight Tauri paths and 26 `proxyAdmin(...)` prefixes. Contract inventory passed 4/4; `git diff --check` and context audit passed without errors.
- This batch changed docs only. It did not define Batch 2 schemas, modify runtime/client code, touch PostgreSQL/Cloudflare/production, or begin Checkpoint E.

The original T022-T029 implementation items remain useful inputs but are suspended until D-R1-D-R4 determine whether each belongs to a canonical flow, migration alias or dropped legacy surface.

- [ ] T022 Implement strict config loading and secret-presence validation in `cloud/fixvox-api/src/config.ts`.
- [ ] T023 Implement `Bun.serve` adapter, graceful shutdown, request limits/timeouts, and JSON error boundary.
- [ ] T024 Implement `/health` compatibility and self-hosted `/ready` safe dependency/schema checks.
- [ ] T025 Wire device/auth/preflight/Admin routes to PostgreSQL repositories.
- [ ] T026 Wire STT/chat provider proxy with streaming/bounded buffers and no content persistence.
- [ ] T027 Add structured allowlist logging and raw-body/content redaction tests.
- [ ] T028 Replace Worker cron behavior with explicit job functions and planned systemd timers.
- [ ] T029 Run the same contract suite against Worker and Bun adapters and compare normalized responses.

**Checkpoint D gate**: Full provider-free contract parity; no VPS/public route.

---

### Checkpoint D partial receipt (2026-07-15)

- T022-T024 have initial strict mock-mode config, Bun server, `/health`, `/ready`, bounded request handling and redacted JSON boundary; they still require full compatibility verification.
- T025-T026 are **partial**: the Bun handler validates an active `X-Device-Id`, resolves the effective PostgreSQL profile, and supplies a policy-selected engine to the mock provider boundary. Client `provider`/`model` fields cannot choose the target. Admin mutation routes and quota reservation consume/release wiring remain missing.
- Auth/desktop bounded batch: migration `0003` was applied only to local `fixvox_test`, adding hash-only OAuth state/result lifecycle and desktop handoff/claim constraints. The transactional repository provides one-time callback consumption, completion/failure, expiry, atomic claim/link, and the exact 10-minute recent-Google comparison. The mock OAuth boundary has no network path. Bearer sessions map stored role bindings to view/edit/publish; publish/rollback and role mutations require recent Google auth. Browser Admin cookie state remains outside `fixvox-api`. Repository integration covers one winning concurrent callback/claim and the exact recent-auth boundary. Profile Composer/Admin read work remains excluded.
- T027 has allowlist logging and direct redaction tests. The PostgreSQL contract runner injects a no-op logger so raw fixture IDs never enter test output/evidence.
- T028 has explicit provider-free maintenance functions; systemd timer artifacts and parity with every Worker scheduled behavior remain pending.
- T029 is **not complete**. `tests/cloud-contract/bun-contract-runner.contract.ts` executes 16 applicable frozen fixtures against the real isolated `fixvox_test` PostgreSQL database and mock providers. `compare-adapter-reports.contract.ts` compares the fresh Worker/Bun reports for those same fixtures after normalization to status, media type, response shape, handled error code, complete JSON schema, and safe headers (excluding only volatile request-id). Root `npm run cloud:contract:parity` runs Worker, Bun/PostgreSQL, and comparison sequentially. The strengthened comparator initially reported 7 structural/header divergences. The projection batch centralised register/preflight presentation and corrected all 7; the current 16-fixture dual run reports 0 mismatches. T029 remains incomplete because the other contractual routes still lack Bun execution, but this bounded parity gate is green. It does not yet execute the remaining Admin, desktop/OAuth, support, pricing, usage-counter, or unsupported route fixtures. Those are gaps, not deferrals.

### Checkpoint D review gate (2026-07-16)

A read-only conformance review found the current gate red and established the closure plan at `docs/tracks/fixvox-self-hosted-checkpoint-d-closure-plan.md`.

- Green: API TypeScript, core 5/5, API unit 17/17, PostgreSQL 12/12 after safe cleanup, schema v4 and Worker cloud tests.
- Red deterministic gate: built-in catalog bootstrap is not idempotent because `JSON.stringify` does not match PostgreSQL `jsonb` key order; its integration test also leaves authority revision `7`, lacks the safe non-test-database guard case and does not prove independent-connection concurrency.
- Contract inventory currently contains 73 HTTP fixtures plus one scheduled boundary. Bun executes 27 and leaves 46 outside the runner.
- The 27-fixture Bun run passes its fixture assertions, but Worker/Bun comparison fails four Admin DTOs: runtime policy, profiles, devices and accounts.
- Contract inventory test is red because two valid `/desktop/login` scenarios collide under method/path-only uniqueness.
- Quota reservation is not connected to chat/audio. JP decided that provider endpoints reserve authoritatively immediately before the single provider call, consume/release afterward and stop if provider-free PostgreSQL overhead p95 exceeds 15 ms. The original “keep Tauri unchanged” clause was superseded on 2026-07-16 by coordinated product-first client/API migration.
- Current Taskflow spike remains blocked and is not the implementation engine for this closure.

### Checkpoint D Batch 1 resolution receipt (2026-07-16)

- The reported `Bun.SQL.begin(...)` hang was isolated to Bun 1.2.20's `await expect(promise).rejects.toThrow(...)` matcher path. Standalone `begin` return/throw and advisory-lock return/throw cases completed normally; the real bootstrap also rejected and rolled back normally outside that matcher.
- The two conflict tests now use native rejection capture, and the concurrency assertion uses scalar placeholders instead of passing a JavaScript array to `ANY($1)`. No runtime transaction, schema, dependency or product behavior changed.
- API TypeScript, bootstrap 6/6, PostgreSQL 12/12, migration verification and contract inventory 4/4 passed twice in order. Final state remained `fixvox_test`, `cloudflare-authority`, revision `0`, with the advisory lock available and released.
- Batch 1 is complete. Batch 2 (truthful 73-fixture HTTP matrix plus the explicit scheduled boundary) is unlocked; no Checkpoint D implementation task is marked complete yet.

**Checkpoint D remains incomplete. Do not begin Checkpoint E.**

## Checkpoint E - Local product integration

**Goal**: Prove current Admin and Tauri clients work unchanged against the local service.

- [ ] T030 Add local start scripts for PostgreSQL + `fixvox-api` with explicit LOCAL banner/base URL.
- [ ] T031 Run Admin Web against local API and verify Profiles/Engines/Prompts/Presets/Accounts/Devices/Audit read paths.
- [ ] T032 Verify draft/preview/publish/rollback locally with synthetic data and immutable audit.
- [ ] T033 Run Tauri provider-free/local contract flow against the same endpoint paths.
- [ ] T034 Verify normal dictation, selection/preset, and Quick Chat routing use effective profile engines/prompts.
- [ ] T035 With separate approval, run one local real-provider smoke and prove exactly one provider request.

**Checkpoint E gate**: Local product parity and privacy evidence pass.

---

## Checkpoint F - VPS loopback and operations

**Goal**: Operate the service privately before any public traffic.

- [ ] T036 Update `C:/dev/infra` plan/runbook with service owner, port, paths, DB, backups, checks, and secret variable names only.
- [ ] T037 Request approval and provision dedicated PostgreSQL/service runtime on VPS; do not reuse Coolify internal DB.
- [ ] T038 Install/deploy `fixvox-api.service` bound to loopback/private network with protected env.
- [ ] T039 Add health/readiness/status/log wrappers and systemd timer(s).
- [ ] T040 Configure encrypted backup and retention outside the repo.
- [ ] T041 Rehearse service restart, application rollback, database backup, and isolated restore.
- [ ] T042 Verify through SSH tunnel/host-local requests only; no public DNS route.

**Checkpoint F gate**: Loopback service and restore rehearsal pass.

---

## Checkpoint G - Migration rehearsal

**Goal**: Prove state can move without changing authority.

- [ ] T043 Build private Cloudflare export command with schema/version/count/hash manifest and no browser download.
- [ ] T044 Build idempotent PostgreSQL import command with dry-run and transaction rollback.
- [ ] T045 Compare effective account/device/profile/capability/limit/engine/prompt projections after import.
- [ ] T046 Define treatment for pending OAuth sessions, rolling usage, feedback/pricing, and unsupported legacy keys.
- [ ] T047 Repeat export/import from a controlled snapshot until manifests are deterministic.
- [ ] T048 Document final Admin mutation freeze and authority revision protocol.

**Checkpoint G gate**: 100% required projection match; production remains on Worker.

---

## Checkpoint H - Canary

**Goal**: Route one allowlisted JP identity without duplicate provider traffic.

- [ ] T049 Request explicit approval for DNS/Tunnel/staging/canary changes and real provider use.
- [ ] T050 Configure canary routing with immediate Worker rollback and no request mirroring.
- [ ] T051 Verify health, login/link, effective profile, preflight, Admin reads, and one controlled normal dictation.
- [ ] T052 Confirm one provider request, no postprocess when `jp` profile disables it, and no raw content storage/logging.
- [ ] T053 Rehearse rollback to Worker and verify no data repair is needed before authority cutover.

**Checkpoint H gate**: Canary and rollback pass with redacted evidence.

---

## Checkpoint I - Production authority cutover

**Goal**: Make PostgreSQL/VPS authoritative while keeping hostname/contracts stable.

- [ ] T054 Request explicit cutover approval including window, owner, freeze, commands, checks, stop conditions, and rollback class.
- [ ] T055 Freeze Admin mutations and capture final Cloudflare authority revision/export.
- [ ] T056 Import and validate final snapshot; abort on any count/hash/projection mismatch.
- [ ] T057 Switch edge origin for `auth-fixvox.jpsala.dev` while preserving client contracts.
- [ ] T058 Set `control_plane_authority.mode=vps-authority` only after health and revision gates pass.
- [ ] T059 Verify production health, Admin read-only surfaces, account/device/profile resolution, and controlled dictation.
- [ ] T060 Monitor structured errors/provider counts/database/backups during the stabilization window.

**Checkpoint I gate**: No Worker/KV/DO hot-path traffic and no unresolved parity error.

---

## Checkpoint J - Retirement and optional full Cloudflare exit

- [ ] T061 Decide stabilization duration and whether Worker remains warm, read-only, or removed.
- [ ] T062 Export/archive final Worker authority metadata and rollback version references privately.
- [ ] T063 With approval, disable Worker mutations/provider paths and remove KV/DO from the product hot path.
- [ ] T064 Update `C:/dev/infra`, project docs, inventories, credentials locations, runbooks, and ownership.
- [ ] T065 Decide separately whether to retain Cloudflare edge or plan direct Caddy/DNS migration.
- [ ] T066 Regenerate context indexes/audits and close/archive this spec only after production stabilization.

## Dependencies

- A blocks B.
- B blocks C/D.
- C and D must both complete before E.
- E blocks VPS provisioning/integration F.
- F blocks migration rehearsal G.
- G blocks canary H.
- H blocks authority cutover I.
- I stabilization blocks retirement J.

## Current Bounded Batch

Checkpoints A-C (T001-T021) are complete. **Checkpoint D is active and incomplete** under manual staged work. Batch 1 deterministic gates are green; JP then selected product-first architecture, superseding route-count parity as the target.

Single execution focus: `docs/tracks/fixvox-product-first-self-hosted-contract-plan.md`, **Batch 1 — Mapa Consumidor/Disposición**, profile **Implementador** with manual staged execution and one owner. Convert the 73 HTTP fixtures/72 unique routes plus scheduled boundary into consumer/disposition evidence, then stop at the batch checkpoint. Do not run Taskflow, edit runtime/clients, start Checkpoint E, provision VPS, deploy, import production state, mutate Admin/Cloudflare, create/copy secrets or use real providers.
