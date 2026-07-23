---
status: active
started: 2026-07-16
updated: 2026-07-20
priority: high
owner: Pi
related:
  - docs/DECISIONS.md
  - docs/tracks/fixvox-self-hosted-checkpoint-d-closure-plan.md
  - specs/019-fixvox-self-hosted-control-plane/spec.md
  - specs/019-fixvox-self-hosted-control-plane/plan.md
  - specs/019-fixvox-self-hosted-control-plane/tasks.md
  - specs/019-fixvox-self-hosted-control-plane/contracts/http-api.md
  - specs/019-fixvox-self-hosted-control-plane/contracts/product-api.md
  - specs/019-fixvox-self-hosted-control-plane/contracts/temporary-aliases.md
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

- **Intent:** plan durable de arquitectura, migración e implementación.
- **Motor principal recomendado:** **Implementador**, con ejecución manual staged y un único owner.
- **Por qué:** el plan ya está aprobado, el trabajo ocurre dentro de un repo con dirty state y JP no autorizó Taskflow. La policy canónica elige manual staged para investigación/implementación acotada y reserva Orquestación para fan-out explícitamente pedido.
- **Ownership:** una sesión Implementador lee, integra, edita y verifica una banda de resultado completa; no hay handoff intermedio ni writers paralelos.
- **Nesting prohibido:** sin Taskflow, agentes, council, until-done, Actors ni otro motor principal salvo nueva decisión explícita de JP.
- **Gates:** contrato cerrado → runtime/clientes provider-free → Control Room/jobs/legacy → gate final → etapas externas E-J.
- **Verificación:** checks enfocados durante la banda y una verificación amplia + receipt al final. Cloudflare sigue siendo autoridad hasta un cutover aprobado.

## Cadencia Revisada — 2026-07-19

JP observó correctamente que la cadencia anterior fragmentaba demasiado trabajo local, reversible y provider-free. Las secciones técnicas Batch 1-7 se conservan como checklist y trazabilidad, pero dejan de ser cortes ceremoniales obligatorios. Checkpoint D se ejecuta en cuatro bandas de resultado:

| Banda | Alcance continuo | Corte real |
| --- | --- | --- |
| **D1 — Contract closure** | D-R2 + D-R3 + D-R4: `product-api.md`, `temporary-aliases.md`, reconciliación de spec/plan/tasks/contracts y revisión del diseño | Contratos listos para TDD y decisión explícita sobre cualquier gap de producto |
| **D2 — Runtime + Tauri** | Slices técnicos de los Batches 3-4: cuota autoritativa en provider boundary, provider composition, acciones tipadas y migración coordinada Tauri | Flujos desktop provider-free verdes, exactly-one-provider probado y aliases Tauri inventariados |
| **D3 — Control Room + operaciones retenidas** | Slices técnicos de los Batches 5-6: BFF/Admin, jobs/señales necesarias y retiro de legacy sin consumidores | Flujos Admin provider-free verdes, mutaciones seguras cubiertas y legacy target cerrado |
| **D4 — Gate final** | Batch 7 completo | Checkpoint D cerrado o reporte único de blockers |

Reglas de cadencia:

- no pedir aprobación ni detenerse entre pasos locales/provider-free, reversibles y ya cubiertos por la banda;
- usar checks enfocados mientras se trabaja y una escalera amplia al cierre, sin repetir suites completas por microcambio salvo fallo relevante;
- dejar un solo receipt por banda, actualizando los documentos canónicos juntos;
- detener sólo por decisión de producto, dos reparaciones fallidas, riesgo de privacidad/auth/cuota/exactly-once o salida del ownership;
- mantener gates explícitos para dependencias o schema no previstos, provider/OAuth real, side effects desktop gated, VPS, secrets, deploy, import, DNS/Tunnel, canary, cutover, commit/push/publish/release.

## Reality Reconciliation — 2026-07-19

Auditoría read-only contra código, Cloudflare API y VPS:

- Cloudflare sigue siendo autoridad y hot path. Deployment activo `df416730-61b8-4222-ab5f-282879251db9` al 100%, con KV `USAGE`, DO `USAGE_COUNTERS`, DO `CONTROL_PLANE_PUBLISH_LOCKS` y handlers `fetch`/`scheduled`; ambos health públicos del Worker respondieron 200.
- `fixvox-admin-web.service` está activo en VPS sobre `127.0.0.1:8787`, en modo `production`, y su backend efectivo es `https://auth-fixvox.jpsala.dev`; Admin/Pi vive en VPS pero proxya al Worker.
- No existe unidad instalada system/user `fixvox-api`, ni `/opt/fixvox-api`, `/etc/fixvox-api` o `/var/lib/fixvox-api`. Hay PostgreSQL de otras cargas en contenedores, pero no evidencia verificable de una base dedicada Fixvox en VPS.
- `cloud/fixvox-api` es código local real: TypeScript limpio, unit 17/17 y PostgreSQL integration 12/12. No es production-ready: `composeApi()` corta con `real_provider_composition_pending` fuera de mock, el adapter HTTP real no está compuesto, chat/audio no consumen/liberan la reserva alrededor del provider y las mutaciones Admin responden `501`.
- Tauri conserva `https://auth-fixvox.jpsala.dev` como default y usa las rutas Worker de device, preflight, STT y chat.
- El template self-hosted usa puerto default `8787`, hoy ocupado por Admin Web; D1/F deben fijar puertos distintos explícitos.
- El checkout operativo VPS está en `rescue/vps-dictation-20260712` (`0ae9531`) con WIP Admin, mientras local está en `main` (`8e5dd3d`). `fixvox-api/app.ts`, `composition.ts` y Admin server coinciden por hash; Worker source no coincide entre ambos checkouts.
- `fixvox-admin` todavía exige la key legacy `ADMIN_API_KEY`, mientras producción usa keys separadas; debe actualizarse antes de tratarlo como runbook operativo.
- Las menciones a Worker 153 / `27d27754-...` son históricas de Profile Composer, no el deployment activo actual.

Esta reconciliación no cambia autoridad, tráfico ni infraestructura. Sus gaps entran en D1-D3 y en los runbooks F-I; no justifican un plan paralelo.

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

- `specs/019-fixvox-self-hosted-control-plane/contracts/product-route-disposition.md`: 74 fixtures mapeados exactamente una vez, 73 rutas únicas y un scheduled boundary.
- `specs/019-fixvox-self-hosted-control-plane/contracts/product-api.md`: contrato D1 normativo y listo para TDD; contratos canónicos tipados, apply atómico product-owned, errores seguros, auth/cuota/privacy/exactly-one-provider y rollback.
- `specs/019-fixvox-self-hosted-control-plane/contracts/temporary-aliases.md`: ledger D1 normativo con 40 escenarios (39 aliases únicos), consumidor, owner, reemplazo, tests, retiro y rollback; transición apply cerrada.
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

- 74 fixture IDs mapeados exactamente una vez;
- 73 combinaciones method/path reconciliadas;
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

## D1R — Reconciliación De `admin-profile-apply`

**Estado:** D1R-1, D1R-2 y D1R-3 completos; D1-D4 COMPLETE. **Checkpoint D cerrado**; Checkpoint E no iniciado.

### Objetivo

Cerrar D1 reconciliando el fixture HTTP 74 y convirtiendo el apply atómico de profiles en contrato product-owned listo para TDD, sin cambiar runtime ni producción.

### Decisión Cerrada

- Worker `POST /admin/control-plane/profiles/apply`: `temporary-compat`.
- Browser `POST /api/admin/profiles/apply`: boundary estable del Control Room BFF.
- Reemplazo canónico: `POST /product/v1/control-room/profiles/{profileKey}/apply`.
- El camino normal edita en memoria y hace un único apply atómico; no traduce la operación a draft + publish ni persiste estado intermedio.
- El alias Worker permanece mientras tenga consumidor soportado; Cloudflare sigue siendo authority y rollback hasta un cutover aprobado por separado.

### No Objetivos

