---
status: active
started: 2026-07-17
updated: 2026-07-17
priority: high
owner: JP/Pi
topic: standard-product-ux-redesign
related:
  - PRODUCT.md
  - DESIGN.md
  - docs/DECISIONS.md
  - docs/topics/ui-design-and-impeccable.md
  - docs/topics/app-design-loop.md
  - docs/tracks/settings-window-and-ui-foundation.md
  - docs/tracks/fixvox-tauri-cloud-release.md
  - docs/tracks/fixvox-product-first-self-hosted-contract-plan.md
source_refs:
  - src/settings/SettingsSurface.tsx
  - src/settings/fixvox-cloud-control.ts
  - src/settings/settings-heroui.css
  - src/App.tsx
  - src-tauri/src/fixvox_cloud.rs
  - admin/fixvox-web/public/app.js
  - admin/fixvox-web/public/styles.css
  - admin/fixvox-web/server.mjs
---

# Standard Product UX Redesign Plan

## Estado

**Batches 1–3 completos; Batch 4 en curso y bloqueado por calidad visual.**

La revisión integral del 2026-07-17 puntuó el sistema actual en **18/40**. El problema principal no es cosmético: dock, Settings, login/Cloud y Control Room presentan modelos mentales, vocabularios, densidades y patrones distintos. Una instalación nueva puede fallar en la acción principal con `requires a registered device id`, exponiendo infraestructura antes de que el usuario experimente valor.

Este track reemplaza como foco de producto UI el crecimiento incremental de `Settings Window Y UI Foundation`; ese track sigue siendo evidencia histórica y guardrail técnico. También pausa D-R2 del plan self-hosted hasta que Batch 1 defina el contrato visible que los contratos API deben servir.

## Routing Decision

- **Intent:** orquestar el plan completo por batches verificables.
- **Motor principal:** orquestación staged con una sola batch activa y writers seriales.
- **Perfil recomendado:** **Orquestación**, un agente owner que coordina alcance, implementación, review y evidencia.
- **Apoyos:** Impeccable, screenshots Tauri/browser, tests focales, Pi Lens y smokes controlados.
- **Heavy tools:** Taskflow, council, until-done o fan-out requieren opt-in explícito en la sesión de ejecución; el perfil Orquestación no los activa por sí solo.
- **Orden obligatorio:** contrato UX → tests provider-free → slice vertical → screenshots reales → hardening.
- **Gates externos:** OAuth real, deploy, producción, release y publicación son aprobaciones separadas.

## Decisión De Continuidad

Batch 3 quedó cerrado como slice local provider-free. La próxima sesión debe leer primero `docs/WORKING_MEMORY.md` y este track, mantener una sola batch activa y ejecutar **Batch 4 — Settings Simplification** con perfil **Implementador** y un único owner. Batch 4 conserva la frontera Desktop/Control Room, no toca OAuth real, provider, schema, producción ni reanuda D-R2 sin una reconciliación API explícita.

## Decisiones Cerradas

1. **Cuenta obligatoria antes del primer dictado.** No existe camino de uso normal anónimo en la UX objetivo.
2. **Google es el primer mecanismo de alta/login.** El primer login crea o vincula la cuenta y enlaza el dispositivo automáticamente; no hay formulario paralelo, invite ni `deviceId` visible.
3. **Control Room es un producto operador separado.** No forma parte de Settings ordinario y sólo se abre para identidades con capacidad administrativa.
4. **Rediseño fundacional.** Se replantean onboarding, IA, vocabulario, estados, Settings, auth y Control Room; no se limita a colores o componentes.
5. **Copy visible Spanish-first.** La estructura debe permitir i18n futuro, pero el producto actual no mezcla español e inglés en una misma experiencia.
6. **Infraestructura bajo Advanced.** IDs, host status, policy snapshot, preflight, runtime, rutas y repair internals sólo aparecen en diagnóstico avanzado y siempre redacted.
7. **El dock conserva su rol.** Sigue siendo una superficie compacta especial; el rediseño debe mantener compatibilidad de estado/acción sin convertirlo en panel de onboarding.

## Objetivo

Convertir Dictation Tauri y Fixvox Control Room en experiencias estándar, predecibles y separadas:

- una persona instala, crea/inicia sesión con Google, enlaza el dispositivo automáticamente, concede micrófono, configura o confirma el atajo y llega a **Listo para dictar** sin conocer arquitectura interna;
- Settings gestiona la aplicación y la cuenta con patrones desktop familiares;
- Control Room gestiona personas, acceso, comportamiento, uso y sistema como consola operativa separada;
- los estados de error y recuperación dicen qué ocurrió, qué puede hacer el usuario y qué se conserva, sin filtrar IDs, policies, rutas o detalles de proveedor.

## Done Criteria Global

El rediseño se considera listo para release sólo cuando:

1. Una instalación limpia completa `Welcome → Google → account/device linked → mic → shortcut → Ready` mediante fixtures provider-free y luego mediante un smoke real autorizado.
2. No existe ruta normal que muestre `deviceId`, `installId`, policy snapshot, preflight, host-owned, runtime interno o errores crudos.
3. Cada estado interactivo tiene una única acción primaria contextual; los estados automáticos no tienen CTA primaria y las acciones técnicas viven en diagnóstico avanzado.
4. Settings usa IA estándar y copy consistente: General, Cuenta, Dictado, Atajos, Presets, Privacidad, Ayuda y Avanzado.
5. Control Room usa IA por tareas: Personas, Planes y acceso, Comportamiento, Uso, Sistema avanzado y Auditoría.
6. Pi es asistencia contextual, no navegación primaria.
7. RBAC, recent-auth, preview, audit, capability enforcement y fail-closed se conservan o mejoran.
8. Texto funcional cumple como baseline 13–14 px, line-height ≥1.35, foco visible, teclado completo, contraste WCAG 2.2 AA y reduced motion.
9. Capturas reales de Tauri y browser pasan revisión Impeccable sin texto diminuto, cards anidadas, jerarquías duplicadas ni mezcla de idioma.
10. Tests, builds y smokes relevantes quedan verdes; release/publish sólo ocurre bajo autorización aparte.

## No Objetivos

- Rediseñar el dock más allá de compatibilidad, contraste y estados necesarios para onboarding/recovery.
- Definir pricing comercial, pagos, billing o packaging de planes.
- Migrar autoridad Cloudflare → VPS/PostgreSQL ni avanzar Checkpoint E de Spec 019.
- Eliminar inmediatamente soporte backend anónimo; primero se retira de la UX normal y luego se evalúa compatibilidad/rollback por contrato.
- Cambiar proveedores/modelos, cuotas productivas o profile assignments.
- Reescribir captura, STT, delivery, selección, hotkeys o clipboard salvo adaptación mínima al contrato UX aprobado.
- Hacer OAuth real, deploy cloud, mutaciones de producción, release, commit o push dentro del plan sin autorización separada.
- Introducir una nueva librería UI o dependencia antes de demostrar que CSS/componentes actuales no pueden cumplir el contrato.

## Modelo Objetivo De Producto

### Primer Uso

1. **Bienvenida** — propósito corto y CTA `Continuar con Google`.
2. **Cuenta** — browser OAuth host-owned; progreso visible y retorno seguro a la app.
3. **Vinculación** — account/device link automático; sin botones Repair/Refresh en el happy path.
4. **Micrófono** — permiso, selector si aplica y prueba corta sin provider.
5. **Atajo** — mostrar default, permitir cambiar/probar mediante ruta host-owned existente.
6. **Listo** — confirmación `Todo listo para dictar`, atajo visible y prueba guiada opcional.

Estados alternativos estándar: sin red, OAuth cancelado, cuenta no autorizada, state expirado, device binding conflict, policy unavailable, mic denegado y servicio temporalmente no disponible. Cada uno tiene un mensaje humano, una acción primaria y salida segura.

### Settings Desktop

- **General:** startup, dock y comportamiento general.
- **Cuenta:** identidad redacted, plan, límites comprensibles, dispositivos y cerrar sesión.
- **Dictado:** micrófono, audio, autocierre, cues y delivery visible.
- **Atajos:** recorder host-owned y conflictos.
- **Presets:** presets disponibles y controles permitidos por capability.
- **Privacidad:** tratamiento de audio/texto, historial y limpieza local.
- **Ayuda:** estado general, documentación y troubleshooting guiado.
- **Avanzado:** diagnóstico redacted, IDs abreviados/copiar diagnóstico seguro, policy/runtime técnico y Control Room sólo para admins.

`Cloud` deja de ser sección normal. En su lugar existe `Cuenta`; la infraestructura queda en Avanzado.

