# Tasks: Fixvox Self-Hosted Control Plane

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/http-api.md`, `contracts/product-api.md`, `contracts/temporary-aliases.md`, `contracts/product-route-disposition.md`

**Execution rule**: Manual staged work only. Execute one approved outcome band at a time, run its checks, update this file/docs, and stop. Do not use Taskflow or bulk-complete this plan unless JP explicitly changes that preference.

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

- [x] D-R1 Build and reconcile the 74-fixture/73-route consumer and disposition map (`canonical`, `redesign`, `temporary-compat`, `drop`) plus the scheduled boundary.
- [x] D-R2 Finalize the normative typed canonical contracts and complete the 40-scenario/39-alias ledger, including atomic `admin-profile-apply`.
- [x] D-R3 Reconcile `spec.md`, `plan.md`, contracts, this task list and the closure track; preserve historical blocked receipts while removing stale current blockers.
- [x] D-R4 Review the D2-D4 migration slices against the fully reconciled supported-consumer inventory and non-negotiable auth/quota/privacy/audit/exactly-one-provider invariants before runtime, Tauri or Admin implementation.

**Cadence amendment (2026-07-19):** D-R2-D-R4 formed one continuous outcome band, **D1 Contract closure**, now complete. The contracts are normative and ready for TDD. Detailed implementation tasks below remain checklists inside D2-D4, not mandatory micro-stops. D2 completed provider-free on 2026-07-19; D3 is the next separate batch and remains unstarted.

### D-R1 receipt (2026-07-17)

- `contracts/product-route-disposition.md` maps all 73 fixture IDs exactly once, reconciles 72 method/path pairs, preserves both `/desktop/login` scenarios, and records the single scheduled boundary.
- Current Dictation Tauri endpoints and Control Room `proxyAdmin(...)` calls are mapped separately from Worker-only legacy routes. Result: 1 exact canonical route, 9 redesigns, 39 temporary compatibility routes, and 24 drops; every temporary route has an owner, replacement, and retirement condition.
- Mechanical validation covered the exact fixture set, 72 routes, scheduled boundary, eight Tauri paths and 26 `proxyAdmin(...)` prefixes. Contract inventory passed 4/4; `git diff --check` and context audit passed without errors.
- This batch changed docs only. It did not define Batch 2 schemas, modify runtime/client code, touch PostgreSQL/Cloudflare/production, or begin Checkpoint E.

### Reality audit receipt (2026-07-19)

- Cloudflare API confirms Worker `df416730-61b8-4222-ab5f-282879251db9` at 100%, with KV `USAGE`, DO `USAGE_COUNTERS`, DO `CONTROL_PLANE_PUBLISH_LOCKS` and `fetch`/`scheduled`; public health is green. Cloudflare remains authority and hot path.
- VPS runs only the Admin/Pi surface relevant here: `fixvox-admin-web.service` is active on `127.0.0.1:8787`, production mode, proxying `https://auth-fixvox.jpsala.dev`.
- No installed `fixvox-api` unit or target directories exist on VPS, and no dedicated Fixvox PostgreSQL was proven there. Existing PostgreSQL processes belong to containerized workloads that were not inspected beyond read-only process evidence.
- Local self-hosted code is real and green at its bounded level: TypeScript, API unit 17/17 and PostgreSQL integration 12/12. Production composition still rejects non-mock mode; provider quota consume/release and Admin mutations remain absent.
- Tauri still defaults to the Cloudflare hostname. VPS checkout/WIP drift, the `8787` port collision, stale split-key support in `fixvox-admin`, and historical Worker-153 wording are explicit migration inputs.
- Audit was read-only: no deploy, restart, import, provider call, secret change, database mutation outside isolated `fixvox_test`, DNS or production mutation.

D1 assigned implementation to D2-D4. D2-D4 are complete; the closure receipt lives in `docs/tracks/fixvox-product-first-self-hosted-contract-plan.md`.

### D2 — Runtime + Tauri (complete)

