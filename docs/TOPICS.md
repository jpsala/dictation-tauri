# Topics Del Proyecto

Router liviano de conocimiento del proyecto.

Uso para agentes:

1. Identificar el tema por el pedido.
2. Buscar candidatos por nombre, frontmatter y triggers cuando el pedido sea no trivial.
3. Abrir solo el topic de entrada.
4. Abrir referencias profundas solo si el topic no alcanza.
5. Si se crea documentacion nueva, indexarla aca o en `docs/README.md`.

## Modelo

Cada topic tiene metadata al inicio:

```yaml
---
id: topic-id
status: active | reference | historical | draft | stale | paused | blocked
kind: how-to | reference | explanation | decision-map
triggers:
  - palabras, situaciones o patrones que activan el topic
primary_refs:
  - documentos profundos o codigo relevante
---
```

## Topics De Entrada

| Si el usuario pide o menciona | Abrir primero | Para que sirve |
| --- | --- | --- |
| Producto, MVP, alcance, fases, no-goals, direccion | [Direccion de producto](topics/product-direction.md) | Define norte, MVP por fases y que se evita al inicio. |
| Fixvox/Fixbox, que copiamos, capacidades existentes, alcance comparado | [Mapa de capacidades Fixvox](topics/fixvox-capability-map.md) | Inventario filtrado de capacidades Fixvox y estado decidido para MVP/early/later. |
| Dictado, flujo, pipeline, estados, listening, transcribing, delivery | [Workflow de dictado](topics/dictation-workflow.md) | Modelo de fases de ejecucion y preguntas de UX/runtime. |
| Fixtures, audio sintetico, TTS, STT, benchmarks, Fixvox, pruebas sin JP | [Automatizacion y fixtures](topics/automation-and-reference-fixtures.md) | Como usar recursos de Fixvox sin copiar arquitectura ni secretos. |
| Texto seleccionado, Assistant Mode, Quick Chat, Alt+Q, presets, hotkeys de acciones | [Seleccion y acciones asistidas](topics/selection-and-assistant-actions.md) y [Fixvox Dock/Hotkeys Reference](topics/fixvox-dock-and-hotkeys-reference.md) para hotkeys | Separa dictado directo de transformaciones sobre seleccion y superficies asistidas. |
| Grammarly, input box, focused input, UI Automation, overlay junto al campo | [Grammarly-like input intelligence](topics/grammarly-like-input-intelligence.md) | Estrategia para detectar el campo activo, bounding rect, patrones UIA y observer sin guardar contenido crudo. |
| Backend, proxy, model routing, proveedores, API keys, Groq/OpenAI/OpenRouter/xAI | [Backend y model routing](topics/backend-and-model-routing.md) | Decision de ModelGateway hibrido y orden de adapters. |
| Fixvox cloud, Fixbox backend, managed runtime, proxy compartido, reemplazar Bun por Rust/Tauri | [Fixvox Cloud Runtime Port](topics/fixvox-cloud-runtime-port.md) | Camino para usar la infraestructura cloud de Fixvox desde un runtime Rust/Tauri propio. |
| UI, diseño, frontend, React, app shell, voice dock, settings, impeccable | [UI Design e Impeccable](topics/ui-design-and-impeccable.md) y [Fixvox Dock/Hotkeys Reference](topics/fixvox-dock-and-hotkeys-reference.md) para dock/hotkeys | Cuando y como usar impeccable para superficies React/Tauri, y como respetar la ergonomia Fixvox del dock/dictation key. |
| Documentacion, topics, indice, contexto liviano, tracks | [Sistema de conocimiento](topics/docs-knowledge-system.md) | Explica como leer, crear y dividir docs sin cargar todo. |
| Norte, AOS, sistema agentico, memoria viva, audit de contexto, Small Batches | [Agentic OS (AOS)](topics/agentic-os.md) | Operacion del sistema agentico escalable del proyecto. |
| `aos-realinear-os`, crear, migrar, actualizar o auditar sistema agentico | [Operaciones del sistema agentico](topics/agentic-os-operations.md) | Como reparar o adaptar AOS sin copiar un template ciego ni manager-only. |
| `aos-perfect-os`, dejar en condiciones, calidad agentica | [Calidad Agentica / Perfect OS](topics/os-quality.md) | Checklist de contexto, docs, tracks, skills/adapters, indice y audit. |
| Skills locales, slash commands, comandos Codex, docs/skills, .agents/skills, pasar a skills, evaluar skills | [Skills locales de Codex](topics/local-codex-skills.md) | Skills portables versionadas en `docs/skills/`; `.agents/skills` es compatibilidad local. |
| Port Tauri, stack inicial, estructura, comandos, fundacion | [Fundacion Dictation Tauri](topics/dictation-tauri-foundation.md) | Contexto inicial del port y decisiones pendientes. |
| Proyecto canonico, proyecto Tauri, CopyQ Tauri, Fixvox, estudiar fuentes, que sacar de cada repo | [Plan de estudio de proyectos fuente](tracks/source-project-study-plan.md) | Trabajo vivo para separar que se adopta del proyecto Tauri, del proyecto canonico y de nuestro proyecto. |
| Proyectos fuente, que implementar, que portar, adopt/adapt/reference, CopyQ Tauri vs Fixvox | [Mapa de proyectos fuente](topics/source-project-map.md) | Decision map estable de que se adopta, adapta, referencia, posterga o rechaza desde cada repo fuente. |
| Privacidad, audio, transcripciones, logs, modelos, storage | [Privacidad y datos de dictado](topics/privacy-and-dictation-data.md) | Reglas para tratar datos sensibles de dictado. |
| SpecKit, spec, plan, tasks.md, feature grande | [SpecKit y planificacion](topics/speckit-workflow.md) | Como trabajar con specs y constitucion. |

## Documentos Raiz

| Documento | Rol |
| --- | --- |
| [PROJECT.md](PROJECT.md) | Proposito, estado e infraestructura general. |
| [GLOSSARY.md](GLOSSARY.md) | Aliases, nombres cortos y definiciones recurrentes. |
| [ASSISTANT_RULES.md](ASSISTANT_RULES.md) | Reglas de colaboracion y tono. |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Stack, rutas, persistencia, verificacion y reglas tecnicas. |
| [DECISIONS.md](DECISIONS.md) | Decisiones implementadas y pendientes. |
| [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) | Preguntas pendientes. |
| [tracks/](tracks/) | Trabajos vivos retomables. |

## Paquetes De Skills

- `docs/skills/impeccable/`: skill local para UI/frontend.
- `docs/skills/speckit-*`: Skills locales para workflow SpecKit.
- `docs/skills/{sigamos,cerrar-sesion,continuar-sesion,continuar-sesion-con-gol,realinear-os,evaluar-skills}/`: comandos AOS locales; `aos-*` son aliases en `AGENTS.md`.
- `.specify/`: infraestructura y templates de SpecKit.

## Reglas De Mantenimiento

- Si un documento no esta en este indice, `docs/README.md` o una referencia explicita desde otro doc, esta colgado.
- Si un topic crece demasiado, crear un topic de entrada liviano y mover el detalle a referencia.
- Si una track descubre una regla durable, copiarla a docs raiz o a un topic activo.
- Si una referencia profunda queda obsoleta, marcarla como `stale` o actualizar el topic de entrada.
- Los archivos preexistentes de contexto no deben quedar sueltos: integrarlos, indexarlos, archivarlos con estado claro o preguntar antes de borrarlos.
