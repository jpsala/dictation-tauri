---
status: active
updated: 2026-07-25
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
