# Research: Fixvox Self-Hosted Control Plane

Created: 2026-07-14

## Trigger

A live normal dictation failed before STT. Cloudflare Tail showed:

```text
KV put() limit exceeded for the day.
writeUsageEvents -> evaluateExecutionPreflight
```

The Worker emitted `500 text/plain`; the desktop client surfaced a preflight contract error. No model/provider call occurred. A local emergency fix is prepared separately, but the incident exposed a broader dependency on Worker/KV/DO quotas.

## Current Platform Dependencies

| Concern | Current implementation | Coupling |
| --- | --- | --- |
| HTTP runtime | Cloudflare Worker `fetch` in `cloud/fixvox-proxy/src/index.ts` | Medium; Web Request/Response is portable |
| Durable records | KV namespace `USAGE` | High; string key/value and write quotas |
| Quota counters | KV usage events plus `USAGE_COUNTERS` Durable Object | High |
| Profile publication authority | `CONTROL_PLANE_PUBLISH_LOCKS` Durable Object plus KV projections | High |
| OAuth/auth sessions | Worker routes + KV | Medium/high |
| Provider proxy | Worker `fetch` to provider APIs | Low/medium |
| Admin Web | VPS `fixvox-admin-web.service`, calling Worker APIs | Low; already self-hosted |
| Cron | Worker scheduled event | Low; replace with systemd timer |
| Domain | Worker custom domain `auth-fixvox.jpsala.dev` | Low if endpoint contract/domain remain stable |

## Decision: Hybrid Self-Hosted First

Move compute and durable state to JP's VPS while retaining Cloudflare temporarily as DNS/proxy/Tunnel edge.

Reasons:

- Removes Worker/KV/DO quotas and storage lock-in.
- Keeps edge TLS/protection and avoids exposing the VPS during the first cutover.
- Allows `auth-fixvox.jpsala.dev` and all client contracts to remain unchanged.
- Separates a storage/runtime migration from a DNS/security-provider migration.

A complete Cloudflare exit remains possible later through direct Caddy/Let's Encrypt and DNS migration, but is intentionally out of scope for V1.

## Decision: Bun/TypeScript Runtime

Use a Bun/TypeScript service as the first self-hosted runtime.

Reasons:

- Reuses the current Worker TypeScript behavior and Bun tests.
- `Bun.serve({ fetch })` can preserve Web Request/Response semantics with a small host adapter.
- Avoids a risky full rewrite of auth, policy, provider proxy, and Admin contracts.
- Bun includes PostgreSQL support; the implementation must still isolate database access behind explicit interfaces.

Alternative rejected for V1: Rust/Axum rewrite. It could be a future hardening step, but it multiplies migration risk and parity work during an infrastructure cutover.

Alternative rejected for V1: Node plus a new web framework. Node is viable, but adding a framework does not improve the core migration and adds adapter/dependency work. Re-evaluate only if Bun production constraints are observed.

## Decision: PostgreSQL Authority

Use a dedicated PostgreSQL database owned by Fixvox. Do not reuse Coolify's internal PostgreSQL database.

Reasons:

- Transactions and row locks provide correct quotas/publication serialization.
- Relational constraints replace fragile key conventions.
- Backup/restore and query diagnostics are straightforward.
- Profiles, engines, prompts, publications, assignments, and audit are naturally relational/versioned.

Redis is deferred. PostgreSQL handles initial scale and correctness. Add local Redis only after measuring a need for rate limiting/cache/leases; do not introduce Upstash as another mandatory external dependency.

## Portability Seams

The current code already has `KvNamespaceLike` in parts of the control plane. The migration should not emulate KV forever. Introduce domain-level interfaces:

- `ControlPlaneRepository`
- `ProfilePublicationRepository`
- `UsageQuotaRepository`
- `AuthSessionRepository`
- `RequestEventRepository`
- `BackgroundJobScheduler`

The Worker adapter remains temporarily for rollback/tests; PostgreSQL becomes the new implementation. Business rules stay platform-neutral.

## Usage Accounting Decision

Preflight must check/reserve quota atomically, but normal service availability must not depend on an analytics write.

Recommended V1 behavior:

1. Transactionally inspect quota windows.
2. Create a short-lived reservation with idempotency key.
3. Consume/finalize after provider acceptance/success according to a documented rule.
4. Release/expire abandoned reservations.
5. Keep audit/analytics writes separate from authorization where possible.

For `pro-unlimited`, skip high-cardinality usage event persistence unless explicitly needed for cost reporting; provider cost telemetry can remain aggregated and redacted.

## Migration Strategy

- Export/import through a private operator command, not browser downloads.
- Manifest contains schema versions, safe counts, projection hashes, and redacted IDs only.
- Final import occurs during a bounded Admin mutation freeze.
- OAuth pending sessions may be invalidated rather than migrated; linked accounts/devices must migrate.
- Rolling usage required by limited profiles must migrate or be conservatively initialized.
- Do not mirror STT/chat traffic to both origins because that duplicates sensitive data and billable provider calls.

## Deployment Strategy

- First run locally with isolated PostgreSQL.
- Deploy to VPS loopback on a new port/service; no public route.
- Test through SSH tunnel or host-local curl.
- Add an internal/staging route only with explicit DNS/Tunnel authorization.
- Canary one allowlisted account/device.
- Preserve Worker as rollback until stabilization and data-authority gates close.

## Open Decisions Before Implementation Batch 2

1. Exact VPS packaging: user systemd service running Bun directly vs container managed by Coolify. Recommendation: user systemd initially, matching Admin Web and minimizing platform coupling.
2. PostgreSQL provisioning: dedicated container/service with encrypted backups and restricted bind/network. Confirm in `C:/dev/infra` before creation.
3. Final quota reservation semantics on provider failure.
4. Stabilization window before retiring Worker compute.
5. Whether Cloudflare Tunnel or direct reverse proxy is the initial edge-to-origin path.
