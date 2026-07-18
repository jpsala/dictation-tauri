---
status: active
started: 2026-07-17
updated: 2026-07-18
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

**Batches 1–7 completos local/provider-free. Batch 7 cerró el contrato host-owned, router explícito, matriz de recovery y evidencia visual Tauri válida; deploy y validación productiva siguen como gates externos separados.**

La revisión integral del 2026-07-17 puntuó el sistema actual en **18/40**. El problema principal no es cosmético: dock, Settings, login/Cloud y Control Room presentan modelos mentales, vocabularios, densidades y patrones distintos. Una instalación nueva puede fallar en la acción principal con `requires a registered device id`, exponiendo infraestructura antes de que el usuario experimente valor.

Este track reemplaza como foco de producto UI el crecimiento incremental de `Settings Window Y UI Foundation`; ese track sigue siendo evidencia histórica y guardrail técnico. También pausa D-R2 del plan self-hosted hasta que Batch 1 defina el contrato visible que los contratos API deben servir.

## Routing Decision

- **Intent:** ejecutar el plan por batches verificables.
- **Motor principal:** manual staged, una sola batch activa y un único writer owner.
- **Perfil recomendado:** **Implementador**, que coordina alcance, implementación, review y evidencia.
- **Apoyos:** Impeccable, screenshots Tauri/browser, tests focales, Pi Lens y smokes controlados.
- **Heavy tools:** Taskflow, council, until-done o fan-out requieren opt-in explícito en la sesión de ejecución; el perfil Orquestación no los activa por sí solo.
- **Orden obligatorio:** contrato UX → tests provider-free → slice vertical → screenshots reales → hardening.
- **Gates externos:** OAuth real, deploy, producción, release y publicación son aprobaciones separadas.

## Decisión De Continuidad

Batch 7 ya cuenta con una proyección durable, versionada y redacted de setup/readiness propiedad del host Tauri, pero no puede cerrar instalación limpia ni routing account-first hasta conectarla a la composición de React. La próxima sesión debe leer primero `docs/WORKING_MEMORY.md` y este track, mantener una sola batch activa y, con perfil **Implementador** y un único owner, conectar ese boundary sin cambiar el routing por defecto hasta que los checks provider-free de clean install/restart estén listos. No introducir persistencia renderer-side; no autoriza deploy, OAuth real, provider, schema, producción, installer, publish ni limpieza legacy.

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

**Estado 2026-07-17:** en curso. El corte 1 reemplazó la navegación primaria backend-first por seis áreas públicas: Personas, Planes y acceso, Comportamiento, Uso, Sistema avanzado y Auditoría. Pi quedó contextual y Auditoría usa el feed read-only real. Worker production quedó saludable en `06a0c7bc-b1c5-4f39-9141-e807e2727675`; Admin Web VPS quedó sincronizado y saludable. La operación real demostró que el modelo durable de drafts no es confiable ni simple: la UI y la autoridad discreparon, aparecieron `profile draft not found`, estados stale y feedback tardío. La lectura BFF de profiles ya se corrigió para usar `/admin/control-plane/profiles`, pero JP decidió **retirar drafts del flujo normal por completo**. Esta decisión supersede “borrador simple”. **Batches 5A–5C están completos provider-free.** 5A añade `apply-profile` bajo lock Durable Object con historia inmutable/audit; 5B limita el BFF a OAuth reciente y `publisher|owner` sin credenciales ni actor browser-side; 5C reemplaza el editor de drafts por candidate local, revisión/diff e inline apply atómico.

**Corte local cerrado:** **Batch 5E — Verification And Deployment Gate** completó sus checks provider-free. El deploy/health/OAuth real sigue siendo un gate externo separado. Próximo batch local: **Batch 6 — Visual System Convergence**.

**Perfil recomendado:** **Implementador**, manual staged, un único owner. Worker lock/store, BFF y Admin UI tienen dependencias seriales y hotspots compartidos; Orquestación sólo aporta valor como review final, no como writers paralelos.

