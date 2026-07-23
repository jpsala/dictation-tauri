---
status: superseded
started: 2026-06-25
updated: 2026-07-20
priority: high
owner: JP/Pi
related:
  - docs/tracks/standard-product-ux-redesign-plan.md
  - docs/topics/ui-design-and-impeccable.md
  - docs/topics/fixvox-dock-and-hotkeys-reference.md
  - docs/topics/source-project-map.md
topic: settings-window-and-ui-foundation
source_refs:
  - src/settings/SettingsSurface.tsx
  - src/settings/settings-heroui.css
  - src-tauri/src/settings_window.rs
  - src-tauri/src/tray.rs
  - src-tauri/tauri.conf.json
  - artifacts/ui-spikes/heroui-settings/settings-dark-spike.png
---

# Settings Window Y UI Foundation

## Objetivo

Crear una pantalla normal de Settings para Dictation Tauri que pueda crecer rapido sin disenar cada control desde cero, manteniendo el dock/companion como superficies especiales custom y Fixvox-like.

## Direccion Confirmada

Decision conversacional 2026-06-25:

- Usar **HeroUI v3** como base para ventanas normales: Settings, History, Presets, Devices, About/Debug.
- Mantener **dock, companion compacta, overlays/recovery cercanos al dock** en React/CSS custom + shell Rust/Tauri, no en una component library generica.
- Mantener el criterio visual de `DESIGN.md`: operativo, denso, calmo, oscuro si ayuda, sin caer en UI generica de AI SaaS.
- El primer spike dark gusto a JP y se considera direccion aceptada para arrancar Settings real.

## Research Resumido

Opciones evaluadas:

- **HeroUI v3**: elegido para spike. Moderno, lindo out-of-the-box, Tailwind CSS v4, React Aria Components, compound components, CSS variables, Figma kit, docs/AI tooling. Suficientemente poderoso para forms, cards, switches, tabs, drawers/modals, popovers, toasts, tables/listbox, feedback y navegacion.
- **Mantine**: fallback seguro/productivo si HeroUI fricciona; menos distintivo visualmente.
- **shadcn/ui / Park UI**: potentes y AI-friendly, pero implican ownership fuerte de design system y mantenimiento de componentes copiados; no son la mejor respuesta si queremos no disenar todo a mano.
- **Semi/MUI/Ant**: muy completos, pero mas enterprise/genericos o menos alineados con la identidad deseada.

Conclusiones:

- HeroUI es poderoso suficiente para el producto actual, pero no reemplaza criterio visual propio.
- Si aparece una necesidad ultra-enterprise (tabla compleja, virtualizacion avanzada), sumar una libreria puntual como TanStack Table antes que cambiar la base entera.
- Tailwind v4 requiere integracion correcta con Vite via `@tailwindcss/vite`; sin eso los estilos HeroUI pueden verse rotos o demasiado grandes.

## Estado Actual

JP rechazo el primer Settings real por ser demasiado grande. Se reencuadro el trabajo para avanzar de a poco, mirando Fixvox/Fixbox como referencia fuerte:

