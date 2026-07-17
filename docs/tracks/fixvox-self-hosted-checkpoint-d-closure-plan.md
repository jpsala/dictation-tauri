---
status: superseded
started: 2026-07-16
updated: 2026-07-16
priority: high
owner: Pi
related:
  - specs/019-fixvox-self-hosted-control-plane/plan.md
  - specs/019-fixvox-self-hosted-control-plane/tasks.md
  - docs/tracks/bounded-taskflow-implementation-spike.md
  - docs/WORKING_MEMORY.md
topic: fixvox-self-hosted-checkpoint-d-closure
source_refs:
  - cloud/fixvox-api/
  - cloud/fixvox-core/
  - tests/cloud-contract/
  - artifacts/self-hosted-control-plane/checkpoint-a/worker-contract-report.json
  - artifacts/self-hosted-control-plane/checkpoint-d/bun-contract-report.json
  - artifacts/self-hosted-control-plane/checkpoint-d/adapter-parity-report.json
---

# Fixvox Self-Hosted Checkpoint D Closure Plan

> Superseded on 2026-07-16 by `docs/tracks/fixvox-product-first-self-hosted-contract-plan.md`. This file preserves review baselines, failed attempts and Batch 1 receipts; do not execute its original Batches 2-8.

## Routing Decision

- **Intent:** architecture recalibration → product-owned contract plan; runtime implementation remains disabled during this documentation batch.
- **Primary engine:** manual staged analysis from the **Arquitectura/Contrato** profile.
- **Why:** JP selected product-first evolution. The dirty working tree and coordinated Tauri/Admin/API boundary still favor serial evidence and small ownership batches over parallel writers.
- **Support tools:** `read`, CodeMapper/pi-lens, consumer searches, frozen fixture inventory, focused tests and `advisor` only for architecture/security conflicts.
- **Forbidden nesting:** no Taskflow, council, until-done, actors or subagents unless JP explicitly opens a separately approved orchestration run.
- **Required gates:** consumer evidence → capability disposition → target contract → transition plan → docs audit. Runtime batches later use focused test → typecheck → PostgreSQL integration → flow contract tests → diagnostics.
- **Verification:** provider-free/local only against `fixvox_test`; Cloudflare remains authority.

## Objective

Close Spec 019 Checkpoint D around the smallest product-owned flows required by Dictation Tauri and Control Room, not by reproducing every Worker route. The result must prevent quota bypass, preserve one-provider-call semantics, keep raw dictation content out of storage/logs, and define a coordinated migration path for Bun, Tauri and Admin before Checkpoint E.

## Architecture Decision: Authoritative Quota At Provider Boundary

JP selected this on 2026-07-16.

- `/v2/execution/preflight` remains provider-free and advisory: it may report eligibility/limits, but it must not create a durable reservation that requires a client correlation token.
- `/v1/chat/completions` and `/v1/audio/transcriptions` perform the authoritative reserve after device/profile/capability validation and immediately before the single provider call.
- An accepted request performs exactly one provider call. Success consumes the reservation; a failure before a definitive provider execution releases it; ambiguous upstream outcomes must be represented safely without retrying the provider implicitly.
- `pro-unlimited` preserves its no-reservation/no-usage-event behavior.
- The quota semantics remain invariant even if Tauri and the public request contract migrate coordinately under the product-first plan.
- Provider-free benchmark gate: added PostgreSQL overhead p95 must be **≤15 ms** with API and database on the intended same-host/private-network topology. The benchmark records only timings and counts.
- If the latency gate fails, stop and present evidence; do not weaken quota safety or silently move authority back to preflight.

## Non-Objectives

- Do not begin Checkpoint E or connect Admin Web/Tauri to the local service yet.
- No real provider, Google OAuth network exchange, VPS, Tunnel, DNS, deploy, import, production mutation or Cloudflare authority change.
- No migration `0005`, schema redesign, dependency/install, ORM or database-driver addition inside this plan.
- No runtime/client contract edit inside the architecture recalibration batch; later product-first slices may change API, Tauri or Admin together with migration tests.
- No broad refactor of the Worker, Tauri, Admin Web or `app.ts` merely for style; every change must remove legacy surface or simplify a canonical flow.
- Do not treat the current Taskflow spike as evidence of implementation automation; its target already exists and its deterministic gate is red.
- No commit, push, publish or release unless JP requests it separately.