#### Batch 5A — Direct Profile Apply Contract

**Objetivo:** agregar una única operación atómica `apply-profile` que reciba una definición candidata y publique una nueva versión inmutable sin crear, guardar, previsualizar ni descartar drafts.

**Archivos probables:**

- `cloud/fixvox-proxy/src/control-plane-store.ts`;
- `cloud/fixvox-proxy/src/control-plane-publish-lock.ts`;
- `cloud/fixvox-proxy/src/index.ts`;
- `cloud/fixvox-proxy/src/control-plane-publish-lock.test.ts`;
- tests focales de store/managed execution.

**Contrato:** payload con `profileId`, `expectedActiveVersion`, `definition`, confirmación técnica y actor server-owned. Bajo el Durable Object lock debe revalidar versión, normalizar referencias, agregar exactamente una versión `published`, avanzar `activeVersion`, registrar exactamente un audit y confirmar la proyección. No persiste estado intermedio. Un draft legacy del mismo profile sólo puede eliminarse dentro de una aplicación exitosa; ante cualquier fallo permanece intacto.

**Checks:** aplicación válida crea una versión/audit; stale e invalid references producen cero writes; retry idéntico es idempotente; crashes en fronteras mantienen autoridad; ningún draft nuevo aparece.

**Stop:** no puede garantizarse atomicidad, historia inmutable o cero writes ante fallo; hay que debilitar el lock; hace falta provider/producción; o limpiar datos legacy para probar.

**Receipt 2026-07-17:** completo. Se añadieron `ControlPlaneAdminProfileApplyPayload` y `applyControlPlaneAdminProfile` en `cloud/fixvox-proxy/src/control-plane-store.ts`; la acción `apply-profile` en `control-plane-publish-lock.ts`; y `POST /admin/control-plane/profiles/apply` protegido con capacidad `publish` en `index.ts`. Tests focales actualizados: store valida versión/normalización/cero writes; lock valida idempotencia y recovery tras crash; managed execution valida RBAC, lock unavailable y actor fallback server-owned. `bun test src/control-plane-store.test.ts src/control-plane-publish-lock.test.ts src/managed-execution.test.ts` pasó con 96 tests y `git diff --check` quedó verde. El diagnóstico LSP de Worker sigue sin tipos Cloudflare/Bun cargados y con errores preexistentes ajenos a este corte; los tests focales pasaron. Riesgo vigente: 5B debe derivar/sobrescribir actor en el BFF y mantener la credencial publish fuera del browser.

#### Batch 5B — Protected Admin BFF

**Objetivo:** exponer `POST /api/admin/profiles/apply` hacia `/admin/control-plane/profiles/apply` sin filtrar credenciales ni autoridad al browser.

**Archivos:** `admin/fixvox-web/server.mjs`, `admin/fixvox-web/server.test.mjs`.

**Invariantes:** Google OAuth reciente; sólo `publisher|owner`; actor derivado server-side; credential publish sólo server-side; stale/error redacted y tipado. Viewer/editor reciben 403 antes del broker.

**Checks:** `node --check`, server tests, credential isolation y actor overwrite.

**Stop:** browser/Pi necesita credential, actor o raw error; recent-auth/RBAC se debilita; endpoint no puede distinguir stale de error transitorio.

**Receipt 2026-07-17:** completo provider-free en `admin/fixvox-web/server.mjs` y `admin/fixvox-web/server.test.mjs`. Se añadió `POST /api/admin/profiles/apply` con OAuth reciente, `publisher|owner`, actorKey derivado/sobrescrito y credencial `ADMIN_PUBLISH_API_KEY` limitada al broker BFF → Worker. Los errores stale/transitorios se mapean a contratos redacted tipados; viewer/editor no invocan el broker. Checks: `node --check admin/fixvox-web/server.mjs`, `node --test admin/fixvox-web/server.test.mjs` (12/12) y `git diff --check` verdes. No se tocaron UI, Worker, producción, OAuth/RBAC global, provider, schema, datos legacy, deploy, commit ni push. Riesgo vigente: 5C debe conservar este límite de autoridad, no persistir draft local y no emitir requests antes de Aplicar.

