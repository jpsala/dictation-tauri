# Product-Owned HTTP Contract And Legacy Reference

Status: **Normative — D1 COMPLETE and ready for TDD; implementation not started**. D1 reconciles 74 HTTP fixtures across 73 method/path pairs, including supported `POST /admin/control-plane/profiles/apply`, with 40 temporary-compat scenarios across 39 unique aliases.

The self-hosted service will own the contracts needed by Dictation Tauri and Control Room. The frozen Worker routes under `auth-fixvox.jpsala.dev` are migration evidence, not an automatic target. A legacy path is implemented only when it is a named temporary alias for a supported consumer. Canonical profile editing is one direct atomic apply; legacy draft/publish paths do not define or implement it.

## General

- JSON endpoints return `application/json` for success and handled failure.
- Unexpected dependency errors return redacted JSON `503`, not plain text stacks.
- Identity, OAuth, RBAC and Admin authorization semantics remain fail-closed; header/path shapes may migrate coordinately.
- Request IDs are redacted before desktop/operator evidence.
- No endpoint logs raw bodies, audio, transcripts, credentials, OAuth state, or persistent IDs.
- Temporary aliases name their consumer, canonical replacement and retirement condition.
- Removed legacy surfaces return explicit bounded errors or remain only on the rollback Worker; they are never silently re-created.

## Canonical Product Boundaries

- **Operations:** liveness and dependency readiness.
- **Desktop bootstrap/session:** device binding, login and effective profile/capabilities as one coherent product flow.
- **Runtime transcription:** typed dictation request with authoritative quota immediately before exactly one provider call.
- **Runtime action:** typed postprocess, selection and assistant actions; clients do not send provider/model authority through a generic OpenAI-compatible API.
- **Control Room BFF:** the browser uses `/api/admin/*`; direct profile editing uses one product-owned atomic apply, and backend domain APIs remain inaccessible without server-owned credentials.
- **Signals/jobs:** only bounded/redacted usage, telemetry/feedback, and named internal jobs with an explicit product owner.

Normative canonical paths are:

| Boundary | Canonical path(s) |
| --- | --- |
| Operations | `GET /health`, `GET /ready` |
| Desktop bootstrap/context | `POST /product/v1/desktop/bootstrap`, `GET /product/v1/desktop/context` |
| Desktop auth | `/product/v1/desktop/auth/sessions*`, browser ingress, and the server-owned OAuth callback |
| Runtime | `POST /product/v1/runtime/transcriptions`, `POST /product/v1/runtime/actions` |
| Control Room backend | `/product/v1/control-room/*` by Session/RBAC, Profiles, Configuration, Engines/Pricing, Prompts, Accounts, Devices, Groups, Usage, Audit and Signals domains; the sole normal-path profile write is `POST /product/v1/control-room/profiles/{profileKey}/apply`; browser `/api/admin/*` stays stable |
| Product signals | `POST /product/v1/signals/events`, `POST /product/v1/signals/feedback` |
| Jobs | internal named functions/timers only; no public HTTP job API |

Exact inputs, outputs, success/failure examples, authorization matrix, provider-boundary quota lifecycle, privacy sentinels and Cloudflare rollback are defined in `product-api.md`. The current routes below are transition inputs, not permanent names.

## Public Health

### `GET /health`

Must report service identity and liveness without checking secrets.

### `GET /ready`

New self-hosted-only readiness endpoint may report safe booleans for database/schema/providers/jobs/authority mode. It must not replace `/health` for old clients.

## Device And Auth — Current Tauri Migration Aliases

Every supported alias below is individually owned/tested in `temporary-aliases.md`; this section is only a shape summary.

- `POST /v2/device/register`
- `POST /v2/device/activate`
- `GET /desktop/login`
- `GET /desktop/google/start`
- `GET /desktop/login/status`
- `POST /desktop/login/link-device`
- `GET /auth/google/start`
- OAuth callback/result routes currently used by Admin/Desktop

Binding conflicts remain fail-closed and redacted.

## Execution — Current Tauri Migration Aliases

### `POST /v2/execution/preflight`

Preserve:

- `mode`
- `deviceId` / `installId` binding semantics
- `usageKind`, estimate/engine kind inputs
- `ok`, `allowed`, reason/code, retry metadata
- safe profile/limits/engine projections

