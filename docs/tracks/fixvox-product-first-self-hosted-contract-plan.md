---
status: active
started: 2026-07-16
updated: 2026-07-16
priority: high
owner: Pi
related:
  - docs/DECISIONS.md
  - docs/tracks/fixvox-self-hosted-checkpoint-d-closure-plan.md
  - specs/019-fixvox-self-hosted-control-plane/spec.md
  - specs/019-fixvox-self-hosted-control-plane/plan.md
  - specs/019-fixvox-self-hosted-control-plane/tasks.md
  - specs/019-fixvox-self-hosted-control-plane/contracts/http-api.md
  - docs/WORKING_MEMORY.md
topic: fixvox-product-first-self-hosted-contract
source_refs:
  - src-tauri/src/fixvox_cloud.rs
  - admin/fixvox-web/server.mjs
  - cloud/fixvox-api/
  - cloud/fixvox-core/
  - cloud/fixvox-proxy/src/index.ts
  - tests/cloud-contract/fixtures.ts
---

# Fixvox Product-First Self-Hosted Contract Plan

## Routing Decision

- **Intent:** plan durable de arquitectura, migración e implementación; este corte no implementa.
- **Motor principal recomendado:** **Implementador**, con ejecución manual staged y un único owner.
- **Por qué:** el plan ya está aprobado, el trabajo ocurre dentro de un repo con dirty state y JP no autorizó Taskflow. La policy canónica elige manual staged para investigación/implementación acotada y reserva Orquestación para fan-out explícitamente pedido.
- **Ownership:** una sesión Implementador lee, integra, edita y verifica un batch por vez; no hay handoff intermedio ni writers paralelos.
- **Nesting prohibido:** sin Taskflow, agentes, council, until-done, Actors ni otro motor principal salvo nueva decisión explícita de JP.
- **Gates:** mapa de consumidores → contrato canónico → aliases y retiro → slices de implementación → checks provider-free → revisión antes de código.
- **Verificación:** local/provider-free; `fixvox_test` únicamente cuando un batch posterior requiera DB. Cloudflare sigue siendo autoridad hasta un cutover aprobado.

## Decisión De Producto

JP eligió **producto primero** el 2026-07-16:

- Dictation Tauri y Control Room definen el producto.
- El Worker y sus fixtures son evidencia histórica y de rollback, no arquitectura objetivo.
- API, Bun, Tauri y Admin pueden cambiar coordinadamente cuando simplifique el producto o elimine deuda.
- La compatibilidad legacy existe sólo como puente temporal con consumidor, reemplazo y condición de retiro.
- Una ruta sin consumidor o valor de producto no entra por defecto al runtime nuevo.

## Objetivo

Definir e implementar por slices el contrato self-hosted mínimo y propio para:

1. bootstrap/login y binding seguro de desktop;
2. perfil efectivo, capacidades y configuración server-authoritative;
3. dictado/STT con cuota autoritativa y exactamente una llamada provider;
4. acciones tipadas de postprocess, selección y asistente;
5. Control Room mediante su BFF;
6. señales y jobs estrictamente necesarios.

Checkpoint D cerrará por flujos canónicos provider-free verificados, no por igualdad con las 73 respuestas del Worker.

## Invariantes No Negociables

- Auth, binding, RBAC y capabilities fallan cerrado.
- Secretos y credenciales quedan fuera del renderer y del repo.
- Cuota autoritativa se decide inmediatamente antes de la única llamada provider.
- Una request aceptada no dispara retries implícitos ni múltiples providers.
- Audio, transcript y selected text raw no se persisten ni entran en logs/evidencia.
- Audit de mutaciones sensibles es inmutable y redacted.
- `pro-unlimited` mantiene su camino sin reservation/usage-event.
- Cloudflare conserva autoridad y rollback hasta aprobación separada de cutover.
- Ningún alias se retira mientras tenga un consumidor soportado.

## No Objetivos

