---
status: active
started: 2026-06-07
updated: 2026-06-27
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

Mantener una mesa de trabajo chica para estudiar y aplicar patrones desde:

- nuestro proyecto: `C:\dev\dictation-tauri`;
- proyecto Tauri canonico: `C:\dev\copicu`;
- proyecto funcional canonico: `C:\dev\fixvox` / Fixvox.

Decision 2026-06-27: estas son las unicas rutas fuente activas; no usar ni mencionar worktrees/rutas anteriores como referencia.

El inventario y las decisiones largas ya viven en `docs/topics/source-project-map.md`; no duplicarlas aca.

## Estado Actual

- `source-project-map.md` define que se adopta, adapta, referencia, posterga o rechaza.
- Copicu es canon tecnico para stack Tauri, ventanas, settings, themes, tray, shortcuts y checks visuales.
- Fixvox es canon funcional para dictado, runtime de voz, backend/proxy, policies/env y benchmarks.
- `001-port-foundation` ya completo MVP 0: frontend React/Vite, smoke test Playwright, crate Tauri minimo, capability `core:default`, build/visual/cargo/audit verdes.
- La arquitectura propia ahora queda fijada como pipeline por puertos/adapters, `PipelineService`, event ledger, Tauri/Rust para side effects y delivery por evidencia.

## Reglas

- Mirar Copicu primero para Tauri/React/Vite/Mantine/ventanas/custom chrome/settings/themes/global shortcut/tray/foco/paste/checks visuales.
- Mirar Fixvox primero para dictado/STT/TTS/postprocess/runtime/delivery/policies/backend/proxy/env/benchmarks.
- Todo lo adoptado debe terminar como decision, spec o codigo propio de Dictation Tauri.
- No copiar arquitectura legacy de Fixvox, clipboard manager, SQLite, UIA/Koffi/Python/PowerShell hot path ni control plane sin nueva decision.
- En modo personal/dev se pueden leer `.env`, audio humano, transcripciones, logs y artifacts locales; no imprimir secretos completos ni commitearlos.

## Proximo Trabajo

Estudio actual 2026-06-27:

1. Mapear `C:\dev\copicu` para patrones Tauri/React/Rust utiles: ventanas normales, custom chrome, tray, shortcuts, settings, focus/paste y checks visuales.
2. Mapear `C:\dev\fixvox` para comportamiento funcional: dock, hotkeys, STT/postprocess, prompts, policy, telemetry, recovery y backend/proxy.
3. Registrar aprendizajes aplicables en `docs/topics/source-project-map.md` antes de portar codigo o comportamiento.
4. Todo cambio en Dictation Tauri debe seguir siendo implementacion propia y testeada aca.

## Primer Mapa 2026-06-27

- `C:\dev\copicu`: Tauri 2 + React/Vite/TS + Rust + SQLite. Patrones relevantes para Dictation Tauri: registry/lifecycle de ventanas (`src-tauri/src/surface_registry.rs`, `window_state.rs`), custom window frame (`src/ui/window/`), Settings como ventana normal cacheada/hide, tray/global shortcuts desde Rust y dogfood fuerte de foco/paste. Guardrail importante: callbacks nativos/global-shortcut/tray deben retornar rapido y despachar UI en main thread; evitar `emit` backend->WebView durante callbacks calientes.
- `C:\dev\fixvox`: Svelte 5 + Tailwind sobre su runtime desktop legacy actual, con `src/app/backend/` como runtime vivo y `src/app/views/` como superficies activas. Patrones relevantes: `voice-dock-*`, `hotkeys.ts`, `speech-to-text.ts`, `voice-dock-output.ts`, settings/policy/model routing, managed runtime y proxy. Adoptar comportamiento/proceso, no internals desktop.
- Hotkeys: Copicu aporta reglas de estabilidad Tauri/WebView2 y main-thread-safe; Fixvox aporta catalogo funcional, polling fallback, capture UI y ownership boundaries.
- Dock: Fixvox Skin 4 sigue siendo canon visual/ergonomico (`164x64`, siete dots, hit-region compacta, processing `260x90`), pero la shell debe seguir siendo Tauri/Rust propia.

## Tasks Para Continuar Esta Sesion

- [ ] Copicu/Tauri: leer codigo puntual de `src-tauri/src/surface_registry.rs`, `src-tauri/src/window_state.rs`, `src-tauri/src/hotkeys.rs`, `src-tauri/src/lib.rs` y `src/ui/window/`; extraer solo patrones que apliquen a Settings/ventanas/hotkeys de Dictation Tauri.
- [ ] Fixvox/voz: leer `docs/navigation/features/hotkeys.md`, `docs/navigation/features/voice-dock.md`, `src/app/backend/hotkeys.ts`, `src/app/backend/voice-dock-window.ts`, `src/app/backend/speech-to-text.ts` y `src/app/backend/voice-dock-output.ts`; comparar contra lo ya implementado aca.
- [ ] Actualizar `docs/topics/source-project-map.md` con hallazgos adopt/adapt/reference y gaps concretos antes de abrir nueva spec o tocar producto.
- [ ] Si el siguiente lote sigue en Settings/hotkeys, mantener `docs/tracks/settings-window-and-ui-foundation.md` como handoff de implementacion y validar con app Tauri real, no solo Vite/browser.

## Referencias

- `docs/topics/source-project-map.md`
- `specs/001-port-foundation/tasks.md`
- `docs/topics/dictation-tauri-foundation.md`
