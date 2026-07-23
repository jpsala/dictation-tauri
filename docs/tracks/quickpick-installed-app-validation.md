---
status: complete
started: 2026-07-21
updated: 2026-07-21
priority: high
owner: JP
related:
  - docs/tracks/quickpick-alt-q-reliability.md
topic: docs/topics/selection-and-assistant-actions.md
source_refs:
  - package.json
  - scripts/release-windows.ps1
  - src/App.tsx
  - src/selection-transform/host-capture-boundary.ts
  - src-tauri/tauri.conf.json
  - src-tauri/src/companion_window.rs
  - src-tauri/src/fixvox_cloud.rs
  - src-tauri/src/selection_capture.rs
  - src-tauri/tests/fixvox_cloud_contract.rs
  - tests/selection-transform/host-capture-boundary.test.ts
  - tests/settings/admin-configuration-hub.test.ts
  - tests/voice-dock/companion-view.test.tsx
  - tests/voice-dock/companion-window-host.test.ts
---

# QuickPick — Installed App Validation

## Objetivo

Entregar y validar QuickPick instalado: posicionamiento DPI-aware, semántica selección-vs-modo persistente, compatibilidad con WhatsApp y ejecución managed contra la autoridad Cloudflare vigente.

## Resultado final

- QuickPick usa tamaño/posición físicos, escala del monitor del dock y clamping al `work_area`; tests cubren escalas `1.0`, `1.25`, `1.5`, `2.0`, taskbar, bordes y orígenes negativos.
- Con texto seleccionado, el preset se ejecuta one-off y no queda modo activo. Sólo una captura `no_selection` explícita permite preset persistente; captura fallida/incierta limpia el preset y falla cerrado.
- WhatsApp/Electron usa fallback de selección acotado al picker: UI Automation primero, clipboard roundtrip con restauración best-effort y un retry. El fallback global continúa gated.
- La autoridad `https://auth-fixvox.jpsala.dev` usa temporalmente `/v1/chat/completions`; self-hosted conserva `/product/v1/runtime/actions`. La selección realiza exactamente una llamada según backend, sin retry canónico→legacy.
- Fixvox Tauri `0.1.0` quedó actualizada localmente con installer/payload verificados y backups externos preservados.
- Smoke instalado provider-free en WhatsApp: captura `ok`, estado `selected`, cero mensajes/borradores tocados y ningún badge persistente. JP confirmó después que **Corregir texto** reemplaza la selección correctamente y no deja el modo activo.
- JP retiró el smoke físico a DPI `150%` como requisito; no se afirma evidencia inexistente.

## Decisiones durables

- El hash autoritativo para una instalación NSIS es el payload extraído, no necesariamente `target/release/dictation-tauri.exe` post-bundle.
- Selección de picker es tri-state: `selected | definitely_empty | uncertain`; `uncertain` nunca puede activar persistencia.
- La compatibilidad Cloudflare se decide antes del request: exactamente una ruta/llamada. El probe provider-free confirmó `POST /product/v1/runtime/actions = 404`; no corresponde desplegar backend desde este batch.
- Build e installer salen del árbol de trabajo actual por decisión explícita de JP; no representan una revisión reproducible desde un commit limpio.

## Artifact local vigente

- Installer: `Fixvox Tauri_0.1.0_x64-setup.exe`, `29,569,351` bytes.
- SHA256 installer: `a7c3f29de3c9ae43747a7414fbbb3cb9c43c02e57199a587f7b75ed7fe1843f1`.
- Payload/instalado `dictation-tauri.exe`: `29,383,404` bytes.
- SHA256 payload/instalado: `b59710c39f70a16b94ce476a682fd8bcfffaa99aa5110aa683e450fba2899321`.
- Backup inmediato: `%LOCALAPPDATA%\PiBackups\dictation-tauri\20260721-125907-whatsapp-selection-r2`.

## Checks y evidencia

- Product checks release: `245/245`; frontend build y bundle NSIS verdes.
- Selección/QuickPick focal: `50/50`; Rust selection capture: `3/3`.
- Contratos Cloud: `38/38`; `cargo check` y diagnostics sin errores del batch.
- Installer exit `0`; hash instalado igual al payload extraído.
- Evidencia redacted: `artifacts/quickpick-whatsapp-selection/20260721-125907-whatsapp-selection-r1/`.

## Publicación

Por autorización explícita de JP se publicó, sin rebuild, el installer final verificado:

- Vigente: `fixvox-tauri-v0.1.0-20260721132021`.
- Release: `https://github.com/jpsala/fixvox-releases/releases/tag/fixvox-tauri-v0.1.0-20260721132021`.
- Descarga directa: `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260721132021/Fixvox-Tauri-Setup.exe`.
- Installer y checksum adjuntos; la redescarga coincide con SHA256 `a7c3f29de3c9ae43747a7414fbbb3cb9c43c02e57199a587f7b75ed7fe1843f1`.
- Es un prerelease Windows unsigned desde el árbol local actual. Incluye posicionamiento, selección WhatsApp/tri-state y compatibilidad Cloudflare final; no afirma smoke físico a DPI `150%`.
- El prerelease anterior `fixvox-tauri-v0.1.0-20260721112453` queda superseded.

## Follow-up separado

La app no muestra versión/tag/build visible, lo que dificulta distinguir artifacts. Ese gap requiere un issue propio.

## No objetivos

No hubo commit, push de source, deploy, clean install, uninstall/reset, borrado de app data, cambio de autostart, login, dictado/audio, envío de mensajes WhatsApp ni cambio de DPI.
