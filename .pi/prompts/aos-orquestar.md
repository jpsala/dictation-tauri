---
description: Proponer o ejecutar un fan-out controlado con threads/subagentes AOS
---

Ejecuta `aos-orquestar` siguiendo `docs/topics/pi-agentic-os.md#orquestacion-con-threadssubagentes`. Para maximizar paralelismo seguro de forma explicita, usar tambien `/aos-fanout`.

Objetivo: usar threads/subagentes solo si aportan paralelismo real y son seguros. El modelo principal sigue siendo el orquestador: planifica, pide confirmacion si JP no pidio threads explicitamente, lanza agentes con prompts autocontenidos, integra resultados, verifica y cierra agentes.

Flujo:

1. Leer ruta liviana: `docs/.generated/context-index.md`, `docs/WORKING_MEMORY.md` y el topic/track/spec puntual.
2. Decidir si conviene orquestar o seguir serial.
3. Si JP no pidio explicitamente threads/subagentes, pedir confirmacion con `ask_user` mostrando fan-out propuesto y alternativa serial.
4. Si se aprueba o ya fue pedido, lanzar 2-4 agentes como primera tanda; preferir `agent_type: "explorer"` read-only.
5. Usar `worker` solo con ownership claro por archivo/repo y sin solapamiento; para mas frentes, lanzar tandas adicionales.
6. Reservar archivos compartidos al orquestador (registry, plan maestro, changelog); los workers devuelven recomendaciones, no editan esos archivos.
7. No usar nested agents salvo autorizacion explicita en el prompt y solo para exploracion read-only.
8. No usar `wait_agent` salvo que el hilo principal este bloqueado por el resultado o JP pidio cerrar el fan-out completo; continuar trabajo no solapado.
9. Integrar notificaciones `<subagent_notification>`, verificar evidencia critica, cerrar agentes terminados y reportar sintesis.

Guardrails: no secretos, no acciones destructivas, no deploy/push, no edits paralelos sobre los mismos archivos, no reemplazar decisiones humanas por subagentes, preservar cambios preexistentes.

Patron probado: para `align all` multi-repo, usar un worker por repo, reservar `docs/OS_PROJECTS.md` al orquestador, pedir a cada worker una recomendacion de registry y consolidar al final con `context:index` + `context:audit`.
