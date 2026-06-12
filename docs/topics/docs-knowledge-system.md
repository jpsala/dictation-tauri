---
id: docs-knowledge-system
status: active
kind: how-to
triggers:
  - documentacion
  - docs
  - topics
  - indice
  - contexto liviano
  - tracks
  - context bloat
  - contaminacion de contexto
primary_refs:
  - docs/README.md
  - docs/TOPICS.md
  - docs/WORKING_MEMORY.md
---

# Sistema De Conocimiento

## Regla Principal

La documentacion debe permitir que un agente lea poco y encuentre rapido la fuente correcta.

## Donde Poner Cada Cosa

| Contenido | Destino |
| --- | --- |
| Estado vivo corto | `docs/WORKING_MEMORY.md` |
| Indice generado de contexto | `docs/.generated/context-index.md` |
| Decision durable | `docs/DECISIONS.md` |
| Pregunta pendiente | `docs/OPEN_QUESTIONS.md` |
| Conocimiento reusable por tema | `docs/topics/<topic>.md` |
| Trabajo vivo retomable | `docs/tracks/<track>.md` |
| Feature grande | `specs/<feature>/` |

## Mantenimiento

- No duplicar specs enteras en working memory.
- No guardar transcripts largos.
- No convertir `AGENTS.md`, `WORKING_MEMORY.md`, `TOPICS.md` ni tracks activas en lectura obligatoria amplia.
- Si un documento crece porque acumula historia, separar: estado vivo corto, decision durable, topic reusable, track retomable o archivo historico.
- La ruta caliente debe seguir siendo pequena: indice generado, working memory corta, router y solo el topic/track/spec necesario.
- Si una track descubre algo durable, promoverlo a docs raiz, topic, decision o spec.
- Si aparece un documento suelto, integrarlo, indexarlo, archivarlo con estado claro o preguntar antes de borrarlo.
- Mantener cambios documentales en Small Batches: una decision, topic o sincronizacion de contexto por commit cuando sea separable.
