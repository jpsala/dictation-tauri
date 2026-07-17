---
status: stable
started: 2026-07-14
updated: 2026-07-14 (stable closeout)
priority: normal
owner: JP/Pi
topic: fixvox-admin-profile-composer
related:
  - docs/tracks/fixvox-admin-configuration-hub.md
  - docs/tracks/settings-window-and-ui-foundation.md
  - docs/topics/backend-and-model-routing.md
source_refs:
  - admin/fixvox-web/public/app.js
  - admin/fixvox-web/server.mjs
  - cloud/fixvox-proxy/src/control-plane-store.ts
  - cloud/fixvox-proxy/src/index.ts
---

# Fixvox Admin Profile Composer

## Status

Phases 1-3 están completas y estables en producción con Worker 153 / `27d27754-069a-4a5f-bcd4-348d1f5b13b8`. View/edit/publish permanecen separados y server-side; legacy ausente, fallback view-only, draft/preview con sesión Google+RBAC y publish/rollback/roles con OAuth reciente. `pro` está Published v2; `jp` está Published v1 sin `postprocess` y asignado a la account/device de JP. DO/KV projections, histories y audit son consistentes; el fix de cuotas custom resuelve `pro-unlimited` 1M/10M y pasó live dictation sin postprocess. No queda implementación necesaria para el uso actual; reabrir sólo ante una necesidad concreta o fallo reproducible. Evidencia y guardrails: `docs/tracks/profile-composer-phase-3-rbac-publish-plan.md` y `docs/tracks/profile-composer-cloudflare-rollout-plan.md`.

## Objective

Turn Profiles into the server-authoritative composition surface for access, runtime, limits and user-facing controls without reintroducing generic Overrides or mixing resource catalogs into Profiles.

## Product Decision

A profile is a typed, versioned composition of existing resources:

```text
Profile
├─ Access          capabilities enabled for the profile
├─ Runtime         engine + prompt selected per operation
├─ Limits          quotas and budgets
├─ User controls   hidden | visible-locked | editable per setting
└─ Defaults        initial user settings
```

Profiles use `draft -> preview -> publish`; production is never edited directly. Published versions are immutable and rollbackable. New profiles are normally created by cloning an existing profile.

## Authority And Resolution

```text
Group   -> selects a Profile
Account -> may select a Profile or override its budget
Device  -> exceptional operational override
Profile -> composes Access + Runtime + Limits + User Controls + Defaults
```

- Provider/model definitions stay in Engines.
- Prompt content stays in Prompts.
- Profiles reference engine and prompt IDs; they do not duplicate those resources.
- Generic Overrides remain hidden. Existing legacy values remain stored and read-only until an explicit migration/removal decision.
- Pi may explain profiles, compare versions or propose a draft. Pi cannot publish.

## Profile Contract

The durable contract should be typed rather than an arbitrary JSON patch:

```ts
type ProfileDefinition = {
  profileId: string;
  label: string;
  version: number;
  status: "draft" | "published" | "archived";
  basedOnVersion?: number;
  access: {
    capabilities: FixvoxProductCapability[];
  };
  runtime: {
    transcription: { engineId: string; promptId?: string };
    postprocess: { engineId: string; promptId?: string };
    selectionTransform: { engineId: string; promptId?: string };
  };
  limits: {
    dailyUsd?: number;
    monthlyUsd?: number;
    mode: "block" | "warn";
    quotaProfile?: string;
  };
  userControls: Record<string, "hidden" | "visible-locked" | "editable">;
  defaults: Record<string, unknown>;
};
```

The implementation may refine field names after tracing the existing runtime-policy/profile stores, but must preserve these typed domains and avoid creating a second competing source of truth.

## Composer UX

Profiles remains list-detail. Selecting a profile opens:

```text
Profile name · Published vN                         [Edit]

Overview | Access | Runtime | Limits | User controls

[Clone] [Compare]                       [Edit / Create draft]
```

Editing opens a draft with a persistent action bar:

```text
[Discard] [Save draft] [Preview as user] [Publish]
```

### Overview

- Published/draft status and version.
- Internal composition IDs.
- Assigned account/device counts.
- Last publication and author.
- Clone, compare and rollback entry points.

### Access

- Capability groups by product domain.
- Dependency validation, for example managed post-process requires `postprocess` and `managed_llm`.
- No raw free-form capability strings.

### Runtime

One row per operation:

```text
Operation             Engine                 Prompt
Transcription         Whisper Turbo          Transcript Base
Post-process          Kimi K2                Post-process v2
Selection transform   GPT OSS 20B            Selection Base
```

The editor selects named resources. Provider/model fields and prompt bodies remain in their own catalogs.

### Limits

- Daily/monthly budget and `block|warn` mode.
- Quota profile and operation limits when supported by the effective runtime contract.
- Clear inherited/effective values.

### User Controls

Every supported user setting has one explicit state:

- `hidden`: user cannot see it.
- `visible-locked`: user sees the effective value but cannot change it.
- `editable`: user may change their personal value.

### Preview And Publish

Before publish, show:

