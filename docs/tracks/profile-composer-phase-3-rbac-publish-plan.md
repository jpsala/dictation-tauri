---
status: stable
created: 2026-07-14
updated: 2026-07-14
owner: JP/Pi
related:
  - docs/tracks/fixvox-admin-profile-composer.md
  - docs/DECISIONS.md
---

# Profile Composer Phase 3: preview, RBAC and safe publish

## Objective

Let authorized operators preview, publish and roll back typed Profile Composer versions from the Admin Web without exposing Worker credentials to the browser.

## Approved architecture

```text
Browser -> Admin Web server -> Worker
             | edit credential
             | publish credential
             + Google OAuth principal + server-side RBAC
```

- Google OAuth supplies a verified identity, never an authority decision by itself.
- Server-side roles are `viewer`, `editor`, `publisher` and `owner`.
- Bootstrap owner is configured server-side as `jpsala@gmail.com`; it is not a hardcoded browser rule.
- Only owners manage role bindings. The final owner cannot be removed or demoted.
- Browser code, responses, storage and logs never contain Worker credentials.
- Pi may explain and propose drafts, but never receives publish authority.

## Implementation status

Tasks 1-7 plus the consistency release debt are implemented localmente con TDD y ya están desplegados: Worker/DO y Admin Web Profile Composer operan con view/edit/publish separados; legacy ausente. Durable RBAC, Google principal authorization, pure preview, stale-safe publish/rollback, server-side broker/audit and Admin Web preview/role UI are present. The dedicated Durable Object is now the authoritative revision store, not only a lock around eventually consistent KV.

Evidence from this batch:

- Focused Worker suite (`control-plane-publish-lock`, store and managed execution): 88 passing, including marker-only/invalid/partial bootstrap rejection and first materialization from empty legacy KV.
- `npm run cloud:test`: 133 passing, including restart with stale KV, four crash boundaries, idempotent replay, invalid/partial projection rejection, immutable monotonic history, audit preservation and fail-closed recovery.
- `npm run test:pipeline`: 449 passing.
- `npm run build`: passing.
- Wrangler deploy dry-run passed with the configured Durable Object/KV bindings; no deploy or remote mutation occurred. Prior Admin Web smoke evidence remains at `artifacts/ui-spikes/admin-web-ui-smoke/20260714-140133/`.
- `node --test admin/fixvox-web/server.test.mjs`: 7 passing, including viewer/editor/stale OAuth `403`, no-mock Worker broker forwarding, and Pi credential isolation; both Admin Web `node --check` commands passed.
- `FIXVOX_ADMIN_SMOKE_PORT=8818 npm run admin:web:smoke`: passing at `artifacts/ui-spikes/admin-web-ui-smoke/20260714-140133/`; account/device target preview, typed diff/impact, cached pricing availability, typed publish, UI rollback, Accounts refresh, visible outcome/audit, redacted role bindings and Settings role controls.
- `admin/fixvox-web/server.mjs` keeps `ADMIN_API_KEY`/`ADMIN_PUBLISH_API_KEY` server-side; browser tests assert the publish credential is not forwarded to browser responses, and the Pi subprocess receives none of the Worker admin credentials.
- Effective account/device profile labels refresh from the active published version after publish/rollback; account and Admin env responses keep Google emails redacted.
- No provider call, microphone use, production mutation, deploy, commit or push occurred.

## Non-goals

- No deploy, production mutation, commit or push.
- No new dependency, provider call, microphone use or generic Overrides editor.
- No Phase 4 Pi drawer implementation.
- No production migration/deploy or binding rollout; the local Durable Object authority is the only supported profile mutation path. Provider calls, microphone use, generic Overrides, commit and push remain out of scope.

## TDD implementation order

1. **RBAC contract and store**
   - Add durable role bindings, owner bootstrap and last-owner invariant.
   - RED: unauthorized mutations and final-owner removal fail closed.
   - GREEN: owner-only role management with redacted records.

2. **OAuth principal and Admin Web authorization**
   - Map a verified, normalized Google email from the existing server session to a server-side role.
   - Require recent OAuth authentication for privileged actions.
   - RED: browser-provided email/role and stale session are rejected.

3. **Pure profile preview**
   - Add a read-only Worker preview service for a draft: typed section diff, validation/dependency warnings, affected account/device/group counts, selected account/device resolution and cached pricing status.
   - RED: preview makes zero KV writes, no provider calls and leaves published runtime unchanged.

4. **Stale-safe publish and rollback**
   - Require typed confirmation plus expected active/draft or target versions.
   - RED: mismatched/stale versions reject before a write.
   - Preserve immutable history and existing single-snapshot write behavior.

