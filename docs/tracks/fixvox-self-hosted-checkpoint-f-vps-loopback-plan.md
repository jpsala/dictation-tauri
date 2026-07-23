---
status: paused
started: 2026-07-20
updated: 2026-07-22
priority: high
owner: Pi
parent: docs/tracks/fixvox-product-first-self-hosted-contract-plan.md
related:
  - specs/019-fixvox-self-hosted-control-plane/tasks.md
  - specs/019-fixvox-self-hosted-control-plane/plan.md
  - C:/dev/infra/docs/runbooks/vps-operations.md
  - C:/dev/infra/docs/runbooks/access-secrets.md
topic: fixvox-self-hosted-checkpoint-f-vps-loopback
---

# Fixvox Self-Hosted Checkpoint F — VPS Loopback And Operations

## Routing Decision

- **Intent:** `waiting_gate`; cerrar Checkpoint F sobre el baseline schema 6.
- **Motor principal:** `/flow → Hacer` directo, con un único outcome band.
- **Por qué:** restart/rollback, restore aislado y verificación privada forman un
  solo resultado operativo; separarlos agrega handoffs sin reducir el gate.
- **Apoyos:** Advisor para decisiones operativas, checks deterministas y Pi
  Lens sobre código tocado.
- **Nesting prohibido:** sin Taskflow, planner, dgoal, until-done, agentes
  paralelos ni writers simultáneos entre repos.
- **Gates:** F1-F4 y F5R1 están completos; F5R2 está superseded. El cierre
  consolidado F5R3-F6 requiere una autorización nueva y exacta. Provider,
  import, DNS/Tunnel, routing, cutover, commit, push y publish quedan fuera.
- **Verificación:** las transiciones y el restore son checkpoints internos de
  una sola ejecución; cualquier divergencia detiene el outcome band.

## Baseline Histórico Tras Rollback F3 — 2026-07-20

- VPS `srv1761438`: Ubuntu `24.04.4 LTS`, 2 vCPU, 7.8 GiB RAM, más de 2 GiB disponibles, 2 GiB swap y más de 57 GiB libres en `/`.
- Bun `1.3.14`, PostgreSQL `16.14`, cliente y `age` permanecen instalados; DB `fixvox`, roles, schema v4 y authority `cloudflare-authority` siguen verdes.
- Release inmutable `cdda90ea76d4c361` y symlink `current` existen, pero el bundle no cierra dependencias runtime: `projections.ts` importa módulos ausentes de `cloud/fixvox-proxy/src/`.
- `fixvox-api.service` existe pero quedó detenido y deshabilitado tras el fallo de arranque; `127.0.0.1:8790` está libre.
- `127.0.0.1:8787` y `fixvox-admin-web.service` siguen sanos. Cloudflare conserva authority y hot path.
- Config/libpq `0600`, backups `0700` e identidad privada `age` off-host permanecen intactos; no se expusieron secretos.
- Coolify/Zulip y el checkout VPS dirty no se inspeccionaron ni modificaron.
- No hubo provider, import, DNS, Tunnel, tráfico público, reboot, commit ni push.

## Baseline Vivo Reconciliado — 2026-07-22

- `current -> 4075da53c365a8b1`, schema 6, servicio active/enabled, provider configurado y único listener `127.0.0.1:8790`.
- Rollback inmediato `66652d0fa6073c26`; `90ca26a7e3bd6f50` y `c0deb60ab0f39b3a` permanecen como rollbacks anteriores compatibles con schema 6. `9afa5dc85b783793` está preservado pero no es ready sobre schema 6.
- Health/readiness/Admin están en HTTP 200, automatic restarts 0, markers histórico/canary 1/1, único provider call P3 completo y `cloudflare-authority` conserva hot path.
- F5R2 no se ejecutó y quedó técnicamente obsoleto: promovía una control release byte-identical a `9afa…` y exigía schema 4. Su autorización previa no aplica al baseline actual.
- Provider persistente y canary se planifican por separado en `docs/tracks/vps-persistent-provider-canary-plan.md`; esta reconciliación no los autoriza.

## Enmienda De Cadencia `/flow` — 2026-07-22

F5R3, F5R4 y F6 dejan de requerir tres sesiones Hacer: forman **Gate F
Closure**, un solo outcome band con etapas internas fail-closed y un único
cierre durable. El brief ejecutable es
`docs/tracks/vps-gate-f-closure-brief.md`.

Esto no fusiona gates externos posteriores. Checkpoint G será otra ejecución
larga; Checkpoint H usará el brief de routing canary; el cutover I permanece
separado.

## Objetivo

Operar `fixvox-api` con PostgreSQL dedicado en `127.0.0.1:8790`, de forma privada, observable, respaldable y reversible. Checkpoint F termina sólo cuando pasan restart, rollback de aplicación, backup cifrado, restore aislado y verificación SSH/host-local, manteniendo `cloudflare-authority` y cero tráfico público.

## No Objetivos

- No mover autoridad, datos productivos ni tráfico desde Cloudflare.
- No configurar DNS, Tunnel, reverse proxy, canary o endpoint público.
- No usar provider real, OAuth real, audio real ni cuentas/dispositivos reales.
- No importar datos de Worker/KV/DO; eso pertenece a Checkpoint G.
- No reutilizar PostgreSQL de Coolify/Zulip ni tocar sus contenedores, volúmenes o servicios.
- No limpiar, cambiar de branch ni desplegar desde el checkout VPS dirty.
- No instalar Bun ni usar scripts remotos `curl | sh`; se reutiliza el Bun existente.

