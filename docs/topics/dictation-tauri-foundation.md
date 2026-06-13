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

La fundacion tecnica MVP 0 esta cerrada: el frontend, Playwright smoke test y crate Tauri minimo existen y pasan checks. Phase 3 de `001-port-foundation` quedo sincronizada con docs, context index y audit.

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
- Permisos/capabilities para hotkeys, tray, delivery y UI durable posteriores.
- Persistencia local.
- Comandos de producto posteriores al scaffold.

## Nota MVP3

La captura real de microfono en Windows usa un fallback nativo Rust/Tauri con
`cpal` y escribe artifacts WAV locales con `hound` bajo
`artifacts/microphone-capture/audio/`. WebView `getUserMedia` queda como adapter
testeado pero no como ruta activa hasta resolver su prompt pendiente en WebView2.

## Proximo Paso

Crear `PRODUCT.md` y `DESIGN.md` antes de app shell/voice dock durable; despues abrir una spec de MVP 1 para pipeline simulado automatizable.

## Regla

Antes de implementar comportamiento durable, completar o actualizar `specs/001-port-foundation/spec.md` y `docs/DEVELOPMENT.md`.

No reinstalar el sistema documental salvo que este roto: `AGENTS.md`, `docs/`, `.agents/`, `.specify/` y el auditor ya son parte del baseline.
