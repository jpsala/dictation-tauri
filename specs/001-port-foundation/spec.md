# Feature Specification: Port Foundation

**Feature Branch**: `001-port-foundation`  
**Created**: 2026-06-05  
**Status**: Ready to scaffold  
**Input**: Estructura inicial para una app de dictado basada en Tauri.

## Current Baseline

Cerrado el 2026-06-05:

- `AGENTS.md`, `docs/`, `docs/topics/`, `docs/tasks/`, `specs/`, `.agents/skills/`, `.specify/` y `scripts/agent-context-audit.ts` existen como sistema agentico liviano.
- `docs/DECISIONS.md` registra modo personal/dev permisivo para datos locales como regla vigente.
- `.specify/memory/constitution.md` define principios de privacidad, estado durable, entrega incremental y diseno apropiado al producto.
- `bun scripts/agent-context-audit.ts` pasa.

No cerrado todavia:

- No hay manifiestos `package.json`, `Cargo.toml` ni `tauri.conf.json`.
- No hay app Tauri funcional verificada.
- No hay comandos oficiales de dev/build/test/lint.
- No hay decision final de permisos/capabilities de dictado real.
- No hay app base scaffolded.

Cerrado el 2026-06-05 despues del pase de producto:

- Alcance MVP 0-3: app base, pipeline simulado, audio sintetico/STT real, microfono real.
- `ModelGateway`: interfaz hibrida con adapter directo local primero y proxied despues.
- Texto seleccionado real queda fuera de MVP 0-3.
- Privacidad no bloquea lectura/uso/persistencia experimental local de audio/transcripciones/logs.
- UI durable requiere `PRODUCT.md` y `DESIGN.md` antes de construirse.

## Technical Direction

Decision aceptada el 2026-06-05:

- Frontend: React + Vite.
- Lenguaje frontend: TypeScript strict.
- Package manager: npm con `package-lock.json`.
- Desktop runtime: Tauri v2.
- Backend desktop: Rust edition 2021.
- UI verification: Playwright.
- Primer set de capabilities: minimo, empezar con `core:default`.

El patron de referencia es `C:\dev\copicu`, pero no se deben copiar dependencias especificas de clipboard, SQLite, Win32 o storage sin una necesidad documentada.

El mapa estable de que adoptar desde proyectos fuente vive en `docs/topics/source-project-map.md`.

Decisiones importables para este scaffold:

- Adoptar desde Copicu: React, Vite, TypeScript strict, npm, Tauri v2, Rust 2021, Playwright y scripts base.
- Adaptar, no copiar todavia: ventanas custom, Mantine/theme/settings, shortcut/tray/background.
- No incluir en la fundacion tecnica: clipboard/storage, SQLite, notification plugin, `windows` crate, global shortcut/tray o dependencias de dictado hasta que una spec las requiera.
- Usar Fixvox solo como referencia funcional posterior para pipeline, STT/postprocess benchmarks, `ModelGateway` y delivery; no importar legacy Fixvox desktop internals ni control plane en MVP 0.

## User Scenarios & Testing

### Primary User Story

Como owner del proyecto, quiero una base Tauri minima y verificable para poder desarrollar una app de dictado sin decisiones implicitas sobre stack, permisos o persistencia de producto.

### Acceptance Scenarios

1. Dado un repo limpio, cuando una sesion nueva empieza, entonces puede leer `AGENTS.md` y `docs/WORKING_MEMORY.md` para encontrar la spec activa y el modo personal/dev permisivo.
2. Dado que se elige un stack frontend y Tauri, cuando se agregan manifiestos, entonces `docs/DEVELOPMENT.md` documenta comandos de dev/build/test.
3. Dado que la app maneja audio o transcripciones, cuando se convierte storage o integraciones en comportamiento estable de producto, entonces existe una decision documentada sobre persistencia.
4. Dado que el baseline documental ya esta cerrado, cuando se retoma la fundacion, entonces el trabajo empieza por decisiones tecnicas y no por reinstalar el sistema de memoria.
5. Dado que el stack tecnico ya esta decidido, cuando se scaffolda la app base, entonces debe usar React, Vite, TypeScript, npm, Tauri v2 y Rust 2021.

## Requirements

### Functional Requirements

- **FR-001**: El proyecto debe documentar stack, comandos y estructura real antes de cerrar la fundacion.
- **FR-002**: La base Tauri debe definir capacidades/permisos necesarios para el MVP antes de integrar captura de audio o dictado.
- **FR-003**: La politica de audio, transcripciones, logs y persistencia debe estar documentada antes de convertir el storage en contrato estable de producto.
- **FR-004**: El repo debe mantener el sistema agentico auditable con `bun scripts/agent-context-audit.ts`.
- **FR-005**: La fundacion tecnica no debe considerarse cerrada hasta que exista una app base ejecutable y verificada.
- **FR-006**: Los manifiestos deben reflejar el stack decidido y no incluir dependencias de dominio hasta que una feature las requiera.

### Non-Goals

- Implementar el motor final de dictado.
- Elegir proveedor externo de transcripcion.
- Convertir historial local en comportamiento estable de producto sin decision explicita.
- Implementar captura real de seleccion.
- Implementar Quick Chat, Assistant Mode, `Alt+Q` o wake words.

## Key Entities

- **Dictation Session**: una captura o transcripcion de voz. Sus campos exactos estan pendientes.
- **Transcript**: texto generado o editado desde voz. Sensible por defecto.
- **App Settings**: configuracion local de idioma, motor, atajos o comportamiento de datos. Persistencia pendiente.

## Success Criteria

- **SC-001**: Una nueva sesion puede encontrar estado, reglas y proximos pasos en menos de cinco archivos.
- **SC-002**: Los comandos oficiales de desarrollo y verificacion quedan documentados cuando existan.
- **SC-003**: Ninguna feature de dictado convierte persistencia local experimental en comportamiento estable sin decision documentada.
- **SC-004**: El cierre tecnico incluye evidencia de verificacion de la app base y del auditor de contexto.

## Open Questions

- Se guardaran settings locales en la primera version tecnica?
- Que capabilities/permisos minimos exactos requiere la app base antes de audio real?
- El pipeline/fixtures tendra spec separada o se agregara como extension de esta fundacion?

## Follow-Up Scope

La fundacion tecnica debe crear una app base verificable sin fijar UI durable. Despues:

1. Inicializar `PRODUCT.md` y `DESIGN.md` antes de app shell/voice dock.
2. Crear una spec de pipeline/fixtures si se implementa MVP 1-2 fuera del scaffold.
3. Documentar provider/model inicial antes del primer STT real.
