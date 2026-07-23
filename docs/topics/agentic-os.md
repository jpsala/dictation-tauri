---
id: agentic-os
status: active
kind: how-to
triggers:
  - norte
  - working memory
  - aos
  - agentic os
  - memoria viva
  - audit docs
  - tracks
  - /flow
  - handoff documental
  - context index
  - Small Batches
  - small batches
  - commits atomicos
primary_refs:
  - docs/GLOSSARY.md
  - docs/WORKING_MEMORY.md
  - docs/TOPICS.md
  - docs/tracks/
  - docs/skills/
  - docs/.generated/context-index.md
  - scripts/agent-context-audit.ts
  - scripts/context-index.ts
  - scripts/context-refresh.ts
---

# Agentic OS (AOS)

Sistema agentico liviano del proyecto.

## Capas

```text
hot context      -> AGENTS.md
index cache      -> docs/.generated/context-index.md
glossary         -> docs/GLOSSARY.md
working memory   -> docs/WORKING_MEMORY.md
topic router     -> docs/TOPICS.md
cold memory      -> docs/topics/*.md, docs/DECISIONS.md, specs/*
tracks           -> docs/tracks/*
project map      -> docs/README.md cuando hace falta
workflow layer   -> SpecKit + skills en docs/skills
audit layer      -> scripts/agent-context-audit.ts
```

## Lectura Recomendada

Para tareas no triviales:

1. `docs/.generated/context-index.md` si existe.
2. `docs/WORKING_MEMORY.md`.
3. `docs/TOPICS.md` o busqueda por triggers para elegir topic.
4. `docs/GLOSSARY.md` si el pedido usa un alias.
5. `docs/README.md` solo si hace falta mapa documental.
6. Topic, track, spec o codigo puntual segun el pedido.

## Working Memory

`docs/WORKING_MEMORY.md` guarda estado vivo, no historia.

Debe incluir areas activas, specs abiertas, topics activos, tracks relevantes, riesgos transversales, comandos de contexto y reglas de promocion de memoria.

## Topics

Un topic es un nodo de conocimiento recuperable: area, sistema, situacion, restriccion, patron o forma aprendida de actuar.

Cada topic debe tener frontmatter con `id`, `status`, `kind`, `triggers` y `primary_refs`.

## Tracks

`docs/tracks/` guarda trabajos vivos retomables.

Cada archivo debe tener frontmatter minimo:

```yaml
---
status: pending | active | paused | blocked | complete | stable | superseded | archived
started: YYYY-MM-DD
updated: YYYY-MM-DD
priority: low | medium | high | critical
---
```

Las tracks archivadas deben vivir en `docs/tracks/archive/` y tener `status: archived`.

Para listar trabajos activos:

```powershell
rg -l "status:\s*active" docs/tracks -g "*.md" -g "!archive/**"
```

## Small Batches

Los agentes deben trabajar en tandas chicas orientadas a terminar antes. Una tanda valida es:

- una task SpecKit;
- varias tasks SpecKit acopladas si forman un unico comportamiento/checkpoint verificable;
- un comportamiento observable;
- un checkpoint declarado en `tasks.md`;
- una sincronizacion documental acotada.

Cada tanda debe tener:

1. fuente de verdad previa: spec, plan, task, decision o topic;
2. alcance revisable, idealmente de 2-5 tasks cuando esas tasks comparten comportamiento y checks;
3. check de cierre explicito;
4. `tasks.md` marcado si aplica;
5. diff reversible y atribuible; commit sólo con autorización explícita.

Separar siempre lo que cruce gates o side effects reales: decisiones nuevas, provider calls, smokes manuales, paste automation, selection real, historial durable y cambios amplios de seguridad/capabilities. Si una tanda empieza a mezclar responsabilidades no relacionadas o vuelve dificil revertir, se divide antes de seguir.

## Continuidad Con `/flow`

`/flow → Hacer` abre una sesión nueva enlazada y precarga un handoff basado sólo
en índice, Working Memory y brief seleccionado. La implementación ocurre
directamente en ese hilo, sin Agent ni auto-send. `/flow → Cerrar` queda para
valor durable todavía faltante y no es obligatorio si Hacer ya dejó el estado
final correcto.

## Auditoria

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Para revisar una track contra sus referencias declaradas:

```powershell
bun scripts/context-refresh.ts --track docs/tracks/<track>.md
```