- Fixvox Settings tiene sidebar compacto y secciones, con Hotkeys como una seccion dentro de Essentials. Referencias leidas: `C:/dev/fixvox/src/app/views/settings/App.svelte`, `C:/dev/fixvox/src/app/views/shared/ui/HotkeyField.svelte`, `C:/dev/fixvox/src/app/views/shared/ui/app-ui.css`.
- Dictation Tauri mantiene un scaffold compacto de secciones y la seccion Hotkeys como primer control editable real.
- Superficie actual: `src/settings/SettingsSurface.tsx`.
- Tema compacto: `src/settings/settings-heroui.css`.
- Ventana Tauri `settings` reducida a `720x480` (`min 620x420`).
- Comando Rust `show_settings_window` en `src-tauri/src/settings_window.rs`; la X nativa ahora cierra/destruye Settings y el siguiente open recrea la ventana si falta.
- Tray `Settings` abre la ventana normal directamente desde Rust (`src-tauri/src/tray.rs`).
- Se retiro del UI todo lo no-hotkeys: presets, dock toggles, delivery toggles y preview grande.
- Hotkeys ahora tiene un unico campo editor persistente: click en la hotkey actual -> `Press new shortcut...` -> presionar combinacion. El host valida/registra/persiste en `hotkey-preferences.v1.json` bajo app data Tauri; el renderer no registra shortcuts globales. El recorder evita captura por mero focus/mousedown y de-dupea rearmados mientras esta armed/recording.
- Tests actuales: `tests/settings/settings-surface.test.tsx`, `tests/settings/hotkey-edit-contract.test.ts`, `tests/settings/hotkey-edit-copy.test.ts` y guards host en `tests/desktop-control/tauri-host-control.test.ts`.
- Captura de JP mostro fallas claras del layout: colapso indebido a 720px, badge HeroUI gigante, marca pegada y scroll visible. Parche inmediato: breakpoint bajo `620px` y badge CSS propio chico en vez de `Chip` de HeroUI.
- Screenshot aprobado del spike visual queda solo como referencia historica, no como direccion de densidad: `artifacts/ui-spikes/heroui-settings/settings-dark-spike.png`.

## Estado Del Lote Actual

2026-06-25: se capturo screenshot Tauri limpio y se aplico un rediseño compacto manual sobre el brief Impeccable/v0, manteniendo solo secciones + Hotkeys read-only. JP valido la direccion: "Me gusta cómo viene hasta ahora".

- Screenshot antes: `artifacts/ui-spikes/settings-redesign/20260625-171006/settings-current.png`.
- Prompt v0 acotado: `artifacts/ui-spikes/settings-redesign/20260625-171006/v0-prompt.md`.
- Screenshot despues: `artifacts/ui-spikes/settings-redesign/20260625-171240/settings-after.png`.
- Cambios: marca/sidebar corregidos, jerarquia mas compacta, panel Hotkeys sin scroll a 720x480, badges chicos propios, keycaps densos y nota read-only acotada.
- Checks: `npm run test:pipeline -- tests/settings`, `npm run build`, `npm run visual:check`, `cd src-tauri && CARGO_TARGET_DIR=target/pi-settings-redesign cargo check`.

2026-06-25 follow-up: JP eligio micro-alcance **re-registro hotkeys**. Se mantuvo Settings read-only y se agrego una franja compacta `Native edit plan` dentro de Hotkeys, sin inputs, botones de captura, save bar ni cambios runtime. El objetivo visible queda claro: captura host-owned, conflict check, swap/unregister-register, rollback y verificacion antes de permitir edicion real.

- Prompt v0 acotado: `artifacts/ui-spikes/settings-hotkey-reregistration/20260625-172439/v0-prompt.md`.
- Critique/polish Impeccable: `artifacts/ui-spikes/settings-hotkey-reregistration/20260625-172439/impeccable-critique.md`.
- Screenshot despues: `artifacts/ui-spikes/settings-hotkey-reregistration/20260625-172439/settings-after.png`.
- Fit check 720x450: `artifacts/ui-spikes/settings-hotkey-reregistration/20260625-172439/settings-after-tauri-content-check.png`.
- Checks: `npm run test:pipeline -- tests/settings`, `npm run build`, `npm run visual:check`, `cd src-tauri && CARGO_TARGET_DIR=target/pi-settings-rereg cargo check`.

Hotfix cierre Settings: se probo que `hide-on-close` dejaba friccion y JP no queria boton Close custom. La X nativa ahora se deja cerrar/destruir la ventana (`CloseRequested` sin `prevent_close`) y `show_settings_window` recrea la WebView si falta, luego show/unminimize/focus. Test guard: `tests/settings/settings-window-host.test.ts`. No reintroducir `api.prevent_close()` ni boton Close propio salvo pedido explicito.

