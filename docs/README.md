# Documentacion Del Proyecto

Este directorio separa documentacion estable, trabajos vivos y conocimiento recuperable.

## Regla De Lectura Liviana

Leer en capas:

```text
context-index -> WORKING_MEMORY -> TOPICS -> topic/track/spec especifico -> referencia profunda -> codigo puntual
```

No cargar documentos largos si el topic de entrada alcanza para decidir. Antes de abrir docs completos, buscar candidatos por nombre, frontmatter y triggers.

## Lectura Principal

Para entender el estado actual sin inflar contexto:

1. `docs/.generated/context-index.md`: indice rapido generado.
2. `WORKING_MEMORY.md`: estado vivo, spec activa, riesgos y proximo paso.
3. `TOPICS.md`: router para elegir topic.
4. Topic/track/spec especifico.
5. Documentos raiz o referencias profundas solo bajo demanda.

`PROJECT.md`, `ASSISTANT_RULES.md`, `DEVELOPMENT.md`, specs completas y referencias largas son fuentes estables, no lectura obligatoria inicial.

## Fuente De Verdad

- La verdad vigente debe vivir en documentos raiz o en `docs/topics/`.
- `WORKING_MEMORY.md` es estado vivo y debe apuntar a la verdad estable, no duplicarla.
- `docs/tracks/` guarda trabajos vivos retomables. Se edita, comprime, limpia o archiva.
- `docs/skills/` guarda skills locales portables y versionadas; `.agents/skills` es compatibilidad local por junction.
- Si una track descubre algo durable, copiarlo o resumirlo en el documento estable correspondiente.

## Organizacion

- `PROJECT.md`: identidad del proyecto, usuarios y objetivo.
- `ASSISTANT_RULES.md`: reglas para el asistente.
- `DEVELOPMENT.md`: stack, persistencia, rutas, scripts y reglas tecnicas.
- `DECISIONS.md`: decisiones con estado, motivo y proximo paso.
- `OPEN_QUESTIONS.md`: preguntas no resueltas.
- `GLOSSARY.md`: aliases, nombres cortos y definiciones recurrentes.
- `TOPICS.md` y `docs/topics/`: conocimiento recuperable por area, situacion, restriccion o patron.
- `WORKING_MEMORY.md`: memoria operativa actual.
- `docs/tracks/`: trabajos vivos retomables.

## Audit De Contexto

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```
