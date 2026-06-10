# Working Memory

Estado vivo del proyecto. Mantener corto.

Ultima actualizacion manual: 2026-06-10.

## Regla

Este archivo no reemplaza a `docs/TOPICS.md`, `docs/DECISIONS.md` ni a las specs.

Sirve para responder rapido:

- que esta activo ahora;
- que topic/spec/task abrir;
- que riesgos no olvidar;
- cual es el siguiente paso probable;
- que contexto vivo o historico ya fue promovido.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Baseline documental/agentico | closed | `docs/PROJECT.md` | Mantener sincronizado con auditor. |
| Fundacion tecnica del port Tauri | checkpoint-a-complete | `specs/001-port-foundation/tasks.md` | Esperar OK de JP para Tauri/Rust minimo. |
| Producto/MVP de dictado | decided | `docs/topics/product-direction.md` | Usar MVP 0-3 como alcance vigente. |
| Mapa Fixvox -> Dictation Tauri | decided | `docs/topics/fixvox-capability-map.md` | Mantener estados de capacidades sincronizados. |
| Fixtures y referencia Fixvox | active | `docs/topics/automation-and-reference-fixtures.md` | Diseñar harness propio de audio sintetico/STT. |
| Seleccion/asistente | draft | `docs/topics/selection-and-assistant-actions.md` | Captura real queda post-MVP; simular seleccion en fixtures. |
| Backend/model routing | decided | `docs/topics/backend-and-model-routing.md` | Implementar `ModelGateway` hibrido con adapter directo local primero. |
| UI/design | active | `docs/topics/ui-design-and-impeccable.md` | Inicializar `PRODUCT.md`/`DESIGN.md` antes de UI durable. |
| Estudio de proyectos fuente | active | `docs/topics/source-project-map.md` | Usar el mapa adopt/adapt/reference para decidir implementacion; mantener la task como plan vivo. |
| Sistema agentico / OS Lite | active | `docs/topics/agentic-project-os-lite.md` | Mantener memoria, topics y audit. |
| Documentacion | active | `docs/topics/docs-knowledge-system.md` | Mantener topics recuperables y tasks livianas. |
| Datos de dictado | decided | `docs/topics/privacy-and-dictation-data.md` | Modo personal/dev permisivo: privacidad no bloquea lectura/uso local. |

## Specs Activas

| Spec | Estado | Rol | Abrir |
| --- | --- | --- | --- |
| `001-port-foundation` | ready-to-scaffold | Base del port Tauri y decisiones iniciales. | `specs/001-port-foundation/spec.md` |

## Topics Activos

| Topic | Estado | Uso |
| --- | --- | --- |
| `agentic-project-os-lite` | active | Como trabajan agentes, memoria viva, audits, subagentes y portabilidad. |
| `docs-knowledge-system` | active | Como leer, crear y dividir docs. |
| `dictation-tauri-foundation` | draft | Stack, estructura y plan inicial del port. |
| `product-direction` | active | MVP por fases y no-goals. |
| `fixvox-capability-map` | active | Capacidades Fixvox filtradas por valor, opciones y decision inicial. |
| `automation-and-reference-fixtures` | active | Recursos Fixvox, TTS/STT, benchmarks y reglas de secretos. |
| `selection-and-assistant-actions` | draft | Texto seleccionado, Assistant Mode, Quick Chat, presets y `Alt+Q`. |
| `backend-and-model-routing` | draft | Opciones de llamadas directas, proxy existente o adapter hibrido. |
| `ui-design-and-impeccable` | active | Uso de impeccable para UI React/Tauri y limites de aplicacion. |
| `privacy-and-dictation-data` | active | Modo personal/dev permisivo para datos locales de dictado. |
| `source-project-map` | active | Que adoptar, adaptar, referenciar, postergar o rechazar desde CopyQ Tauri y Fixvox. |

## Tasks

| Trabajo | Estado | Abrir | Uso |
| --- | --- | --- | --- |
| MVP y recursos de referencia | active | `docs/tasks/mvp-and-reference-resources.md` | Contexto vivo sobre recursos Fixvox y fases propuestas. |
| Estudio de proyectos fuente | active | `docs/tasks/source-project-study-plan.md` | Plan para estudiar nuestro proyecto, proyecto Tauri y proyecto canonico. |
| Prompt proxima sesion | active | `docs/tasks/next-session-prompt.md` | Prompt listo para retomar la discusion. |

