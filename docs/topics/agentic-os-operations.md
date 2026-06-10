---
id: agentic-os-operations
status: active
kind: how-to
triggers:
  - crear sistema agentico
  - migrar sistema agentico
  - actualizar norte
  - os lite
  - adaptar proyecto
  - repo nuevo
primary_refs:
  - AGENTS.md
  - docs/WORKING_MEMORY.md
  - docs/TOPICS.md
  - docs/.generated/context-index.md
  - scripts/agent-context-audit.ts
  - scripts/context-index.ts
  - scripts/context-refresh.ts
---

# Operaciones Del Sistema Agentico

## Cuando Usarlo

Usar este topic cuando el usuario quiera crear, migrar, actualizar o auditar un sistema agentico desde este repo o en otro proyecto.

## Intenciones

| Pedido | Accion |
| --- | --- |
| "Armame un sistema agentico aca" | Crear estructura minima y adaptar docs al proyecto real. |
| "Esta carpeta esta vacia" | Crear base minima con placeholders honestos. |
| "Este repo ya tiene sistema, migrarlo" | Fusionar sistema actual con OS Lite sin perder reglas locales. |
| "Actualizalo a la ultima version" | Comparar contra este repo y traer mejoras sin pisar contexto local. |
| "Auditalo" | Correr audit y revisar docs/topics/tasks. |

## Adaptacion A Otro Proyecto

1. Leer el proyecto destino antes de crear archivos.
2. Detectar stack, comandos, docs, tests, deploy, datos sensibles y reglas existentes.
3. Detectar archivos preexistentes de contexto, notas, recomendaciones, drafts o discusiones. No dejarlos sueltos: integrarlos, moverlos a una ubicacion indexada, archivarlos con estado claro o preguntar antes de borrarlos.
4. Si ya hay `AGENTS.md`, `docs/`, `.agents/`, `.specify/` o `specs/`, tratarlo como migracion.
5. Proponer la estructura minima necesaria, normalmente:
   - `AGENTS.md`
   - `docs/README.md`
   - `docs/PROJECT.md`
   - `docs/ASSISTANT_RULES.md`
   - `docs/DEVELOPMENT.md`
   - `docs/WORKING_MEMORY.md`
   - `docs/TOPICS.md`
   - `docs/DECISIONS.md`
   - `docs/OPEN_QUESTIONS.md`
   - `docs/tasks/`
   - `docs/topics/`
   - `specs/`
6. Crear backups antes de reemplazar archivos existentes.
7. Fusionar reglas locales, decisiones y memoria viva en vez de pisarlas.
8. Reemplazar placeholders por contexto real del proyecto.
9. Correr checks del proyecto, `bun scripts/context-index.ts` y `bun scripts/agent-context-audit.ts` si Bun esta disponible.

## Migracion

1. Leer sistema actual.
2. Separar reglas locales, historia, ruido y duplicados.
3. Para cada archivo previo, decidir destino: integrar, indexar, archivar o preguntar. No dejar archivos raiz sin fuente de verdad clara.
4. Hacer backup antes de reemplazar.
5. Fusionar en:
   - `AGENTS.md`
   - `docs/WORKING_MEMORY.md`
   - `docs/TOPICS.md`
   - `docs/DECISIONS.md`
   - `.specify/memory/constitution.md`
6. Marcar docs viejos como `historical` o `stale` si corresponde.
7. Correr `bun scripts/context-index.ts` y `bun scripts/agent-context-audit.ts` o los scripts equivalentes del repo destino.

## Regla

No copiar contexto de otro proyecto, no borrar memoria local util sin integrarla y no dejar archivos preexistentes desindexados. El objetivo es mejorar el acceso al conocimiento, no resetearlo.