Hotfix tray/dock: JP reporto que `Show dock`/`Hide dock` no hacian nada. `dock_shell` ahora mantiene una bandera host-owned de visibilidad para que los updates renderer no re-muestren el dock oculto, conserva el ultimo estado para `Show dock`, usa `ShowWindow(SW_HIDE)` nativo en Windows y el tray loguea errores show/hide. Test guard: `tests/desktop-control/dock-shell-host.test.ts`.

Hotfix companion/history: JP marco que la ventana de Result history no era usable ni cerrable. La companion ahora tiene X propia en el header para cerrar, sin botones `Close`/`Dismiss`; history renderiza entradas como items seleccionables que muestran preview corto, expanden mas contenido en hover/focus y al click cargan/disparan paste-last hacia el target guardado; la ventana companion sube a 320x260, tiene hide-on-close y logs. Tambien hay watcher host-owned de foreground target que preserva la ultima ventana editable no-Dictation-Tauri antes de que el tray/menu robe foco, y `captureTauriDesktopDeliveryTarget` prefiere ese target cached para que paste/interacciones posteriores vuelvan al input correcto. Tests guard: `tests/voice-dock/companion-view.test.tsx`, `tests/voice-dock/companion-window-host.test.ts`, `tests/voice-dock/result-history-actions.test.ts`, `tests/desktop-control/desktop-delivery-target-cache.test.ts`.

Follow-up contrato hotkeys: se extrajo `src/settings/hotkey-edit-contract.ts` como contrato puro de re-registro nativo: captura host-owned, conflict check, swap, rollback y verify. `SettingsSurface` lo renderiza como plan read-only, y `tests/settings/hotkey-edit-contract.test.ts` protege que el renderer sigue sin inputs, registro ni persistencia de shortcuts. Primera API runtime: `src-tauri/src/desktop_control.rs` expone `preview_desktop_control_hotkey_registration` y `apply_desktop_control_hotkey_registration`, con swap host-owned entre `Alt+Space` nativo y `Ctrl+Shift+F9` Tauri-global, rollback y verify; `src/desktop-control/tauri-host-control.ts` solo invoca esos comandos y no registra shortcuts desde el renderer. Checks: settings focused, focused desktop/voice/settings suite, build, cargo check con target alternativo y Playwright visual en puerto alternativo 1433/1434 porque el script default quedo bloqueado en 1420.

Smoke live de API host-owned cerrado: `scripts/hotkey-reregistration-smoke.ps1` (`npm run hotkey-reregistration:smoke -- -AllowDesktopSideEffects`) lanza Tauri con WebView2 CDP, invoca preview/apply, verifica swap `Alt+Space` -> `Ctrl+Shift+F9`, smoke fisico de `Ctrl+Shift+F9` a `Listening`, error seguro para shortcut no soportado y restore a `Alt+Space` native hook sin rollback. Passing run redacted: `artifacts/desktop-control/hotkey-reregistration-smoke/20260626-hotkey-rereg-smoke-pass/report.json`. Nota: un intento de smoke fisico de `Alt+Space` via CDP se abandono porque el WebView/CDP se podia colgar tras la combinacion; queda validado por config/registro y los E2E Alt+Space previos, pero conviene soak manual antes de UI editable.

