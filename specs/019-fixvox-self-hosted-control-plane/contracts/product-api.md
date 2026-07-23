# Product-Owned API Contract

Status: **Normative — D1 COMPLETE and ready for TDD; implementation not started**. D1 reconciled the 74-fixture/73-route source inventory and 40-scenario/39-alias transition ledger. This document defines the product-owned atomic profile apply and is aligned with `spec.md`, `plan.md`, and `tasks.md`.

## 1. Contract Rules

- Canonical prefix: `/product/v1`. Operations probes remain unversioned at `/health` and `/ready`.
- JSON success uses `{ "ok": true, "data": ... }`. JSON failure uses the redacted envelope below. Multipart transcription success is JSON.
- Unknown fields are rejected on mutation/runtime inputs. Bounded forward-compatible projection objects may add documented fields.
- Opaque IDs may be returned to the authenticated caller that needs them, but are never copied to logs, test reports, screenshots, audit details, or operator evidence. Evidence uses hashes/counts/revisions/booleans.
- Device and browser credentials, provider credentials, OAuth state, cookies, and BFF credentials are server/host owned and never exposed to the renderer.
- Effective policy, provider, model, prompt, quota profile, and fallback are selected server-side. Clients submit an operation kind and user content, not routing authority.
- Auth, binding, RBAC, capability, quota, and privacy checks fail closed.
- Runtime requests never mirror traffic and never retry a provider implicitly. An accepted operation dispatches **exactly one provider call**.
- Raw audio, transcript, selected text, assistant text, and prompt-expanded content are transient. They are not persisted or logged.
- Cloudflare Worker/KV/DO remains production authority and rollback until a separately approved canary/cutover. Implementing this contract does not change authority.

### Common types

```ts
type OpaqueId = string;          // 1..128, opaque, never evidence
 type IsoTime = string;          // RFC 3339 UTC
 type Revision = number;         // integer >= 0
 type ActionKind = "postprocess" | "selection_transform" | "assistant";
 type UsageKind = "stt" | "llm";

type Success<T> = { ok: true; data: T };
type Failure = {
  ok: false;
  error: {
    code:
      | "invalid_request" | "invalid_confirmation" | "invalid_definition"
      | "unauthenticated" | "forbidden"
      | "binding_conflict" | "capability_disabled" | "quota_exhausted"
      | "stale_revision" | "not_found" | "conflict"
      | "payload_too_large" | "upstream_rejected"
      | "upstream_outcome_unknown" | "service_unavailable";
    category: "request" | "auth" | "policy" | "quota" | "upstream" | "dependency";
    message: string;              // fixed safe copy; never reflects input/upstream body
    retryable: boolean;
    retryAfterSeconds?: number;
  };
};

type EffectiveCapabilities = {
  transcription: boolean;
  postprocess: boolean;
  selectionTransform: boolean;
  assistant: boolean;
  feedback: boolean;
  adminSettings: boolean;
};

type EffectiveContext = {
  profile: { key: string; version: number; revision: Revision };
  capabilities: EffectiveCapabilities;
  limits: {
    quotaClass: "metered" | "pro-unlimited";
    sttRemaining?: number;
    llmRemaining?: number;
    resetsAt?: IsoTime;
  };
  actions: Array<{ kind: ActionKind; enabled: boolean; presetKeys?: string[] }>;
  authority: { mode: "cloudflare-authority" | "canary" | "vps-authority" | "rollback"; revision: Revision };
};
```

`EffectiveContext` deliberately excludes provider names, model names, provider credentials, expanded prompts, raw assignment IDs, and internal quota keys.

### Redacted failure examples

```json
{
  "ok": false,
  "error": {
    "code": "quota_exhausted",
    "category": "quota",
    "message": "Usage limit reached.",
    "retryable": true,
    "retryAfterSeconds": 1800
  }
}
```

```json
{
  "ok": false,
  "error": {
    "code": "service_unavailable",
    "category": "dependency",
    "message": "The service is temporarily unavailable.",
    "retryable": true
  }
}
```