### Control Room Operador

- **Personas:** cuentas, dispositivos y acceso efectivo.
- **Planes y acceso:** capacidades, límites, grupos y asignaciones.
- **Comportamiento:** dictado, postprocess, selección, asistente y presets como comportamiento de producto.
- **Uso:** consumo, costos, cuotas y fallos operativos.
- **Sistema avanzado:** engines, prompts, IDs, health y configuración técnica.
- **Auditoría:** historial de mutaciones y evidencia.

Pi aparece como acción contextual `Analizar/Explicar con Pi` dentro de la entidad actual, no como sección `Chat` que compite con la navegación primaria.

## Contratos Que Deben Existir Antes De Código

Batch 1 debe fijar, como artefactos docs-only:

- `FirstRunState` y transiciones permitidas;
- matriz auth/account/device/policy con estado visible, CTA, retry y salida;
- frontera Desktop Settings vs Control Room;
- inventario de copy normal, warning, error y recovery;
- glosario visible y glosario técnico oculto;
- política de redacción por superficie;
- compatibilidad con el contrato product-first de Spec 019;
- eventos de analytics/telemetry permitidos, sólo contadores/estados redacted;
- criterios de aceptación visual, accesibilidad y ventanas.

## Batches Verificables

### Batch 1 — UX Contract And State Machine

**Estado:** completo el 2026-07-17.

**Receipt durable:** se cerraron `first-run-state-machine.md`,
`surface-boundaries.md`, `copy-and-error-contract.md` y
`acceptance-matrix.md` bajo `docs/tracks/standard-product-ux-redesign/`.
`PRODUCT.md` y `DESIGN.md` reflejan account-first, separación operador y
baseline tipográfico de 13 px / 1.35. La decisión es mantener D-R2 pausado:
la reconciliación define operaciones product-safe visibles, no schemas ni
runtime. Checks: `bun scripts/context-index.ts`,
`bun scripts/agent-context-audit.ts` (0 errores; warnings de tamaño de
contexto preexistentes), `git diff --check`, chequeo de whitespace de los
documentos untracked y Pi Lens sin errores. Riesgos vigentes: no exponer
tokens/IDs/policy en React, no duplicar Settings/Control Room y no avanzar
a OAuth, provider, schema o producción.

**Tipo:** docs-only, provider-free.

**Objetivo:** convertir las decisiones cerradas en contratos visibles antes de tocar runtime o UI.

**Entregables:**

- `docs/tracks/standard-product-ux-redesign/first-run-state-machine.md`.
- `docs/tracks/standard-product-ux-redesign/surface-boundaries.md`.
- `docs/tracks/standard-product-ux-redesign/copy-and-error-contract.md`.
- `docs/tracks/standard-product-ux-redesign/acceptance-matrix.md`.
- Actualización acotada de `PRODUCT.md` y `DESIGN.md` para account-first, separación operador y estándares tipográficos.
- Reconciliación explícita con D-R2: bootstrap/session/action contracts deben servir este flujo y no recrear la UI legacy.

**Checks:**

- Cada estado tiene trigger, estado visible, persistencia y redacción; los estados interactivos tienen una CTA primaria única y los automáticos no tienen CTA primaria.
- Happy path sin términos técnicos y con una sola acción principal por paso.
- Todos los estados alternativos listados tienen salida segura.
- Tabla de ownership: React, Tauri host, browser OAuth, Cloud y Control Room.
- `bun scripts/context-index.ts`.
- `bun scripts/agent-context-audit.ts`.
- `git diff --check`.

**Stop:** falta definir una salida segura; el contrato exige token en React; aparece una mutación productiva; o D-R2 no puede servir el flujo sin decisión API nueva.

**Receipt 2026-07-17:** completo. Los cuatro contratos fijan estados, ownership, copy, redacción, recovery y aceptación. `ready` exige permiso de micrófono y atajo configurado; los estados automáticos no presentan CTA primaria; salir preserva la fase host-owned incompleta; React recibe sólo una proyección redacted acotada. `PRODUCT.md` y `DESIGN.md` reflejan account-first y la separación Desktop/Control Room. D-R2 queda obligado a servir bootstrap/session/context, link idempotente, capability projection, runtime actions tipadas y dominios Control Room sin restaurar contratos legacy en React. Verificación: scan de copy normal sin términos prohibidos, context-index regenerado, context audit con 0 errores y 3 warnings preexistentes de tamaño, y `git diff --check` verde. No se tocó UI, runtime, OAuth, provider, schema ni producción.

