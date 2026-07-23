# Implementation Plan: Fixvox Self-Hosted Control Plane

**Branch**: `[019-fixvox-self-hosted-control-plane]` | **Date**: 2026-07-14 | **Spec**: [spec.md](spec.md)

**Input**: `specs/019-fixvox-self-hosted-control-plane/spec.md`

## Summary

Build a product-owned control-plane/provider runtime from the portable rules that still serve Dictation Tauri, backed by Bun and dedicated PostgreSQL on JP's infrastructure. Validate canonical desktop/Admin flows rather than every Worker route, migrate durable state through verified private export/import, migrate Tauri/Admin through explicit temporary aliases, canary one allowlisted identity, and preserve the Worker only as rollback until cutover stabilizes.

## Technical Context

**Language/Version**: TypeScript strict, Bun runtime, existing React/Admin and Rust/Tauri clients
**Primary Dependencies**: Existing `cloud/fixvox-proxy` business rules/tests, Bun Web Request/Response server, PostgreSQL driver/runtime support, dedicated systemd service, optional Cloudflare Tunnel edge
**Storage**: Dedicated PostgreSQL; encrypted backups; no durable raw audio/transcript; Redis deferred
**Testing**: Bun unit/contract/integration tests, isolated PostgreSQL, existing cloud tests, Tauri provider-free tests, gated live preflight/dictation smokes
**Target Platform**: JP VPS Linux, loopback service behind reverse proxy/Tunnel
**Project Type**: Desktop client + self-hosted HTTP API/control-plane/provider proxy + Admin Web
**Performance Goals**: preflight p95 under 250 ms on VPS; no lost quota updates under 20 concurrent requests; proxy streaming without whole-audio durable writes; health response under 1 s
**Constraints**: no uncoordinated client break; temporary aliases require an owner and retirement condition; no duplicate provider calls; no raw audio/transcript logs/storage; dirty worktree preservation; production/DNS/secrets/import/deploy require explicit approval
**Scale/Scope**: current Fixvox population first, schema and operations suitable for moderate growth; single VPS V1 with tested backup/rollback

## Constitution Check

- **Human outcome**: dictation remains available without Cloudflare compute/storage quotas.
- **Privacy**: provider content remains transient; migration/evidence redacted; secrets stay server-side.
- **Durable state**: PostgreSQL authority and backup/restore are explicit; browser/temp/KV are not accidental truth after cutover.
- **Outcome bands**: implementation is checkpointed by coherent results, not by microtask; each band may complete several related tasks before one receipt and broad gate.
- **External boundaries**: PostgreSQL provisioning, VPS deploy, DNS/Tunnel, production import, provider smoke, and Worker retirement remain separate approval gates.
- **Verification**: canonical product-flow conformance and temporary-alias tests precede storage migration; canary precedes authority cutover.
- **Tooling**: manual staged implementation; no Taskflow unless JP reverses the explicit preference.

## Target Architecture

```text
Fixvox Tauri / Admin Web
          |
          | product-owned HTTPS contracts
          | + bounded temporary aliases during migration
          v
auth-fixvox.jpsala.dev
          |
   Cloudflare edge/Tunnel (temporary edge only)
          |
          v
fixvox-api.service (Bun, VPS loopback)
          |
          +--> PostgreSQL (dedicated Fixvox DB)
          +--> Groq/OpenRouter/etc. (streamed provider requests)
          +--> structured redacted logs
          +--> systemd timers for scheduled work
```

## Project Structure

### Documentation

```text
specs/019-fixvox-self-hosted-control-plane/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── http-api.md               # reconciled legacy/reference index
│   ├── product-api.md            # normative canonical typed contract
│   ├── temporary-aliases.md      # complete bridge/retirement ledger
│   └── product-route-disposition.md
├── quickstart.md
└── tasks.md
```

### Planned Source Layout

```text
cloud/
├── fixvox-core/                    # platform-neutral domain/contracts
│   └── src/
│       ├── control-plane/
│       ├── auth/
│       ├── execution/
│       ├── providers/
│       └── ports/
├── fixvox-proxy/                   # temporary Cloudflare adapter/rollback
│   └── src/
└── fixvox-api/                     # Bun/VPS adapter
    ├── src/
    │   ├── server.ts
    │   ├── config.ts
    │   ├── postgres/
    │   ├── jobs/
    │   └── observability/
    ├── migrations/
    └── systemd/

scripts/
├── fixvox-self-hosted-local.*
├── fixvox-control-plane-export.*
├── fixvox-control-plane-import.*
├── fixvox-control-plane-compare.*
└── fixvox-self-hosted-smoke.*

tests/
└── cloud-contract/                 # same fixtures against both adapters
```

**Structure Decision**: Extract only domain behavior required by canonical product flows rather than duplicating the Worker. Keep the Worker adapter operational until rollback closes. The self-hosted adapter owns PostgreSQL, server lifecycle, required jobs and observability; Tauri and the Admin BFF may migrate coordinately to cleaner contracts.

## Execution Cadence