Quota authorization must be transactional. Storage failures return JSON `503` with `reason=service_unavailable`.

### `POST /v1/audio/transcriptions`

- Preserve multipart shape and selected engine/profile behavior.
- Stream request to exactly one provider.
- Do not write audio to durable storage.
- Preserve safe provider/model/profile/prompt metadata headers/body used by Tauri.

### `POST /v1/chat/completions`

Temporary alias for current selection transforms, presets, postprocess and Quick Chat. Its canonical replacement is a typed runtime-action contract.

- Bind provider/model/prompt from effective profile; client-requested routing cannot override forbidden policy.
- Send content to exactly one selected provider.
- Retire after the supported Tauri adapter uses typed action kinds and no direct consumer remains.

### `POST /v1/usage/prewarm`

Legacy candidate for `drop`. Retain only if D-R1 finds a supported product consumer and a measured need; PostgreSQL authority must not inherit Worker cache rituals by default.

## Telemetry And Feedback

- `POST /v2/telemetry/events/batch`
- `POST /v2/feedback/submit`

Both are `redesign` candidates. Keep only product-owned bounded/redacted signals; they must not block the execution hot path when non-authoritative. Current response compatibility is required only while a named supported client consumes the aliases.

## Admin

The canonical browser boundary is authenticated `/api/admin/*` on `admin/fixvox-web/server.mjs`. Browser `POST /api/admin/profiles/apply` remains stable while the BFF migrates its single downstream call from Worker `POST /admin/control-plane/profiles/apply` to product-owned `POST /product/v1/control-room/profiles/{profileKey}/apply`. The browser edits/reviews the candidate in memory and receives neither backend credentials nor principal/actor/recent-auth/capability authority.

The BFF and product backend both fail closed: recent Google plus effective `publish` capability are mandatory; principal and redacted audit actor are derived server-side; body actor/principal/credential claims are rejected. The canonical request contains `expectedRevision`, a bounded typed candidate definition, and structured explicit confirmation bound to route key and revision. Under one authoritative lock, all references and invariants validate before the first write. Stale/invalid requests write nothing. First success commits exactly one immutable published version, one active-pointer/revision advance, one immutable redacted audit, and one idempotency receipt; an identical replay returns that receipt without another write.

The Worker alias remains `temporary-compat`. It checks legacy `expectedActiveVersion` against the active published version under the authoritative lock, maps the matching aggregate revision to canonical `expectedRevision`, translates the exact legacy confirmation, and dispatches once to the canonical core without releasing the lock. It cannot reinterpret version as revision, trust browser authority, create a draft, call publish, or dual-write. Errors use fixed redacted JSON and never expose candidate content, reference details, actor/principal, cookies/OAuth values, storage errors, or credentials.

Other BFF domain calls migrate to typed `/product/v1/control-room/*` APIs while preserving browser DTOs. Current backend `/admin/*` routes are temporary aliases only where `temporary-aliases.md` names a supported BFF consumer; other routes are redesign/drop inventory. The normal product surface includes profiles read/direct apply/separate rollback, engines/prompts/presets/groups, accounts/devices/assignments, audit/pricing/feedback/usage, and session/RBAC.

Draft/create/save/discard, server preview state, and separate publish remain explicitly isolated **legacy compatibility** only. They cannot be a normal product path or an internal translation of apply, gain no new consumers, and retire when supported browser calls and outstanding supported legacy drafts are zero and focused migration tests are green. Rollback of the migration switches the whole BFF to Cloudflare (`CF-BFF`) while browser routes stay stable; no request is sent to both authorities. A post-success operator rollback is a separate recent-Google + `publish` action that appends a new version/audit and never edits immutable history.

## Product Contract Harness

For each canonical flow and temporary alias, capture provider-free fixtures containing:

- method/path
- safe headers
- request schema/fixture
- expected status/content type
- normalized JSON shape
- redaction assertions

Canonical fixtures run against the self-hosted handler with isolated `fixvox_test` PostgreSQL and the product adapters. Temporary-alias fixtures additionally run against the current Worker handler in-memory where rollback compatibility matters. Dropped routes are tested as absent/explicitly unavailable rather than copied.