## Decisiones Operativas

| Área | Decisión Checkpoint F |
| --- | --- |
| Owner de aplicación | `jpsal`, mediante `systemctl --user`; linger ya está activo. |
| Puerto/bind | `127.0.0.1:8790`; `8787` queda reservado al Admin BFF. |
| Runtime | `/home/jpsal/.bun/bin/bun`, sin dependencia nueva de aplicación. |
| PostgreSQL | Ubuntu host-managed PostgreSQL 16, cluster/DB/roles exclusivos Fixvox; nunca los containers existentes. |
| Roles/DB | DB `fixvox`, owner/migraciones `fixvox_migrator`, runtime least-privilege `fixvox_api`. |
| Releases | Snapshot inmutable + manifest/hash en `/home/jpsal/opt/fixvox-api/releases/<release-id>` y symlink `current`. |
| Checkout VPS | Sólo referencia; no recibe deploy ni mutaciones para F. |
| Config protegida | `/home/jpsal/.config/dictation-tauri/fixvox-api.env`, modo `0600`; sólo nombres en docs. |
| Unit | `/home/jpsal/.config/systemd/user/fixvox-api.service`. |
| Operación | Wrappers bajo `/home/jpsal/.local/bin/fixvox-api-*`; logs en journald sin request bodies. |
| Backups | `/home/jpsal/backups/fixvox-api`, modo `0700`; `pg_dump` custom → `zstd` → `age`, recipient público en VPS y clave privada fuera de VPS/repos. |
| Modo F | `FIXVOX_API_MOCK_PROVIDERS=true`, authority `cloudflare-authority`; sin provider secrets ni llamadas reales. |

Variables permitidas por nombre: `FIXVOX_API_DATABASE_URL`, `FIXVOX_DATABASE_URL`, `FIXVOX_API_PUBLIC_BASE_URL`, `FIXVOX_API_HOST`, `FIXVOX_API_PORT`, `FIXVOX_API_MOCK_PROVIDERS`, `FIXVOX_API_REQUEST_TIMEOUT_MS`, `FIXVOX_API_MAX_REQUEST_BYTES` y `FIXVOX_BACKUP_AGE_RECIPIENT`. No registrar valores, passwords ni URLs con credenciales.

## Comandos Planificados

Estos comandos son contrato de revisión, no autorización de ejecución:

```bash
# Ejecutado una vez bajo la aprobación F2; no repetir sin un gate nuevo.
ssh vps 'sudo apt-get update && sudo apt-get install --yes postgresql-16 postgresql-client-16 age'

# Estado privado esperado.
ssh vps 'pg_isready && ss -ltn "sport = :8790"'
ssh vps 'systemctl --user status fixvox-api.service --no-pager'
ssh vps 'curl -fsS http://127.0.0.1:8790/health'
ssh vps 'curl -fsS http://127.0.0.1:8790/ready'
ssh vps 'journalctl --user -u fixvox-api.service -n 100 --no-pager'

# Backup/restore: los wrappers F1 suministran URLs protegidas sin imprimirlas.
pg_dump --format=custom --no-owner --no-acl "$FIXVOX_API_DATABASE_URL" \
  | zstd -T1 -q \
  | age -r "$FIXVOX_BACKUP_AGE_RECIPIENT" \
  > "$BACKUP_PATH"
age --decrypt -i "$OFF_HOST_TEST_KEY" "$BACKUP_PATH" \
  | zstd -d -q \
  | pg_restore --exit-on-error --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL"
```

El unit ejecutará:

```text
ExecStart=/home/jpsal/.bun/bin/bun run /home/jpsal/opt/fixvox-api/current/cloud/fixvox-api/src/main.ts
WorkingDirectory=/home/jpsal/opt/fixvox-api/current
EnvironmentFile=/home/jpsal/.config/dictation-tauri/fixvox-api.env
Restart=on-failure
```

## Batches Seriales

### Batch F1 — Runbook And Deployment Assets (complete)

**Alcance:** trabajo local/reversible. Actualizar `C:/dev/infra` con owner, puerto, paths, paquetes, variables, checks y rollback; agregar scripts deterministas para bundle/manifest, preflight, provision, deploy, service, health, backup y restore rehearsal. El bundle contiene sólo runtime necesario de `cloud/fixvox-api` y `cloud/fixvox-core`, con hash y sin `.env`, tests, artifacts o checkout remoto.

**Done:** scripts soportan dry-run, validan inputs/paths y no imprimen secretos; runbook Infra y proyecto coinciden; `bash -n`/parse, tests focales, context refresh de ambos repos y `git diff --check` verdes.

**Rollback:** revertir sólo los bloques/scripts F1; no existe estado VPS nuevo.

**Cierre:** volver el foco a `waiting_gate` y presentar el comando exacto, paquetes, cambios esperados y rollback de F2 antes de pedir autorización.

**Receipt F1 — 2026-07-20:**

