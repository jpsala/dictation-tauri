---
status: complete
started: 2026-07-21
updated: 2026-07-22
priority: high
owner: Pi
topic: cloudflare-proxy-latency-optimization
related:
  - cloud/fixvox-proxy/src/index.ts
  - cloud/fixvox-proxy/src/control-plane-store.ts
  - cloud/fixvox-proxy/src/admin-store.ts
  - src-tauri/src/runtime_transcription.rs
  - C:/dev/fixvox/proxy/src/index.ts
---

# Cloudflare Proxy Latency Optimization

## Objective

Minimize dictation latency after capture stops without weakening engine selection, quotas, budgets, audit, fail-closed behavior or rollback. Architecture changes are allowed after explicit discussion of their consistency and budget-semantics impact.

## Verified Baseline

Read-only investigation on 2026-07-21 confirmed:

- The desktop runtime still uses Cloudflare at `https://auth-fixvox.jpsala.dev`, not the VPS.
- DNS and response headers identify Cloudflare. The VPS API remains private on `127.0.0.1:8790`, without public DNS/Tunnel traffic.
- Latest observed dictation evidence:
  - WAV: `2,795,564` bytes.
  - MP3 upload: `88,172` bytes.
  - compression: `164 ms`.
  - postprocess: disabled and did not run.
  - proxy cumulative `init/total`: `4,401 ms`.
  - Groq upstream: `625 ms`.
  - proxy parse/usage: `0 ms` each.
  - unexplained Worker overhead: approximately `3,776 ms`.
- Cloudflare `/health` was approximately `42-62 ms` warm, so edge/DNS is not the primary bottleneck.
- Compression is beneficial and not the cause: it removes about 97% of upload bytes for a small local cost.

## Timing Semantics Caveat

`proxyInitMs` is misnamed. In `cloud/fixvox-proxy/src/index.ts` it is measured from request entry until after the upstream response, so it includes control-plane resolution, parsing, usage work and Groq latency. It is not isolated initialization time.

## Likely Regression

Commit `bc9de65` (`feat: complete Fixvox desktop release batch`, 2026-07-11) added two operations to the audio hot path before Groq:

1. `bindAudioRequestToProfileEngine()`.
2. `assertProfileBudgetAllows()`.

Before that commit, the audio route parsed duration/model, checked usage and called Groq directly. The current canonical Fixvox reference at `C:/dev/fixvox/proxy/src/index.ts` still resembles that simpler path and does not perform the heavier profile-engine-budget resolution before STT.

## Hot-Path Risks

- `resolveExecutionEngineForDevice()` performs multiple sequential KV reads for device, runtime policy, account assignment, account budget, groups, policy options and engine selection.
- `getControlPlaneAdminVariantConfig()` reconstructs broad Control Room configuration and is recomputed during engine resolution, prompt resolution and budget resolution in the same request.
- `resolvePromptContentForEngine()` independently rebuilds that configuration again.
- `assertProfileBudgetAllows()` independently rebuilds configuration again.
- If the effective budget mode is `block`, `assertProfileBudgetAllows()` calls `listRequestEvents()`, which reads the recent index and may fan out to as many as 250 event-record KV reads before filtering the first 100.
- Multipart data is cloned/parsed more than once, though existing evidence suggests this is secondary to control-plane KV work.

## Unknowns To Resolve

- Effective deployed budget mode and account-budget override for profile `jp`.
- Exact timing of engine binding, prompt resolution, budget config and budget-event reads.
- Exact KV read count in a real deployed audio request.
- Deployed Worker source parity with the local checkout.

Do not attribute all hidden time to event scanning until instrumentation confirms whether the deployed budget path is `block`.

## Batch 1 — Local Phase Instrumentation (Complete)

Completed locally on 2026-07-21 without deploy or runtime-policy mutation.

### Timing contract

