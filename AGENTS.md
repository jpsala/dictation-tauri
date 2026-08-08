# AGENTS.md

Dictation Tauri usa Agentic OS (AOS): reglas, memoria viva, topics, tracks, SpecKit y skills locales para trabajar sin cargar contexto innecesario.

## Lectura Inicial

Ruta liviana:

1. `docs/.generated/context-index.md` si existe.
2. `docs/WORKING_MEMORY.md`.
3. `docs/README.md` solo si hace falta mapa documental.
4. `docs/TOPICS.md` o búsqueda por triggers.
5. Topic, track, spec o código puntual.

No abrir por defecto docs largos (`PROJECT`, `ASSISTANT_RULES`, `DEVELOPMENT`), specs completas ni referencias profundas. Si el índice está viejo: `bun scripts/context-index.ts`. Decisiones durables van en `docs/`; notas/drafts nuevos no quedan sueltos.

## Guardrails

- Respetar stack, comandos y convenciones; no revertir cambios ajenos.
- No imprimir secretos ni commitear `.env`, tokens, raw transcripts, audio sensible, build artifacts o caches.
- Consultas externas no deben enviar secretos, datos privados ni código sensible; installs y scripts remotos requieren autorización explícita.
- Modo dev personal permite leer `.env`, logs, audio, transcripciones, bases locales y artifacts cuando ayude; no volcarlos en docs/respuestas.
- Side effects locales controlados permitidos: CUA/computer-use, apps sandbox, Vite/Tauri/Fixvox local, mic/audio fixtures, provider real con `.env`, clipboard temporal restaurado, hotkeys/clicks y artifacts ignorados.
- Gated: login/cuentas, pagos/envíos/publicaciones/deploy/push, installs/autostart/tunnels, borrar datos reales, apps/documentos personales, `Alt+Space`, selección real, replace-selection y observer `paste_observed` fuera de task/spec explícita.
- Para tray/hotkeys/ventanas nativas, usar app Tauri real cuando sea razonable; preferir `npm run tauri:dev:hidden -- -StopExisting`.
- Para features Fixvox-like, volver a `C:/dev/fixvox` como fuente canónica antes de cerrar el lote.


## Persistencia

No asumir storage. Leer `docs/DEVELOPMENT.md` antes de decidir. En dev personal se permite persistencia experimental local de audio/transcripciones/logs/modelos/configuración, sin secretos ni datos sensibles en commits/reportes crudos.

## Git / Specs / Checks

Spec/plan/tasks mandan cuando aplica. No hacer `git add`, commit, push, deploy ni publish salvo pedido explícito. Antes de commit excluir secretos, `.env`, artifacts, `node_modules/`, audio/transcripciones y caches.

Comandos seguros frecuentes:

```powershell
npm run check
npm run build
npm run test:pipeline
npm run cloud:test
cd src-tauri && cargo check
bun scripts/context-index.ts && bun scripts/agent-context-audit.ts
```

No correr smokes físicos/audio/prod/deploy/autostart sin confirmación.

## Frontera AOS/OMP

<!-- aos-bootstrap: stable-bootstrap-v1 -->
<!-- aos-runtime-authority: omp -->
<!-- aos-local-authority: product, domain, data, security, external-effects -->

- Bootstrap estable: la ruta de `## Lectura Inicial` es el bootstrap local;
  Dictation Tauri conserva autoridad sobre producto, dominio, datos, seguridad
  y efectos externos, mientras OMP conserva ejecución y runtime.

- AOS conserva conocimiento durable, continuidad documental, topics, tracks,
  specs, gates locales, skills y el índice contextual.
- Modelos, effort, tools, browser, todos, agentes, planificación,
  paralelización, idioma, estilo y modos runtime pertenecen a OMP; este repo no
  fija defaults para ellos.
- `.omp/extensions/aos-doctor.ts` conserva sólo `/doctor`, diagnóstico local
  read-only y opt-in. `.agents/skills` conserva la discovery de skills locales.
- `aos-realinear-os` abre `docs/topics/agentic-os-operations.md`; las
  operaciones manager-only no son motores diarios.


## Design Context

Para UI/frontend, leer `PRODUCT.md` y `DESIGN.md`; usar `docs/skills/impeccable`. Para superficie visual importante: screenshot real, Impeccable/product-register, revisión visual opcional, small batches, smokes y evidencia en `artifacts/...`.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure, shell commands, and other important information, read the current active spec or track listed in docs/WORKING_MEMORY.md when one exists.
<!-- SPECKIT END -->