- **Decisión:** F1 completo sin acceso ni cambios en el VPS; Cloudflare sigue authority y F2 permanece detrás de un gate explícito.
- **Checks:** `assets-smoke`, `bash -n`, dry-runs/gates, allowlist, privacidad, paridad de runbooks, LSP/Pi Lens y `git diff --check` verdes; el cierre F2 corrigió el dependency closure para incluir migraciones y produjo bundle reproducible SHA-256 `cdda90ea76d4c3616587cd87a7522d885198265f34220a5905be3c6084b065ec`.
- **Evidencia durable:** assets en `ops/fixvox-api/` y runbooks en proyecto/Infra; audit del proyecto con 0 errores. El índice Infra fue regenerado y su audit conserva 8 fallos AOS preexistentes fuera de F1.

### Batch F2 — PostgreSQL Dedicated Provisioning (complete)

**Alcance:** tras autorización explícita, instalar `postgresql-16`, `postgresql-client-16` y `age`; crear DB/roles exclusivos, grants/default privileges, directorios protegidos, recipient público y env `0600`; aplicar migraciones con `FIXVOX_DATABASE_URL`. No desplegar ni iniciar la API.

**Done:** PostgreSQL host-local responde; schema exacto esperado; authority `cloudflare-authority`; runtime role no puede crear schema/roles ni acceder a otras DB; containers existentes y Admin permanecen intactos.

**Checks:** `pg_isready`, versión, schema/checksum, roles/grants allowlisted, authority mode y scan de permisos/rutas sin valores secretos.

**Rollback:** no desinstalar paquetes automáticamente. Si falla antes de uso, eliminar sólo DB/roles Fixvox y paths nuevos con autorización explícita; nunca tocar clusters/containers ajenos.

**Receipt F2 — 2026-07-20:**

- **Resultado:** PostgreSQL `16.14`, cliente y `age` instalados; DB `fixvox`, dos roles least-privilege, schema v4, config protegida y recipient público quedaron operativos. La identidad privada `age` quedó off-host y validó un roundtrip sintético sin viajar al VPS.
- **Correcciones acotadas:** el bundle incorporó `cloud/fixvox-api/migrations/**`; el cluster dedicado revocó `CONNECT` público sobre `postgres`/`template1`; libpq usa passwords hex sin comillas literales y URLs vinculadas al rol/password esperado.
- **Verificación:** checksums de cuatro migraciones, `cloudflare-authority`, permisos negativos, modos `0600/0700`, recursos, Admin `127.0.0.1:8787` y ausencia de API/listener `8790` quedaron verdes. El checkout VPS dirty, Coolify/Zulip y Cloudflare no se tocaron.
- **Gate:** F2 no autoriza F3; no existe deploy, unit ni proceso de `fixvox-api`.

### Batch F3 — Immutable Deploy And Loopback Service (complete)

**Alcance:** crear bundle local aprobado, subir bundle+manifest a staging, verificar hash, extraer release inmutable, mover symlink `current`, instalar user unit y arrancar en mock/provider-free sobre `127.0.0.1:8790`.

**Done:** un solo PID/listener loopback; `/health` 200; `/ready` 200 con DB/schema/jobs y `cloudflare-authority`; ningún puerto o ruta pública; checkout dirty sin cambios.

**Checks:** hash antes/después, `systemd-analyze --user verify`, `systemctl --user`, `ss`, `curl`, readiness y journal redacted.

**Rollback:** detener unit, restaurar symlink al release previo o deshabilitar el unit si es primer deploy; Cloudflare nunca deja de ser authority.

**Attempt Receipt F3 — 2026-07-20:**

- **Verde antes del start:** preflight, PostgreSQL/F2, Admin `8787`, mock mode, hash `cdda90ea…`, allowlist, release inmutable, `current` y unit verify.
- **Fallo:** el proceso salió antes de escuchar porque `cloud/fixvox-api/src/projections.ts` importa `../../fixvox-proxy/src/runtime-policy-store.ts` y `recipe-policy-store.ts`, ausentes del bundle aprobado. Es un defecto de dependency closure, no de PostgreSQL o systemd.
- **Fail-closed:** se detuvo y deshabilitó el unit; `8790` quedó libre, Admin sano, release/current preservados y Cloudflare authority sin cambios.
- **Estado:** no se permite otro start ni ampliar la allowlist ad hoc. F3 queda bloqueado hasta definir el closure mínimo, validarlo con boot local desde bundle y obtener una autorización nueva.

#### Recovery Plan F3 — Product-Owned Dependency Closure

**Objetivo:** hacer que `fixvox-api` dependa sólo de superficies product-owned incluidas en el bundle, preservando la compatibilidad de device register/preflight. La recuperación local termina cuando el archive exacto, extraído fuera del checkout, inicia provider-free y responde `/health`; recién entonces F3 puede volver a `waiting_gate` para un retry VPS nuevo.

**No objetivos:**

- No reintentar, iniciar, limpiar ni modificar servicio/release/current en VPS durante F3R1-F3R4.
- No incluir módulos legacy de `fixvox-proxy` en el bundle ni mover persistencia KV/Cloudflare a core.
- No cambiar rutas, DTOs, defaults, políticas efectivas, quotas, providers o semántica de register/preflight.
- No eliminar `defaults.recipePolicy`: sus rutas Admin legacy están `drop`, pero el payload de device register sigue bajo compatibilidad temporal.
- No ejecutar provider real, import, DNS, Tunnel, F4, commit, push o publish.