#### Batch 5C — Renderer-Local Profile Editor

**Objetivo:** eliminar drafts del flujo normal de Control Room. `Editar cambios` clona la definición publicada sólo en memoria; `Revisar cambios` muestra diff/impacto; `Aplicar cambios` abre un panel inline propio y realiza un único POST atómico.

**Trabajo:**

- estado local con `profileId`, `expectedActiveVersion`, original, candidate y dirty;
- tabs editables de nombre, Acceso, Runtime, Límites y Controles;
- `Cancelar edición`, `Revisar cambios`, `Aplicar cambios`;
- feedback inline pending/success/error y aviso de que refresh pierde cambios locales;
- retirar del flujo normal create/save/discard/preview draft, labels `draft`, prompts/alerts nativos y llamadas `/profiles/drafts`;
- ocultar clone hasta tener creación atómica sin drafts.

**Checks browser mock:** editar no hace red; cancelar restaura; revisar muestra diff; aplicar emite un POST; stale recarga autoridad; teclado/foco/reduced motion; texto ≥13 px; viewer/editor sin edición.

**Stop:** la UI persiste estado intermedio; hay request antes de Aplicar; error usa alert/prompt; el cambio requiere limpiar drafts productivos.

**Receipt 2026-07-17:** completo provider-free en `admin/fixvox-web/public/app.js`, `admin/fixvox-web/public/styles.css` y `scripts/admin-web-profile-editor-smoke.mjs`. `Editar cambios` clona la versión publicada en memoria; tabs de nombre/Acceso/Runtime/Límites/Controles actualizan sólo el candidate local; Cancelar lo descarta; Revisar muestra diff e impacto local; la confirmación inline emite exactamente un `POST /api/admin/profiles/apply`. El stale redacted recarga autoridad y muestra feedback inline. El flujo UI ya no llama `/profiles/drafts`, no expone clone ni usa prompts/alerts para la mutación. Checks: smoke headless local cubre cero apply antes de confirmación, apply y stale; `node --test admin/fixvox-web/server.test.mjs` (12/12), `node --check` app/server, `git diff --check`, LSP sin errores y Pi Lens sin findings. No hubo Worker, OAuth real, provider, producción, deploy, schema, limpieza de drafts, commit ni push. Riesgo vigente: 5D sólo aísla legado read-only; no debe borrar drafts ni reintroducirlos en la ruta normal.

#### Batch 5D — Legacy Draft Isolation

**Objetivo:** sacar drafts existentes del camino normal sin borrarlos automáticamente. Inventariar read-only profile/version, ignorarlos en UI y mantener endpoints legacy sólo como compatibilidad temporal.

**Limpieza posterior:** descartar drafts legacy requiere operación versionada bajo lock, evidencia y gate productivo separado. Nunca limpiar durante deploy ni al cargar la página.

**Receipt 2026-07-17:** completo provider-free. `admin/fixvox-web/server.mjs` proyecta sólo perfiles publicados hacia `/api/admin/policies` y expone el inventario redacted, read-only y RBAC-gated `GET /api/admin/profiles/legacy-drafts` (`profileId`, versión draft y base), sin borrar ni mutar drafts. `admin/fixvox-web/public/app.js` filtra defensivamente registros sin publicación, por lo que la UI normal no muestra ni consume drafts legacy aunque una respuesta upstream los incluya. `scripts/admin-web-profile-editor-smoke.mjs` siembra un draft sólo en el mock local y confirma que se inventaría pero no aparece en la UI. Compatibilidad de `POST|PUT|DELETE /api/admin/profiles/drafts` y preview permanece intacta y fuera de la ruta normal. Checks: `node --test admin/fixvox-web/server.test.mjs` (12/12), smoke headless local, `node --check` focal, `git diff --check`, LSP sin errores y Pi Lens sin findings. No hubo cambios Worker, OAuth real, provider, schema, producción, deploy, limpieza legacy, commit ni push.