- [x] T022 Complete strict config loading, secret-presence validation, explicit non-Admin port, and mock-only provider composition tests.
- [x] T023 Complete the Bun adapter, graceful shutdown, request limits/timeouts, redacted JSON boundary, `/health`, and safe `/ready` contract.
- [x] T024 TDD canonical desktop bootstrap/session/auth/context and implement only the Desktop/Auth aliases listed in `temporary-aliases.md` as thin adapters.
- [x] T025 TDD canonical transcription admission → reserve → exactly-one mocked provider dispatch → consume/release/ambiguous finalization, including `pro-unlimited` zero writes and concurrency/p95 gate.
- [x] T026 TDD typed `postprocess`, `selection_transform`, and `assistant` actions with server-owned engine/prompt/provider/model and one transformation/provider call.
- [x] T027 Add structured allowlist logging, privacy-sentinel scans, operation idempotency, and alias/canonical 0/1-call tests.
- [x] T028 Migrate Tauri coordinately to bootstrap/context, canonical transcription and typed actions; remove separate preflight from the canonical client flow while retaining rollback aliases for supported releases.
- [x] T029 Run D2 canonical and Desktop/Auth alias suites provider-free; record consumer/static route inventory. No physical/provider smoke.

### D2 COMPLETE receipt (2026-07-19)

- Bun API owns canonical desktop bootstrap/context/auth sessions, transcription and typed runtime actions on explicit local port `8790`; production-mode config still fails closed without provider secrets.
- Metered runtime reserves immediately before one mock provider dispatch, consumes/releases without retrying ambiguous outcomes, rejects duplicate operation IDs, and keeps `pro-unlimited` free of reservation/event writes. PostgreSQL quota-boundary p95 was **5.011 ms**, below the 15 ms gate.
- Tauri now builds canonical product-v1 bootstrap/auth/transcription/action requests and no longer performs the separate preflight in the canonical transcription flow. Named Desktop/Auth and preflight helpers remain only as rollback/compatibility surface; the static contract test proves canonical callers and retained aliases separately.
- Provider-free checks: TypeScript; API **26/26**; core **5/5**; PostgreSQL `fixvox_test` **13/13**; contract inventory **4/4**; runtime pipeline **40/40**; host-runtime **53/53**; `cargo fmt --check`; `cargo check`; Fixvox cloud contract **36/36**; Rust lib **104 passed, 1 ignored**; `git diff --check`.
- Residual non-blocking debt: Rust reports dead-code warnings around retained legacy preflight helpers; do not delete them before their compatibility/consumer retirement gate. Pi Lens also flags high complexity/fan-out in `cloud/fixvox-api/src/app.ts` (`dispatch` 202; `executeRuntime` 28); refactor only as a bounded safety improvement, not as hidden D3 scope.
- No dependency/schema change, provider/OAuth real, physical desktop smoke, secret, VPS, production, deploy, import, commit or push occurred. Cloudflare remains authority/hot path. D3 was not started.

### D3 — Control Room + retained operations (complete)

**RBAC decision (2026-07-19):** role targets must be already-linked accounts selected by opaque `principalKey`; email is redacted display metadata only. Stable browser `/api/admin/*` routes remain, while the BFF maps authorized selections to canonical role operations. Free-form `subjectEmail`, pending email invitations and schema changes are outside D3.

- [x] D3-01 TDD `/product/v1/control-room/*` DTOs and auth matrix by Session/RBAC, Profiles, Configuration, Engines/Pricing, Prompts, Accounts, Devices, Groups, Usage, Audit and Signals.
- [x] D3-02 Migrate stable browser `/api/admin/*` BFF calls domain by domain; keep backend credentials server-side and each old alias until caller count is zero.
- [x] D3-03 Implement revision-safe mutations, publish/rollback preview-confirmation, recent-Google/RBAC checks and immutable redacted audit with provider-free OAuth fixtures.
- [x] D3-04 Implement bounded product signals and only the five retained internal jobs in `product-api.md`; keep dropped support/prewarm/counter routes absent.
- [x] D3-05 Run every Control Room alias test and retire none unless its ledger condition and rollback review pass.

### D4 — Checkpoint D final gate (complete)

- [x] D4-01 Verify canonical desktop/Control Room flows, all 40 temporary-compat fixture scenarios across 39 unique aliases, dropped-route absence, auth/RBAC, quota concurrency, privacy sentinels and exactly-one-provider behavior provider-free.
- [x] D4-02 Run the broad deterministic ladder, confirm `fixvox_test` safe state and Cloudflare authority unchanged, then write the single Checkpoint D receipt or block.

**Checkpoint D gate**: Canonical desktop/Admin flows and named temporary aliases pass provider-free with privacy/auth/quota/exactly-once evidence; no VPS/public route.

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

### D1 blocked receipt (2026-07-19)

- Drafted `contracts/product-api.md` and the 39-scenario stale-map subset in `contracts/temporary-aliases.md`.
- Mechanical source comparison then found 74 top-level HTTP fixtures versus 73 disposition rows. Missing: supported `admin-profile-apply` (`POST /admin/control-plane/profiles/apply`), called by Control Room `/api/admin/profiles/apply`.
- This contradiction changes route disposition/transition, so D-R2-D-R4 remain open and the drafts are non-normative. No inference or runtime work followed.
- Docs-only: no runtime, Tauri, Admin, Worker, DB, provider, OAuth, VPS, production or external side effect.