- No copiar todas las rutas Admin/Worker.
- No portar Discord, Telegram, Admin embebido, benchmark o helpers internos de Usage por inercia.
- No diseñar multi-region, active-active ni un gateway genérico para terceros.
- No reescribir por estilo Tauri, Worker, Admin o `app.ts`.
- No tocar schema, instalar dependencias ni cambiar driver sin un gate nuevo.
- No usar provider real, OAuth Google real, VPS, Tunnel, DNS, deploy, import o producción dentro de D.
- No ejecutar Taskflow, commit, push, publish o release sin autorización correspondiente.

## Superficie Inicial

| Capacidad | Disposición inicial | Dirección |
| --- | --- | --- |
| `/health`, `/ready` | `canonical` | Liveness/readiness redacted y pequeñas. |
| Device, desktop login y sesión | `redesign` | Un flujo coherente de bootstrap/login; rutas actuales como aliases temporales. |
| Perfil/capabilities | `canonical` | Projection publicada y server-authoritative. |
| STT/dictado | `canonical` | Contrato producto con quota en provider boundary. |
| Preflight | `redesign` | Sólo advisory; puede integrarse a bootstrap/context si evita round trips. |
| `/v1/chat/completions` | `temporary-compat` | Reemplazar por acciones tipadas; no exponer autoridad provider/model al cliente. |
| Control Room | `canonical` | Browser conserva `/api/admin/*`; BFF migra a APIs backend por dominio. |
| Telemetry/feedback | `redesign` | Sólo señales bounded/redacted con dueño claro. |
| Scheduled jobs | `redesign` | Portar sólo jobs requeridos como funciones explícitas/timers. |
| Discord/Telegram/support | `drop` | Fuera salvo nueva decisión de producto. |
| Admin embebido/benchmark/recipe-policy legacy | `drop` | Reemplazados por Control Room/Profile Composer. |
| Usage-counter fetch/prewarm legacy | `drop` por defecto | Retener sólo con consumidor y necesidad medida. |

## Artifacts De Salida

- `specs/019-fixvox-self-hosted-control-plane/contracts/product-route-disposition.md`: 73 fixtures mapeados exactamente una vez, 72 rutas únicas y un scheduled boundary.
- `specs/019-fixvox-self-hosted-control-plane/contracts/product-api.md`: contratos canónicos tipados y errores seguros.
- `specs/019-fixvox-self-hosted-control-plane/contracts/temporary-aliases.md`: consumidor, reemplazo, tests y condición de retiro por alias.
- `specs/019-fixvox-self-hosted-control-plane/tasks.md`: slices de implementación reconciliados con este plan.
- Receipts por batch en este track; historial anterior permanece en `fixvox-self-hosted-checkpoint-d-closure-plan.md`.

## Batch 1 — Mapa Consumidor/Disposición

**Perfil:** Implementador, manual staged.

**Objetivo:** convertir el inventario Worker en decisiones de producto verificables.

**Ruta serial:**

1. **Tauri:** mapear URLs construidas en `src-tauri/src/fixvox_cloud.rs`, tests y callers; registrar flujo, payload, dependencia y costo de migración.
2. **Admin BFF:** mapear `/api/admin/*` del browser a `proxyAdmin(...)`; distinguir browser contract de backend legacy.
3. **Worker/legacy:** clasificar support, internal, Discord, Telegram, embedded Admin, pricing, benchmark y scheduled behavior.
4. **Bun/PostgreSQL:** mapear capacidades ya portadas y repositories reutilizables sin asumir sus rutas actuales como definitivas.
5. **Integración:** crear `product-route-disposition.md` y asignar a cada fixture/ruta:

- consumidor real;
- capability de producto;
- `canonical`, `redesign`, `temporary-compat` o `drop`;
- canonical replacement si aplica;
- condición de retiro si aplica;
- evidencia de código/test.

**Checks:**

- 73 fixture IDs mapeados exactamente una vez;
- 72 combinaciones method/path reconciliadas;
- `/desktop/login` conserva sus dos escenarios explícitos;
- scheduled boundary aparece una vez;
- todas las URLs Tauri y todos los `proxyAdmin(...)` están representados;
- ninguna ruta con consumidor queda `drop`;
- ningún `temporary-compat` queda sin owner/retiro;
- `git diff --check` y docs audit pasan.

**Done:** mapa completo y revisable, sin código de producto modificado.

**Stop:** consumidor ambiguo, source/fixtures contradictorios, ruta sensible sin migration path o el trabajo escapa al batch/ownership.

