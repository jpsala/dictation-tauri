---
status: stable
created: 2026-07-14
updated: 2026-07-14 (stable closeout)
owner: JP/Pi
related:
  - docs/tracks/fixvox-admin-profile-composer.md
  - docs/tracks/profile-composer-phase-3-rbac-publish-plan.md
  - docs/DECISIONS.md
source_refs:
  - cloud/fixvox-proxy/wrangler.toml
  - cloud/fixvox-proxy/src/control-plane-publish-lock.ts
  - cloud/fixvox-proxy/src/control-plane-store.ts
  - cloud/fixvox-proxy/src/index.ts
---

# Profile Composer: Cloudflare rollout seguro y auditable

## Alcance y decisión actual

Este track preparó el rollout y conserva el historial de sus gates. No autoriza por sí mismo mutación productiva, provider calls, login, commit ni push.

**Checkpoint post-rollout 2026-07-14:** se ejecutaron los gates B y C con autorización previa. `ADMIN_API_KEY` fue retirado; `ADMIN_VIEW_API_KEY` quedó presente; `ADMIN_EDIT_API_KEY` y `ADMIN_PUBLISH_API_KEY` están ausentes. El Worker Profile Composer fue desplegado con `--strict --keep-vars`: deploy de código versión 147 / `1286de9d-281c-49ad-ba42-add275d1a7fd`; la versión activa final, creada por el cambio de secret, es 148 / `02cc350a-a490-4261-bbc0-a3abdee88b91`. La migration `control-plane-profile-mutations-v1` y el binding `CONTROL_PLANE_PUBLISH_LOCKS -> ControlPlanePublishDurableObject` están activos. No hubo mutación Admin, publicación, rollback ni escritura KV manual; por tanto el DO sigue sin bootstrap y las tres claves de proyección permanecen ausentes.

**Checkpoint E 2026-07-14:** E fue autorizado y ejecutado. La Admin Web nueva fue sincronizada al VPS (server, identidad y assets); `fixvox-admin-web.service` quedó activo. Worker activo versión 151 / `4ce54e91-4e7c-4e1c-973c-579c72b7367a`: view + edit presentes, publish y legacy ausentes. Admin Web conserva edit-only server-side y no configura publish/legacy. Profiles y Audit devolvieron 200 mediante el broker; las tres proyecciones continúan ausentes.

Durante la verificación se detectó que draft/preview no exigían rol Google antes del broker. Se retiró inmediatamente edit para volver a read-only, se corrigió el gate (`viewer` no puede draft; editor/publisher/owner sí), se agregaron tests y luego se reactivó edit-only. La comprobación runtime del fallback token devuelve 403 para draft, sin tocar el DO. Chrome verificó después del login manual la UI autenticada: Profile Composer muestra Profiles/Engines/Prompts/Presets, perfiles publicados y sólo `Crear draft`; `/api/admin/rbac` resolvió `owner`. No hay controles publish/rollback visibles y publish continúa ausente. Evidencia visual redacted fuera del repo: `C:/Users/jpsal/fixvox-rollout-evidence/20260714-profile-composer-e-ui-authenticated.png`.

**Checkpoint D1 2026-07-14:** con autorización separada se creó por Admin Web -> Worker -> DO el draft real sin cambios de `pro`. Chrome muestra `Pro · Draft v2 · 9 funciones` (evidencia redacted: `C:/Users/jpsal/fixvox-rollout-evidence/20260714-profile-composer-d1-pro-draft.png`). Profiles/Audit devolvieron 200; `published` sigue v1, draft v2 está basado en v1 y su composición coincide con la publicada; historia permanece en 1 y audit en 0, sin publish/rollback. Las tres proyecciones y marker están presentes, schema v1 y comparten authority revision. Esto inicializa la autoridad DO sin cambiar perfil activo ni runtime.

Invariantes que no se pueden cambiar durante el rollout:

- `ControlPlanePublishDurableObject` es la autoridad única para snapshot de perfiles, drafts, historia, revisión, audit y última operación idempotente.
- `USAGE`/KV solo proyecta `control:profiles:v1`, `control:admin-audit:v1` y el marker `control:profiles:projection-commit:v1`.
- El object name es `control-plane-profile-mutations-v1`; el binding es `CONTROL_PLANE_PUBLISH_LOCKS`. Cambiar cualquiera crea otra identidad y no es un rollback.
- No se escribe manualmente ninguna de las tres claves de proyección durante ni después del rollout.
- Un snapshot KV sin marker es legacy solo mientras no exista ningún marker. Un marker aislado, una proyección parcial/inválida o una proyección completa sin autoridad DO previa fallan cerrado con `503`.

