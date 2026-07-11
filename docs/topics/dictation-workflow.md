---
id: dictation-workflow
status: draft
kind: explanation
triggers:
  - dictado
  - workflow
  - flujo
  - estados
  - pipeline
  - listening
  - transcribing
primary_refs:
  - docs/topics/product-direction.md
  - docs/topics/privacy-and-dictation-data.md
  - docs/topics/automation-and-reference-fixtures.md
  - docs/topics/fixvox-dock-and-hotkeys-reference.md
---

# Workflow De Dictado

## Modelo Inicial

El pipeline debe poder correrse con entradas reales o sinteticas.

Fases esperadas:

1. Trigger.
2. Captura o carga de audio.
3. Transcripcion.
4. Postprocess opcional.
5. Preview o entrega directa.
6. Delivery al target.
7. Completion, failure o recovery.

## Principio

La UI no debe ser la unica dueña del flujo. Las acciones deben poder dispararse desde hotkey, tray, test harness, fixture runner o UI.

El primer flujo de producto es dictado rapido universal. La seleccion real y los modos asistidos son extensiones posteriores.

Decision 2026-06-25: el proceso de dictado/texto debe adoptar Fixvox como canon. Dictation Tauri conserva una frontera propia para desktop shell y testabilidad, pero no debe reinterpretar el proceso que en Fixvox ya funciona: audio prep, STT, servicios, prompts, policy, postprocess, sanitizer, fallback y materializacion final.

Estado 2026-06-25 (`013` completo): `src/fixvox-text-runtime` contiene los primitivos puros adoptados de Fixvox; el request TS/Tauri acepta politica `postProcess`; Rust/Tauri ejecuta managed STT y, si la policy lo habilita, managed chat `/v1/chat/completions`; delivery consume el texto final materializado y cae a transcript raw si el provider/sanitizer falla o devuelve empty. Evidencia durable debe registrar longitudes/metadata/sanitizer reason, no raw transcript.

Estado 2026-07-11 (`018` completo): audio runtime parity cubre VAD/no-speech local, auto-stop por silencio, optimización MP3/fallback, preferencias de mute-output/sound cues y stage telemetry redacted para capture/audio-prep/STT/postprocess/delivery. Audio prep comprime cuando `originalBytes >= 160_000`, prefiere FFmpeg 7.1.1 empaquetado junto al ejecutable, conserva fallback a `PATH`/WAV y en Windows usa `CREATE_NO_WINDOW`. Los reports host-owned surfacean `runtimeTelemetryStages` + `runtimeTelemetrySummary` con metadata concisa y sin raw transcript/audio.

Correccion 2026-06-29: `013` cerro parity de primitivos y materializacion, pero no garantiza parity del **runtime efectivo**. En la maquina de JP, Fixvox real resuelve desde policy/cache `pro`: STT `groq/whisper-large-v3-turbo`, prompt tecnico de transcripcion y `enableRawPostProcess=false`. Dictation Tauri todavia puede caer a `whisper-large-v3`, no envia todos los campos Fixvox del request STT y fuerza postprocess desde React. Por lo tanto, hasta completar `docs/tracks/fixvox-effective-runtime-parity.md`, no afirmar que el flujo real Tauri trabaja igual que Fixvox.

Validacion 2026-06-25: el flujo fue probado con CUA visible y con TTS local controlado. Managed STT + postprocess y el runtime real Tauri/Rust pasaron casos redacted de fillers/correcciones, identificadores tecnicos y pregunta neutral con signos `¿...?` cuando STT reconoce la pregunta. Caveat durable: una frase TTS mexicana con forma argentina `sentis` no reconocio `como/sentis` en STT; el postprocess no debe inventar una pregunta si la transcripcion no conserva suficiente señal. Para robustecer ese caso, investigar STT language/prompt/prosody o fixtures de voz humana antes de cambiar el sanitizer.

El runtime debe tener una frontera propia:

- `PipelineService` o equivalente controla run activo, no-overlap, cancelacion, ids y emision de eventos.
- El core del pipeline no accede directo a UI, Tauri, clipboard ni foco.
- La logica de transcripcion/postprocess/materializacion para dictado normal debe ser Fixvox-equivalent y vivir en una capa de compatibilidad (`specs/013-fixvox-text-runtime-parity/`).
- Provider calls y secretos siguen host-owned en Rust/Tauri; tests default validan previews/prompts/sanitizer sin llamar proveedores.
- Cada run genera un ledger de eventos tipados/redacted; la UI, logs y summaries observan ese ledger.
- La UI dispara comandos y observa estado, pero no decide transiciones ni recovery.

## Estados

- `idle`: no hay ejecucion activa.
- `listening`: capturando audio.
- `transcribing`: STT en curso.
- `delivering`: clipboard/paste/output.
- `done`: salida entregada o disponible en el contrato tecnico.
- `error`: error con recovery claro en el contrato tecnico.
- `cancelled`: usuario o sistema cancelo.

Nombres de UI:

- `done` se muestra como completed/completado.
- `error` se muestra como failed/fallido.
- `processing` se agrega como estado tecnico separado solo cuando postprocess/materializacion deje de ser trivial.

## Decision Inicial

- La experiencia usable objetivo debe respetar la ergonomia probada de Fixvox para dock/hotkeys: una `Dictation key` visible con hold/tap, dock flotante compacto, feedback vivo de grabacion y recovery honesto. Ver `docs/topics/fixvox-dock-and-hotkeys-reference.md`.
- El proceso usable objetivo debe respetar Fixvox como implementacion canonica para texto: mismos servicios/prompts/policy/postprocess/sanitizer/fallback salvo divergencia tecnica documentada.
- MVP 1 debe correr con pipeline simulado y adapter mock.
- MVP 2 debe correr con audio sintetico y STT real sobre fixtures controlados; tambien puede usar audio local real si acelera desarrollo.
- MVP 3 agrega la frontera de microfono y stop-submit sobre captura fake/WebView testable; la grabacion real queda como check manual aprobado.
- Delivery inicial: directo best-effort con copy fallback.
- Preview y recovery UI son mejoras tempranas, no bloqueo del MVP 0-3.
- Texto seleccionado real no entra en MVP 0-3.
- Side effects desktop viven en Rust/Tauri o una frontera host explicita cuando entren: microfono, hotkeys, tray, foco, clipboard y permisos.
- Delivery debe distinguir evidencia: texto disponible, copy fallback, paste enviado, paste observado cuando exista y delivery incierto.

## Preguntas Abiertas Reducidas

- Que targets requieren paste directo y cuales solo copy/recovery?
- Cual es el umbral de confianza para entregar sin intervencion humana?
- La primera implementacion de microfono usa Rust/cpal, plugin, WebView MediaRecorder o sidecar?
