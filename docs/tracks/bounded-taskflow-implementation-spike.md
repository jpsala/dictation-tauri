---
status: active
started: 2026-07-15
updated: 2026-07-17
priority: high
owner: Pi
related:
  - specs/019-fixvox-self-hosted-control-plane/tasks.md
  - docs/tracks/fixvox-self-hosted-checkpoint-d-closure-plan.md
  - docs/topics/agent-tool-routing.md
  - docs/WORKING_MEMORY.md
topic: bounded-taskflow-implementation-spike
source_refs:
  - .pi/taskflows/dictation-bounded-implementation-spike.json
  - .pi/taskflows/dictation-bounded-plan-implement-spike.json
  - cloud/fixvox-api/src/postgres/bootstrap-builtin-engine-prompt-catalog.ts
  - cloud/fixvox-api/tests/builtin-catalog-bootstrap.integration.test.ts
  - specs/019-fixvox-self-hosted-control-plane/contracts/product-route-disposition.md
  - tests/cloud-contract/product-route-disposition.test.ts
---

# Bounded Taskflow Implementation Spike

## Objetivo

Probar si un Taskflow pequeño puede reemplazar el relay manual JP → Pi → implementador → JP sin perder small batches, ownership ni verificación. El piloto automatiza un solo sublote de Spec 019: cerrar los integration tests PostgreSQL del bootstrap built-in de engines/prompts.

No busca automatizar Checkpoint D completo ni crear todavía un flow genérico.

## Hipótesis

Un flow con un solo writer, checks determinísticos y reviewer sólo ante fallo debería:

- evitar respuestas de implementación que sólo confirman alcance;
- reparar automáticamente hasta dos fallos concretos;
- reducir las intervenciones humanas a una aprobación inicial y un receipt final;
- costar una llamada de executor en el happy path;
- detenerse ante cualquier cambio de arquitectura, schema o efectos externos.

La hipótesis se considera falsa si el flow deriva de alcance, toca archivos no autorizados, necesita más de dos reparaciones, no puede producir evidencia verificable o requiere intervención manual equivalente al proceso actual.

## Baseline Manual

El proceso actual conserva buen control, pero JP actúa como canal entre sesiones. En este tramo se observaron repetidamente turnos que hicieron inventario o confirmaron el alcance sin editar, seguidos por prompts cada vez más pequeños. La carga humana principal no fue decidir arquitectura, sino copiar prompts, receipts y pedidos de continuación.

Estado técnico al preparar el spike:

- `bootstrapBuiltinEnginePromptCatalog()` existe con guard `fixvox_test`, transacción, advisory lock, idempotencia, conflictos fail-closed y manifest seguro.
- API unit: 17/17 y schema local v4 verificados por el implementador.
- Faltan integration tests reales de idempotencia, rollback, custom rows, privacidad, guard y concurrencia.
- Checkpoint D sigue provider-free/local; no se autoriza Profile Composer ni Checkpoint E.

## Flow Guardado

- Nombre: `dictation-bounded-implementation-spike`
- Scope: project
- Archivo: `.pi/taskflows/dictation-bounded-implementation-spike.json`
- FlowIR actual: `ir:f8be797347d83abf5fe0493742971ce3cc771758b44688dcb90e2b87b74e8086`
- Fases: `baseline → implement → {verify, scope-check} → quality-gate → receipt`
- Verificación estática revisión 2: PASS, 0 errores.
- Compile revisión 2: PASS, 6 fases.
- Warning intencional: `quality-gate` es la única ruta al receipt. Si agota reparaciones, el flow debe fallar cerrado y no producir un falso cierre.
- Estado: primer run falló en baseline sin tokens ni mutaciones; revisión 2 preparada, guardada y no reejecutada.

## Pilot Run 1 — Baseline Fail-Closed

- RunId: `dictation-bounded-implem-mrmqfume-09324b`
- FlowIR ejecutado: `ir:e8bdded298af83cae380282ae8330e626fc8b83eaabe3570368fb2795d527b33`
- Resultado: FAILED antes de invocar agentes.
- Duración: ~2,6 s.
- Fases completadas: 0/6.
- Llamadas LLM / tokens: 0 / 0.
- Reparaciones e intervenciones durante ejecución: 0.
- Archivos del repo tocados: ninguno.
- Causa: el baseline usó `powershell.exe`; en esta máquina Windows PowerShell no expone `Get-FileHash`, aunque PowerShell 7 (`pwsh`) sí.
- Comportamiento de seguridad: correcto; dependencias downstream se omitieron y no hubo fallback manual silencioso.

