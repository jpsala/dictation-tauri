---
id: dictation-tauri-foundation
status: active
kind: reference
triggers:
  - tauri
  - port
  - fundacion
  - stack
  - comandos
  - src-tauri
primary_refs:
  - docs/PROJECT.md
  - docs/DEVELOPMENT.md
  - specs/001-port-foundation/spec.md
---

# Fundacion Dictation Tauri

## Estado

El baseline documental/agentico esta cerrado y auditado.

La fundacion tecnica del port esta lista para scaffold: el stack esta decidido, pero todavia no tiene manifiestos detectados (`package.json`, `Cargo.toml`, `tauri.conf.json`) ni comandos oficiales verificados.

Stack decidido:

- React + Vite.
- TypeScript strict.
- npm con `package-lock.json`.
- Tauri v2.
- Rust edition 2021.
- Playwright para checks visuales.

## Estructura Inicial

```text
src/
src-tauri/
src-tauri/capabilities/
src-tauri/icons/
src-tauri/src/
specs/001-port-foundation/
```

## Decisiones Pendientes

- Motor de dictado/transcripcion.
- Modelo de permisos/capabilities.
- Persistencia local.
- Comandos de verificacion.

## Regla

Antes de implementar comportamiento durable, completar o actualizar `specs/001-port-foundation/spec.md` y `docs/DEVELOPMENT.md`.

No reinstalar el sistema documental salvo que este roto: `AGENTS.md`, `docs/`, `.agents/`, `.specify/` y el auditor ya son parte del baseline.
