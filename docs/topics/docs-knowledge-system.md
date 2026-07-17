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

## Guardar Sesion

Guardar solo valor durable, sin transcript ni handoff:

1. Extraer decisiones, estado vivo, riesgos, archivos relevantes, checks y proximo paso.
2. Rutear cada elemento a decision, topic, track, spec, `WORKING_MEMORY.md` o reglas del agente.
3. Dejar `WORKING_MEMORY.md` como indice operativo corto y mover detalle al topic/track canonico.
4. Regenerar el indice si cambian topics, tracks, specs, skills, aliases o prompts documentados.
5. Correr audit si cambia la capa agentica o existe riesgo de drift.
6. Seguir en la misma sesion: no abrir thread, preparar handoff, iniciar loops ni compactar salvo pedido explicito.

## Cierre Y Continuacion De Sesion

- Cerrar sesion = ejecutar Guardar Sesion y responder con una sintesis final compacta.
- Continuar sesion = cerrar con valor y preparar un handoff corto que apunte a docs vivos; el handoff nunca reemplaza la documentacion canonica.
- Abrir una sesion/thread nuevo es una accion separada. No ejecutar `gol`, loops ni compaction por defecto.