- No implementar runtime, Tauri, Bun API, Admin/Worker ni comenzar D2.
- No introducir schema, driver, dependencia o migración.
- No ejecutar provider/OAuth real, side effects desktop, VPS, producción, deploy, import, canary o cutover.
- No limpiar drafts legacy ni datos reales.
- No hacer commit, push, publish o release.

### Batches Verificables

#### D1R-1 — Inventario Y Disposición

- Añadir `admin-profile-apply` exactamente una vez al mapa D-R1 con consumidor BFF, capability Profiles, disposición `temporary-compat`, owner Control Room, reemplazo canónico, test focal, condición de retiro y rollback `CF-BFF`.
- Actualizar los cierres mecánicos esperados a **74 fixtures HTTP**, **73 method/path**, **40 escenarios `temporary-compat`**, **39 aliases únicos**, **1 `canonical`**, **9 `redesign`** y **24 `drop`**.
- Verificar que ninguna ruta `drop` tenga consumidor y que ningún alias carezca de owner/retiro.

**Done:** source, disposition y ledger concuerdan en IDs, rutas, consumidores y conteos; la contradicción que bloqueó D1 queda eliminada.

#### D1R-2 — Contrato Canónico De Apply Atómico

- Especificar el comando product-owned con `profileKey`, `expectedRevision`, definición candidata y confirmación explícita; principal, actor y credencial se derivan server-side.
- Exigir OAuth Google reciente, capability `publish`, expected revision, validación de referencias, lock autoritativo y errores JSON redacted.
- Garantizar cero writes ante stale/invalid, y exactamente una nueva versión published, un avance de revisión y un audit inmutable ante éxito; retries idénticos son idempotentes.
- Alinear el dominio Profiles para que apply atómico sea el camino normal. Draft/publish sólo puede permanecer como compatibilidad legacy explícita, nunca como traducción interna del apply.

**Done:** `product-api.md`, `temporary-aliases.md` y `http-api.md` describen una transición implementable sin debilitar auth, atomicidad, audit o rollback.

#### D1R-3 — Cierre Cruzado De D1

- Reconciliar `spec.md`, `plan.md`, `tasks.md`, contratos y este track; retirar marcas stale/blocking sólo cuando pasen todos los checks.
- Revisar ejemplos success/failure, auth matrix, rollback, owner/retiro, privacidad y ausencia de estado intermedio.
- Declarar D1 verde sólo con un receipt único y evidencia reproducible; D2 queda para otra corrida.

**Done:** D-R1..D-R4 están alineados, los contratos son normativos y listos para TDD, y no queda contradicción source/docs.

### Checks

```powershell
# Checks mecánicos/focales existentes del inventario y contratos
npm run check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
git diff --check
```

Además:

- fixture IDs 74/74 y method/path 73/73;
- `temporary-compat` 40/40 escenarios y 39 aliases únicos;
- los ocho paths Tauri y todos los downstream `proxyAdmin(...)` representados;
- sentinels de auth, privacy, atomicidad, exactly-one-apply, audit y rollback documentados;
- diff limitado a docs/spec del Checkpoint D, sin producto ni artefactos generados ajenos al índice.

### Riesgos Y Mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Reintroducir drafts como estado normal | Contrato de apply único y atómico; draft/publish sólo como alias legacy con retiro. |
| Hacer permanente la ruta Worker | `temporary-compat` con owner, canonical replacement, consumer-count cero y gate de retiro. |
| Debilitar OAuth/RBAC o filtrar autoridad | Principal/actor/credential server-owned; recent Google + `publish` fail-closed. |
| Writes parciales, doble versión o doble audit | Lock, expected revision, zero-write failures e idempotencia contractual. |
| Cerrar D1 con inventario nuevamente stale | Comparación mecánica source ↔ disposition ↔ aliases antes del receipt. |
| Mezclar contrato con runtime/producción | Ownership docs-only y stop inmediato ante salida a D2 o gates externos. |

### Stop Conditions

Detener D1R y reportar si:

