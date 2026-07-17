# Data Model: Fixvox Self-Hosted Control Plane

## Principles

- PostgreSQL is the authority after cutover.
- Public identifiers remain opaque; operator evidence uses redacted forms/hashes.
- Raw audio/transcripts are not persisted by this model.
- Immutable publication/audit history is append-only.
- Mutable projections carry explicit revision/schema version.
- Quota authorization is transactional and idempotent.

## Core Tables

### `accounts`

- `id` UUID/internal key
- `provider`, `provider_subject_hash` (unique)
- `handle`, redacted display fields
- `status`, timestamps

No raw OAuth subject is exposed to clients or operator reports.

### `devices`

- `id`, opaque public `device_id` (unique)
- `install_id_hash` / protected binding representation
- `account_id` nullable FK
- `status`, `policy_id`, `policy_label`
- `last_seen_at`, `created_at`, `updated_at`
- optimistic `revision`

### `install_bindings`

- protected install binding key
- `device_id` FK, created/updated timestamps
- uniqueness prevents rebinding

### `groups` and `account_groups`

- group metadata and account membership
- optional runtime profile targeting
- revisions/timestamps

### `profiles`

- stable `profile_id`, label, lifecycle metadata
- pointer to active published version
- optional current draft version

### `profile_versions`

- `profile_id`, monotonically increasing `version`
- `status` (`draft`, `published`, `historical`)
- normalized JSON definition plus typed columns where query-critical
- authority revision, created/published metadata
- immutable after publication

### `engines`

- engine ID, kind, provider, model, enabled
- safe runtime options; never provider secrets
- revision/timestamps

### `prompts`

- prompt ID, kind, static body/template, enabled
- version/revision/timestamps
- no real transcripts or user content

### `profile_engine_bindings` / `profile_prompt_bindings`

- typed references from profile version to engines/prompts
- FK constraints prevent deleting referenced records

### `policy_assignments`

- target type/id (`account`, `device`, `group`)
- profile/policy ID, priority/source, timestamps
- unique active assignment per targeting rule

### `settings_defaults`

- profile-scoped host defaults/user controls
- typed JSON with schema version

## Quota And Usage

### `quota_policies`

- quota profile ID
- rolling/weekly limits by usage kind
- multiplier and unlimited/tracking mode

### `usage_reservations`

- idempotency key, subject/device/account, usage kind
- estimated amount, state (`reserved`, `consumed`, `released`, `expired`)
- expiry and timestamps

### `usage_events`

- reservation/request reference
- usage kind, safe units, provider/model IDs
- timestamp and success/failure category
- no raw prompt/audio/transcript

Indexes cover subject + kind + timestamp for rolling windows. Reservation and quota evaluation occur in one transaction with row/advisory locking.

## Auth And Sessions

### `oauth_states`

- hashed state identifier, provider, encrypted/protected metadata
- expiry, consumed timestamp

### `desktop_login_sessions`

- signed/hashed state, device/install binding reference
- status, expiry, account link result
- secrets never returned to renderer

### `admin_sessions` / `role_bindings`

- server-side session metadata and RBAC role grants
- recent-auth timestamp for publish/rollback

## Audit And Operational Records

### `audit_records`

- immutable sequence/UUID
- actor redacted ID, action, target type/redacted target
- source/target/resulting versions, result, timestamp
- safe metadata only

### `request_events`

- bounded/redacted operational metadata
- route, status, latency, provider/model, lengths/durations
- retention policy; no request bodies

### `feedback_events`

- explicit user feedback metadata under existing privacy contract
- retention/classification required before migration

### `pricing_records` / `pricing_watchlist`

- provider/model pricing snapshots and configured targets

## Authority And Migration

### `schema_migrations`

Standard ordered migration version and checksum.

### `control_plane_authority`

Singleton row:

- `mode`: `cloudflare-authority | import-validation | canary | vps-authority | rollback`
- `revision`
- source snapshot hash/version
- changed_at, changed_by

### `migration_runs`

- run ID, source version, schema version
- started/completed/status
- safe per-entity counts/hashes
- validation result
- private artifact path reference, not payload

## Retention

- OAuth/login state: short TTL and deletion after consumption/expiry.
- Usage events: enough for active quota/cost windows plus documented retention.
- Request telemetry: bounded and redacted.
- Audit/profile publications: durable append-only.
- Audio/transcripts: absent from database by default.

## Backup Contract

Encrypted backup plus manifest:

- schema migration version
- authority revision/mode
- table counts
- safe deterministic projection hashes
- creation timestamp/tool version

Restore verification must compare manifest without printing sensitive rows.
