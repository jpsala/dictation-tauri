---
status: reference
started: 2026-06-07
updated: 2026-06-07
priority: medium
---

# Tasks

Trabajos retomables. Usar cuando una conversacion, investigacion o implementacion todavia no merece una decision estable, pero debe poder retomarse.

Cada archivo representa una mesa de trabajo, no una sesion historica. Se puede editar, compactar, limpiar, archivar o borrar cuando deje de servir.

## Frontmatter Obligatorio

```yaml
---
status: active
started: YYYY-MM-DD
updated: YYYY-MM-DD
priority: medium
---
```

Campos:

- `status`: `pending`, `active`, `paused`, `blocked`, `done` o `archived`.
- `started`: fecha en que se creo la task.
- `updated`: ultima fecha en que se actualizo.
- `priority`: `low`, `medium`, `high` o `critical`.
- `owner`: opcional; humano, agente o equipo responsable.
- `related`: opcional; docs, topics, specs o archivos relacionados.
- `topic`: opcional; topic principal que explica el contexto estable.
- `source_refs`: opcional; archivos de codigo o docs que deben revisarse para refrescar la task.

Usar `docs/tasks/TEMPLATE.md` como base para crear una task nueva.

## Listar Activos

```powershell
rg -l "status:\s*active" docs/tasks -g "*.md" -g "!archive/**"
```

## Archivo

Una task con `status: archived` debe vivir en `docs/tasks/archive/`.

Una task que vive en `docs/tasks/archive/` debe tener `status: archived`.

## Regla

Cuando una task produzca conocimiento durable, promoverlo a `docs/topics/`, `docs/DECISIONS.md`, `docs/PROJECT.md`, `docs/DEVELOPMENT.md`, una spec o el documento estable que corresponda.

No usar esta carpeta como transcript.

## Cierre De Sesion

Al cerrar una sesion, usar `tasks` como fuente principal de continuidad:

- actualizar estado, checklist y proximo corte;
- promover decisiones durables a `docs/DECISIONS.md`;
- promover research y patrones a `docs/topics/`;
- actualizar `docs/WORKING_MEMORY.md`;
- evitar historial largo o duplicacion.

Si el usuario quiere seguir en una sesion nueva, responder con una sintesis compacta opcional para pegar como prompt.

## Continuacion De Sesion

Al continuar una sesion:

1. Ejecutar el mismo cierre liviano.
2. Regenerar `docs/.generated/context-index.md`.
3. Correr `bun scripts/agent-context-audit.ts`.
4. Devolver un prompt compacto con ruta del repo, task, topic, estado actual y proximo paso.

## Refrescar Contra Codigo / Docs

Para revisar si una task sigue conectada con sus referencias declaradas:

```powershell
bun scripts/context-refresh.ts --task docs/tasks/<task>.md
```

El script no edita archivos. Reporta `topic`, `related` y `source_refs` faltantes para que JP o el agente decidan que actualizar.
