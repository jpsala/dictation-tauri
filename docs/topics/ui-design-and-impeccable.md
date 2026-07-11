---
id: ui-design-and-impeccable
status: active
kind: how-to
triggers:
  - UI
  - diseño
  - design
  - frontend
  - React
  - app shell
  - voice dock
  - settings
  - impeccable
primary_refs:
  - PRODUCT.md
  - DESIGN.md
  - docs/skills/impeccable/SKILL.md
  - docs/topics/product-direction.md
  - docs/topics/dictation-workflow.md
  - docs/topics/fixvox-dock-and-hotkeys-reference.md
  - docs/topics/app-design-loop.md
---

# UI Design E Impeccable

## Regla

Usar la skill local `docs/skills/impeccable` para trabajos de interfaz: app shell, voice dock, settings, onboarding, estados, recovery, preview, empty states, error states, responsive layout, accesibilidad, polish y auditoria visual.

No usarla para decidir arquitectura nativa, captura de audio, hotkeys globales, permisos/capabilities, model routing, proxy, storage o Rust backend.

## Estado Actual

La skill esta instalada en `docs/skills/impeccable`.

Contexto inicial creado:

- `PRODUCT.md`: register, usuarios, proposito, personalidad, anti-referencias y principios.
- `DESIGN.md`: direccion visual, tokens, layout, componentes, motion y accesibilidad.
- `.impeccable/design.json`: sidecar del sistema visual para herramientas live/design.
- `.impeccable/live/config.json`: live mode configurado para `index.html` en Vite.

`impeccable` exige `PRODUCT.md`; ya existe y define register `product`.

## Superficies Probables

- App shell principal.
- Voice dock / estado de dictado.
- Preview o recovery de salida.
- Settings.
- Result/history si se decide.
- Picker o Quick Chat si entran mas adelante.
- Onboarding/mic check si entra en producto.

## Decision UI Foundation 2026-06-25

Para ventanas normales de producto, la direccion aceptada es **HeroUI v3** sobre React/Vite/Tauri:

- Usar HeroUI para Settings, History, Presets, Devices y About/Debug.
- Mantener dock, companion compacta y overlays/recovery cercanos al dock como superficies especiales custom React/CSS + shell Rust/Tauri, no como HeroUI generico.
- El spike dark aprobado por JP esta en `artifacts/ui-spikes/heroui-settings/settings-dark-spike.png` y el trabajo retomable en `docs/tracks/settings-window-and-ui-foundation.md`.
- Mantine queda como fallback seguro/productivo si HeroUI fricciona; shadcn/Park UI quedan como referencia, no base inicial, porque implican ownership alto de design system.
- Tailwind v4 debe estar cableado con `@tailwindcss/vite`; sin ese plugin, los estilos HeroUI pueden no procesar `@apply` correctamente y verse rotos/grandes.

Criterio visual para esta app: dark theme denso, calmo, operacional, con acento coral/Burnt Signal moderado; evitar look generico de AI SaaS.

## Principios Para Esta App

- Producto operativo, no landing page.
- Claridad de estado por encima de decoracion.
- Feedback visible para `idle`, `arming`, `listening`, `transcribing`, `processing`, `delivering`, `completed`, `failed` y `cancelled`.
- Recovery claro cuando paste/delivery no sea confiable.
- Ventanas compactas, escaneables y usables en escritorio.
- Para voice dock y dictation key, usar `docs/topics/fixvox-dock-and-hotkeys-reference.md` como referencia de producto: dock flotante compacto, VU/dots, chips de estado, companion de recovery y semantica hold/tap.
- Evitar UI generica de "AI SaaS".
- Accesibilidad: contraste, foco visible, reduced motion, textos que no desborden.

## Workflow Recomendado

1. Antes de construir UI, correr flujo `impeccable init` o equivalente para crear `PRODUCT.md`.
2. Crear o seedear `DESIGN.md`.
3. Para una superficie nueva, usar `impeccable shape <surface>` antes de codear si el alcance no esta claro.
4. Para implementar una superficie, usar `impeccable craft <surface>` o aplicar sus reglas durante el build.
5. Antes de cerrar una UI, usar `critique`, `audit` o `polish` segun el riesgo.
6. Verificar en browser/Tauri con capturas o checks visuales cuando haya app corriendo.

## Workflow Settings / Diseño 2026-06-25

Decision de JP: de ahora en adelante, cualquier trabajo de diseño durable, o cuando JP lo pida, debe usar este flujo asistido **Impeccable + v0 + screenshot real** antes de cerrar implementacion:

1. Capturar screenshot limpio del estado real de la superficie, preferentemente Tauri si la UI vive en desktop.
2. Preparar prompt acotado para v0 con contexto, constraints y no-go explícitos. Para Settings: desktop settings compacto, dark, Fixvox-like, sidebar + alcance funcional minimo.
3. Usar el output de v0 como direccion, no como codigo a pegar sin criterio.
4. Pasar la variante por criterio Impeccable `critique`/`polish`: jerarquia, densidad, contraste, copy, IA, accesibilidad, fit con `PRODUCT.md`/`DESIGN.md` y anti-slop.
5. Implementar manualmente en los archivos del producto, manteniendo componentes/convenciones locales.
6. Validar con screenshot real, detector/checks relevantes y feedback JP antes de ampliar alcance.

