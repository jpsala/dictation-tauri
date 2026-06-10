---
status: active
started: 2026-06-05
updated: 2026-06-07
priority: medium
topic: docs/topics/dictation-tauri-foundation.md
related:
  - docs/WORKING_MEMORY.md
  - specs/001-port-foundation/spec.md
---

# Prompt Para Proxima Sesion

Usar este prompt para retomar despues del cierre de alcance MVP.

```text
Estamos en C:\dev\dictation-tauri. El pase de alcance de producto ya esta cerrado. Quiero avanzar con el siguiente paso sin reabrir decisiones resueltas.

Primero lee:

1. AGENTS.md
2. docs/WORKING_MEMORY.md
3. docs/topics/product-direction.md
4. docs/topics/fixvox-capability-map.md
5. specs/001-port-foundation/spec.md

Despues, si hace falta, lee:

- docs/topics/dictation-workflow.md
- docs/topics/automation-and-reference-fixtures.md
- docs/topics/selection-and-assistant-actions.md
- docs/topics/backend-and-model-routing.md
- docs/topics/privacy-and-dictation-data.md
- docs/topics/ui-design-and-impeccable.md

Contexto importante:

- El baseline documental/agentico ya esta cerrado y auditado.
- El stack tecnico ya esta decidido: React, Vite, TypeScript strict, npm, Tauri v2, Rust 2021 y Playwright.
- C:\dev\chat\copyq-tauri es referencia de stack Tauri.
- C:\dev\electro-bun-1 / Fixvox es referencia de producto, fixtures, TTS/STT, benchmarks y aprendizajes, pero no se porta literalmente.
- Queremos evitar interaccion humana temprana: primero fixtures, audio sintetico, STT/postprocess medido y tests automatizados.
- Modo personal/dev permisivo: podes leer `.env`, audio humano, transcripciones, logs y artifacts locales si ayuda; no imprimas secretos completos ni commitees `.env`/tokens salvo pedido explicito.
- MVP 0-3 ya esta decidido: app base, pipeline simulado, audio sintetico/STT real, microfono real.
- ModelGateway sera hibrido con adapter directo local primero; proxy existente solo como spike posterior.
- Texto seleccionado real queda fuera de MVP 0-3, aunque se puede simular en fixtures.
- Para UI React/Tauri usaremos `.agents/skills/impeccable`. Antes de UI durable hay que crear PRODUCT.md y DESIGN.md.

Objetivo de la sesion:

1. Scaffold de la fundacion tecnica 001-port-foundation.
2. Crear package.json, package-lock.json, vite.config.ts, tsconfig.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json y capabilities minimas.
3. Crear una app React/Tauri base verificable, sin UI durable de producto.
4. Documentar comandos reales de dev/build/test/check.
5. Correr checks relevantes, `bun scripts/context-index.ts` y `bun scripts/agent-context-audit.ts`.

No reabras alcance MVP salvo que aparezca una contradiccion tecnica fuerte. No implementes features de dictado todavia.
```

## Nota

Si la sesion arranca directamente con "go" o "seguimos", abrir `specs/001-port-foundation/spec.md` como ruta principal.
