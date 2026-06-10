---
id: speckit-workflow
status: draft
kind: how-to
triggers:
  - speckit
  - spec
  - plan
  - tasks.md
  - feature grande
  - Small Batches
  - checkpoint
primary_refs:
  - .specify/memory/constitution.md
  - .specify/templates/spec-template.md
  - .specify/templates/plan-template.md
  - specs/
---

# SpecKit Y Planificacion

## Cuando Usarlo

Usar SpecKit para features grandes, arquitectura, cambios de persistencia, integraciones de dictado/transcripcion o decisiones que deban quedar trazadas.

## Flujo

1. Crear o actualizar `specs/<feature>/spec.md`.
2. Generar o actualizar `plan.md`.
3. Completar research, data model, quickstart y contracts si aplican.
4. Generar `tasks.md` en Small Batches: tareas pequenas, verificables, con paths exactos y checkpoints.
5. Implementar una task/checkpoint por tanda.
6. Verificar con comandos documentados en `docs/DEVELOPMENT.md` o `quickstart.md`.
7. Marcar la task completada y commitear atomico.
8. Actualizar docs estables si cambia una decision durable.

## Small Batches

Regla: una task SpecKit o comportamiento verificable por tanda.

- No avanzar a la siguiente tanda si la actual no tiene checks verdes o estado documentado.
- No esconder refactors dentro de features.
- No mezclar UI durable con decisiones de producto pendientes.
- Si la task generada es grande, dividirla antes de implementar.
- Cada tanda cerrada debe poder revertirse con un solo commit.

## Spec Actual

`specs/001-port-foundation/` es la spec draft para la base del port.
