---
id: selection-and-assistant-actions
status: active
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
  - docs/topics/fixvox-assistant-lulu-reference.md
  - docs/tracks/mvp-and-reference-resources.md
---

# Seleccion Y Acciones Asistidas

## Modelo Observado En Fixvox

Para `Lulu ...` y comportamiento de asistente, abrir primero la referencia puntual: `docs/topics/fixvox-assistant-lulu-reference.md`. Esa referencia es la fuente operativa para no confundir assistant, Quick Chat, notify, paste, showMarkdown y recovery.

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

## Decision JP 2026-07-03: `Lulu ...` Si, Always-on Wake Word No

JP no quiere implementar escucha permanente tipo wake word real always-on. Queda explicitamente fuera de alcance: nada de mantener microfono escuchando en background esperando "Lulu".

Lo que si interesa portar de Fixvox es el **prefijo dentro de una captura iniciada por el usuario**:

- El usuario inicia dictado con hotkey/dock.
- Si el transcript empieza con `Lulu ...` (tambien defaults Fixvox: `assistant`, `asistente`, `ai`, `zuno`, y alias ASR `ludo`), no se trata como dictado normal.
- Todo lo posterior al prefijo se routea a una ruta especial de asistente/conversacion/agente.
- Ejemplos Fixvox: `Lulu, que preset esta activo?`, `Lulu, activate the preset that fixes writing`, `Lulu, volve a dictado normal`.
- Debe quedar claro en UI/dock si la captura fue consumida por asistente y no se pego texto normal.

Implementacion recomendada para Dictation Tauri: spec/slice separado (post audio-runtime), provider-free primero, copiando el modelo de `parseAssistantVoicePrompt`/`resolveAssistantWakeWords` de Fixvox; no mezclar con audio VAD ni con always-on listening.

Estado implementado:

- `voice-prefix.ts` detecta Lulu/defaults Fixvox y evita delivery normal; acciones locales provider-free cubren ayuda, presets, Settings e historial.
- Quick Chat mantiene historia local corta y usa bridge managed sólo con capabilities/policy; cloud y acciones externas siguen gated y fallan cerrado.
- Dock/companion distinguen `Lulu ready`; respuestas insertables usan delivery normal y conversación no insertable queda en Quick Chat.
- Delivery enfoca target guardado, usa clipboard reconstruible y restaura texto, DIB/DIBV5 y formatos `HGLOBAL` clonables; formatos no clonables fallan cerrado.
- Smart Agent rico/tool loop y streaming mejorado siguen fuera del slice actual. Evidencia y evolución: tracks Lulu completas y tests `assistant-*`, `companion-*` y `app-delivery`.

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
- Selection transform con preset simple o instruccion dictada.
- Replace-selection real con fallback seguro.
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

## Update 2026-06-30: Selection Transform Fixvox-like

JP valido que la ruta correcta para seleccion real debe comportarse como Fixvox cuando `reviewBeforeDelivery=false`: si hay texto seleccionado y se dicta una instruccion, la app transforma ese texto y reemplaza la seleccion directamente, sin abrir ventana de review cuando el transform sale OK.

Estado implementado en Dictation Tauri:

- El renderer guarda el target editable antes de grabar y captura seleccion contra ese target al detener la grabacion.
- Windows intenta UI Automation `TextPattern.GetSelection()` y cae a clipboard roundtrip temporal con restauracion best-effort si UIA no expone seleccion; esto es side effect real y debe mantenerse vigilado.
- La instruccion dictada pasa por STT managed normal y luego se envia junto con `selectedText` a `transform_selected_text`/Fixvox Cloud chat (`/v1/chat/completions`).
- Si el transform managed devuelve OK, el resultado usa `deliveryStrategy: paste_send` y reemplaza la seleccion en el target guardado; no se abre companion/review window.
- Si el transform falla, falla cerrado: no debe pegar ni la instruccion dictada ni el texto original seleccionado como fallback.
- Evidencia/estado sigue honesta: `paste_sent` no equivale a `paste_observed` salvo observer verificado.
- La matriz de smokes redacted cubrió captura UIA, replace-selection, managed transform, STT, hotkeys, Alt+Space, Chrome, presets, picker y fail-closed. Evidencia histórica: `artifacts/desktop-control/selection-*` y specs 011/017.
- Terminal enfocado explícitamente sigue siendo target válido y usa clipboard paste; foreground terminal incidental no desplaza un target no-terminal cacheado.
- El hook Alt+Space consume Space-up/Alt-up para evitar menú/keytips sin romper terminal explícito.