2026-06-26 continuation: se implemento el control compacto editable de Hotkeys en Settings sobre la API host-owned ya smokeada. El renderer solo muestra candidatos soportados (`Alt+Space`, `Ctrl+Shift+F9`) y llama preview/apply del host; no captura teclado arbitrario ni registra shortcuts frontend. El control expone estado current/candidate, preview host, save, rollback/verificacion y copy durable de errores/conflictos en `src/settings/hotkey-edit-copy.ts`. CDP smoke contra la ventana Tauri real cambio `Alt+Space` -> `Ctrl+Shift+F9` -> `Alt+Space` y verifico fit 720x480 sin scroll de contenido: `artifacts/ui-spikes/settings-hotkey-editor/20260626-ui-cdp-smoke/report.json`. Con aprobacion explicita de JP, soak fisico corto de `Alt+Space` restaurado paso: Settings mostraba `Current Alt+Space`, `Alt+Space` fisico llevo el dock a `Listening`, cancel host-owned volvio a `Ready`, evidencia redacted en `artifacts/desktop-control/altspace-soak/20260626-settings-editor-restored-altspace/report.json`. Follow-up inmediato: se agrego preference storage host-owned en `hotkey-preferences.v1.json` bajo app data Tauri; smoke de persistencia guardo `Ctrl+Shift+F9`, reinicio y lo leyo, luego restauro `Alt+Space`, reinicio y lo leyo, dejando archivo final en `Alt+Space`: `artifacts/desktop-control/hotkey-persistence/20260626-settings-hotkey-persistence/report.json`. Feedback JP: "no me deja cambiar los hotkeys"; root UX issue: habia que elegir candidato y luego `Save`, facil de pasar por alto. Fix: los botones ahora dicen `Use Alt+Space`/`Use Ctrl+Shift+F9` y guardan inmediatamente con un click; el boton secundario queda para check opcional antes de guardar. Fan-out posterior detecto copy conflictivo y riesgos chicos: se quito el boton `Save <shortcut>`, se cambio copy a "Click Alt+Space or Ctrl+Shift+F9 to save immediately. Preview is optional.", se muestran descripciones visibles en los candidatos, se verifica tambien el camino already-active antes de declarar success y se loguean problemas de preference storage en startup. Smoke redacted one-click paso y restauro `Alt+Space`: `artifacts/desktop-control/hotkey-persistence/20260626-hotkey-one-click-fix/report.json`. Feedback posterior: JP pidio ver el cambio `Alt+Space` -> `Alt+3`; se agrego `Alt+3` como candidato soportado Tauri global-shortcut y luego JP aclaro que no queria alternativas sino una sola hotkey editable presionandola. Se reemplazo la lista por un unico recorder: `Alt+Space / Click to edit` -> `Press new shortcut...` -> presionar `Alt+3`. CUA visible contra Settings real confirmo `Current Alt+3`, `Saved: Alt+3`, y `hotkey-preferences.v1.json` final en `Alt+3`; evidencia `artifacts/desktop-control/hotkey-persistence/20260626-hotkey-recorder-alt3/report.json`.

Operativa live-app: para que JP pruebe sin ventanas de terminal ni foco robado, usar `npm run tauri:dev:hidden -- -StopExisting`. El script `scripts/start-tauri-dev-hidden.ps1` guarda logs UTF-8 bajo `artifacts/live-app/<runId>/tauri-dev.log`, mata instancias repo-owned/puerto 1420 con timeout acotado cuando se pide `-StopExisting`, despega el child de stdout para que npm devuelva rapido y deja solo el dock Tauri visible. Smoke launcher: `artifacts/live-app/20260702-launcher-hardening-smoke-final/tauri-dev.log`.

