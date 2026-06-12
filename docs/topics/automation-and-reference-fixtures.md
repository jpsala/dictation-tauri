---
id: automation-and-reference-fixtures
status: active
kind: reference
triggers:
  - fixtures
  - audio sintetico
  - TTS
  - STT
  - benchmarks
  - Fixvox
  - electro-bun
  - sin interaccion humana
primary_refs:
  - docs/DECISIONS.md
  - docs/topics/product-direction.md
  - docs/topics/privacy-and-dictation-data.md
  - docs/tracks/mvp-and-reference-resources.md
---

# Automatizacion Y Fixtures De Referencia

## Objetivo

Permitir avanzar el producto sin depender de dictado manual temprano.

El primer camino de validacion debe usar audio sintetico y frases controladas para probar STT, postprocess, delivery y regresiones.

## Referencia Fixvox

Fuente local: `C:\dev\electro-bun-1`.

Recursos observados:

- `.env` con claves locales para proveedores como OpenAI, Groq, OpenRouter y xAI.
- `scripts/generate-tts-benchmark.ts`: genera WAV desde frases con OpenAI TTS.
- `scripts/run-voice-benchmark-matrix.ts`: genera/carga audio, corre STT, postprocess opcional, costos y reportes.
- `docs/reference/ops/tts-benchmark-phrases.txt`: frases tecnicas bilingues para TTS.
- `docs/reference/ops/voice-benchmark-matrix.*.json`: matrices de STT/TTS/postprocess.
- `docs/reference/ops/voice-reference-manifest.yaml`: manifest de muestras humanas y texto esperado.
- `.specify/specs/004-dictation-latency-postprocess/`: reglas de latencia, calidad y verificacion.
- `docs/reference/voice-runtime.md`: fases de ejecucion y aprendizajes de delivery.

## Reglas De Uso

- Modo personal/dev permisivo: se pueden leer `.env`, variables locales, muestras humanas, audio, outputs de benchmarks, transcripciones y logs locales cuando ayuden.
- No imprimir secretos completos en respuestas ni commitear `.env`/tokens salvo pedido explicito y acotado de JP.
- Fixtures sinteticos siguen siendo utiles para automatizacion y comparaciones controladas, pero no son una restriccion de privacidad.
- Mantener scripts propios compatibles con npm/Tauri aunque la referencia use Bun/Electrobun.
- Dictation Tauri puede usar variables disponibles durante desarrollo; para producto propio, evitar acoplamiento accidental a `.env` de Fixvox.
- El proxy existente de Fixvox es referencia o spike, no dependencia del MVP 0-3.

## Variables Disponibles Por Nombre

Variables detectadas por nombre, sin valores:

- `OPENAI-API-KEY`
- `GROQ-API-KEY`
- `OPENROUTER-API-KEY`
- `XAI-API-KEY`
- `FIXVOX_BACKEND_URL`
- `FIXVOX_ADMIN_API_KEY`
- overrides de proveedor/modelo para speech y postprocess

## Criterios De Benchmark

Cada corrida relevante debe poder reportar:

- proveedor/modelo STT;
- duracion de audio;
- formato y bytes de audio;
- latencia STT;
- proveedor/modelo postprocess si aplica;
- costo estimado;
- texto esperado vs transcript vs salida final;
- evidencia de delivery si se prueba insercion.

## Decision Inicial De Fixtures

Formato esperado:

- Un manifest propio de fixtures controlados.
- Frases tecnicas bilingues permitidas si no contienen datos privados.
- Artifacts generados fuera del repo o en rutas gitignored.
- Texto esperado versionado solo si es sintetico/no sensible.
- MVP 2 queda planificado en `specs/003-synthetic-audio-stt/`: versionar manifest/expected text sintetico; dejar audio, transcripts, provider payloads y reports como artifacts locales/gitignored.

Primer runner:

- Propio y chico, inspirado conceptualmente en Fixvox.
- Debe correr sin microfono.
- Debe poder usar adapter mock en MVP 1 y adapter directo local en MVP 2.
- Debe medir STT y postprocess como etapas separadas.

## Estado MVP 2

- Manifest sintetico y expected text versionados en `src/test-fixtures/synthetic-audio-manifest.ts`.
- Artifact root local/gitignored: `artifacts/synthetic-audio-stt/`.
- Comandos implementados sin provider calls: `npm run synthetic-audio:fixtures` y `npm run synthetic-audio:stt:dry-run`.
- Reports dry-run locales: `artifacts/synthetic-audio-stt/reports/`.
- El adapter directo local existe como shell redacted setup/provider-error; no hay comando real-provider habilitado para cierre automatico.

## Estado MVP 3 CI-safe

- Capture fake y WebView adapter estan cubiertos por tests sin pedir microfono real.
- Captured audio entra al `PipelineService` y al shell `ModelGateway` sin provider calls por default.
- Delivery evidence de captured runs distingue transcript disponible, copy fallback, fallo e incertidumbre sin emitir `paste_observed`.
- Comandos dry-run implementados: `npm run microphone-capture:check` y `npm run microphone-capture:dry-run`.
- Audio real y provider real siguen siendo verificaciones opcionales locales con aprobacion explicita de JP.