Este run no prueba la hipótesis executor→verify→repair porque ningún agente llegó a ejecutarse. La revisión 2 sustituye `powershell` por `pwsh` en los cuatro scripts, conserva topología/scope/presupuesto, fue verificada/compilada y obtiene un nuevo FlowIR. Se permite un segundo piloto sólo con nueva aprobación explícita.

## Review Gate 2026-07-16 — Rerun Blocked

La revisión de conformidad de Checkpoint D demostró que el target actual ya existe parcialmente y que sus gates no son determinísticos:

- el test enfocado de idempotencia falla con `builtin_catalog_conflict:engine:stt-off` porque el servicio compara `JSON.stringify()` contra valores `jsonb` reordenados por PostgreSQL;
- el test deja `control_plane_authority.revision = 7`, por lo que `test:postgres` falla si se ejecuta después;
- faltan el guard seguro `non-fixvox_test`, counts canónicos dinámicos y concurrencia probada con conexiones independientes;
- el orden actual del verifier ejecuta PostgreSQL antes del bootstrap y no detecta la contaminación final;
- como los dos archivos de ownership ya contienen implementación previa, un rerun posterior a una reparación manual no mediría limpiamente el reemplazo del relay humano.

Decisión operativa: **no ejecutar el FlowIR R2 dentro del cierre de Checkpoint D**. El foco pasa a `docs/tracks/fixvox-self-hosted-checkpoint-d-closure-plan.md`, Batch 1, en perfil Implementador. Después de restablecer gates verdes, este spike debe revisarse por separado para archivarlo como inconcluso o re-scoparlo sobre un sublote nuevo; cualquiera de las dos acciones requiere una decisión explícita y no desbloquea Taskflow automáticamente.

## Rescope V2 — Planificador + Implementador Acotado (2026-07-17)

JP eligió re-scopear el piloto sin ejecutarlo. El FlowIR R2 original se conserva sin cambios como evidencia histórica; no se sobrescribe ni se reanuda.

### Target limpio

El nuevo sublote crea únicamente `tests/cloud-contract/product-route-disposition.test.ts`, un gate durable para el mapa D-R1 ya aprobado. Codifica mecánicamente la validación temporal usada al cerrar Batch 1:

- 73 fixture IDs exactos y únicos;
- 72 combinaciones method/path normalizadas;
- ambos escenarios `/desktop/login`;
- un scheduled boundary;
- todos los paths Tauri construidos con `join_url` para `/v1`, `/v2` o `/desktop`;
- todos los prefijos `/admin/` estáticos enviados a `proxyAdmin(...)`;
- owner, reemplazo y retiro no vacíos para cada `temporary-compat`.

No se usa Batch 2 como piloto porque diseñar contratos canónicos requiere juicio arquitectónico y aprobación humana, no sólo checks determinísticos.

### Flow preparado

- Nombre: `dictation-bounded-plan-implement-spike`
- Archivo: `.pi/taskflows/dictation-bounded-plan-implement-spike.json`
- FlowIR: `ir:22e51921382eaa06db7a9dfa9a7b70aa9e63031e3473363bfae83da950664b20`
- Fases: `baseline → plan → implement → {verify, scope-check} → quality-gate → receipt`
- Planner: read-only, salida JSON con contrato y un retry de formato.
- Writer: `executor-code`, ownership exclusivo del test nuevo.
- Reviewer: sólo si los scripts no auto-pasan; máximo una reparación.
- Presupuesto: 250.000 tokens observados.
- Estado: **prepared-not-run**. Search de library recomendó copiar/generalizar el flow original (score 0,55). Verify final PASS, compile PASS, 7 fases, 0 errores.
- Warning intencional: `quality-gate` es la única ruta al receipt; al agotar la reparación debe fallar cerrado, no producir bypass ni falso cierre.

### Autonomy Contract V2

**Objetivo:** probar el relay planner → implementador → verificación sobre un test útil, pequeño y todavía inexistente.

**Scope:** un único archivo nuevo, fuentes read-only del inventario, Tauri y Control Room, y estado temporal propio del flow.

**Presupuesto:** máximo 250.000 tokens; un planner, un executor por intento, reviewer sólo ante fallo y máximo una reparación.