#### Batch 5E — Verification And Deployment Gate

**Checks locales:**

```powershell
cd cloud/fixvox-proxy
bun test src/control-plane-publish-lock.test.ts
bun test src/control-plane-store.test.ts
bun test src/managed-execution.test.ts
cd ../../
node --check admin/fixvox-web/public/app.js
node --check admin/fixvox-web/server.mjs
node --test admin/fixvox-web/server.test.mjs
npm run cloud:test
git diff --check
```

**Browser mock:** no aparece ni se consume draft; edición local; diff; confirmación inline; exactamente un apply; RBAC y Pi contextual sin regresión.

**Deploy, gate separado:** Worker primero, health/version; Admin VPS después, tests/restart/health; browser productivo read-only. Una aplicación real controlada y la limpieza legacy son autorizaciones productivas separadas. Mantener disponibles rollback Worker y backup branch/stash VPS.

**Done criteria 5A–5E:** cero drafts creados por el flujo normal; una aplicación produce una sola versión y audit; stale/errores producen cero writes; no prompts nativos; browser sin autoridad; Worker/VPS sanos. Batch 5 sólo cierra además con copy/task IA, screenshots requeridos, matriz RBAC y accesibilidad visual.

**No objetivos:** migrar Cloudflare a VPS/PostgreSQL; editar providers/modelos/cuotas reales; borrar historia; borrar drafts automáticamente; cambiar OAuth/RBAC/audit; crear perfiles nuevos antes de un contrato atómico específico; desplegar durante 5A–5C.

**Receipt 2026-07-17 (5E local):** el test de recuperación tras crash `after-profile-projection` se corrigió para afirmar primero el rechazo fail-closed de la proyección parcial y luego el retry mediante el lock. Sólo cambió `cloud/fixvox-proxy/src/control-plane-publish-lock.test.ts`; no cambió runtime. Checks: test aislado 1/1; Worker focal 97/97 (`control-plane-publish-lock`, `control-plane-store`, `managed-execution`); Admin BFF 12/12; smoke browser local exit 0; `npm run cloud:test` exit 0; `git diff --check` verde. LSP no reportó diagnósticos pero tuvo timeouts parciales; Pi Lens conserva cinco hallazgos preexistentes de `JSON.parse` fuera del hunk correctivo. Riesgos/gates: no debilitar fail-closed ni el lock; deploy, health remoto, OAuth real, provider, producción y limpieza legacy requieren autorización separada.

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

**Estado:** completo el 2026-07-17, local y provider-free.

**Objetivo:** hacer que auth, Settings y Control Room pertenezcan a la misma familia sin borrar su distinta densidad.

**Receipt 2026-07-17:** se documentó el catálogo compartido en `DESIGN.md`; onboarding, Settings y Control Room adoptaron los roles `--product-*` para superficie, tinta, borde, acento y foco. Archivos relevantes: `src/onboarding/onboarding.css`, `src/settings/settings-heroui.css`, `admin/fixvox-web/public/styles.css`, `admin/fixvox-web/public/app.js` y `tests/settings/admin-configuration-hub.test.ts`. El test legacy de Configuration se alineó al contrato Batch 5C: candidate renderer-local, un `apply` atómico y sin crear/guardar/descartar/clone de drafts en la ruta normal. La revisión visual detectó que `Sistema avanzado → Perfiles` no activaba `admin-wide` porque la vista usa el renderer `policies`; se corrigió sin tocar RBAC, BFF ni datos. Evidencia local redacted: `artifacts/visual-system-convergence/20260717-batch-6/{onboarding,settings,control-room-profiles-fixed}.png`. Checks: onboarding/settings 49/49, `npm run build`, `npm run visual:check` 8/8, smoke local del editor de perfiles, `node --check` Admin y `git diff --check` verdes. El detector Impeccable sólo reporta la advertencia conocida de Inter; LSP conserva un hint no bloqueante en Admin y la configuración TypeScript sigue sin tipos Node para el test que importa `node:fs`. No hubo dependencia nueva, OAuth real, provider, deploy, producción, schema, limpieza legacy, commit ni push.

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

