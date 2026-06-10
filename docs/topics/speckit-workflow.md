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
4. Generar `tasks.md`.
5. Implementar tareas en orden.
6. Verificar con comandos documentados en `docs/DEVELOPMENT.md`.
7. Actualizar docs estables si cambia una decision durable.

## Spec Actual

`specs/001-port-foundation/` es la spec draft para la base del port.
