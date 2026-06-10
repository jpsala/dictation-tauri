---
id: speckit-workflow
status: active
kind: how-to
triggers:
  - speckit
  - spec kit
  - spec
  - plan
  - tasks.md
  - feature grande
  - Small Batches
  - small batches
  - lotes chicos
  - checkpoint
primary_refs:
  - .specify/memory/constitution.md
  - .specify/templates/spec-template.md
  - .specify/templates/plan-template.md
  - .specify/templates/tasks-template.md
  - specs/
---

# SpecKit Y Planificacion

## Cuando Usarlo

Usar SpecKit para features grandes, arquitectura, cambios de persistencia, integraciones de dictado/transcripcion o decisiones que deban quedar trazadas.

No usar SpecKit como memoria general, diario, knowledge base ni backlog universal. Para trabajo vivo no formalizado, usar `docs/tasks/`. Para conocimiento recuperable, usar `docs/topics/`.

## Flujo

1. Crear o actualizar `specs/<feature>/spec.md` con el que y el por que.
2. Aclarar ambiguedades materiales antes de planificar.
3. Validar requisitos con checklist cuando haya riesgo de omisiones.
4. Generar o actualizar `plan.md` con stack, arquitectura, restricciones y gates.
5. Completar research, data model, quickstart y contracts si aplican.
6. Generar `tasks.md` con tareas pequenas, verificables, con paths exactos y checkpoints.
7. Analizar consistencia entre spec, plan y tasks antes de implementar.
8. Implementar una task/checkpoint por tanda.
9. Verificar con comandos documentados en `docs/DEVELOPMENT.md` o `quickstart.md`.
10. Marcar la task completada y commitear atomico cuando aplique.
11. Actualizar docs estables si cambia una decision durable.

## Small Batches

Regla: una task SpecKit o comportamiento verificable por tanda.

- No ejecutar `tasks.md` completo en modo automatico salvo pedido explicito de JP.
- Antes de implementar, nombrar la tanda siguiente y su criterio de verificacion.
- No avanzar a la siguiente tanda si la actual no tiene checks verdes o estado documentado.
- No esconder refactors dentro de features.
- No mezclar UI durable con decisiones de producto pendientes.
- Si la task generada es grande, dividirla antes de implementar.
- Cada tanda cerrada debe poder revertirse con un solo commit.

## Gates Recomendados

Ruta liviana para experimentos claros:

```text
specify -> plan -> tasks -> implement
```

Ruta normal para trabajo productivo o ambiguo:

```text
constitution -> specify -> clarify -> checklist -> plan -> tasks -> analyze -> implement
```

Durante `implement`, repetir:

```text
seleccionar tanda -> implementar -> verificar -> actualizar tasks/docs -> decidir siguiente tanda
```

## Spec Actual

`specs/001-port-foundation/` es la spec activa para la base del port.
