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

## Decision Update 2026-06-24

JP pidio que el dock quede lo mas igual posible al dock de Fixvox. Esto sube el criterio de "inspirado en Fixvox" a "paridad visual/ergonomica cercana" para el dock, especialmente la variante `DockSkin4.svelte`.

La direccion tecnica preferida es usar Rust/Tauri y APIs de Windows cuando eso permita estar mas cerca de Fixvox que una solucion solo-renderer: no-activate, always-on-top, transparencia, region/hit-test redondeada, posicion por monitor/DPI, preservacion de foco/target y futuras rutas nativas para hotkeys. La UI puede seguir siendo React/CSS si alcanza fidelidad, pero el shell de ventana debe ser host-owned.

Trabajo cerrado: `specs/012-fixvox-dock-dictation-key/tasks.md` Phase 8 / Checkpoint E quedo completo el 2026-06-24 para paridad cercana Skin4 + smoke real post-parity. JP acepto las desviaciones restantes como follow-ups, no como bloqueantes de cierre.

## Estado Actual En Dictation Tauri

- La UI actual corre como `Dictation Dock` transparente always-on-top de `164x64` en `npm run tauri:dev`, con 7 dots estilo Fixvox, controles laterales al grabar y chip compacto de estado/recovery.
- Regla dev de producto: en batches que toquen dock/tray/companion/hotkeys/delivery, mantener una instancia real `npm run tauri:dev` levantada para que JP pueda probar en vivo. No alcanza Vite/browser: el tray, menu nativo, hotkeys globales y ventanas Tauri solo existen en la instancia Tauri.
- El hotkey actual `Ctrl+Shift+F9` ya tiene ruta validada para semantica hold/tap estilo Fixvox mediante eventos `pressed`/`released`; sigue siendo baseline tecnico, no norte UX final.
- El dock tiene feedback vivo de voz: Rust/Tauri expone RMS/VU bands (`get_native_microphone_capture_level`) y el renderer las usa para barras visibles durante recording.
- El stop explicito en Tauri usa host STT real y puede llegar a `Transcript ready` sin abrir panel grande.
- Primer delivery real gated: se guarda el target foreground antes de grabar, luego se enfoca ese target, se escribe clipboard temporal, se envia `Ctrl+V`, se restaura clipboard y se reporta solo `paste_sent`.
- Paste-last seguro sigue existiendo como recovery/UI sin reclamar observacion; no hay `paste_observed` hasta tener verificador real.
- `012` Phase 8 / Checkpoint E avanzo T030: `tests/voice-dock/voice-dock-parity.test.tsx` cubre contrato provider-free de paridad Skin4 antes de tocar visual/native shell (idle `164x64`, 7 dots, dot gap/size, recording controls, processing chip, reduced motion, sin `paste_observed` y sin panel dev/provider). CUA MCP persistente smokeo el dock en Vite/browser con Start -> Recording -> Stop -> recovery provider-free; evidencia ignorada en `artifacts/desktop-control/cua-visual-smoke/20260624-110253/report.json`.
- T031 cerro el refinamiento renderer-only contra constantes Skin4: core `66x28`, controles laterales `31px`, gap Skin4 alrededor del core, companion chip compacto de dos lineas, constantes de dots nombradas en `VoiceDock.tsx`, hover/focus y reduced-motion mas cercanos a `DockSkin4.svelte`. Checks provider-free/build/visual pasaron.
- T032/T033 movieron fidelidad de shell a Rust/Tauri: `src-tauri/src/dock_shell.rs` configura el dock al setup, `tauri.conf.json` arranca hidden/`focus:false`/`skipTaskbar:true`, calcula posicion bottom-center en work area del monitor y en Windows usa HWND con `WS_EX_NOACTIVATE`, `WS_EX_TOOLWINDOW`, sin `WS_EX_APPWINDOW`, `SWP_NOACTIVATE` y `SWP_SHOWWINDOW`. Smoke CUA/Win32 verifico rect `164x64` y foreground preservado; evidencia en `artifacts/desktop-control/dock-shell-smoke/20260624-114946/report.json`.
- T034 corrio side-by-side contra Fixvox ya activo: `artifacts/desktop-control/dock-parity-smoke/20260624-124835/summary.json` + crops. Idle/recording quedaron cercanos en geometria, transparencia, 7 dots, VU, controles laterales y shell no-activate/toolWindow. Deviations detectadas: Dictation no tiene enter-submit azul separado, hit-region idle nativa, resize state-aware de processing/error, ni context menu/preset/assistant indicators.
- T035 corrio smoke real post-parity con `scripts/desktop-dictation-e2e.ps1` run id `20260624-T035-post-parity`: `Ctrl+Shift+F9` -> speech fixture -> live VU/fresh WAV -> managed STT -> saved-target `paste_sent` -> clipboard sentinel restore. Evidence redacted: `artifacts/desktop-control/dictation-e2e/20260624-T035-post-parity/report.json`.
- T036 cerro docs finales: Checkpoint E quedo completo y las desviaciones de paridad se aceptaron como follow-ups/gates futuros, no como bloqueantes.
- Lote 1 follow-up cerro las desviaciones dock-specific mas importantes: controles separados verde `Stop & review`, azul `Stop & submit` y rojo `Cancel`; `Stop & submit` pide paste-then-Enter pero mantiene evidencia `paste_sent`; visual-only preset badge e indicador assistant; `update_dock_shell_state` en Rust/Tauri; idle rounded hit-region con `CreateRoundRectRgn`/`SetWindowRgn`; resize state-aware con `SetWindowPos(... SWP_NOACTIVATE ...)`. Smoke CUA uso `Dictation Dock` real y contexto controlado tipo Notepad; evidencia en `artifacts/desktop-control/dock-lote1-smoke/20260624-renderer-native/report.json`.
- Lote 2 follow-up agrego tray/background y ruta gated de Alt+Space sin cambiar el default seguro: menu de tray nativo, hide-on-close, right-click context menu del dock, comando host `desktop-control://host-command`, resolver Rust de `DICTATION_TAURI_DICTATION_KEY` y gate `DICTATION_TAURI_ALLOW_ALT_SPACE`. Evidencia CUA: `artifacts/desktop-control/combined-lote-smoke/20260624-tray-altspace-selection/report.json`.
- Lote 3 follow-up avanzo los cinco frentes restantes: `Alt+Space` usa backend Windows `WH_KEYBOARD_LL` cuando esta explicitamente gateado y smokeo Start/Cancel sin menu del sistema; tray/context menu agrega presets/history/settings; existe companion panel renderer para recovery/history/settings; result history local host-owned guarda ultimos 50 outputs exitosos; selection capture redakta metadata de target antes de cruzar frontera. Evidencia: `artifacts/desktop-control/combined-lote-smoke/20260624-five-fronts-altspace-companion/report.json`.
- Lote 4 hizo `Alt+Space` default en Windows con fallback explicito `Ctrl+Shift+F9`, agrego UIA `TextPattern.GetSelection()` real best-effort, observer Win32 bounded para poder elevar a `paste_observed` solo con verificacion, y creo una ventana Tauri `dock-companion` separada first-slice. Smoke Alt+Space default paso; el bloqueo inicial del E2E por foreground-lock de CUA se resolvio hardeneando el harness con `AttachThreadInput` y `-DictationKey AltSpace`; full default Alt+Space E2E paso en `artifacts/desktop-control/dictation-e2e/20260624-e2e-altspace-default/report.json`. Evidencia adicional: `artifacts/desktop-control/combined-lote-smoke/20260624-six-fronts-default-altspace-uia-observer/report.json`.
- Lote companion-sync cambio la companion de placeholder estatico a superficie sincronizada por evento Tauri `dock-companion://state`: recovery, history y settings comparten snapshot redacted desde la ventana dock. History expone source/length/status, no texto/transcript raw; tests provider-free cubren que no filtre contenido.
- Lote dock move/feedback agrego drag-to-move desde la orb con threshold, persistencia de posicion en app data (`dock-position.v1.json`) y restore/clamp al arrancar. El primer intento con `startDragging()` fue insuficiente en vivo; se cambio a drag manual por deltas del renderer y `setPosition(PhysicalPosition)`, verificado con CUA sobre `Dictation Dock`. Tambien alinea el feedback post-insert y post-cancel con Fixvox: si delivery llega a `paste_sent`/observer verificado o se cancela explicitamente, el dock vuelve a idle en lugar de quedarse mostrando `Transcript ready`/`Dictation cancelled`/acciones de recovery encima de los dots.

