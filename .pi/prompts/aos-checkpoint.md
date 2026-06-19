---
description: "Alias legado de aos-guardar-sesion - persistir valor durable sin abrir sesion nueva"
---
AOS checkpoint (alias de `aos-guardar-sesion`).

Usa la fuente canonica `docs/topics/docs-knowledge-system.md` y la skill local `aos-guardar-sesion`: persiste solo el valor durable de la sesion actual sin preparar handoff, sin abrir thread nuevo, sin pedir `aos-gol` y sin compactar salvo pedido explicito.

Extrae decisiones, estado vivo, riesgos, archivos relevantes, checks/comandos utiles y proximo paso. Rutea cada cosa al destino correcto (`AGENTS.md`, `docs/WORKING_MEMORY.md`, topic, track, spec o decision), manteniendo los docs livianos y sin transcript. Regenera `docs/.generated/context-index.md` si cambian topics/tracks/skills/aliases/prompts y corre el audit contextual si tocaste la capa agentica o hay riesgo de drift. Responde con sintesis compacta de que quedo persistido y como seguir.
