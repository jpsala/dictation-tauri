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

## Estudio De Insercion Rapida Sin Clipboard — 2026-07-29

La ruta actual de `src-tauri/src/desktop_delivery.rs` usa
`SendInput(KEYEVENTF_UNICODE)` como fallback universal. Aunque Rust agrupa hasta
512 unidades UTF-16 por llamada, Windows y el target procesan dos eventos por
unidad (down/up). Ademas, la ruta agrega 180 ms de esperas fijas sin Enter y
lee superficies Win32 antes/despues para intentar observar el resultado.

### APIs Evaluadas

- `GetGUIThreadInfo`: obtiene el `hwndFocus` real del thread foreground sin
  confundirlo con el frame principal. Es metadata de routing, no inserta texto.
- `EM_REPLACESEL`: mensaje soportado por controles Win32 `Edit`/`RichEdit`;
  reemplaza la seleccion o inserta en el caret. `wParam=TRUE` crea una operacion
  deshacible. Debe enviarse con `SendMessageTimeoutW`, nunca con espera
  ilimitada.
- `SendInput + KEYEVENTF_UNICODE`: compatible con mas frameworks porque simula
  input real, pero escala por cantidad de caracteres y conserva limites de
  foco, UIPI y procesamiento del target.
- UIA `ValuePattern.SetValue`: cambia el valor completo; no equivale a insertar
  en caret y no es un fast path seguro para dictado.
- UIA `TextPattern`: lectura/seleccion; Microsoft lo documenta como incapaz de
  insertar o modificar texto.
- TSF: arquitectura nativa para dictado/context-aware input, pero requiere un
  text service/TIP COM registrado; no es una llamada incremental desde el
  ejecutable Tauri.

### Prototipo Controlado

Se probo desde un proceso controlador de 64 bits contra fixtures WinForms
separados de 64 y 32 bits. El texto fue sintetico; no se leyo contenido real del
clipboard ni se cambio product code. `GetGUIThreadInfo` encontro el control
exacto en todos los casos y la secuencia del clipboard permanecio igual.

Resultados representativos de 64 bits, tiempo de llamada API:

| Control | UTF-16 | `SendInput` actual, chunks 512 | `EM_REPLACESEL` |
| --- | ---: | ---: | ---: |
| TextBox/Edit | 40 | 244 ms | 2.3 ms |
| TextBox/Edit | 655 | 3,863 ms | 3.5 ms |
| TextBox/Edit | 2,623 | 16,080 ms | 8.3 ms |
| RichTextBox/RichEdit | 40 | 140 ms | 1.3 ms |
| RichTextBox/RichEdit | 655 | 2,041 ms | 2.2 ms |
| RichTextBox/RichEdit | 2,623 | 8,251 ms | 8.4 ms |

El chunking de 512 unidades no produjo una mejora material frente a una sola
llamada. `EM_REPLACESEL` tambien paso insercion Unicode single-line con acentos,
em dash y emoji, reemplazo de seleccion, una sola operacion Undo y cruce
64-bit → 32-bit. En estos fixtures, `SendInput` no preservo exactamente CRLF,
mientras `EM_REPLACESEL` si.

La segunda ronda uso fixtures aisladas, repetida despues de descartar corridas
con interferencia humana:

- WPF: `GetGUIThreadInfo` devolvio el frame `HwndWrapper`; UIA identifico
  `ControlType.Edit`/`FrameworkId=WPF`, pero el elemento no tenia HWND nativo.
  `EM_REPLACESEL` fue procesado por la ventana sin insertar nada. `SendInput`
  inserto exactamente el texto sintetico en 7.2 ms.
- Chromium con profile temporal: el foco Win32 termino en
  `Chrome_RenderWidgetHostHWND`; UIA solo expuso un `Pane` sin `ValuePattern` ni
  `TextPattern` util para el textarea. `EM_REPLACESEL` fue procesado pero no
  cambio el DOM. `SendInput` inserto exactamente el texto single-line en
  21.9 ms. CRLF enviado como `KEYEVENTF_UNICODE` no fue exacto: los dos code
  units de salto no llegaron al textarea.
- En ambas fixtures, el clipboard permanecio sin cambios. Se cerraron solo los
  procesos aislados atribuibles, se borro el profile temporal y se restauro el
  cursor.

Esto confirma dos guardrails: una llamada Win32 exitosa no equivale a insercion
semantica, y las clases WPF/Chromium deben seguir fuera de la allowlist. Tambien
abre un problema separado para saltos de linea en el fallback: convertirlos a
`VK_RETURN` puede enviar formularios en inputs single-line, asi que no debe
hacerse sin inteligencia confiable de multilinea.