## Gaps Actuales En Dictation Tauri

- No hay autostart/Start with Windows ni instalador/background lifecycle de app instalada; si se implementa, pedir confirmacion.
- La ventana Tauri `dock-companion` ya renderiza recovery/history/settings sincronizados desde el dock por evento `dock-companion://state` y emite acciones propias por `dock-companion://command`: copy, paste-last safe, retry, preset select/clear y dismiss de panels. Falta settings editing real y smoke real dedicado.
- Hay observer Win32 bounded con hardening interno provider-free: normaliza line endings y exige aumento de ocurrencias entre lecturas Win32 antes de elevar a `paste_observed`. Un E2E controlado post-cambio paso con product UI `paste_observed` en `artifacts/desktop-control/dictation-e2e/20260624-observer-paste-observed-e2e-verified/report.json`; fuera de esa ruta verificada, `paste_sent` no debe presentarse como observado.
- Hay selected-text read UIA best-effort con smoke T039 redacted pasado y replace foundation, pero falta flujo UX completo preset -> selection transform -> replace-selection.
- Alt+Space es default en Windows y `Ctrl+Shift+F9` queda fallback explicito. Falta mas soak/manual E2E post-default para harden antes de llamarlo final.
- Escape cancel esta implementado por hook nativo Windows host-owned: el renderer arma/desarma `set_desktop_control_escape_cancel_enabled` solo mientras hay captura cancelable, el hook emite `desktop-control://global-hotkey` con `action: "cancel"`/`shortcut: "Escape"`, y la ruta comparte el cancel existente del controller. Mientras no esta armado, Escape no se intercepta.
- Context menu/tray existen con presets/history/settings iniciales; falta settings real editable, input device, picker y result history UX completa.
- Existe ventana Tauri `dock-companion` separada; el primer sync real ya evita el placeholder estatico y redakta history a longitud/status. Las acciones basicas de recovery/history/settings ya estan cableadas por evento renderer; falta converger layout avanzado, settings editing y acciones de seleccion/assistant a la companion de Fixvox.
- Preset badge ya responde a menu, pero todavia no activa motor real de selection transform/assistant por default.
- Indicador assistant sigue visual-only y no activa Quick Chat/Assistant Mode real.
- Falta comparar el feedback post-insert/post-cancel contra Fixvox en side-by-side real y hacer smoke de restore tras reinicio; el drag del dock ya tuvo smoke CUA live contra `Dictation Dock` y el contrato provider-free esta actualizado.