## Verified Review Baseline — 2026-07-16

### Green evidence

- `bunx tsc -p cloud/fixvox-api/tsconfig.json --noEmit`: PASS.
- `cloud/fixvox-core`: 5/5 Bun tests PASS.
- `cloud/fixvox-api` unit suite: 17/17 PASS.
- Worker `npm run cloud:test`: PASS in the focused review run.
- PostgreSQL repository/migration suite: 12/12 PASS after restoring isolated `fixvox_test` authority revision to `0`.
- Migration verify: schema v4, checksums printed for 0001-0004.
- Bun contract runner: 27 fixtures execute provider-free against PostgreSQL.

### Red evidence and plan inputs

1. `bootstrapBuiltinEnginePromptCatalog()` is not idempotent: `sameJson()` compares `JSON.stringify()` output, while PostgreSQL `jsonb` may reorder keys. The focused idempotency test fails with `builtin_catalog_conflict:engine:stt-off`.
2. The bootstrap integration test leaves `control_plane_authority.revision = 7`; running PostgreSQL tests afterward fails the expected revision `0`. A timed full bootstrap run also hung after the first failure. Test isolation is not reliable.
3. The bootstrap test lacks the planned safe `non-fixvox_test` guard test, hardcodes counts `10/10`, and does not prove independent-connection concurrency.
4. The frozen inventory currently contains **73 HTTP fixtures plus one scheduled boundary**, not the documented 70.
5. Bun enumerates **27** fixtures, leaving **46** outside its runner: 37 Admin, 7 other/support/usage-counter, 1 feedback and 1 usage-prewarm.
6. The 27-fixture Bun runner itself passes, but Worker/Bun comparison is red on four Admin DTOs: `admin-runtime-policy`, `admin-profiles-list`, `admin-devices-list`, `admin-accounts-list`.
7. `tests/cloud-contract/contract-fixtures.test.ts` is red because `GET /desktop/login` intentionally has two scenarios but the inventory asserts unique method/path identities.
8. Preflight creates a PostgreSQL reservation, but its public projection drops `reservationId`; current Tauri does not send a correlation token. Provider routes do not reserve/consume/release quota and can therefore bypass finite quota by being called directly.
9. Only Admin GET/OPTIONS routes exist in Bun. Mutation routes and recent-Google enforcement at the HTTP boundary remain absent.
10. Real provider composition is deliberately blocked; OAuth/PKCE, request/readiness timeouts, CORS/header allowlists and graceful shutdown are not production-ready.
11. All of `cloud/fixvox-api`, `cloud/fixvox-core`, Spec 019 and the contract suite are currently untracked inside a working tree with substantial unrelated changes. No destructive reset is allowed.
12. LSP/runner diagnostics include ambient test-type noise and maintainability warnings. Actual API TypeScript and Bun tests are the primary compile/runtime gates; diagnostics still must be reconciled before closure.

## Execution Rules

- Execute exactly one batch, run its checks, record a receipt in this track/Spec 019 and stop for review.
- Read every target before editing and inspect `git status --short` plus scoped diff before and after.
- Preserve every pre-existing modified/untracked file outside the batch byte-for-byte.
- PostgreSQL work is restricted to `fixvox_test`; every cleanup verifies `current_database()` first.
- A green subset is never reported as full parity. “Executed”, “contract-valid” and “Worker-parity” are separate states.
- Two repair attempts maximum per deterministic batch. A third failure stops the batch.
- Taskflow remains blocked during Batches 1-2. It is not an implementation engine for this closure plan.

## Batch 1 — Restore Deterministic Gates

**Goal:** make the bootstrap, PostgreSQL and contract-inventory gates order-independent and truthful before changing product behavior.

**Primary surfaces:**