- exact before/after diff;
- validation errors and dependency warnings;
- affected accounts/devices/groups;
- resolved preview for a selected account/device;
- estimated cost/routing impact where pricing data exists.

Publishing creates the next immutable version atomically. Rollback republishes a previous version as a new active version; it does not rewrite history.

## Implementation Phases

### Phase 1 - Durable Profile Versions (complete locally)

- Traced and reused the current policy/profile, Engines, Prompts and budget stores.
- Added the typed `ProfileDefinition` v1 contract plus durable single-key persistence at `control:profiles:v1`.
- Seeded built-ins from effective current selections, capabilities, quota refs and defaults without changing their behavior.
- Added authenticated read/create-draft/save-draft/publish/rollback endpoints.
- Split Worker authorization into view/edit/publish credentials; legacy `ADMIN_API_KEY` is edit-only and Admin Web has no publish route.
- Added contract tests for validation, single-key publish visibility, immutable history, clone and rollback.
- Added a minimum Admin Web vertical slice that renders published/draft state and persists runtime draft edits through Admin Web -> Worker.

### Phase 2 - Composer Draft UI (complete locally)

- Added Overview, Access, Runtime, Limits and User Controls tabs.
- User Controls exposes every supported setting with its explicit visibility state and an optional typed primitive default.
- Added Clone and Edit/Create draft. Clones stay drafts and do not expose publish controls.
- Each section saves through Admin Web -> Worker; no browser-memory fake saves.
- Kept Engines/Prompts/Presets as separate Configuration resources.

### Phase 3 - Impact Preview And Safe Publish (complete locally)

- Durable role bindings live under `control:admin-roles:v1`; principals are hashed, responses are redacted, bootstrap owner is normalized server-side, and the final owner is protected.
- Admin Web maps recent verified Google OAuth sessions to `viewer`, `editor`, `publisher` or `owner`; browser-provided role/email authority is ignored for privileged actions.
- Pure draft preview resolves typed diff, dependency warnings, account/device/group impact, selected account/device routing, cached pricing rows and explicit availability without KV writes or provider calls.
- Publish/rollback require expected versions and exact typed confirmation; stale requests return `409` before profile history writes.
- Admin Web brokers privileged mutations with `ADMIN_PUBLISH_API_KEY` kept server-side. Successful publish/rollback append immutable history and `control:admin-audit:v1` records.
- Admin Web exposes Preview/Diff/Impact, typed publish/rollback guards, visible outcome/audit state and owner-only Settings role management; viewer/editor roles have no mutation controls.
- Accounts and device admin rows re-resolve the active published profile label after publish/rollback; raw Google emails are removed from Worker/Admin Web responses and the Pi subprocess receives no Worker admin credentials.
- Profile draft create/save, publish and rollback run through one fixed `CONTROL_PLANE_PUBLISH_LOCKS` object for the complete snapshot. Its Durable Object Storage envelope owns the monotonic revision, profiles/history/drafts, audit and last confirmed operation; expected versions are validated against that envelope, never against KV.
- Bootstrap imports legacy KV once at revision 0. A pending candidate is stored transactionally, profile and audit are projected with the candidate revision, then profile/history/audit commit logically in one Durable Object transaction. Pre-commit recovery aborts pending; post-commit recovery reprojects committed authority. Exact last-operation replay is idempotent; different stale requests return `409`.
- KV remains a two-value read projection plus `control:profiles:projection-commit:v1`. Readers require the value revision to match the marker, so mixed revisions fail closed; Admin reads return sanitized `503`. Binding absence also returns `503` with no direct store fallback.
- Production rollout is deployed and its authorized `pro` v2 publication is closed read-only; detailed evidence is in `docs/tracks/profile-composer-phase-3-rbac-publish-plan.md`.

### Phase 4 - Contextual Pi Drawer

- Pi can explain the active section, compare versions and propose draft changes.
- Every proposal becomes a visible typed diff.
- Pi has no direct publish credential or hidden mutation path.

## Stable Closeout

Checkpoint post-publicación 2026-07-14: `fixvox-admin-web.service` ejecuta el bundle local sincronizado. El primer intento E reveló que drafts/preview carecían de guardia de rol; edit fue retirado de inmediato, el servidor se corrigió con test de regresión y se reactivó sólo tras obtener fallback-token draft 403. Chrome autenticado creó el draft `pro` v2 sin cambios; P configuró publish, verificó preview diff 0 y, con autorización explícita posterior, publicó `pro` v2. El cierre read-only confirmó DO/proyecciones schema v1 consistentes, published v2 sin draft, historia 2 y audit único publish v1 -> v2 para `pro`; las 8 transcripciones `pro` posteriores son tráfico runtime normal, no provider calls provocadas por Publish. Tras autorización posterior, `jp` fue publicado v1 sin capability `postprocess`, sin draft ni rollback, y la account administrativa con su device activo resuelve `jp`; `pro` conserva sus 6 devices asignados. Mantener edit/publish sólo server-side y fallback view-only. Ajuste desplegado y validado interactivamente: sesión Google verificada + RBAC permite draft/preview/lecturas; OAuth Google reciente queda para publish/rollback y roles, con preview/confirmación/audit. Health y hash remoto verificados. El primer dictado con `jp` expuso una brecha Worker: preflight/Devices omitían la definición publicada al resolver cuotas, por lo que `pro-unlimited` caía a fallback 20/120. Fix y regresión custom profile pasan focused Worker 88/cloud 133 y Wrangler dry-run; desplegado con autorización como Worker 153 / `27d27754-069a-4a5f-bcd4-348d1f5b13b8`. Lectura posterior confirmó límites 1M/10M para `jp`, sin audit/rollback adicional ni KV manual. Evidencia redacted: `C:/Users/jpsal/fixvox-rollout-evidence/20260714-profile-composer-post-publish-close/`.