Handled failures always use `application/json`; no stack, SQL text, provider body, provider/model choice, credential, raw content, or persistent identifier may appear.

## 2. Authentication And Authorization Matrix

| Boundary | Caller credential | Required checks | Failure |
| --- | --- | --- | --- |
| `GET /health` | none | process only | bounded JSON `503` only if process cannot serve |
| `GET /ready` | none or private probe | safe dependency/schema/config/job/authority booleans only | JSON `503`; no secret/config values |
| Desktop bootstrap | install proof/bootstrap credential in native host | request bounds, install proof, binding status | `401/403/409`; fail closed |
| Desktop auth start/status/claim | bound install proof plus one-time handoff proof | expiry, one-time use, state hash, binding conflict | `401/409`; no account/OAuth details |
| Effective context/runtime/signals | short-lived device session in native host | active binding, session, profile, capability | `401/403`; zero provider calls |
| Control Room browser `/api/admin/*` | secure HttpOnly browser session | OAuth session and CSRF in BFF | BFF JSON `401/403` |
| BFF to `/product/v1/control-room/*` | server-owned BFF credential + signed server-derived principal context | credential and principal derived/verified server-side; capability per action; recent Google for profile apply/rollback and role changes | `401/403`; browser never receives backend credential or mutation authority |
| Internal jobs | local service identity, no public HTTP trigger | allowlisted job, singleton lock, authority mode | fail closed + redacted result/audit |

Roles are `view`, `edit`, and `publish`. Reads require `view`; ordinary non-profile configuration mutations require `edit`; atomic profile apply and rollback require `publish` **and** recent Google authentication. Legacy draft/publish bridges retain their existing fail-closed permissions only until retirement and grant no canonical authority. Role set/remove requires owner-equivalent authorization and recent Google authentication. Mutation authorization is re-evaluated server-side; browser-supplied role/recent-auth booleans are never trusted.

## 3. Operations

### `GET /health`

Liveness only. It does not query PostgreSQL or providers.

Success `200`:

```json
{ "ok": true, "data": { "service": "fixvox-api", "status": "live" } }
```

### `GET /ready`

Readiness performs bounded local checks and returns `200` only when the active mode can safely serve. Provider readiness checks configuration presence/adapters, never a real provider request.

```ts
type Readiness = {
  service: "fixvox-api";
  ready: boolean;
  checks: {
    database: boolean;
    schemaCompatible: boolean;
    providerConfigured: boolean;
    jobsConfigured: boolean;
    authorityMode: "cloudflare-authority" | "canary" | "vps-authority" | "rollback";
  };
};
```

Failure `503` uses the normal failure envelope and may include only the safe `checks` projection under `error.details`; it never includes DSNs, versions that expose patch topology, key names/values, or exception text.

## 4. Desktop Bootstrap, Session, And Auth

### `POST /product/v1/desktop/bootstrap`

Creates or refreshes a device/install binding and returns the current effective context. Invite activation is an optional, one-time branch of the same command.

```ts
type DesktopBootstrapRequest = {
  installId: OpaqueId;
  device: { platform: "windows"; appVersion: string; label?: string };
  inviteCode?: string;
};
type DesktopBootstrapResponse = {
  binding: { deviceId: OpaqueId; status: "active" | "login_required" | "blocked" };
  session?: { token: string; expiresAt: IsoTime }; // native host only
  context: EffectiveContext;
};
```

Success `200`:

```json
{
  "ok": true,
  "data": {
    "binding": { "deviceId": "opaque-device", "status": "active" },
    "session": { "token": "native-host-only", "expiresAt": "2026-07-19T12:15:00Z" },
    "context": {
      "profile": { "key": "jp", "version": 1, "revision": 42 },
      "capabilities": { "transcription": true, "postprocess": false, "selectionTransform": true, "assistant": true, "feedback": true, "adminSettings": true },
      "limits": { "quotaClass": "pro-unlimited" },
      "actions": [{ "kind": "selection_transform", "enabled": true, "presetKeys": ["corregir-texto"] }],
      "authority": { "mode": "cloudflare-authority", "revision": 42 }
    }
  }
}
```

