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

Primera apuesta recomendada: **Admin de usuarios/grupos + usage/quota visible**. Desbloquea monetizacion, soporte, debugging y rollout seguro sin tocar demasiado UX desktop.

## Roadmap De Implementacion

### Phase A — Admin operativo minimo

Objetivo: poder operar usuarios/devices/policies desde este repo sin scripts sueltos.

- [x] A1 Mapear modelo actual de `DeviceRecord`, `accountId`, policy templates, usage y admin endpoints en `cloud/fixvox-proxy/`.
- [x] A2 Agregar endpoint admin redacted para buscar/listar usuarios registrados por cuenta, device y policy sin exponer emails completos ni account IDs crudos.
- [x] A3 Agregar endpoint admin para asignar policy a cuenta/user, no solo a device, con fallback device-level documentado.
- [x] A4 Agregar tests Worker para listar usuarios, asignar policy por account y verificar redaccion.
- [x] A5 Documentar runbook admin local: listar, asignar Pro/basic, restaurar Pro, verificar policy.

### Phase B0 — Observabilidad local de prewarm

Objetivo: hacer medible `prewarm` sin agregar escrituras KV, cambiar su respuesta ni tocar producción.

- [x] B0.1 Persistir por device, dentro del Durable Object existente, sólo contadores diarios sanitizados de intentos, éxitos y fallos.
- [x] B0.2 Limitar la retención a siete buckets diarios con cleanup por alarm; sin IDs, contenido, payloads ni llamadas a providers en el valor persistido.
- [x] B0.3 Encolar observación best-effort con `ctx.waitUntil`; un fallo de observabilidad no cambia la respuesta de prewarm.
- [x] B0.4 Agregar tests provider-free para conteos, retención, cero writes KV, ausencia de datos crudos y fallo fail-open de observabilidad.

**Lean Checkpoint Loop v0.1 receipt (2026-07-15)**

- Protocol / checkpoint / class / scope: v0.1 / B0 / L1 / B0.1-B0.4; base `84e5ebea471626ae5d3b76c45ed8f70aa1f1de4e`.
- Files changed: `cloud/fixvox-proxy/src/index.ts`, `cloud/fixvox-proxy/src/prewarm-observability.test.ts`, este track, `docs/WORKING_MEMORY.md`, `docs/.generated/context-index.md`, `plans/aos-autonomous-checkpoint-loop.md`.
- Invariant: cero nuevas escrituras `env.USAGE` por prewarm; mismo contrato público; DO existente con identidad implícita, retención acotada y valor sin IDs/contenido.
- Focused rerun, cwd `cloud/fixvox-proxy`: `bun test src/prewarm-observability.test.ts` -> 4/4; `bun test src/contract-runner.test.ts` -> 2/2.
- Close rerun, cwd repo: `npm run cloud:test` -> exit 0; `bun scripts/context-index.ts && bun scripts/agent-context-audit.ts` -> 0 errors/3 size warnings; cwd `cloud/fixvox-proxy`: `npx wrangler deploy --dry-run` -> Green, sin deploy.
- Failure/gate: primero se invocó por error el dry-run desde el cwd raíz; `npx` descargó Wrangler 4.110.0 en caché temporal y falló antes de bundle/deploy. No creó config ni cambió package/lockfiles raíz.
- Human decision: JP aceptó explícitamente el efecto incidental y autorizó finalizar; no se limpió caché ni se revirtió código.
- Advisor -> cambio: recomendación no-KV se concretó usando `USAGE_COUNTERS`, prefijo determinista por device, counters sanitizados y `waitUntil` best-effort.
- Result: implementación/checks Green; evaluación del protocolo Red por breach de install gate. Sin provider, producción, secrets, datos reales ni deploy.
- Next gate at B0 close: B1-B4 requerían autorización separada; luego fueron autorizados y cerrados en el receipt siguiente. B5 y Spec 019 C/T013 siguen gated.

### Phase B — Usage/quota visible

Objetivo: ver costo/uso y controlar limites antes de abrir beta mas amplia.

- [x] B1 Definir metricas por user/device: STT seconds, LLM actions, prewarm, failures, quota remaining.
- [x] B2 Exponer endpoint admin de usage por account/device con IDs redacted.
- [x] B3 Mostrar quota/usage en admin page existente o panel nuevo simple.
- [x] B4 Tests de quota/usage: agregacion, redaccion, empty state y over-limit.
- [ ] B5 Smoke redacted con usuario real aprobado.