### Batch 2 — Information Architecture And Wireframes

**Objetivo:** aprobar la arquitectura de Settings, onboarding y Control Room antes de componentes finales.

**Entregables:**

- Wireflows de primer uso, login cancelado/expirado, recovery y logout.
- Wireframes desktop de las ocho secciones de Settings.
- Wireframes Control Room de las seis áreas operativas.
- Mapa de navegación, labels, acciones primarias y progressive disclosure.
- Variante compacta para ventana Tauri y responsive browser para Control Room.

**Checks:**

- Impeccable `shape/critique` sobre wireframes.
- Máximo cinco opciones visibles por decisión; una primaria y hasta dos secundarias.
- Ninguna pantalla normal requiere recordar información de otra pantalla.
- JP aprueba dirección antes de código visual durable.

**Stop:** IA sigue organizada por entidades backend; Control Room y Settings duplican administración; o el wireflow obliga al usuario a reparar un estado normal.

**Receipt 2026-07-17:** completo. `first-run-wireflows.md` fija happy path, handoff/cancelación/expiración, recovery y logout; `information-architecture.md` fija el mapa de producto, navegación, wireframes de las ocho secciones de Settings y las seis áreas de Control Room, más variantes Tauri compacta y browser responsive. Las decisiones respetan una CTA primaria contextual, disclosure progresivo y separación Desktop/Control Room. Checks: revisión Impeccable del contrato/wireframes, `bun scripts/context-index.ts`, `bun scripts/agent-context-audit.ts` (0 errores; 3 warnings preexistentes de tamaño), `git diff --check` y Pi Lens sin errores. Riesgo vigente: Batch 3 debe conservar esa frontera, no exponer datos sensibles y seguir provider-free. No se tocó UI durable, runtime, OAuth, provider, schema ni producción.

### Batch 3 — Provider-Free Account-First Vertical Slice

**Objetivo:** implementar con TDD el flujo completo sin OAuth/provider real.

**Slice:** Welcome → Start Google handoff fixture → callback fixture → account/device auto-link fixture → policy fixture → mic fixture → shortcut → Ready.

**Archivos probables:**

- nuevos componentes bajo `src/onboarding/`;
- `src/App.tsx` sólo como composición/router de superficie;
- `src/settings/fixvox-cloud-control.ts` o reemplazo account-oriented;
- `src-tauri/src/fixvox_cloud.rs` para contrato host-owned;
- tests en `tests/onboarding/`, settings y Rust focal.

**Checks:**

- Test rojo primero por transición/estado.
- Cero network/provider en suite.
- Tokens y raw Google subject no cruzan a React.
- Device link automático e idempotente; binding conflict tiene recovery humano.
- `npm run test:pipeline -- tests/onboarding tests/settings tests/desktop-control`.
- `npm run build`.
- `cargo fmt --check && cargo check && cargo test --no-run`.
- Screenshot browser y Tauri fixture.

**Stop:** auth no puede fallar cerrado sin atrapar al usuario; se necesita OAuth real para probar lógica; o account/device link deja estado ambiguo.

**Receipt 2026-07-17:** completo. El slice local provider-free quedó aislado detrás de `?surface=onboarding`: `src/onboarding/account-first-flow.ts` implementa las transiciones redacted y fail-closed; `src/onboarding/OnboardingSurface.tsx` renderiza copy Spanish-first; `src/App.tsx` sólo compone la fixture; y `tests/onboarding/account-first-flow.test.tsx` cubre happy path, callback vencido, conflicto de vínculo e invariante de redacción. El link fixture es idempotente y no hace red, OAuth ni provider; React no recibe tokens, subject Google raw ni IDs raw. Checks: test rojo inicial, `npm run test:pipeline -- tests/onboarding tests/settings tests/desktop-control` (174/174), `npm run build`, `git diff --check` y Pi Lens focal sin errores. Screenshots verificadas: `artifacts/onboarding-smoke/20260717-124249/{browser,tauri}-onboarding-welcome.png`; el smoke Tauri nativo usó overlay temporal ignorado y terminó sus procesos. No hubo cambios Rust, por lo que no se corrieron checks Rust focales. Riesgo vigente: la fixture no es OAuth real ni cambia el routing normal; Batch 4 no debe exponer datos técnicos ni duplicar Control Room.