A conflicting install/device/account binding returns `409 binding_conflict` without revealing either identity.

### `POST /product/v1/desktop/auth/sessions`

Starts a one-time browser handoff for the authenticated install/device binding.

```ts
type AuthSessionStartRequest = { deviceId: OpaqueId; returnTo: "fixvox-tauri" };
type AuthSessionStartResponse = {
  handoffId: OpaqueId;
  verificationUri: string; // same trusted product origin only
  expiresAt: IsoTime;
  pollAfterSeconds: number;
};
```

### `GET /product/v1/desktop/auth/sessions/{handoffId}`

Returns `{ status: "pending" | "approved" | "denied" | "expired" }` and, once approved, a one-time claim proof. It never returns OAuth tokens, email, Google `sub`, cookies, or account IDs.

### `POST /product/v1/desktop/auth/sessions/{handoffId}/claim`

```ts
type AuthSessionClaimRequest = { deviceId: OpaqueId; claimProof: string };
type AuthSessionClaimResponse = {
  session: { token: string; expiresAt: IsoTime };
  context: EffectiveContext;
};
```

The handoff and claim are atomic, expiring, and single-use. Concurrent claims have one winner; all later attempts return redacted `409 conflict`.

### Browser ingress owned by auth

`GET /product/v1/desktop/auth/browser/{handoffId}` and `GET /product/v1/auth/oauth/callback` are server-rendered/browser ingress, not renderer APIs. The server chooses the configured identity provider, stores only hash-safe handoff/state records, validates state/PKCE/callback once, and completes the handoff. Provider choice and OAuth tokens never enter a URL returned to desktop evidence.

### `GET /product/v1/desktop/context`

Returns the current `EffectiveContext` for an active device session. This is the canonical refresh after bootstrap and before capability-sensitive UI/actions.

## 5. Runtime Transcription

### `POST /product/v1/runtime/transcriptions`

Content type: `multipart/form-data` with exactly two parts:

- `metadata`: JSON `TranscriptionRequest`;
- `audio`: bounded supported audio media type, streamed and never persisted.

```ts
type TranscriptionRequest = {
  operationId: OpaqueId;       // client-generated idempotency key
  durationMs: number;
  language?: string;
  hints?: { vocabularyKeys?: string[] }; // server-known keys only, no prompt/provider/model
};
type TranscriptionResponse = {
  operationId: OpaqueId;
  text: string;                // transient response to authenticated caller only
  language?: string;
  usage: { kind: "stt"; charged: boolean };
  policy: { profileVersion: number; postprocessEligible: boolean };
};
```

Success `200`:

```json
{
  "ok": true,
  "data": {
    "operationId": "opaque-operation",
    "text": "<transient transcript returned only to caller>",
    "language": "es",
    "usage": { "kind": "stt", "charged": true },
    "policy": { "profileVersion": 1, "postprocessEligible": false }
  }
}
```

The client cannot submit `provider`, `model`, provider headers, expanded prompts, or quota overrides. Such fields fail with `400 invalid_request` rather than being ignored.

## 6. Typed Runtime Actions

### `POST /product/v1/runtime/actions`

The body is a discriminated union. Exactly one action and at most one provider transformation execute.

```ts
type RuntimeActionRequest =
  | { operationId: OpaqueId; kind: "postprocess"; input: { transcript: string } }
  | { operationId: OpaqueId; kind: "selection_transform"; input: { selectedText: string; presetKey?: string; instruction?: string } }
  | { operationId: OpaqueId; kind: "assistant"; input: { utterance: string; conversationSummary?: string } };

type RuntimeActionResponse =
  | { operationId: OpaqueId; kind: "postprocess"; output: { text: string }; usage: { kind: "llm"; charged: boolean } }
  | { operationId: OpaqueId; kind: "selection_transform"; output: { text: string }; usage: { kind: "llm"; charged: boolean } }
  | { operationId: OpaqueId; kind: "assistant"; output: { reply: string; surface: "inline" | "quick_chat" }; usage: { kind: "llm"; charged: boolean } };
```