- source actual contradice otra disposición o aparece otro consumidor no mapeado;
- no puede preservarse apply atómico, zero-write failure, audit único o rollback unitario;
- el browser necesita actor, credencial o autoridad de publish;
- se requiere schema/dependency, limpiar datos, tocar producto/runtime o iniciar D2;
- aparece provider/OAuth real, VPS, secret, producción, deploy, import, canary, cutover, commit o push;
- dos reparaciones documentales fallan o los checks no convergen.

### Rollback Y Reversibilidad

D1R es docs-only. Revertir únicamente sus bloques exactos preserva los drafts y cambios preexistentes. No retirar aliases ni cambiar autoridad/tráfico; Cloudflare permanece como rollback operativo.

## Receipt — Batch 1 (2026-07-17)

- Creado `specs/019-fixvox-self-hosted-control-plane/contracts/product-route-disposition.md` con los 73 fixture IDs exactamente una vez, 72 combinaciones method/path, ambos escenarios `/desktop/login` y el único scheduled boundary.
- Mapeadas las ocho URLs Tauri construidas por el host y los prefijos downstream de `proxyAdmin(...)`; el browser `/api/admin/*` queda estable y separado del backend legacy.
- Disposición final: **1 `canonical`**, **9 `redesign`**, **39 `temporary-compat`** y **24 `drop`**. Todos los aliases temporales tienen owner, reemplazo y retiro.
- Validación mecánica: 73 fixture IDs únicos/exactos, 72 rutas, 1 scheduled, 8 paths Tauri y 26 prefijos `proxyAdmin(...)`; contract inventory 4/4, `git diff --check` y context audit sin errores.
- Batch docs-only: sin cambios runtime/Tauri/Admin, DB, provider, producción, deploy, commit ni push. D-R1 queda completo; D-R2-D-R4 siguen abiertos.

## Receipt — D1 BLOCKED (2026-07-19)

- Se redactaron drafts de `product-api.md` y `temporary-aliases.md`; el subset stale de 39 fixtures `temporary-compat` tiene consumidor, owner, reemplazo, tests, retiro y rollback.
- El check mecánico contra source actual encontró **74 fixtures HTTP vs 73 filas** en D-R1. Falta `admin-profile-apply` (`POST /admin/control-plane/profiles/apply`), que sí tiene consumidor soportado en Control Room `/api/admin/profiles/apply`.
- La contradicción cambia disposición/transición, por lo que se aplicó el stop obligatorio: D-R2-D-R4 siguen abiertos, los contratos quedan no normativos y los slices D2-D4 sólo propuestos.
- Banda docs-only/provider-free: sin runtime/Tauri/Admin/Worker, DB, provider/OAuth, VPS, producción, deploy, commit ni push. Cloudflare sigue authority/hot path. **D2 no fue iniciado**.

## Receipt — D1R-1 COMPLETE (2026-07-19)

- `admin-profile-apply` quedó registrado exactamente una vez como `temporary-compat` en disposición y alias ledger: consumidor estable Control Room BFF `POST /api/admin/profiles/apply`, capability/owner Profiles/Control Room, reemplazo `POST /product/v1/control-room/profiles/{profileKey}/apply`, test focal existente, retiro al migrar el BFF con consumer count legacy cero y rollback `CF-BFF`.
- Comparación mecánica source ↔ disposition ↔ aliases verde: **74/74 fixtures HTTP**, **73/73 method/path**, **40 escenarios temporary-compat**, **39 aliases únicos**, **1 canonical**, **9 redesign**, **24 drop**, sin IDs/rutas faltantes o extra, duplicados ni rutas `drop` con consumidor.
- Evidencia: focal Admin `profile apply` 2/2; `git diff --check` limpio; índice regenerado. `agent-context-audit` conserva únicamente los 7 errores AOS y 4 warnings preexistentes documentados; `npm run check` corta sólo por ese mismo audit, sin reparación por estar fuera de D1R-1.
- Batch docs-only: no cambió producto/runtime ni contratos canónicos; no hubo provider/OAuth, schema/dependencies, VPS/producción, deploy, commit o push. **D1 no está completo**; D1R-2..3 siguen abiertos y D2 no inició.

## Receipt — D1R-2 COMPLETE (2026-07-19)

