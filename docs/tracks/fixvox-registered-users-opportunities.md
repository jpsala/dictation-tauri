---
status: active
started: 2026-06-30
updated: 2026-06-30
priority: high
owner: JP
related:
  - docs/tracks/fixvox-tauri-cloud-release.md
  - specs/015-fixvox-auth-policy-groups/tasks.md
  - specs/016-fixvox-cloud-consolidation/tasks.md
  - cloud/fixvox-proxy/src/index.ts
  - cloud/fixvox-proxy/src/control-plane-store.ts
  - src-tauri/src/fixvox_cloud.rs
  - src-tauri/src/runtime_transcription.rs
topic: fixvox-cloud-runtime-port
source_refs:
  - artifacts/desktop-control/fixvox-login-link-smoke/20260630-T021-after-repo-cloud-deploy/report.json
  - artifacts/desktop-control/dictation-e2e/20260630-T022-pro-managed-r2/report.json
  - artifacts/desktop-control/policy-deny-smoke/20260630-T022-denied-policy-r2/report.json
---

# Fixvox Registered Users Opportunities

## Objetivo

Pensar y priorizar que se vuelve posible ahora que Fixvox Tauri tiene usuarios registrados, device link host-owned, policy/authPolicy signed-in, capabilities/limits administrables desde Cloud y enforcement fail-closed en runtime.

## Estado Actual

- `cloud/fixvox-proxy/` es el source operativo del Worker productivo.
- Google OAuth desktop login + device link paso redacted en T021.
- Pro signed-in unlocks managed dictation paso en T022.
- Alpha-basic signed-in denied group falla cerrado antes de provider y restaura Pro.
- React no posee tokens ni decide seguridad; host/cloud validan capabilities.

## Posibilidades

### 1. Growth / onboarding

- Trial sin invite code: login Google crea cuenta y asigna grupo inicial automaticamente.
- Waitlist/approval: login permitido, pero capabilities limitadas hasta aprobacion.
- Referidos: policy/quota bonus por invite/link.
- Onboarding por cohort: founders, beta, pro, enterprise, internal.

### 2. Monetizacion y packaging

- Planes reales por policy template: basic, dictation, pro, power/admin.
- Limites por cuota: minutos STT, acciones LLM, rolling window, weekly/monthly.
- Upgrade/downgrade cloud-side sin reinstalar app.
- Feature gates: advanced settings, custom prompts, assistant actions, selection transform, debug tools.

### 3. Personalizacion por usuario

- Prompts por usuario/grupo.
- Model routing por usuario/grupo.
- Defaults de Settings por usuario/grupo.
- Vocabulario/palabras frecuentes por usuario.
- Idioma y estilo de limpieza por perfil.

### 4. Seguridad y control

- Revocar devices por usuario.
- Fail-closed por capabilities y policy stale/error.
- Auditar device link, policy refresh y managed calls con IDs redacted.
- Separar anonymous basic de signed-in power features.
- Admin-only debug tools sin exponerlos al usuario normal.

### 5. Producto colaborativo

- Equipos/orgs con admins.
- Policies por equipo.
- Shared prompt packs.
- Usage dashboard por team/user/device.
- Seats y device limits.

### 6. Operacion y soporte

- Ver devices activos por usuario.
- Forzar refresh/relink de policy.
- Diagnostico remoto redacted de errores frecuentes.
- Feature flags y rollouts por cohort.
- Kill switch para rutas caras o rotas.

### 7. Runtime mas inteligente

- Prewarm por policy y usage.
- Model routing dinamico por calidad/costo/latencia.
- Fallback cloud-side controlado.
- Rate limiting por user/device.
- Mejorar postprocess y selection transform segun plan/capability.

## Apuestas de alto poder

1. **Admin de usuarios/grupos**: asignar policy templates a usuarios/devices desde UI admin propia.
2. **Planes/capabilities reales**: convertir templates actuales en producto vendible.
3. **Otra PC install smoke**: probar el loop completo como usuario nuevo fuera de la maquina dev.
4. **Usage/quota dashboard**: visibilidad de costo/uso por user/device.
5. **Personal prompts por usuario**: que el dictado mejore al registrarse.

## Proximo Paso Recomendado

Hacer una sesion de diseño/decision con JP para elegir una primera apuesta. Recomendacion tecnica: empezar por **Admin de usuarios/grupos + usage/quota visible**, porque desbloquea monetizacion, soporte, debugging y rollout seguro sin tocar demasiado UX desktop.

## Guardrails

- No push/deploy/release sin aprobacion explicita.
- No imprimir ni commitear tokens, emails completos, account IDs, device IDs, transcripts, selected text ni audio.
- Mantener React fuera de secretos y decisiones de seguridad.
- Cualquier smoke con login/cuenta real sigue gated por aprobacion explicita.
