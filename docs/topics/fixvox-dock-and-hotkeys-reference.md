---
id: fixvox-dock-and-hotkeys-reference
status: active
kind: reference
triggers:
  - Fixvox dock
  - dock
  - voice dock
  - hotkeys Fixvox
  - Alt+Space
  - push to talk
  - dictation key
  - paste last
  - Alt+Q
primary_refs:
  - C:/dev/fixvox/src/app/views/voice-dock/
  - C:/dev/fixvox/src/app/backend/voice-dock-window.ts
  - C:/dev/fixvox/src/app/backend/hotkeys.ts
  - C:/dev/fixvox/docs/navigation/features/hotkeys.md
  - C:/dev/fixvox/docs/navigation/topics/hotkeys/topic.md
  - PRODUCT.md
  - DESIGN.md
---

# Fixvox Dock Y Hotkeys Reference

Referencia durable para preservar lo que JP considera especialmente usable de Fixvox: dock flotante, feedback de dictado, recovery y semantica de hotkeys.

No significa copiar Electrobun/Bun ni portar archivos literal. Significa adaptar la experiencia a Tauri/Rust respetando comportamiento, ergonomia y criterio visual.

## Decision

Para cualquier trabajo durable de dock, estado de dictado, delivery/recovery o hotkeys en Dictation Tauri, estudiar y contrastar primero `C:/dev/fixvox`.

Fixvox es referencia fuerte para:

- dock flotante compacto y siempre a mano;
- dictation key con semantica hold/tap;
- estados visibles de arming, recording, processing, error y recovery;
- VU/meter como feedback operacional de voz;
- acciones cerca del dock: stop, cancel, stop-and-submit, paste-last, result history/context menu cuando aplique;
- no interrumpir foco de la app target salvo que el usuario ejecute una accion de delivery;
- delivery honesto: `paste_sent` es distinto de `paste_observed`, y clipboard/focus/keyboard deben estar gated hasta tener observer real;
- recovery honesto cuando transcripcion, processing o paste fallan.

## Dock: Modelo Observado

Archivos clave en Fixvox:

- `C:/dev/fixvox/src/app/views/voice-dock/App.svelte`: entry del dock, skins, wake settings y sync de estado.
- `C:/dev/fixvox/src/app/views/voice-dock/DockShell.svelte`: estructura visual: error chip, preset badge, processing chip, controles, mic/VU, halo y spinner.
- `C:/dev/fixvox/src/app/views/voice-dock/DockSkin4.svelte`: variante compacta con 7 dots, controles laterales y estado de grabacion muy denso.
- `C:/dev/fixvox/src/app/views/voice-dock/dock-state.svelte.ts`: polling, VU AGC, estado reactivo y handlers.
- `C:/dev/fixvox/src/app/views/voice-dock/dock-visual-semantics.ts`: semantica visual derivada: idle, arming, recording, processing, error.
- `C:/dev/fixvox/src/app/views/voice-dock-companion/App.svelte`: companion/recovery para errores y propuestas del asistente.
- `C:/dev/fixvox/src/app/backend/voice-dock-window.ts`: ventana flotante, no-activate, siempre arriba, posicion, context menu, companion y flujo runtime.
- `C:/dev/fixvox/src/app/backend/voice-dock-server.ts`: rutas locales `/dock/state`, `/dock/record/start`, `/dock/record/stop`, `/dock/record/stop-submit`, `/dock/record/cancel`, context menu, companion y paste-last.

Propiedades a preservar conceptualmente:

- Dock pequeno, no una ventana principal grande.
- Idle debe sentirse como launcher: mic/dots quietos, clickeable, draggable/context-menu si aplica.
- Recording debe tener feedback vivo de audio: VU o dots con AGC, no solo texto.
- Processing debe mostrar chip breve con accion actual: transcribing, finding target, cleaning up, inserting/preparing output.
- Error debe mostrarse como chip/companion con retry/copy/discard segun caso.
- Controles de stop/cancel aparecen solo cuando hay recording/arming; no saturar idle.
- Assistant/preset state puede aparecer como badge discreto, no como panel dominante.

Adaptacion a Dictation Tauri:

