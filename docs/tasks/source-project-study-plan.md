---
status: active
started: 2026-06-07
updated: 2026-06-07
priority: high
topic: docs/topics/source-project-map.md
related:
  - docs/topics/dictation-tauri-foundation.md
  - docs/topics/fixvox-capability-map.md
  - docs/topics/product-direction.md
  - docs/topics/backend-and-model-routing.md
---

# Plan De Estudio De Proyectos Fuente

## Objetivo

Organizar como estudiar y traer conocimiento desde tres fuentes sin mezclar responsabilidades:

- nuestro proyecto: `C:\dev\dictation-tauri`;
- proyecto Tauri: `C:\dev\chat\copyq-tauri`;
- proyecto canonico: `C:\dev\electro-bun-1` / Fixvox.

La meta no es copiar todo. Es decidir que patrones son canónicos para Dictation Tauri, documentarlos y recien despues scaffoldar o implementar.

## Diccionario Operativo

| Nombre | Ruta | Rol |
| --- | --- | --- |
| Nuestro proyecto | `C:\dev\dictation-tauri` | Producto nuevo y fuente de verdad final para decisiones adoptadas. |
| Proyecto Tauri | `C:\dev\chat\copyq-tauri` | Canon tecnico para stack Tauri moderno, ventanas, UI, settings, themes y Windows desktop mechanics. |
| Proyecto canonico | `C:\dev\electro-bun-1` | Canon funcional para dictado real, voz, runtime, backend/proxy, policy/env, benchmarks y aprendizajes de producto. |

## Regla De Extraccion

- Si el tema es Tauri/React/Vite/Mantine/ventanas/custom chrome/settings/themes/global shortcut/tray/foco/paste/checks visuales, mirar primero el proyecto Tauri.
- Si el tema es dictado/STT/TTS/postprocess/runtime de voz/delivery/policies/backend/proxy/env/benchmarks, mirar primero el proyecto canonico.
- Si ambos tienen informacion, documentar el conflicto en nuestro proyecto antes de implementar.
- Todo lo adoptado debe terminar en `docs/`, `specs/` o codigo propio de Dictation Tauri. No dejar dependencia implicita a memoria conversacional.
- Modo personal/dev permisivo: se pueden leer `.env`, audio humano, transcripciones, logs y artifacts locales cuando ayuden al estudio.
- No imprimir secretos completos en respuestas ni commitear `.env`/tokens salvo pedido explicito y acotado de JP.
- No importar arquitectura Electrobun/Bun de Fixvox.

## Inventario Inicial Del Proyecto Tauri

Rutas ya verificadas:

- `C:\dev\chat\copyq-tauri\package.json`
- `C:\dev\chat\copyq-tauri\src-tauri\Cargo.toml`
- `C:\dev\chat\copyq-tauri\src-tauri\tauri.conf.json`
- `C:\dev\chat\copyq-tauri\docs\topics\ui-surface-architecture.md`
- `C:\dev\chat\copyq-tauri\docs\topics\custom-window-system.md`
- `C:\dev\chat\copyq-tauri\docs\topics\mantine-ui-system.md`
- `C:\dev\chat\copyq-tauri\docs\topics\global-shortcut-and-tray.md`
- `C:\dev\chat\copyq-tauri\docs\topics\windows-focus-and-paste.md`
- `C:\dev\chat\copyq-tauri\src\ui\window\CustomWindowFrame.tsx`
- `C:\dev\chat\copyq-tauri\src\ui\window\WindowControls.tsx`
- `C:\dev\chat\copyq-tauri\src\ui\window\windowChrome.ts`
- `C:\dev\chat\copyq-tauri\src\ui\window\windowVariants.ts`
- `C:\dev\chat\copyq-tauri\src\mantineTheme.ts`
- `C:\dev\chat\copyq-tauri\src\themeCatalog.ts`
- `C:\dev\chat\copyq-tauri\src-tauri\src\lib.rs`
- `C:\dev\chat\copyq-tauri\src-tauri\src\host.rs`
- `C:\dev\chat\copyq-tauri\src-tauri\src\window_focus.rs`
- `C:\dev\chat\copyq-tauri\src-tauri\src\ui_host.rs`

Señales ya extraidas:

- Stack: React 19, Vite, TypeScript, npm, Tauri v2, Rust 2021, Playwright.
- UI: Mantine para controles comunes/settings; CSS custom donde hay comportamiento especializado.
- Ventanas: superficies standalone por label; Settings no es overlay; custom chrome compartido por composicion.
- Chrome: `decorations: false`, `transparent: false`, `shadow: false` como default seguro validado en Windows para ventanas solidas.
- Checks: `npm run build`, `npm run visual:check`, `cargo check` con `CARGO_TARGET_DIR=target-codex-check`.
- Desktop mechanics: shortcut global y tray desde Rust; foco/paste con `windows` crate, `GetForegroundWindow`, `SetForegroundWindow`, `SendInput`.

## Inventario Inicial Del Proyecto Canonico