JP prefers longer, outcome-based execution bands for reversible local work. The previous micro-batch cadence added review/receipt overhead without reducing material risk. Effective 2026-07-19:

- focused checks run while a band advances; the broad deterministic ladder and one receipt run at the end;
- no approval or ceremonial stop is required between local/provider-free steps already owned by the active band;
- a band stops for an unresolved product decision, two failed repair attempts, privacy/auth/quota/exactly-once risk, or scope escape;
- dependency/schema changes outside the approved design, real provider/OAuth/desktop side effects, VPS/secrets/deploy/import/DNS/canary/cutover and commit/push/publish/release retain explicit gates.

Checkpoint D is consolidated into four execution bands while its detailed technical sections remain checklists:

1. **D1 Contract closure — COMPLETE** — normative contracts reconcile 74 HTTP fixtures, 73 method/path pairs, 40 temporary-compat scenarios and 39 aliases, including supported `admin-profile-apply`; D-R1..D-R4 are closed docs-only.
2. **D2 Runtime + Tauri — COMPLETE** — Bun provider/quota/runtime slice, typed actions and coordinated Tauri canonical migration are provider-free green; aliases remain for rollback.
3. **D3 Control Room + operations retained — NEXT / NOT STARTED** — Admin/BFF mutations, required jobs/signals and legacy removal.
4. **D4 Final gate — NOT STARTED** — canonical desktop/Admin suites, privacy/auth/quota/exactly-once evidence and Checkpoint D receipt.

### Normative Checkpoint D migration slices (D1-D2 complete; D3 next)

**D2 Runtime + Tauri, serial:**

1. Write canonical provider-free contract tests for bootstrap/context, transcription and all three action kinds, including redaction sentinels and the `0/1` provider-call matrix.
2. Compose auth/effective-profile/capability checks, then transactional reservation immediately before the single provider dispatch, then consume/release/ambiguous finalization. Stop if p95 PostgreSQL boundary overhead exceeds 15 ms; preserve `pro-unlimited` zero-write semantics.
3. Add canonical Bun adapters, then legacy audio/chat/bootstrap/auth aliases as thin translators to the same core. No generic provider/model authority enters the request.
4. Migrate Tauri atomically: preflight becomes internal canonical admission, STT uses canonical transcription, chat becomes the typed action union, and context comes from canonical bootstrap/refresh. Keep old aliases for supported releases.
5. Run provider-free canonical + dual alias tests. Do not run desktop physical/provider smokes in D2 without a separate gate.

**D3 Control Room + retained operations, serial:**

1. Add domain tests/DTOs for Session/RBAC, Profiles, Configuration, Engines/Pricing, Prompts, Accounts, Devices, Groups, Usage, Audit and Signals.
2. Implement BFF-to-canonical domain calls one domain at a time while stable browser `/api/admin/*` tests stay green; never expose backend credentials or trust browser role/recent-auth claims.
3. Implement mutations with expected revisions, preview/confirmation where required, recent-Google/RBAC matrix and immutable redacted audit; tests remain OAuth/provider-free.
4. Retain only the five named jobs and bounded signals in `product-api.md`; no Discord/support or usage-prewarm/counter fetch surface.
5. Remove a backend alias from the target only after its BFF caller count is zero and ledger tests pass. Cloudflare remains rollback.

**D4 final gate:** run the deterministic suite ladder plus canonical/alias inventory, dropped-route absence, privacy sentinel, auth/RBAC, quota concurrency and exactly-one-provider checks. Close Checkpoint D only on a wholly green provider-free receipt; otherwise report the blocker. Checkpoint E remains separate.

This cadence does not bulk-authorize D2-D4 or later phases. Phases 5-9 keep their infrastructure and production approval gates.

## Implementation Phases

### Phase 0 - Stabilize and freeze evidence

- Treat the existing Worker emergency patch as separate production work.
- Capture active Worker version, endpoint inventory, safe policy/profile projection, and current bundle hash.
- Freeze Worker fixtures as migration evidence and retain redaction assertions; they do not automatically enter the target product.
- Do not provision infrastructure yet.

**Gate A**: Worker fixture inventory is truthful and redacted as a historical baseline.

### Phase 1 - Extract portable core

- Define repository/clock/ID/provider/job ports.
- Move business rules incrementally while keeping all current Worker tests green.
- Keep Cloudflare `index.ts` as a thin adapter.

**Gate B**: Current Worker dry-run bundle and all cloud tests pass with no behavior change.

### Phase 2 - PostgreSQL adapter

- Create schema/migrations per `data-model.md`.
- Implement accounts/devices/bindings/profile publication/policy resolution first.
- Add transactional quota reservations and immutable audit.
- Add isolated database test harness and migration checksum gate.

**Gate C**: effective-policy and concurrency tests pass against PostgreSQL; no VPS/prod dependency.

### Phase 3 - Bun self-hosted HTTP runtime