- Mantener la marca propia de `DESIGN.md`, pero aceptar que el dock utility overlay puede usar un lenguaje mas oscuro/translucido y compacto inspirado en Fixvox si mejora usabilidad.
- No adoptar el look completo de landing/marketing ni copiar tokens de sitio publico.
- No copiar la arquitectura HTTP/Electrobun; en Tauri, el host Rust/commands/events debe ser la frontera.
- No prometer paste observado si solo se envio paste o se copio texto.

## Hotkeys: Modelo Observado

Archivos clave en Fixvox:

- `C:/dev/fixvox/docs/navigation/features/hotkeys.md`: mapa canonico de hotkeys.
- `C:/dev/fixvox/docs/navigation/topics/hotkeys/topic.md`: conclusion vigente: una `Dictation key` visible.
- `C:/dev/fixvox/src/app/backend/settings-types.ts`: defaults actuales.
- `C:/dev/fixvox/src/app/backend/hotkeys.ts`: registro, polling fallback, dedupe, dispatch.
- `C:/dev/fixvox/src/app/backend/alt-space-hook.ts` y `C:/dev/fixvox/scripts/native/altspace-hook.cpp`: ruta especial para `Alt+Space`.
- `C:/dev/fixvox/src/app/backend/push-to-talk-short-press.ts`: short press = toggle, hold = push-to-talk.
- `C:/dev/fixvox/src/app/backend/voice-dock-window.ts`: start/stop/toggle/stop-submit del dock.

Defaults observados:

- `pushToTalk`: `Alt+Space` como tecla visible de dictado.
- `stopAndSubmit`: `Alt+Shift+Space`.
- `pasteLast`: `Alt+Shift+X`.
- `quickChat`: `Alt+Shift+C`.
- `picker`: `Alt+Q`.
- `resultHistory`: `Alt+Shift+Z`.
- `voiceRecord`: vacio/legacy.

Semantica importante:

- Una sola `Dictation key` visible: mantener para hablar corto o tocar para dictado largo.
- Hold largo: empieza al press y termina al release.
- Short press: queda latched/toggle para dictado mas largo; segundo press/release detiene.
- Escape durante recording cancela.
- Stop-and-submit puede existir como accion avanzada separada.
- Dedupe e in-flight guards son obligatorios para evitar doble start/stop.
- Para `Alt+Space`, Windows requiere tratamiento especial porque puede abrir menu del sistema; no asumir que `RegisterHotKey` basta.
- Fallback polling debe exigir combo exacto: todas las teclas esperadas abajo y ningun modificador extra.

Adaptacion a Dictation Tauri:

- El shortcut fijo actual `Ctrl+Shift+F9` es baseline tecnico, no norte UX final.
- El norte UX es converger a una `Dictation key` configurable con semantica Fixvox, idealmente compatible con `Alt+Space` si Tauri/Rust puede soportarlo de forma robusta.
- La implementacion debe vivir en frontera Tauri/Rust, con tests provider-free y sin registrar hotkeys reales en checks default.
- No introducir AutoHotkey como dependencia de producto.

## Checklist Para Futuras Implementaciones

Antes de cambiar dock/hotkeys:

1. Leer este topic y los archivos Fixvox clave.
2. Definir si la superficie es dock utility overlay, companion/recovery, settings o main app.
3. Escribir tests de estado/contrato antes de side effects reales.
4. Mantener no-overlap, dedupe, cancel y recovery.
5. Verificar UI visualmente si cambia el dock.
6. Documentar cualquier desviacion deliberada de Fixvox.

## Estado Actual En Dictation Tauri

- La UI actual corre como `Dictation Dock` transparente always-on-top de `164x64` en `npm run dev:desktop` (`tauri dev`), con 7 dots estilo Fixvox, controles laterales al grabar y chip compacto de estado/recovery.
- El hotkey primario en codigo Tauri ahora es `Alt+Space` con la misma semantica hold/tap estilo Fixvox mediante eventos `pressed`/`released`; `Ctrl+Shift+F9` sigue registrado como fallback tecnico.
- El dock tiene feedback vivo de voz: Rust/Tauri expone RMS/VU bands (`get_native_microphone_capture_level`) y el renderer las usa para barras visibles durante recording.
- El stop explicito en Tauri usa host STT real y puede llegar a `Transcript ready` sin abrir panel grande.
- Primer delivery real gated: se guarda el target foreground antes de grabar, luego se enfoca ese target, se escribe clipboard temporal, se envia `Ctrl+V`, se restaura clipboard y se reporta `paste_sent` o `paste_observed` solo cuando el observer nativo gated confirma insercion.
- Paste-last seguro sigue existiendo como recovery/UI sin reclamar observacion por si solo.
- El dock no debe aparecer en la taskbar (`skipTaskbar: true`); para desarrollo debe seguir instanciado y re-mostrable con `npm run dev:desktop:refresh` cuando quede oculto/no visible.