## Batch 2 — Contratos Canónicos Y Aliases

**Perfil:** Implementador de arquitectura/contrato, serial.

**Objetivo:** definir `product-api.md` y `temporary-aliases.md` a partir del mapa aprobado.

**Contratos mínimos:**

- operations: health/readiness;
- desktop bootstrap/session/auth;
- effective profile/capabilities;
- runtime transcription;
- typed runtime action (`postprocess`, `selection_transform`, `assistant`);
- Control Room BFF por dominios;
- señales/jobs retenidos.

**Reglas:** contracts product-owned; inputs tipados; errores JSON redacted; provider/model elegidos server-side; aliases adaptan al core y no duplican reglas.

**Checks:** ejemplos success/failure, auth matrix, quota lifecycle, single-provider-call assertion, privacy sentinels, alias owner/retiro y rollback behavior documentados.

**Done:** contratos listos para TDD y revisión; todavía sin implementación.

**Stop:** el contrato debilita invariantes, exige schema/dependency prematura o no permite migrar un consumidor soportado.

## Batch 3 — Slice Vertical De Transcripción

**Perfil:** Implementador serial.

**Objetivo:** implementar provider-free bootstrap/context → admission autoritativa → STT mock → consume/release → resultado redacted en Bun/PostgreSQL.

**Orden TDD:** test canónico rojo → core/ports → adapter Bun/PostgreSQL → alias Tauri actual → tests verdes.

**Checks:** exhausted quota = 0 provider calls; accepted = exactamente 1; pre-provider failure libera; ambiguous upstream no reintenta; `pro-unlimited` no escribe usage; 20 requests no sobre-admiten; overhead p95 ≤15 ms; cero raw content.

**Stop:** migration `0005`, dependencia nueva, duplicate provider call, raw data, p95 >15 ms o cambio fuera de ownership.

## Batch 4 — Acciones Tipadas Y Migración Tauri

**Perfil:** Implementador serial.

**Objetivo:** reemplazar el uso producto de `/v1/chat/completions` por acciones tipadas y mover Tauri a contratos canónicos.

**Checks:** postprocess/selection/assistant eligen engine/prompt server-side; una sola transformación; exactly-one provider; fallback seguro; tests duales alias/canónico; ningún caller Tauri queda en rutas retirables.

**Stop:** semántica de producto ambigua, selección/replace deja de fallar cerrado, provider routing entra al renderer o se requiere smoke físico no autorizado.

## Batch 5 — Control Room BFF Y Backend Por Dominio

**Perfil:** Implementador serial.

**Objetivo:** conservar `/api/admin/*` para el browser y consolidar backend alrededor de Profiles, Engines, Prompts, Accounts/Devices, Usage y Audit necesarios.

**Checks:** OAuth/RBAC/recent-Google matrix; publish/rollback con preview/confirmación/audit; DTOs usados por UI; browser sin credenciales backend; rutas legacy sin consumidor quedan explícitamente fuera.

**Stop:** login real, producción/Admin mutation real, secreto, UI rediseñada sin PRODUCT/DESIGN o pérdida de audit/fail-closed.

## Batch 6 — Señales, Jobs Y Eliminación Legacy

**Perfil:** Implementador serial.

**Objetivo:** retener sólo telemetry/feedback/jobs con dueño y eliminar del target support/internals sin consumidor.

**Checks:** bounded storage, redaction, no hot-path blocking para señales no autoritativas, timers provider-free, dropped routes absent/unavailable, aliases retirados sólo con consumer count 0.

**Stop:** una eliminación tiene consumidor, un job requiere red externa/provider o una señal guarda contenido sensible.

## Batch 7 — Gate Final De Checkpoint D

**Perfil:** Implementador con revisión de arquitectura.

**Objetivo:** demostrar que los flujos canónicos, aliases restantes e invariantes están completos antes de Checkpoint E.

**Escalera mínima:**

```powershell
bunx tsc -p cloud/fixvox-api/tsconfig.json --noEmit
cd cloud/fixvox-core; bun test src/*.test.ts
cd ../fixvox-api; bun run test:unit
bun run test:postgres
cd ../..
npm run test:pipeline -- tests/cloud-contract
npm run cloud:test
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
git diff --check
```

