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

## Estados

- `idle`: no hay ejecucion activa.
- `armed`: listo para escuchar o recibir fixture.
- `listening`: capturando audio.
- `transcribing`: STT en curso.
- `processing`: postprocess o transformacion.
- `delivering`: clipboard/paste/output.
- `completed`: salida entregada o disponible.
- `failed`: error con recovery claro.
- `cancelled`: usuario o sistema cancelo.

## Decision Inicial

- MVP 1 debe correr con pipeline simulado y adapter mock.
- MVP 2 debe correr con audio sintetico y STT real sobre fixtures controlados; tambien puede usar audio local real si acelera desarrollo.
- MVP 3 agrega microfono real con push-to-talk/toggle y stop-submit.
- Delivery inicial: directo best-effort con copy fallback.
- Preview y recovery UI son mejoras tempranas, no bloqueo del MVP 0-3.
- Texto seleccionado real no entra en MVP 0-3.

## Preguntas Abiertas Reducidas

- Que targets requieren paste directo y cuales solo copy/recovery?
- Cual es el umbral de confianza para entregar sin intervencion humana?
- La primera implementacion de microfono usa Rust/cpal, plugin, WebView MediaRecorder o sidecar?