Provider routes use mocked upstreams for flow conformance. The gate asserts zero calls before admission and exactly one call after acceptance; ambiguous outcomes are not retried. Real providers are never called for comparison, mirrored, or invoked in D1-D4 provider-free gates.

## Historical Checkpoint A Worker Freeze (2026-07-14)

The first fixture inventory is present in the worktree under `tests/cloud-contract/`:

- `fixtures.ts` now contains 74 deterministic HTTP scenarios (73 unique method/path routes because `/desktop/login` has two scenarios), plus one explicit scheduled-task boundary. It covers exact Worker paths, including `admin-profile-apply`, internal usage-counter paths and the unknown-route error as historical evidence.
- `contract-fixtures.test.ts` parses the current Worker source and fails if an exact route has no fixture. It also records method/path, query names, body kind, expected status/content type, normalized shape, and required top-level keys without serializing request values.
- `redaction.ts` rejects synthetic raw device/install identifiers, OAuth state/tokens, provider keys, transcript/selected-text sentinels, and audio-body sentinels from evidence. It records only allowlisted header presence; `Location`, request IDs, usage keys, provider IDs, and timing values are never copied as raw values.
- `cloud/fixvox-proxy/src/contract-runner.test.ts` executes the same Worker handler with in-memory KV/DO state and a mocked upstream fetch. Chat/audio/model/benchmark scenarios assert the expected single mocked upstream call; no provider or production endpoint is contacted. The redacted run report is written to ignored `artifacts/self-hosted-control-plane/checkpoint-a/worker-contract-report.json`.

### Frozen request/response schema matrix

| Surface | Request shape | Success/handled response | Safe headers/evidence |
| --- | --- | --- | --- |
| `/health` | no body | JSON object with `ok`, `service`, `date` | `Content-Type`; date is normalized as a type |
| `/v2/device/register`, `/v2/device/activate` | JSON install/device metadata and optional invite | JSON device projection; binding conflicts are JSON `409` with `code=device_binding_conflict` | device/install values are fixture-only and hashed/omitted from evidence |
| `/v2/execution/preflight` | JSON `mode`, binding fields, usage/engine kind, estimate | JSON `{ok, allowed, reason}` plus safe profile/limits/engines; dependency failure is JSON `503` with `reason=service_unavailable` | no request body, IDs, or quota keys in evidence |
| `/v1/chat/completions` | OpenAI-compatible JSON plus `X-Device-Id` and optional engine/context headers | provider-compatible JSON or SSE; exactly one selected mocked upstream | only allowlisted `X-Fixvox-*` header names/presence; values are redacted |
| `/v1/audio/transcriptions` | multipart form (`file`, `model`) plus `X-Device-Id`/duration metadata | provider-compatible JSON transcription; audio is transient | multipart boundary and body are not recorded |
| telemetry/feedback | JSON batch or bounded feedback event | JSON acknowledgement/list projection | event IDs, feedback IDs, and content are schema-only |
| desktop/OAuth | query state, handoff, device, PKCE fields | HTML/redirect/JSON protocol response; OAuth state may be returned to the client protocol | `Location` is presence-only; state, cookies and tokens are never evidence values |
| `/admin/*` | authenticated JSON/query requests; mutations require view/edit/publish capability | JSON projection/error plus CORS; publish/rollback use immutable version/audit contracts | `Authorization` is never recorded; CORS names are safe, values are constrained/redacted |
| support/internal | signed support payloads or usage-counter JSON | signature failure preserves current plain-text/no-content-type behavior; counter JSON is internal-only | no Discord/Telegram/provider body or credential is captured |

### Explicit current deferrals/gaps

- `/ready` is a self-hosted-only endpoint planned by the contract; the current Worker has no `/ready` route, so it is deferred to Checkpoint D rather than invented in the baseline.
- `/discord/interactions` invalid signatures currently return plain text without a `Content-Type`; this observed behavior is frozen for parity and should be normalized only by a later compatibility decision.
- `/control-plane-admin` returns the legacy embedded HTML page. The authenticated Admin Web remains the preferred surface; no CDN/body content is included in evidence.
- Admin mutation fixtures run only against fresh in-memory state. They do not authorize or mutate the production Admin, KV, DO, secrets, DNS, or Worker.