**Decisión:** defaults, tipos y transformaciones puras de runtime/recipe policy pasan a módulos product-owned bajo `cloud/fixvox-core/src/control-plane/`. Los stores de `fixvox-proxy` conservan get/put/reset KV e importan o reexportan la lógica core para no romper consumidores. `cloud/fixvox-api/src/projections.ts` importa sólo core. Duplicar builders en API o ampliar el archive con proxy quedan descartados.

**Superficies previstas:** core control-plane y sus tests; stores/tests de runtime y recipe policy en proxy; projections/tests de API; bundle y smoke exacto bajo `ops/fixvox-api/`. La documentación del proyecto se actualiza antes que el espejo Infra, siempre en serie.

##### F3R1 — Contract Freeze (complete)

**Alcance:** agregar caracterización focal para defaults/transformaciones runtime y recipe, payloads register/preflight y presencia de `defaults.recipePolicy`; agregar un guard que detecte imports runtime API → proxy y una prueba de boot del archive exacto que reproduzca el fallo actual.

**Done:** contratos existentes quedan congelados en verde; el guard/boot red falla sólo por el dependency closure conocido, sin provider ni PostgreSQL real.

**Checks:** tests focales de core/proxy/API; inspección estructural de imports; bundle/boot fixture sintético con secrets sentinel.

**Rollback:** revertir sólo tests/fixtures F3R1; no existe estado operativo nuevo.

**Receipt F3R1 — 2026-07-20:**

- **Decisión:** congelar contratos antes de extraer; mantener intencionalmente rojo el guard API → proxy por los dos imports conocidos y aceptar la reparación acotada que excluye tests del bundle.
- **Evidencia durable:** core 19, proxy focal 13 y projections 2 tests verdes; el boundary detecta sólo los dos imports de `projections.ts`. Dos archives deterministas produjeron SHA-256 `6249542052c99022b8327b23d116c7642aa172696f1fabedd324a3b029a508fa`; el boot aislado expected-red falló únicamente por `runtime-policy-store.ts`, sin contenido prohibido, secretos ni listener residual.
- **Estado:** no hubo VPS, provider, PostgreSQL real ni deploy. F3R2 queda como próximo batch local ejecutable; F3R3+ no comenzó y F3R5 conserva gate nuevo.

##### F3R2 — Core Extraction (complete)

**Alcance:** extraer lógica pura a core; dejar adapters KV en proxy con imports/reexports compatibles; cambiar projections API a core sin alterar outputs.

**Done:** el guard API → proxy queda verde; tests existentes de runtime/recipe store y proyecciones API conservan valores y shape; `defaults.recipePolicy` sigue presente.

**Checks:** `bun test` focal en core y stores proxy; `cd cloud/fixvox-api && bun test tests/app.test.ts` más test focal de projections; LSP/Pi Lens sobre superficies tocadas.

**Rollback:** revertir extracción e imports como un bloque local; no tocar bundle remoto ni estado VPS.

**Receipt F3R2 — 2026-07-20:**

- **Decisión:** runtime/recipe puros son product-owned en core; proxy conserva adapters/reexports KV y API importa sólo core.
- **Evidencia durable:** core 24, proxy focal 13, projections 2, boundary 2 y app 17 tests verdes; hashes/shapes permanecen congelados, `defaults.recipePolicy` sigue presente y core no incorpora infraestructura.
- **Estado:** no hubo VPS, provider, DB real ni deploy. F3R3 quedó como siguiente batch local.

##### F3R3 — Exact Bundle Proof (complete)

**Alcance:** ajustar closure/manifest local si hace falta, construir dos archives deterministas, extraer uno en un directorio aislado y arrancar desde esa copia con mock providers, DB fixture no contactada y puerto local efímero; consultar sólo `/health` y terminar el proceso.

**Done:** ambos archives tienen el mismo hash; no contienen proxy, tests, `.env`, artifacts ni secretos; el proceso resuelve todos los módulos desde el archive extraído, `/health` responde 200 y no usa checkout/node_modules externos.

**Checks:** `bash ops/fixvox-api/tests/assets-smoke.sh`; nuevo smoke de boot exacto; allowlist, manifest/file hashes, privacy sentinel y proceso/listener cleanup.

**Rollback:** borrar artifacts ignorados y revertir assets/smoke locales; la release VPS preservada no se toca.

**Receipt F3R3 — 2026-07-20:**

- **Evidencia durable:** dos builds idénticos produjeron SHA-256 `a830b164c8fd42bf5f3524c01b6f90e0b57baee44a1a12d901a30c2fd46f1dde`; el archive aislado respondió `/health` 200 sin proxy, tests, `.env`, artifacts, `node_modules` ni secretos.
- **Aislamiento:** la DB sentinel no fue contactada; el proceso cerró por SIGTERM y dejó el puerto reutilizable, sin fallback al checkout.
- **Estado:** no se consultó `/ready` ni hubo VPS, provider/DB real o deploy. F3R4 queda como próximo batch local ejecutable.

##### F3R4 — Local Review Gate

**Alcance:** correr la escalera completa local, revisar diff y blast radius, actualizar track/spec/runbooks y luego el espejo Infra en serie; registrar hash nuevo sin transferirlo.

