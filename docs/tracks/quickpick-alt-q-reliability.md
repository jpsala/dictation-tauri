---
status: complete
started: 2026-07-21
updated: 2026-07-21
priority: high
owner: JP
related:
  - docs/topics/selection-and-assistant-actions.md
  - docs/topics/fixvox-dock-and-hotkeys-reference.md
topic: docs/topics/selection-and-assistant-actions.md
source_refs:
  - src-tauri/src/companion_window.rs
  - src-tauri/src/dock_shell.rs
  - src-tauri/src/desktop_control.rs
  - src-tauri/tauri.conf.json
  - src/App.tsx
  - tests/voice-dock/companion-window-host.test.ts
  - tests/voice-dock/companion-view.test.tsx
---

# QuickPick Alt+Q — Reliability

**Estado:** QP1 completo
**Decisión de aceptación:** JP retiró el smoke manual a DPI 150%; la cobertura automatizada es suficiente para cerrar este issue.

## Objetivo

Resolver issues del QuickPick de `Alt+Q` mediante cortes pequeños y verificables, sin mezclar cambios de presets, selección, delivery ni hotkeys que no sean necesarios para cada defecto.

QP1 cubrió un único issue. Los siguientes requieren reproducción y criterio de aceptación propios.

## QP-001 — Ventana fuera del monitor con DPI 150%

### Reproducción original

Con el escalado de Windows configurado en `150%`, al abrir `Alt+Q` la ventana aparecía desplazada hacia abajo y a la derecha, con la mayor parte debajo del alto visible del monitor.

La causa quedó confirmada y corregida: la ruta combinaba `outer_position()`/`outer_size()` físicos con `LogicalPosition` y no limitaba la ventana al `work_area` del monitor. La implementación actual calcula tamaño, separación y posición una sola vez en píxeles físicos, usa la escala del monitor del dock y aplica clamping al área de trabajo.

## Resultado implementado

- El QuickPick usa tamaño y posición físicos coherentes en el monitor del dock.
- La ventana queda centrada horizontalmente respecto del dock y limitada al `work_area`.
- El cálculo soporta escalas `100%`, `125%`, `150%` y `200%`.
- Los casos automatizados cubren borde superior/derecho, taskbar y monitores con origen X/Y negativo.
- Picker y monitor primario se usan sólo como fallbacks si no puede resolverse el monitor del dock.
- El lifecycle show/focus/hide permanece intacto.
- El runtime registra únicamente escala y bounds redacted para diagnóstico.

## No objetivos de QP1

- Rediseñar el picker o cambiar su tamaño lógico de `380×320`.
- Cambiar `Alt+Q`, chords, búsqueda, orden o persistencia de presets.
- Modificar la semántica con/sin selección ni el delivery al target guardado.
- Resolver otros issues de QuickPick todavía no registrados.

## Batch QP1 — complete

1. Se aisló un cálculo puro de tamaño/posición física.
2. Se resolvió monitor en orden: monitor del dock, monitor actual del picker y primario como último fallback.
3. Tamaño lógico y gap se convierten una sola vez; la ventana usa `PhysicalSize`/`PhysicalPosition` y clamping al `work_area`.
4. Se agregaron regresiones para escalas `1.0`, `1.25`, `1.5` y `2.0`, taskbar, bordes y origen negativo.
5. Se preservaron foco, cierre y contratos host/render existentes.

## Checks de cierre

```powershell
npm run test:pipeline -- tests/voice-dock/companion-window-host.test.ts tests/voice-dock/companion-view.test.tsx
npm run build
cd src-tauri && cargo test companion_window --quiet
cd src-tauri && cargo check --quiet
```

Resultado: 3 tests Rust y 13 tests Vitest pasan; build, Cargo check, diagnostics bloqueantes, context audit y `git diff --check` están verdes.

No se afirma que haya existido un smoke físico a DPI 150%. Por decisión explícita de JP, ese paso dejó de ser criterio de aceptación.

## Riesgos y stop conditions futuros

- No volver a mezclar coordenadas físicas de `outer_*` con setters lógicos.
- No convertir tamaño o posición más de una vez.
- No validar contra un monitor distinto del dock salvo fallback explícito.
- Respetar taskbar, `work_area` y orígenes negativos; no limitar contra `(0,0)` global.
- Cualquier defecto WebView/layout, hotkey, selección o delivery distinto del cálculo nativo se registra como issue separado.

## Done de QP-001

QP-001 está completo con implementación monitor-aware y cobertura automatizada de escala `1.5`, clamping y `work_area`.