**Lean Checkpoint Loop v0.1 receipt (2026-07-15)**

- Protocol / checkpoint / class / scope: v0.1 / B1-B4 / L1 / read-only usage projection + Admin UI; base `84e5ebea471626ae5d3b76c45ed8f70aa1f1de4e`.
- Files changed: `cloud/fixvox-proxy/src/{usage-admin.ts,usage-admin.test.ts,index.ts,control-plane-store.ts}`, `admin/fixvox-web/{public/app.js,server.mjs,server.test.mjs}`, este track, `docs/WORKING_MEMORY.md`, `docs/.generated/context-index.md`, `plans/aos-autonomous-checkpoint-loop.md`.
- Invariants: endpoint existente extendido aditivamente; IDs redacted; límites derivados de `DeviceLimits`; telemetry recent cap 100; devices cap 20; prewarm 7d; cero writers/providers nuevos.
- Focused rerun, cwd `cloud/fixvox-proxy`: `bun test src/usage-admin.test.ts src/control-plane-store.test.ts` -> 39 pass; `bun test src/contract-runner.test.ts` -> 2/2.
- Admin rerun, cwd repo: `node --test admin/fixvox-web/server.test.mjs` -> 10/10; `node --check admin/fixvox-web/public/app.js && node --check admin/fixvox-web/server.mjs` -> Green.
- Close rerun, cwd repo: `npm run cloud:test` -> exit 0; `bun scripts/context-index.ts && bun scripts/agent-context-audit.ts` -> 0 errors/3 size warnings; cwd `cloud/fixvox-proxy`: `npm exec --offline -- wrangler deploy --dry-run` -> Green, sin download ni deploy.
- Failure/repair: un assertion de redacción matcheó por error el identificador legítimo `transcriptBase`; se acotó al sentinel sensible y el focused Admin rerun pasó 10/10.
- Advisor -> cambio: módulo `usage-admin.ts`, proyección bounded, account handle/device redacted, cuota sin duplicar policy, máximo 20 devices con queries DO en batches de 8 y unavailable fail-open para respetar subrequest budget.
- Result: Green; 0 preguntas rutinarias, 0 cambios de storage, 0 installs, providers, secrets, producción, datos reales o deploy.
- Diagnostics: persisten el finding estructural preexistente `app.js:248` y el ambient LSP faltante para `bun:test`; tests/runtime checks son verdes y no se ampliaron fuera de scope.
- Remaining: B5 no iniciado; el dashboard declara cobertura parcial y no promete historia exhaustiva. Spec 019 C/T013 permanece sin iniciar.
- Producción 2026-07-15: el bundle B0-B4 se promovió junto con el fix urgente de preflight a Worker `f5919894-d287-46f9-b91b-7309e2efe56d`; health respondió 200 y una transcripción managed real pasó con provider request. B5 sigue pendiente porque esta sesión no tenía una credencial Admin view local para validar la proyección `/admin/usage/summary` con el usuario real.

### Phase C — Planes/capabilities vendibles

Objetivo: convertir capabilities actuales en planes de producto administrables.

- [ ] C1 Formalizar templates: `basic-anonymous`, `alpha-basic`, `dictation-basic`, `pro`, `power-admin`.
- [ ] C2 Definir matriz de capabilities/limits por template.
- [ ] C3 Agregar migracion/compatibilidad para devices existentes.
- [ ] C4 UI Settings: explicar plan actual, limites y next-step sin filtrar datos sensibles.
- [ ] C5 T022-style smoke para cada template critico: unlock/deny fail-closed.

### Phase D — Personalizacion por usuario

Objetivo: que registrarse mejore el dictado.

- [ ] D1 Guardar prompt profile por account/policy.
- [ ] D2 Permitir vocabulario/palabras frecuentes redacted-safe por account.
- [ ] D3 Runtime: incluir prompt/profile desde policy snapshot host-owned.
- [ ] D4 Tests provider-free de prompt routing y no leakage.
- [ ] D5 Smoke real acotado con fixture no sensible.

### Phase E — Beta/otra PC

Objetivo: probar crecimiento real fuera de la maquina dev.

- [ ] E1 Crear installer fresh post-cutover.
- [ ] E2 Otra PC install smoke: login Google, device link, Pro managed dictation.
- [ ] E3 Waitlist/basic denied smoke: login permitido, managed dictation denied fail-closed.
- [ ] E4 Release/runbook: que tocar para onboard/offboard un usuario.
- [ ] E5 Decidir si publicar canal nuevo o mantener artifact local.