**Done:** tests focales y amplios, contract parity aplicable, diagnostics, context audit y `git diff --check` verdes; el foco pasa a `waiting_gate` con referencia al track y decisión explícita sobre F3R5.

**Checks:** `npm run cloud:test`; `cd cloud/fixvox-api && bun run test:unit`; `npm run cloud:contract:parity` cuando el PostgreSQL fixture local esté disponible; smokes de assets/boot; LSP/Pi Lens; `bun run context:index`; `bun run context:audit`; `git diff --check`.

**Rollback:** sólo docs/estado local de review; no autoriza ni ejecuta F3R5.

**Receipt F3R4 — 2026-07-20:**

- **Reparación acotada:** la proyección Bun de `admin-runtime-policy` ahora conserva los `selectionPresets` persistidos (incluyendo defaults de `schemaVersion`/`source`) y no publica `groupOptions` interno en ese DTO; `defaultPolicy` sigue siendo el default congelado de core. No cambiaron DTOs/defaults efectivos ni desapareció `defaults.recipePolicy`; no hubo import API → proxy ni infraestructura en core.
- **Parity:** 27 fixtures aplicables comparados; `missingWorker/mismatches = 0/0`, incluido `admin-runtime-policy → bodySchema`; `cloud:contract:parity` quedó verde.
- **Checks:** `npm run cloud:test` **154/154**; `cd cloud/fixvox-api && bun run test:unit` **29/29**; contract runner focal **2/2**; assets smoke verde; boot exacto desde archive aislado **health=200**, cleanup y puerto efímero verdes; TypeScript diagnostics limpio; `context:index`, `context:audit` y `git diff --check` quedan como cierre documental.
- **Archive/hash:** build determinista local `9afa5dc85b783793b25573ff50d5d6b918afc83f95880c6231f8b44c42f7bb0d`; se registra sólo como evidencia local, sin transferirlo ni usarlo para F3R5.
- **Estado:** proyecto y espejo Infra actualizados en serie. Checkpoint F queda en `waiting_gate`; F3R5 requiere autorización nueva explícita. No se tocó VPS, servicio, `current`, hash remoto, provider, import, DNS/Tunnel ni tráfico público.

##### F3R5 — VPS Retry (complete)

**Alcance:** únicamente tras autorización nueva, transferir el bundle/hash aprobados, crear una release inmutable nueva, mover `current`, verificar unit y arrancar provider-free en loopback.

**Done:** exactamente un listener `127.0.0.1:8790`; `/health` y `/ready` 200; schema v4, jobs y `cloudflare-authority` verdes; Admin `8787` intacto y cero ruta pública.

**Checks:** preflight vigente, hash antes/después, release/current, systemd, listener, health/readiness, logs allowlisted, recursos y privacy sentinel.

**Rollback:** detener/deshabilitar unit y restaurar `current` a la release preservada `cdda90ea76d4c361`; no borrar releases ni tocar F2 sin gate destructivo separado.

**Receipt F3R5 — 2026-07-20:**

- **Resultado:** con autorización explícita nueva se transfirió y desplegó el bundle aprobado `9afa5dc85b783793b25573ff50d5d6b918afc83f95880c6231f8b44c42f7bb0d`; staging, manifest y release coinciden. Se creó la release inmutable `9afa5dc85b783793` y `current` apunta a ella; `cdda90ea76d4c361` permanece preservada.
- **Preflight/DB:** Ubuntu/Bun, recursos y `8790` libre pasaron; `MemAvailable=2483080 KiB`, `/` libre `58974004 KiB`; PostgreSQL acepta, schema v4 y los 4 checksums de migración coinciden; authority `cloudflare-authority`.
- **Servicio:** `systemd-analyze --user verify` verde; user unit enabled/active/running, `NRestarts=0`; exactamente un PID/listener en `127.0.0.1:8790`, sin wildcard/public bind. `/health` y `/ready` devolvieron HTTP 200; readiness confirmó DB/schema/jobs y `cloudflare-authority`.
- **Guardas:** Admin `127.0.0.1:8787` siguió active y HTTP 200; env allowlist y `FIXVOX_API_MOCK_PROVIDERS=true` pasaron; journal redacted allowlisted con 4 eventos y privacy sentinel limpio. El checkout VPS dirty conservó 19 entradas y su fingerprint; no hubo provider real, import, DNS/Tunnel, reverse proxy, tráfico público, Coolify/Zulip, commit ni push.
- **Estado:** F3R5 completo. F4-F6 no comenzaron y requieren autorización separada; no se acumularon receipts en `docs/WORKING_MEMORY.md`.

**Riesgos específicos:**

| Riesgo | Mitigación |
| --- | --- |
| Drift al mover defaults extensos | Caracterización antes de mover, reexports proxy y comparación profunda de DTO/defaults. |
| Core contaminado con KV/Cloudflare | Core acepta sólo datos/funciones puras; stores y puertos externos permanecen en proxy. |
| Compatibilidad desktop rota | Preservar `defaults.recipePolicy`, features, defaults, transport y register/preflight shapes. |
| Smoke falso por fallback al checkout | Ejecutar desde archive extraído, con cwd aislado y guard explícito contra imports/rutas externas. |
| Bundle no determinista o demasiado amplio | Dos builds idénticos, allowlist estricta, hashes por archivo y exclusión explícita de proxy/secrets/tests. |
| Colisión con trabajo dirty ajeno | Ediciones acotadas, sin revertir cambios preexistentes y revisión de diff por superficie. |
| Retry remoto prematuro | F3R4 termina en `waiting_gate`; F3R5 necesita autorización nueva y ocurre sólo después de los batches locales. |

