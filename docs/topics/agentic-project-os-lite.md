---
id: agentic-project-os-lite
status: active
kind: how-to
triggers:
  - norte
  - working memory
  - os lite
  - agentic project os
  - memoria viva
  - audit docs
  - tasks
  - cerrar sesion
  - continuar sesion
  - context index
  - Small Batches
  - small batches
  - commits atomicos
primary_refs:
  - docs/GLOSSARY.md
  - docs/WORKING_MEMORY.md
  - docs/TOPICS.md
  - docs/tasks/
  - docs/.generated/context-index.md
  - scripts/agent-context-audit.ts
  - scripts/context-index.ts
  - scripts/context-refresh.ts
---

# Agentic Project OS Lite

Sistema agentico liviano del proyecto.

## Capas

```text
hot context      -> AGENTS.md
project map      -> docs/README.md
working memory   -> docs/WORKING_MEMORY.md
topic router     -> docs/TOPICS.md
cold memory      -> docs/topics/*.md, docs/DECISIONS.md, specs/*
tasks            -> docs/tasks/*
workflow layer   -> SpecKit + skills
audit layer      -> scripts/agent-context-audit.ts
index cache      -> docs/.generated/context-index.md
```

## Lectura Recomendada

Para tareas no triviales:

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/GLOSSARY.md` si el pedido usa un alias
4. `docs/WORKING_MEMORY.md`
5. `docs/TOPICS.md`
6. topic especifico
7. referencia profunda o codigo puntual

## Working Memory

`docs/WORKING_MEMORY.md` guarda estado vivo, no historia.

Debe incluir areas activas, specs abiertas, topics activos, tasks relevantes, riesgos transversales, comandos de contexto y reglas de promocion de memoria.

## Topics

Un topic es un nodo de conocimiento recuperable: area, sistema, situacion, restriccion, patron o forma aprendida de actuar.

Cada topic debe tener frontmatter con `id`, `status`, `kind`, `triggers` y `primary_refs`.

## Tasks

`docs/tasks/` guarda trabajos vivos retomables.

Cada archivo debe tener frontmatter minimo:

```yaml
---
status: pending | active | paused | blocked | done | archived
started: YYYY-MM-DD
updated: YYYY-MM-DD
priority: low | medium | high | critical
---
```

Las tasks archivadas deben vivir en `docs/tasks/archive/` y tener `status: archived`.

Para listar trabajos activos:

```powershell
rg -l "status:\s*active" docs/tasks -g "*.md" -g "!archive/**"
```

## Small Batches

Los agentes deben trabajar en tandas chicas. Una tanda valida es:

- una task SpecKit;
- un comportamiento observable;
- un checkpoint declarado en `tasks.md`;
- una sincronizacion documental acotada.

Cada tanda debe tener:

1. fuente de verdad previa: spec, plan, task, decision o topic;
2. alcance chico y revisable;
3. check de cierre explicito;
4. `tasks.md` marcado si aplica;
5. commit atomico reversible.

Si una tanda empieza a mezclar responsabilidades, se divide antes de seguir.

## Auditoria

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Para revisar una task contra sus referencias declaradas:

```powershell
bun scripts/context-refresh.ts --task docs/tasks/<task>.md
```