**Checkpoints:** fingerprint inicial, plan JSON, writer único, contract tests, `git diff --check`, scope hash, gate y receipt.

**Verificación:**

```powershell
bun test tests/cloud-contract/contract-fixtures.test.ts tests/cloud-contract/product-route-disposition.test.ts
git diff --check -- tests/cloud-contract/product-route-disposition.test.ts
```

**Stop condition:** target ya existente al iniciar, edición fuera de ownership, dependencia/package script, cambio de fixture/doc/runtime, efecto externo, presupuesto agotado o una reparación fallida.

**Efectos locales permitidos durante una futura ejecución:** crear el test nuevo, leer fuentes locales, ejecutar los dos checks y crear/eliminar el hash temporal bajo `%TEMP%`.

**Efectos prohibidos:** editar archivos existentes; dependencias, installs, package scripts, runtime/Tauri/Admin/product docs; DB/provider/red/OAuth/producción/deploy; secrets/datos reales; commit/push; run/resume de cualquier otro flow.

La ejecución requiere una aprobación explícita separada de este autonomy contract. Esta sesión sólo diseñó, guardó, verificó y compiló el flow; no inició agentes, scripts del DAG ni mutaciones del target.

## Diseño Histórico V1

### Writer único

`executor-code` es el único agente con ownership de edición. No hay scout/planner ni workers paralelos.

Ownership permitido:

- `cloud/fixvox-api/src/postgres/bootstrap-builtin-engine-prompt-catalog.ts`
- `cloud/fixvox-api/tests/builtin-catalog-bootstrap.integration.test.ts`

Todo otro cambio tracked/untracked no ignorado debe permanecer byte-for-byte igual. El flow registra un hash del workspace fuera de ownership antes de editar y lo compara después.

### Checks determinísticos

Scripts sin tokens ejecutan:

1. `bunx tsc -p cloud/fixvox-api/tsconfig.json --noEmit`
2. API unit.
3. PostgreSQL integration existente.
4. El nuevo `builtin-catalog-bootstrap.integration.test.ts` contra `.env.postgres.local` / `fixvox_test`.
5. Migration verify schema v4.

El check termina siempre con `VERIFY_OK` o `VERIFY_FAIL`; no aborta antes de que el gate pueda usar el error como feedback.

### Reparación

- `quality-gate` auto-pasa sin llamada LLM cuando existen `VERIFY_OK` y `SCOPE_OK`.
- Si falla, un reviewer read-only emite feedback preciso y bloquea.
- `onBlock: retry` vuelve a ejecutar writer + checks.
- Máximo: dos reparaciones después del primer intento.
- Sin summary LLM adicional; el trace y el orquestador producen el receipt.

## Autonomy Contract Del Piloto

### Objetivo

Implementar y verificar únicamente los integration tests del bootstrap built-in de engines/prompts.

### Scope

Servicio bootstrap y su test dedicado; base local aislada `fixvox_test`.

### Presupuesto

- Máximo 350.000 tokens observados por Taskflow.
- Un executor por intento.
- Reviewer sólo cuando los scripts no auto-pasan.
- Máximo dos reparaciones.
- Foreground; no detached.

### Checkpoints

- baseline y ownership hash;
- implementación;
- typecheck/unit/PostgreSQL/schema;
- scope hash;
- gate final.

### Verificación

Todos los checks deben producir `VERIFY_OK`; el workspace fuera de ownership debe producir `SCOPE_OK`.

### Stop Condition

Detenerse sin cierre si aparece cualquiera de estos casos:

- migration `0005` o cambio de schema;
- dependencia/instalación;
- contradicción arquitectónica o contractual;
- red/provider real, producción, VPS o deploy;
- import/secrets/commit/push;
- edición fuera de ownership;
- dos reparaciones agotadas;
- presupuesto agotado.

### Efectos Locales Permitidos

- editar los dos archivos de ownership;
- usar PostgreSQL local `fixvox_test`;
- ejecutar TypeScript, unit, integration y migration verify;
- crear estado/trace propio de Taskflow y un hash temporal bajo `%TEMP%`.

### Efectos Prohibidos

- installs o cambios de paquetes;
- red/provider/OAuth real;
- producción, Cloudflare, VPS, deploy o publish;
- datos reales, imports o secrets;
- migration 0005;
- Profile Composer o Checkpoint E;
- commit o push;
- otros archivos del working tree.

