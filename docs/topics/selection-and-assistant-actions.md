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

## Update 2026-06-24

- `011` T038 agrego el comando Tauri explicito `capture_selection_context` y lo registro en `src-tauri/src/lib.rs`.
- La frontera sigue host-owned y no mutante: no clipboard, no teclas, no foco, no persistencia, no replace-selection y no `paste_observed`.
- En Windows, el comando empezo devolviendo metadata de target y `no_selection` redacted; Lote 3 reforzo esto redaktando tambien labels/clases de foreground target antes de cruzar la frontera Tauri. Lote 4 agrego lectura real best-effort via UI Automation `TextPattern.GetSelection()` sin clipboard/keyboard/focus mutation, cap a 2,000 chars y status mapping.
- T039 paso con aprobacion explicita usando un target WPF controlado con texto sintetico seleccionado e IPC de producto via Tauri WebView/CDP. Evidencia redacted: `artifacts/desktop-control/selection-capture-smoke/20260624-T039-uia-selection-smoke-retry/report.json`; solo length/hash/booleans, sin raw selected text.
- El renderer no invoca `capture_selection_context` por default; solo existen contratos/routing para cuando se apruebe la captura real.

Later:

- Quick Chat.
- Assistant Mode persistente.
- `Alt+Q` debe respetar el modelo Fixvox de picker rapido sobre contexto actual cuando se implemente.
- Hotkeys de presets.

## Preguntas Abiertas Reducidas

- Como se decide entre reemplazar seleccion, insertar abajo o copiar resultado?
- Cual es la estrategia tecnica de captura de seleccion mas confiable en Windows?
