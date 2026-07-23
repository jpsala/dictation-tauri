---
id: os-quality
status: active
kind: how-to
triggers:
  - perfect os
  - proyecto perfecto
  - dejar en condiciones
  - calidad agentica
  - optimizar contexto
  - docs livianos
  - docs indexados
  - comandos os
  - os help
primary_refs:
  - docs/topics/agentic-os-operations.md
  - docs/topics/docs-knowledge-system.md
  - docs/topics/local-codex-skills.md
  - scripts/agent-context-audit.ts
  - scripts/context-index.ts
---

# Calidad Agentica / Perfect OS

## Objetivo

Asegurar que este repo quede en condiciones optimas para trabajo con agentes: contexto barato, docs recuperables, comandos claros, continuidad viva y auditoria verde.

No se agrega documentacion por agregar. Una sesion nueva debe leer poco, entender lo importante, continuar sin romper reglas locales y encontrar cualquier doc util bajo demanda.

## Superficie Operativa

- `/flow`: única entrada cotidiana para Pensar, Planear, Hacer y Cerrar.
- `aos-help` / `os help`: mostrar la superficie AOS sin ejecutar cambios.
- `aos-perfect-os` / `perfect os` / `dejar en condiciones`: auditar y mejorar la capa agentica hasta dejarla óptima.
- `aos-realinear-os` / `realinear os`: reparar drift de la capa agentica del repo actual.
- `/doctor`: diagnóstico read-only específico de Dictation Tauri.

Las operaciones especializadas no compiten con `/flow` para planificación,
implementación o continuidad.

## Checklist Perfect OS

Revisar por capas y reportar que se aplico, que se omitio y por que:

1. Core caliente: `AGENTS.md`, `docs/.generated/context-index.md`, `docs/WORKING_MEMORY.md`, `docs/TOPICS.md` son cortos y no son transcript.
2. Docs indexados: todo doc util para agentes esta linkeado desde topic, router, track, README, spec o indice. Docs solo-usuario pueden quedar fuera si su rol es claro.
3. Docs livianos: topics activos son routers; detalle profundo va a referencias, decisiones, specs o archivo historico.
4. Continuidad: tracks activas tienen frontmatter, estado, prioridad, fecha, next step y refs existentes; tracks cerradas viven en archive.
5. Comandos: acciones repetibles tienen skill/prompt barato; la logica durable vive en topic/script/doc canonico.
6. Adapters: `.agents/skills` queda como junction/symlink estable hacia `docs/skills/`; `.pi` se mantiene como adapter local fino cuando existe; SpecKit se actualiza si aplica.
7. Audit: `scripts/context-index.ts` y `scripts/agent-context-audit.ts` detectan drift barato y recurrente.
8. Respeto local: no pisar reglas, decisiones, datos privados ni docs de usuario; preguntar antes de borrar memoria dudosa.

## Flujo Perfect OS

1. Leer ruta liviana del repo.
2. Inventariar core docs, docs sueltos, skills, adapters, specs, tracks, scripts y comandos.
3. Separar correcciones seguras de decisiones humanas.
4. Corregir lo seguro: links, frontmatter, indice, skills/prompts faltantes, compactacion obvia, tracks stale claras.
5. No borrar ni mover memoria dudosa sin preguntar.
6. Regenerar indice y correr audit.
7. Responder con reporte por capas: OK, cambiado, omitido, pendiente y checks.

## Relacion Con Otros Modos

- `perfect os` es mas exigente que `realinear os`: ademas de reparar drift, optimiza recuperabilidad, liviandad e interfaz de comandos.
- `init/adopt/update os` son modos de instalacion/migracion; `perfect os` puede ejecutarse despues para endurecer calidad.
- Para cambios grandes de producto, usar SpecKit; Perfect OS se limita a capa agentica salvo pedido explicito.