**Receipt 2026-07-17 (corte bloqueado):** se ampliaron las fixtures provider-free en `src/onboarding/account-first-flow.ts` y `src/onboarding/OnboardingSurface.tsx`, con tests en `tests/onboarding/account-first-flow.test.tsx`, para cubrir `checking`/resume, cancelación y expiry OAuth, offline, autorización, policy/service temporal, binding conflict y permiso de micrófono denegado. Checks: onboarding/settings/desktop-control 179/179, `npm run build` y `git diff --check` verdes; no hubo OAuth, provider, installer, release, publish ni smoke físico. El cierre de Batch 7 queda bloqueado: `src-tauri/src/fixvox_cloud.rs` persiste instalación/dispositivo/policy, pero no una fase de setup redacted/versionada; `App.tsx` sólo muestra onboarding por `?surface=onboarding` y el routing por defecto sigue en dock. No cambiar ese default ni usar `localStorage`, porque podría atrapar usuarios listos o violar ownership host-owned. Riesgo vigente: el producto aún no puede demostrar clean install account-first ni recuperación durable entre reinicios.

**Checkpoint 2026-07-17:** se reconfirmó el bloqueo sin editar runtime ni UI. La inspección focal de `src/App.tsx` y `src-tauri/src/fixvox_cloud.rs` confirma la ausencia de una proyección host-owned, redacted y versionada de setup/readiness; por tanto no se ejecutaron checks de implementación. Decisión: no cambiar el routing dock por defecto ni introducir persistencia renderer-side. OAuth, provider, installer y release permanecen gated.

**Receipt 2026-07-17 (contrato host-owned):** el corte previo quedó completo local/provider-free. `src-tauri/src/fixvox_cloud.rs` persiste `fixvox-setup-readiness.v1.json` con `schemaVersion: 1` y fase redacted; `get_fixvox_setup_readiness` devuelve únicamente `{ schemaVersion, phase, ready, redacted }`, migra contexto legacy local signed-in a `ready` y convierte estado corrupto/desactualizado o `ready` sin contexto vigente a `service_unavailable`. `src/onboarding/tauri-setup-readiness.ts` valida y reduce la proyección antes de React. Checks: onboarding 11/11, Rust focal 4/4, `cargo fmt --check`, `cargo check`, `npm run build` y `git diff --check` verdes.

**Receipt 2026-07-17 (corte router account-first):** completo local/provider-free. `src/App.tsx` extrae `DockSurface` y mantiene el routing default en dock; únicamente `?surface=onboarding` dentro de Tauri usa `src/onboarding/SetupReadinessRouter.tsx`. El router consulta la proyección host-owned mediante el adapter redacted: mientras carga muestra `checking`, sólo `ready` compone dock y cualquier otra fase compone onboarding; payload inválido o fallo de invoke termina en `service_unavailable`. No agrega `localStorage`, red, OAuth, provider ni acciones host reales. `tests/onboarding/setup-readiness-router.test.tsx` cubre checking, ready, fase incompleta y fallo/payload inválido sin campos sensibles. Checks: `npm run test:pipeline -- tests/onboarding tests/settings tests/desktop-control` (185/185), `npm run build` y `git diff --check` verdes; Pi Lens no reportó errores, sólo warnings preexistentes de complejidad en `src/App.tsx`. Riesgo vigente: Batch 7 sigue abierto; falta demostrar clean-install/restart provider-free y no debe promoverse este route explícito a default ni conectarse acciones reales sin validar esa ruta segura.