- `cloud/fixvox-api/src/postgres/bootstrap-builtin-engine-prompt-catalog.ts`
- `cloud/fixvox-api/tests/builtin-catalog-bootstrap.integration.test.ts`
- `tests/cloud-contract/contract-fixtures.test.ts`
- `.pi/taskflows/dictation-bounded-implementation-spike.json` only if its verifier must be corrected after the tests are green
- `docs/tracks/bounded-taskflow-implementation-spike.md` receipt only

**Work:**

1. Replace order-sensitive JSON comparison with deterministic structural equality suitable for PostgreSQL `jsonb`.
2. Make bootstrap tests restore the prior/expected authority state and leave `fixvox_test` clean even on failure.
3. Use canonical catalog lengths rather than hardcoded `10/10`.
4. Add a safe guard test for non-`fixvox_test` through an injected seam/mock; never connect to another real database.
5. Prove concurrency with independent SQL connections and bounded timeout; verify no duplicates and no leaked advisory lock.
6. Make fixture identity allow multiple scenarios for one method/path while preserving unique fixture IDs and complete route inventory.
7. Ensure the Taskflow verifier, if retained, runs a final PostgreSQL cleanliness/regression check after bootstrap; do not execute the flow in this batch.

**Checks:**

```powershell
bunx tsc -p cloud/fixvox-api/tsconfig.json --noEmit
cd cloud/fixvox-api
bun --env-file=../../.env.postgres.local test tests/builtin-catalog-bootstrap.integration.test.ts
bun run test:postgres
bun --env-file=../../.env.postgres.local run src/postgres/verify-migrations.ts
cd ../..
npm run test:pipeline -- tests/cloud-contract
```

**Done:** all checks pass twice in the documented order and `control_plane_authority` remains `cloudflare-authority`, revision `0`, after the batch.

**Stop:** migration/schema/dependency needed; database differs from `fixvox_test`; lock/hang recurs; change escapes listed ownership; or two repairs fail.

### Batch 1 Receipt — Blocked (2026-07-16)

- **State:** blocked; Batch 2 is not unlocked.
- **Changed surfaces:** `cloud/fixvox-api/src/postgres/bootstrap-builtin-engine-prompt-catalog.ts`, `cloud/fixvox-api/tests/builtin-catalog-bootstrap.integration.test.ts`, and `tests/cloud-contract/contract-fixtures.test.ts` (all pre-existing untracked working-tree files; no unrelated files changed).
- **Durable decisions:** `jsonb` equality must be structural and tolerate Bun's string representation; catalog counts derive from `BUILTIN_ENGINES`/`BUILTIN_PROMPTS`; fixture IDs remain unique while `GET /desktop/login` may have two explicit scenarios; the non-test database guard is proven through an injected resolver without contacting another database.
- **Evidence:** API TypeScript check passed; contract inventory pipeline passed (4/4); `fixvox_test` was verified after the stop with `cloudflare-authority`, revision `0`; `git diff --check` passed.
- **Blocking risk:** after those repairs, the expected conflicting-engine bootstrap path remained unresolved inside `Bun.SQL.begin(...)`, exceeded the 5-second test timeout, and caused the focused suite to hang. This is the second repair attempt, so the batch stopped under its deterministic stop rule. Ambient Node type diagnostics in `contract-fixtures.test.ts` remain (`node:fs`, `node:path`, `process`) and are not resolved by installing dependencies in this plan.
- **Next batch:** retry **Batch 1** only to diagnose and safely repair the `Bun.SQL.begin(...)` rejection/rollback behavior for conflict paths; retain the same provider-free, `fixvox_test`-only scope and do not begin Batch 2.

### Batch 1 Retry Receipt — Blocked (2026-07-16)

- **State:** blocked; Batch 2 remains locked.
- **Attempt:** changed the conflict branch to return its code from `Bun.SQL.begin(...)` and throw only after the read-only transaction completed, to avoid callback-rejection rollback. Both isolated conflict tests nevertheless timed out at Bun's 5-second limit (and the external 15-second process bound ended them); this is not a safe repair.
- **Rollback:** reverted the attempted source/test changes exactly. No production, provider, schema, dependency, Taskflow, or non-`fixvox_test` work occurred.
- **Evidence:** engine conflict and prompt conflict each reproduced the hang under a bounded process timeout; final query confirmed `fixvox_test`, `cloudflare-authority`, revision `0`. Do not add custom transaction plumbing in this batch.
- **Next action:** obtain a fresh, explicitly scoped approach for Bun SQL transaction behavior; do not retry Batch 1 automatically.