### Batch 4 — Settings Simplification

**Estado 2026-07-17:** completo por aceptación visual de JP. Se reemplazó el rail oscuro/inconsistente por una superficie clara, se retiró el tablist interno de General, las ocho secciones quedaron estables y General conserva sólo inicio/dock. Presets pasó a lista compacta con edición secundaria colapsada, sin routing técnico en la vista normal ni switches superpuestos. Archivos: `src/settings/SettingsSurface.tsx`, `src/settings/settings-heroui.css`, `src/settings/startup-launch-control.ts` y `tests/settings/settings-surface.test.tsx`. Checks: `npm run test:pipeline -- tests/settings tests/onboarding tests/desktop-control` (175/175), `npm run build` y `git diff --check`. La app Tauri arrancó para smoke visual; la automatización de captura no estuvo disponible, y JP aceptó el resultado visual. No hubo OAuth/provider/red/schema/producción.

**Objetivo:** convertir Settings en una superficie desktop estándar y reemplazar Cloud por Cuenta.

**Trabajo:**

- Implementar IA aprobada.
- Unificar copy Spanish-first.
- Mover diagnóstico técnico a Avanzado.
- Eliminar panel vacío `Current policy`, headings duplicados y acciones Repair/Refresh del happy path.
- Conservar recorder host-owned, capability gating, privacy y recovery.

**Checks:**

- Tests DOM por sección, capability y estado account-first.
- Fit real Tauri en tamaños objetivo, sin scroll accidental.
- Teclado, foco, contraste y reduced motion.
- Detector: sin body text <13 px en Settings y line-height ≥1.35.
- Impeccable critique/polish + screenshot real.

**Stop:** información técnica vuelve a ruta normal; se rompe hotkey host-owned; se expone transcript/selected text; o el layout sólo funciona en browser.

### Batch 5 — Control Room Separation And Task IA

**Objetivo:** convertir Control Room en producto operador separado y task-oriented.

**Trabajo:**

- Reemplazar navegación backend-first por Personas, Planes y acceso, Comportamiento, Uso, Sistema avanzado y Auditoría.
- Retirar Chat como nav primaria; Pi se vuelve contextual.
- Mantener list-detail donde reduzca cambios de contexto.
- Mantener IDs y entidades técnicas en Sistema avanzado.
- Preservar login Google admin, allowlist/RBAC, recent-auth, preview, audit y fail-closed.

**Checks:**

- Admin mock tests y `node --test admin/fixvox-web/server.test.mjs`.
- Matriz viewer/editor/publisher/owner sin regresión.
- Ninguna credencial backend llega al browser/Pi subprocess.
- Screenshots de People, Plans & Access, Behavior y Advanced.
- Detector sin nested cards en rutas primarias y sin texto funcional <13 px.

**Stop:** se debilita RBAC/audit; una tarea requiere conocer Profile/Engine/Prompt en modo normal; o Pi obtiene autoridad/mutación implícita.

### Batch 6 — Visual System Convergence

**Objetivo:** hacer que auth, Settings y Control Room pertenezcan a la misma familia sin borrar su distinta densidad.

**Trabajo:**

- Tokens compartidos de color, tipo, spacing, focus, botones, inputs, banners, empty/loading/error y navegación.
- Dock conserva excepción utility-overlay.
- Auth usa el mismo lenguaje de producto y no menciona fallback token salvo acceso de emergencia expandido.
- Remover tiny text, line-height estrecho, cards anidadas, eyebrows redundantes y títulos duplicados.

**Checks:**

- Actualización de `DESIGN.md` y catálogo de componentes.
- Comparación visual side-by-side.
- WCAG 2.2 AA, 200% zoom, teclado y reduced motion.
- Impeccable detector/critique sobre 3–5 vistas representativas.
- No dependencia nueva sin aprobación.

**Stop:** la convergencia fuerza el dock a un patrón genérico; baja densidad operativa útil; o se introduce una librería sólo por estética.

### Batch 7 — Hardening, Clean Install And Release Gate

**Objetivo:** probar el sistema completo antes de una release separadamente autorizada.

**Checks provider-free/local:**

