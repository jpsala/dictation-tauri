---
status: complete
updated: 2026-07-17
batch: standard-product-ux-redesign-1
scope: docs-only
---

# First-Run State Machine

**Status:** Batch 1 contract; docs-only and provider-free.

This contract defines the visible first-use flow. It does not authorize OAuth, provider, schema, runtime, or production changes.

## Ownership and non-negotiable rules

- The **Tauri host** owns durable first-run state, browser handoff state, account/session material, device linking, permission probes, and host-backed shortcut operations.
- **React** renders only the redacted state projection and sends typed user intents. It never receives OAuth tokens, raw Google subject, raw account or device IDs, provider configuration, or policy snapshots.
- The **browser OAuth surface** owns Google interaction and returns only to a host-validated handoff.
- **Cloud** validates sessions, account authorization, device binding, and effective policy; it returns a redacted product projection.
- Every interactive state has exactly one visible primary action. Automatic progress states (`checking` and `account_linking`) have none. Secondary actions do not advance the happy path.
- A resumed installation restores the last safe state and its recovery context, never a browser token or raw identity. The last safe state is a versioned, host-owned redacted setup phase, not an arbitrary renderer route.

## States

| State | Entry trigger | Visible status | Primary action | Secondary action | Retry / persistence | Safe exit and redaction |
| --- | --- | --- | --- | --- | --- | --- |
| `checking` | App start or resume | `Preparando Dictation` | None; progress is automatic | `Salir` | Revalidates the versioned host phase on launch; persists no technical detail | Quit; no internal check names or IDs |
| `welcome` | No linked, usable account/device context | `Empezá a dictar con tu cuenta` | `Continuar con Google` | `Salir` | Persists that setup has begun | Quit; no account or device terminology |
| `oauth_handoff` | User starts sign-in | `Abrimos el navegador para iniciar sesión` | `Ya inicié sesión` | `Cancelar` | Durable opaque handoff reference only; user may retry after expiry | Return to `welcome`; no URL, state nonce, token, or provider detail |
| `account_linking` | Validated browser return | `Configurando tu cuenta` | None; progress is automatic | `Salir` | Idempotent account/device link; a partial or valid link survives restart and `checking` resumes the correct phase | Quit; no device ID, install ID, policy, or raw identity |
| `microphone_setup` | Account/device context is ready | `Configurá el micrófono` | `Permitir micrófono` | `Salir` | Permission result and chosen device preference are host-owned; incomplete setup resumes here | Quit with setup incomplete; no OS error payload |
| `shortcut_setup` | Microphone permission is granted | `Elegí cómo iniciar el dictado` | `Usar atajo recomendado` | `Cambiar atajo` | Host-owned shortcut preference survives restart | Continue to `ready`; no native registration internals |
| `ready` | Required account/device context plus initial setup complete | `Todo listo para dictar` | `Probar dictado` | `Abrir ajustes` | Durable ready marker; host revalidates context at a safe boundary | Settings or dock; no infrastructure status |
| `offline` | Required network operation cannot be reached | `No pudimos conectarnos` | `Reintentar` | `Volver` | Retry returns to the interrupted state; interruption reason is retained as a redacted category | `welcome` or the last completed setup step; no host, route, or raw error |
| `oauth_cancelled` | Browser reports cancellation | `No se completó el inicio de sesión` | `Intentar de nuevo` | `Volver` | Clears only the expired/cancelled handoff | `welcome`; no browser callback detail |
| `oauth_expired` | Handoff is expired or invalid | `La sesión de inicio venció` | `Iniciar sesión de nuevo` | `Volver` | Clears the stale handoff before a new attempt | `welcome`; no nonce/state value |
| `account_not_authorized` | Cloud rejects the signed-in account for product access | `Esta cuenta no tiene acceso a Dictation` | `Usar otra cuenta` | `Cerrar` | Does not mark the account as linked; a new browser handoff is allowed | `welcome` or quit; no role, allowlist, plan, or policy details |
| `binding_conflict` | Cloud rejects automatic device linking | `No pudimos preparar este dispositivo` | `Intentar de nuevo` | `Usar otra cuenta` | Keeps only a redacted conflict category; retry is idempotent | `welcome`; no existing device, account, or binding identifiers |
| `policy_unavailable` | Effective product context cannot be resolved | `El servicio no está disponible por ahora` | `Reintentar` | `Volver` | Retry re-fetches only the redacted context projection | `welcome` or last safe completed step; no policy/preflight/runtime data |
| `microphone_denied` | OS permission is denied | `Necesitamos acceso al micrófono para dictar` | `Abrir permisos` | `Salir` | Host re-checks after the OS settings return; incomplete setup resumes at `microphone_setup` | Quit with setup incomplete; no native error payload |
| `service_unavailable` | A non-policy temporary service failure occurs | `El servicio está temporalmente no disponible` | `Reintentar` | `Volver` | Retry resumes the interrupted state; no automatic unbounded retry | Last safe state; no provider, route, or raw error |

## Allowed transitions

```text
checking -> welcome | oauth_handoff | oauth_cancelled | oauth_expired | account_linking | microphone_setup | shortcut_setup | ready | offline | service_unavailable
welcome -> oauth_handoff
oauth_handoff -> account_linking | oauth_cancelled | oauth_expired | offline
account_linking -> microphone_setup | account_not_authorized | binding_conflict | policy_unavailable | service_unavailable
microphone_setup -> shortcut_setup | microphone_denied
microphone_denied -> microphone_setup
shortcut_setup -> ready
ready -> microphone_setup | shortcut_setup | offline | policy_unavailable | service_unavailable
any recoverable error -> its interrupted safe state | welcome
```

`account_linking` may not transition directly to `ready`: microphone permission and shortcut setup must be explicitly completed. Exiting preserves the incomplete host-owned phase; it never creates a limited or false `ready` state.

## Resume and recovery rules

1. The host records a versioned, redacted setup phase plus an opaque handoff reference when needed.
2. On restart, `checking` validates the persisted phase before React renders a route.
3. Invalid, expired, or unverifiable state becomes the matching redacted recovery state, never a technical failure screen.
4. `Cancelar` clears only the in-progress browser handoff. `Salir` never destroys a valid or partial linked context; `checking` revalidates it and resumes the correct host-owned phase.
5. Automatic linking is idempotent. A conflict is recoverable through retry or changing account; the normal path never exposes a repair action.

## Telemetry contract

Allowed signals are bounded counters/state categories only: entry state, completed step, redacted failure category, retry count capped per attempt, cancellation, and ready completion. They exclude tokens, raw subject/account/device identifiers, audio, transcript, selected text, browser URLs, policy snapshots, and raw error payloads.

## Acceptance assertions

- A fixture-driven clean install can reach `ready` without OAuth or a provider.
- The normal sequence is `welcome → oauth_handoff → account_linking → microphone_setup → shortcut_setup → ready`.
- No normal state exposes `deviceId`, `installId`, policy, preflight, host-owned, runtime, route, provider, token, or raw error text.
- Every interactive alternative state has exactly one primary action and a safe exit; automatic progress states have no primary action.
