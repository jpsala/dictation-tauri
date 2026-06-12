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

## Principios Para Esta App

- Producto operativo, no landing page.
- Claridad de estado por encima de decoracion.
- Feedback visible para `idle`, `listening`, `transcribing`, `processing`, `delivering`, `completed`, `failed` y `cancelled`.
- Recovery claro cuando paste/delivery no sea confiable.
- Ventanas compactas, escaneables y usables en escritorio.
- Evitar UI generica de "AI SaaS".
- Accesibilidad: contraste, foco visible, reduced motion, textos que no desborden.

## Workflow Recomendado

1. Antes de construir UI, correr flujo `impeccable init` o equivalente para crear `PRODUCT.md`.
2. Crear o seedear `DESIGN.md`.
3. Para una superficie nueva, usar `impeccable shape <surface>` antes de codear si el alcance no esta claro.
4. Para implementar una superficie, usar `impeccable craft <surface>` o aplicar sus reglas durante el build.
5. Antes de cerrar una UI, usar `critique`, `audit` o `polish` segun el riesgo.
6. Verificar en browser/Tauri con capturas o checks visuales cuando haya app corriendo.

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