Agregar suites canónicas/aliases creadas en Batches 2-6. Worker parity se reporta sólo para aliases; no bloquea dropped/redesigned routes.

**Done:** flujos desktop/Admin provider-free verdes; auth/quota/privacy/single-call probados; aliases inventariados; drops explícitos; `fixvox_test` limpio y Cloudflare authority intacta.

**Stop:** cualquier gate rojo, evidencia parcial presentada como cierre, producción/provider requerido o Checkpoint E iniciado antes del receipt.

## Riesgos Y Mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Romper clientes actuales | Alias temporal o release coordinada; nunca retirar con consumer count >0. |
| Reemplazar legacy por otra API sobrediseñada | Contratos nacen de flujos/consumidores reales y slices mínimos. |
| Aliases permanentes | Owner, canonical replacement y condición de retiro obligatorios. |
| Duplicar providers durante migración | Mock exactly-once y prohibición de traffic mirroring. |
| Regresión auth/privacy | Matrices fail-closed y sentinel scans en cada slice. |
| Copiar 37 rutas Admin | Browser estable vía BFF; backend consolidado por dominios usados. |
| Mezclar arquitectura con producción | Cloudflare authority y gates de deploy/import/cutover separados. |
| Dirty worktree | Ownership por batch, diff scoped y sin resets destructivos. |

## Stop Conditions Globales

Detener y reportar antes de continuar si:

- falta una decisión de producto que cambia un flujo visible;
- un consumidor real no tiene transición segura;
- se debilita auth, quota, privacy, audit o exactly-one-provider;
- hace falta instalar, migrar schema o cambiar driver fuera del batch aprobado;
- aparece producción, provider real, OAuth real, VPS, deploy, import, secret, commit o push;
- se toca una base distinta de `fixvox_test`;
- hay contradicción entre source real y docs que cambia la disposición;
- dos reparaciones fallan dentro de un batch;
- el cambio escapa al ownership declarado.

## Rollback Y Reversibilidad

- Batches 1-2 son docs-only y se revierten por bloques exactos.
- Implementación posterior mantiene aliases hasta migrar consumidores.
- Antes de cutover, Worker sigue siendo autoridad/rollback.
- No hacer reset destructivo del working tree.
- Cada batch registra archivos propios, checks y estado final de DB cuando aplique.

## Aprobaciones Separadas

- Taskflow/orquestación no forma parte de este plan; incorporarlo requeriría un opt-in explícito y nuevo Routing Decision.
- Dependencias, migraciones no previstas o cambio de driver.
- Smokes reales de provider/OAuth/desktop side effects.
- VPS, secrets, Tunnel/DNS, deploy, export/import, canary y cutover.
- Commit, push, publish o release.

## Receipt — Batch 1 (2026-07-17)

- Creado `specs/019-fixvox-self-hosted-control-plane/contracts/product-route-disposition.md` con los 73 fixture IDs exactamente una vez, 72 combinaciones method/path, ambos escenarios `/desktop/login` y el único scheduled boundary.
- Mapeadas las ocho URLs Tauri construidas por el host y los prefijos downstream de `proxyAdmin(...)`; el browser `/api/admin/*` queda estable y separado del backend legacy.
- Disposición final: **1 `canonical`**, **9 `redesign`**, **39 `temporary-compat`** y **24 `drop`**. Todos los aliases temporales tienen owner, reemplazo y retiro.
- Validación mecánica: 73 fixture IDs únicos/exactos, 72 rutas, 1 scheduled, 8 paths Tauri y 26 prefijos `proxyAdmin(...)`; contract inventory 4/4, `git diff --check` y context audit sin errores.
- Batch docs-only: sin cambios runtime/Tauri/Admin, DB, provider, producción, deploy, commit ni push. D-R1 queda completo; D-R2-D-R4 siguen abiertos.

## Próximo Batch

**Batch 2 — Contratos Canónicos Y Aliases**, perfil **Implementador de arquitectura/contrato** y motor manual staged. Debe crear `product-api.md` y `temporary-aliases.md` desde el mapa aprobado, todavía sin implementación.