### Batch 1 Resolution Receipt — Green (2026-07-16)

- **Root cause:** PostgreSQL and `Bun.SQL.begin(...)` were healthy. A four-case standalone matrix (`begin` return/throw, advisory-lock return/throw) committed or rolled back normally with no retained locks. The real bootstrap also rejected both conflicts and rolled back normally outside `bun:test`. The timeout was caused by Bun 1.2.20's `await expect(promise).rejects.toThrow(...)` matcher path for these promises.
- **Minimal repair:** the two conflict tests now capture rejection with native `try/catch` and assert its message. No bootstrap transaction, schema, runtime, provider, dependency or product behavior changed. The newly exposed concurrency assertion was also corrected to pass scalar placeholders because Bun 1.2.20 serialized the JavaScript array supplied to `ANY($1)` as CSV rather than PostgreSQL `text[]`.
- **Evidence:** all six bootstrap tests pass, including engine/prompt rollback, independent-connection concurrency and lock release. TypeScript, bootstrap, PostgreSQL 12/12, migration verification and contract inventory 4/4 passed twice in the documented order.
- **Cleanliness:** final state is `fixvox_test`, `cloudflare-authority`, revision `0`; `pg_try_advisory_lock(91827401)` succeeded and was released. No production, provider, schema, dependency, Taskflow, non-test database, commit or push occurred.
- **State:** Batch 1 is complete and **Batch 2 is unlocked**. The Taskflow spike remains a separate explicit decision and is not part of Batch 2.

## Product-First Recalibration — Supersedes Original Batches 2-8

JP selected **producto primero** on 2026-07-16. The 73 HTTP fixtures and scheduled boundary remain valuable regression evidence, but no longer define the target product surface.

### Observed consumers

- Rust/Tauri directly consumes device register/activate, advisory preflight, desktop login/link/status, managed transcription and managed chat. These are migration constraints, not permanent route names.
- The browser consumes the Admin Web BFF under `/api/admin/*`; only `admin/fixvox-web/server.mjs` talks to backend `/admin/*`. Backend Admin routes can therefore be consolidated behind the BFF without forcing a browser migration.
- Bun already exposes the core local seams for health/readiness, auth/device, preflight, provider proxy, telemetry and feedback. PostgreSQL repositories own the durable domain.
- Discord, Telegram, the embedded `/control-plane-admin`, benchmark helpers and Usage-counter fetch routes have no demonstrated Dictation Tauri product dependency.

### Capability disposition

| Capability | Disposition | Product-first direction |
| --- | --- | --- |
| Liveness/readiness | `canonical` | Keep `/health` and `/ready` as small redacted operational contracts. |
| Desktop identity and device binding | `redesign` | Define one coherent bootstrap/login/session flow; preserve current routes only as migration aliases until Tauri moves. |
| Effective profile/capabilities | `canonical` | Server-authoritative projection backed by published Profiles; never expose provider secrets or let clients select forbidden routing. |
| Dictation/STT | `canonical` | Product-owned transcription operation with authoritative quota immediately before exactly one provider call. |
| Postprocess, selection and assistant | `redesign` | Replace the generic OpenAI-compatible client contract with a typed product action contract; keep `/v1/chat/completions` temporarily for current Tauri. |
| Preflight | `redesign` | Advisory eligibility/readiness only; authoritative admission remains at execution. It may merge into bootstrap/runtime context if that removes a round trip without weakening safety. |
| Control Room | `canonical` | Browser contract remains the Admin BFF. Consolidate backend APIs by domain rather than cloning 37 Worker route implementations. |
| OAuth/RBAC/audit | `canonical` | Preserve recent-Google gates, server-side credentials, immutable audit and fail-closed capabilities. Route shapes may change behind coordinated consumers. |
| Usage/telemetry/feedback | `redesign` | Keep only bounded/redacted product signals with a clear owner. Internal counter fetch APIs are not public product contracts. |
| Discord/Telegram/support automation | `drop` | Excluded from the self-hosted product unless a future product decision restores them. |
| Embedded Admin, benchmark and recipe-policy legacy surfaces | `drop` | Control Room/Profile Composer replace them; retain Worker behavior only for rollback until cutover closes. |
| Worker scheduled maintenance | `redesign` | Replace only required jobs with explicit Bun job functions/systemd timers; do not port cron behavior by default. |