5. **Server-side privileged broker and audit**
   - Keep both Worker credentials only in Admin Web server environment.
   - Forward publish/rollback only after RBAC, recent OAuth and confirmation checks.
   - Persist an audit record: actor, action, profile, source/target versions, timestamp and result.

6. **Admin Web UI**
   - Add preview/diff/impact surface and Settings role management for owners.
   - Publish/rollback remain unavailable to viewer/editor roles.
   - Publisher receives visible preview, typed confirmation and outcome/audit state.

7. **Regression and smoke coverage**
   - Extend Worker, server and UI smoke coverage for authorization, preview non-mutation, stale rejection and no credential exposure.

## Frozen acceptance criteria

- No Worker credential is visible in browser JavaScript, responses or storage.
- Every role boundary returns `403` when unauthorized.
- Preview makes no writes and does not change published runtime.
- Preview reports typed diffs, impact counts, selected-target routing and explicit cached-pricing availability.
- A stale confirmation cannot publish or roll back.
- The last owner cannot be removed or demoted.
- Publish and rollback append immutable history and audit data.
- Existing edit-only draft flows still work.
- No provider call, microphone use, deploy, commit or push occurs.
- Profile snapshot mutations fail closed with `503` if the authority binding, recovery or projection is unavailable; stale confirmations return `409` before writes.

## Verification