Archivos relevantes:

- `src/App.tsx`
- `src/assistant/voice-prefix.ts`
- `src/assistant/quick-response.ts`
- `src/assistant/managed-chat.ts`
- `src/voice-dock/companion-state.ts`
- `src/selection-transform/managed-transform.ts`
- `src-tauri/src/selection_capture.rs`
- `src-tauri/src/runtime_transcription.rs`
- `src-tauri/src/desktop_delivery.rs`
- Tests: `tests/desktop-control/app-delivery.test.ts`, `tests/voice-dock/assistant-*.test.ts`, `tests/voice-dock/companion-*.test.ts`, `tests/selection-transform/*`

Checks utiles:

```powershell
npm run test:pipeline -- tests/desktop-control/app-delivery.test.ts tests/voice-dock/assistant-managed-chat.test.ts tests/voice-dock/assistant-voice-prefix.test.ts tests/voice-dock/companion-state.test.ts tests/voice-dock/companion-view.test.tsx tests/selection-transform
npm run build
cd src-tauri && cargo check --quiet
npm run tauri:dev:hidden -- -StopExisting
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/selection-capture-smoke.ps1 -AllowSelectedTextCapture -VerifyReplaceSelection
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/selection-capture-smoke.ps1 -AllowSelectedTextCapture -AllowProviderCall -VerifyReplaceSelection -VerifyManagedTransform
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/selection-capture-smoke.ps1 -AllowSelectedTextCapture -AllowProviderCall -VerifyReplaceSelection -VerifySttManagedTransform
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/selection-capture-smoke.ps1 -AllowSelectedTextCapture -AllowProviderCall -VerifyHotkeySttSelectionTransform
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/selection-capture-smoke.ps1 -AllowSelectedTextCapture -AllowProviderCall -VerifyHotkeySttSelectionTransform -DictationKey AltSpace
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/selection-capture-smoke.ps1 -AllowSelectedTextCapture -AllowProviderCall -VerifyHotkeyFailClosed
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/selection-browser-smoke.ps1 -AllowDesktopSideEffects -AllowProviderCall -DictationKey AltSpace
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/selection-browser-smoke.ps1 -AllowDesktopSideEffects -AllowProviderCall -DictationKey AltSpace -PresetId corregir-texto
```

Riesgos abiertos:

- Clipboard roundtrip de selection capture puede disparar UI externa o interferir con contenido no-texto; si reaparece una ventana `pi-clipboard-*.png`, distinguir delivery vs selection capture. Delivery desktop preserva texto + DIB/DIBV5 estilo Fixvox y formatos adicionales clonables como bytes `HGLOBAL`; acepta metadata bitmap conocida solo con DIB y falla cerrado ante formatos no clonables. Selection capture fallback sigue gated por `DICTATION_TAURI_ALLOW_SELECTION_CLIPBOARD_FALLBACK`.
- La captura real de seleccion y replace-selection son side effects aprobados para este flujo, pero no deben generalizarse a nuevas rutas sin test/smoke y decision clara.
- Si el transform falla, el comportamiento correcto es error/recovery, no paste de transcript ni fallback al original.

## Update 2026-07-01: Alt+Q Picker Fixvox-like

JP corrigio la interpretacion de Alt+Q: en Fixvox no es solo un selector de preset persistente. La ruta activa es un picker de ejecucion:

- `Alt+Q` captura primero el target y el texto seleccionado antes de mostrar UI, para no perder foco ni seleccion.
- Luego muestra una ventana picker/search (`src/app/views/picker/App.svelte`) con presets desde `listPresets()`.
- El usuario puede buscar, navegar con flechas, Enter/click, o usar hotkeys/chords tipo which-key cuando el preset define `@hotkey`.
- Al ejecutar un preset, Fixvox oculta el picker, restaura foco al target original y llama `runPreset(preset, "picker", preCapturedText)`.
- `runPreset` decide ruta:
  - con seleccion: `selectedText -> buildPresetStructuredInput -> LLM -> insertTextIntoTarget`, reemplazando seleccion;
  - sin seleccion: abre voice dock/recording, transcript -> preset LLM -> paste en cursor.