Success `200`:

```json
{
  "ok": true,
  "data": {
    "operationId": "opaque-operation",
    "kind": "selection_transform",
    "output": { "text": "<transient transformed text returned only to caller>" },
    "usage": { "kind": "llm", "charged": true }
  }
}
```

`presetKey` references a server-published preset. `instruction` is bounded user intent, not a system prompt or routing override. Postprocess is rejected when the effective profile disables it. Selection materialization/replacement remains a Tauri responsibility and continues to fail closed; this API only returns transient text.

## 7. Authoritative Quota And Exactly-One-Provider Lifecycle

The same state machine applies to transcription and every typed action:

1. Parse bounded metadata without logging raw content; authenticate session/device and resolve binding.
2. Resolve the published effective profile, capability, logical engine/prompt, quota class, provider and model **server-side**.
3. Validate capability and content bounds. Any failure through this step performs **zero provider calls**.
4. For metered profiles, atomically reserve by `(operationId, identity, usageKind)` **immediately before dispatch**. Exhaustion/conflict performs zero provider calls. For `pro-unlimited`, do not create a reservation or usage event.
5. Invoke the selected provider adapter exactly once. The adapter receives no retry policy and may not fan out, hedge, mirror, or fall back to a second provider.
6. Before dispatch, cancellation/serialization failure releases a metered reservation. A provider rejection proven to occur before provider execution may release it.
7. On success, atomically consume once using safe measured units. On failure after dispatch or ambiguous timeout, finalize conservatively as dispatched/consumed, return `upstream_outcome_unknown`, and do not retry implicitly. Raw provider bodies are discarded.
8. Idempotent replay of `operationId` never dispatches again. It returns the safe terminal status when available; because raw output is not durably stored, it may return `409 conflict` requiring explicit user re-execution with a new operation ID.

Provider-free TDD assertions per operation kind:

- exhausted/unauthenticated/disabled/invalid = mock call count `0`;
- accepted = mock call count **exactly `1`**;
- ambiguous upstream = mock call count `1`, no retry/fallback;
- pre-dispatch failure = reservation released and mock call count `0`;
- success = one consume event; idempotent replay adds no call/event;
- `pro-unlimited` = mock call count `1`, reservation/event writes `0`;
- 20 concurrent requests do not over-admit; provider-boundary DB overhead p95 must be `<=15 ms` or D2 stops.

## 8. Control Room BFF Domain Contract

The browser boundary remains `/api/admin/*`. The BFF maps it to `/product/v1/control-room/*` using server-owned credentials and a signed `PrincipalContext`; the browser never calls these backend routes directly.

```ts
type PrincipalContext = {
  principalKey: string;          // signed/derived by BFF, never trusted from browser JSON
  requestedAction: string;
  recentGoogleAt?: IsoTime;
};
type Page<T> = { items: T[]; nextCursor?: string };
type MutationMeta = { expectedRevision: Revision; reason: string };
type MutationResult<T> = { value: T; revision: Revision; auditId: OpaqueId };
```

All lists are bounded/cursor-based. DTOs expose opaque keys and safe projections, not OAuth/provider secrets or raw persistent IDs.