- `POST /product/v1/control-room/profiles/{profileKey}/apply` quedó definido como único write normal de Profiles: request tipado con `expectedRevision`, definición candidata y confirmación estructurada; principal, actor, capability/recent Google y credencial permanecen server-owned.
- El contrato exige lock autoritativo, validación completa previa al primer write, stale/invalid con cero writes y éxito con exactamente una versión published, un avance de revisión, un audit inmutable/redacted y un receipt idempotente. Replay idéntico no agrega writes.
- Browser `POST /api/admin/profiles/apply` queda estable; Worker `POST /admin/control-plane/profiles/apply` sigue `temporary-compat`. El adapter valida `expectedActiveVersion` y lo mapea bajo el mismo lock a `expectedRevision`; no reinterpreta números ni libera el lock. Draft/preview/publish quedan legacy aislado con retiro y nunca traducen ni implementan apply.
- Evidencia provider-free: focal Admin `profile apply` 2/2; assertions mecánicas de endpoint único, browser/alias, version→revision, atomicidad/idempotencia/privacidad y ausencia de draft/publish como flujo normal, verdes; `git diff --check` limpio; índice regenerado. `agent-context-audit` conserva sólo los 7 errores AOS y 4 warnings preexistentes autorizados.
- Banda docs-only: sin runtime/Tauri/Admin/Worker, spec/plan/tasks, schema/dependencies, provider/OAuth, VPS/producción, deploy, commit o push. **D1 no está completo**; queda bloqueado sólo en D1R-3 y D2 no inició.

## Receipt — D1 COMPLETE / D1R-3 (2026-07-19)

- D-R1..D-R4 quedaron alineados y cerrados. `spec.md`, `plan.md`, `tasks.md` y los cuatro contratos declaran una única línea vigente y normativa, lista para TDD.
- Comparación mecánica source ↔ disposition ↔ aliases: **74/74 fixtures HTTP**, **73/73 method/path**, **40 escenarios `temporary-compat`**, **39 aliases únicos**, **1 canonical**, **9 redesign** y **24 drop**; sin faltantes, extras o duplicados.
- Apply canónico: `POST /product/v1/control-room/profiles/{profileKey}/apply`, `expectedRevision`, recent Google + `publish`, principal/actor/credential server-owned, lock autoritativo, stale/invalid con zero writes, éxito con una publicación/revisión/audit/receipt únicos y replay idéntico sin writes. Browser `/api/admin/profiles/apply` sigue estable; Worker apply sigue alias temporal con version→revision bajo el mismo lock; draft/publish sólo legacy aislado.
- Evidencia provider-free: assertions D1R-2 verdes; focal Admin `profile apply` 2/2; `git diff --check` limpio; índice regenerado. `agent-context-audit` conserva únicamente los 7 errores y 4 warnings AOS preexistentes autorizados.
- Cierre docs-only: sin runtime/Tauri/Admin/Worker, schema/dependencies, provider/OAuth, VPS/producción, deploy, import, commit o push. Los receipts históricos D1 BLOCKED, D1R-1 y D1R-2 se preservaron. **D2 no inició**.

## Receipt — D2 COMPLETE (2026-07-19)

