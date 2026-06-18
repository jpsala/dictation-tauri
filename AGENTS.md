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
- El proyecto esta en modo personal/dev permisivo: se pueden leer `.env`, variables locales, logs, audio, transcripciones, bases locales y artifacts de referencia cuando ayuden al trabajo.
- No imprimir secretos en respuestas ni commitear `.env`/tokens salvo pedido explicito y acotado de JP.
- No revertir cambios de usuario sin pedido explicito.
- Trabajar en Small Batches: una task SpecKit, un comportamiento o un checkpoint verificable por tanda. Cada tanda debe ser chica, revisable, testeada con checks relevantes y reversible con un commit atomico. No mezclar plan/spec/docs con implementacion si pueden separarse limpiamente.
- Mantener la documentacion liviana: promover decisiones durables a docs estables y evitar transcribir sesiones.
- Para features grandes, usar SpecKit o actualizar la spec activa antes de implementar cambios durables; ejecutar `tasks.md` por lotes chicos verificables, no todo en bloque salvo pedido explicito.
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

- La spec, plan y tasks son la fuente de verdad antes del codigo.
- Small Batch es la unidad normal: una task SpecKit, un comportamiento observable, o una sincronizacion documental acotada.
- Un commit debe representar exactamente una unidad reversible.
- Antes de empezar una tanda, identificar el archivo de task/spec que la autoriza y el check que la cierra.
- Antes de cada commit, revisar que no entren `.env`, secretos, artifacts de build, `node_modules/`, audio/transcripciones locales sensibles ni caches.
- Usar mensajes Conventional Commits cortos (`docs:`, `chore:`, `feat:`, `test:`, `fix:`).
- Si un cambio implementa una task, marcarla en `specs/<feature>/tasks.md` en el mismo commit o en un commit documental inmediatamente asociado.
- Si una tanda empieza a tocar demasiados archivos o responsabilidades, parar, dividir la task y commitear solo el subresultado verde.

## Comandos De Sistema

- `sigamos`: seguir el trabajo activo aca, sin cierre/thread/`gol` implicito.
- Si JP dice "cerrar sesion" o equivalente, cerrar operativamente: promover durable, actualizar tracks/working memory si corresponde, regenerar indice y correr audit.
- Si JP dice "continuar sesion", hacer el mismo cierre y despues abrir thread/handoff compacto si la herramienta existe; si no, devolver prompt pegable.
- Si JP dice `continuar sesion con gol`, `continuar con gol`, `siguiente`, `nueva sesion con gol` o equivalente, hacer el cierre de valor de `continuar sesion`, abrir thread/handoff compacto y pedir que la nueva sesion arranque con `gol` para el proximo lote acordado.

## Comando `siguiente`

Cuando JP diga exactamente `siguiente`, tratarlo como alias de `continuar sesion con gol`: cierre de valor, thread/handoff compacto y pedido explicito de arrancar con `gol` en la nueva sesion.

1. Verificar estado real del repo con `git status --short --branch`, ultimo commit y proxima track/spec pendiente.
2. Armar un prompt compacto para el proximo Small Batch con ruta inicial, estado esperado, objetivo exacto, guardrails, checks de cierre, commit atomico, no push y arranque con `gol`.
3. Crear o forkear un thread Codex nuevo en el mismo proyecto/directorio y enviarle ese prompt.
4. Devolver a JP el thread creado. Archivar el thread actual solo si JP lo pidio explicitamente o si el flujo lo requiere despues de confirmar el nuevo thread.

No usar `siguiente` para avanzar en el mismo thread. No inventar estado: el prompt debe basarse en git, `docs/WORKING_MEMORY.md` y la spec/track vigente.

## Design Context

Para trabajos de UI/frontend, leer `PRODUCT.md` y `DESIGN.md` si existen. Si no existen, usar `docs/PROJECT.md`, `docs/DEVELOPMENT.md` y el topic de UI correspondiente.

Este repo incluye la skill local `impeccable` en `docs/skills/impeccable` para trabajos de interfaz. Adaptar el criterio de diseno a una app de escritorio de dictado: operativa, clara, rapida y confiable.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/004-real-microphone-capture/plan.md
<!-- SPECKIT END -->