| Domain | Canonical backend operations | Minimum authorization/invariants |
| --- | --- | --- |
| Session/RBAC | `GET /control-room/session`; `GET /roles`; `PUT /roles/{principalKey}`; `DELETE /roles/{principalKey}` | `view` for session/list; owner + recent Google for role mutation; immutable redacted audit |
| Profiles | `GET /profiles`; `POST /profiles/{profileKey}/apply`; `POST /profiles/{profileKey}/rollback` | ordinary edits use one atomic apply; apply/rollback require `publish` + recent Google + expected revision + explicit confirmation; exactly one immutable redacted audit |
| Configuration | `GET /configuration`; `PUT /configuration/selection-presets`; `PUT /configuration/targeting` | `view`/`edit`; published profile remains runtime authority; no direct mutable runtime-policy blob |
| Engines | `GET /engines`; `POST /engines`; `DELETE /engines/{engineKey}`; `GET /pricing`; `POST /pricing/refresh` | `view`/`edit`; credentials omitted; provider/model only operator-visible here, never client routing authority; refresh is an auditable job request |
| Prompts | `GET /prompts`; `POST /prompts`; `DELETE /prompts/{promptKey}` | `view`/`edit`; prompt bodies only to authorized Control Room, never logs/audit details |
| Accounts | `GET /accounts`; `PUT /accounts/{accountKey}/targeting`; `PUT .../budget` | `view`/`edit`; expected revision; bounded safe account projection; immutable audit |
| Devices | `GET /devices`; `PUT /devices/{deviceKey}/targeting` | `view`/`edit`; binding invariants fail closed; immutable audit |
| Groups | `GET /groups`; `POST /groups`; `DELETE /groups/{groupKey}`; `PUT .../members` | `view`/`edit`; expected revision; immutable audit |
| Usage | `GET /usage` | `view`; bounded aggregate/count/remaining-quota DTO, never raw request content |
| Audit | `GET /audit` | `view`; append-only, bounded, redacted, cursor-based |
| Signals | `GET /signals/feedback` | `view`; bounded/redacted opted-in feedback projection only |

Canonical paths above are relative to `/product/v1`. Mutations use explicit command semantics and `MutationMeta`; stale revisions return `409 stale_revision`. Audit stores action, safe subject key/hash, revisions, result, timestamp, and principal key/hash—never mutation bodies, prompt text, IDs in evidence, or credentials.

### `POST /product/v1/control-room/profiles/{profileKey}/apply`

This is the **only canonical normal-path profile edit command**. The Control Room edits a candidate in browser memory, shows the local review, obtains explicit user confirmation, and submits one apply through the BFF. The browser boundary remains `POST /api/admin/profiles/apply`; the BFF derives principal/actor context and uses its server-owned backend credential. The browser never receives or submits a backend credential, capability assertion, role, recent-auth assertion, `principalKey`, `actor`, or `actorKey`.

`expectedRevision` is the monotonic revision of the authoritative profile aggregate returned by the latest authorized profile read. It is not a client-selected version number. A successful first execution advances it exactly once from `r` to `r + 1`.

```ts
type ProfileCandidateDefinition = {
  schemaVersion: 1;
  label: string;
  access: { capabilities: Array<keyof EffectiveCapabilities> };
  runtime: {
    transcription: { engineKey: string; promptKey?: string };
    postprocess: { engineKey: string; promptKey?: string };
    selectionTransform: { engineKey: string; promptKey?: string };
  };
  limits: {
    mode: "block" | "warn";
    dailyUsd?: number;
    monthlyUsd?: number;
    quotaProfileKey?: string;
  };
  userControls: Record<string, "hidden" | "visible-locked" | "editable">;
  defaults: Record<string, string | number | boolean>;
};

type ProfileApplyRequest = {
  expectedRevision: Revision;
  definition: ProfileCandidateDefinition;
  confirmation: {
    action: "apply";
    profileKey: string;          // must equal the decoded route key
    expectedRevision: Revision; // must equal the top-level value
    phrase: string;              // exact: APPLY <profileKey> REV <expectedRevision>
  };
};

type ProfileApplyResponse = {
  profile: {
    key: string;
    label: string;
    publishedVersion: number;
    revision: Revision;
  };
  publication: {
    previousVersion: number | null;
    resultingVersion: number;
  };
  audit: { id: OpaqueId; action: "apply"; result: "success" };
  idempotentReplay: boolean;
};
```