## Evidencia local observada

Marcar solo contra una ejecución de esta sesión; los valores remotos no se infieren de ella.

- [x] Se revisaron `wrangler.toml`, `control-plane-publish-lock.ts`, sus tests, las rutas Admin de `index.ts` y los readers/writers relevantes de `control-plane-store.ts`.
- [x] Búsqueda runtime observada: fuera de tests, las cuatro funciones de mutación de perfiles solo son llamadas por `control-plane-publish-lock.ts`; `index.ts` despacha create/save/publish/rollback mediante `CONTROL_PLANE_PUBLISH_LOCKS` y falla `503` si falta el binding.
- [x] `wrangler.toml` declara `CONTROL_PLANE_PUBLISH_LOCKS -> ControlPlanePublishDurableObject` y la migration `control-plane-profile-mutations-v1`, después de `usage-counters-v1`.
- [x] El focused Worker suite pasó: `88 passing`, incluyendo rechazo de proyección one-sided donde el peer profile/audit falta aunque el valor propio coincida con marker.
- [x] `npm run cloud:test` pasó: `133 passing` en 12 archivos.
- [x] `npm run test:pipeline` pasó: `449 passing` en 88 archivos.
- [x] `npm run build` pasó.
- [x] Admin server pasó: `7 passing`; ambos `node --check` pasaron.
- [x] Wrangler dry-run pasó: bindings `USAGE_COUNTERS`, `CONTROL_PLANE_PUBLISH_LOCKS` y `USAGE` visibles; upload local `475.27 KiB` (`91.04 KiB` gzip); output eliminado.
- [x] El artifact previo de Admin Web smoke existe: `artifacts/ui-spikes/admin-web-ui-smoke/20260714-140133/`; el smoke passing está documentado en los tracks previos, no se reejecutó en esta sesión.
- [x] `git diff --check` pasó; `bun scripts/context-index.ts` regeneró el índice y `bun scripts/agent-context-audit.ts` informó `0 errors, 3 warnings`.
- [x] Revisión final del plan corrigió tres riesgos operativos: inicialización temprana de `CF_EVIDENCE`, preservación de variables remotas con `--keep-vars` y aprobación/hash del bundle completo generado desde el worktree sucio. También quedó explícito que cualquier request edit autorizado puede disparar el bootstrap antes de devolver un eventual `4xx`.
- [x] No se ejecutó deploy, provider call, mutación productiva, `secret put/delete`, `kv put/delete`, commit ni push en esta sesión.
- [x] Preflight remoto read-only observado el 2026-07-14 con evidencia fuera del repo en `C:/Users/jpsal/fixvox-rollout-evidence/20260714-154837Z/`; `whoami` autenticó con Account API Token, la cuenta coincidió con la cuenta Fixvox configurada y no se emitieron valores de credenciales.
- [x] El Worker activo remoto es `fixvox-proxy`, versión `89ac13c1-6f30-4478-9670-ba54abe84cf7`/`144`. La versión activa declara solo `migration_tag: usage-counters-v1`, no contiene `CONTROL_PLANE_PUBLISH_LOCKS` y no contiene la migration `control-plane-profile-mutations-v1`; esto confirma un estado pre-activación, no una identidad DO alternativa.
- [x] El namespace remoto `USAGE` existe y su ID coincide con el `wrangler.toml` local. Las tres claves consultadas devolvieron `404 Not Found`; el validator redacted resultó `LEGACY_KV_OK`, interpretando la ausencia como KV legacy vacío. No hubo ninguna escritura.
- [x] Se inventariaron nombres de secrets sin valores. Entre los nombres remotos figura `ADMIN_API_KEY`; no aparecen `ADMIN_EDIT_API_KEY` ni `ADMIN_PUBLISH_API_KEY`. El token local usado para leer tiene permisos de escritura, por lo que sigue prohibido usarlo para mutaciones en esta sesión.
- [x] El worktree sucio fue capturado fuera del repo: 74 entradas de estado y manifiesto con 32 hashes (29 archivos `src` más configuración/package files). El bundle completo sigue sin aprobación explícita para deploy.
- [x] Revisión local del bundle observada después del preflight: 8 paths Worker tracked modificados y 2 archivos `control-plane-publish-lock` untracked; `git diff --check` scoped al Worker y verificación completa del manifiesto de hashes pasaron. El diff de configuración agrega únicamente la versión de Wrangler y el binding/migration DO declarados; no se ejecutó deploy.

