---
status: complete
updated: 2026-07-17
batch: standard-product-ux-redesign-1
scope: docs-only
---

# Acceptance Matrix

**Status:** Batch 1 contract; docs-only and provider-free.

## First-run and recovery matrix

| Scenario | Fixture trigger | Expected visible state and action | Persistence / safety assertion |
| --- | --- | --- | --- |
| Clean installation | No valid setup context | Welcome with `Continuar con Google` | No technical error or identifier is shown |
| Successful fixture handoff | Valid opaque browser return | Automatic account linking, then microphone setup | React sees only redacted projection; no token/raw subject |
| Automatic device link | Valid account plus unlinked device fixture | Progress then microphone setup; automatic state has no primary CTA | Link is idempotent; exit preserves partial/valid context and normal UX has no Repair/Refresh |
| Restart during handoff | Persisted opaque handoff | Checking, then handoff or redacted expiry recovery | No callback/token detail persists in renderer |
| OAuth cancellation | Cancellation fixture | `No se completó…`; `Intentar de nuevo` | Return to Welcome is safe |
| OAuth expiry | Expired handoff fixture | `La sesión… venció`; re-auth CTA | Stale handoff is cleared |
| Unauthorized account | Authorization denial fixture | `Esta cuenta no tiene acceso…`; other-account CTA | No role/policy/allowlist detail leaks |
| Binding conflict | Link conflict fixture | `No pudimos preparar…`; retry or other-account CTA | No existing account/device identity leaks |
| Policy unavailable | Product-context unavailable fixture | Temporary-service recovery | No policy/preflight/runtime terminology leaks |
| Offline | Network unavailable fixture | Connection recovery and safe back action | Retry only repeats the interrupted operation |
| Microphone granted | Permission grant fixture | Shortcut setup | Host owns permission and selected device preference |
| Microphone denied | Permission denial fixture | `Abrir permisos` or safe exit | Setup remains incomplete and resumes at microphone setup; `ready` is unreachable without permission |
| Recommended shortcut | Granted microphone plus host shortcut fixture | Ready state | Shortcut registration detail remains host-owned |
| Service unavailable | Temporary failure fixture | Retry and back action | No provider/model/raw upstream detail leaks |
| Ready | All provider-free fixtures successful | `Todo listo para dictar` | User can open settings or guided fixture test |

## Boundary and security matrix

| Requirement | Acceptance criterion |
| --- | --- |
| Desktop/Control Room separation | Settings includes only a capability-gated Control Room entry; Control Room is not embedded as ordinary Settings content. |
| React trust boundary | React receives only the redacted projection fields named in `surface-boundaries.md`; no OAuth token, raw Google subject, raw account/device ID, secret, policy snapshot, preflight data, provider/model routing, route, raw error, audio, transcript, or selected text reaches it. |
| Browser trust boundary | Browser OAuth is host-initiated/validated; the app displays only progress and redacted outcome. |
| Cloud authority | Account authorization, device binding, capability, and policy resolution fail closed and return redacted product categories. |
| Control Room safeguards | RBAC, recent-auth, preview, confirmation, audit, and server-side credentials remain mandatory for sensitive operator actions. |
| Alias compatibility | D-R2 preserves only aliases with a documented consumer and retirement condition from `product-route-disposition.md`. |
| Product API reconciliation | Bootstrap/session/context, link, capability, transcription/action, and Control Room domain APIs serve the visible contract without legacy UI terms or generic chat authority in the renderer. |

## Visual and accessibility matrix

| Requirement | Acceptance criterion |
| --- | --- |
| Primary action | Each interactive state has exactly one primary CTA; automatic `checking` and `account_linking` states have none. At most two secondary actions serve explicit safe purposes. |
| Spanish-first | No mixed Spanish/English normal experience; technical English is only inside explicit advanced diagnostics. |
| Typography | Functional text is at least 13–14 px and line-height is at least 1.35. |
| Accessibility | Keyboard complete, visible focus, WCAG 2.2 AA contrast target, status not color-only, and reduced motion respected. |
| Desktop fit | First-run and Settings fit target Tauri windows without clipping, accidental scroll, or reliance on browser-only layout. |
| Privacy | Normal surfaces contain no raw sensitive content or infrastructure identifiers; diagnostics are redacted and opt-in. |
| Future visual gates | Batch 2 requires wireflows/wireframes and Impeccable review; durable UI batches require real Tauri and browser screenshots. |

## Batch-1 completion gate

Batch 1 is complete only when the four contracts agree on state names, copy, owner, persistence, redaction, recovery, and acceptance; microphone permission and shortcut setup are both required for `ready`; `PRODUCT.md` and `DESIGN.md` reflect account-first and operator separation; D-R2 reconciliation is explicit; and the documentation checks pass.

Stop and report rather than extend the batch if a state has no safe exit, React needs a token, product data contradicts the state machine, a production mutation is implied, or D-R2 cannot serve a required visible flow without a new API decision.