- `engineBindingMs`: `resolveExecutionEngineForDevice()` entry through effective profile, shared Control Room config and engine selection. It excludes the later in-memory prompt/budget selections and multipart parsing.
- `promptResolutionMs`: prompt lookup in the already-resolved shared variant config.
- `budgetConfigMs`: account/profile budget selection in that same resolved config.
- `budgetEventsMs`: `listRequestEvents()` only; explicitly `0` when budget mode is not `block`.
- `multipartMs`: the audio binding `request.clone().formData()` operation that rewrites the selected model.
- `totalMs`: handler entry through construction of the final response and timing headers. Legacy `initMs` remains untouched and keeps its historical, broader semantics.
- Compatibility `budgetMs` also remains available while `budgetConfigMs` and `budgetEventsMs` provide the non-overlapping detail required by this track.

The phases are exposed as `X-Fixvox-Proxy-*-Ms` headers and `Server-Timing` metrics. Rust parses finite, non-negative integer or decimal values into `FixvoxResponseMetadata`; redacted report JSON exposes the typed values without identifiers, transcript or audio content.

### Exact local evidence

- Current Worker audio route (`cloud/fixvox-proxy/src/index.ts:1417-1513`) performs profile/engine resolution and budget evaluation before duration/model parsing, usage and upstream.
- Current engine resolution (`cloud/fixvox-proxy/src/control-plane-store.ts:3786-3823`) puts the delayed shared KV/config work in `engineBindingMs`; prompt and budget config are subsequent in-memory selections from the same config rather than extra reads.
- Blocking budget event reads remain exactly the existing `listRequestEvents()` contract (`cloud/fixvox-proxy/src/admin-store.ts:289-314`): one recent-index read plus at most 250 parallel event-record reads, then filtering to 100 results.
- Delayed-KV tests (`cloud/fixvox-proxy/src/managed-execution.test.ts:1769-1911`) prove:
  - warn mode emits every phase, reports `budgetEventsMs = 0`, performs zero event-record reads and stays at or below 18 hot-path reads;
  - block mode with three fixtures reads the recent index exactly once and exactly three event records, attributes the injected delay to `budgetEventsMs`, stays below the contractual 250 event-read cap and at or below 22 total reads.
- Canonical reference `C:/dev/fixvox/proxy/src/index.ts:851-893` does only duration/model parsing, usage and direct Groq fetch. It has no profile-engine binding, prompt resolution or profile-budget event scan. This is the exact structural delta before upstream.

The baseline `4,401 - 625 = 3,776 ms` is therefore located in the union of the newly instrumented Worker phases plus parse/usage/response finalization, not in Groq. Existing production evidence cannot honestly split those 3,776 ms among phases because the deployed response did not contain these headers. A real per-phase production allocation requires a separately authorized promotion/observation batch; no such deploy occurred here.

### Validation receipt

- Worker focused: 36/36.
- Worker full suite: 179/179.
- Rust header contract: 39/39, including complete decimal headers and absent/malformed values.
- Redacted runtime report test: 1/1 focused.
- Desktop pipeline: 484/484.
- Frontend build: pass.
- `cargo check`: pass with 24 pre-existing warnings.
- Focused LSP for Rust surfaces: zero errors; Worker LSP retains ambient Cloudflare-global/type noise, while Bun runtime tests are green.
- `git diff --check`: pass.

## Authorized Production Observation — 2026-07-21

JP explicitly authorized an instrumentation-only production promotion and warm measurement after Batch 1. No optimization or policy change was included.

### Safe promotion boundary

- Active production version before the change was `df416730-61b8-4222-ab5f-282879251db9` (version 158).
- The downloaded active bundle was byte-identical to a Wrangler dry-run from clean `HEAD` `8e5dd3d` (`510,367` bytes; SHA-256 `d049382a308c827c2e4c9191ad49d4f663d79beec0f999e56f23da2117235ecd`).
- Deployment was built from a detached clean worktree, not the dirty main checkout. Only `cloud/fixvox-proxy/src/index.ts` instrumentation and its existing audio contract test changed.
- Clean production-base suite: 151/151; isolated `git diff --check`: pass; dry-run bundle reviewed.
- Deployed version: `e8c642c3-6543-4794-8f32-b763a48c105a`, active at 100%. Downloaded deployed bundle equals the reviewed dry-run (`513,153` bytes; SHA-256 `4f8a2eb352c2104f0d9f330d88f3ebbbdf90f5aeaa5086834c896c7af9f3f953`; ETag `8bcb8785360d03aff4891615ac35254ba4d5ece53df9955f78a077a6f09d77f1`).
- `/health` returned `200` after deployment. Rollback version remains the exact pre-change version 158 above.