## 1. Precondiciones

- [ ] Autorización explícita de JP para la ventana de rollout; esta aprobación es separada de la aprobación de esta preparación.
- [ ] Cuenta Cloudflare, Worker `fixvox-proxy`, namespace `USAGE` y dominio `auth-fixvox.jpsala.dev` confirmados por el operador, sin imprimir tokens ni secrets.
- [x] Identidad y cuenta activa verificadas sin exponer credenciales mediante evidencia fuera del repo. Inicializar primero la evidencia fuera del repo:

  ```bash
  export CF_EVIDENCE="$HOME/fixvox-rollout-evidence/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$CF_EVIDENCE"
  chmod 700 "$CF_EVIDENCE"
  cd C:/dev/dictation-tauri/cloud/fixvox-proxy
  ./node_modules/.bin/wrangler whoami --json > "$CF_EVIDENCE/wrangler-whoami.json"
  ./node_modules/.bin/wrangler deployments list --name fixvox-proxy --json > "$CF_EVIDENCE/deployments.json"
  ./node_modules/.bin/wrangler versions list --name fixvox-proxy --json > "$CF_EVIDENCE/versions.json"
  ./node_modules/.bin/wrangler secret list --name fixvox-proxy > "$CF_EVIDENCE/secret-names.txt"
  ```

  `CF_EVIDENCE` debe estar fuera del repo, con permisos restringidos; no se debe guardar el contenido de ningún secret. En esta ejecución quedó en `C:/Users/jpsal/fixvox-rollout-evidence/20260714-154837Z/`.
- [x] Worktree revisado sin limpiarlo ni hacer stash/revert de cambios ajenos. El deploy empaqueta **todo** el Worker actual, incluidos cambios no relacionados y archivos untracked importados por el bundle; `--strict` no protege contra un worktree local sucio. Antes de desplegar, aprobar explícitamente el diff/bundle completo y guardar un manifiesto de hashes fuera del repo:

  ```bash
  cd C:/dev/dictation-tauri
  git status --short > "$CF_EVIDENCE/git-status.txt"
  git diff --check
  find cloud/fixvox-proxy/src -type f -print0 | sort -z | xargs -0 sha256sum > "$CF_EVIDENCE/worker-source.sha256"
  sha256sum cloud/fixvox-proxy/wrangler.toml cloud/fixvox-proxy/package.json cloud/fixvox-proxy/package-lock.json >> "$CF_EVIDENCE/worker-source.sha256"
  ```

  Si no se aprobó exactamente ese bundle acumulado, **NO-GO**; no desplegar solo porque los tests pasan.
- [x] Se guardaron resultados de backup/hash fuera del repo, sin imprimir valores. Las tres lecturas remotas fueron `404 Not Found` y el validator produjo `LEGACY_KV_OK`; el backup es solo para diagnóstico/contingencia y no autoriza `kv key put`.
- [ ] Se congelaron temporalmente dashboard scripts, jobs y operadores que puedan escribir `control:profiles:v1`, `control:admin-audit:v1` o el marker. Los únicos writers soportados son las rutas Worker que despachan al DO.
- [ ] Se confirmó que no hay un rollout anterior a medio aplicar ni una migration pendiente.

## 2. Backup y validación de KV legacy

Ejecutar únicamente con autorización remota. Usar el namespace configurado `USAGE`/ID de producción, nunca `--preview` ni storage local. Reutilizar el `CF_EVIDENCE` inicializado en precondiciones y no activar shell tracing:

```bash
: "${CF_EVIDENCE:?Inicializar CF_EVIDENCE en precondiciones}"
cd C:/dev/dictation-tauri/cloud/fixvox-proxy
mkdir -p "$CF_EVIDENCE/kv-legacy"
chmod 700 "$CF_EVIDENCE" "$CF_EVIDENCE/kv-legacy"
./node_modules/.bin/wrangler kv key get control:profiles:v1 --remote --binding USAGE --text > "$CF_EVIDENCE/kv-legacy/control-profiles-v1.json"
./node_modules/.bin/wrangler kv key get control:admin-audit:v1 --remote --binding USAGE --text > "$CF_EVIDENCE/kv-legacy/control-admin-audit-v1.json"
./node_modules/.bin/wrangler kv key get control:profiles:projection-commit:v1 --remote --binding USAGE --text > "$CF_EVIDENCE/kv-legacy/control-projection-commit-v1.json"
sha256sum "$CF_EVIDENCE"/kv-legacy/* > "$CF_EVIDENCE/kv-legacy.sha256"
```