Para listar trabajos vivos:

```powershell
rg -l "status:\s*active" docs/tasks -g "*.md"
```

## Decisiones Recientes

- Se instalo Agentic Project OS Lite en el repo.
- Se cerro el baseline documental/agentico: docs raiz, topics, SpecKit, skills locales y auditor quedan sincronizados.
- Se decidio usar el stack base de `C:\dev\chat\copyq-tauri`: React, Vite, TypeScript strict, npm, Tauri v2, Rust 2021 y Playwright.
- Se decidio usar Fixvox (`C:\dev\electro-bun-1`) como referencia de recursos de voz/benchmarks, no como arquitectura.
- Se agrego el principio de evitar interaccion humana temprana mediante fixtures, audio sintetico y tests automatizados.
- Se creo `docs/topics/fixvox-capability-map.md` como filtro de alcance antes de implementar features inspiradas en Fixvox.
- Se aprobo usar `.agents/skills/impeccable` para diseño de superficies UI React/Tauri, con `PRODUCT.md` y `DESIGN.md` como contexto requerido.
- `specs/001-port-foundation/` existe y queda registrada como spec draft inicial.
- Audio, transcripciones, logs, `.env` y artifacts locales se pueden leer y usar en modo personal/dev; privacidad no bloquea el trabajo.
- Se cerro el alcance MVP 0-3: app base, pipeline simulado, audio sintetico/STT real, microfono real.
- Se decidio `ModelGateway` hibrido con adapter directo local primero y proxied como spike posterior.
- Texto seleccionado real queda fuera de MVP 0-3; se permite solo simulacion en fixtures antes.
- UI durable requiere inicializar `PRODUCT.md` y `DESIGN.md`; scaffold tecnico minimo puede avanzar antes.
- Se fijo el diccionario: "nuestro proyecto" = `C:\dev\dictation-tauri`, "proyecto Tauri" = `C:\dev\chat\copyq-tauri`, "proyecto canonico" = `C:\dev\electro-bun-1` / Fixvox.
- El proyecto Tauri es canon tecnico para stack, ventanas, UI, settings, themes y Windows desktop mechanics; el proyecto canonico es canon funcional para dictado, runtime de voz, backend/proxy, policies/env y benchmarks.
- Se creo `docs/topics/source-project-map.md`: scaffold/scripts son `adopt` desde CopyQ Tauri; ventanas/UI/settings/shortcut/tray son `adapt`; runtime/STT/benchmarks/ModelGateway/delivery son `adapt` desde Fixvox; control plane queda `reference`; wake/assistant/Quick Chat quedan `parked`; UIA/Koffi/Python/PowerShell hot path queda `reject`.
- Se migro la continuidad viva desde `docs/active-work/` a `docs/tasks/`; las tasks activas tienen YAML validado y el trabajo cerrado vive en `docs/tasks/archive/`.
- Se adopto Small Batches como principio agentico: una task/comportamiento/checkpoint por tanda, checks verdes, `tasks.md` sincronizado y commit atomico.
- Checkpoint A de `001-port-foundation` quedo completo: frontend React/Vite base, `package-lock.json`, build verde.

## Riesgos Que No Hay Que Olvidar

- No imprimir secretos completos en respuestas ni commitear `.env`/tokens salvo pedido explicito y acotado de JP.
- No copiar dependencias de clipboard/storage/Win32 de `copyq-tauri` sin necesidad documentada.
- En modo personal/dev, se pueden usar servicios externos de STT/LLM/storage con variables locales cuando la tarea lo requiera; para producto estable, documentar la decision.
- Docs pueden quedar stale; si codigo contradice docs, actualizar fuente estable.

## Comandos De Contexto

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

## Proximo Paso Probable

Crear repo Git/GitHub publico y subir commits atomicos del estado actual. Luego, con OK de JP, seguir con Checkpoint B de `001-port-foundation`: Playwright smoke test, `src-tauri/Cargo.toml`, `tauri.conf.json`, `core:default` y `cargo check`.

## Promocion De Memoria

Cuando aparece conocimiento durable:

1. Si es regla de proyecto, va a docs raiz o `AGENTS.md` si es critica.
2. Si es tema reusable, va a `docs/topics/<topic>.md`.
3. Si cambia el estado vivo, actualizar este archivo.
4. Si es decision, registrar o actualizar `docs/DECISIONS.md`.
5. Si viene de una task, resumir la senial durable y no copiar transcript.
