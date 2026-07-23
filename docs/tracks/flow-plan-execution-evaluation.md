---
status: complete
phase: complete-rollout-separate
started: 2026-07-19
updated: 2026-07-19
priority: high
owner: JP + Pi
related:
  - docs/topics/agent-tool-routing.md
  - docs/WORKING_MEMORY.md
  - docs/tracks/bounded-taskflow-implementation-spike.md
source_refs:
  - https://github.com/marcfargas/pi-planner/tree/08e4320be21901256d165871a1819b0ae2b69124
  - https://github.com/marcfargas/pi-safety/tree/c6aa377eb163e7592cb98f001edd48f605cf9443
  - https://github.com/devkade/pi-plan/tree/da5226a18b182641cfbfbae7912ff52638cccc67
  - https://github.com/earendil-works/pi/tree/v0.80.10/packages/coding-agent/examples/extensions/plan-mode
  - C:/dev/os/.pi/extensions/aos-flujo.ts
---

# Flow Plan/Execution Evaluation

## Pregunta

¿Conviene adoptar, adaptar o construir la capa que convierta `/flow` en
**Pensar → Planear → Hacer → Cerrar**, sin que JP recuerde rutas, banda,
checks o gates?

## Contrato Objetivo

```text
Pensar   → explorar y decidir sin ejecutar
Planear  → producir un plan humano y un contrato ejecutable validado
Hacer    → resolver 0/1/N planes ready y precargar un prompt revisable
Cerrar   → guardar receipt, avance de banda y contexto durable
```

No negociables:

- selección `0/1/N`: cero deriva a Pensar/Planear, uno se selecciona solo y N
  muestra picker;
- persistencia por proyecto, sin convertir la sesión en fuente de verdad;
- prompt completo en el editor, nunca auto-send;
- máximo un `Agent` implementador secuencial y un solo writer;
- una banda de resultado por ejecución;
- gates externos de AOS, installs, desktop, provider, prod, commit/push/deploy
  intactos; `/flow` no puede aprobarlos ni sustituirlos.

## Fuentes Inspeccionadas

| Fuente | Revisión exacta | Licencia observada |
| --- | --- | --- |
| `marcfargas/pi-planner` | npm `0.3.0`; `08e4320be21901256d165871a1819b0ae2b69124` | `LICENSE` MIT |
| `marcfargas/pi-safety` | npm `0.1.1`; `c6aa377eb163e7592cb98f001edd48f605cf9443` | `LICENSE` MIT |
| `devkade/pi-plan` | tag/npm `0.2.2`; `da5226a18b182641cfbfbae7912ff52638cccc67` | `package.json` declara MIT, pero el repo no contiene `LICENSE` y GitHub license API responde 404 |
| Plan Mode de Pi | paquete local `@earendil-works/pi-coding-agent` `0.80.10`; tag `v0.80.10` (`8dc78834cde4e329284cf505f9e3f99763df5529`) | paquete MIT |
| `/flow` actual | `C:/dev/os/.pi/extensions/aos-flujo.ts` | código AOS local |

Se leyó source, no sólo README: entrypoints, hooks, tools, storage, executor,
checkpoint/recovery y tests disponibles. Tamaño aproximado: `pi-planner` 2.185
líneas source + 2.665 líneas en 18 tests; `devkade/pi-plan` 874 líneas y cero
tests; plan-mode oficial 558 líneas entre `index.ts` y `utils.ts`.

## Compatibilidad Real Con Pi 0.80.10

Se usó un sandbox descartable bajo `%TEMP%/pi-flow-eval-20260719`, config y cwd
aislados, Pi offline en modo RPC y sin `npm install`, `pi install` ni cambios
globales.

| Caso | Resultado de carga | Lectura correcta |
| --- | --- | --- |
| Plan Mode oficial exacto de 0.80.10 | `exit 0`; emitió `setStatus`/`setWidget` en `session_start` | compatible nativo y fuente canónica de API |
| `devkade/pi-plan` sin modificar | `exit 0`; lifecycle UI activo | compatible hoy porque el loader 0.80.10 aliasa `@mariozechner/pi-coding-agent` y `@mariozechner/pi-tui` al host `@earendil-works` |
| `marcfargas/pi-planner` clone crudo sin deps | `exit 1`: `Cannot find module '@marcfargas/pi-safety'` | fallo esperado al prohibir instalaciones; no demuestra incompatibilidad de API |
| `pi-planner` + source exacto de `pi-safety` 0.1.1 vendorizado sólo en sandbox | `exit 0`; lifecycle UI activo | sus APIs cargan en 0.80.10; el loader también aliasa namespace Mario y `@sinclair/typebox` |

Límite de la prueba: valida carga y `session_start`, no una instalación de
paquete, una corrida con provider ni toda la UI TUI. No se ejecutaron tests
upstream porque requieren instalar dependencias. La instalación directa sigue
siendo no canónica: ambos paquetes declaran peer sobre
`@mariozechner/pi-coding-agent`, mientras la guía de paquetes 0.80.10 exige
peers `@earendil-works/*` y `typebox`. npm podría resolver una copia legacy
adicional; no se probó porque este corte prohíbe installs.