- Los presets son markdown (`@name`, `@hotkey`, `@provider`, body) seedados a SQLite; `recipe-runtime.ts` envuelve el body con un contrato estructurado (`[CONTROL]`, `[SOURCE_TEXT]`, `output_mode=solo_texto`) y el preset body como system prompt.
- Chords/which-key viven en `assistant-input.ts` + `chord-hint`: prefix -> suffix -> action, con precaptura antes de invocar el callback.

Adaptacion aplicada en Dictation Tauri:

- `Alt+Q` queda como shortcut host-owned separado de la dictation key y emite `show_preset_picker`.
- Al abrir el picker, el renderer guarda target y captura seleccion contra ese target antes de enfocar la UI, para preservar foco/seleccion del target original.
- La UI activa es una ventana Tauri dedicada `preset-picker` de `380×320`, con una sola lista, search, flechas, Enter/Esc y teclas directas; la primera instalación copia como ejemplos `como-yo-es`, `corregir-texto`, `fix-writing` y `like-me-en`.
- Con seleccion capturada, el preset corre inmediatamente como accion one-off con `transform_selected_text` y delivery `paste_send` al target guardado; al terminar no deja ningun preset activo, aunque antes hubiera uno persistente.
- Sin seleccion, elegir preset lo activa para todos los dictados siguientes sin iniciar captura. El estado usa el snapshot local existente, sobrevive reload/restart, puede reemplazarse con otro preset y se desactiva desde el badge `×` del dock. La WebView main hidrata el preset store host-owned al iniciar y antes de ejecutar/transcribir, para que los cambios no queden stale respecto de Settings/picker.
- El picker se oculta cuando el HWND foreground deja de ser el picker, después de haber sido foreground al menos una vez; esto evita los falsos blur internos de WebView2 y sincroniza el cierre con la ventana main.
- Quick Chat queda separado y ya no aparece como nota dentro del picker.
- Retry real 2026-07-13 confirmó delivery con clipboard bitmap WinForms tras aceptar `DataObject`/`System.Drawing.Bitmap`/`Ole Private Data` solo junto a DIB/DIBV5; `artifacts/live-app/20260713-160652/tauri-dev.log` volvió a Idle sin error. El dogfood posterior mostró una regresión recurrente con formatos custom; se corrigió preservando los clonables como bytes `HGLOBAL`, mientras los no clonables siguen fail-closed con diagnóstico redacted de id/nombre/cloneable.
- El badge de preset se bajó 10 px (`top: 3px`) para evitar clipping en el borde superior del dock.

Diferencias conscientes del primer slice:

- Settings / Presets usa una sola arquitectura para todos los presets: los ejemplos iniciales se copian una vez al instalar y desde entonces cualquiera se puede editar, desactivar, duplicar o eliminar. No existen categorías `starter`/`custom` ni reseeding después de borrar. En Tauri persiste el store v2 en app data como `selection-presets.v2.json`, migra el v1 anterior y browser/dev conserva fallback renderer. Alt+Q recarga la store al abrir. Todavia falta sync Cloud/admin y Which-key multi-chord completo.
- Which-key multi-chord completo queda para un slice posterior; este slice soporta search, navegacion y ejecucion directa del picker.

Checks focales utiles:

```powershell
npm run test:pipeline -- tests/desktop-control/app-delivery.test.ts tests/voice-dock/dock-visual-semantics.test.ts
npm run build
```

Archivos relevantes:

- `src/App.tsx` (`openPresetPicker`, `runPickerPreset`, `readStoredActivePreset`, `storeActivePreset`).
- `src-tauri/src/companion_window.rs` (`watch_preset_picker_focus`).
- `src/voice-dock/VoiceDock.tsx` y `visual-semantics.ts` (badge persistente y clear accesible durante todos los estados).

## Preguntas Abiertas Reducidas

- Como se expone en Settings/Policy si `reviewBeforeDelivery` debe poder volver a modo review antes de replace?
- Cual es la estrategia tecnica mas robusta para capturar seleccion en browsers/Electron sin side effects visibles del clipboard?