**Receipt 2026-07-17 (clean-install/restart y recovery):** completo local/provider-free en `tests/onboarding/setup-readiness-router.test.tsx`. La matriz confirma que una instalación limpia (`welcome`) y un reinicio en `shortcut_setup` quedan en la ruta explícita de onboarding; también cubre offline, cancelación/expiración OAuth fixture, no autorizado, binding conflict, policy no disponible, micrófono denegado y servicio no disponible. Sólo `ready` puede resolver dock y las proyecciones permanecen redacted. Checks: onboarding/settings/desktop-control 187/187, `cargo test setup_readiness --lib` 3/3, `npm run build`, `git diff --check` y Pi Lens sin findings. Decisión: mantener el routing default en dock; no conectar acciones host reales ni introducir OAuth, provider, red, `localStorage`, installer o publicación. Riesgo vigente: Batch 7 sigue abierto; falta el cierre provider-free aislado sin `.env`, las suites/capturas finales y la critique antes de cualquier gate externo.

**Receipt 2026-07-17 (cierre provider-free, bloqueado):** no hubo cambios funcionales. El LSP focal no reportó diagnósticos; onboarding/settings/desktop-control pasó 187/187; `cargo fmt --check`, `cargo check`, `cargo test setup_readiness --lib` (3/3), `cargo test --no-run`, `npm run cloud:test`, `npm run build`, `npm run visual:check` (8/8) y `git diff --check` pasaron. La suite frontend completa quedó en 469/471 por dos regresiones externas al corte: el inventario de contratos no tiene fixture para `POST /admin/control-plane/profiles/apply` en `cloud/fixvox-proxy/src/index.ts`, y `tests/voice-dock/companion-view.test.tsx` sigue buscando `loadSelectionPresetStore()` dentro de un slice de `App.tsx` que ya no lo contiene. Decisión: no modificar routing, ownership ni runtime durante la verificación ni reparar esos contratos sin un nuevo corte explícito. Riesgo vigente: no declarar release-ready mientras la suite completa no sea verde; preservar los cambios ajenos de Cloud y dock.

**Receipt 2026-07-17 (reconciliación de contratos de suite):** completo, provider-free y sin cambios de runtime, routing ni ownership. `tests/cloud-contract/fixtures.ts` incorpora `admin-profile-apply` para `POST /admin/control-plane/profiles/apply`, con capability `publish`, setup aislado y payload de confirmación. `tests/voice-dock/companion-view.test.tsx` caracteriza el flujo de transcripción dentro de `DockSurface`, donde reside tras la extracción account-first, en vez de asumirlo dentro de `App`. Checks: focal 14/14 y suite frontend completa 471/471 (92 archivos), más `git diff --check` verde. Decisión: la reconciliación es sólo de contratos/test; preservar RBAC, recent-auth, lock, historia/audit inmutables, credencial publish server-side, cero requests antes de Aplicar y fail-closed. Riesgo vigente: Batch 7 no es release-ready hasta completar capturas Tauri/browser y critique final; no promover el router a default, ni conectar acciones host reales, OAuth/provider, installer o publicación.

**Receipt 2026-07-17 (preflight/deploy operativo separado):** la fixture `admin-profile-apply` quedó corregida para construir una definición válida desde un draft aislado en `cloud/fixvox-proxy/src/contract-runner.test.ts`; `npm run cloud:test` pasó. Con autorización explícita se desplegó el Worker `8eaa128e-0b8d-4f85-a996-58827ce46854` y `GET /health` respondió OK. El sync de Admin de sólo `server.mjs`, `public/app.js` y `public/styles.css` entró en rollback por un probe inmediato; el servicio y health público se recuperaron, y los hashes live coinciden con el backup remoto. Se agregó `scripts/admin-web-deploy.ps1`, fail-closed sin `-ConfirmProduction`, con backup, sync limitado, readiness retry de 30 s y rollback verificable. No se reintentó Admin. Esto no cambia el scope ni el siguiente corte de Batch 7; un futuro deploy Admin requiere gate explícito separado.