2026-07-02 parity audit contra Fixvox Settings: Settings todavia no esta en paridad completa. Auditoria/gaps en `artifacts/ui-spikes/settings-parity-audit/20260702-settings-parity-audit.md`; screenshot antes `20260702-current-settings.png`, batch shell `20260702-settings-shell-parity-batch.png`, batch Essentials `20260702-settings-essentials-tabs.png`, batch Hotkeys `20260702-settings-hotkeys-expanded.png`, batch Presets CRUD local `20260702-settings-presets-crud.png`. Aplicado: brand/sidebar pasa a Fixvox/Desktop settings, agrega current policy local, nav icon + label + meta, General pasa a Settings/Essentials, Essentials tiene tabs internas Access/Workspace/Behavior/Hotkeys/First run, Hotkeys lista el set Fixvox-like de 9 shortcuts y Presets permite add/delete custom, duplicate, name/picker key/hotkey/provider/model/confirm/enabled. En Tauri, presets hidratan/persisten en host-owned app data (`selection-presets.v1.json`) y Alt+Q recarga la store al abrir; browser/dev mantiene fallback renderer. Workspace/Behavior tienen prefs host-owned en `user-preferences.v1.json` para `showDockOnStartup`, `reviewBeforeDelivery`, `pressEnterAfterPaste`; runtime ya respeta `showDockOnStartup` al configurar el dock, escucha cambios de Settings en la app viva, aplica `pressEnterAfterPaste` al delivery normal y usa `reviewBeforeDelivery` para transformar a review-only en vez de replace/paste automático. Hotkeys ahora expone recorder host-owned tambien para action shortcuts `preset_picker` y `paste_last_safe`, persistidos en `action-hotkey-preferences.v1.json` y aplicados al hook nativo Windows para picker/paste-last. Smoke live CDP contra Tauri real paso: preview/apply `preset_picker=Ctrl+Alt+P`, `paste_last_safe=Ctrl+Alt+X`, readback, restore defaults `Alt+Q`/`Alt+Shift+X`, toggle/readback/restore prefs runtime; evidencia `artifacts/desktop-control/action-hotkeys-prefs-smoke/20260702-action-hotkeys-prefs-smoke/report.json`. Smoke fisico redacted tambien paso: `Alt+Q` abrio preset picker con starters y `Alt+Shift+X` emitio paste-last (`paste_sent`) usando historia existente; evidencia sin texto raw en `artifacts/desktop-control/action-hotkeys-physical-smoke/20260702-physical-action-hotkeys-smoke/report.json`. Ese smoke quedo versionado como `scripts/action-hotkeys-physical-smoke.ps1` y `npm run action-hotkeys:physical-smoke`; run versionado passing `artifacts/desktop-control/action-hotkeys-physical-smoke/20260702-action-hotkeys-script-smoke/report.json`. Layout Hotkeys fue pulido para 720x480: editor arriba, action recorders compactos, feedback sin chips vacios y All bindings abajo; evidencia `artifacts/ui-spikes/settings-action-hotkeys-layout/20260702-action-hotkeys-layout/settings-hotkeys-action-editors-final.png` + `metrics-final.json`.

Cloud/admin sync de presets backend + desktop local cerrado: el control-plane publica defaults `userSettingsDefaults.selectionPresets` con los cuatro starters Fixvox, `promptId` estable (`preset.como-yo-es`, `preset.corregir-texto`, `preset.fix-writing`, `preset.like-me-en`) y `promptContent`; el prompt catalog admin incluye esos `preset.*` como built-ins `selectionTransform`; Settings / Presets carga el policy snapshot redacted y ofrece `Import Cloud defaults` para aplicar metadata + body al store local host-owned (`selection-presets.v1.json`) sin mutation Cloud. Test guards: `control-plane device activation > exposes Fixvox preset prompt defaults for Settings sync`, `tests/settings/preset-store-control.test.ts`, y assertions en `settings-surface.test.tsx`. Which-key multi-chord primer slice local cerrado: el preset picker muestra panel dinámico de chord keys, etiqueta `Alt+Q then <key>`, quick-run acepta el chord final derivado de `pickerKey`/hotkey y la búsqueda filtra por nombre/id/key/hotkey. Guard tests: `tests/voice-dock/companion-view.test.tsx`. Smoke live Tauri/CDP actualizado en `scripts/dock-companion-smoke.ps1` y passing en `artifacts/desktop-control/dock-companion-smoke/20260702-preset-picker-whichkey-smoke-pass/report.json`: host command abre preset picker, starters visibles, labels Which-key visibles, debug open, ventana nativa `Preset Picker` visible y sin raw transcript. Dogfood Alt+Q sin harness tambien paso en `artifacts/desktop-control/dogfood-altq-picker/20260702-altq-picker-no-harness/report.json`: Alt+Q real contra Windows Terminal abrio `Preset Picker`, UIA mostro starters + labels `Alt+Q then Y/C/F/L`, Esc cerro la ventana y el dock quedo en idle Ready sin chip/badge residual expuesto. Mutation admin primer slice implementado siguiendo el patrón de `C:/dev/fixvox/proxy/src/control-plane-admin-page.ts`: endpoint Worker/admin proxy `policy/selection-presets` actualiza `userSettingsDefaults.selectionPresets` y sincroniza prompts `preset.*` al catálogo; Admin Web muestra panel `Selection presets Cloud sync` con botón `Publicar defaults` protegido por `confirmProductionMutation`. Checks: `npm run cloud:test`, `npm run admin:web:smoke`, `node --check admin/fixvox-web/public/app.js && node --check admin/fixvox-web/server.mjs`. Con aprobación explícita de JP 2026-07-02, el slice quedó aplicado en producción: Worker `ef52d391-b052-4a16-a128-7ba231254579`, admin web sincronizado al VPS, mutation `POST /admin/control-plane/policy/selection-presets` publicó 4 starters + prompts `preset.*`; evidencia `artifacts/admin-web-prod-smoke/20260702-readonly-admin-prod/post-deploy-selection-presets-report.json`. Siguiente slice implementado en código: el hook nativo Windows del picker ahora arma una ventana de chord corta después del shortcut raíz y emite `run_preset_picker_chord` con la tecla final para que el renderer resuelva presets locales/custom y ejecute sin depender del foco del input. Checks: `npm run test:pipeline -- tests/desktop-control/tauri-host-control.test.ts tests/voice-dock/companion-view.test.tsx`; `cd src-tauri && CARGO_TARGET_DIR=target/pi-native-chord-check cargo check`. Falta smoke físico/live dedicado de `Alt+Q then <key>` antes de cerrar el lote.