### D1 COMPLETE receipt (2026-07-19)

- D-R1..D-R4 are closed. Normative `product-api.md`, `temporary-aliases.md`, `http-api.md`, and `product-route-disposition.md` reconcile the current source at 74 HTTP fixtures, 73 method/path pairs, 40 temporary-compat scenarios, and 39 unique aliases.
- Atomic profile apply is ready for TDD at `POST /product/v1/control-room/profiles/{profileKey}/apply`: `expectedRevision`, recent Google + `publish`, server-owned principal/actor/credential, one authoritative lock, zero-write stale/invalid failures, exactly one publication/revision/audit/receipt on success, and write-free identical replay. Draft/publish remains isolated legacy compatibility only.
- Spec, plan, tasks, contracts, closure track, Working Memory and generated context index were reconciled docs-only. Historical D1 BLOCKED, D1R-1 and D1R-2 receipts remain unchanged as chronology.
- Focused apply tests and mechanical source/disposition/alias plus contract assertions passed. D2-D4 remain unexecuted; Cloudflare remains authority/hot path.

**Checkpoint D is complete. D1-D4 and the final gate are closed; see the 2026-07-20 receipt in the canonical track.**

## Checkpoint E - Local product integration

**Goal**: Prove the coordinated Admin BFF and Tauri adapters work against the canonical local service, with temporary aliases only for explicitly supported older consumers.

- [x] T030 Add local start scripts for PostgreSQL + `fixvox-api` with explicit LOCAL banner/base URL.
- [x] T031 Run Admin Web against local API and verify Profiles/Engines/Prompts/Presets/Accounts/Devices/Audit read paths.
- [x] T032 Verify the product-first atomic apply/rollback path locally with synthetic data, idempotent receipts and immutable audit. Legacy draft/publish remains isolated compatibility and is not used to implement apply.
- [x] T033 Run Tauri provider-free/local contract flow against the same endpoint paths.
- [x] T034 Verify normal dictation, selection/preset, and Quick Chat routing use effective profile engines/prompts.
- [x] T035 With separate approval, run one local real-provider smoke and prove exactly one provider request.

**Checkpoint E gate**: Complete. Local product parity/privacy passed provider-free, followed by one explicitly authorized real Groq chat request with synthetic content and exactly-one evidence.

### Checkpoint E provider-free receipt (2026-07-20)

- `npm run selfhosted:api:local` now starts only loopback `fixvox-api` on `8790`, requires the isolated `fixvox_test` database, runs migrations, prints an explicit LOCAL/MOCK banner and leaves Cloudflare authority unchanged. `npm run admin:web:local -- -SelfHosted` selects the same local backend with a fail-closed loopback-only auth fixture; production mode cannot enable it.
- The coordinated smoke starts the real Bun API and Admin BFF against PostgreSQL, verifies Profiles/Engines/Prompts/Presets/Accounts/Devices/Audit, atomic apply + idempotent replay + rollback, immutable redacted audit, canonical bootstrap/context/transcription/actions, and exact server-owned routing for STT, postprocess, selection preset and Quick Chat. It terminates both services and restores `fixvox_test` to `cloudflare-authority` revision `0`.
- Product profile definitions now materialize engine/provider/model/prompt routing server-side from the PostgreSQL catalog; browser/Tauri responses do not expose routing authority. Canonical apply/rollback require owner/publisher, recent Google, expected revision and typed confirmation, and append one redacted receipt without schema or dependency changes.
- Final evidence: provider-free local smoke **1/1, 23 assertions**; explicitly authorized T035 real-provider smoke **1/1, 3 assertions**, Groq chat `200`, exactly **1** provider request, output present and no raw content persisted; API unit **29/29**; PostgreSQL **17/17**, quota p95 **4.044 ms**; Admin BFF **22/22**; Tauri canonical/aliases **36/36**; cloud contract **4/4**; build, TypeScript, syntax and `git diff --check` green. Redacted ignored report: `artifacts/self-hosted-control-plane/checkpoint-e/t035-real-provider-smoke.json`. No OAuth real, VPS, Cloudflare/production mutation, deploy, import, DNS, canary, commit, push or publish occurred.

---

## Checkpoint F - VPS loopback and operations

**Goal**: Operate the service privately before any public traffic.