Because production matched clean `HEAD`, its phase boundaries reflect the deployed implementation rather than the optimized dirty checkout: `engineBindingMs` measures the original execution-engine resolution; `promptResolutionMs` includes its separate broad config reconstruction; `budgetConfigMs` includes the separate budget config reconstruction; and `budgetEventsMs` measures the event-index/event-record scan.

### Three real warm-path samples

One existing `1,382,444` byte WAV was sent through the normal managed STT route three times after one allowed preflight. No postprocess ran; no identifiers, transcript, request IDs or audio content were printed or stored in the receipt.

| Sample | Client | Worker total | Upstream | Worker overhead | Engine | Prompt | Budget config | Budget events | Multipart |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 2,973.72 ms | 2,331 ms | 790 ms | 1,541 ms | 107 ms | 44 ms | 49 ms | 1,326 ms | 15 ms |
| 2 | 2,315.95 ms | 1,700 ms | 1,174 ms | 526 ms | 95 ms | 47 ms | 44 ms | 326 ms | 14 ms |
| 3 | 2,988.63 ms | 2,048 ms | 1,383 ms | 665 ms | 88 ms | 71 ms | 66 ms | 421 ms | 19 ms |

`parseMs` and `usageMs` were `0` in all three responses. In every sample, `Worker total - upstream` equals the sum of the five newly isolated phases exactly. `Server-Timing` was present in all responses.

### Exact conclusion

- `budgetEventsMs` is the dominant avoidable phase: 1,326 ms in the first sample and 326-421 ms warm.
- Across warm samples 2-3, average Worker overhead was `595.5 ms`: budget events `373.5 ms` (62.7%), engine binding `91.5 ms` (15.4%), prompt resolution `59 ms` (9.9%), budget config `55 ms` (9.2%), multipart `16.5 ms` (2.8%).
- The production profile is definitively on the blocking budget path; the event scan is not hypothetical.
- The next optimization should replace event-history scans with an O(1) daily/monthly aggregate that preserves blocking and fail-closed semantics. Shared/revisioned config resolution is second priority. Multipart is not material.
- Client time remains 616-941 ms above Worker total in these uncompressed-WAV samples, representing client/edge transport outside the Worker timer; it must not be attributed to control-plane KV.

No DNS, VPS, canary, cutover, budget values/semantics, secrets, Durable Object migrations, commit or push changed in this observation.

## Chosen Architecture Direction

The O(1) budget ledger will be VPS-canonical and portable, not a Cloudflare Durable Object first. Cloudflare keeps the current instrumented implementation as authority/rollback until a later explicit gate.

The VPS already has most of the required transaction pattern in `cloud/fixvox-api/src/postgres/usage-quota-repository.ts`: `reserve`, `consume`, `release`, idempotency keys, reservation expiry and `pg_advisory_xact_lock`. Its current decision still executes `SUM(usage_events)` and `SUM(usage_reservations)`, so it must evolve to materialized O(1) counters rather than carrying the scan pattern into PostgreSQL.

Portable contract and invariants:

- neutral `BudgetLedger` port with `reserve`, `settle`, `release` and `snapshot`;
- PostgreSQL is the canonical adapter; a Durable Object adapter is deferred unless Cloudflare remains authority long enough to justify temporary implementation;
- initial enforcement scope stays `deviceId`, matching the current Worker scan even when the configured budget source is account/profile;
- day and month are UTC periods;
- `requestId`/idempotency key prevents duplicate reservation or settlement;
- `block` and fail-closed remain intact;
- detailed events, dashboards and audit may lag and run asynchronously, but reservation authority may not;
- full request events remain an audit/read model, never the synchronous budget decision source.

### Proposed PostgreSQL model

`budget_counters`:

- `scope_type`, `scope_id`;
- `period_type` (`day` or `month`) and `period_key`;
- `spent_usd`, `reserved_usd`;
- monotonic `revision` and timestamps;
- unique key across scope and period.

`budget_reservations`:

- unique `request_id`/idempotency key;
- scope and applicable day/month period keys;
- `estimated_usd`, optional `settled_usd`;
- state `reserved | settled | released | expired`;
- `expires_at` and timestamps.

Reservation updates daily and monthly counters in one transaction. Settlement moves estimated value from `reserved_usd` to actual `spent_usd`; release/expiry removes it from reserved totals. Audit/outbox publication is separate and asynchronous.

## Batch 2A — VPS-canonical O(1) Budget Ledger (Complete)

### Objective

Implement the neutral ledger contract, additive PostgreSQL schema and provider-free shadow adapter locally. Do not change production authority or request outcomes in this batch.

### Scope

1. Add a core port under `cloud/fixvox-core/src/ports/` for typed reserve/settle/release/snapshot decisions without PostgreSQL or Cloudflare types.
2. Add the next additive migration for `budget_counters` and `budget_reservations`, including checks, unique constraints, expiry indexes and immutable/idempotent identity.
3. Implement the PostgreSQL adapter using one transaction and deterministic lock order for daily/monthly counters. The decision path must not execute historical `SUM` queries.
4. Reuse the proven patterns from `PostgresUsageQuotaRepository` without conflating usage-unit quotas with monetary budgets.
5. Add a provider-free shadow comparison path: current event-derived result remains authoritative, while the new ledger reports an allow/block comparison and redacted mismatch evidence.
6. Keep event persistence and Control Room metrics asynchronous/outside the ledger decision.
7. Document exact query count and latency evidence from local PostgreSQL tests.

### Frozen semantics for 2A

- Scope: device, exactly matching current `listRequestEvents(..., { deviceId })` behavior.
- Budget source and limits: account override before profile, unchanged.
- Modes: `block` rejects at the same threshold; `warn`/unlimited never gain a new rejection.
- No request may reserve twice under retries.
- A database/ledger error in a blocking decision fails closed.
- Shadow mismatches never alter the response in 2A.
- No account-wide reinterpretation, currency conversion, grace margin or budget reset-policy change.

### TDD and acceptance

- concurrent reservations cannot exceed daily or monthly cap;
- the same request ID is idempotent under serial and concurrent retry;
- settle, release and expiry update both period counters exactly once;
- UTC day/month rollover creates independent counters;
- failed provider work can release a reservation without spend;
- injected database failure proves fail-closed for `block`;
- `warn` and unlimited paths preserve behavior;
- decision SQL has bounded reads/writes and no `SUM` over event/reservation history;
- shadow comparison covers allow, block and mismatch while authority remains legacy;
- logs/receipts contain no device/account/request identifiers or transcript/audio content;
- existing API/core/PostgreSQL contract suites remain green.

### Validation

- focused core port/unit tests;
- focused PostgreSQL repository integration tests;
- migration verify plus clean-schema and upgrade-path checks;
- API unit and PostgreSQL suites;
- TypeScript check, Pi Lens/LSP, `git diff --check`;
- no real provider call, deploy, VPS mutation, Cloudflare mutation, DNS, canary, cutover, commit or push.

### Stop conditions

Stop and ask before proceeding if O(1) requires changing the device scope, weakening fail-closed, making event delivery synchronous, exposing the private VPS, changing authority, or deploying/migrating any non-test database.

### Completion receipt — 2026-07-21

