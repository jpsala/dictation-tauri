---
status: archived
started: 2026-06-05
updated: 2026-06-07
priority: medium
topic: docs/topics/product-direction.md
related:
  - docs/topics/fixvox-capability-map.md
  - docs/topics/backend-and-model-routing.md
  - docs/topics/privacy-and-dictation-data.md
  - specs/001-port-foundation/spec.md
---

# Product Scope Decision Pass

## Objetivo

Recorrer las capacidades inspiradas en Fixvox y decidir el alcance inicial de Dictation Tauri antes de implementar features de producto.

Esta task fue el lugar para la discusion viva. Las decisiones durables deben promoverse a:

- `docs/topics/fixvox-capability-map.md`;
- `docs/topics/product-direction.md`;
- `docs/DECISIONS.md`;
- `specs/001-port-foundation/spec.md` o una nueva spec si cambia el alcance tecnico.

## Contexto Aceptado

- El baseline documental/agentico esta cerrado.
- Stack decidido: React, Vite, TypeScript strict, npm, Tauri v2, Rust 2021, Playwright.
- `C:\dev\chat\copyq-tauri` es referencia de stack Tauri.
- `C:\dev\electro-bun-1` / Fixvox es referencia de producto, recursos de voz, fixtures y benchmarks.
- No se porta Fixvox literalmente.
- Modo personal/dev permisivo: se pueden leer `.env`, audio humano, transcripciones, logs y artifacts locales si ayuda; no imprimir secretos completos ni commitear `.env`/tokens salvo pedido explicito.
- La prioridad inicial es evitar interaccion humana temprana mediante fixtures, TTS sintetico, STT y tests automatizados.

## Documentos De Entrada

Leer en este orden:

1. `docs/WORKING_MEMORY.md`
2. `docs/topics/product-direction.md`
3. `docs/topics/fixvox-capability-map.md`
4. `docs/topics/dictation-workflow.md`
5. `docs/topics/automation-and-reference-fixtures.md`
6. `docs/topics/selection-and-assistant-actions.md`
7. `docs/topics/backend-and-model-routing.md`
8. `docs/topics/privacy-and-dictation-data.md`
9. `specs/001-port-foundation/spec.md`

Referencia externa opcional, solo si hace falta:

- `C:\dev\electro-bun-1\docs\reference\voice-runtime.md`
- `C:\dev\electro-bun-1\.specify\specs\004-dictation-latency-postprocess\spec.md`
- `C:\dev\electro-bun-1\scripts\run-voice-benchmark-matrix.ts`
- `C:\dev\electro-bun-1\scripts\generate-tts-benchmark.ts`

## Decisiones A Tomar

### Producto

- El producto principal es dictado rapido universal, asistente contextual de escritura, o ambos por fases?
- El primer usuario objetivo es JP/dev power user o usuario final no tecnico?
- El primer flujo debe entregar automaticamente, mostrar preview, o usar copy-only?
- El modo con texto seleccionado entra en el primer MVP real o en el segundo?
- `Alt+Q` sera picker de acciones, Quick Chat, ambos por contexto, o queda para despues?

### MVP

- Confirmar o ajustar el MVP candidato de `docs/topics/fixvox-capability-map.md`.
- Separar MVP 0 tecnico, MVP 1 pipeline simulado, MVP 2 STT sintetico, MVP 3 microfono real.
- Definir criterios de cierre de cada fase.

### Automatizacion

- Decidir formato de fixtures propios.
- Decidir si se crea un runner minimo inspirado en Fixvox o si se adapta por partes.
- Definir donde guardar artifacts locales (`artifacts/`, `.tmp/`, app data, etc.) y reglas de gitignore.
- Elegir primer set de frases sinteticas no sensibles.

### Model Gateway

- Elegir adapter inicial: directo local, proxy existente, o hibrido con directo primero.
- Definir proveedores/modelos iniciales para STT y postprocess.
- Decidir si se lee `.env` propio o variables compartidas de Fixvox durante desarrollo.

### Privacidad

- Confirmar que no se persisten audio/transcripciones reales en fases tempranas.
- Definir que logs estan permitidos.
- Definir si ultimo resultado vive en memoria, app data, logs o historial local durante desarrollo.

## Resultado Esperado

Al cerrar esta task deberia existir:

- decision de alcance MVP en `docs/DECISIONS.md`;
- `docs/topics/fixvox-capability-map.md` actualizado con estados confirmados;
- `docs/topics/product-direction.md` actualizado con MVP final;
- `specs/001-port-foundation/spec.md` actualizado si el scaffold debe incluir harness/fixtures;
- si aplica, nueva spec para pipeline de dictado/fixtures.

## Resultado

Cerrado el 2026-06-05.

Decisiones promovidas:

- MVP 0-3 cerrado en `docs/topics/product-direction.md`.
- Mapa Fixvox actualizado en `docs/topics/fixvox-capability-map.md`.
- Decisiones durables registradas en `docs/DECISIONS.md`.
- `ModelGateway` hibrido con adapter directo local primero.
- Seleccion real queda post-MVP, aunque se simula en fixtures.
- UI durable requiere `PRODUCT.md` y `DESIGN.md`.
- `specs/001-port-foundation/spec.md` sincronizada con alcance resuelto.

No se implementaron features de producto en este pase.
