---
status: active
started: 2026-06-07
updated: 2026-06-10
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
- proyecto Tauri: `C:\dev\chat\copyq-tauri`;
- proyecto canonico: `C:\dev\electro-bun-1` / Fixvox.

El inventario y las decisiones largas ya viven en `docs/topics/source-project-map.md`; no duplicarlas aca.

## Estado Actual

- `source-project-map.md` define que se adopta, adapta, referencia, posterga o rechaza.
- CopyQ Tauri es canon tecnico para stack Tauri, ventanas, settings, themes, tray, shortcuts y checks visuales.
- Fixvox es canon funcional para dictado, runtime de voz, backend/proxy, policies/env y benchmarks.
- `001-port-foundation` ya completo MVP 0: frontend React/Vite, smoke test Playwright, crate Tauri minimo, capability `core:default`, build/visual/cargo/audit verdes.
- La arquitectura propia ahora queda fijada como pipeline por puertos/adapters, `PipelineService`, event ledger, Tauri/Rust para side effects y delivery por evidencia.

## Reglas

- Mirar CopyQ Tauri primero para Tauri/React/Vite/Mantine/ventanas/custom chrome/settings/themes/global shortcut/tray/foco/paste/checks visuales.
- Mirar Fixvox primero para dictado/STT/TTS/postprocess/runtime/delivery/policies/backend/proxy/env/benchmarks.
- Todo lo adoptado debe terminar como decision, spec o codigo propio de Dictation Tauri.
- No copiar arquitectura Electrobun/Bun, clipboard manager, SQLite, UIA/Koffi/Python/PowerShell hot path ni control plane sin nueva decision.
- En modo personal/dev se pueden leer `.env`, audio humano, transcripciones, logs y artifacts locales; no imprimir secretos completos ni commitearlos.

## Proximo Trabajo

Despues del estudio Fixvox cloud del 2026-06-20:

1. Ejecutar `specs/009-fixvox-cloud-runtime-port/` Phase 1 RED: tests de contrato sin red para device registration, preflight, managed STT y headers `X-Fixvox-*`.
2. Reimplementar el runtime desktop que Fixvox tiene en Bun/Electrobun como Rust/Tauri propio, tomando contratos y comportamiento, no internals.
3. Usar Fixvox como referencia fuerte para STT managed, postprocess, prompts, policy, telemetry, VAD/no-speech y recovery.
4. Usar CopyQ Tauri como referencia solo cuando entren ventanas custom, settings, tray o shortcuts.

## Referencias

- `docs/topics/source-project-map.md`
- `specs/001-port-foundation/tasks.md`
- `docs/topics/dictation-tauri-foundation.md`
