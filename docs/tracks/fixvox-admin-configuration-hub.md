---
status: complete
started: 2026-07-14
updated: 2026-07-20
priority: high
owner: JP/Pi
topic: fixvox-admin-configuration-hub
related:
  - docs/tracks/fixvox-admin-web-pi-chat.md
  - docs/tracks/settings-window-and-ui-foundation.md
source_refs:
  - admin/fixvox-web/public/app.js
  - admin/fixvox-web/public/styles.css
  - cloud/fixvox-proxy/src/control-plane-store.ts
---

# Fixvox Admin Configuration Hub

Status: first slice deployed and verified in production

## Objective

Replace the current all-in-one Profiles route with a Configuration hub and a reliable, read-only Profiles list-detail first slice.

## Decisions

- Primary IA: Overview, Users, Configuration, Usage, System.
- Configuration subpages: Profiles, Engines, Prompts, Presets, Overrides.
- Pi becomes a contextual drawer later; the first slice only removes the persistent rail from Configuration.
- Profiles composes resources. It does not mount full engine, prompt or override editors.
- Production remains unchanged until a separate deploy approval.

## Non-goals

- No deploy or production mutation.
- No profile mutation endpoint in this slice.
- No full Pi drawer implementation.
- No catalog table redesign beyond separating existing catalog renderers into dedicated tabs.
- No new dependency.

## First Slice

1. Add a safe `profileOptions` contract to the Control Plane policy admin response.
2. Expose profile id, label, source, product capabilities and profile assignment names only.
3. Rename the sidebar destination to Configuration and add secondary tabs.
4. Make Profiles the default tab with list-detail summaries for Overview, Access, Runtime and Limits.
5. Remove the fake `Guardar draft local` flow and do not mount catalog controls on Profiles.
6. Reuse existing Engines, Prompts, Presets and Overrides renderers only in their matching tab.
7. Hide the empty Pi activity rail on Configuration.

## Acceptance Criteria

- Production-like policy data renders `alpha-basic`, `alpha-full`, `power-admin` and `pro`; no `Sin profiles` fallback when profiles exist.
- Profiles does not render engine, prompt, preset or override catalog cards.
- Profiles presents no capability checkboxes or fake local-save action.
- Configuration exposes Profiles, Engines, Prompts, Presets and Overrides tabs.
- Switching tabs mounts only the selected catalog.
- Profiles shows assignment, access, runtime and limit summaries read-only.
- Focused tests, full Cloud tests, Admin mock smoke, frontend build and `git diff --check` pass.
- Local browser evidence is stored under `artifacts/admin-web-ux-audit/`.

## Risks and Guardrails

- Preserve the accumulated working tree; do not revert unrelated changes.
- Keep secrets, account identifiers and prompt bodies out of new profile summaries.
- Preserve existing production confirmation for real catalog mutations.
- Keep existing endpoints compatible; add `profileOptions` rather than changing account `policyOptions`.
- Do not publish, commit or push without explicit approval.

## Rollback

The slice is reversible by removing `profileOptions`, restoring the prior Profiles renderer and reverting the new Configuration tab styles/tests. No storage migration is introduced.

## Validation

Completed 2026-07-14:

- `cd cloud/fixvox-proxy && bun test src/control-plane-store.test.ts src/managed-execution.test.ts`: 54 pass.
- `npm run cloud:test`: 99 pass.
- `npm run test:pipeline`: 446 pass after the Overrides simplification.
- `npm run build`: pass.
- `FIXVOX_ADMIN_SMOKE_PORT=8809 npm run admin:web:smoke`: pass, including Configuration tab isolation and read-only Profiles.
- Screenshot: `artifacts/ui-spikes/admin-web-ui-smoke/20260714-005623/fixvox-admin-configuration-profiles.png`.

Port 8807 was already occupied by an unrelated local process returning 404, so the smoke used the supported `FIXVOX_ADMIN_SMOKE_PORT` override. No process was killed.

## Result

- Control Plane policy responses now expose safe `profileOptions` with capabilities and assignment profile names.
- Configuration has separate Profiles, Engines, Prompts and Presets tabs; the premature Overrides editor is hidden.
- Profiles is list-detail and read-only, with Summary, Access, Runtime and Limits.
- Catalogs mount only on their selected tab; Profiles no longer creates hundreds of hidden controls.
- The fake `Guardar draft local` action and local-only capability editor were removed.
- The Pi activity rail is hidden on Configuration; the contextual drawer remains a later slice.
- Production deployment is recorded below.

## Deployment 2026-07-14

JP approved deployment after reviewing the local screenshot.

- Worker version: `89ac13c1-6f30-4478-9670-ba54abe84cf7`, 100% production traffic.
- Previous Worker version for rollback: `3caacc64-279f-4209-b4ac-6be9df78e82d`.
- Admin Web backup: `/home/jpsal/.local/state/fixvox-admin-backups/configuration-hub-20260714-010506`.
- Synced only `admin/fixvox-web/server.mjs`, `admin/fixvox-web/public/app.js`, and `admin/fixvox-web/public/styles.css`; restarted `fixvox-admin-web.service`.
- Worker health, local Admin health and public `/healthz` passed.
- Google re-login was completed through the authorized Chrome flow after the service restart invalidated the in-memory session.
- Chrome production verification found five profiles (`alpha-basic`, `alpha-full`, `alpha-private`, `power-admin`, `pro`), Summary/Access/Runtime/Limits, isolated catalog tabs, no fake draft save and no console errors.
- No profile, account, engine, prompt, preset, override or budget mutation was performed during verification.

## Overrides simplification 2026-07-14

JP agreed that the one-template-per-override editor had little practical utility and mixed audiences with behavior deltas.

- Removed Overrides from Configuration and removed account override mutation controls from Users.
- Kept Groups as the visible targeting/audience surface.
- Existing assigned override effects remain visible read-only in effective settings; Cloud storage and endpoints remain intact.
- Local validation: 446 pipeline tests, build and Admin smoke passed; evidence `artifacts/ui-spikes/admin-web-ui-smoke/20260714-015650/`.
- JP approved publishing only `admin/fixvox-web/public/app.js`; no Worker deploy, service restart or data migration occurred.
- Remote backup: `/home/jpsal/.local/state/fixvox-admin-backups/hide-overrides-20260714-020057`.
- Production asset SHA-256 matches local: `0dc3e5d105a478429c7ddfbbf2d6368a8cb890f68c461860ca57623cd33cb9b1`.
- Chrome verified tabs `Profiles`, `Engines`, `Prompts`, `Presets`; Users retains Groups and has zero legacy override mutation controls; console and captured requests were clean.

## Next Track

JP approved the versioned Profile Composer direction for implementation in a new session. Continue from `docs/tracks/fixvox-admin-profile-composer.md`; do not reopen the generic Overrides design.
