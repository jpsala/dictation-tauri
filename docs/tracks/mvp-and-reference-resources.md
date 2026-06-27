---
status: active
started: 2026-06-05
updated: 2026-06-10
priority: high
topic: docs/topics/product-direction.md
related:
  - docs/topics/automation-and-reference-fixtures.md
  - docs/topics/backend-and-model-routing.md
  - docs/topics/privacy-and-dictation-data.md
  - specs/001-port-foundation/spec.md
---

# MVP Y Recursos De Referencia

## Pregunta Viva

Como implementar el alcance MVP 0-3 decidido usando recursos existentes de Fixvox sin copiar su arquitectura ni depender de pruebas manuales tempranas.

## Acuerdo Actual

- Stack propio: React, Vite, TypeScript strict, npm, Tauri v2, Rust 2021, Playwright.
- `C:\dev\copicu` es referencia de stack Tauri.
- `C:\dev\fixvox` / Fixvox es referencia de recursos de voz, benchmarks, prompts y aprendizajes.
- Se busca que no haga falta interaccion humana hasta mas adelante.
- Primeras validaciones deben poder correr con fixtures, audio sintetico y texto esperado.
- MVP 0 ya esta cerrado: app base React/Vite/Tauri minima, Playwright smoke test, capability `core:default`, build/visual/cargo/audit verdes.
- `PRODUCT.md` y `DESIGN.md` ya existen para guiar UI durable.
- `specs/002-simulated-pipeline/plan.md` y `tasks.md` ya existen; MVP 1 esta completo con cancelacion, no-overlap, event ledger y summary derivado.
- `specs/003-synthetic-audio-stt/` define MVP 2: audio sintetico + STT real sobre fixtures. Las tasks estan pendientes y deben ejecutarse por Small Batches.
- Arquitectura guia decidida: pipeline por puertos/adapters, `PipelineService`, event ledger, Tauri/Rust para side effects desktop y delivery por evidencia.

## Recursos Fixvox Observados

- `.env` local con claves disponibles por nombre para OpenAI, Groq, OpenRouter y xAI.
- TTS sintetico via `scripts/generate-tts-benchmark.ts`.
- Benchmark matrix via `scripts/run-voice-benchmark-matrix.ts`.
- Frases tecnicas bilingues en `docs/reference/ops/tts-benchmark-phrases.txt`.
- Matrices STT/TTS/postprocess en `docs/reference/ops/voice-benchmark-matrix.*.json`.
- Manifest de audio humano en `docs/reference/ops/voice-reference-manifest.yaml`.
- Spec activa de latencia/postprocess en `.specify/specs/004-dictation-latency-postprocess/`.
- Runtime reference en `docs/reference/voice-runtime.md`.

## Modelo De Producto Observado

- Sin texto seleccionado: dictado directo, transcripcion y postprocess opcional.
- Con texto seleccionado: la voz funciona como instruccion sobre la seleccion.
- Assistant Mode/Quick Chat usan seleccion como contexto o mensaje inicial.
- `Alt+Q` abre el picker de acciones/presets en Fixvox.
- Hay hotkeys para dictado, push-to-talk, Assistant Mode, paste-last, result history, picker y presets.
- Delivery en Fixvox distingue insert, replace-selection, copy, paste y recovery.

## Backend/Proxy Observado

- Fixvox puede llamar proveedores directos por API key local.
- Tambien tiene un managed proxy para Groq speech/LLM con endpoints OpenAI-compatible.
- El proxy reporta timings, request ids y costos por headers.
- El managed proxy depende de `PROXY_BASE_URL` y device/control-plane.
- Para Dictation Tauri conviene no acoplarse directo al control plane al inicio; mejor crear una interfaz propia que pueda usar adapter directo o proxied.

## Division Propuesta

1. Ejecutar Phase 1 de `specs/003-synthetic-audio-stt/tasks.md`: artifact policy/gitignore y placeholders de comandos sin llamadas reales.
2. Crear manifest propio de fixture textual/audio sintetico sobre los mismos puertos mockeables.
3. Conectar STT real contra audio sintetico con adapter directo local de `ModelGateway`.
4. Agregar postprocess medido como adapter separado si aporta evidencia, sin hacerlo obligatorio.
5. Generar reportes locales gitignored con expected/transcript/output, latencia y costo estimado.
6. Recien despues sumar captura real de microfono y side effects Tauri/Rust.

## Decisiones Promovidas

- MVP 0-3 cerrado en `docs/topics/product-direction.md`.
- `ModelGateway` hibrido: mock primero, adapter directo local en MVP 2.
- Proxy existente queda como referencia/spike, no dependencia inicial.
- En modo personal/dev, Dictation Tauri puede leer `.env`/variables locales de referencia cuando ayude. Para producto propio, evitar acoplamiento accidental a Fixvox.
- Delivery inicial: copy/insert best-effort con fallback.
- Delivery se reporta por evidencia: texto disponible, fallback, paste enviado, paste observado solo si existe verificacion real.
- UI observa eventos/estado y dispara comandos; no es dueña del pipeline.
- Preview no bloquea MVP 0-3.
- Texto seleccionado real queda post-MVP; antes solo fixtures simulados.
- Artifacts locales generados pueden usarse libremente en desarrollo; decidir despues que se versiona, ignora o limpia.

## Pendiente De Decidir

- Si el primer STT real sera Groq `whisper-large-v3-turbo`, OpenAI, xAI u OpenRouter.
- Si usamos una copia minima del benchmark runner o una version nueva mas chica.
- Implementar la politica de artifacts de MVP 2: versionar manifest/expected text sintetico; gitignore para audio, transcripts, provider payloads y reports bajo `artifacts/synthetic-audio-stt/`.
- Si la primera captura de microfono usa Rust/cpal, plugin, WebView MediaRecorder o sidecar.
- Si el adapter directo vive en Rust/Tauri, Node script de benchmark o ambos por fases.