- [x] T036 Update `C:/dev/infra` plan/runbook with service owner, port, paths, DB, backups, checks, and secret variable names only.
- [x] T037 Request approval and provision dedicated PostgreSQL/service runtime on VPS; do not reuse Coolify internal DB.
- [x] T038 Install/deploy `fixvox-api.service` bound to loopback/private network with protected env.
- [x] T039 Add health/readiness/status/log wrappers and systemd timer(s).
- [x] T040 Configure encrypted backup and retention outside the repo.
- [ ] T041 Rehearse service restart, application rollback, database backup, and isolated restore.
  - [x] F5R1 local control-release proof: two deterministic repackages from
    approved archive `9afa…`; runtime identity and isolated `/health` passed.
    F5R2 está superseded; F5R3-F6 forman ahora un outcome band consolidado.
- [ ] T042 Verify through SSH tunnel/host-local requests only; no public DNS route.

**F1 receipt (2026-07-20)**: T036 complete with matching project/Infra runbooks and deterministic dry-run deployment assets under `ops/fixvox-api/`.

**F2 receipt (2026-07-20)**: T037 complete after explicit install/VPS gates. PostgreSQL 16 host-managed, dedicated DB/roles, schema v4, protected config and an off-host backup identity/public recipient pair passed checksums, least-privilege, permissions and synthetic encryption verification.

**F3 attempt (2026-07-20)**: T038 remains incomplete. Hash, immutable release, `current`, unit verification and preflight passed, but runtime boot failed because the approved bundle omits `fixvox-proxy` modules imported by `fixvox-api/src/projections.ts`. The first-deploy unit was stopped and disabled; `8790` is free, Admin `8787` remains healthy and Cloudflare remains authority. F3 is blocked pending a reviewed dependency closure, exact-bundle local boot proof and a new authorization.

**F3R4 local review receipt (2026-07-20)**: The one bounded local repair aligned the Bun `admin-runtime-policy` projection with the Worker shape by carrying persisted selection-preset defaults with safe fallback metadata and excluding the internal `groupOptions` field from that DTO. The frozen core default and `defaults.recipePolicy` remain intact. The applicable parity report compares 27 fixtures with `missingWorker/mismatches = 0/0`; `npm run cloud:test` is **154/154**, API unit is **29/29**, the exact archive boot smoke returns health 200 and cleans up, and the deterministic archive hash is `9afa5dc85b783793b25573ff50d5d6b918afc83f95880c6231f8b44c42f7bb0d` (local evidence only, not transferred). Project docs were updated before the Infra mirror. No VPS, provider, import, DNS/Tunnel, public traffic, commit or push occurred.

**F3R4 status**: complete; focus was `waiting_gate`. Reference: `docs/tracks/fixvox-self-hosted-checkpoint-f-vps-loopback-plan.md`.

**F3R5 VPS retry receipt (2026-07-20)**: With fresh explicit authorization, the approved archive SHA-256 `9afa5dc85b783793b25573ff50d5d6b918afc83f95880c6231f8b44c42f7bb0d` was verified locally, in staging, and in immutable release `9afa5dc85b783793`; `current` moved atomically while `cdda90ea76d4c361` remained preserved. Preflight passed with `8790` free and final resources above 1 GiB; PostgreSQL is accepting with schema v4, all four migration checksums exact, and `cloudflare-authority`. The user unit passed `systemd-analyze --user verify`, is enabled/active/running with zero restarts, and owns exactly one `127.0.0.1:8790` listener/PID. Host-local `/health` and `/ready` returned 200 with DB/schema/jobs and authority green. Admin `127.0.0.1:8787` remained active/200; mock-only env allowlist, redacted allowlisted journal/privacy sentinel, and the dirty VPS checkout fingerprint remained green. No provider, import, DNS/Tunnel, public route, Coolify/Zulip, commit or push occurred.

**F3R5 status**: complete. F4 was separately authorized and is complete; F5-F6 remain unstarted and separately gated. The Checkpoint F gate still requires restart, rollback and isolated restore rehearsal.

**F4 receipt (2026-07-21)**: Installed six F4 wrappers and four user units/timers under the approved VPS paths; `systemd-analyze --user verify`, daemon-reload, enable/start and timer visibility passed. Timers use `Persistent=true` with 15/30 minute randomized jitter; maintenance and backup wrappers use fail-closed `flock` locks. Manual and systemd maintenance/backup executions succeeded. The encrypted artifact is `pg_dump` custom → `zstd` → `age` with only the public recipient; no decrypt or private identity use occurred. Backup and manifest are `jpsal`-owned, `0600`, inside the `0700` backup directory; age header/hash, strict manifest allowlist, health/readiness `cloudflare-authority`, Admin `/healthz` 200, loopback listener, resources and redacted journal/privacy checks passed. Lock-collision tests produced no extra backup. No provider, import, DNS/Tunnel, public traffic, restore, commit or push occurred.