### Replacement execution sequence

1. **R1 — Product contract map:** produce a consumer/capability matrix from the frozen inventory and current callers; every retained legacy route must name its consumer and removal condition.
2. **R2 — Canonical contracts:** specify typed bootstrap/session, transcription, action and Admin-BFF domain contracts plus transition aliases. No implementation before review.
3. **R3 — Core local vertical:** implement provider-free bootstrap → authoritative execution → result for transcription, then typed actions, against PostgreSQL.
4. **R4 — Coordinated client migration:** move Tauri and Admin BFF to canonical contracts with dual-contract tests; remove aliases only after no consumer remains.
5. **R5 — Checkpoint D gate:** verify canonical flows, privacy/auth/quota invariants and explicit dropped-surface assertions. Worker equality is informational, not the gate.

### New Checkpoint D gate

Provider-free tests must prove the canonical desktop bootstrap/login, effective profile, transcription and typed action flows plus the Control Room operations required by the current UI. They must also prove fail-closed auth/capabilities, authoritative quota, one provider call, redacted evidence and zero durable raw audio/transcript. Every temporary alias has an owner and retirement condition; every dropped capability is absent or explicitly unavailable. Checkpoint E remains blocked until this gate is green.

## Original Batch 2 — Establish A Truthful Contract Matrix (Superseded)

**Historical goal:** reconcile code, reports and docs around the actual 73 HTTP + 1 scheduled boundaries.

**Work:**

1. Generate a deterministic matrix with columns: fixture, route, category, Worker result, Bun executed, Bun contract-valid, Worker parity and disposition.
2. Record the current 27/46 split without calling it parity.
3. Classify the 46 remaining boundaries:
   - 37 Admin routes;
   - 4 usage-counter routes, Control Plane static page, Discord and Telegram;
   - feedback submit;
   - usage prewarm.
4. Mark each as required for D, provider-free stub/adapter, or proposed deferral. No deferral counts as accepted until JP explicitly approves it.
5. Reconcile `tasks.md`, this track and `WORKING_MEMORY.md` to the same counts.

**Checks:** inventory test green; matrix count equals 73 with no duplicate fixture IDs; every Worker route has at least one fixture; scheduled boundary remains explicit.

**Stop:** an unclassified route remains, current Worker source and frozen fixtures disagree, or a disposition requires product scope choice.

## Original Batch 3 — Close Four Admin Read DTO Parity Failures (Superseded)

**Goal:** make the current 27-fixture comparison genuinely green before expanding coverage.

**Required fixtures:**

- `admin-runtime-policy`
- `admin-profiles-list`
- `admin-devices-list`
- `admin-accounts-list`

**Work:** reproduce Worker DTO shapes from PostgreSQL/materialized core data, including non-empty options/defaults/history where required. Preserve redaction and never copy private identifiers or prompt bodies into reports.

**Checks:** Bun runner passes; comparator reports `missingWorker=0`, `mismatches=0`; focused Admin repository tests cover empty/populated states and bounded pagination.

**Stop:** matching the Worker requires raw private data, legacy fields cannot be derived safely, or the contract should intentionally change rather than remain compatible.

## Original Batch 4 — Make Quota Authoritative At Provider Endpoints (Partly retained)

**Retained goal:** eliminate direct-call quota bypass and guarantee exactly one provider call. The old “without changing Tauri” constraint is superseded; route/client migration follows R2-R4.

**Work:**