## Gaps Actuales En Dictation Tauri

- Tray/background dev baseline existe en Tauri: icono tray Rust con IDs estables `show_dock`, `hide_dock`, `settings`, `quit`, left-click toggle, `skipTaskbar: true`, hotkeys vivas y helper `npm run dev:desktop:refresh`; falta smoke visual/UX prolongado e installer/autostart.
- Falta no-activate real en todos los caminos show/hide/refresh: Fixvox usa `showWindowNoActivate`/`setWindowNoActivate`; Dictation Tauri todavia puede usar `set_focus()` en tray/refresh y eso no debe quedar para el dock utility.
- Falta drag/movilidad del dock: Fixvox permite mover el dock arrastrandolo, persiste posicion por monitor y puede seguir el monitor del cursor cuando esta idle.
- No hay companion/recovery overlay separado; el estado actual usa chip compacto dentro del dock.
- Falta context menu del dock: Fixvox tiene right-click con skin/dev/hide; Dictation Tauri hoy tiene tray menu pero no menu contextual propio del dock.
- Falta artifact/log JSON redacted para delivery status sin depender de UIA/computer-use; la verificacion nativa gated ya existe para targets Win32 compatibles.
- No hay seleccion/replace real en este flujo; solo insert-at-cursor gated.
- Alt+Space esta code-enabled via Tauri global-shortcut, pero sigue pendiente el smoke manual Windows antes de declararlo probado; `Ctrl+Shift+F9` es fallback tecnico.

## Analisis 2026-06-23: Que Hace Fixvox Con El Dock

Fixvox implementa el dock como una superficie utility, no como ventana normal:
- Ventana pequena por skin; Skin 4 usa aprox. `148x56` con 7 dots, controles laterales y estado compacto.
- Siempre arriba, transparente y sin taskbar.
- Show no-activate: se revela sin robar foco al input del usuario.
- Interactividad ajustable: puede activar/desactivar mouse passthrough cuando detecta menus nativos (`#32768`) para no bloquear interacciones del sistema.
- Drag nativo/manual: `POST /dock/drag/start` mide cursor inicial, poll de boton izquierdo, mueve ventana por delta y persiste al soltar.
- Posicion por monitor: guarda posicion, resuelve posicion para monitor del cursor y mueve el dock cuando idle si cambia el monitor.
- Renderer sync diferenciado: polling rapido durante arming/recording (`~60ms`) y sync liviano idle (`~450ms`).
- Visual mirror: puede mostrar estado visual arming/recording/processing aunque el runtime interno este idle brevemente, evitando parpadeos.
- Companion separado para errores/retry/dismiss, para no agrandar el dock.
- Context menu propio en right-click: skin, dev, hide.
- Settings defaults relevantes: `dockSkin: 4`, `showDockOnStartup: true`, `startWithWindows: false`, `pasteLast: Alt+Shift+X`, `picker: Alt+Q`, `stopAndSubmit: Alt+Shift+Space`, `voiceRecord: Alt+Space`, `pushToTalk: Ctrl+Alt+Space`.
## Opciones Rust/Tauri Para Drag Y Dock Utility
Preferencia actual para Dictation Tauri:
1. Implementar primero un comando Rust `start_dock_drag` que llame el equivalente Tauri nativo `start_dragging()` sobre la ventana `main`.
2. El renderer debe iniciar drag desde pointer down/move con threshold para no confundir click con drag; si es click, sigue start/stop como hoy.
3. Persistir posicion al recibir eventos de ventana movida, en storage local de app, sin contenido de usuario.
4. Mantener show/hide/topmost en Rust y no-activate. Evitar `set_focus()` en dock salvo que el usuario abra Settings/main window.
5. Si Tauri native drag falla por `transparent` + `decorations:false` + `skipTaskbar`, implementar fallback Win32 manual estilo Fixvox: cursor polling + `SetWindowPos` + persist al soltar.
6. Despues de drag/persistencia, agregar monitor-follow idle con guardrails para no mover el dock durante recording/processing.