**F4 status**: complete; focus returns to `waiting_gate`. F5 requires fresh explicit authorization and is not started.

**F5 blocked receipt (2026-07-21)**: T041 remains unchecked. The critical rollback guard found only two remote releases: current `9afa5dc85b783793` and the prior `cdda90ea76d4c361`. The prior release is the known defective dependency-closure bundle and is not an approved arrancable rollback target. No other approved healthy target exists in the assets/runbook/remote release set. Therefore no `current` transition, rollback restart, decrypt, `pg_restore`, temporary database creation or cleanup was attempted. Read-only VPS evidence preserved `current -> 9afa5dc85b783793`, enabled/active API, one loopback listener, health/readiness 200 with `cloudflare-authority`, Admin 8787 200, F4 timers/backups, `MemAvailable=2601444 KiB`, `/` free `58971424 KiB`, and the 19-entry dirty checkout. Cloudflare remains authority; no traffic, mutation, provider, import, DNS/Tunnel or checkout change occurred.

**F5 recovery plan (2026-07-21)**: T041 remains one gate but is resumed through four serial bounded batches. F5R1 locally builds a deterministic rollback-control archive from the approved `9afa…` archive only; it must have a distinct archive hash while every extracted runtime path and file hash remains identical, and it must pass isolated boot without VPS access. F5R2 is separately gated to promote that control candidate as the forward `current`, preserving `9afa…` as the known-good rollback target. F5R3 is separately gated to rehearse restart, rollback to `9afa…`, and return to the candidate. F5R4 is separately gated to decrypt off-host, restore into one `fixvox_restore_*` database, compare schema/authority/counts/projection hashes, and drop it only after an exact match. `cdda…` is never used or repaired.

**F5R1 receipt (2026-07-21)**: The local builder consumed only the approved archive SHA-256 `9afa5dc85b783793b25573ff50d5d6b918afc83f95880c6231f8b44c42f7bb0d` plus exact manifest SHA-256 `62969be6d7fbef3c99f019f9f9cb26d54a97fecdf2832e8a8ca8d998e71dd6e8`. Two independent builds matched at candidate archive SHA-256 `b18a1e92ad3ef9707f733ffdeecf3a8e2f42967b1935df725d501521e288f28c` / release ID `b18a1e92ad3ef970`, with fixed control epoch `946684801`; all 54 runtime paths and file hashes matched source, allowlist/privacy passed, and isolated candidate boot returned `/health` 200 with cleanup. No checkout `bundle.sh`, VPS, `cdda…`, install, provider, deploy, restart, decrypt, restore, DB, commit, push or publish occurred.

**F5 status**: `waiting_gate` after F5R1. F5R2 is superseded; F5R3,
F5R4 and T042/F6 are unstarted and consolidated into Gate F Closure. The
current VPS release, F4 backups/timers and off-host identity remain preserved.

**Checkpoint F gate**: Loopback service, restart/application rollback,
encrypted backup, and isolated restore pass.

---

## Remaining Cadence Amendment — 2026-07-22

`/flow → Hacer` ejecuta un solo outcome band, no una sesión por cada task. Las
tareas detalladas siguen como aceptación interna, con esta cadencia restante:

1. **Gate F Closure:** F5R3, F5R4 y F6/T042 en una ejecución larga.
2. **Checkpoint G:** T043-T048 en una ejecución larga.
3. **Checkpoint H:** T049-T053 en una ejecución larga con el routing canary.
4. **Checkpoint I:** cutover separado; Checkpoint J sólo tras estabilización.

Cada band conserva su autorización externa exacta y se detiene fail-closed si
falla una etapa crítica. No hay handoff ni `/flow` nuevo entre etapas internas.

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

## Current Outcome Band

Checkpoints A-E y F1-F4/F5R1 están completos. F5R2 está superseded. El foco es
**Gate F Closure**: F5R3, F5R4 y F6/T042 en una sola ejecución Hacer sobre
`current=4075da53c365a8b1`, rollback `66652d0fa6073c26` y schema 6. Cloudflare
permanece authority/hot path; releases, backups, timers e identidad off-host
siguen preservados.

Next action: obtain one explicit authorization for the consolidated Gate F
Closure brief; do not operate the VPS before that gate.