- Added a neutral monetary `BudgetLedgerPort` separate from the existing usage-unit `UsageQuotaPort`. It uses integer microusd, device scope, UTC day/month keys and typed `reserve`, `settle`, `release` and `snapshot` operations.
- Added migration `0005_budget_ledger.sql` with O(1) counters, immutable request identity, reservation states, non-negative checks, UTC month shape and active-expiry indexes. Existing migrations 0001-0004 and `PostgresUsageQuotaRepository` were not changed.
- Added `PostgresBudgetLedgerRepository` with request-level advisory locking and deterministic day-before-month counter locks. New reserve uses at most six bounded SQL statements; settle and release also use at most six; snapshot uses one. The repository contains no historical `SUM`, `usage_events` or `usage_reservations` query.
- Blocking database errors fail closed. Warn mode remains non-blocking. Serial/concurrent retries cannot create a second reservation; conflicting immutable identity fails closed. Settlement, release and explicit expiry update both counters exactly once.
- Added a provider-free shadow comparator that always returns the legacy decision as authoritative and emits only redacted match/mismatch/error booleans and reasons. It is not wired into a provider or production request path in 2A.
- Local PostgreSQL evidence on isolated `fixvox_test`: 20 concurrent reservations admitted exactly 10 at the shared cap; daily-only and monthly-only blocking passed; UTC rollover, retries, immutable identity trigger, settle/release/expiry and warn/unlimited behavior passed. Final warmed reserve p95 was `1.774 ms` at six queries, below the `15 ms` local target.
- Migration evidence: live isolated test schema upgraded 4→5, clean schema reached version 5, a repeated run applied nothing, and manifest verification reported `0005 budget_ledger sha256:aa625e1ab43b0c71b3ee1c5fca0160bc5311c9b6e7d8262d7a468fac912de75e`.
- Validation: core 27/27; API unit plus ledger unit 32/32; existing PostgreSQL 17/17; ledger/clean-upgrade PostgreSQL 10/10; TypeScript check, focused diagnostics and `git diff --check` passed.
- No provider call, production/VPS migration, Cloudflare mutation, DNS, deploy, canary, authority change, commit or push occurred. Cloudflare remains authority/rollback.

## Batch 2B — Parity y observabilidad asíncrona (Complete)

Completado local/provider-free el 2026-07-22 sin cambiar decisiones ni authority.

- La migración aditiva `0006_budget_ledger_async_projection.sql` agrega checkpoints con fingerprint, deduplicación de eventos legacy, outbox seguro y read model idempotente; `0005` quedó intacta.
- `PostgresBudgetLedgerMaintenanceRepository` reconstruye counters UTC día/mes sólo desde eventos nuevos. Repetir el checkpoint conserva counters y devuelve un receipt de estado/conteos sin IDs ni importes.
- Fixtures legacy demostraron parity shadow para allow, daily block y monthly block. Match, mismatch y error siguen redacted y legacy continúa siendo la respuesta autoritativa.
- Expiry libera ambos reserved counters y crea el outbox event en la misma transacción. Publicación y retry del read model ocurren únicamente desde maintenance; `reserve()` no conoce checkpoints ni outbox.
- Evidencia: core/API unit focales 12/12; ledger + clean upgrade 5→6 PostgreSQL 12/12; reserve p95 local `2.131 ms`; manifest 0006 `sha256:8ada0856c149d79e7b10afc56db61d2e79774db5f35c72b8203e121dc4938a80`; LSP focal sin errores y `git diff --check` limpio.
- No hubo provider call, producción/VPS migration, Cloudflare mutation, DNS, deploy, canary, routing, cutover, authority change, commit ni push. Esas operaciones siguen gated para un plan posterior.

## Batch 2C — Wiring shadow local (Complete)

Completado local/provider-free el 2026-07-22 tras aceptar el contrato STT: pricing tipado `USD/per_hour` en microUSD, estimación `ceil(durationMs × price / 3_600_000)`, costo real desde header explícito y fallback conservador a la estimación.

**Objetivo:** cablear el ledger O(1) al execution path local del VPS en modo shadow, manteniendo legacy como única autoridad.

**Comportamiento observable:** una ejecución local provider-free conserva la respuesta allow/block actual, reserva un costo estimado según engine/pricing, liquida con costo real o con la estimación si falta, y emite un receipt shadow redacted.

**Límites explícitos:**

- Sólo local/provider-free; sin producción, deploy, migración externa, routing, cutover ni cambio de authority.
- Budget efectivo mantiene prioridad account override → profile y ledger scope por device.
- No tocar Worker, cache de configuración, selección de modelos ni optimizaciones adyacentes.