1. Convert preflight to advisory/read-only quota evaluation for finite plans.
2. At chat/audio entry, validate device, effective profile, capability, engine and budget before reserve.
3. Reserve transactionally immediately before provider execution, with idempotency scoped to device + usage kind + request semantics.
4. Call the mock provider exactly once.
5. Consume on definitive success; release on failure before provider execution; record a safe explicit outcome for ambiguous upstream failure without automatic provider retry.
6. Keep `pro-unlimited` write-free.
7. Add allowlisted request/usage events with counts/timings only; no bodies, transcripts, selected text or audio.
8. Measure provider-free PostgreSQL overhead p50/p95 and enforce p95 ≤15 ms on intended local/private topology.

**Checks:** exhausted quota produces zero provider calls; allowed finite quota produces one reservation, one provider call and one consumption; failed pre-provider path releases; direct calls cannot bypass; 20-request concurrency does not over-admit; unlimited produces no quota writes; privacy sentinel scan passes.

**Stop:** p95 exceeds 15 ms; the reviewed canonical contract or migration alias is insufficient; duplicate provider call appears; raw content reaches storage/logs; ambiguous failures cannot be represented safely; schema migration is required.

## Original Batch 5 — Complete OAuth And Admin Authorization Boundaries (Superseded)

**Goal:** make provider-free auth lifecycle and Admin mutation authorization fail closed.

**Work:**

- Make desktop handoff and OAuth state one-time under concurrency.
- Fail closed on caller-supplied state collision; preserve hashes only.
- Model PKCE/provider exchange behind a network-free boundary and prove verifier/state association without contacting Google.
- Reject future/expired recent-auth timestamps safely.
- Add Admin mutation routes in bounded groups, with view/edit/publish hierarchy and recent Google required for publish/rollback/role mutation.
- Keep browser cookies/credentials outside `fixvox-api`.

**Checks:** concurrent callback/claim has one winner; replay fails; role matrix passes every mutation route; static test keys cannot bypass recent-auth for sensitive mutations; zero network calls; auth artifacts contain no raw state/token/subject.

**Stop:** real OAuth/login needed, new secret needed, raw identity must persist, or route behavior conflicts with the frozen Worker contract.

## Original Batch 6 — HTTP Runtime, Privacy And Operations Hardening (Folded into R3/R5)

**Goal:** close T022-T024, T027 and T028 behavior without VPS work.

**Work:**

- Bound JSON body reads, readiness dependencies and provider streams with deterministic timeouts.
- Replace request/provider header blacklists with explicit allowlists where compatibility permits.
- Restrict Admin CORS to configured origins; no arbitrary reflection for credential-bearing routes.
- Ensure stream-limit errors and unexpected errors remain redacted and observable without content.
- Implement graceful drain: stop accepting work, bound active-request wait, then close PostgreSQL.
- Make readiness report real schema/database/jobs/authority checks with timeout.
- Complete provider-free maintenance jobs and document planned timer mapping; no systemd/VPS artifact execution.

**Checks:** oversized/slow request, oversized provider response, hung readiness dependency, SIGTERM with in-flight request, CORS rejection and header-leak tests all pass; no raw sentinel appears.

**Stop:** runtime requires dependency/install, a required header cannot be safely allowlisted, shutdown can lose an authoritative transaction, or a test requires desktop/network effects.

## Original Batch 7 — Expand Bun Contract Coverage By Route Group (Superseded)

**Goal:** execute every D-required frozen fixture or obtain an explicit approved deferral.

**Order:**

1. Admin profile preview/draft/publish/rollback and RBAC.
2. Device/account/group/segment/variant/catalog mutations.
3. Pricing/watchlist provider-free paths.
4. Feedback, usage prewarm and usage-counter compatibility adapters.
5. Static Control Plane page and support/external routes as provider-free compatibility responses or proposed deferrals.

Each subgroup must run Worker, Bun and comparator before the next subgroup. External/provider routes use mocks only. The comparator must reject missing Worker fixtures, schema differences and unsafe headers.

**Checks:** contract matrix updates after every subgroup; no regression in previously green fixtures; `npm run cloud:test` remains green.

**Stop:** a route would make a real network/provider/support call, a proposed deferral lacks JP approval, or parity requires production-only state.