**Receipt 2026-07-17 (capturas finales y critique, bloqueado):** se capturaron las vistas browser provider-free bajo `artifacts/standard-product-ux-redesign/batch-7-final/` y el detector sobre `src/onboarding/OnboardingSurface.tsx` no reportó hallazgos. La captura nativa de `Dictation Dock` mediante `PrintWindow` produjo una imagen negra de WebView (`tauri-dock-ready.png`), por lo que no constituye evidencia visual válida. La revisión focal además confirmó un P1: `Salir` aparece en `welcome`, pero `runSecondary()` no resuelve esa fase. No se editó código ni se promovió routing; se preservaron cambios ajenos. Checks: suites onboarding/settings/voice-dock/desktop-control 257/257, `npm run build`, `npm run visual:check` 8/8, LSP/Pi Lens sin errores nuevos y `git diff --check` verde. Próximo corte explícito: corregir la salida de onboarding y establecer captura Tauri válida sin cambiar runtime, routing ni ownership. OAuth, provider, installer, deploy y release siguen gated.

**Receipt 2026-07-17 (cierre Batch 7 provider-free):** `Salir` ahora cierra la ventana Tauri mediante el boundary existente y preserva la fase host-owned incompleta; no redirige al dock. El harness aislado `scripts/tauri-onboarding-visual-smoke.ps1` y `scripts/tauri-onboarding-capture.mjs` usa perfil temporal, CDP y viewport `780×600`, sin `PrintWindow`, para capturar el onboarding real. La evidencia válida es `artifacts/standard-product-ux-redesign/batch-7-final/tauri-20260717-210448/tauri-onboarding-welcome.png`, con reporte redacted de `780×600`, CTA/heading visibles y muestreo no negro. Archivos relevantes: `src/App.tsx`, `src/onboarding/OnboardingSurface.tsx`, `src/onboarding/SetupReadinessRouter.tsx`, `tests/onboarding/account-first-flow.test.tsx` y los dos harnesses. Checks: onboarding/settings/voice-dock/desktop-control 258/258, `npm run build`, `npm run visual:check` 8/8 y `git diff --check` verdes; Pi Lens sin hallazgos accionables nuevos. Decisión: conservar `Salir → cerrar`, routing default dock y ownership host-owned. Riesgos/gates restantes: OAuth real, link real, provider/dictado real, installer, publicación y smoke en otra PC requieren autorización separada.

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

**Batch 7 — Hardening, Clean Install And Release Gate** está **completo local/provider-free**, con perfil **Implementador** y un único owner. El diagnóstico posterior confirmó que el wrapper de arranque Tauri funciona; no hay batch de implementación local activa. El siguiente batch requiere autorización explícita para reanudar únicamente el smoke OAuth real y debe detenerse antes de login, cuenta o mutación. Mantener el resto de gates externos separados.

**Checkpoint 2026-07-18:** se confirmó el cierre local y se bloqueó correctamente la continuidad sin editar runtime, UI ni contratos. Archivos relevantes preservados: `src/App.tsx`, `src/onboarding/OnboardingSurface.tsx`, `src/onboarding/SetupReadinessRouter.tsx`, `tests/onboarding/account-first-flow.test.tsx`, `scripts/tauri-onboarding-visual-smoke.ps1` y `scripts/tauri-onboarding-capture.mjs`. La evidencia/checks del cierre local siguen siendo onboarding/settings/voice-dock/desktop-control 258/258, `npm run build`, `npm run visual:check` 8/8 y `git diff --check` verdes; este checkpoint no ejecutó checks ni modificó archivos de producto. Decisión: mantener routing default dock, ownership host-owned y `Salir → cerrar`; no promover el router a default ni reanudar D-R2. Riesgo/gate: cualquier avance requiere elegir y autorizar explícitamente un único gate externo; preservar los cambios ajenos ya presentes en el working tree.