- Matriz de onboarding y recovery completa.
- Suite full frontend + Rust + cloud contracts relevantes.
- Instalación limpia aislada sin `.env`.
- Estado inicial exige cuenta y dirige al onboarding, no a error técnico.
- Logout/relogin, reinicio entre pasos, OAuth cancel/expiry fixture, offline y binding conflict.
- Capturas Tauri/browser finales y critique ≥30/40 sin P0/P1 abiertos.

**Gates separados:**

- OAuth Google real.
- Link real de una cuenta/dispositivo de prueba.
- Provider real/dictado real.
- Build installer, publish prerelease y smoke en otra PC.

**Stop:** cualquier hash/evidencia contiene PII o contenido; SmartScreen/installer cambia sin revisión; OAuth real requiere nueva configuración productiva; o el flujo no recupera tras reinicio.

## Riesgos Y Mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Account-first aumenta abandono o bloquea offline | Onboarding corto, estado claro, retry persistente y medición redacted; no simular disponibilidad sin cuenta. |
| Login y device link quedan acoplados o ambiguos | State machine host-owned, idempotencia, una sola CTA y fixtures de restart/expiry/conflict. |
| Contradicción con D-R2/API product-first | Batch 1 fija contrato visible y D-R2 queda pausado hasta reconciliación explícita. |
| Se borra soporte anónimo demasiado pronto | Retirarlo primero de UX normal; backend queda como compat/rollback hasta batch contractual posterior. |
| Control Room pierde seguridad al simplificarse | RBAC, recent-auth, preview, audit y broker server-side son invariantes, no detalles visuales. |
| El rediseño se vuelve sólo cosmético | Cada batch tiene outcomes de tarea, state machines y checks funcionales antes del polish. |
| Settings vuelve a mezclar usuario y operador | Surface boundary documentada y tests de capability/visibilidad. |
| PII/secrets aparecen en account UI o evidencia | Redacción por contrato, IDs abreviados sólo en Advanced, fixtures sintéticos y scans. |
| `App.tsx`/`SettingsSurface.tsx` siguen creciendo | Extraer onboarding/account/sections por responsabilidad durante slices, sin refactor masivo previo. |
| Visual review sólo en browser | Cada batch durable de desktop exige screenshot Tauri real además de browser. |

## Stop Conditions Globales

Detener y reportar antes de continuar si:

- falta una decisión de producto que cambia el happy path visible;
- required auth no puede fallar cerrado sin atrapar al usuario;
- una instalación limpia no puede llegar a `Ready` con fixtures provider-free;
- el batch necesita OAuth/provider real, deploy, producción, schema, dependency o release sin gate nuevo;
- se debilitan RBAC, recent-auth, audit, capability enforcement, privacy o single-provider-call;
- React/browser recibe tokens, raw Google subject, raw account/device IDs, secrets, transcript, selected text o audio;
- Settings y Control Room vuelven a duplicar administración;
- el contrato UX contradice D-R2 y no hay ownership claro;
- una modificación ajena del working tree sería revertida o sobrescrita;
- los checks focales no convergen en dos intentos razonables.

## Checks Recurrentes

```powershell
npm run test:pipeline -- tests/onboarding tests/settings tests/voice-dock tests/desktop-control
npm run build
node --test admin/fixvox-web/server.test.mjs
npm run cloud:test
cd src-tauri && cargo fmt --check && cargo check && cargo test --no-run
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
git diff --check
```

Agregar por batch screenshots Tauri/browser, detector Impeccable y smokes explícitos. No correr provider/OAuth/prod/release sin autorización.

## Reversibilidad

- Batches 1–2 son docs/wireframes y totalmente reversibles.
- Batch 3 debe quedar detrás de routing/feature boundary local hasta que el flujo completo pase.
- Settings puede migrar sección por sección manteniendo el shell anterior durante desarrollo.
- Control Room cambia IA sobre contratos existentes; no elimina endpoints ni datos en el mismo batch.
- Soporte backend anónimo, rutas legacy y fallback token no se eliminan junto con el rediseño visible; su retiro requiere un plan contractual separado.
- Cada batch debe poder revertirse sin migración de datos ni reparación productiva.

## Siguiente Batch

**Batch 4 — Settings Simplification**.

Perfil **Implementador**, un agente owner y una sola batch activa. Empezar por tests DOM provider-free de Cuenta, Avanzado y capability gating antes de migrar UI durable. No toca OAuth real, provider, schema, producción ni reanuda D-R2 sin una reconciliación API explícita.