## Original Batch 8 — Final Checkpoint D Gate (Superseded)

**Goal:** produce a defensible D receipt and only then unlock discussion of Checkpoint E.

**Validation ladder:**

```powershell
bunx tsc -p cloud/fixvox-api/tsconfig.json --noEmit
cd cloud/fixvox-core; bun test src/*.test.ts
cd ../fixvox-api; bun run test:unit
bun run test:postgres
bun --env-file=../../.env.postgres.local test tests/builtin-catalog-bootstrap.integration.test.ts
bun --env-file=../../.env.postgres.local run src/postgres/verify-migrations.ts
cd ../..
npm run test:pipeline -- tests/cloud-contract
npm run cloud:test
npm run cloud:contract:parity
bun run context:index
bun run context:audit
```

Then run scoped `lsp_diagnostics`, `lens_diagnostics mode=all`, `git diff --check` and a scope inventory. Record exact counts, durations, fixture dispositions, quota latency and changed files.

**Definition of done:**

- T022-T029 have evidence-backed dispositions and Checkpoint D gate is green.
- Every D-required fixture is Worker/Bun parity-green; every excluded fixture has an explicit JP-approved deferral.
- Four Admin DTO mismatches are gone.
- Direct provider calls cannot bypass policy/quota and accepted requests call provider exactly once.
- Quota overhead p95 is ≤15 ms and unlimited stays write-free.
- Auth/RBAC, privacy, timeouts, readiness, jobs and graceful shutdown are provider-free and deterministic.
- `fixvox_test` is left safe and clean; Cloudflare remains authority.
- Docs and fixture counts agree.
- Checkpoint E remains unopened until a separate review/authorization.

## Global Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| False green from a 27-fixture subset | Contract matrix distinguishes executed, valid and parity; final gate covers all required fixtures. |
| Dirty/untracked work lost or overwritten | Scoped reads/diffs and outside-scope inventory; never use checkout/reset/clean. |
| Test database contamination | Database-name guard, transactional cleanup, final authority assertion after every PostgreSQL batch. |
| Quota safety increases dictation latency | Same-host/private PostgreSQL, focused benchmark and hard p95 ≤15 ms stop gate. |
| Direct provider bypass/double billing | Provider-bound authoritative reserve and exactly-one-call concurrency tests. |
| OAuth/RBAC appears complete at repository level but not HTTP level | Route-by-route authorization matrix including recent-auth. |
| Raw dictation content leaks into evidence | Sentinel tests, allowlist logs/events and redacted reports only. |
| Scope expands to all Worker integrations | Route classification and explicit approval for every deferral or product-scope change. |
| Taskflow gives misleading automation evidence | Keep current spike blocked and outside the implementation path until separately re-scoped. |

## Global Stop Conditions

Stop the active batch and report evidence if any of these occurs:

- migration `0005`, schema change, install or dependency is needed;
- runtime/client code must change before its canonical contract and migration alias are reviewed;
- provider real, Google network, production, Cloudflare mutation, VPS, deploy, import, secret, commit or push is required;
- work touches data outside `fixvox_test`;
- quota overhead p95 exceeds 15 ms;
- one accepted request can make zero-or-multiple provider calls unexpectedly;
- raw transcript, selected text, audio, credential or private identifier enters storage/logs/evidence;
- fixture inventory cannot reconcile, a real consumer cannot be assigned, or a temporary alias lacks a retirement condition;
- outside-scope working-tree drift appears;
- two repairs fail or a batch contradicts Spec 019.

## Rollback And Reversibility

- No destructive Git rollback; revert only exact blocks changed by the active batch.
- Preserve redacted reports before reverting a failed approach.
- Reset only synthetic `fixvox_test` data after verifying the database name.
- Cloudflare remains authority throughout D, so no product traffic rollback is needed.
- A failed batch does not unlock the next one; record `blocked`/`failed` receipt and return to the last green gate.

## Next Batch

None from this superseded track. Continue with **Batch 1 — Mapa Consumidor/Disposición** in `docs/tracks/fixvox-product-first-self-hosted-contract-plan.md`.