Validar localmente los archivos de backup sin volcar su contenido. El resultado debe ser solo `LEGACY_KV_OK` o `LEGACY_KV_NO_GO`:

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const dir = process.env.CF_EVIDENCE + "/kv-legacy";
const read = (name) => {
  const raw = readFileSync(`${dir}/${name}`, "utf8").trim();
  if (!raw || /not found|key does not exist/i.test(raw)) return null;
  return JSON.parse(raw);
};
const profile = read("control-profiles-v1.json");
const audit = read("control-admin-audit-v1.json");
const marker = read("control-projection-commit-v1.json");
const plain = (v) => v && typeof v === "object" && !Array.isArray(v);
const legacyProfile = profile === null || (plain(profile) && profile.schemaVersion === 1 && plain(profile.profiles) && !Object.hasOwn(profile, "projection"));
const legacyAudit = audit === null || (plain(audit) && audit.schemaVersion === 1 && Array.isArray(audit.records) && !Object.hasOwn(audit, "projection"));
if (!legacyProfile || !legacyAudit || marker !== null) {
  console.error("LEGACY_KV_NO_GO");
  process.exit(2);
}
console.log("LEGACY_KV_OK");
NODE
```

**NO-GO inmediato:** marker presente, cualquier `projection` presente, JSON/schema legacy inválido, una proyección revisionada parcial o namespace distinto. La ausencia legítima de una o ambas claves legacy se trata como estado legacy vacío, no como proyección parcial. En el preflight del 2026-07-14 las tres claves devolvieron `404 Not Found` en el namespace correcto y el resultado fue `LEGACY_KV_OK`. No intentar reparar escribiendo KV: preservar backup y detenerse. El código no reconstruye autoridad DO desde una proyección revisionada sin autoridad existente.

## 3. Migration y binding

- [x] La configuración local contiene el orden declarativo actual: `usage-counters-v1` y luego `control-plane-profile-mutations-v1`.
- [x] La versión activa remota confirma que `control-plane-profile-mutations-v1` aún no fue aplicada: `migration_tag` remoto `usage-counters-v1` y ausencia de `CONTROL_PLANE_PUBLISH_LOCKS`.
- [ ] `CONTROL_PLANE_PUBLISH_LOCKS` apunta a la clase exacta `ControlPlanePublishDurableObject`; no cambiar `class_name`, binding ni `CONTROL_PLANE_PROFILE_MUTATION_OBJECT_NAME`.
- [ ] La migration se aplica junto con el Worker correcto y no con un config/env alternativo. No crear otro namespace, otro name o una migration con tag renombrado.
- [x] El binding remoto `USAGE` resuelve al ID de producción declarado en `wrangler.toml`; `preview_id` no se usó en el preflight.
- [ ] El dry-run fue revisado por binding, migration, tamaño y ausencia de secrets antes del deploy.

El riesgo de ordering es irreversible: Durable Object migrations son append-only. No reordenar tags, no borrar `new_sqlite_classes`, no redeployar una versión vieja que elimine el binding y no interpretar un cambio de object name como rollback.

## 4. Activación controlada

No hay un feature flag de Profile Composer separado de las credenciales Admin. Por eso la ventana debe ser explícita:

1. Mantener solo lectura durante deploy. Inventariar primero los nombres de secrets; no leer valores.
2. Si existen credenciales que conceden `edit` o `publish`, deshabilitarlas durante la ventana. Esto también bloquea otros Admin writes que usen esos tokens y debe aprobarse como mantenimiento:

   ```bash
   cd C:/dev/dictation-tauri/cloud/fixvox-proxy
   ./node_modules/.bin/wrangler secret delete ADMIN_PUBLISH_API_KEY --name fixvox-proxy
   ./node_modules/.bin/wrangler secret delete ADMIN_EDIT_API_KEY --name fixvox-proxy
   ./node_modules/.bin/wrangler secret delete ADMIN_API_KEY --name fixvox-proxy
   ```

   Conservar los valores en el secret manager del operador; nunca ponerlos en este track, shell history o logs. Si no se puede hacer esta compuerta sin afectar operaciones esenciales, **NO-GO**.
3. Con el backup y el gate confirmados, el único comando de deploy de este plan es:

   ```bash
   cd C:/dev/dictation-tauri/cloud/fixvox-proxy
   ./node_modules/.bin/wrangler deploy --strict --keep-vars --message "Profile Composer DO authority rollout 2026-07-14"
   ```

4. No habilitar publish todavía. Verificar health, lectura Admin y que un token de solo lectura no puede mutar. No usar un draft sintético para “probar” producción.
5. Restaurar primero el token edit-only y ejecutar la **primera operación real aprobada y previamente validada**. La inicialización del DO ocurre antes de evaluar la mutación: cualquier request edit autorizado que llegue al DO, incluso si luego devuelve `4xx`, puede bootstrappear autoridad y proyectar revision `0`. Por eso no usar payloads de prueba, inválidos ni sintéticos. La primera operación válida materializa o avanza el snapshot legacy y deja la historia publicada intacta hasta publicar. Restaurar publish solo después de verificar la proyección:

   ```bash
   ./node_modules/.bin/wrangler secret put ADMIN_EDIT_API_KEY --name fixvox-proxy
   # introducir el valor de forma interactiva; no pasarlo como argumento
   ./node_modules/.bin/wrangler secret put ADMIN_PUBLISH_API_KEY --name fixvox-proxy
   # ejecutar solo después de la verificación de autoridad/proyección
   ```

   No restaurar `ADMIN_API_KEY` legacy salvo una decisión explícita; preferir `ADMIN_VIEW_API_KEY`, `ADMIN_EDIT_API_KEY` y `ADMIN_PUBLISH_API_KEY` separados.

## 5. Verificación post-deploy y autoridad/proyección

Guardar respuestas fuera del repo y no imprimir headers de autorización ni cuerpos sensibles:

```bash
export FIXVOX_BASE_URL=https://auth-fixvox.jpsala.dev
read -r -s ADMIN_VIEW_TOKEN
export ADMIN_VIEW_TOKEN
curl --fail --silent --show-error "$FIXVOX_BASE_URL/health" > "$CF_EVIDENCE/health.json"
curl --fail --silent --show-error \
  -H "Authorization: Bearer $ADMIN_VIEW_TOKEN" \
  "$FIXVOX_BASE_URL/admin/control-plane/profiles" > "$CF_EVIDENCE/profiles-before.json"
