---
status: complete
updated: 2026-07-17
batch: standard-product-ux-redesign-1
scope: docs-only
---

# Surface Boundaries

**Status:** Batch 1 contract; docs-only and provider-free.

## Product split

| Surface | User and job | Normal navigation | Must not appear in the normal path |
| --- | --- | --- | --- |
| First run / Desktop | A person starts using dictation safely | Welcome, account handoff, microphone, shortcut, ready | Device IDs, policy snapshots, preflight, runtime routes, provider/model, repair internals |
| Settings | A signed-in person configures their desktop app and account | General, Cuenta, Dictado, Atajos, Presets, Privacidad, Ayuda, Avanzado | Operator configuration, raw account/device IDs, backend entities, ordinary `Cloud` section |
| Dock | A person starts, observes, stops, or recovers a dictation | Compact state/action surface only | Onboarding wizard, account administration, Control Room navigation |
| Control Room | An authorized operator manages people, product behavior, usage, and system configuration | Personas, Planes y acceso, Comportamiento, Uso, Sistema avanzado, Auditoría | End-user settings, normal desktop setup, raw user content, Pi as primary navigation |

## Ownership table

| Capability | React renderer | Tauri host | Browser OAuth | Cloud | Control Room |
| --- | --- | --- | --- | --- | --- |
| Render first-run state and copy | Renders redacted projection; emits typed intent | Supplies projection | — | Supplies validated product context | — |
| Browser sign-in handoff | Shows progress and return state only | Creates/validates opaque handoff; receives result | Conducts Google interaction | Validates server session/account | — |
| Account/device link | Shows automatic progress/recovery | Performs idempotent host flow | — | Authorizes and binds; returns redacted result | View/manage only through operator domain |
| Microphone and shortcut | Renders controls/status | OS permissions, devices, recorder, registration, persistence | — | — | — |
| Effective product capability | Renders product-safe result | Requests projection | — | Is authoritative and fails closed | Configures policy through guarded operator APIs |
| Account self-service | Renders redacted identity, plan, devices and logout | Stores only host-safe state | Reauthentication when required | Authoritative account/session operations | — |
| Operator administration | May only show a capability-gated Control Room entry | Opens authenticated browser; never carries admin credentials | Authenticated browser session | BFF/backend authority | Owns task-oriented operator UI and guarded mutations |
| Diagnostics | Renders redacted, user-triggered Advanced view | Collects safe host diagnostics | — | Returns safe status only | Owns detailed system/operator diagnostics |

## Renderer projection contract

React may receive only the minimum fields needed to render the current task:

- versioned setup phase;
- display-safe or masked identity, never raw identity keys;
- human plan label and comprehensible limit summary;
- capability booleans used for visibility or affordances, never the policy document that produced them;
- microphone permission category and selected-device display label;
- shortcut display label, registration status category, and conflict category;
- redacted failure category, retry availability, and progress status.

The projection must not contain OAuth tokens, raw Google subject, raw account/device/install IDs, secrets, policy snapshots, preflight payloads, route/host names, provider/model routing, raw errors, browser callback details, audio, transcript, selected text, or operator credentials. React renders the projection but never treats capability booleans as authorization; the host and Cloud enforce every protected operation again.

## Desktop Settings information architecture

- **General:** startup, dock, and ordinary desktop behavior.
- **Cuenta:** redacted identity, comprehensible plan/limits, device list, and logout.
- **Dictado:** microphone, audio, auto-stop, cues, and delivery behavior.
- **Atajos:** host-owned recorder and conflict recovery.
- **Presets:** product presets and capability-gated controls.
- **Privacidad:** local history, clear-history action, and understandable data treatment.
- **Ayuda:** health in human terms, guided troubleshooting, and documentation.
- **Avanzado:** redacted diagnostics, safely copied diagnostic report, and the Control Room entry only when the user has administrative capability.

`Cloud` is not a normal Settings section. A failed normal account/session flow remains in the first-run recovery state rather than becoming a Settings repair panel.

## Control Room information architecture

- **Personas:** accounts, devices, and effective access.
- **Planes y acceso:** capabilities, limits, groups, and assignments.
- **Comportamiento:** dictation, postprocess, selection, assistant, and presets as product behavior.
- **Uso:** bounded/redacted consumption, costs, quotas, and operational failures.
- **Sistema avanzado:** engines, prompts, health, and technical configuration.
- **Auditoría:** sensitive mutation history and evidence.

Control Room is a browser product for operators. It retains Google authentication, RBAC, recent-auth, preview, confirmation, audit, and fail-closed behavior. Pi is a contextual `Analizar con Pi` / `Explicar con Pi` action inside an authorized entity, never a top-level navigation destination or an implicit mutation authority.

## Redaction policy by surface

| Data category | Desktop normal | Settings normal | Settings Advanced | Control Room |
| --- | --- | --- | --- | --- |
| OAuth tokens, raw Google subject, secrets | Never | Never | Never | Never exposed to browser/Pi |
| Raw account/device/install IDs | Never | Never | Abbreviated only if needed for safe diagnostics | Only when operationally necessary and authorized |
| Policy/runtime/preflight/provider details | Never | Never | Redacted diagnostic summary | System advanced only, capability-gated |
| Audio, transcript, selected text | Never by default | Never by default | Never | Never in ordinary lists/audit |
| Errors | Human recovery copy | Human recovery copy | Redacted technical category | Redacted operator detail with audit rules |

## Contract boundary with D-R2

D-R2 must provide product-owned typed operations that serve these visible flows: a host-safe desktop bootstrap/session/context projection; an authenticated, idempotent account/device link; a redacted effective capability projection; typed transcription/actions; and Control Room domain APIs behind the stable browser BFF. Existing Worker paths remain aliases only where the route-disposition contract names a current consumer and retirement condition.

D-R2 must not make React depend on a token, raw identifier, policy snapshot, preflight endpoint, generic chat contract, or provider/model selection. If a required flow cannot be represented with the stated typed product contracts, stop for a new API decision rather than restoring legacy UI terminology.