## Metodo De Diseño A Usar En Adelante

Para cualquier superficie de diseño durable, o cuando JP lo pida, usar el flujo documentado en `docs/topics/ui-design-and-impeccable.md`: screenshot real, prompt v0 acotado, critique/polish Impeccable, implementacion manual, screenshot/checks y feedback JP antes de ampliar alcance.

## Update 2026-06-29: Cloud Settings UX hardening

Como parte del release/cloud local hardening, la seccion Cloud de `SettingsSurface` dejo de ser solo lectura tecnica y ahora muestra UX accionable para instalar/activar en limpio:

- `src/settings/fixvox-cloud-control.ts` deriva health redacted: open-in-Tauri, local setup, activation needed, cloud refresh failed, policy stale, managed blocked o ready.
- `SettingsSurface` muestra badge/headline/detail, policy/capabilities, next step y error redacted; `statePath` se reduce a `fixvox-device-state.json · host app data` para no filtrar rutas personales completas.
- Acciones disponibles: `Refresh local status`, `Repair device link`, `Refresh policy`, `Activate device`; las operaciones cloud siguen con `window.confirm` antes de contactar Fixvox Cloud.
- Tests: `tests/settings/fixvox-cloud-control.test.ts` cubre health/errores redacted; checks pasaron: `npm run test:pipeline -- tests/settings`, `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`, `npm run build`, `cd src-tauri && cargo fmt --check && cargo check`.
- Smoke visual CUA 2026-06-29: Settings abrio por `show_settings_window`, Cloud renderizo `Ready for managed dictation`, policy `Pro`, capabilities `managed STT · advanced settings · debug hidden · fresh`, next-step accionable, `Repair device link` visible y path reducido a `fixvox-device-state.json · host app data`; report redacted en `artifacts/ui-spikes/settings-cloud-smoke/20260629-settings-cloud-smoke/report.json`.
- Commit: `1bcb2ec fix: harden fixvox cloud settings ux`.

## Update 2026-06-28: Settings secciones + HeroUI CSS

JP reporto tres problemas: Settings tardaba demasiado en renderizar, solo Hotkeys aparecia habilitada en el sidebar, y dentro de Hotkeys aparecian varias secciones superpuestas. Se corrigio el modelo de navegacion y el costo CSS:

- `src/settings/SettingsSurface.tsx` ahora tiene `selectedSection`: todas las secciones del sidebar son navegables y se renderiza **solo un panel seleccionado** por vez. Hotkeys y Cloud tienen panel real; General/Dock/Delivery/Presets/About muestran placeholder compacto hasta que haya controles reales.
- Cloud dejo de renderizarse debajo de Hotkeys; esto evita que contenido de secciones distintas compita por la misma grilla compacta de `720x480`.
- El estado Cloud se carga solo al abrir la seccion Cloud, no durante el primer render de Hotkeys.
- `src/settings/settings-heroui.css` dejo de importar `@tailwindcss`/`@heroui/styles` completos en runtime. La superficie usa CSS local escopado porque actualmente no usa componentes HeroUI reales; la importacion global completa era trabajo extra y podia afectar first paint/layout.
- Research web documentado en `docs/topics/ui-design-and-impeccable.md`: HeroUI v3 es CSS-first, permite imports selectivos de estilos, usa `className`/BEM/CSS variables, y React Aria Tabs separa selected vs disabled.
- Checks: `npm run test:pipeline -- tests/settings` y `npm run build` OK.

## Update 2026-06-29: Hotkey recorder capture hardening

Pulido local posterior al smoke de Cloud Settings:

- `SettingsSurface` dejo de armar captura del recorder en `onMouseDown` y `onFocus`; ahora solo inicia por click explicito y mantiene `onKeyDown` para la combinacion.
- Se agrego guard con `captureArmedRef` para no rearmar captura mientras el host ya esta armed/recording, evitando dobles invocaciones del comando `set_desktop_control_hotkey_capture_enabled`.
- Tests actualizados: `tests/settings/settings-surface.test.tsx` protege que no vuelva el armado por focus/mousedown.
- Checks: `npm run test:pipeline -- tests/settings`, `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`, `npm run build`.
- Commit: `710f24d fix: harden settings hotkey capture`.

## Update 2026-06-29: Dock companion sync dedupe

Pulido live de Settings/Dock/Cloud posterior al recorder hardening:

- `App.tsx` ahora calcula una sync key estable para la companion; si el snapshot esta oculto, la key es `hidden` aunque cambie el estado interno del dock.
- `src/voice-dock/companion-state.ts` exporta `createDockCompanionSyncKey`; esto evita invocar `hide_companion` repetidamente cuando la companion ya esta oculta.
- Tests: `tests/voice-dock/companion-state.test.ts` cubre que estados ocultos no disparen sync distinto por cambios no visibles.
- Checks: focused companion, `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`, full `npm run test:pipeline`, `npm run build`.
- Commit: `bb83fea fix: dedupe dock companion sync`.

## Update 2026-07-13: Settings unificado y capability-aware

JP eligió un Settings unificado: preferencias personales siguen nativas y la administración global reutiliza el Control Room existente, no duplica engines/prompts/profiles/accounts en React. Implementado local: `admin_settings` queda reservado a power-admin; Settings deriva acceso desde auth policy, oculta Presets cuando falta `selection_transform`, deshabilita mutaciones sin `custom_prompts` y ya no presenta provider/model local como routing efectivo. La sección Admin valida policy también en Rust, acepta HTTPS o localhost HTTP y no obtiene `ADMIN_API_KEY`. La WebView Tauri externa quedó en blanco incluso al forzar navegación host-level; JP eligió el fallback confiable y mínimo: `Open Control Room` abre la URL validada en el navegador autenticado mediante el opener host-owned existente.

También quedó cerrado el primer límite de retención: result history conserva como máximo 50 entradas/256 KiB, evicta oldest-first y expone `Clear history`.

Accounts del Admin Web ahora reconoce la cuenta de producto del administrador autenticado mediante el Google `sub` conservado solo server-side y el mismo hash `acc_<sha256>` del Control Plane. La fila existente recibe `Tu cuenta`, nombre y email enmascarado; las demás filas siguen redacted y una sesión sin vínculo muestra aviso sin fabricar ni duplicar accounts. El mock UI smoke completo pasó y dejó screenshot en `artifacts/ui-spikes/admin-web-ui-smoke/20260713-230707/`.