**Stop conditions de recuperación:**

- cambia cualquier DTO/default o desaparece `defaults.recipePolicy` sin decisión de producto nueva;
- API conserva o agrega imports runtime hacia `fixvox-proxy`;
- core necesita KV, Cloudflare, request handlers o adapters de infraestructura;
- el archive requiere checkout, `node_modules` o archivos fuera de su allowlist;
- boot exacto no alcanza `/health` o deja proceso/listener residual;
- el bundle incluye proxy, tests, `.env`, artifacts, secrets o contenido sensible;
- hashes deterministas divergen o el nuevo closure exige una dependencia/install no autorizada;
- hace falta VPS, provider real, import, DNS/Tunnel o tráfico público antes de F3R5;
- los cambios ajenos dirty no pueden separarse con seguridad del slice;
- una reparación acotada no deja verdes los contratos y el boot exacto.

### Batch F4 — Operations, Maintenance And Encrypted Backup

**Alcance:** instalar wrappers health/readiness/status/logs/maintenance/backup y timers user con jitter/lock. Backup custom se comprime y cifra con recipient público; manifiesto conserva sólo schema, authority, counts y hashes seguros.

**Done:** timer visible; ejecución manual produce backup `.age` + manifest redacted con permisos restrictivos; logs no contienen audio, transcript, prompt, credenciales, URLs con password ni request bodies.

**Checks:** `systemctl --user list-timers`, `systemd-analyze --user verify`, wrappers/smokes, ejecución manual, lock collision, encabezado/formato age sin decrypt, hash, manifest allowlist, ownership/modos, health/readiness/Admin, journal allowlisted/redacted y privacy sentinel.

**Receipt F4 — 2026-07-21:**

- `operations.sh --execute --approved-f4` instaló/actualizó health, readiness, status, logs, maintenance y backup bajo `/home/jpsal/.local/bin/`, más los dos services y dos timers user bajo `/home/jpsal/.config/systemd/user/`; todos quedaron `jpsal` con wrappers `0755` y units `0644`.
- `systemd-analyze --user verify`, daemon-reload, enable/start y `systemctl --user list-timers` pasaron. Los timers son `Persistent=true` con jitter de `15min` (maintenance) y `30min` (backup); los services usan `UMask=0077` y locks `flock -n`.
- Maintenance y backup ejecutados manualmente y vía service con `Result=success`. El pipeline validado fue `pg_dump custom → zstd → age` usando únicamente el recipient público; no se usó decrypt ni identidad privada.
- Backup `.dump.zst.age` + manifest paired quedaron bajo backup dir `0700`, ambos owner `jpsal`/mode `0600`; encabezado age, SHA-256, allowlist del manifest y ausencia de temporales pasaron. El manifest contiene sólo `encryptedSha256` y `database` con `schemaVersion`, `authority`, `counts` y `projectionHashes`, con `cloudflare-authority`.
- Colisiones concurrentes de maintenance/backup fallaron cerradas sin crear un backup extra. Health/readiness (`cloudflare-authority`), Admin `/healthz` 200, listener único loopback `8790`, recursos, logs allowlisted y privacy sentinel pasaron. No aparecieron audio, transcript, prompt, request body, credenciales ni URLs con password.
- No hubo decrypt, restore, restart/rollback de releases, provider, import, DNS/Tunnel, tráfico público, commit ni push.

**Rollback:** deshabilitar/remover sólo timers/wrappers F4 y conservar el último backup válido hasta completar F5.

### Batch F5 — Restart, Rollback And Isolated Restore Rehearsal

**Alcance:** ensayar restart del service, rollback al release anterior, retorno al release actual, decrypt y restore en una DB temporal aislada; validar schema/authority/counts/hashes y borrar la DB temporal sólo al final aprobado.

**Done:** restart y ambos releases pasan health/readiness; restore aislado coincide con manifest; API principal y Cloudflare no reciben tráfico ni mutaciones.

**Checks:** PID cambia de forma controlada, symlink/hash esperado, `pg_restore --exit-on-error`, comparador de manifest y confirmación `cloudflare-authority` en original y restore.

**Rollback:** detener el rehearsal, volver al último release sano y preservar backup/evidencia redacted. Si el restore diverge, Checkpoint F queda bloqueado.

**F5 blocked receipt — 2026-07-21:**

