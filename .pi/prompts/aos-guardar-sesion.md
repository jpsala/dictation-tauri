---
description: Guardar lo valioso de la sesion actual en docs vivos, sin abrir sesion nueva
---
AOS guardar sesion.

Usa la fuente canonica `docs/topics/docs-knowledge-system.md` y la skill local `aos-guardar-sesion`: persiste solo el valor durable de la sesion actual sin abrir thread nuevo, sin handoff, sin pedir `aos-gol` y sin compactar salvo pedido explicito.

Extrae decisiones, estado vivo, riesgos, archivos relevantes, checks/comandos utiles y proximo paso. Rutea cada cosa al destino correcto (`AGENTS.md`, `docs/WORKING_MEMORY.md`, topic, track, spec o decision), manteniendo los docs livianos y sin transcript. Regenera indice si cambian topics/tracks/skills/aliases/prompts y corre audit si tocaste capa agentica o hay riesgo de drift. Responde con sintesis compacta de que quedo persistido y como seguir.