- Bun API cerró los contratos canónicos provider-free de bootstrap/context/auth sessions, transcription y typed actions sobre puerto local `8790`; config no mock sigue fail-closed ante secrets faltantes.
- La ruta metered ejecuta reserve inmediatamente antes de una única llamada provider mock y luego consume/release; denied/exhausted hace cero llamadas, ambiguous no reintenta, operación repetida es idempotente y `pro-unlimited` no escribe reservation/usage-event. El p95 PostgreSQL warmed fue **5.011 ms** frente al gate ≤15 ms.
- Tauri migró coordinadamente a product-v1 para bootstrap/auth/transcription/actions y retiró el preflight separado del flujo canónico. Los aliases Desktop/Auth y helpers preflight quedan retenidos para compatibilidad/rollback, inventariados por test estático; no autorizan consumidores canónicos nuevos.
- Evidencia provider-free: TypeScript; API **26/26**; core **5/5**; PostgreSQL `fixvox_test` **13/13**; contract inventory **4/4**; runtime pipeline **40/40**; host-runtime **53/53**; `cargo fmt --check`; `cargo check`; Fixvox cloud contract **36/36**; Rust lib **104 passed, 1 ignored**; `git diff --check`.
- Riesgos residuales no bloqueantes: Rust reporta dead code en helpers legacy preflight retenidos; no eliminarlos antes del gate de consumer count/rollback. Pi Lens marca `cloud/fixvox-api/src/app.ts` con alta complejidad/fan-out (`dispatch` 202; `executeRuntime` 28); tratarlo como deuda de refactor acotada, sin mezclarla con D3 salvo que bloquee cambios seguros. No hubo dependency/schema, provider/OAuth real, side effect desktop físico, secret, VPS/producción, deploy/import, commit o push. Cloudflare sigue authority/hot path y D3 no inició.

## D3 Decision Gate — RBAC Target Identity (2026-07-19)

JP eligió **roles sólo para cuentas ya enlazadas**. Control Room seleccionará una identidad existente mediante un `principalKey` opaco obtenido de una lista autorizada; el email será únicamente una proyección redacted para reconocimiento humano y nunca autoridad de asignación.

- El browser conserva sus URLs `/api/admin/*`; el BFF valida owner + recent Google y traduce la selección al contrato canónico `PUT/DELETE /product/v1/control-room/roles/{principalKey}` con actor/credencial server-owned.
- D3 debe retirar del flujo normal la entrada libre `subjectEmail`; no puede derivar autoridad desde email ni aceptar un principal arbitrario no listado.
- Invitaciones o preasignación por email, almacenamiento pending y cualquier schema nuevo quedan fuera de D3 y requieren un feature/gate separado.
- La decisión resolvió el blocker de producto/auth sin schema ni dependencia nueva; el cierre D3 quedó registrado en el receipt siguiente.

## Receipt — D3 COMPLETE (2026-07-19)

- Control Room conserva todas las URLs browser `/api/admin/*` y su BFF deriva rol, actor y credenciales server-side. Los roles sólo aceptan un `principalKey` opaco de una cuenta ya enlazada/listada; email queda redacted y display-only. Owner + recent Google, privacidad y audit permanecen fail-closed.
- Bun/PostgreSQL retiene por dominio sólo Accounts/Devices, Profiles, Engines, Prompts, Usage, Roles y Audit usados por producto. Las señales canónicas siguen bounded/redacted y los jobs explícitos aíslan fallos sin bloquear el hot path ni ejecutar red/provider. Legacy sin consumidor queda fuera del target conforme al inventario contractual.
- El cierre visual detectó una smoke stale respecto de la IA vigente (`Personas`, `Pi Chat`, `Comportamiento`, `Sistema avanzado`, `Uso`, `Planes y acceso`, `Auditoría`), no una regresión UI ni un estado/mock incorrecto. Se reparó únicamente `scripts/admin-web-ui-smoke.mjs`: ahora prueba las superficies actuales, edición local sin apply implícito, RBAC opaco/display-only, rutas BFF, chat y rail tablet. Resultado **45/45**, proceso mock terminado y screenshots reales en `artifacts/ui-spikes/admin-web-ui-smoke/20260719-220441/`.
- Evidencia provider-free: RBAC focal **1/1**; PostgreSQL `fixvox_test` **14/14**, p95 warmed **2.977 ms**; API/jobs **27/27**; Admin/BFF **19/19**; contract inventory **4/4**; TypeScript `fixvox-api`, checks sintácticos de JS y `git diff --check` verdes. Baseline dirty preservado, incluido el fix RBAC en `cloud/fixvox-api/tests/repositories.integration.test.ts`; sin reset/revert destructivo.
- No hubo dependency/schema/driver, provider/OAuth real, secretos, side effects desktop físicos, VPS/producción, deploy/import/DNS/canary/cutover, commit/push/publish/release. **Cloudflare sigue authority y hot path operativo/rollback. D4 no fue iniciado.**