## Source: Qué Hace Cada Uno

### Plan Mode oficial Pi 0.80.10

- Desactiva `edit`/`write`, filtra bash, conserva y restaura el snapshot de
  tools activos.
- Extrae pasos desde una sección textual `Plan:` y progreso desde `[DONE:n]`.
- Persiste con `appendEntry`, por lo que sobrevive resume de esa sesión, no
  crea catálogo por proyecto entre sesiones.
- Después de elegir Execute usa un follow-up con `triggerTurn: true`: ejecuta
  automáticamente; no deja el prompt completo en el editor.
- No modela Pensar, selección 0/1/N ni Cerrar/receipt.
- Es un ejemplo oficial, no un modo built-in. En 0.79.10 recibió fixes para
  restaurar custom tools, no mostrar menú sin plan y encolar bien refine/run;
  0.80.10 contiene esos fixes.

### `devkade/pi-plan` 0.2.2

- Mejora el contrato de Planear: evidencia, incertidumbres, archivos,
  validación, riesgos y rollback.
- Tiene guardas read-only y una UI compacta para aprobar, continuar,
  regenerar o salir.
- Todo el estado vive en memoria; `session_start` no restaura nada y
  `session_shutdown` limpia ejecución. No hay persistencia por proyecto.
- Aprobar llama `sendUserMessage` de inmediato. No ofrece prompt revisable ni
  selección 0/1/N.
- No crea subagentes; ejecuta en el mismo agente/sesión.
- La ausencia de archivo `LICENSE` desaconseja copiar source aunque npm declare
  MIT; sus ideas pueden reimplementarse sin copiar código.

### `marcfargas/pi-planner` 0.3.0

Aporta el mejor modelo de datos:

- planes Markdown por proyecto en `.pi/plans/`;
- lifecycle `proposed → approved → executing → completed|failed|stalled`, con
  reject/cancel/retry/clone;
- versiones, write temporal + rename, checkpoints JSONL y detección de
  ejecuciones estancadas;
- listado/browse y config por proyecto;
- una ejecución in-session a la vez, sin crear subagentes.

Pero no es adoptable como gate ni como UX objetivo:

1. `plan_approve` es un tool del propio agente y dispara ejecución; no prueba
   aprobación humana dura.
2. `Approve & Execute` y el tool de aprobación autoejecutan; no precargan un
   prompt revisable.
3. `guardedTools` está vacío por default y el hook actual sólo escribe un log
   (`Phase A`); no bloquea. Los gates externos no pueden delegarse aquí.
4. README dice que ejecución limita tools al plan, pero `runner.ts` actual no
   llama `setActiveTools`; deja `savedTools: []` y usa los tools corrientes.
5. `/plan` no implementa el contrato 0/1/N: con cero alterna modo y con uno o
   más abre menús; no deriva/selecciona automáticamente.
6. Sólo cubre Planear/Hacer. No cubre Pensar ni el closeout AOS.
7. `stale_after_days` se carga pero no tiene consumidor; el cache no refresca
   edits externos automáticamente; el optimistic check tiene una ventana
   TOCTOU y no es un lock de proceso.
8. El progreso `scripts` no se serializa al Markdown; tras restart la evidencia
   durable efectiva queda en JSONL, no en ese campo del plan.
9. Inyecta instrucciones de safety de skills en cada turno, superficie y ruido
   innecesarios para `/flow` diario.

Conclusión: buen **patrón de lifecycle/storage**, mala autoridad para approvals
y demasiado executor para el problema local.

### `/flow` actual

Ya satisface la base más valiosa:

- un comando simple, cero dependencias y cero tokens para el menú;
- `setEditorText()`: prompt visible y editable, sin auto-send;
- una sola banda y modo acompañado o un único `Agent` secuencial;
- no ejecuta Taskflow, no cambia perfil y no intenta saltar gates externos;
- el plan durable y la continuidad ya viven en track + `WORKING_MEMORY`.

Brechas reales: fusiona Pensar y Planear, y Hacer delega al modelo resolver
ambigüedad en vez de hacer selección determinística 0/1/N. No mantiene un
índice project-local de planes ready ni un receipt estructurado de Cerrar.

## Matriz Contra La UX Objetivo

| Criterio | Oficial 0.80.10 | `devkade/pi-plan` | `pi-planner` | `/flow` actual |
| --- | --- | --- | --- | --- |
| Pensar separado | no | no | no | parcial |
| Planear read-only | sí | sí | sí | prompt only |
| Lifecycle durable | sesión | no | sí | tracks/WM |
| Selección 0/1/N | no | no | parcial/manual | no |
| Persistencia por proyecto | no | no | sí | durable docs, sin índice runtime |
| Prompt revisable, no auto-send | no | no | no | sí |
| Máximo un Agent secuencial | sí, cero subagents | sí, cero subagents | sí, cero subagents | sí |
| Una banda | no la modela | no la modela | plan completo | sí |
| Cerrar + receipt durable | no | no | completion mínimo | sí por prompt, no estructurado |
| Gates externos intactos | neutral | neutral | riesgoso si se toma como gate | sí |
| Complejidad/mantenimiento | media | media, sin tests | alta | baja |

