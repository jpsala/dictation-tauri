---
status: pending
started: 2026-07-24
updated: 2026-07-24
priority: high
owner: JP
related:
  - PRODUCT.md
  - DESIGN.md
  - docs/tracks/standard-product-ux-redesign/copy-and-error-contract.md
  - docs/topics/selection-and-assistant-actions.md
  - docs/topics/ui-design-and-impeccable.md
topic: docs/topics/ui-design-and-impeccable.md
source_refs:
  - src/App.tsx
  - src/voice-dock/visual-semantics.ts
  - src/voice-dock/companion-state.ts
  - src/voice-dock/VoiceDock.tsx
  - src/styles.css
  - src/settings/SettingsSurface.tsx
  - src/settings/fixvox-cloud-control.ts
  - src/onboarding/OnboardingSurface.tsx
  - src/pipeline/ui-result.ts
  - tests/voice-dock/voice-dock-ui.test.tsx
  - tests/voice-dock/companion-view.test.tsx
---

# User-Facing Error Experience Review

## Objetivo

Revisar y rediseñar cómo Dictation Tauri comunica errores, bloqueos y estados de recuperación para que la experiencia se vea intencional, ordenada y coherente con el producto. El usuario debe entender qué pasó, qué se conservó y qué puede hacer, sin leer detalles internos ni encontrarse con una ventana genérica o desprolija.

## Problema Observado

El incidente de selection transform del 2026-07-24 terminó en una companion grande con `Review only`, copy genérico y acciones que no correspondían al fallo real. Aunque el comportamiento fail-closed preservó el texto, la presentación:

- mezcló inglés con una experiencia Spanish-first;
- priorizó el estado técnico antes que el resultado para el usuario;
- no explicó con claridad que el texto seleccionado seguía intacto;
- mostró recuperación genérica y llegó a ofrecer `Paste last (safe)`, acción peligrosa para una instrucción dictada;
- se sintió como una salida de diagnóstico, no como una parte diseñada del producto.

El problema puede repetirse en dictado, delivery, selección, cuenta, permisos, conexión, presets, Quick Chat y onboarding si cada superficie decide título, detalle y acciones por separado.

## Alcance

1. Inventariar todos los errores y recoveries visibles en Dock, Companion, Settings, Onboarding, Preset Picker y Quick Chat.
2. Clasificarlos por impacto para el usuario, no por módulo técnico:
   - no se capturó voz;
   - no se pudo procesar;
   - no se cambió el texto;
   - no se pudo insertar;
   - acceso o configuración pendiente;
   - conexión temporalmente no disponible.
3. Definir una anatomía común:
   - resultado o estado principal;
   - explicación breve;
   - qué se conservó o no cambió;
   - una acción primaria contextual;
   - secundaria sólo cuando sea segura;
   - diagnóstico técnico redacted bajo disclosure opcional.
4. Unificar copy Spanish-first, tono, iconografía, color, espaciado, jerarquía y tamaño de la superficie.
5. Diseñar variantes compactas para warning, error recuperable, delivery incierto y bloqueo de cuenta/configuración.
6. Separar explícitamente contenido recuperable de acciones de delivery para que una instrucción nunca se trate como resultado insertable.
7. Validar accesibilidad: foco, teclado, `aria-live`, contraste, lectura sin color y textos largos sin clipping.

## Fuera De Alcance Inicial

- Cambiar proveedores, políticas, cuotas o contratos cloud.
- Mostrar códigos, rutas, IDs, policies, modelos o payloads crudos en la experiencia normal.
- Rediseñar todo el Dock o Settings fuera de los estados de error y recuperación.
- Agregar una dependencia visual nueva.
- Ejecutar smokes reales de micrófono, selección, clipboard, provider o producción sin gate explícito.

## Principios De Diseño

- **El resultado primero:** `El texto seleccionado no cambió` es mejor que `Review only`.
- **Una causa humana, no infraestructura:** explicar el efecto sin mencionar backend, policy o provider.
- **Recovery seguro:** una sola acción primaria; no ofrecer acciones que puedan pegar el contenido equivocado.
- **Densidad compacta:** la companion debe ocupar sólo el espacio requerido por el mensaje y las acciones.
- **Consistencia:** mismo vocabulario y jerarquía para errores equivalentes en todas las superficies.
- **Diagnóstico progresivo:** detalle técnico sólo en Avanzado o reporte redacted, nunca como título principal.
- **Estado honesto:** distinguir resultado disponible, paste enviado, paste verificado y texto sin cambios.

## Entregables

1. Inventario `estado actual → problema → resultado esperado → acción segura`.
2. Matriz de severidad y recovery por superficie.
3. Contrato actualizado de copy y anatomía visual.
4. Wireframes compactos para los casos críticos.
5. Tests de semántica y acciones prohibidas.
6. Screenshots Tauri reales o fixtures visuales de cada variante antes de aprobar implementación.
7. Plan de implementación en small batches con rollback local.

## Done Criteria

- Ningún error normal usa `Review only`, `provider`, `policy`, `preflight`, códigos o términos internos como explicación principal.
- Todos los mensajes visibles son Spanish-first y responden: qué pasó, qué quedó intacto y qué hacer.
- Cada estado tiene como máximo una acción primaria y ninguna acción secundaria riesgosa.
- Selection transform fallido nunca ofrece paste-last de la instrucción.
- Delivery enviado, delivery verificado y delivery incierto mantienen semánticas distintas.
- Companion y Dock se ven compactos y coherentes en screenshots reales, sin clipping ni espacio vacío injustificado.
- Navegación por teclado, foco visible, `aria-live` y contraste pasan revisión WCAG 2.2 AA.
- Tests focales, build, LSP y revisión visual quedan verdes antes de cualquier release.

## Proximo Paso

Hacer una auditoría docs/UI provider-free de todos los strings y estados visibles, empezando por Dock + Companion. Capturar las variantes actuales con fixtures, marcar P0/P1/P2 y presentar primero el contrato de experiencia propuesto. No editar implementación hasta que JP apruebe esa dirección visual y de copy.

## Evidencia Inicial

- Screenshot reportado por JP: companion `Review only` después de selection transform rechazado.
- `docs/tracks/standard-product-ux-redesign/copy-and-error-contract.md` ya define Spanish-first, una acción primaria y ocultamiento de términos internos; esta track debe cerrar la brecha entre ese contrato y las superficies reales.
- El hardening local del incidente eliminó paste-last para selection failure y agregó un estado específico, pero sigue pendiente una revisión integral y una release posterior.