Rutas activas ya verificadas:

- `C:\dev\electro-bun-1\docs\reference\voice-runtime.md`
- `C:\dev\electro-bun-1\.specify\specs\002-voice-runtime-architecture\spec.md`
- `C:\dev\electro-bun-1\.specify\specs\002-voice-runtime-architecture\plan.md`
- `C:\dev\electro-bun-1\.specify\specs\003-settings-policy-control-plane\spec.md`
- `C:\dev\electro-bun-1\.specify\specs\003-settings-policy-control-plane\api-contract.md`
- `C:\dev\electro-bun-1\.specify\specs\004-dictation-latency-postprocess\plan.md`
- `C:\dev\electro-bun-1\docs\reference\ops\tts-benchmark-phrases.txt`
- `C:\dev\electro-bun-1\docs\reference\ops\voice-benchmark-matrix.stt-only.json`
- `C:\dev\electro-bun-1\docs\reference\ops\voice-benchmark-matrix.bilingual-stt.json`
- `C:\dev\electro-bun-1\docs\reference\ops\voice-benchmark-prompts\stt\*.txt`
- `C:\dev\electro-bun-1\docs\reference\ops\voice-benchmark-prompts\postprocess\*.md`

Rutas historicas utiles, no activas por defecto:

- `C:\dev\electro-bun-1\docs\archive\2026-04-07-docs-cleanup\reference\architecture\configuration-ownership-model.md`
- `C:\dev\electro-bun-1\docs\archive\2026-04-07-docs-cleanup\reference\architecture\recipe-policy-contract.md`
- `C:\dev\electro-bun-1\docs\archive\2026-04-07-docs-cleanup\reference\ops\voice-benchmark-protocol.md`
- `C:\dev\electro-bun-1\docs\archive\2026-04-07-docs-cleanup\reference\ops\voice-endpoint-quality-flow.md`

Señales ya extraidas:

- Runtime de voz: trigger, target capture, route classification, recording, transcription, output materialization, delivery y completion/failure.
- Wake/microphone: no pedir permiso de microfono al startup; wake listening deshabilitado por default.
- Postprocess: lo habilita policy/effective runtime; prompts no deben saltarse esa frontera.
- Delivery: Chromium/WebView debe leerse muchas veces como paste enviado, no paste observado.
- Target final puede ganar sobre target inicial si es plausible y el usuario cambio de app mientras dictaba.
- UIA/Koffi/Python/PowerShell/helper exe quedan descartados o parked salvo nueva decision explicita.
- Policies/control-plane/env tienen valor como referencia de contrato, pero nuestro MVP no debe acoplarse a ese backend.

## Fases De Trabajo

### Fase 1 - Mapa De Fuentes

- Completar inventario de docs y code anchors de ambos proyectos.
- Marcar cada ruta como `adopt`, `adapt`, `reference`, `parked` o `reject`.
- Promover el resultado a un topic estable: `docs/topics/source-project-map.md`.

### Fase 2 - Fundacion Tecnica Desde Proyecto Tauri

- Derivar scaffold de `001-port-foundation` desde el proyecto Tauri.
- Adoptar stack, scripts, capabilities minimas, ventanas base y checks.
- No copiar dependencias de clipboard, SQLite, Win32 paste o storage hasta que una spec de dictado las justifique.

### Fase 3 - UI Y Settings

- Crear `PRODUCT.md` y `DESIGN.md`.
- Adaptar el modelo de superficies: main/voice dock, settings, notifications/recovery si aplica.
- Adoptar Mantine, wrappers, theme catalog y custom chrome compartido.
- Diseñar Settings de dictado como superficie standalone, no overlay.

### Fase 4 - Runtime De Dictado Desde Proyecto Canonico

- Convertir el runtime de voz de Fixvox en contrato propio de Dictation Tauri.
- Definir `ModelGateway`, estados de pipeline y fixtures.
- Permitir audio/transcripciones/logs reales en desarrollo local si aceleran el runtime de dictado; documentar antes de convertirlo en contrato de producto.

### Fase 5 - Backend, Policy Y Env

- Estudiar policy/control-plane/env de Fixvox como referencia de ownership.
- Definir frontera local para MVP: puede leer `.env`/variables disponibles durante desarrollo, con adapter directo primero y proxy como spike.
- Documentar que behavior remoto/backend-managed no se asume para el primer corte.

## Proximo Paso Concreto

Usar `docs/topics/source-project-map.md` para scaffoldar `001-port-foundation`:

- adoptar stack/scripts base desde CopyQ Tauri;
- adaptar solo lo necesario de ventanas/custom chrome despues de la app base;
- mantener runtime/STT/benchmarks/ModelGateway como contratos propios;
- no traer dependencias de clipboard, SQLite, Win32 paste, UIA/Koffi/Python/PowerShell hot path ni control plane sin nueva decision.

Actualizar `specs/001-port-foundation/spec.md` si el scaffold cambia alguna decision tecnica antes de implementar.