Checks seguros: 443 tests pipeline, 98 Cloud, Rust 92 pass + 1 ignored, build/check verdes. Worker `3caacc64-279f-4209-b4ac-6be9df78e82d` fue desplegado con health verde y JP autorizó la mutación account-level: `acc_9c8…` ahora es Power Admin por Account override y conserva 1 device. Fixvox refrescó la policy con `admin_settings`, `custom_prompts`, `advanced_settings` y `debug_tools`; Settings mostró Admin y abrió el Control Room en Vivaldi. Chrome extension verificó en producción `Juan Pablo Sala · Tu cuenta · j…@gmail.com · Power Admin · Account override`, sin mutar prompts, engines, providers ni budgets. Evidencia: `artifacts/admin-web-prod-smoke/20260713-power-admin-account.png`.

## Update 2026-07-14: Configuration hub desplegado

Tras una crítica Impeccable de 17/40, JP eligió Configuration hub, Pi contextual y Profiles como primer slice. El corte separa Profiles/Engines/Prompts/Presets, oculta el rail Pi en Configuration, convierte Profiles en list-detail read-only y agrega `profileOptions` seguro al contrato Cloud. Elimina el falso `Guardar draft local` y evita montar catálogos fuera de su tab. JP luego confirmó que Overrides tenía poca utilidad con una sola plantilla cerrada: se ocultó el tab y la mutación por usuario, Groups quedó como targeting visible y los efectos legacy siguen solo read-only; backend/datos intactos. Checks: 446 pipeline, 99 Cloud, build y smoke mock verdes. Deploy: Worker `89ac13c1-6f30-4478-9670-ba54abe84cf7`; backups `/home/jpsal/.local/state/fixvox-admin-backups/configuration-hub-20260714-010506` y `hide-overrides-20260714-020057`. Health y Chrome production pasaron; cinco profiles, cuatro tabs y cero controles legacy, sin mutaciones. Evidencia: `artifacts/ui-spikes/admin-web-ui-smoke/20260714-015650/`. Track: `docs/tracks/fixvox-admin-configuration-hub.md`.

## Proximo Paso

Siguiente lote recomendado:

1. Smoke físico/live dedicado de `Alt+Q then <key>` para el nuevo chord nativo, y smoke Settings/Tauri de `Import Cloud defaults` consumiendo los presets ya publicados en producción.
2. Antes de ampliar parity, volver a `C:/dev/fixvox` para comparar comportamiento/copy/gaps de Settings, presets y picker.
3. Si se toca action hotkeys otra vez, correr `npm run action-hotkeys:physical-smoke -- -AllowDesktopSideEffects -StopExisting`.
4. Si hay friccion en Cloud/Presets Settings, corregir copy/estado local sin llamadas cloud reales nuevas salvo aprobacion; mantener errores e IDs redacted.
5. No reintroducir listas de alternativas para la hotkey principal; mantener un solo campo editable.
6. Si Settings vuelve a usar componentes HeroUI, importar estilos de forma selectiva y validar screenshot Tauri 720x480 antes de ampliar alcance.

## Guardrails

- No implementar autostart/Start with Windows sin confirmacion explicita.
- Editar hotkeys reales solo por la ruta host-owned existente: candidatos soportados, preview/check opcional, apply/save con rollback/verify y persistencia en app data; no captura ni registro desde renderer.
- No mostrar transcript raw ni selected text raw en Settings/History.
- No romper dock/companion special surfaces ni su no-focus behavior.
- Mantener la app Tauri real viva y actualizada cuando sea razonable para que JP pruebe Settings desde tray; usar preferentemente `npm run tauri:dev:hidden -- -StopExisting` desde Pi, y verificar `dictation-tauri.exe`/`Dictation Dock` antes de tocar UI, tray, hotkeys o ventanas nativas.

## Evidencia / Source Refs

- Visual aprobado: `artifacts/ui-spikes/heroui-settings/settings-dark-spike.png`.
- Checks usados en el spike:
  - `npm run build`
  - `npm run test:pipeline -- tests/voice-dock tests/desktop-control`
  - `cd src-tauri && CARGO_TARGET_DIR=target/pi-heroui-check cargo check`
- Nota: `cargo check` normal puede chocar con archivos en uso si `tauri:dev` esta vivo; usar target alternativo para validar sin matar la instancia.