```powershell
cd cloud/fixvox-proxy && bun test src/control-plane-publish-lock.test.ts src/control-plane-store.test.ts src/managed-execution.test.ts
npm run cloud:test
npm run test:pipeline
npm run build
FIXVOX_ADMIN_SMOKE_PORT=8818 npm run admin:web:smoke
node --check admin/fixvox-web/server.mjs
node --check admin/fixvox-web/public/app.js
git diff --check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

## Checkpoint 2026-07-14

Phase 3 is closed locally against the frozen acceptance criteria. The regression polish added in this checkpoint covers the gaps found during the matrix review:

- Accounts and device admin rows re-resolve the active published profile label after publish/rollback; the UI refreshes Accounts/effective-profile data without changing the active Configuration view.
- Preview resolves selected account/device targets, exposes draft routing, impact counts and cached pricing rows/availability, and remains write/provider-free.
- Worker/Admin Web tests cover viewer/editor/stale-OAuth `403`, the privileged broker's real HTTP forwarding path, browser credential isolation and Pi's stripped admin environment.
- Publish/rollback UI smoke covers exact typed confirmation, immutable history, visible outcome/audit state and refreshed effective Accounts.
- Raw Google emails are redacted in account/Admin env responses; raw subjects and Worker credentials remain server-side.
- `CONTROL_PLANE_PUBLISH_LOCKS` binds one fixed `ControlPlanePublishDurableObject` for the complete profile snapshot. Its Storage envelope owns revision, profile history/drafts, audit and the last confirmed operation; a per-profile object would still permit whole-snapshot lost updates.
- First activation bootstraps revision 0 once from existing KV. Each mutation is calculated against the authoritative envelope, writes a pending candidate transactionally, projects profile then audit, and commits profile/history/audit together in a Durable Object Storage transaction. A pre-commit crash aborts pending and restores the committed projection; a post-commit crash reprojects the committed authority on rehydration.
- Exact replay of the last confirmed operation returns the stored result with `x-fixvox-idempotent-replay: true`; a different request with stale expected versions returns `409`. Tests observed one history/audit append after restart and stale KV.
- KV remains a read projection. Profile and audit values carry the authority revision and `control:profiles:projection-commit:v1` is written only after both values and the Durable Object commit. Readers accept legacy bootstrap values or a value whose revision matches the marker; revision mismatch fails closed, and Admin profile/policy/audit/preview routes return sanitized `503`.
- Tests first failed against the KV-authoritative implementation, then passed for stale publish/rollback after rehydration, stale audit, crashes before projection/after profile/after both projections/after commit, projection failure, idempotent retry, immutable monotonic history and absent binding without direct fallback.

## Stable operational state and optional debt

- Checkpoint P 2026-07-14: Worker activo versión 151 / `4ce54e91-4e7c-4e1c-973c-579c72b7367a`, con migration/binding/clase correctos. View/edit/publish están presentes; legacy ausente. El draft autorizado de `pro` bootstrappeó el DO y materializó las tres proyecciones KV schema v1 con authority revision compartida.
- La Admin Web Profile Composer fue sincronizada al VPS y el servicio quedó activo. El servidor conserva edit + publish server-side, nunca legacy; Profiles/Audit devolvieron 200. Se detectó un hueco: drafts/preview no exigían rol Google. Edit fue retirado inmediatamente, el gate se corrigió y se añadió test viewer 403/editor 200; luego se restauró edit-only. Un fallback-token runtime devuelve 403 para draft. Tras login Google manual, Chrome confirmó rol `owner`; D1 creó `pro` draft v2 basado en published v1 con composición idéntica. La publicación posterior explícitamente autorizada promovió `pro` a published v2: historia 2, audit publish exitoso v1 -> v2, sin draft, y proyecciones schema v1 con authority revision consistente. Cierre read-only posterior: health/Profiles/Audit/Accounts/Devices 200, 6 devices asignados a `pro` y las 8 transcripciones `pro` posteriores son ejecución runtime normal, no llamadas de preview/publish. Tras autorización posterior, `jp` fue publicado v1 sin `postprocess`; su audit/history son únicos, sin draft ni rollback, y la account administrativa con su device activo resuelve `jp`. Se mantiene el equilibrio operativo: credenciales edit/publish sólo en Worker/Admin Web y fallback view-only. Ajuste desplegado y validado interactivamente: sesión Google verificada + RBAC permite draft/preview/lecturas; OAuth Google reciente permanece para publish/rollback y roles, con preview/confirmación/audit. Health y hash remoto verificados. Evidencia redacted: `C:/Users/jpsal/fixvox-rollout-evidence/20260714-profile-composer-post-publish-close/`.
- Mutations must route through the configured Worker binding. Direct store calls/out-of-band writers are unsupported and are no longer authoritative after bootstrap; rollout must establish the binding and bootstrap order before enabling mutations.
- Bootstrap now accepts only unrevisioned legacy KV when the authority object is absent. Marker-only, invalid, partial, or KV-only revisioned state fails closed; empty legacy KV does not create an audit-only marker before the first profile snapshot.
- KV can still serve an older fully confirmed revision because it is eventually consistent. A mixed/partial revision is rejected rather than interpreted; the global object remains a throughput bottleneck by design.
- The Durable Object behavior is proven by deterministic local rehydration/crash tests, Wrangler packaging and the deployed Cloudflare migration/first authorized draft+publish. A live multi-region stress exercise remains out of scope; future production mutations, deploys, commit and push remain separate approval gates.
- Bug post-rollout corregido: preflight y Devices omitían aplicar la definición publicada de un profile custom antes de resolver `quotaProfile`; `jp` declaraba `pro-unlimited` pero recibía fallback 20/120. Fix y regresión pasan focused Worker 88/cloud 133; Wrangler dry-run OK. Desplegado con autorización como Worker 153 / `27d27754-069a-4a5f-bcd4-348d1f5b13b8`; lectura posterior confirmó límites 1M/10M, sin audit/rollback adicional ni KV manual.
- Phase 4 Pi contextual drawer remains out of scope; Pi has no publish path.
- `bun scripts/agent-context-audit.ts` reports 0 errors and context-size warnings; these are documentación hygiene debt, not Phase 3 acceptance failures.

**Closure:** Phase 3 and its post-rollout fixes are stable. No implementation is required for current usage; optional Phase 4 or UX refinements must start from a concrete need.

## Reopening prompt (only if needed)

```text
Continuá el trabajo en C:/dev/dictation-tauri sobre el Profile Composer. Leé primero docs/.generated/context-index.md, docs/WORKING_MEMORY.md, docs/tracks/profile-composer-phase-3-rbac-publish-plan.md, docs/tracks/fixvox-admin-profile-composer.md y docs/tracks/profile-composer-cloudflare-rollout-plan.md. Worker 153/DO/Admin Web están desplegados; `pro` es Published v2 y `jp` Published v1 sin postprocess, con histories/audit consistentes. El preflight custom-profile quota fix está activo y `jp` resuelve 1M/10M. El cierre read-only está en `C:/Users/jpsal/fixvox-rollout-evidence/20260714-profile-composer-post-publish-close/`. Preservá el worktree sucio y no hagas deploy, provider calls de prueba, micrófono, commit ni push.

El modelo usa un único `ControlPlanePublishDurableObject` para toda la snapshot. Durable Object Storage conserva revisión autoritativa, perfiles/audit y último resultado idempotente; KV es proyección revisionada con marker confirmado. Direct store calls/out-of-band writers siguen unsupported. Las mutaciones futuras usan únicamente Admin Web con Google OAuth reciente, RBAC, preview/expected versions/confirmación tipada y audit; Pi nunca recibe publish authority.

Antes de cualquier cambio futuro, verificá el focused Worker suite, `npm run cloud:test`, `npm run test:pipeline`, `npm run build`, `node --test admin/fixvox-web/server.test.mjs`, `FIXVOX_ADMIN_SMOKE_PORT=8818 npm run admin:web:smoke`, los `node --check`, Wrangler dry-run, `git diff --check`, `bun scripts/context-index.ts` y `bun scripts/agent-context-audit.ts`. Terminá sin deploy, commit ni push.
```

Do not deploy, publish production profiles, commit or push without explicit approval. Preserve the accumulated working tree.