**Terminado:**

1. El path local evalúa legacy y ledger una sola vez con clave estable; legacy conserva la respuesta autoritativa.
2. Éxito liquida con costo real disponible o estimación conservadora; fallo libera de forma idempotente sin reserved residual.
3. Budget account/profile y receipts `match | mismatch | error` quedan resueltos sin IDs, importes ni contenido de usuario.

**Receipt:**

- Sólo `/product/v1/runtime/transcriptions` cablea shadow. `RuntimeQuota` legacy sigue siendo la única authority; ledger block/error no cambia la respuesta ni alcanza Worker, chat o rutas legacy.
- `operationId` es la clave estable. Pricing toma el último `pricing_records` tipado; account override no nulo precede por campo al profile y el scope continúa por device.
- Éxito liquida costo explícito o estimación; provider error/non-2xx libera. Receipts `match | mismatch | error` contienen sólo decisiones/razones allowlisted.
- Evidencia final: core shadow 5/5; API/preflight/repository 28/28; PostgreSQL ledger/pricing 12/12, reserve p95 `1.795 ms`; LSP focal sin errores y `git diff --check` limpio.
- Sin provider real, Worker, producción/VPS mutation, deploy, DNS, routing, cutover, authority change, commit ni push.

## VPS Shadow Promotion — Complete

Retomado y completado el 2026-07-22 después de la interrupción de sesión, con autorización explícita para un despliegue VPS shadow en dos etapas.

- Baseline remoto reconfirmado: `current -> 9afa5dc85b783793`, schema 4, servicio activo, un único listener loopback, health/readiness 200 y `cloudflare-authority`.
- Candidate 2A-2C exacto: release `90ca26a7e3bd6f50`, 61 files. Contra `9afa…` agrega siete files y cambia ocho; los quince pertenecen exclusivamente al ledger, pricing, shadow y maintenance de 2A-2C. Boot aislado y upgrade 4→6 idempotente pasaron.
- El bundle excluye `.codemapper` y otros paths ocultos/cache; `assets-smoke.sh` tiene una fixture explícita. `deploy.sh --install-only` permite instalar una release inmutable sin mover `current`.
- Como `9afa…` exige schema exactamente 4, se promovió primero `c0deb60ab0f39b3a`, content-identical salvo readiness compatible 4-6. Pasó aislado y en VPS con schema 4; después de migrar sigue siendo el rollback sano para schema 5-6.
- El primer intento de migración usó el URL runtime `fixvox_api`, falló correctamente por falta de CREATE y volvió a `c0deb…` con schema 4 y contratos verdes. No se ampliaron permisos. La ejecución final usó `fixvox_migrator` vía `PGSERVICEFILE` y transacciones independientes fail-closed.
- Migraciones 0005 y 0006 quedaron aplicadas con checksums `aa625e1ab43b0c71b3ee1c5fca0160bc5311c9b6e7d8262d7a468fac912de75e` y `8ada0856c149d79e7b10afc56db61d2e79774db5f35c72b8203e121dc4938a80`; schema 6, runtime privileges heredados y versiones 1-6 fueron verificados.
- Receipt final independiente: `current -> 90ca26a7e3bd6f50`; `9afa…`, `c0deb…` y `90ca…` inmutables; servicio active/enabled; único listener `127.0.0.1:8790`; health/readiness/Admin 200; `cloudflare-authority`; mock providers; cero engines STT y cero pricing records.
- No hubo provider, engine/profile, pricing, smoke STT, routing, DNS, Tunnel, tráfico público, cutover, authority change, commit ni push. Cloudflare conserva hot path/authority. Engine/profile, pricing y smoke STT siguen siendo gates separados.

## VPS Real STT Smoke — Complete

Completado el 2026-07-22 con autorización separada para exactamente una llamada Groq real desde un proceso efímero del VPS, sin tocar el servicio persistente.