curl --fail --silent --show-error \
  -H "Authorization: Bearer $ADMIN_VIEW_TOKEN" \
  "$FIXVOX_BASE_URL/admin/control-plane/audit" > "$CF_EVIDENCE/audit-before.json"
```

- [ ] Health responde `200` del Worker esperado.
- [ ] Lecturas Admin responden `200` para legacy limpio, sin raw Google subjects/emails, tokens ni payloads de provider.
- [ ] Un token view-only recibe `403` en drafts/publish/rollback; no se usa una mutación para probar esto.
- [ ] La primera operación real aprobada devuelve `200`; si la respuesta se pierde, repetir el **mismo payload exacto** es permitido y debe devolver `x-fixvox-idempotent-replay: true` sin segundo history/audit append.
- [ ] Leer las tres claves remotas y validar, sin imprimir, que `profile.projection.authorityRevision == audit.projection.authorityRevision == marker.authorityRevision`, todos con `schemaVersion: 1`. Un valor antiguo pero completo y con marker coincidente es consistente con eventual consistency; mezcla o ausencia es `NO-GO`/`503`.
- [ ] La autoridad DO se verifica indirectamente: request stale devuelve `409` sin nuevos writes; retry exacto es idempotente; nunca se asume autoridad por leer KV.
- [ ] No se hacen `kv key put`, deletes ni ediciones manuales para “alinear” revisiones.

## 6. Requests stale e idempotencia

Evidencia local completa: concurrencia serializada, expected active/draft stale antes de escribir, retry exacto, retry después de rehydration/KV stale y replay de rollback. En Cloudflare se debe ejecutar solo con una operación real aprobada:

- [ ] Capturar el payload exacto y su respuesta de primera publicación en evidencia restringida.
- [ ] Si hay timeout/resultado desconocido, repetir exactamente action + payload; no cambiar actor, confirmation ni expected versions.
- [ ] Un payload distinto con expected versions viejas debe quedar en `409`; no reintentar cambiando versiones automáticamente.
- [ ] Un replay no agrega una segunda entrada de historia ni audit.
- [ ] El object global es un throughput boundary intencional; no paralelizar publicaciones esperando objetos por perfil.

## 7. Audit e historia

- [x] Tests locales verifican historia inmutable, rollback append-only, audit stale preservado y revisiones monotónicas.
- [ ] Post-activation, la operación aprobada deja exactamente un `publish` (o el action elegido) y un audit record; `sourceVersion`, `resultingVersion` y `timestamp` coinciden con el resultado observado.
- [ ] Un rollback operativo siempre usa el endpoint/Admin Web con `expectedActiveVersion` y confirmation exacta `ROLLBACK <profileId> to v<version>`; nunca reescribe historia ni KV.
- [ ] Verificar que rollback agrega una versión nueva y un audit record, sin borrar la versión objetivo.
- [ ] Los errores stale/503 no agregan history ni audit.

## 8. Observabilidad redacted

- [ ] Durante la ventana, observar solo status, route, Worker version, latency y códigos sanitizados (`409`, `503`, `profile_projection_unavailable`, `profile_mutation_failed_closed`).
- [ ] Si se usa tail, filtrar por versión/status y no persistir request/response bodies, Authorization, cookies, Google subjects, account IDs, audio, transcripts o provider payloads:

  ```bash
  cd C:/dev/dictation-tauri/cloud/fixvox-proxy
  ./node_modules/.bin/wrangler tail fixvox-proxy --format json --status error --version-id "$VERSION_ID"
  ```

- [ ] Guardar solo hashes, conteos y timestamps redacted en `CF_EVIDENCE`; no copiar tail crudo al repo.
- [ ] Confirmar ausencia de provider calls/microphone en este rollout; Profile preview usa pricing cache y no llama providers.
- [ ] Finalizar tail y borrar cualquier evidencia temporal sensible fuera del repo según la política del operador.

## 9. Rollback operativo

### Rollback de perfil

Es el rollback normal y no es un rollback de Worker:

1. detener nuevas publicaciones;
2. obtener la versión activa actual desde lectura Admin;
3. ejecutar desde Admin Web el rollback autorizado hacia una versión histórica, con expected version y confirmation exactas;
4. verificar nueva versión publicada, historia completa, audit y proyección consistente.

Nunca editar `control:profiles:v1`, `control:admin-audit:v1` o el marker a mano.

### Emergency read-only gate

Ante `503`, mezcla de revisiones, errores de migration o comportamiento desconocido, retirar las credenciales edit/publish y dejar view-only. No borrar el DO ni el namespace KV. El DO debe rehidratar y reproyectar autoridad; si no lo hace, detenerse y conservar evidencia.

### Rollback de Worker

Un rollback de código no revierte datos ni migrations. Solo es admisible a una versión que conserve el mismo binding, clase y object name, y que no vuelva a escribir perfiles directamente en KV:

```bash
cd C:/dev/dictation-tauri/cloud/fixvox-proxy
./node_modules/.bin/wrangler rollback <COMPATIBLE_WORKER_VERSION_ID> \
  --name fixvox-proxy \
  --message "Emergency rollback; preserve Profile Composer DO authority" \
  --yes
