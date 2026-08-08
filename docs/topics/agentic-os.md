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
  - continuidad documental
  - context index
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


## Auditoria

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Para revisar una track contra sus referencias declaradas:

```powershell
bun scripts/context-refresh.ts --track docs/tracks/<track>.md
```