- Implement config validation, `Bun.serve`, graceful shutdown, health/readiness, provider streaming, structured redaction, and systemd artifacts.
- Compose real providers only after the provider-free boundary is complete; reserve immediately before the single provider call and consume/release afterward.
- Keep the API port explicit and distinct from Admin Web's current `127.0.0.1:8787` listener.
- Run canonical product-flow fixtures with mocked providers and explicit tests for each temporary alias or dropped legacy surface.

**Gate D**: Bun passes the normative `product-api.md` canonical desktop/Control Room flows and all privacy/auth/quota/exactly-one-provider invariants; every alias in the reconciled current source inventory has owner/tests/retirement/rollback and supported-consumer counts are zero before removal. Worker equality is informational outside named aliases.

### Phase 4 - Coordinated local client migration

- Run the Admin Web BFF against canonical Bun domain APIs/PostgreSQL.
- Run the migrated Tauri adapter against canonical APIs using synthetic/provider-free fixtures while testing supported temporary aliases separately.
- Run one explicitly authorized real provider smoke only after provider-free canonical flows pass.

**Gate E**: local normal dictation and typed actions use exactly one provider call, preserve delivery semantics, and no client depends on an unowned legacy route.

### Phase 5 - VPS loopback deployment

- Reconcile the VPS checkout/WIP and choose explicit service ownership before provisioning.
- Provision dedicated PostgreSQL and backup job after approval; do not infer that existing containerized PostgreSQL belongs to Fixvox.
- Deploy `fixvox-api.service` on an explicit loopback port different from Admin Web.
- Verify through SSH/local health and contract checks; no public DNS route.

**Gate F**: service restart, migration, backup, and restore rehearsal pass on VPS without production traffic.

### Phase 6 - Data migration rehearsal

- Export current Cloudflare authority privately.
- Import into isolated VPS database.
- Compare safe counts/hashes and effective projections.
- Repeat until deterministic; no authority change.

**Gate G**: 100% projection match for required records; migration manifest signed/archived privately.

### Phase 7 - Canary

- Approve and configure a canary route for one allowlisted JP account/device.
- Do not mirror provider requests.
- Validate preflight, one STT call, optional postprocess policy, Admin reads, audit, and rollback.

**Gate H**: canary passes and rollback rehearsal returns to Worker without repair.

### Phase 8 - Authority cutover

- Announce/freeze Admin mutations.
- Take final export/import and validate revision/hash.
- Switch edge origin while keeping the hostname/API stable.
- Set authority mode to `vps-authority` only after checks.
- Monitor during a defined stabilization window.

**Gate I**: production health, Admin read-only checks, account/device/profile resolution, and controlled dictation pass; no Worker/KV/DO hot-path traffic.

### Phase 9 - Retire Cloudflare compute/storage

- Disable mutations/providers on Worker only after stabilization and rollback decision.
- Preserve export/backups and version references.
- Keep or replace Cloudflare edge as a separate future decision.

## Rollback Model

### Before authority cutover

Switch canary/public route back to Worker. PostgreSQL is non-authoritative and can be discarded/reimported.

### During final cutover freeze

If any validation fails, keep Cloudflare authority, unfreeze Admin, and discard the attempted authority change.

### After VPS authority accepts writes

Rollback is no longer DNS-only. It requires either:

- forward-fixing the VPS service, or
- exporting VPS mutations and reconciling them into the Worker before returning authority.

Therefore the stabilization window should minimize mutable Admin operations and keep explicit authority revision records.

## Security And Privacy

- Bind service/database to loopback/private network; edge terminates public access.
- Use least-privilege DB role and separate migration role if practical.
- Keep secrets in protected VPS env files; never in systemd unit or repo.
- No request body logging; structured fields are allowlisted.
- Audio proxy uses streaming and bounded buffers; no temp persistence unless an explicit future spec approves it.
- OAuth/admin cookies preserve secure, HttpOnly, SameSite, expiry, recent-auth, and CSRF/state guarantees.
- Backups encrypted and excluded from repos/artifacts returned to chat.

## Approval Gates

Separate explicit approval is required for:

1. Any new dependency installation or package addition.
2. PostgreSQL/container/service provisioning on VPS.
3. Secret creation/copy/rotation.
4. Cloudflare Worker deploy of the emergency patch.
5. DNS/Tunnel/staging route creation.
6. Production export/import.
7. Canary with real identity/provider.
8. Authority cutover.
9. Worker/KV/DO retirement.
10. Commit/push if requested.

## Complexity Tracking

| Complexity | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Temporary dual adapters/aliases | Safe migration and rollback require Worker and product-owned paths during a bounded transition | Big-bang rewrite cannot prove user-flow continuity or rollback safely |
| PostgreSQL schema and migration tooling | Durable policy/auth/quota/audit require transactions and backups | KV emulation reproduces current limits and poor diagnostics |
| Canary/authority state | Prevents ambiguous writes and unsafe DNS-only rollback | Immediate full cutover risks policy/auth divergence |
| Cloudflare edge retained initially | Reduces scope and protects VPS during compute/storage migration | Full Cloudflare exit mixes DNS/TLS/security with application migration |
