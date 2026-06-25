# AGENTS.md

Este repo usa Agentic OS (AOS): una capa liviana de reglas, memoria viva, topics, handoffs, SpecKit y skills locales para que agentes puedan trabajar sin cargar contexto innecesario.

## Lectura Inicial

Antes de trabajar en este proyecto, usar una ruta liviana:

1. `docs/.generated/context-index.md` si existe.
2. `docs/WORKING_MEMORY.md`.
3. `docs/README.md` solo si hace falta mapa documental.
4. `docs/TOPICS.md` o busqueda por triggers para elegir topic.
5. Topic, track, spec o codigo puntual segun el pedido.

No abrir por defecto docs largos como `docs/PROJECT.md`, `docs/ASSISTANT_RULES.md`, `docs/DEVELOPMENT.md`, specs completas ni referencias profundas. Abrirlos solo cuando el pedido o el topic lo requiera.

Si existe `docs/.generated/context-index.md`, usarlo como indice rapido. Si no existe o el audit avisa que esta viejo, regenerarlo con `bun scripts/context-index.ts`.

Si existe una spec activa, leer el plan indicado por `docs/WORKING_MEMORY.md`.

La discusion inicial y las decisiones durables del sistema deben quedar integradas en `docs/`. Si aparecen archivos preexistentes nuevos, no dejarlos sueltos: integrarlos, moverlos a una ubicacion documentada, archivarlos con estado claro o preguntar antes de borrarlos.

## Reglas Generales

- Respetar el stack, comandos y convenciones ya existentes.
- Modo personal/dev permisivo: se pueden leer `.env`, variables locales, logs, audio, transcripciones, bases locales y artifacts de referencia cuando ayuden.
- Permiso persistente 2026-06-24: para este repo/dev machine se pueden ejecutar side effects locales controlados sin pedir aprobacion por cada smoke (CUA/computer-use, apps sandbox, Vite/Tauri/Fixvox local, mic/audio fixtures, provider real con `.env`, clipboard temporal restaurado, hotkeys/clicks, artifacts ignorados y cleanup). Siguen requiriendo confirmacion: login/cuentas, pagos/envios/publicaciones/deploy/push, installs/autostart/tunnels, borrar datos reales, apps/documentos personales, `Alt+Space`, seleccion real, replace-selection y observer `paste_observed`.
- No imprimir secretos ni commitear `.env`/tokens salvo pedido explicito y acotado de JP.
- No revertir cambios de usuario sin pedido explicito.
- Trabajar en Small Batches orientados a checkpoints: una tanda puede agrupar varias tasks SpecKit acopladas si entrega un comportamiento/checkpoint verificable y reversible. Evitar microbatches cuando ralenticen el avance; separar siempre decisiones/gates, side effects reales, provider calls, smoke manual, paste/selection real e historial durable. Cada tanda debe ser revisable, testeada con checks relevantes y reversible con un commit atomico.
- Mantener la documentacion liviana: promover decisiones durables a docs estables y evitar transcribir sesiones.
- Para features grandes, usar SpecKit o actualizar la spec activa antes de implementar cambios durables; ejecutar `tasks.md` por checkpoints verificables, agrupando 2-5 tasks cuando sean parte del mismo comportamiento y no crucen gates/manual side effects.
- Para trabajos vivos o retomables, usar `docs/tracks/`. Para listar trabajos activos, buscar `status: active` en esa carpeta.
- Cada track debe tener frontmatter con `status`, `started`, `updated` y `priority`; usar `docs/tracks/TEMPLATE.md` como base.
- Las tracks archivadas deben tener `status: archived` y vivir en `docs/tracks/archive/`.
- Los comandos operativos tienen skills portables versionadas en `docs/skills/`. `.agents/skills` es solo junction local de compatibilidad para descubrimiento de Codex y debe ser validado por audit.
- Antes de leer docs completos, buscar candidatos por nombre, frontmatter y triggers con herramientas rapidas. Abrir solo los archivos relevantes.
- No dejar archivos de contexto, notas o drafts preexistentes sin indexar ni sin destino claro.
- No dejar que la capa agentica se convierta en transcript, backlog historico o lectura obligatoria amplia. Si crece, compactar, archivar o mover a referencia profunda.

## Persistencia

No asumir un mecanismo de persistencia. Leer `docs/DEVELOPMENT.md` antes de decidir donde guardar datos.

Para este proyecto, `docs/DEVELOPMENT.md` define un modo personal/dev permisivo: privacidad no bloquea lectura, uso local ni persistencia experimental de audio, transcripciones, modelos locales, logs de reconocimiento y configuraciones de dictado.

## Git Y SDD

- Spec/plan/tasks son fuente de verdad antes del codigo; cada Small Batch debe tener origen, alcance chico, check de cierre y commit atomico reversible.
- Antes de commit, excluir `.env`, secretos, build artifacts, `node_modules/`, audio/transcripciones locales sensibles y caches.
- Usar Conventional Commits cortos (`docs:`, `chore:`, `feat:`, `test:`, `fix:`).
- Si se implementa una task, marcar `specs/<feature>/tasks.md` en el mismo commit o en uno documental asociado.
- Si una tanda mezcla responsabilidades, parar y dividir.

## Comandos De Sistema

- `aos-sigamos` / `sigamos`: seguir el trabajo activo aca, sin cierre, handoff ni `gol` implicito.
- `aos-guardar-sesion`, `aos-checkpoint` o `cerrar sesion`: promover solo valor durable a docs/tracks/working memory si corresponde; regenerar indice y correr audit.
- `aos-nueva-sesion`, `continuar sesion`: hacer el cierre de valor y preparar handoff compacto para un thread nuevo si la herramienta existe; si no, devolver prompt pegable.
- `aos-nueva-sesion-con-gol`, `aos-continuar-con-gol`, `continuar con gol` o `siguiente`: cierre de valor + handoff compacto pidiendo que la nueva sesion arranque con `gol` para el proximo Small Batch. No continuar en el thread actual.
- `aos-realinear-os`, `auditar sistema agentico` o `reparar sistema agentico`: abrir `docs/topics/agentic-os-operations.md` y reparar solo capa agentica/docs/scripts/adapters salvo pedido explicito.
- `aos-perfect-os` o `dejar en condiciones`: abrir `docs/topics/os-quality.md` y optimizar core caliente, docs, tracks, skills/adapters, indice y audit sin tocar producto/runtime/deploy.

Para `siguiente`, verificar git/spec/track y armar un prompt compacto con estado esperado, objetivo, guardrails, checks, commit atomico, no push y arranque con `gol`.

## Design Context

Para trabajos de UI/frontend, leer `PRODUCT.md` y `DESIGN.md` si existen. Si no existen, usar `docs/PROJECT.md`, `docs/DEVELOPMENT.md` y el topic de UI correspondiente.

Este repo incluye la skill local `impeccable` en `docs/skills/impeccable` para trabajos de interfaz. Adaptar el criterio de diseno a una app de escritorio de dictado: operativa, clara, rapida y confiable.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/013-fixvox-text-runtime-parity/plan.md
<!-- SPECKIT END -->
