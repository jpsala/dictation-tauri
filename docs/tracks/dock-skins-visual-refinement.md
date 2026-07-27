---
status: active
updated: 2026-07-27
priority: medium
execution_route: balanced
topic: docs/topics/fixvox-dock-and-hotkeys-reference.md
---

# Dock Skins Visual Refinement

## Objetivo

Mejorar `wispr-flow` por comparación visual iterativa sin alterar `classic-7`, la lógica compartida de dictado ni las garantías nativas del dock.

## Baseline Retomable

- `classic-7`: snapshot estable de `164x42` con 7 dots.
- `compact-5`: variante de `132x36` con 5 dots.
- `wispr-flow`: activo localmente; idle `98x32`, hover `72x32`, recording `125x36` con cápsula interior `102x33`, 11 barras VU `1..13px` y processing `98x32` sin chip textual.
- Selector contextual y persistencia local `dockSkin` listos; cloud sigue fuera de alcance.
- Evidencia: `artifacts/desktop-control/dock-skins/`; snapshot anterior: `artifacts/desktop-control/dock-compact-height/`.

## Cierre Del Lote Funcional — 2026-07-25

- `VoiceDock` mantiene una sola implementación compartida para las tres skins; el selector contextual/tray persiste `dockSkin` localmente.
- El shell nativo y el renderer comparten los IDs exactos `classic-7`, `compact-5` y `wispr-flow`; Rust los serializa explícitamente para evitar que Classic/Compact queden con dimensiones de otra skin.
- `Stop & submit` vuelve a estar disponible en las tres skins: el icono `↵` queda junto a `Stop & review`; en Wispr la disposición es cancelar izquierda, enter al centro y stop derecha.
- Contratos verificados: UI focal 21/21, preferencias Rust 3/3, shell Rust 19/19 y `npm run build` correcto.

## Checkpoint — Menú Contextual Y Recovery — 2026-07-27

- El menú contextual/tray queda reducido a un único toggle `Show dock`,
  `Settings`, submenús `Dock skin` y `Presets`, y `Quit Dictation Tauri`.
- `Dock skin` contiene Classic 7, Compact 5 y Wispr Flow; `Presets` contiene
  los cuatro presets activos actuales.
- El chip flotante `Review ready` deja de persistir; la recuperación sigue en
  el dock principal para no ocultar ni reenviar texto incierto.
- Settings fuerza `index.html#settings` al reutilizar su WebView, evitando que
  una navegación previa de onboarding quede atrapada dentro de Settings.
- Prerelease publicado desde `2430e9a`:
  `fixvox-tauri-v0.1.0-20260727165806`. Installer y checksum remoto coinciden
  en SHA-256 `30efe46ec7fd773481dc309644cf4ca5cbe3829a05bdc5399d3d2b1fbb4781b8`.
  Descarga:
  `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260727165806/Fixvox-Tauri-Setup.exe`.

## Batch Urgente — Regresión Mixed-DPI — 2026-07-27

- Reproducción disponible sólo en la PC del trabajo: al mover el cursor del monitor inferior al superior con DPI 150%, el dock aparece por milisegundos y luego queda invisible. Esa PC ya tiene el installer `fixvox-tauri-v0.1.0-20260727194108` (`c2d07cb`). JP pidió evitar por ahora el costo de bisect e instrumentación física allí.
- Control negativo validado en la PC actual: dos monitores 1920x1080 a escala normal. Probe Win32 de 100 muestras movió el cursor al segundo monitor; HWND pasó de `(874,1002,1006,1038)` a `(2814,1002,2946,1038)` en 100 ms y permaneció `visible=true` en todas las muestras.
- La auditoría descartó una regresión nativa del 27 de julio: entre `94d324d` y `c2d07cb` no cambió la geometría ni el watcher. El status chip `Ready`, el account gate y la semántica de delivery pueden alterar contenido React, pero ninguno explica una falla determinista sólo al cruzar escalas.
- Causa más probable: deuda latente del watcher multi-monitor agregado en `1c8a4f9` el 17 de julio. `follow_cursor_monitor_if_needed` hacía un único `SetWindowPos` con posición y tamaño ya escalado para el monitor destino. Al cruzar 100%↔150%, Windows emite `WM_DPICHANGED`; Tao 0.35.3 procesa ese mensaje con otro `SetWindowPos`, mientras Wry 0.55.1 reajusta el child WebView2 en `WM_SIZE`. En 100%↔100% esa ruta doble no existe, consistente con el control negativo.
- Patch local: el cruce de escala ahora se detecta explícitamente. Sólo en ese caso se mueve primero el HWND con `SWP_NOSIZE`, dejando que Tao complete `WM_DPICHANGED`; después se reaplican tamaño físico, región, no-activate/topmost y un nudge de ancho `+1 → exacto` con `SWP_FRAMECHANGED` para forzar `WM_SIZE`/bounds de WebView2. Los cruces con igual DPI conservan la ruta previa de un solo paso.
- La fuente canónica Fixvox respalda el mecanismo de recovery: `recoverBlankDockVisual` reaplica estilo/hit region/topmost y hace un frame nudge; su utilidad genérica `window-repaint-nudge.ts` también usa ancho `+1 → exacto` para despertar WebView2.
- Checks locales: `cargo fmt --check`, 22 tests `dock_shell`, 2 de tray, 3 de preferencias, `cargo check`, 23 tests Vitest focales, `npm run build` y `git diff --check` pasan. El gate de release repitió 47 archivos/260 tests, frontend, Rust fmt/check/test compile y NSIS; persisten sólo warnings `dead_code` preexistentes.
- JP aceptó la evidencia indirecta para publicar una build de validación. Source `3d6bd5f`; prerelease `fixvox-tauri-v0.1.0-20260727204131`; installer unsigned `29,584,179` bytes. SHA-256 local, publicado y redescargado: `f745060a0b738a0d88af569fe946a20a82124cc92a340f76948fdb1db9d0f1bb`. Descarga: `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260727204131/Fixvox-Tauri-Setup.exe`.
- Estado: build publicada para validar en la PC afectada; todavía no afirmar cierre mixed-DPI hasta probar el cruce físico 100%↔150%.

## Batch 1 — Wispr Flow Visual Refinement

1. Capturar idle, hover, recording y processing del Tauri real sin mover ni rediseñar otras skins.
2. Comparar contra las capturas Wispr entregadas por JP y ajustar sólo geometría, borde, offsets, transición y sensibilidad visual del VU.
3. Usar el harness Playwright por fase antes de cualquier smoke físico; micrófono/hotkey real requieren confirmación.
4. Verificar selector de skin, persistencia tras reinicio, resize nativo y ausencia de recortes.

## Límites

- No tocar cloud, perfiles remotos, provider, delivery, onboarding ni Settings.
- No duplicar componentes por skin; extender `DockSkinDefinition` y CSS scoped por `data-skin`.
- No cambiar `classic-7` salvo corrección de regresión demostrada.
- No portar todavía el tooltip grande de Wispr mediante una ventana adicional.

## Checks Mínimos

```powershell
npm run test:pipeline -- tests/voice-dock/voice-dock-parity.test.tsx tests/settings/user-preferences-control.test.ts tests/desktop-control/tauri-host-control.test.ts
npm run visual:check -- tests/visual/app-smoke.spec.ts
npm run build
cd src-tauri && cargo test dock_shell::tests tray::tests user_preferences::tests --lib
```

Cerrar con capturas lado a lado y feedback explícito de JP sobre la skin activa.
