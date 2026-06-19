---
description: Maximize safe use of Pi threads/subagents for the current objective
---

Ejecuta `aos-fanout` como alias intensivo de `aos-orquestar`, siguiendo `docs/topics/pi-agentic-os.md#orquestacion-con-threadssubagentes`.

Objetivo: hacer todo lo razonablemente posible con threads/subagentes **solo cuando sea seguro y aporte valor real**. Como JP invoco este slash command, no hace falta pedir permiso para exploracion read-only ni para workers con ownership no solapado; si la descomposicion no es segura, trabajar serial y decir por que.

Flujo:

1. Leer ruta liviana: `docs/.generated/context-index.md`, `docs/WORKING_MEMORY.md` y el topic/track/spec puntual.
2. Antes de empezar, identificar frentes independientes y clasificar cada uno: `explorer` read-only, `worker` con ownership exclusivo, `reviewer`, o `serial`.
3. Lanzar 2-4 agentes iniciales si hay frentes seguros; preferir `explorer` read-only.
4. Usar `worker` solo con archivos/repos concretos, sin solapamiento y con verificacion local clara.
5. Reservar archivos compartidos al orquestador (registry, plan maestro, changelog, docs de sintesis); los workers devuelven recomendaciones.
6. Continuar trabajo no solapado en el hilo principal; no usar `wait_agent` salvo bloqueo real o pedido explicito de cerrar el fan-out completo.
7. Integrar notificaciones, verificar evidencia critica, cerrar agentes terminados y responder con sintesis unica.

No paralelizar: decisiones humanas, secretos/credenciales, deploy/push, destructive ops, migraciones sin rollback, tareas pequenas/secuenciales, refactors delicados sobre los mismos archivos o cualquier edicion con ownership ambiguo.

Si el fan-out tiene riesgo pero podria ser util, pedir `ask_user` con opcion serial segura y opcion fan-out propuesta. Si no hay paralelismo seguro, quedarse serial sin forzar threads.