Unknown request fields are rejected. Version, status, history, `basedOnVersion`, revision, audit fields, principal/actor fields, credentials, provider/model authority, and expanded prompt content are server-owned and are not accepted inside `definition` or elsewhere in the body.

Success `200`:

```json
{
  "ok": true,
  "data": {
    "profile": { "key": "pro", "label": "Pro", "publishedVersion": 2, "revision": 43 },
    "publication": { "previousVersion": 1, "resultingVersion": 2 },
    "audit": { "id": "opaque-audit", "action": "apply", "result": "success" },
    "idempotentReplay": false
  }
}
```

#### Authorization and validation order

1. The BFF requires a valid secure browser session, CSRF protection, **recent Google authentication**, and effective capability `publish` before any backend call.
2. The product API verifies the server-owned BFF credential and signed server-derived principal context, derives the normalized audit actor from that principal, and independently re-evaluates `publish` plus recent-Google freshness. Body/query actor, principal, credential, role, capability, and recent-auth fields are rejected, not trusted.
3. Parse and bound the body, then acquire the authoritative profile mutation lock. Lock failure returns `503 service_unavailable` and performs no profile/audit write.
4. Under the lock, first recognize an already committed identical command fingerprint; otherwise re-read authority and validate profile existence, `expectedRevision`, confirmation binding, the complete candidate shape, capability keys, engine/prompt/quota references, numeric bounds, and cross-field invariants. Every check completes before the first write.
5. Commit the new immutable published version, active pointer, aggregate revision, one immutable redacted audit record, and idempotency receipt as one authoritative transaction. Return success only from the committed receipt.

The command fingerprint is a server-side hash of action, route `profileKey`, authenticated principal key, `expectedRevision`, canonicalized definition, and confirmation. It excludes cookies and credentials. An identical replay by the same principal returns the stored successful receipt with `idempotentReplay: true`; it performs no new version, revision, audit, or projection write. Reuse with any changed field is a distinct command and, after the first success, fails `stale_revision`. Another principal cannot claim the first principal's replay.

#### Atomicity and failure contract

- Malformed/unknown fields or confirmation mismatch: `400 invalid_request` / `invalid_confirmation`, zero writes.
- Missing/expired browser or BFF authentication: `401 unauthenticated`, zero writes.
- Missing `publish` or stale recent-Google proof: `403 forbidden`, zero writes and no broker call from the BFF.
- Missing profile: `404 not_found`, zero writes.
- Revision mismatch: `409 stale_revision`, zero writes; the UI discards its stale editor and reloads authority.
- Invalid definition or missing/forbidden reference: `422 invalid_definition`, zero writes. Fixed safe copy is `The profile definition is invalid.`; reference existence, provider/model details, prompt bodies, and internal keys are not disclosed.
- Unavailable authoritative lock/storage before commit: `503 service_unavailable`, zero authoritative writes. An outcome that cannot be proven uncommitted returns the same safe `503`; retrying the identical command must recover/project the committed receipt or complete it once, never create a second publication.
- Success: exactly one new `published` history version, exactly one active-pointer/revision advance, exactly one immutable redacted `apply` audit, and no draft/intermediate row. A response/projection failure after commit cannot undo or duplicate that authority; replay repairs safe projections from the receipt before returning success.

Audit may retain only audit ID, action, safe profile key/hash, principal key/hash, prior/resulting versions, prior/resulting revisions, result, and timestamp. It must not retain the candidate body, labels changed by the candidate, prompt text, provider/model details, credential material, OAuth values, cookies, IP/user-agent, or confirmation phrase. Logs and evidence use only action, result, status, timing, replay boolean, and redacted hashes/counts.

#### Direct-apply transition and rollback

