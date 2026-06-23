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

El runtime debe tener una frontera propia:

- `PipelineService` o equivalente controla run activo, no-overlap, cancelacion, ids y emision de eventos.
- El core del pipeline no accede directo a UI, Tauri, clipboard, microfono ni provider real.
- Transcripcion, postprocess/materializacion y delivery entran por puertos/adapters.
- Cada run genera un ledger de eventos tipados; la UI, logs y summaries observan ese ledger.
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
