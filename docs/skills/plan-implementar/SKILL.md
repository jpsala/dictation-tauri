---
name: plan-implementar
description: Create, review, and execute a bounded implementation plan with the right Pi/AOS tool. Use when JP asks to plan and implement a feature end-to-end, turn an idea/spec/TODO into execution, or choose between manual work, planner, dgoal, until-done, long-task, or taskflow.
---

# Plan E Implementar

Workflow para tomar una idea, spec, brief o TODO; elegir **un motor principal**; ejecutar por cortes verificables; y cerrar con evidencia. No reemplaza AOS/docs: los docs vivos siguen siendo fuente de verdad.

Comando Pi recomendado:

```text
/aos-plan-implementar [objetivo]
/aos-plan-implementar --from docs/reference/foo.md [objetivo]
/aos-plan-implementar --tool auto|manual|planner|dgoal|until-done|long-task|taskflow [objetivo]
/aos-plan-implementar --execute [objetivo]
/aos-plan-implementar --autonomous [objetivo]
/aos-plan-implementar --preview [objetivo]
```

## Principio

Elegir **un motor principal** para implementar. No anidar planner + dgoal + until-done salvo decision explicita. Las demas herramientas son apoyos: `advisor` para criterio, `taskflow`/council para reviews, `pi-lens` para feedback, Ponytail para recortar scope.

## Fases

### 1. Intake

- `git status --short --branch`.
- Leer `docs/.generated/context-index.md`, `docs/WORKING_MEMORY.md` y el `--from` si existe.
- Leer topic/track/spec puntual; no reconstruir desde transcript.
- Preservar cambios no commiteados y distinguir cambios previos de cambios propios.

### 2. Strategy Gate

Clasificar el trabajo real:

- `discuss`: falta decision humana/producto.
- `study`: hay que investigar antes de planear.
- `spec`: falta convertir norte en contrato TDD.
- `plan`: hay spec, falta task plan.
- `implement`: hay alcance claro para editar.
- `review`: hay diff/plan para revisar.

Elegir herramienta:

| Caso | Herramienta principal |
| --- | --- |
| Cambio chico/reversible | manual + Ponytail + pi-lens + tests |
| Feature grande con stages/TDD/branches | `pi-code-planner` |
| Objetivo largo con auditor por fases | `pi-dgoal` |
| Loop hasta done con contrato/juez | `/until-done` |
| TODO secuencial claro | `pi_long_task` |
| Auditoria/review/fan-out/DAG | `taskflow` |
| Research externo/versionado | `web_search` + `fetch_content`/`web_answer`; `librarian` para internals open-source |
| Spec fuerte antes de codigo | `/task` o SpecKit |

### 3. Plan Artifact

Antes de implementar, producir o normalizar:

- objetivo;
- no objetivos;
- archivos/superficies a tocar;
- riesgos/guardrails;
- slice TDD minimo;
- comandos de validacion;
- rollback/reversibilidad;
- que requiere confirmacion explicita.

Si el plan toca prod, envios externos, datos reales, installs, deploy, acciones destructivas, fan-out costoso o scope ambiguo: usar `ask_user`.

### 4. Review Gate

- `advisor()` es obligatorio antes de registrar decisiones `DECISIONS.md`-worthy, cambios de arquitectura/storage/prod o antes de un loop largo.
- Usar `taskflow`/council solo cuando el valor del fan-out supera costo/ruido: arquitectura ambigua, auditoria amplia, seguridad/privacidad o review de plan importante.
- Para `study`, usar `docs/topics/conversational-research.md` y web/librarian cuando el dato sea externo, versionado o de libreria.
- Usar Plannotator si JP quiere revisar visualmente un plan markdown.

### 5. Ejecucion

Si `--execute` o frase humana clara habilita implementacion:

1. escribir test minimo que falle o checklist verificable;
2. implementar el corte mas chico;
3. correr test enfocado;
4. correr `pi-lens`/diagnosticos de archivos tocados;
5. refactor solo si reduce riesgo o duplicacion real;
6. repetir hasta done criteria.

Si no hay `--execute`, detenerse despues del plan y pedir confirmacion solo si hace falta.

### 6. Validacion

Escalera minima:

```text
test enfocado -> typecheck/check repo -> lens_diagnostics -> git diff --check
```

Agregar validaciones del frente: visual smoke, browser, prod health, sync doctor, channels check, etc. solo cuando aplique y este autorizado.

### 7. Closeout

- Actualizar docs vivos si aparecio valor durable.
- Regenerar indice/audit si se tocaron docs: `bun run context:index`, `bun run context:audit`.
- Separar archivos preexistentes modificados de cambios propios.
- No commit/push/sync/deploy salvo pedido explicito.
- Resumir evidencia reproducible.

## Guardrails

- Ponytail si esta activo o JP lo pide: V0 minimo, reusable, verificable; no usarlo para recortar seguridad, validacion o requisitos explicitos.
- No agregar otra capa de tooling si manual alcanza.
- No usar `git add -A`; no commit sin pedido.
- No publicar, sincronizar VPS/Coolify, enviar mensajes reales ni tocar datos privados sin confirmacion.
- Si una herramienta crea estado persistente/costo/fan-out, explicarlo antes salvo que `--autonomous` lo pida explicitamente.