**Receipt 2026-07-18 (gate OAuth real, bloqueado):** JP autorizó exclusivamente el gate OAuth real. El preflight confirmó que `src/settings/SettingsSurface.tsx` llama el boundary host-owned `startFixvoxCloudLogin(true)` y espera un retorno redacted; no se expusieron URL, state, tokens, subject, email ni IDs. Existe `.env`, pero `FIXVOX_BACKEND_BASE_URL` y `FIXVOX_AUTH_SESSION_PATH` no estaban presentes en los ámbitos Process/User/Machine. Dos arranques acotados de `scripts/start-tauri-dev-hidden.ps1` no dejaron proceso Tauri/WebView ni `tauri-dev.log`; no se hicieron más reintentos ni se cerraron procesos ajenos. `git diff --check` pasó. No hubo cambios de código, configuración, cuenta, OAuth, link de dispositivo, producción, deploy, commit ni push. **Próximo corte:** autorizar un batch de diagnóstico/integración del arranque Tauri, o iniciar manualmente la app y volver a autorizar el smoke OAuth; no implementar un bridge OAuth nuevo dentro de este gate.

**Receipt 2026-07-18 (diagnóstico de arranque Tauri):** completado como batch único, local y reversible. `scripts/start-tauri-dev-hidden.ps1` inició correctamente `npm run tauri:dev`: el log redacted `artifacts/live-app/batch-8-startup-diagnostic/tauri-dev.log` confirmó Vite, `cargo run` y `dictation-tauri.exe`. El árbol de procesos iniciado por el batch se cerró al finalizar, sin detener procesos ajenos. No se modificó código ni configuración; tampoco hubo OAuth, login, cuenta, red externa, deploy, commit ni push. Checks: parse PowerShell del script y `git diff --check` verdes (sólo warnings CRLF preexistentes). Decisión: el fallo previo no se reprodujo; conservar el wrapper actual y no inventar un bridge OAuth. Riesgo: el smoke OAuth real sigue siendo un gate externo y debe autorizarse en un batch separado; verificar únicamente el handoff host-owned y detenerse antes de login o mutación de cuenta.

**Receipt 2026-07-18 (smoke OAuth handoff):** completado como batch externo único y acotado, con autorización explícita. Tauri inició en un perfil aislado y Settings → Cuenta mostró `Continuar con Google`; al activarlo, el boundary host-owned abrió el navegador y devolvió el estado redacted esperado (`Browser opened`). El batch se detuvo antes de interactuar con Google, iniciar sesión, crear/vincular cuenta o ejecutar mutaciones. No se editaron código ni configuración. El árbol Tauri propio fue cerrado al final; los artefactos redacted viven bajo `artifacts/live-app/batch-9-oauth-handoff-isolated/`. Checks: parse de `scripts/start-tauri-dev-hidden.ps1` y `git diff --check` verdes (warnings CRLF preexistentes). Decisión: el handoff host-owned está verificado; no crear un bridge OAuth. Riesgo/gate siguiente: completar OAuth o link de cuenta exige una autorización explícita nueva, un batch separado y límites claros para identidad y mutaciones.

**Receipt 2026-07-18 (OAuth + link de prueba):** completado como batch externo único con autorización explícita para OAuth y vínculo automático. En un perfil Tauri aislado, la identidad de prueba completó Google manualmente; la app mostró únicamente el estado redacted de cuenta conectada, dispositivo vinculado y policy/access listos. No se inspeccionó ni capturó la pantalla OAuth, ni se registraron URL, tokens, email, IDs o transcripciones. El único efecto autorizado fue el link automático que ejecuta el poll host-owned; no hubo provider, dictado, Admin, reparación, deploy, código ni configuración. El árbol Tauri propio fue cerrado; evidencia redacted bajo `artifacts/live-app/batch-10-oauth-link-isolated/`. Checks: parse de `scripts/start-tauri-dev-hidden.ps1`, `git diff --check` y verificación de árbol propio detenido, verdes (warnings CRLF preexistentes). Decisión: OAuth y link quedan validados sin bridge nuevo. Riesgo/gate siguiente: provider/dictado real, installer, publicación y smoke en otra PC siguen siendo autorizaciones separadas; no ejecutar ni repetir login/link automáticamente.
