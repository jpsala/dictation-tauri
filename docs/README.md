# Documentacion Del Proyecto

Este directorio separa documentacion estable, trabajos vivos y conocimiento recuperable.

## Regla De Lectura Liviana

Leer en capas:

```text
README -> WORKING_MEMORY -> TOPICS -> topic especifico -> referencia profunda -> codigo puntual
```

No cargar documentos largos si el topic de entrada alcanza para decidir. Antes de abrir docs completos, buscar candidatos por nombre, frontmatter y triggers.

## Lectura Principal

Leer en este orden para entender el estado actual:

1. `PROJECT.md`: proposito, personas y alcance general.
2. `ASSISTANT_RULES.md`: reglas de interaccion, permisos y tono.
3. `DEVELOPMENT.md`: arquitectura tecnica vigente.
4. `DECISIONS.md`: decisiones tomadas o pendientes.
5. `OPEN_QUESTIONS.md`: preguntas abiertas.
6. `WORKING_MEMORY.md`: estado vivo de topics, specs, tasks, riesgos y proximos pasos.
7. `GLOSSARY.md`: aliases, nombres cortos y definiciones recurrentes.
8. `TOPICS.md`: indice de temas activos.

## Fuente De Verdad

- La verdad vigente debe vivir en documentos raiz o en `docs/topics/`.
- `WORKING_MEMORY.md` es estado vivo y debe apuntar a la verdad estable, no duplicarla.
- `docs/tasks/` guarda trabajos vivos retomables. Se edita, comprime, limpia o archiva.
- Si una task descubre algo durable, copiarlo o resumirlo en el documento estable correspondiente.

## Organizacion

- `PROJECT.md`: identidad del proyecto, usuarios y objetivo.
- `ASSISTANT_RULES.md`: reglas para el asistente.
- `DEVELOPMENT.md`: stack, persistencia, rutas, scripts y reglas tecnicas.
- `DECISIONS.md`: decisiones con estado, motivo y proximo paso.
- `OPEN_QUESTIONS.md`: preguntas no resueltas.
- `GLOSSARY.md`: aliases, nombres cortos y definiciones recurrentes.
- `TOPICS.md` y `docs/topics/`: conocimiento recuperable por area, situacion, restriccion o patron.
- `WORKING_MEMORY.md`: memoria operativa actual.
- `docs/tasks/`: trabajos vivos retomables.

## Audit De Contexto

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```
