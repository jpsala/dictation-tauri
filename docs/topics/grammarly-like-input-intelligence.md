---
id: grammarly-like-input-intelligence
status: active
kind: reference
triggers:
  - Grammarly
  - input box
  - focused input
  - UI Automation
  - text field detection
  - floating widget
  - overlay
  - TextPattern
  - ValuePattern
primary_refs:
  - docs/topics/fixvox-dock-and-hotkeys-reference.md
  - specs/014-fixvox-parity-tray-settings-hotkeys/plan.md
  - src-tauri/src/desktop_delivery.rs
  - src-tauri/src/selection_capture.rs
---

# Grammarly-Like Input Intelligence

Referencia para acercar Dictation Tauri al comportamiento de asistentes tipo Grammarly: detectar el campo donde escribe el usuario, ubicar UI contextual cerca del input y confirmar inserciones sin sobreprometer.

## Hallazgos Web Publicos

- Grammarly for Windows/Mac muestra un widget flotante junto a campos de texto y subraya problemas cuando detecta escritura.
- La documentacion de compatibilidad de Grammarly pide que el contenido textual sea visible para accessibility APIs.
- En web, Grammarly resuelve `textarea`/`contenteditable` con overlays, medicion de texto, observacion de cambios y render propio de underlines; no existe una API publica de underlines nativos.
- En desktop, la estrategia publica inferible es una combinacion de accessibility tree, elemento enfocado, bounding rectangles, patrones de texto/valor, overlay transparente y deteccion/inferencia de eventos.
- Hay patente publica de Grammarly sobre deteccion inferida de eventos y procesamiento de texto usando ventanas transparentes; no copiar patentes/implementacion, solo tomar el patron general de producto.

## Implicacion Para Dictation Tauri

No necesitamos copiar Grammarly completo. Para Fixvox/dictado, el valor es:

1. Saber que app/window/control tiene el foco antes de abrir el dock.
2. Detectar si el control parece editable.
3. Obtener bounding rect para posicionar dock/companion cerca del input.
4. Insertar texto con una estrategia escalonada.
5. Observar/confirmar si el target realmente cambio.

## Estrategia Windows Recomendada

Orden de capacidades, de mas semantico a mas compatible:

1. UI Automation focused element:
   - `IUIAutomation::GetFocusedElement`.
   - Control types `Edit`, `Document`, `Text` y similares.
   - `BoundingRectangle`, process id, name, automation id, class name.
2. UIA patterns:
   - `ValuePattern` para controles simples editables.
   - `TextPattern`/`TextRange` para lectura de texto, seleccion/caret y contenido rico.
   - `TextEditPattern` cuando este disponible para escenarios de edicion/IME.
3. Win32 fallback:
   - HWND foreground/children.
   - `WM_GETTEXT` / `WM_GETTEXTLENGTH` para targets simples como Notepad.
4. Delivery fallback:
   - Clipboard roundtrip + `Ctrl+V`.
   - `SendInput` Unicode o key events solo cuando haga falta y este gated.
5. Observer:
   - Promover a `paste_observed` solo con confirmacion high-confidence.
   - Mantener `paste_sent`/`uncertain` para unsupported, mismatch o timeout.

## Limites

- Electron/Chromium/Office/Teams/Slack pueden exponer texto de formas distintas o incompletas.
- Apps elevadas pueden bloquear inspeccion/input si la app no corre elevada.
- Google Docs/contenteditable avanzado requeriria logica browser-specific; no entra en el primer alcance.
- Underlines inline estilo Grammarly son un proyecto aparte; no son necesarios para dictado MVP.

## Norte De Producto

Construir un `FocusedInputIntelligence` host-owned:

- captura metadata del input activo antes de dictar;
- calcula confianza editable;
- provee rect para posicionar companion/dock;
- alimenta delivery/observer;
- nunca guarda contenido crudo por defecto;
- registra evidencia redacted para smokes.