- Se agregó soporte server-owned para multipart Groq STT en `providers.ts`: endpoint `/openai/v1/audio/transcriptions`, modelo desde policy, identidad desktop eliminada y sólo file/model/language allowlisted. Tests focales API/provider/ledger: 29/29.
- Candidate `66652d0fa6073c26` difería de `90ca…` únicamente en `cloud/fixvox-api/src/providers.ts`; pasó archive boot y quedó instalado immutable con `--install-only`, sin promoción durante este gate.
- Configuración durable: profile `basic` activo en v2, v1 histórica; engines canónicos `stt-groq-whisper-turbo`, `postprocess-groq-gpt-oss-120b` y `transform-groq-llama-70b`; pricing Groq Whisper Turbo tipado en JSONB object a `40000` microUSD/hour. Sólo dictation está habilitado en access.
- Un preflight provider-free materializó el profile, devolvió 200, hizo cero provider calls y limpió la identidad sintética. Los fallos preparatorios previos ocurrieron antes del audit marker y de Groq; no hubo llamadas externas en esos intentos.
- La única llamada real usó WAV TTS sintético de 4814 ms, secreto por stdin/env efímero y cero retries. Receipt redacted: provider call 1, HTTP 200, expected-text match true, provider latency 355 ms, shadow `match`, ledger `settled` con estimación conservadora y sin transcript/audio persistido.
- El audit marker append-only quedó en 1 e impide otro intento. Device, install binding, reservation, counters y WAV remoto de smoke fueron limpiados; sólo config canónica y receipt redacted permanecen.
- Verificación independiente: `current -> 90ca26a7e3bd6f50`, PID `345436`, restarts 0, servicio mock-only, único listener loopback, health/readiness/Admin 200 y `cloudflare-authority`. No persistió provider key ni hubo routing, DNS/Tunnel, tráfico público, promoción, cutover o cambio de authority.

## VPS Provider Support Promotion — Complete

Completado el 2026-07-22 con un gate explícito nuevo para promover sólo el código de soporte ya instalado, sin activar el provider.

- Baseline remoto fail-closed reconfirmó schema 6, marker append-only 1, `current -> 90ca26a7e3bd6f50`, candidate inmutable `66652d0fa6073c26`, servicio mock-only y Cloudflare authority. La diferencia funcional fue sólo `cloud/fixvox-api/src/providers.ts`; `release-manifest.json` cambió únicamente en identidad/hash de archive y hash de ese file.
- `current` se movió atómicamente a `66652d0fa6073c26` y el servicio se reinició una vez bajo rollback automático a `90ca…` ante cualquier fallo.
- Verificación independiente final: schema 6, marker 1, servicio active/enabled, restarts 0, único listener `127.0.0.1:8790`, health/readiness/Admin 200, mock-only y `cloudflare-authority`.
- No hubo provider call, key persistente, routing, DNS/Tunnel, tráfico público, canary, cutover ni cambio de authority. Receipt redacted: `artifacts/proxy-latency/vps-provider-support-promotion-receipt.json`.
- Rollback inmediato: `90ca26a7e3bd6f50`; `c0deb60ab0f39b3a` sigue preservado como rollback anterior compatible con schemas 4-6. Provider persistente y canary/routing permanecen detrás de gates separados.

## Performance Targets

- Control-plane overhead: p50 below `100 ms`, p95 below `250 ms`.
- Proxy total: approximately upstream latency plus at most `150 ms` under warm conditions.
- Compression stays below `250 ms` and remains enabled when it materially reduces upload size.
- No extra postprocess call unless the effective policy explicitly enables it.

## Dirty Baseline

The repository has substantial unrelated work in progress. Preserve it without reset or revert. Completed preset work is separate from this track:

- unified preset store v2 with v1 migration;
- all presets editable, disableable, duplicable and deletable;
- compact Settings / Presets UI with accessible SVG icon actions;
- relevant frontend/Rust tests and build were green before this latency handoff.

## Guardrails

- Batch 2A is local/provider-free: no deploy, DNS/Tunnel, VPS mutation, Cloudflare mutation, canary, cutover, commit, push or publish.
- Do not print secrets, device/account/request identifiers, raw transcripts or audio content.
- PostgreSQL production migration, authority changes, real-provider benchmarks and external operations remain separately gated.
