# Product-Owned HTTP Contract And Legacy Reference

The self-hosted service owns the contracts needed by Dictation Tauri and Control Room. The frozen Worker routes under `auth-fixvox.jpsala.dev` are migration evidence, not an automatic target. A legacy path is implemented only when it is a named temporary alias for a supported consumer.

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
- **Control Room BFF:** the browser uses `/api/admin/*`; backend domain APIs can be consolidated without exposing credentials to the browser.
- **Signals:** only bounded/redacted usage, telemetry and feedback with an explicit product owner.

Exact canonical request/response schemas are defined in R2 after the consumer/disposition map. Until then, the current routes below describe transition inputs, not permanent names.

## Public Health

### `GET /health`

Must report service identity and liveness without checking secrets.

### `GET /ready`

New self-hosted-only readiness endpoint may report safe booleans for database/schema/providers/jobs/authority mode. It must not replace `/health` for old clients.

## Device And Auth — Current Tauri Migration Aliases

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

The canonical browser boundary is authenticated `/api/admin/*` on `admin/fixvox-web/server.mjs`. The BFF may migrate its backend calls to consolidated product-domain APIs. The current backend `/admin/*` routes are inventory inputs, including:

- environment/health/session
- profiles/drafts/preview/publish/rollback
- engines/prompts/presets/groups
- accounts/devices/assignments
- audit/pricing/feedback/usage

Publish/rollback remain recent-auth + RBAC gated and append immutable audit.

## Product Contract Harness

For each canonical flow and temporary alias, capture provider-free fixtures containing:

- method/path
- safe headers
- request schema/fixture
- expected status/content type
- normalized JSON shape
- redaction assertions

Canonical fixtures run against the self-hosted handler with isolated PostgreSQL and the real product adapters. Temporary-alias fixtures additionally run against the current Worker handler in-memory where rollback compatibility matters. Dropped routes are tested as absent/explicitly unavailable rather than copied.

Provider routes use mocked upstreams for flow conformance. Real providers are never called twice for comparison.

## Historical Checkpoint A Worker Freeze (2026-07-14)

The first fixture inventory is present in the worktree under `tests/cloud-contract/`:

- `fixtures.ts` now contains 73 deterministic HTTP scenarios (72 unique method/path routes because `/desktop/login` has two valid scenarios), plus one explicit scheduled-task boundary. It covers exact Worker paths, internal usage-counter paths and the unknown-route error as historical evidence.
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
