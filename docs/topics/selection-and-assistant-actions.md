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

Primer slice 2026-07-03:

- `src/assistant/voice-prefix.ts` parsea `Lulu ...`/defaults Fixvox y alias `ludo`.
- `src/App.tsx` aplica `applyAssistantVoicePrefixToRuntimeResult`: si el transcript empieza con `Lulu ...`, reemplaza la ruta normal por assistant review-only y evita `paste_send`/delivery normal.
- Segundo slice 2026-07-03: `src/assistant/quick-response.ts` conecta una respuesta Quick Chat local provider-free. Por ahora responde estado real de preset activo (`Lulu, que preset esta activo?` -> `Preset activo: ...` o `No hay preset activo ahora`) y ayuda local; prompts no cubiertos quedan como quick-chat local review-only sin delivery normal.
- Tercer slice 2026-07-03: comandos locales de asistente pueden activar preset sin provider ni paste normal (`Lulu, activa el preset corregir texto`). El resultado sigue siendo review-only, pero `DesktopRuntimeResult.assistantAction` aplica `selectActivePreset()` en el dock si matchea un preset disponible.
- Cuarto slice 2026-07-03: la companion window ya puede abrir una tarjeta `Quick Chat` persistente para la ultima respuesta assistant (`DockCompanionSnapshot.assistant`), con dismiss propio y sin mezclar history/settings. Esto hace visible la conversacion asistida fuera del review inline sin introducir provider ni delivery normal.
- Quinto slice 2026-07-03: `DockCompanionSnapshot.assistant.messages` muestra una historia local corta de respuestas assistant (derivada de result history + respuesta actual), con previews truncados; sigue siendo provider-free y redacted-friendly.
- Sexto slice 2026-07-03: la tarjeta Quick Chat de companion tiene input propio (`send_assistant_message`) para follow-ups multi-turn locales. El handler crea un summary assistant review-only, reutiliza `createAssistantQuickResponse`, puede activar preset local si corresponde, y mantiene el flujo sin paste normal/provider.
- Septimo slice 2026-07-03: existe bridge managed gated para Quick Chat (`src/assistant/managed-chat.ts` -> Tauri `run_assistant_chat`). Si el follow-up no fue resuelto localmente y corre en Tauri, se llama Fixvox Cloud `/v1/chat/completions` con context `assistant.quick-chat`, previa policy/capability `assistant_action` + `managed_llm`; si falta config/policy/provider, falla cerrado con mensaje redacted en la tarjeta, sin paste normal.
- Octavo slice 2026-07-03: Lulu/Quick Chat ya tiene comandos locales no-provider para abrir Settings (`open-settings`) y mostrar historial (`show-history`) desde voz o input companion. Son acciones internas reversibles; no tocan cloud ni targets externos.
- Noveno slice 2026-07-03: el bridge managed de Quick Chat ya envia una ventana local corta de conversacion (`history` user/assistant, max 8 mensajes, texto UI redacted/truncable) al comando Tauri `run_assistant_chat`; el host la incluye como `<ASSISTANT_HISTORY>` antes del prompt actual para follow-ups multi-turn sin pegar texto normal ni mutar targets.
- Decimo slice 2026-07-03: Quick Chat reconoce comandos cloud/externos obvios y los mantiene gated: login/connect/import/sync/refresh cloud responden que requieren confirmacion explicita desde Settings; preguntas de estado de Fixvox Cloud solo abren Settings y no mutan cloud ni inician auth.
- Undecimo slice 2026-07-03: se corrigio paridad visual Lulu/Fixvox: resultados `assistant` ya no aparecen como `Transcript ready`; el dock muestra `Lulu ready` y la companion abre Quick Chat sin recovery/copy transcript. Tambien se agrego heuristica local tipo Smart Agent para follow-ups de presets como `activa el que arregla el texto` -> `corregir-texto` y `... en ingles` -> `fix-writing`, sin provider. Las respuestas locales insertables tipo `cuanto es dos mas dos` devuelven `4` y usan `paste_send` Fixvox-like en vez de abrir Quick Chat. Preguntas Lulu que no matchean comando local intentan `run_assistant_chat` managed y muestran la respuesta real en Quick Chat en vez del eco `Quick Chat local recibio...`.
- Duodecimo slice 2026-07-03: delivery desktop vuelve a paridad Fixvox: en vez de `KEYEVENTF_UNICODE` primero, enfoca el target guardado, toma snapshot de clipboard reconstruible (texto + DIB/DIBV5), escribe texto, manda `Ctrl+V`, espera y restaura/limpia clipboard. Metadata bitmap conocida (`DataObject`, `System.Drawing.Bitmap`, `Ole Private Data`) se acepta solo junto a DIB/DIBV5 reconstruible; desde el hardening de dogfood, formatos adicionales clonables como bytes `HGLOBAL` también se preservan y solo los no clonables fallan cerrado antes de sobrescribir. Esto evita que el flujo normal dependa de input unicode directo y preserva clipboards de texto/imagen/custom soportados. El boton `Copy transcript` en Tauri tambien usa ahora comando nativo `copy_text_to_clipboard`, no `navigator.clipboard.writeText`, para evitar `Document is not focused` desde companion.
- Falta portar un Smart Agent mas completo con tool loop/opcion picker para ambiguedades y acciones mutantes con aprobacion explicita, y mejorar chat real streaming cuando policy lo habilite.
- Tests focales: `tests/voice-dock/assistant-voice-prefix.test.ts`, `tests/voice-dock/assistant-managed-chat.test.ts`, `tests/voice-dock/companion-state.test.ts`, `tests/voice-dock/companion-view.test.tsx` y `tests/desktop-control/app-delivery.test.ts`.

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
- Smoke 2026-07-01: `scripts/selection-capture-smoke.ps1 -AllowSelectedTextCapture` paso con fixture sintetico `hola amigo`; evidencia redacted en `artifacts/desktop-control/selection-capture-smoke/20260701-selection-go/report.json`, sin raw selected text y usando UI Automation (`TextPattern`) sin clipboard fallback.
- Smoke extendido 2026-07-01: `scripts/selection-capture-smoke.ps1 -AllowSelectedTextCapture -VerifyReplaceSelection` paso captura + delivery replace-selection controlado (`hola amigo` -> `hello friend`) via direct text input, sin clipboard fallback y sin raw text en reporte; evidencia en `artifacts/desktop-control/selection-capture-smoke/20260701-selection-replace-go2/report.json`.
- Smoke managed 2026-07-01: `scripts/selection-capture-smoke.ps1 -AllowSelectedTextCapture -VerifyReplaceSelection -VerifyManagedTransform` paso captura real sintética + `transform_selected_text` contra Fixvox Cloud + replace-selection; output y texto final solo se guardaron como length/hash, evidencia en `artifacts/desktop-control/selection-capture-smoke/20260701-selection-managed-go/report.json`.
- Smoke STT+managed 2026-07-01: con aprobacion de provider, `scripts/selection-capture-smoke.ps1 -AllowSelectedTextCapture -AllowProviderCall -VerifyReplaceSelection -VerifySttManagedTransform` genero audio TTS sintetico de la instruccion, paso por STT managed (`whisper-large-v3-turbo`), uso ese transcript como instruccion para `transform_selected_text`, y reemplazo la seleccion; transcript/output/final quedaron solo como length/hash, evidencia en `artifacts/desktop-control/selection-capture-smoke/20260701-selection-stt-go/report.json`.
- Smoke UX hotkey 2026-07-01: `scripts/selection-capture-smoke.ps1 -AllowSelectedTextCapture -AllowProviderCall -VerifyHotkeySttSelectionTransform` paso el gesto real con target seleccionado + `Ctrl+Shift+F9` start/stop + voz TTS capturada por el runtime + STT managed + transform + replace-selection; logs muestran `scope=saved_target`, `selection-transform ok` y vuelta del dock a Idle, evidencia en `artifacts/desktop-control/selection-capture-smoke/20260701-selection-hotkey-e2e/report.json`.
- Smoke UX Alt+Space 2026-07-01: primer intento abrio el menu de Windows porque el harness seteo `DICTATION_TAURI_DICTATION_KEY=Alt+Space` sin `DICTATION_TAURI_ALLOW_ALT_SPACE=true` y el host cayo a `Ctrl+Shift+F9` (`alt_space_requires_explicit_gate`). Corregido el harness, `-DictationKey AltSpace` paso con backend `WindowsLowLevelHook`, sin abrir menu, y completo STT+transform+replace; evidencia en `artifacts/desktop-control/selection-capture-smoke/20260701-selection-altspace-e2e-gated/report.json`.
- Smoke fail-closed 2026-07-01: `scripts/selection-capture-smoke.ps1 -AllowSelectedTextCapture -AllowProviderCall -VerifyHotkeyFailClosed` fuerza `FIXVOX_BACKEND_URL=http://127.0.0.1:9`; el flujo llega a `scope=saved_target` y falla en managed runtime, el dock queda Failed/companion visible y el target conserva el texto original sin pegar instruccion ni output parcial; evidencia en `artifacts/desktop-control/selection-capture-smoke/20260701-selection-failclosed-e2e/report.json`.
- Smoke Chrome textarea 2026-07-01: `scripts/selection-browser-smoke.ps1 -AllowDesktopSideEffects -AllowProviderCall -DictationKey AltSpace` paso en Google Chrome real con textarea enfocada/seleccionada, `Alt+Space` nativo, voz TTS -> STT managed -> transform -> replace-selection; logs muestran target `Chrome_WidgetWin_1`, `scope=saved_target` y `selection-transform ok`; evidencia redacted en `artifacts/desktop-control/selection-browser-smoke/20260701-browser-chrome-textarea-altspace/report.json`.
- Presets reales 2026-07-01: el set inicial es `translate`, `rewrite`, `shorten`, `professional`; companion/tray muestran esos presets y el runtime managed convierte el preset activo en una instruccion concreta antes de llamar `transform_selected_text`. Smoke Chrome con `PresetId translate` paso y el log mostro `preset=translate` + instruccion expandida; evidencia en `artifacts/desktop-control/selection-browser-smoke/20260701-browser-chrome-preset-translate-r4/report.json`.
- Alt+Q picker primer slice 2026-07-01: el host registra `Alt+Q` como shortcut reservado separado de la dictation key, emite `show_preset_picker` y abre la companion como `Action picker` con los presets reales. Tras estudiar Fixvox, el picker ejecuta preset inmediato: precaptura target/seleccion, transform managed + `paste_send` si hay seleccion, y voice-capture preset si no hay seleccion. Smoke real redacted inicial: `artifacts/desktop-control/dock-companion-smoke/20260701-altq-picker-smoke/report.json`; smoke post-ajuste Fixvox-like: `artifacts/desktop-control/dock-companion-smoke/20260701-altq-fixvox-presets-smoke/report.json`.
- Alt+Q picker dedicado 2026-07-01: se corrigio la interpretacion de JP/Fixvox reemplazando el companion mini por ventana Tauri `preset-picker` dedicada con search, flechas, Enter y Esc. Se corrigieron doble emit de Alt+Q, bridge picker -> dock runtime, cierre/ocultamiento antes de ejecutar, y fail-fast del smoke para distinguir `picker opened`, `picker executed`, `command reached dock runtime` y `run_text_path`. Smoke Chrome real redacted con `translate` paso: `scripts/selection-browser-smoke.ps1 -AllowDesktopSideEffects -AllowProviderCall -UseAltQPicker -PresetId translate -RunId 20260701-altq-picker-chrome-a11y-r1`; evidencia en `artifacts/desktop-control/selection-browser-smoke/20260701-altq-picker-chrome-a11y-r1/report.json`. El harness lanza Chrome con `--force-renderer-accessibility` para exponer UIA TextPattern; el log confirmo `selection_id=host-selection-uia`, sin fallback clipboard.
- Windows Terminal/Tabby 2026-07-01/02: se revirtio el bloqueo que impedia usar terminales como target explicito actual. La regla durable ahora es: terminal-like foreground incidental no debe contaminar cache de otros targets, pero si el usuario arranca dictado con Windows Terminal/Tabby enfocado, ese terminal es target valido. Delivery a terminal usa clipboard paste directo porque Windows Terminal no expone textarea/UIA editable confiable y `KEYEVENTF_UNICODE` no entrega texto de forma consistente. Tests actualizados: `tests/desktop-control/tauri-desktop-delivery.test.ts` y `tests/desktop-control/desktop-delivery-rust.test.ts`; checks pasados con esos tests y `cargo check`. Smoke manual controlado 2026-07-02 paso con una ventana aislada de Windows Terminal: `capture_desktop_delivery_target` devolvio `WindowsTerminal.exe`/`CASCADIA_HOSTING_WINDOW_CLASS` con `inputLike=true`, `deliver_text_to_desktop_target` retorno `paste_sent` via clipboard fallback sin Enter, y se limpio/cerró la terminal aislada; evidencia redacted en `artifacts/desktop-control/terminal-target-smoke/20260702-windows-terminal-explicit-target/report.json`.
- Target/cache + Alt+Space regression 2026-07-03: QA Notepad encontro dos regresiones. (1) Delivery normal podia quedarse con foreground terminal-like incidental aunque el watcher hubiese cacheado Notepad despues; hotfix: el target cacheado ahora lleva `cacheReason`, y JS prefiere cache no-terminal `foreground_watcher` sobre current terminal-like solo en delivery normal, sin romper terminal explicito. (2) Notepad mostraba keytips/menu (`File/Edit/View`) tras `Alt+Space`; hotfix en hook nativo: `Alt+Space` consume Space-up y el Alt-up posterior con `SUPPRESS_NEXT_ALT_UP_ONLY` + `release_modifiers()`, igual que el patron Fixvox usado para evitar keytips.

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
- La UI activa es una ventana Tauri dedicada `preset-picker` de `380×320`, con una sola lista, search, flechas, Enter/Esc y teclas directas; los starters bundled son `como-yo-es`, `corregir-texto`, `fix-writing`, `like-me-en`.
- Con seleccion capturada, el preset corre inmediatamente como accion one-off con `transform_selected_text` y delivery `paste_send` al target guardado; al terminar no deja ningun preset activo, aunque antes hubiera uno persistente.
- Sin seleccion, elegir preset lo activa para todos los dictados siguientes sin iniciar captura. El estado usa el snapshot local existente, sobrevive reload/restart, puede reemplazarse con otro preset y se desactiva desde el badge `×` del dock. La WebView main hidrata el preset store host-owned al iniciar y antes de ejecutar/transcribir, para que customizaciones y presets custom no queden stale respecto de Settings/picker.
- El picker se oculta cuando el HWND foreground deja de ser el picker, después de haber sido foreground al menos una vez; esto evita los falsos blur internos de WebView2 y sincroniza el cierre con la ventana main.
- Quick Chat queda separado y ya no aparece como nota dentro del picker.
- Retry real 2026-07-13 confirmó delivery con clipboard bitmap WinForms tras aceptar `DataObject`/`System.Drawing.Bitmap`/`Ole Private Data` solo junto a DIB/DIBV5; `artifacts/live-app/20260713-160652/tauri-dev.log` volvió a Idle sin error. El dogfood posterior mostró una regresión recurrente con formatos custom; se corrigió preservando los clonables como bytes `HGLOBAL`, mientras los no clonables siguen fail-closed con diagnóstico redacted de id/nombre/cloneable.
- El badge de preset se bajó 10 px (`top: 3px`) para evitar clipping en el borde superior del dock.

Diferencias conscientes del primer slice:

- Settings / Presets ya cubre CRUD local host-owned: add/delete de custom presets, duplicate, reset de starters, edición de name, picker key, hotkey label, provider, model, confirm, enabled y body. En Tauri persiste en app data como `selection-presets.v1.json`; browser/dev conserva fallback renderer. Alt+Q recarga la store al abrir. Todavia falta sync Cloud/admin y Which-key multi-chord completo.
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
