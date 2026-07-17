# Feature Specification: Fixvox Self-Hosted Control Plane

**Feature Branch**: `[019-fixvox-self-hosted-control-plane]`

**Created**: 2026-07-14

**Status**: Active / Checkpoints A-C complete; Checkpoint D recalibrating product contracts

**Input**: Replace Fixvox's operational dependency on Cloudflare Workers, KV, and Durable Objects with JP-owned infrastructure while preserving safety and a coordinated rollback path. Product-owned contracts may replace legacy Worker contracts together with their Tauri/Admin consumers.

**Product-first amendment (2026-07-16)**: JP explicitly chose product-first evolution over Worker parity. The frozen Worker inventory is migration evidence, not the target architecture. Canonical flows are defined by Dictation Tauri and Control Room outcomes; legacy compatibility exists only as a temporary, owned bridge. Execution plan: `docs/tracks/fixvox-product-first-self-hosted-contract-plan.md`.

## User Scenarios & Testing

### User Story 1 - Run Fixvox without Cloudflare compute/storage (Priority: P1)

As JP, I want the managed dictation control-plane and provider proxy to run on infrastructure I control, so a Cloudflare KV/Worker quota cannot block dictation.

**Why this priority**: A live preflight outage occurred when Cloudflare KV exhausted its daily write quota before STT execution.

**Independent Test**: Start the self-hosted service locally against an isolated PostgreSQL database and run contract fixtures for health, registration, preflight, STT proxy, chat proxy, and fail-closed errors without contacting production.

**Acceptance Scenarios**:

1. **Given** the self-hosted service and PostgreSQL are available, **When** a registered allowed device performs preflight, **Then** it receives the same safe JSON contract as the Worker without KV/DO access.
2. **Given** PostgreSQL or a required provider is unavailable, **When** a request is made, **Then** the service returns a redacted JSON error and does not silently fall back or leak content.
3. **Given** a normal dictation reaches the proxy, **When** STT succeeds, **Then** audio is streamed to the selected provider and is not persisted by the service.

---

### User Story 2 - Preserve Admin policy and durable state (Priority: P1)

As JP, I want accounts, devices, profiles, prompts, engines, policy assignments, quotas, OAuth state, and audit history migrated to PostgreSQL without changing effective policy.

**Independent Test**: Export a redacted inventory and encrypted/private migration bundle from the current control-plane, import it into an isolated database, and compare effective profile/preflight/engine projections for synthetic and allowlisted real identities without printing raw IDs.

**Acceptance Scenarios**:

1. **Given** a published profile and account/device assignment, **When** it is imported, **Then** the self-hosted resolver returns the same profile, capabilities, limits, engines, and prompt IDs.
2. **Given** concurrent quota checks, **When** requests reserve/consume usage, **Then** PostgreSQL transactions prevent lost updates and quota bypass.
3. **Given** a failed or partial import, **When** validation runs, **Then** authority remains on Cloudflare and production traffic is not cut over.

---

### User Story 3 - Migrate Tauri safely to product-owned contracts (Priority: P1)

As a Dictation Tauri user, I want desktop updates and the self-hosted origin to migrate coordinately so legacy Worker contracts do not constrain the product and dictation remains recoverable throughout the transition.

**Independent Test**: Run current and target desktop adapters provider-free against the same canonical flow fixtures, migrate one allowlisted canary device/account, and prove rollback while temporary aliases still exist.

**Acceptance Scenarios**:

1. **Given** a current supported client, **When** a canonical replacement is introduced, **Then** an explicit temporary alias or coordinated client release preserves the user flow until migration completes.
2. **Given** canary failure before authority cutover, **When** rollback is invoked, **Then** traffic returns to the Worker without data repair.
3. **Given** provider routes, **When** old and new adapters are tested, **Then** no request is mirrored to two providers and no duplicate billable call occurs.
4. **Given** no remaining consumer for an alias, **When** its retirement gate passes, **Then** the alias can be removed with a focused contract test.

---

### User Story 4 - Operate and recover the self-hosted service (Priority: P2)

As JP, I want health checks, backups, logs, deploy/rollback commands, and recovery instructions so owning the infrastructure does not reduce reliability.

**Independent Test**: Restore an encrypted PostgreSQL backup into an isolated database, start the prior service release, and pass read-only health/contract checks.

**Acceptance Scenarios**:

1. **Given** a deployed release, **When** health and readiness run, **Then** they distinguish process, database, migration, provider configuration, and background-job readiness without exposing secrets.
2. **Given** a bad application release, **When** rollback runs, **Then** the prior binary/source bundle restarts against a schema it supports.
3. **Given** a backup, **When** restore rehearsal runs, **Then** policy projections and safe record counts match the backup manifest.

### Edge Cases

- Cloudflare edge is healthy but the VPS origin is down.
- PostgreSQL is reachable but migrations are behind or ahead of the service version.
- OAuth callback arrives during cutover.
- Admin publishes a profile while the final migration snapshot is running.
- A quota reservation succeeds but the provider request fails.
- A provider streams a large response or malformed JSON.
- A client uses an older supported payload shape.
- Rollback occurs after VPS-side mutable writes have begun.

## Requirements

### Functional Requirements