Para Settings actual, el alcance sigue siendo **solo secciones + Hotkeys read-only**. No agregar nuevos settings ni editar hotkeys reales hasta diseñar re-registro nativo.

## Workflow App/UI 2026-06-30

Para cualquier superficie visual importante, usar el loop validado por JP antes de cerrar direccion visual. El runbook corto vive en `docs/topics/app-design-loop.md`.

1. Partir de `PRODUCT.md`/register y contexto del topic/track activo.
2. Capturar screenshot Playwright/browser/CUA/Tauri real de la superficie.
3. Comparar side-by-side contra la referencia visual cuando exista; para admin Pi, contrastar con Constelaciones; para dock/hotkeys, con Fixvox; para Settings, con la direccion aprobada.
4. Usar Impeccable/product-register y, si aporta, opinion independiente/council para detectar slop antes de ampliar alcance.
5. Preferir superficies operativas tipo producto: jerarquia acorde a la tarea, datos primarios legibles, herramientas Pi como ayuda secundaria, sin rail tecnico vacio, sin KPIs decorativos y con estados/recovery honestos.
6. Guardar evidencia visual en `artifacts/...` y documentar decisiones durables en el track activo.

## Gotcha Live / Tauri 2026-06-26

No activar Impeccable live sobre el `index.html` compartido de Dictation Tauri salvo que el agente quede corriendo `live-poll.mjs` y se limpie al terminar con `live-server.mjs stop`. Ese `index.html` sirve dock, settings y companion; inyectar `live.js` puede contaminar el dock con la barra/picker de Impeccable y dejar la pagina en `Generating variants...` si ningun agente esta polleando. Para diseño durable de superficies Tauri, preferir screenshot real + prompt v0 + critique/polish + implementacion manual. Si se usa live, hacerlo en una pagina/superficie aislada o limpiar de inmediato los markers `impeccable-live`, `impeccable-variants` y `impeccable-carbonize`.

## Gotcha HeroUI / React Aria 2026-06-28

Aprendido por web research al corregir Settings:

- HeroUI v3 es **CSS-first**: `@heroui/styles` es un paquete CSS standalone; `@heroui/react` es comportamiento. No hace falta provider JS para theme basico y no hay plugin HeroUI de Tailwind v4. Fuente: <https://heroui.com/en/docs/react/releases/v3-0-0> y <https://heroui.com/en/docs/react/migration/styling>.
- No importar `@heroui/styles` completo si la superficie no usa componentes HeroUI reales. La doc de v3 permite imports selectivos (`base`, `themes/default`, `components/button.css`, etc.); cargar el paquete completo dentro de una ventana Tauri compacta puede demorar el first paint y meter defaults de componentes que no se usan. Fuente: <https://heroui.com/en/docs/react/releases/v3-0-0>.
- En HeroUI v3, overrides van por `className`, BEM classes y CSS variables/data attributes; `classNames` de v2 ya no aplica. Fuente: <https://heroui.com/en/docs/react/migration/styling> y <https://v3.heroui.com/docs/handbook/styling>.
- Tabs/nav basados en React Aria deben separar claramente `selectedKey`/estado seleccionado de `disabledKeys`/`isDisabled`. Si una seccion debe poder navegarse aunque no tenga controles finales, no marcarla disabled: renderizar un panel placeholder o disabled visual propio. Fuente: <https://react-aria.adobe.com/Tabs>.
- Para Settings actual, mantener CSS local escopado; si se vuelven a introducir componentes HeroUI, importar solo los estilos de componentes realmente usados y validar con screenshot Tauri 720x480.

## Primer Uso Sugerido

Despues de cerrar `PRODUCT.md` y `DESIGN.md`:

1. Abrir spec MVP 1 para pipeline simulado automatizable.
2. Usar `impeccable shape app shell` o `impeccable shape voice dock` antes de implementar la primera superficie durable.
3. Antes de cerrar UI, usar `impeccable critique`, `audit` o `polish` segun riesgo.

## Decision De Timing

`PRODUCT.md` y `DESIGN.md` ya fueron inicializados despues del pase de alcance MVP y antes de la primera UI durable.

Permitido antes de eso:

- Scaffold tecnico minimo.
- Ventana base verificable.
- UI placeholder sin decisiones visuales durables.

No permitido antes de eso:

- App shell real.
- Voice dock real.
- Preview/recovery UI.
- Settings UI.
- Picker, Quick Chat o Assistant surfaces.

El registro de producto esperado para `PRODUCT.md` es `product`: la interfaz sirve a una tarea operativa de escritorio, no a una landing page.