- **Guard crítico:** no existe un target de rollback distinto de `9afa5dc85b783793` que sea conocido, aprobado y comprobable como arrancable. En el VPS sólo existen `9afa5dc85b783793` y `cdda90ea76d4c361`; la segunda es la release con dependency closure defectuoso y conserva imports runtime hacia `fixvox-proxy`. No se movió `current`, no se reinició por rollback y no se creó otra release.
- **Estado preservado:** `current` sigue exactamente en `/home/jpsal/opt/fixvox-api/releases/9afa5dc85b783793`; `fixvox-api.service` sigue `enabled/active/running`, con un PID y un listener `127.0.0.1:8790`; `/health` y `/ready` siguen HTTP 200 con `cloudflare-authority`; Admin `127.0.0.1:8787` sigue activo/200. `MemAvailable` fue `2601444 KiB`, `/` libre `58971424 KiB`, y el checkout VPS dirty conservó 19 entradas.
- **F4 preservado:** los timers maintenance/backup siguen visibles y los dos pares de backup `.dump.zst.age`/manifest permanecen bajo el backup dir protegido; no se seleccionó, descifró ni transfirió ningún backup. No se ejecutó `pg_restore`, no se creó DB temporal, no hubo drop, y la identidad privada no está en el VPS.
- **Resultado:** F5 bloqueado fail-closed antes de cualquier transición, decrypt o restore. Cloudflare conserva authority/hot path; no hubo tráfico público, mutaciones, provider, import, DNS/Tunnel, checkout VPS, commit ni push.

#### Recovery Plan F5 — Healthy Control Release And Rehearsal

**Objetivo:** desbloquear T041 sin inventar una versión funcional nueva: producir una release control content-identical al runtime aprobado `9afa5dc85b783793`, promoverla de forma explícita y usar `9afa5dc85b783793` como rollback sano durante los ensayos de restart, rollback y restore aislado.

**Decisión operativa:** la release control difiere sólo en metadata determinística del archive. Cada archivo runtime extraído debe conservar exactamente el SHA-256 del manifest `9afa…`; no se modifica código, package metadata, configuración ni comportamiento. Esto valida la mecánica inmutable de release/symlink/systemd sin reutilizar `cdda90ea76d4c361`, sin construir desde el checkout dirty y sin introducir drift funcional.

**No objetivos:**

- No reparar, desplegar, iniciar ni borrar `cdda90ea76d4c361`.
- No usar el checkout VPS ni reconstruir desde cambios locales no aprobados.
- No cambiar código, DTOs, defaults, schema, authority, provider mode o datos principales.
- No copiar la identidad privada `age` al VPS ni imprimir credenciales o URLs protegidas.
- No ejecutar provider, import, DNS/Tunnel público, canary, cutover, F6, commit, push o publish.

##### F5R1 — Local Rollback Control Release Proof (`complete`)

**Alcance:** agregar un builder/control smoke local que tome únicamente el archive+manifest aprobado `9afa…`, verifique su hash y file manifest, extraiga a staging aislado y lo reempaquete con un epoch control fijo y documentado. Producir dos archives control y manifests idénticos entre sí, con release ID distinto de `9afa…`, y comparar todos los hashes runtime extraídos contra el manifest fuente.

**Done:** dos builds control tienen el mismo SHA-256; su hash/release ID difiere de `9afa…`; el conjunto de paths y cada byte runtime coinciden con `9afa…`; manifest control registra de forma segura source hash, propósito y epoch; allowlist/privacy pasan; boot aislado alcanza `/health` 200 y limpia proceso/puerto. No hay acceso VPS.

**Checks:** source archive SHA exacto; manifest schema/allowlist; dos builds deterministas; comparación path+SHA por archivo; exclusión de proxy/tests/`.env`/artifacts/secrets; archive boot aislado; assets smoke; diagnostics de scripts/docs; context index/audit y `git diff --check`.

**Rollback:** borrar artifacts control ignorados y revertir sólo builder/smokes/docs F5R1.

**Receipt F5R1 — 2026-07-21:**

- **Resultado:** el builder `ops/fixvox-api/rollback-control.sh` aceptó únicamente el archive y manifest aprobados de `9afa…`; verificó el SHA del archive `9afa5dc85b783793b25573ff50d5d6b918afc83f95880c6231f8b44c42f7bb0d` y el manifest aprobado `62969be6d7fbef3c99f019f9f9cb26d54a97fecdf2832e8a8ca8d998e71dd6e8` antes de extraer.
- **Determinismo/identidad:** dos builds independientes produjeron el archive control `b18a1e92ad3ef9707f733ffdeecf3a8e2f42967b1935df725d501521e288f28c` y manifest idénticos; release ID `b18a1e92ad3ef970` y SHA difieren de `9afa…`. El único cambio del archive es metadata determinística con `controlDateEpoch=946684801`; los 54 paths runtime y sus SHA coinciden byte a byte con el source.
- **Allowlist/boot:** proxy, tests, `.env`, artifacts, Git, `node_modules`, links, special files y secret sentinels quedaron excluidos; el smoke focal arrancó sólo desde la extracción candidate aislada, devolvió `/health` 200 y liberó proceso/puerto sin fallback al checkout.
- **Estado:** no hubo `bundle.sh` desde checkout, VPS, cdda…, provider, install, deploy, restart, decrypt, restore, DB, commit, push ni publish. F5R2-F5R4 y F6 siguen gated.

##### F5R2 — VPS Forward Candidate Promotion (`superseded`)

**Estado reconciliado:** no ejecutar. La autorización histórica correspondía a una control release byte-identical a `9afa…` y a schema 4. La cadena posterior culminó en `4075da53c365a8b1` como current sobre schema 6, `66652d0fa6073c26` como rollback inmediato y `90ca…`/`c0deb…` como rollbacks anteriores compatibles. Mover `current` a la candidate de F5R2 violaría el baseline vigente.