## Receipt — D4 COMPLETE / Checkpoint D closed (2026-07-20)

- Gate provider-free completo verde: TypeScript **1.466 s**; core **5/5** en **0.722 s**; API canónica/aliases/jobs **27/27** en **0.370 s**; PostgreSQL exclusivamente `fixvox_test` **14/14** en **2.531 s**, con quota boundary p95 **2.895 ms**; contract inventory **4/4** en **1.287 s**; Worker rollback/parity **151/151** en **1.263 s**.
- Suites D1-D3: Admin/BFF **19/19** en **2.914 s**; runtime pipeline **40/40** en **1.478 s**; host-runtime **53/53** en **2.462 s**; Tauri canonical/aliases **36/36** en **1.011 s**; Rust lib/runtime **104 passed, 1 ignored** en **0.934 s**.
- UI Admin smoke **45/45** en **3.906 s**; reporte y screenshot final en `artifacts/ui-spikes/admin-web-ui-smoke/20260720-005039/` (`fixvox-admin-ui-smoke.png`). El mock local terminó; no hubo login/OAuth/provider ni mutación externa.
- Calidad: `cargo fmt --check` **0.663 s**; `cargo check` **0.810 s** con los 23 warnings de dead code preflight legacy ya retenidos; sintaxis Node de cuatro archivos Admin/smoke **0.247 s**; AOS `/flow` **5/5** en **0.271 s**; índice **0.149 s**; audit **0 errores, 4 warnings** en **0.192 s**; `git diff --check` **0.106 s**.
- Única reparación D4-local: corrección del harness del glob `src/*.test.ts` para ejecutarlo en Git Bash después de que PowerShell lo pasara literalmente a Bun sin descubrir tests. No cambió source, tests ni invariantes; el gate corregido pasó 5/5. No hubo reparación de producto.
- Dirty baseline D1-D3 + alineación AOS + cambios ajenos preservado sin reset/revert. Archivos propios del cierre: este track, `docs/WORKING_MEMORY.md` y el índice generado. Sin dependency/schema/driver, DB distinta de `fixvox_test`, secrets, provider/OAuth real, side effects desktop físicos, VPS/producción, deploy/import/DNS/canary/cutover, commit/push/publish/release.
- **Checkpoint D queda cerrado. Cloudflare sigue authority, hot path y rollback. Checkpoint E no fue iniciado.**

## Receipt — Checkpoint E provider-free COMPLETE (T030-T034, 2026-07-20)

- Launcher local agregado: `npm run selfhosted:api:local` exige PostgreSQL `fixvox_test`, aplica migraciones y abre sólo `127.0.0.1:8790` con banner `LOCAL / MOCK PROVIDERS`; el check real de arranque respondió ready con `cloudflare-authority` y el process tree terminó. `npm run admin:web:local -- -SelfHosted` usa el mismo backend con auth fixture limitada por código a loopback + `FIXVOX_ADMIN_ENV=local`; fuera de ese perímetro falla al iniciar.
- El smoke coordinado `npm run selfhosted:local:smoke` abre API Bun + Admin BFF reales sobre puertos loopback efímeros y PostgreSQL sintético. Verifica Profiles/Engines/Prompts/Presets/Accounts/Devices/Audit, apply atómico, replay idempotente, rollback, audit inmutable/redacted, bootstrap/context, dictado, postprocess, selection preset y Quick Chat; termina ambos procesos y restaura `fixvox_test` a `cloudflare-authority` revisión `0`.
- Se cerraron gaps que el gate D provider-free no ejercitaba end-to-end: la proyección Admin devuelve definiciones publicadas completas; `PostgresControlPlaneRepository` materializa engine/provider/model/prompt desde catálogos server-side; `assistant_actions` se resuelve por el lane `selectionTransform`; apply/rollback canónicos usan lock transaccional, expected revision, owner/publisher + recent Google, confirmación tipada, historial inmutable y receipt redacted sin schema nuevo.
- Evidencia provider-free: smoke **1/1, 23 assertions**; API unit **29/29**; PostgreSQL **17/17**, quota p95 **4.044 ms**; Admin/BFF **22/22**; Tauri canonical/aliases **36/36**; contract inventory **4/4**; build, TypeScript, sintaxis y `git diff --check` verdes. Baseline dirty previo preservado; no reset/revert destructivo.
- Tras autorización separada explícita de JP, T035 ejecutó una sola vez el lane local real: Groq chat respondió `200`, el contador envolvente probó exactamente **1** request, hubo output no vacío y `pro-unlimited` dejó reservations/events en cero. El reporte ignorado/redacted está en `artifacts/self-hosted-control-plane/checkpoint-e/t035-real-provider-smoke.json`; `fixvox_test` cerró vacío con `cloudflare-authority` revisión `0`. Para impedir reejecución accidental, el smoke quedó fuera del discovery de `bun test` como `tests/local-real-provider.smoke.mjs` y exige `FIXVOX_ALLOW_REAL_PROVIDER_SMOKE=1`, que sólo setea el wrapper explícito `scripts/fixvox-real-provider-smoke.ps1`.
- La composición real agregada es deliberadamente chat-only (Groq/OpenRouter); audio real falla cerrado con `real_audio_provider_pending`. No hubo OAuth real, DB distinta de `fixvox_test`, secret impreso, VPS/producción, Cloudflare mutation, deploy/import/DNS/canary/cutover, commit/push/publish/release. Cloudflare sigue authority, hot path y rollback. **Checkpoint E queda completo.**