- **FR-001**: The self-hosted runtime MUST provide product-owned contracts for canonical desktop and Admin flows. Current endpoint paths are retained only while a named supported consumer needs a migration bridge; security, privacy and redacted error invariants remain mandatory.
- **FR-002**: The service MUST run on JP-owned VPS compute without Cloudflare Workers, KV, or Durable Objects.
- **FR-003**: PostgreSQL MUST be the durable authority for accounts, devices/install bindings, profiles, profile publications/drafts, policy/group assignments, prompts, engines, settings defaults, audit, usage, pricing, feedback, and auth state selected for migration.
- **FR-004**: Usage and quota operations MUST use atomic database transactions or equivalent concurrency-safe primitives.
- **FR-005**: The service MUST stream audio/text to configured providers and MUST NOT persist raw audio or transcripts as part of normal proxy operation.
- **FR-006**: Provider secrets, OAuth secrets, admin credentials, database credentials, and signing keys MUST remain outside the repository and renderer.
- **FR-007**: The migration MUST include a dry-run export/import and projection comparison before any production authority or traffic cutover.
- **FR-008**: Migration evidence MUST use redacted IDs, counts, hashes, revisions, versions, and booleans; it MUST NOT contain credentials, raw account/device IDs, transcripts, or audio.
- **FR-009**: Provider routes MUST NOT use traffic mirroring that could duplicate STT/LLM requests or user content.
- **FR-010**: A canary MUST be scoped to an allowlisted account/device before general cutover.
- **FR-011**: Admin mutations MUST be frozen or otherwise serialized during the final authority snapshot and cutover window.
- **FR-012**: Rollback MUST remain possible until the self-hosted database is declared authoritative and the post-cutover rollback procedure accounts for new writes.
- **FR-013**: Health/readiness MUST distinguish process liveness, database readiness, schema revision, provider configuration, and migration/cutover mode.
- **FR-014**: Logs MUST be structured and redacted; raw request bodies, audio, transcripts, credentials, and persistent identifiers MUST NOT be logged.
- **FR-015**: Deployment, DNS/Tunnel changes, production imports, secret changes, traffic cutover, and Worker retirement MUST each require explicit JP authorization.
- **FR-016**: The first production architecture MUST keep Cloudflare only as optional DNS/proxy/Tunnel edge; replacing DNS/edge entirely is a later decision.
- **FR-017**: Existing Worker production MUST remain available as rollback during canary and the agreed stabilization window.
- **FR-018**: The migration MUST not depend on Taskflow; implementation proceeds manually by SpecKit checkpoints and deterministic checks.

### Key Entities

- **Account**: Authenticated user identity and redacted operator-facing projection.
- **Device / Install Binding**: Durable mapping of install identity to device, account, status, and effective profile targeting.
- **Runtime Profile**: Versioned published/draft definition of capabilities, limits, engines, prompts, and defaults.
- **Engine / Prompt**: Provider/model routing and safe static prompt configuration referenced by profiles.
- **Usage Event / Counter**: Transactional quota consumption by identity, kind, amount, and time window.
- **Audit Record**: Immutable operator action and publication history without sensitive payloads.
- **OAuth/Auth Session**: Short-lived state and durable account linkage stored server-side.
- **Migration Manifest**: Schema/version/count/hash summary proving export/import completeness without raw identifiers.
- **Cutover State**: Explicit mode (`cloudflare-authority`, `canary`, `vps-authority`, `rollback`) and revision.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Provider-free canonical-flow suites pass for desktop bootstrap/login, effective profile, transcription, typed actions and the Control Room operations used by the current UI. Legacy Worker comparison is informational except for named temporary aliases.
- **SC-002**: Effective profile, capability, limit, engine, and prompt projections match for 100% of migrated allowlisted records in the validation manifest.
- **SC-003**: At least 20 concurrent synthetic preflight/quota requests complete without lost updates, over-admission, or storage exceptions.
- **SC-004**: A controlled canary dictation completes preflight, one STT provider call, and normal delivery with no duplicate provider request.
- **SC-005**: Normal proxy operation stores zero raw audio/transcript records in PostgreSQL and application logs.
- **SC-006**: Application rollback to the prior release completes within 10 minutes during rehearsal.
- **SC-007**: PostgreSQL backup restore rehearsal reproduces schema revision and safe projection hashes/counts.
- **SC-008**: A supported Tauri release completes normal dictation through the canonical contract, and any older supported release continues only through an explicitly owned temporary alias until its retirement condition is met.

## Assumptions

- The first migration targets JP and the current small Fixvox user/device population, but data boundaries must support growth.
- The current TypeScript Worker source is migration evidence and rollback reference, not the behavioral authority. Portable domain rules may be reused where they serve canonical product flows.
- Bun/TypeScript is the preferred first runtime because the repo already uses Bun tests and Web Request/Response semantics map closely to Workers.
- A dedicated PostgreSQL database is used; the Coolify internal database is not reused as product storage.
- Redis is optional and deferred unless PostgreSQL-only counters/cache fail measured requirements.
- Cloudflare DNS/proxy/Tunnel may remain during the first migration; Worker/KV/DO are the dependencies being removed.
- The emergency Worker patch is independent and may be deployed before this migration with separate authorization.

## Out of Scope

- Migrating DNS away from Cloudflare in the first cutover.
- Persisting raw audio/transcripts for analytics.
- Uncoordinated desktop/API changes without a migration alias, supported-client decision or rollback proof.
- Multi-region active-active or zero-RPO high availability in the first version.
- Replacing provider APIs such as Groq/OpenRouter.
