---
status: reference
started: 2026-06-07
updated: 2026-06-07
priority: medium
---

# Tracks

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

- `status`: `pending`, `active`, `paused`, `blocked`, `complete`, `stable`, `superseded` o `archived`.
- `started`: fecha en que se creo la track.
- `updated`: ultima fecha en que se actualizo.
- `priority`: `low`, `medium`, `high` o `critical`.
- `owner`: opcional; humano, agente o equipo responsable.
- `related`: opcional; docs, topics, specs o archivos relacionados.
- `topic`: opcional; topic principal que explica el contexto estable.
- `source_refs`: opcional; archivos de codigo o docs que deben revisarse para refrescar la track.

Semántica de estados:

- `pending`: reconocida, todavía no iniciada.
- `active`: trabajo vigente con siguiente paso; objetivo máximo de cinco tracks.
- `paused`: trabajo válido detenido intencionalmente, sin ejecución actual.
- `blocked`: no puede avanzar por un bloqueo concreto distinto de un gate externo normal.
- `complete`: objetivo cumplido; se conserva mientras siga siendo referencia útil.
- `stable`: superficie operativa o runbook vigente, sin batch de implementación activa.
- `superseded`: reemplazada por una fuente sucesora explícita; conserva valor histórico.
- `archived`: memoria fría movida a `docs/tracks/archive/`.

No usar `done`, `reference` ni estados ad hoc en tracks de trabajo. `README.md` puede usar
`reference` porque documenta el sistema y `TEMPLATE.md` usa `pending` como ejemplo.

Usar `docs/tracks/TEMPLATE.md` como base para crear una track nueva.

## Listar Activos

```powershell
rg -l "status:\s*active" docs/tracks -g "*.md" -g "!archive/**"
```

## Archivo

Una track con `status: archived` debe vivir en `docs/tracks/archive/`.

Una track que vive en `docs/tracks/archive/` debe tener `status: archived`.

## Regla

Cuando una track produzca conocimiento durable, promoverlo a `docs/topics/`, `docs/DECISIONS.md`, `docs/PROJECT.md`, `docs/DEVELOPMENT.md`, una spec o el documento estable que corresponda.

No usar esta carpeta como transcript.

## Cierre De Sesion

Al cerrar una sesion, usar `tracks` como fuente principal de continuidad:

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
4. Devolver un prompt compacto con ruta del repo, track, topic, estado actual y proximo paso.

## Refrescar Contra Codigo / Docs

Para revisar si una track sigue conectada con sus referencias declaradas:

```powershell
bun scripts/context-refresh.ts --track docs/tracks/<track>.md
```

El script no edita archivos. Reporta `topic`, `related` y `source_refs` faltantes para que JP o el agente decidan que actualizar.