## Desktop Compatibility Checkpoint — 2026-07-20

- El fallo inicial de dictado no fue VPS/Cloudflare: STT había completado y el cliente release falló después al crear transcript/report desde una ruta dependiente del CWD. Release ahora materializa esos artifacts bajo el app-data host-owned y conserva rutas lógicas `artifacts/microphone-capture/...`.
- Un rebuild local posterior incluyó el adapter canónico D2 mientras Cloudflare seguía authority: `POST /product/v1/runtime/transcriptions` devolvió `404` porque ese boundary aún no está desplegado. No hubo cambio, deploy ni tráfico nuevo en VPS.
- Reconciliación durable D2/rollback: mientras `https://auth-fixvox.jpsala.dev` sea la authority preferida, Tauri usa el alias Worker `POST /v1/audio/transcriptions` y su multipart legacy; backends self-hosted no preferidos conservan `POST /product/v1/runtime/transcriptions`. Esto implementa `CF-DESKTOP` sin retry ni doble provider call.
- Evidencia local: tests contractuales de ambos transportes, artifact-root dirigido, formato, compilación Rust, diagnósticos y build NSIS verdes; paquete reinstalado. El smoke humano final de dictado queda pendiente de confirmación y no autoriza provider smoke automático.
- JP priorizó continuar con Checkpoint F sobre Pi Chat Batch 2. El checkpoint sigue sin iniciar y detrás de gate explícito de VPS/install.

## Checkpoint F — F5R1 Complete / F5R2 Superseded

- Historial y contrato reconciliado: `docs/tracks/fixvox-self-hosted-checkpoint-f-vps-loopback-plan.md`.
- F1-F4 y F3R5 están completos; F5R1 produjo localmente dos archives control determinísticos desde el archive aprobado `9afa…`, con runtime byte-identical, allowlist/privacy y isolated boot verdes.
- Las promociones posteriores establecieron `current=4075da53c365a8b1` sobre schema 6, rollback inmediato `66652d0fa6073c26` y rollbacks anteriores `90ca26a7e3bd6f50`/`c0deb60ab0f39b3a`. Por eso F5R2, que asumía `9afa…`/schema 4, quedó superseded y su autorización histórica no es ejecutable.
- F5R3-F5R4 y F6/T042 forman ahora un solo outcome band para `/flow → Hacer`;
  Checkpoint G y el canary H serán las dos ejecuciones largas siguientes.
  Cloudflare permanece authority/hot path.

## Siguiente Acción

Autorizar una sola ejecución de `docs/tracks/vps-gate-f-closure-brief.md` para
cerrar F5R3-F6; no tocar el VPS antes de ese gate.