Evidencia local ignorada:
`artifacts/desktop-control/input-api-study/`.

### Conclusion Y Guardrails

El fast path es valido y ya existe en implementaciones reales de input Windows,
pero no es universal. Debe activarse solo cuando el `hwndFocus` tenga una clase
nativa conocida (`Edit`, `RichEdit`, variantes WinForms verificadas), este
habilitado y no sea read-only/password. Un retorno exitoso de
`SendMessageTimeoutW` solo confirma que una ventana proceso el mensaje; sobre
una clase arbitraria no prueba que haya insertado. Por eso el routing necesita
allowlist y evidencia del control, no heuristica por nombre de proceso.

Si el mensaje hace timeout, el resultado es incierto y no se debe caer
ciegamente a `SendInput`, porque podria duplicar texto si el target procesa el
mensaje tarde. Targets Chromium/Electron, WPF/WinUI sin HWND editable,
terminales, Office y desconocidos conservan `SendInput` hasta tener un adapter
probado. Ambas rutas siguen sujetas a UIPI para targets elevados.

### Implementacion Local — 2026-07-29

El fast path quedo implementado y habilitado por defecto exclusivamente para la
allowlist verificada:

- el target guarda `focusHwnd`, `focusClass`, `focusProcessId` y
  `nativeEditFastPath` capturados con `GetGUIThreadInfo`;
- delivery vuelve a validar frame, control enfocado, PID, clase, enabled y
  estilos read-only/password antes de usar `EM_REPLACESEL`;
- `Edit`, `RichEdit*` y las variantes WinForms verificadas usan
  `SendMessageTimeoutW` con 500 ms y Undo habilitado;
- timeout/fallo del mensaje queda `uncertain` y no hace fallback para evitar
  duplicados;
- WPF, Chromium/Electron, terminales y clases desconocidas conservan
  `SendInput(KEYEVENTF_UNICODE)` sin clipboard;
- el observer inline ya no recorre todo el arbol con `SendMessageW`: se limita
  al HWND nativo cuando el fast path aplica y usa mensajes con timeout;
- esperas fijas pre/post de 80 ms se retiraron de la ruta directa; el log
  redacted informa metodo, unidades UTF-16 y tiempos prepare/input/total;
- no se cambio aun la semantica de CRLF en el fallback.

### Modos De Entrega Seleccionables — 2026-08-07

Settings permite elegir `Entrada directa` o `Pegado rápido`. La primera sigue
siendo el default y conserva `EM_REPLACESEL`/`SendInput` sin clipboard. La
segunda reutiliza el roundtrip snapshot, `Ctrl+V` y restauración para insertar
el texto de una sola vez.

El write transitorio publica `CF_UNICODETEXT` junto con el formato registrado
`Fixvox.TransientPaste.v1` y payload `dictation-tauri/v1`, usando el HWND del
dock como clipboard owner. Copicu sólo omite la captura cuando coinciden nombre,
payload y proceso owner `dictation-tauri.exe`; `Copy transcript` continúa sin
marca porque es una copia explícita. La preferencia host-owned persiste como
`deliveryMode: direct | clipboardPaste`.

Validación provider-free: contratos Settings/delivery 22/22, renderer build,
`cargo check`, arranque Tauri real oculto y harness Rust completo de Copicu
181/181. El smoke no dictó, no pegó y no modificó el clipboard.

Checks locales: 22 archivos/140 tests TypeScript, 21 tests Rust focales,
`cargo fmt --check`, `cargo check` y LSP verdes. Persisten solo warnings
`dead_code` preexistentes. Prueba manual real aprobada en Notepad moderno:
426 unidades UTF-16 por `native_edit_message`, input 8 ms, total 9 ms y
`observed=true`. Windows Terminal permanecio en `unicode_send_input` como se
esperaba (118 unidades, 340 ms), confirmando seleccion correcta de estrategia.

Fuentes primarias:

- Microsoft `EM_REPLACESEL`:
  <https://learn.microsoft.com/windows/win32/controls/em-replacesel>
- Microsoft `GetGUIThreadInfo`:
  <https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-getguithreadinfo>
- Microsoft `SendInput`:
  <https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-sendinput>
- Microsoft UIA Text/TextRange:
  <https://learn.microsoft.com/windows/win32/winauto/uiauto-about-text-and-textrange-patterns>
- Microsoft TSF:
  <https://learn.microsoft.com/windows/win32/tsf/text-services-framework>

Referencia de implementacion publica: NexusKey usa
`SendMessageTimeoutW(EM_REPLACESEL)` sobre Edit/RichEdit y mantiene `SendInput`
como fallback para otros targets; no se toma esa implementacion como autoridad,
solo como corroboracion del patron probado localmente.

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
