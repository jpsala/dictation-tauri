---
id: app-design-loop
status: active
kind: how-to
triggers:
  - design loop
  - app design
  - UI polish
  - screenshot Playwright
  - Impeccable
  - accounts
  - admin web
  - settings
  - dock
  - companion
  - onboarding
  - public UI
primary_refs:
  - PRODUCT.md
  - DESIGN.md
  - docs/topics/ui-design-and-impeccable.md
  - docs/topics/fixvox-local-to-production-workflow.md
  - docs/tracks/fixvox-admin-web-pi-chat.md
  - docs/tracks/settings-window-and-ui-foundation.md
  - C:/dev/constelaciones/apps/web/src/routes/admin.pi.tsx
---

# App Design Loop

Runbook corto para mejorar cualquier superficie visual de Dictation Tauri/Fixvox sin perder el método validado por JP.

Aplica a Admin Web, Accounts, Settings, dock, companion/recovery, onboarding, picker, public/admin web y cualquier pantalla de producto. Ajustar la referencia visual y los checks según la superficie.

## Regla

Para cambios visuales/UX importantes, usar este loop antes de declarar la pantalla lista:

1. Partir de `PRODUCT.md`, `DESIGN.md`, `docs/topics/ui-design-and-impeccable.md` y el topic/track activo de la superficie.
2. Trabajar primero local/mock/sandbox cuando exista, sin Worker/Pi/VPS reales ni side effects productivos:

   ```bash
   npm run admin:web:local -- -Mock
   ```

   Para Tauri/dock/settings, usar app real local cuando sea razonable y respetar gates de side effects.
3. Capturar screenshot real antes y después con Playwright/browser/CUA/Tauri según corresponda.
4. Comparar contra la referencia visual cuando exista. Para Admin Pi, contrastar con Constelaciones; para dock/hotkeys, contrastar con la referencia Fixvox; para Settings, respetar dirección HeroUI/dark aprobada.
5. Usar criterio Impeccable/product-register para detectar slop: jerarquía, densidad, claridad operativa, copy, accesibilidad, estados y fit con el producto.
6. Si la estructura de layout sigue dudosa, pedir segunda opinión/council neutral y aplicar solo recomendaciones convergentes.
7. Implementar en small batches.
8. Validar con smoke/build/tests y guardar evidencia visual.
9. Documentar decisiones durables en este topic o en el track activo antes de deploy/publicación.

## Herramientas Usadas

- **Mock/local sandbox**: usar fixtures o modo mock cuando exista; para Admin Web: `npm run admin:web:local -- -Mock`.
- **Playwright/browser/CUA screenshots**: evidencia antes/después en `artifacts/...`.
- **Impeccable/product-register**: criterio de diseño para evitar UI genérica, rails vacíos, KPIs decorativos, jerarquía floja y AI slop.
- **Council/segunda opinión**: opcional cuando hay dudas de layout; formular pregunta neutral y buscar desacuerdos/recomendaciones convergentes.
- **Smokes versionados**: preferir scripts existentes de la superficie (`admin:web:smoke`, dock/settings/desktop-control smokes, browser smokes, etc.).
- **Checks base**:

  ```bash
  npm run build
  npm run test:pipeline
  ```

  Agregar checks específicos de la superficie.

## Criterios Por Superficie

- **Admin Web / Accounts**: header acorde a vista activa, master-detail/table-first, datos primarios legibles, Pi secundario, sin rail técnico vacío ni KPIs decorativos, acciones con preview/confirmación.
- **Settings**: ventana compacta, dark theme denso/calmo, secciones claras, controles no prometidos como read-only/placeholder honesto, foco visible.
- **Dock / Companion / Recovery**: estado operacional claro, compacto, sin robar foco, dots/VU/chips legibles, recovery honesto cuando delivery no es confiable.
- **Picker / Quick Chat / Assistant surfaces**: interacción rápida, teclado primero, one-shot cuando corresponda, no dejar estado visual residual.
- **Onboarding / login / public-ish UI**: pocos pasos, copy claro, estados de error/retry, no exponer infraestructura.

## Evidencia Canónica

- Primer Accounts aprobado visualmente por JP: `artifacts/admin-web-local-test/20260630-160110/accounts-local-3001.png`.
- Smoke asociado: `artifacts/ui-spikes/admin-web-ui-smoke/20260630-190016/report.json`.
- Settings dark spike aprobado: `artifacts/ui-spikes/heroui-settings/settings-dark-spike.png`.
- Evidencia extendida por superficie vive en los tracks activos, especialmente `docs/tracks/fixvox-admin-web-pi-chat.md` y `docs/tracks/settings-window-and-ui-foundation.md`.

## Guardrails

- No deploy, push, tunnel, systemd, production mutations ni side effects reales sensibles sin aprobación explícita.
- No imprimir tokens, emails completos fuera de UI admin autenticada/mock, account IDs crudos, device IDs completos, transcripts, selected text ni audio.
- No declarar paridad visual sin comparación real de screenshot/comportamiento.
- No instalar herramientas nuevas de diseño/regression sin decisión explícita; por ahora SuperDesign/Lost Pixel no son parte del loop base.