## Métricas Del Spike

Registrar al terminar:

- estado PASS/BLOCK/FAILED;
- runId y FlowIR hash;
- llamadas LLM por agente;
- tokens observados;
- duración;
- cantidad de reparaciones;
- intervenciones humanas durante ejecución;
- archivos tocados;
- checks y exit/resultados;
- si hubo una respuesta “entendido” sin edición;
- si ownership detectó drift;
- blocker/razón si no cerró.

Criterio de éxito operativo: cero intervención humana entre aprobación y receipt, sin drift, checks verdes y como máximo una reparación. Dos reparaciones aún pueden cerrar técnicamente, pero señalan que el flow necesita ajuste antes de generalizar.

## Rollback

Si el piloto falla después de entrar en `implement`, o si la revisión 2 vuelve a fallar antes del executor:

1. No generalizar ni reutilizar el flow.
2. Conservar el run trace para diagnóstico.
3. Revisar manualmente sólo los dos archivos de ownership; no usar `git checkout` sobre el working tree acumulado.
4. Archivar este track con resultado `failed` o `inconclusive`.
5. Eliminar/desregistrar el flow project-local sólo después de preservar la evidencia útil.
6. Volver al proceso manual acotado.

El primer fallo de baseline permite una única corrección y rerun porque fue un error de compatibilidad del harness, consumió cero tokens, no invocó agentes y no mutó el repo.

Si pasa, el siguiente paso no es automatizar todo D: primero revisar métricas y diseñar un flow parametrizado separado.

## Runbook Para Sesión Nueva

Prompt recomendado:

```text
Retomá el spike de automatización bounded de Dictation Tauri.

Leé, en orden:
1. docs/.generated/context-index.md
2. docs/WORKING_MEMORY.md
3. docs/tracks/bounded-taskflow-implementation-spike.md
4. specs/019-fixvox-self-hosted-control-plane/tasks.md sólo en la sección Checkpoint D.

Inspeccioná git status sin revertir cambios. Confirmá que el flow project-local `dictation-bounded-implementation-spike` existe y que su FlowIR hash coincide con el track. No lo modifiques ni lo ejecutes todavía.

Presentá el autonomy contract exacto del track y pedime una única aprobación para esta ejecución. Si apruebo, ejecutá el flow en foreground desde C:/dev/dictation-tauri. No amplíes scope, presupuesto, topología ni efectos. Al terminar, verificá el diff y entregá las métricas del spike. Si el flow se bloquea, no lo sustituyas silenciosamente por trabajo manual.
```

Comando humano equivalente después de aprobar: `/tf:dictation-bounded-implementation-spike`.

## Operator Helper `/flow` — Implementado

El helper mínimo quedó implementado en `C:/dev/os/.pi/extensions/aos-flujo.ts` y cargado por `C:/tools/pi-menu.ps1` en los perfiles `aos`, `implementer` y `orchestrate`.

Contrato efectivo:

- un solo archivo TypeScript de implementación, sin dependencias nuevas;
- comando explícito `/flow`;
- menú determinístico `Pensar | Implementar | Orquestar | Cerrar`;
- muestra perfil/comando recomendado y carga un prompt revisable con `setEditorText()`;
- cero tokens para el menú;
- sin hooks, tools, background, red, storage, clipboard, auto-send, cambio automático de perfil ni ejecución de Taskflow.

Verificación 2026-07-16: import TypeScript y parse PowerShell pasaron; los dry-runs de los tres perfiles cargaron la extensión exactamente una vez; smoke interactivo pasó cancelación y las cuatro opciones, incluyendo prompts no enviados automáticamente. Cambiar perfiles sigue requiriendo un proceso nuevo mediante `pi-menu`; el helper no es un segundo orquestador. Taskflow R2 permaneció sin ejecutar.

## Decisión Posterior

- PASS limpio: evaluar un nuevo flow reusable parametrizado para sublotes seriales de Checkpoint D.
- PASS con dos reparaciones: ajustar primero prompts/checks y repetir otro piloto pequeño.
- BLOCK/FAILED: diagnosticar trace; no adoptar Taskflow como reemplazo del relay manual todavía.
- Helper `/flow`: adoptado como UX explícita y no invasiva; mantenerlo limitado a recomendación + prompt revisable.