```

- [ ] `COMPATIBLE_WORKER_VERSION_ID` fue identificado en `versions.json` y revisado contra el binding/migration.
- [ ] Nunca hacer rollback a una versión pre-DO que tenga writers KV directos; eso crea un out-of-band writer y puede perder o sobrescribir la autoridad.
- [ ] No revertir/borrar migrations ni cambiar el nombre del objeto para “volver atrás”. Si no existe una versión compatible, mantener read-only y pedir decisión de ingeniería.

## Riesgos y gates reales

| Riesgo | Control requerido | Estado |
| --- | --- | --- |
| Migration ordering/tag ya aplicado o duplicado | comparar historial remoto; no editar migrations append-only | [x] activo remoto pre-DO; [ ] gate final |
| Nueva identidad DO por cambio de binding/class/name | congelar `CONTROL_PLANE_PUBLISH_LOCKS`, class y `control-plane-profile-mutations-v1` | [x] local; [x] sin binding alternativo observado; [ ] activación |
| KV legacy parcial, inválido o ya revisionado sin autoridad DO | backup + validator; solo legacy sin marker bootstrapea | [x] local; [x] remoto legacy vacío |
| KV eventual consistency | aceptar solo valor/marker de la misma revisión; `503` ante mezcla | [x] local; [x] sin proyección remota observada |
| Rollback de código incompatible | usar solo Worker version compatible; profile rollback es append-only | [x] procedimiento; [ ] version remota |
| Bundle acumulado desde worktree sucio | aprobar diff y manifiesto de hashes completos; `--strict` no alcanza | [x] riesgo documentado; [ ] aprobación |
| Out-of-band writer/dashboard/script | freeze operativo; no `kv key put`; observar writers | [x] código/rutas revisadas; [ ] operativo |
| Credenciales habilitan mutaciones durante deploy | gate de secrets o mantenimiento equivalente | [ ] |
| Raw secrets/identities en observabilidad | tail y backups redacted fuera del repo | [x] preflight redacted; [ ] post-deploy |
| DO global como bottleneck | rollout sin paralelismo de publishers; monitorear latencia | [x] diseño local; [ ] remoto |

## Matriz local y comandos de cierre

Ejecutar desde el worktree actual, sin limpiar cambios ajenos:

```bash
cd C:/dev/dictation-tauri/cloud/fixvox-proxy
bun test src/control-plane-publish-lock.test.ts src/control-plane-store.test.ts src/managed-execution.test.ts