## Recomendación

**ADAPTAR el `/flow` actual; no adoptar ni forkear ninguno de los tres.**

La adaptación debe usar APIs canónicas de Pi 0.80.10 y tomar sólo patrones:

- de plan-mode oficial: snapshot/restore de tools y bloqueo fail-closed si se
  decide endurecer Planear;
- de `devkade`: contrato de plan basado en evidencia, incertidumbres,
  validación y rollback;
- de `pi-planner`: lifecycle, referencias project-local y recovery como patrones,
  sin copiar su executor ni crear storage paralelo;
- de AOS actual: tracks/Working Memory como única verdad durable, prompt en
  editor, una banda, un writer y gates externos.

No conviene **adopt**: ninguna opción cumple prompt revisable, 0/1/N y closeout;
`pi-planner` además contiene contradicciones entre README y enforcement real.
No conviene **build desde cero**: el helper existente ya resuelve la mitad más
sensible de la UX con menor superficie.

## Implementación Mínima Ejecutada

### M0. Contrato y tests

- `FlowChoice = Pensar|Planear|Hacer|Cerrar`.
- Tests enfocados cubren cuatro fases, 0/1/N, refs malformadas/inexistentes o
  fuera del proyecto, modos acompañado/autónomo y garantía de cero auto-send.

### M1. Persistencia project-local sin runtime state

La inspección del upstream reveló una restricción más fuerte que el plan
provisional: `C:/dev/os/docs/DEVELOPMENT.md` prohíbe runtime state propio. Se
retiró por diseño `.pi/state/aos-flow.json` antes de implementarlo.

- Track/spec + `docs/WORKING_MEMORY.md` siguen siendo la única autoridad.
- Hacer extrae líneas estrictas `- **Plan:** \`path\`.` sólo de
  `Foco Único De Ejecución`.
- Sólo acepta archivos existentes bajo `docs/tracks` o `specs`; también valida
  realpath para bloquear symlink escape.

### M2. UX de cuatro fases y 0/1/N

- Menú `Pensar | Planear | Hacer | Cerrar`.
- 0 → precarga Planear; 1 → autoselecciona; N → picker.
- El prompt recibe el path exacto seleccionado y queda en `setEditorText()`.
- La extensión nunca invoca `sendMessage`, `sendUserMessage` ni `Agent`.

### M3. Closeout y gates

- Cerrar mantiene receipt durable por prompt.
- No hay executor, safety registry, retries, planner, Taskflow, background,
  dependencia ni gate nuevo.
- Un Agent máximo sólo puede ser solicitado por el prompt autónomo; installs,
  desktop/provider/prod, commit/push/deploy y side effects siguen externos.

### M4. Verificación y rollout

- Source upstream: `C:/dev/os/.pi/extensions/aos-flujo.ts`.
- Tests: `C:/dev/os/tests/aos-flujo.test.ts`.
- Documentación y conformance upstream alineadas a policy version 5.
- Tests flow 11/11 y suite upstream 22/22; `bun run check` PASS.
- Smoke Pi RPC 0.80.10 desde este repo: cuatro fases, autoselección del único
  plan, path exacto en editor y cero `extension_error`.
- El rollout downstream no formó parte de ese corte upstream.

### Rollout Local Dictation Tauri — Complete

La autorización posterior de JP migró este repo al contrato flow-first:

- El rollout global posterior reemplazó la copia local por
  `C:/dev/os/runtime/aos-flujo.ts`, publicado como package Pi `user`;
- `aos.requirements.json` declara `aos.flow-first@1.0.0` y cardinalidad 1;
- `scripts/agent-context-audit.ts` exige el package global y rechaza duplicados
  locales; `/doctor` conserva la validación semántica del foco del proyecto;
- el test del adapter y el prompt `aos-gol` locales se retiraron al quedar
  supersedidos por el runtime global y `/flow`;
- la guía Pi y el foco de `WORKING_MEMORY` usan el contrato exacto flow-first;
- no hubo instalación, producto, deploy, commit ni push.

Backup reversible:
`C:/Users/jpsal/.pi/agent/backups/dictation-flow-alignment-20260719-213649/`.

## Decisión Operativa

- Investigación y compatibilidad: **completas**.
- Recomendación: **ADAPT**, ejecutada upstream y migrada localmente.
- Adapter flow-first local: **completo**, sin installs ni runtime state.
- Próximo corte de producto: repetir D4 desde el foco `ready`; esta alineación no
  lo ejecuta ni inicia Checkpoint E.
