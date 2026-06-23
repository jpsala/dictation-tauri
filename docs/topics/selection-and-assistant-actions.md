---
id: selection-and-assistant-actions
status: draft
kind: explanation
triggers:
  - texto seleccionado
  - seleccion
  - assistant mode
  - asistente
  - quick chat
  - alt-q
  - presets
  - hotkeys
primary_refs:
  - docs/topics/dictation-workflow.md
  - docs/topics/automation-and-reference-fixtures.md
  - docs/topics/fixvox-dock-and-hotkeys-reference.md
  - docs/tracks/mvp-and-reference-resources.md
---

# Seleccion Y Acciones Asistidas

## Modelo Observado En Fixvox

Fixvox separa dos familias principales:

- Sin texto seleccionado: dictado normal, transcripcion y postprocess opcional.
- Con texto seleccionado: la transcripcion funciona como instruccion sobre ese texto, usando selection transform, Assistant Mode, presets o Quick Chat.

Ademas tiene acciones no-voz:

- hotkeys directos para presets;
- picker por `Alt+Q`;
- Quick Chat con texto seleccionado como mensaje/contexto inicial;
- historial y paste-last.

## Direccion Para Dictation Tauri

No copiar todo al inicio. Mantener tres rutas conceptuales:

1. Dictado directo: voz a texto, sin seleccion.
2. Transformacion de seleccion: instruccion por voz o hotkey sobre texto seleccionado.
3. Conversacion asistida: Quick Chat o asistente cuando se quiere razonar, no solo reemplazar texto.

## Fixtures Antes De Seleccion Real

Para el primer producto sin interaccion humana temprana:

- Simular `selectedText` en tests.
- Probar transformaciones con fixtures de texto.
- Probar delivery como `insert` y `replaceSelection` con texto sintetico.
- Dejar Assistant/Quick Chat como topic de diseño, no como primer requisito de app base.

## Decision Cerrada

Texto seleccionado real no entra en MVP 0-3.

Alcance permitido antes de eso:

- Contratos con `selectedText` opcional.
- Fixtures que simulan seleccion.
- Benchmarks de transformacion sobre texto no sensible.
- Delivery simulado de `replaceSelection` para validar reglas sin capturar seleccion real del sistema.

Early post-MVP:

- Captura real de seleccion.
- Selection transform con preset simple.
- Replace-selection real con copy fallback.
- Paste last result puede empezar en memoria de proceso; persistencia local experimental queda permitida en modo personal/dev si acelera el flujo.

Later:

- Quick Chat.
- Assistant Mode persistente.
- `Alt+Q` debe respetar el modelo Fixvox de picker rapido sobre contexto actual cuando se implemente.
- Hotkeys de presets.

## Preguntas Abiertas Reducidas

- Como se decide entre reemplazar seleccion, insertar abajo o copiar resultado?
- Cual es la estrategia tecnica de captura de seleccion mas confiable en Windows?