El objetivo operativo de disponer de un rollback sano ya quedó cubierto por releases posteriores. Esta supersesión no autoriza restart rehearsal, rollback, decrypt, restore ni cleanup.

##### F5R3 — Restart And Application Rollback Rehearsal (`gated / replan required`)

Antes de pedir autorización debe escribirse un batch nuevo y exacto sobre `current=4075da53c365a8b1`, rollback inmediato `66652d0fa6073c26` y schema 6. La autorización vieja de F5R2 no aplica. El rehearsal seguirá separado de provider, canary, decrypt y restore.

El nuevo contrato debe congelar transiciones, health/readiness/Admin por etapa, PID/listener, journal redacted, retorno final a `4075da53…` y rollback automático a la última release sana verificada.

##### F5R4 — Off-Host Decrypt And Isolated Restore Rehearsal (`gated / replan required`)

Antes de pedir autorización debe confirmarse un backup/manifest compatible con schema 6 y actualizar el comparador esperado. No usar el supuesto histórico de schema 4. La identidad privada permanece off-host; la API principal no se reinicia ni usa la DB temporal.

Si un restore futuro diverge, la DB temporal y evidencia redacted se preservan; sólo el plaintext off-host se limpia de forma segura. Eliminar evidencia o una DB divergente requerirá un gate destructivo posterior.

**Stop conditions de recuperación F5 reconciliada:**

- falta un plan nuevo y autorización explícita para el sub-batch exacto;
- `current`, rollback, schema 6, hashes o `cloudflare-authority` no coinciden con el baseline vivo;
- la release elegida no está preservada, inmutable y comprobada sobre schema 6;
- aparece bind no-loopback, tráfico público, provider, import o cambio de schema/authority;
- el backup/manifest seleccionado no declara schema 6 o la identidad privada tendría que copiarse al VPS;
- restore toca otra DB, diverge del manifest o cleanup eliminaría evidencia útil;
- cambios dirty ajenos no pueden separarse o una reparación acotada no deja el batch verde.

### Batch F6 — Private Verification And Gate F Closure

**Alcance:** verificar exclusivamente con host-local requests y, opcionalmente, túnel SSH local sin DNS. Ejecutar health/readiness y contratos provider-free mínimos; revisar recursos, timers, backups, logs y runbooks.

**Done:** Gate F completo: loopback service, restart, application rollback, encrypted backup y isolated restore verdes; Cloudflare sigue authority/hot path y el VPS no recibe tráfico público.

**Checks:** `curl 127.0.0.1:8790`, SSH tunnel local-only, contract smoke provider-free, `ss`, systemd failed units, recursos, privacy scan, docs/index/audit y `git diff --check`.

**Rollback:** apagar `fixvox-api.service`; no hay routing que revertir. PostgreSQL sigue no autoritativo y no se elimina sin gate destructivo separado.

## Riesgos Y Mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| RAM/swap degradada en VPS de 2 vCPU | Preflight y checks por batch; detener si memoria disponible cae bajo el umbral del runbook o aparece presión sostenida/OOM. |
| Colisión de puerto | `8790` fijado y comprobado antes de cada start; nunca fallback automático a bind público. |
| Contaminar DBs existentes | PostgreSQL host-managed y roles/DB Fixvox explícitos; prohibido inspeccionar/reusar containers Coolify/Zulip. |
| Deploy no reproducible desde dirty checkout | Bundle inmutable local con manifest/hash; checkout VPS queda intocable. |
| Secretos en logs/docs/history | Env `0600`, wrappers redacted, argumentos sin valores, sentinel scans y fail-closed. |
| Backup ilegible o clave sólo en VPS | Recipient público en VPS, clave privada off-host, restore rehearsal obligatorio antes de cerrar F. |
| Cambiar autoridad accidentalmente | Readiness y checks exigen `cloudflare-authority`; no hay import ni ruta pública. |
| Provider confundido con alcance F | Checkpoint F permanece provider-free; activación y canary viven sólo en `vps-persistent-provider-canary-plan.md`. |

## Stop Conditions

Detener el batch activo y dejar Checkpoint F bloqueado si:

- `8790` está ocupado o la API intenta bind distinto de loopback;
- recursos caen bajo el umbral documentado, hay OOM o degradación de otros servicios;
- la instalación propone reutilizar DB/container/volumen de Coolify o Zulip;
- el checkout VPS dirty/divergente debe modificarse para avanzar;
- schema/checksum/authority no coincide exactamente o aparece una migración ahead;
- se expone un secreto, request body, audio, transcript, prompt o URL con credenciales;
- no existe recipient público con clave privada off-host comprobable para backup;
- health/readiness, restart, rollback o restore fallan después de una reparación acotada;
- hace falta provider/OAuth real, import, DNS/Tunnel, canary, cutover o tráfico público;
- cambia el alcance autorizado, paquetes/comandos o aparece una dependencia nueva.

## Siguiente Acción

Checkpoint F queda diferido. No ejecutar F5R2: está superseded. F5R3, F5R4 y F6 requieren replan y autorización nueva. El foco elegido continúa en `docs/tracks/vps-persistent-provider-canary-plan.md`, sin heredar ninguna autorización de F5.