## Decisiones Pendientes

- Cual es el primer plan comercial o beta real: `pro`, `founder`, `dictation-basic`.
- Si policy principal debe asignarse a account, device o ambos.
- Si el trial inicial requiere aprobacion manual o auto-Pro limitado.
- Que datos de usage son aceptables en admin sin volverse sensibles.
- Si prompts/vocabulario por usuario entran antes o despues de otra PC smoke.

## Implementacion 2026-06-30 — Phase A parcial

- Worker agrega `GET /admin/control-plane/accounts` para listar cuentas signed-in con `accountHandle`, `accountIdRedacted`, resumen de devices/policies y sin exponer account IDs crudos.
- Worker agrega `POST /admin/control-plane/accounts/policy` para asignar policy por cuenta usando `accountHandle`; actualiza devices existentes de esa cuenta y guarda assignment para que futuros devices linkeados hereden la policy.
- `registerDevice` honra assignments account-level antes del fallback device/default policy.
- Script versionado `scripts/fixvox-admin.mjs` + `npm run cloud:admin` permite `health`, `devices`, `accounts`, `policies`, `assign-device-policy` y `assign-account-policy` con redaccion por defecto.
- Tests nuevos en `cloud/fixvox-proxy/src/managed-execution.test.ts` cubren listado redacted y assign por account sin leakage de `google:<sub>`.
- Checks pasados: `npm run cloud:test` (67/67), focused `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control` (148/148), `npm run build`, `cd src-tauri && cargo fmt --check && CARGO_TARGET_DIR=target/pi-admin-users cargo check`.
- Deploy aprobado por JP con `go` y ejecutado desde VPS: Worker version `6c2501dd-e7af-4e8b-9697-9251aad5c8c3`.
- Post-deploy VPS: `node scripts/fixvox-admin.mjs accounts 5` OK; lista `accountHandle`, devices redacted y policy Pro sin exponer account ID crudo. `npm run cloud:test` en VPS sigue OK (67/67).
- No push.

## Runbook Admin Account-Level

Listar estado:

```bash
ssh vps 'cd ~/dev/dictation-tauri && node scripts/fixvox-admin.mjs health'
ssh vps 'cd ~/dev/dictation-tauri && node scripts/fixvox-admin.mjs accounts 20'
ssh vps 'cd ~/dev/dictation-tauri && node scripts/fixvox-admin.mjs devices 20'
ssh vps 'cd ~/dev/dictation-tauri && node scripts/fixvox-admin.mjs policies'
```

Asignar policy por cuenta (requiere aprobacion explicita porque muta produccion):

```bash
ssh vps 'cd ~/dev/dictation-tauri && node scripts/fixvox-admin.mjs assign-account-policy <accountHandle> pro "Pro" --yes'
ssh vps 'cd ~/dev/dictation-tauri && node scripts/fixvox-admin.mjs assign-account-policy <accountHandle> alpha-basic "Alpha Basic" --yes'
```

Asignar/restaurar por device como fallback:

```bash
ssh vps 'cd ~/dev/dictation-tauri && node scripts/fixvox-admin.mjs assign-device-policy <deviceId> pro "Pro" --yes'
```

Verificacion despues de mutar:

```bash
ssh vps 'cd ~/dev/dictation-tauri && node scripts/fixvox-admin.mjs accounts 20'
ssh vps 'cd ~/dev/dictation-tauri && node scripts/fixvox-admin.mjs devices 20'
```

Notas:

- `accounts` imprime `accountHandle` estable y `accountIdRedacted`; no imprime `google:<sub>`.
- `assign-account-policy` actualiza devices existentes de esa cuenta y guarda assignment para futuros devices linkeados.
- `assign-device-policy` sigue siendo fallback si se necesita corregir un device puntual.

## Checks Base Para Cada Batch

- `npm run cloud:test`
- `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`
- `npm run build`
- `cd src-tauri && cargo fmt --check && CARGO_TARGET_DIR=target/pi-registered-users cargo check`
- Si toca produccion: deploy solo con aprobacion + smoke redacted correspondiente.

## Guardrails

- No push/deploy/release sin aprobacion explicita.
- No imprimir ni commitear tokens, emails completos, account IDs, device IDs, transcripts, selected text ni audio.
- Mantener React fuera de secretos y decisiones de seguridad.
- Cualquier smoke con login/cuenta real sigue gated por aprobacion explicita.