Draft/create/save/discard and separate publish endpoints are **legacy compatibility only**. They are not canonical profile operations, are not the normal Control Room path, and must never be called internally to implement apply. In particular, apply cannot be translated to `create draft -> save draft -> publish`, even inside one process. Legacy draft/publish bridges remain isolated behind their existing consumers and explicit retirement gates in `temporary-aliases.md`; no new consumer may adopt them.

Before cutover, the whole Control Room BFF backend can roll back to the Cloudflare Worker (`CF-BFF`) while browser `POST /api/admin/profiles/apply` stays stable. It must not dual-write or split one apply across authorities. A failed/uncommitted apply needs no compensating write. A successful apply is immutable; an operator rollback is a separate recent-Google + `publish` command that appends a new published version and audit rather than deleting or editing history. Alias removal, post-write rollback, authority cutover, and Worker retirement remain separately approved changes.

## 9. Product Signals And Retained Jobs

### `POST /product/v1/signals/events`

Authenticated device sessions may submit a bounded batch (maximum 50) of allowlisted event kinds and numeric/boolean dimensions. No free-form text, transcript, selected text, audio, provider body, persistent raw ID, or credential is accepted. Non-authoritative signal failure must not block or alter runtime success.

### `POST /product/v1/signals/feedback`

Explicit user feedback accepts rating/category plus optional bounded product note only when the UI clearly opts in. It never accepts audio/transcript/selected-text fields. Storage is bounded by retention policy and projected redacted to Control Room.

### Internal retained jobs (not public HTTP routes)

| Job | Owner | Trigger | Contract |
| --- | --- | --- | --- |
| `release-expired-reservations` | Runtime/Quota | local timer | idempotently release expired pre-dispatch reservations; no provider/network/content |
| `refresh-safe-projections` | Control Plane | local timer or startup | rebuild/verify server-safe derived projections from authoritative rows; no raw runtime content |
| `refresh-pricing` | Control Room/Engines | explicit admin command; timer only if separately configured | mocked/provider-free in D3; bounded external catalog request later requires existing secret/config gate; immutable redacted audit |
| `expire-auth-handoffs` | Auth | local timer | delete/expire hash-only OAuth/desktop handoff state |
| `prune-product-signals` | Signals | local timer | enforce bounded retention without touching audit or raw runtime content (which must not exist) |

Discord/support scanning is dropped. There is no usage-counter fetch/prewarm job. Each job takes a singleton/advisory lock, records only name/status/count/duration, and fails independently without executing a runtime provider call.

## 10. Privacy Sentinels And Contract Tests

Canonical and alias suites inject unique sentinels for:

- device/install/account IDs;
- OAuth state, claim proof, session/cookie/BFF/provider credentials;
- transcript, selected text, assistant input/output, prompt content;
- multipart audio bytes and boundary;
- provider error body and SQL exception text.

After every fixture the suite scans response failures, structured logs, audit details, DB tables/columns, generated reports, and test stdout/stderr. Raw-content sentinels may appear only in the authenticated runtime success body being asserted in-memory; they must be removed before report serialization. Credential/ID sentinels never appear in evidence. The suite also asserts JSON content type for handled failures, bounded response size, and absence of stack/SQL/provider details.

## 11. Rollback And Migration Behavior

- Before approved cutover, canonical APIs are local/provider-free targets only; production clients continue using the Cloudflare Worker.
- D2/D3 introduce canonical adapters and the aliases in `temporary-aliases.md`. Aliases adapt once into the same canonical core; they do not copy auth, quota, routing, privacy, or audit rules.
- No traffic mirroring, dual provider dispatch, or dual mutable authority is allowed. Alias/canonical comparison uses mocks.
- A failed local/canary migration routes the supported client/BFF back to the Worker while Cloudflare is authoritative. PostgreSQL remains non-authoritative and may be reimported.
- Alias removal requires its named tests green, consumer count zero for all supported releases, and Worker rollback no longer depending on that alias. Removal is a later explicit change, never D1.
- Cutover, post-write rollback, DNS/Tunnel, VPS, provider/OAuth real, import, deploy, and Worker retirement remain separately authorized phases.