Phase 3 acceptance and the local consistency debt are closed by deterministic tests. Mutations must route through the configured Worker binding; direct store calls/out-of-band writers are unsupported and non-authoritative after bootstrap. Bootstrap rejects marker-only, invalid, partial, or KV-only revisioned state; an empty legacy KV snapshot materializes through the authorized mutation path without creating an audit-only marker. KV may serve an older confirmed revision or fail closed on a mixed revision, and the global object remains a throughput boundary. Cloudflare migration/activation and the first authorized draft/publish are deployed and read-only verified; the executable, redacted operational gate is `docs/tracks/profile-composer-cloudflare-rollout-plan.md`. Phase 4 remains out of scope and Pi must never receive publish authority.

## Phase 1-3 Evidence

- Focused Worker suite: 88 passing, including marker-only/invalid/partial bootstrap rejection and first materialization from empty legacy KV.
- `npm run cloud:test`: 133 passing, including restart against stale KV, stale audit, four crash boundaries, idempotent retry, projection failure, invalid/partial-read rejection and monotonic immutable history.
- `npm run test:pipeline`: 449 passing.
- `npm run build`: passing.
- `node --test admin/fixvox-web/server.test.mjs`: 7 passing, including viewer/editor/stale OAuth `403`, no-mock Worker broker forwarding and Pi credential isolation.
- `FIXVOX_ADMIN_SMOKE_PORT=8818 npm run admin:web:smoke`: passing at `artifacts/ui-spikes/admin-web-ui-smoke/20260714-140133/`, including account/device target preview, cached pricing availability, typed publish, UI rollback, Accounts refresh, visible outcome/audit, redacted role bindings and Settings role controls.
- Visual artifact: `artifacts/ui-spikes/admin-web-ui-smoke/20260714-140133/fixvox-admin-configuration-profiles.png`.
- Draft tests prove engine, prompt, access, defaults and user controls remain on the active published version until publish.
- Published clones can be assigned to devices/accounts/groups and resolve through runtime.
- Engine/prompt deletion fails while a draft or any published history version references the resource.
- Direct legacy profile engine/budget mutation endpoints return `409 profile_composer_required`.
- Preview tests confirm zero KV writes, target routing and cached pricing lookup; mutation tests confirm stale rejection before writes and immutable history/audit append.
- Consistency scope: one fixed `ControlPlanePublishDurableObject` owns the complete authoritative revision because a per-profile object would allow whole-snapshot lost updates. Profile/history/audit commit in Durable Object Storage; the two KV values are revisioned projections exposed only after their shared commit marker.
- Admin server: 7 passing; both Admin Web `node --check` commands passed; prior Admin Web smoke artifact remains at `artifacts/ui-spikes/admin-web-ui-smoke/20260714-140133/`.
- Wrangler deploy dry-run passed with the configured Durable Object/KV bindings; its review output was removed.
- No provider call, microphone use, production mutation, deploy, commit or push occurred.

## Acceptance Criteria

- Profiles have durable draft and immutable published versions.
- Built-in profiles retain their current effective behavior after seeding.
- Editing never mutates the active production version.
- Clone creates a new draft with a new profile ID.
- Access/runtime/limits/user-controls/defaults are typed and validated.
- Drafts reference existing engines/prompts by ID.
- Preview returns a deterministic effective profile without provider calls.
- Publish shows impact, requires authorization and updates atomically.
- Rollback preserves history.
- View, edit and publish permissions are distinct and enforced by Worker.
- No generic Overrides editor returns.
- Focused tests, full Cloud tests, Admin smoke, build and context audit pass.

## Guardrails

- No production mutation, deploy, commit or push without JP approval.
- No secrets, tokens, raw Google subjects or account IDs in profile payloads.
- No new dependency unless explicitly authorized.
- Do not duplicate Engines or Prompts inside Profile storage.
- Do not expose provider/model selection to ordinary users.
- Do not migrate or delete legacy override data in this track.
- Preserve the accumulated working tree.

## Verification Commands

```powershell
cd cloud/fixvox-proxy && bun test src/control-plane-publish-lock.test.ts src/control-plane-store.test.ts src/managed-execution.test.ts
npm run cloud:test
npm run test:pipeline
npm run build
npm run admin:web:smoke
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
git diff --check
```