cd C:/dev/dictation-tauri
npm run cloud:test
npm run test:pipeline
npm run build
node --test admin/fixvox-web/server.test.mjs
node --check admin/fixvox-web/server.mjs
node --check admin/fixvox-web/public/app.js

a=cloud/fixvox-proxy/.wrangler-dry-run-review
cd cloud/fixvox-proxy
./node_modules/.bin/wrangler deploy --dry-run --outdir .wrangler-dry-run-review
cd ../..
rm -rf "$a"

git diff --check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

No marcar los gates locales hasta observar la salida de esta matriz después del último cambio.

## GO/NO-GO de este track

**Estado observado post C/B:** el Worker activo es versión 148 / `02cc350a-a490-4261-bbc0-a3abdee88b91`; su detalle remoto contiene la migration, binding y clase esperados. La consulta read-only confirmó `ADMIN_VIEW_API_KEY` presente y `ADMIN_EDIT_API_KEY`/`ADMIN_PUBLISH_API_KEY` ausentes. `/health` devolvió 200. Las tres claves de proyección continúan ausentes, que es consistente con no haber ejecutado una primera mutación autorizada.

**E está aplicado y verificado.** La Admin Web VPS usa el bundle Profile Composer y sólo declara `ADMIN_EDIT_API_KEY`; no tiene legacy ni publish. Las lecturas Profiles/Audit 200, el rechazo 403 del fallback token para draft y la sesión Google `owner` validan broker y RBAC. Chrome confirmó la UI autenticada y la ausencia de publish/rollback.

**Checkpoint P / publish 2026-07-14:** P fue autorizado: `ADMIN_PUBLISH_API_KEY` fue creado/configurado exclusivamente en Worker y Admin Web server; legacy sigue ausente y Worker conserva migration/binding/clase. Tras re-login Google, el preview read-only de `pro` devolvió v1 -> draft v2, diff tipado 0 y mostró el gate `Publish v2` con confirmación exacta server-side para rol owner. Con autorización posterior explícita de payload `PUBLISH pro v2`, la ruta Browser/Admin Web -> Worker -> DO publicó `pro` v2. Profiles/Audit devolvieron 200: published v2, sin draft, historia 2, audit 1 con `publish` exitoso v1 -> v2. Las tres proyecciones siguen schema v1 con authority revision consistente. Chrome recargado muestra `Pro · Published v2 · 9 funciones`. Evidencias redacted fuera del repo: `C:/Users/jpsal/fixvox-rollout-evidence/20260714-profile-composer-{p-publish-gate,publish-pro-v2}.png`. No hubo rollback ni KV mutation manual.

**Cierre read-only post-publicación 2026-07-14:** Worker 151 siguió activo; health, Profiles, Audit, Accounts y Devices devolvieron 200. Las tres proyecciones conservaron schema v1 y authority revision compartida; `pro` quedó v2, sin draft, historia 2 y un único audit publish v1 -> v2. Se observaron 6 devices con `pro`; la única account administrativa devuelta resuelve `power-admin`, que es su perfil administrativo. El request log mostró 8 transcripciones exitosas con perfil `pro` posteriores al publish: tráfico runtime normal, no provider calls disparadas por preview/publish. No hubo rollback, otra mutación Profile Composer, deploy ni escritura KV manual. La recomendación operativa es conservar edit/publish sólo server-side para próximas ventanas, protegidos por RBAC, preview/confirmación y audit; fallback/view permanece sólo lectura. Ajuste desplegado en Admin Web: draft/preview/lecturas usan sesión Google verificada + rol, mientras publish/rollback y roles siguen exigiendo OAuth Google reciente. Health y hash remoto verificados; el flujo interactivo fue validado luego mediante draft/preview de `jp` y publicación con re-login reciente. Evidencia redacted: `C:/Users/jpsal/fixvox-rollout-evidence/20260714-profile-composer-post-publish-close/`.

**Mutación autorizada JP 2026-07-14:** tras re-login Google reciente, Browser/Admin Web -> Worker -> DO publicó `jp` v1 sin la capability `postprocess`. Profiles/Audit/Accounts/Devices 200 confirmaron: sin draft, historia 1, un único audit publish, sin rollback, y la única account administrativa con su device activo resuelve `jp`. `pro` permanece Published v2. La validación interactiva confirmó el ajuste de autenticación: draft/preview funcionan con sesión Google verificada + rol; publish conserva OAuth reciente, confirmación tipada y audit. Evidencia redacted: `C:/Users/jpsal/fixvox-rollout-evidence/20260714-profile-composer-post-publish-close/{jp-v1-publish-account-assignment,jp-v1-runtime-resolution}.json`.

**Bug de integración detectado:** el primer dictado con `jp` fue negado antes del provider porque preflight y Devices componían sólo la runtime policy legacy; no aplicaban la definición Profile Composer publicada antes de resolver cuotas. Para un profile custom sin `policyAssignments` legacy, `quotaProfile: pro-unlimited` quedaba visible en el profile pero caía al fallback 20/120. No es un problema de postprocess ni exige tocar eventos/KV. Fix: `resolvePublishedRuntimePolicy` aplica la versión publicada para Devices/preflight. Regresión custom clone verifica límites 1M/10M; focused Worker 88, cloud 133 y Wrangler dry-run pasaron. Desplegado con autorización explícita como Worker 153 / `27d27754-069a-4a5f-bcd4-348d1f5b13b8`, preservando vars/secrets y binding/migration. Verificación read-only: health/Profiles/Audit/Accounts/Devices 200, `jp` v1 sin postprocess y límites efectivos 1M/10M, `pro` v2 intacto, sin audit/rollback adicional ni KV manual. Live dictation smoke posterior: evento `jp` `voice-transcription` proxied/success, provider request presente, sin error ni evento postprocess; evidencia redacted `jp-live-dictation-smoke.json` fuera del repo.

## Guardrails para reabrir el track

1. Releer `docs/.generated/context-index.md`, `docs/WORKING_MEMORY.md` y este track; ejecutar sólo health/Profiles/Audit/projection read-only si hay sospecha de drift.
2. Para una mutación futura, usar Admin Web con Google OAuth reciente y rol correspondiente; no manejar ni exponer tokens en browser, Pi o shell interactiva.
3. Draft/preview requieren rol; publish/rollback requieren además preview vigente, expected versions y confirmación tipada. Toda acción productiva requiere autorización explícita separada.
4. Mantener `ADMIN_VIEW_API_KEY`, `ADMIN_EDIT_API_KEY` y `ADMIN_PUBLISH_API_KEY` exclusivamente server-side. Legacy y fallback no obtienen mutación; no cambiar secretos sin autorización explícita.
5. Si aparece una proyección incoherente, `503` no explicado o acción audit inesperada: detener mutaciones, preservar evidencia redacted y decidir la compuerta read-only antes de cualquier rollback o cambio de secretos.

## Cierre estable

El rollout, la publicación inicial, el profile personal `jp`, el modelo de autenticación equilibrado y el fix de cuotas custom quedaron desplegados y verificados. No hay implementación pendiente necesaria para el uso actual. Reabrir sólo ante una necesidad concreta de UX/policy, drift remoto o fallo reproducible. Evidencia redacted canónica fuera del repo: `C:/Users/jpsal/fixvox-rollout-evidence/20260714-profile-composer-post-publish-close/`.
