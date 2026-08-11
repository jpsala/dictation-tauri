---
id: fixvox-minimal-reliability-and-truthfulness
status: complete
phase: local-complete-production-gated
kind: implementation-track
updated: 2026-08-11
triggers:
  - settings se colgó
  - auditoría de pantallas
  - presets no disponibles
  - correcciones no cargadas
  - atajos internos
  - omp no listo
  - personas filtros
primary_refs:
  - PRODUCT.md
  - DESIGN.md
  - src-tauri/src/settings_window.rs
  - src/settings/SettingsSurface.tsx
  - src/personal-vocabulary/PersonalVocabularySettings.tsx
  - admin/fixvox-web/public/app.js
  - scripts/admin-web-deploy.ps1
  - scripts/omp-release-provision.ps1
---

# Fixvox Minimal Reliability And Truthfulness

## Objetivo

Corregir los hallazgos de mayor impacto de la auditoría con **dos
implementaciones locales** y **un cierre operativo separado**, sin introducir
arquitectura, dependencias, migraciones ni superficies nuevas.

Éste es un recorte deliberado. El orden de prioridad es:

1. impedir la recarga riesgosa de Settings al reabrirla;
2. hacer que Settings muestre estados y copy verdaderos;
3. desplegar el Control Room ya implementado y recuperar OMP sólo mediante los
   runbooks existentes y gates explícitos.

## Alcance mínimo acordado

### Implementación 1 — reapertura estable de Settings

- Un cambio de runtime en `src-tauri/src/settings_window.rs`.
- Una actualización del contrato existente en
  `tests/settings/settings-window-host.test.ts`.
- Un smoke nativo acotado de reapertura y recreación.

### Implementación 2 — Settings honesto

- Consolidar en los componentes existentes:
  - reset del scroll al cambiar de sección;
  - estados exclusivos de Presets;
  - Atajos en español sin plan interno de host;
  - carga/error/vacío honestos en Correcciones.
- Actualizar únicamente tests existentes y la línea de navegación durable en
  `DESIGN.md`.

### Cierre operativo — sin nueva implementación

- Verificar que búsqueda y filtros de Personas ya funcionan en el source actual.
- Bajo aprobación productiva separada, desplegar el Admin actual mediante su
  broker atómico existente.
- Diagnosticar y recuperar `fixvox-omp-auth-broker.service` mediante el unit y
  los comandos existentes; no escribir un reemplazo.

## Fuera de alcance

Se difieren expresamente:

- single-instance y cualquier plugin/dependencia nueva;
- rediseño general de Settings o extracción de componentes;
- cambio global de marca Fixvox/Dictation;
- rediseño del dock;
- paginación o búsqueda server-side de Personas;
- servicio, fallback, retry daemon o proveedor OMP nuevo;
- reactivación de Pi legacy, `PI_CHAT_BIN` o Trusted Owner;
- hardening de botones contextuales de OMP mientras el servicio está caído;
- deploy, commit, push o producción sin autorización explícita en la sesión de
  ejecución.

## Phase 0 — documentación y APIs permitidas

Antes de editar, releer sólo estas fuentes:

- Producto y diseño:
  - `PRODUCT.md:21-29,59-63,73-75` — estado explícito, copy factual,
    account-first e infraestructura fuera de Settings normal.
  - `DESIGN.md:200-205,220-229` — navegación predecible y estados
    notice/empty/error planos con una acción clara.
- Ventana nativa:
  - `src-tauri/src/settings_window.rs:20-50,90-110`.
  - `src-tauri/tauri.conf.json` — la ventana configurada ya usa
    `index.html#settings`.
  - `src/App.tsx::getAppSurface` — `#settings` resuelve `SettingsSurface`.
  - `src-tauri/src/companion_window.rs::show_positioned_window` — patrón de
    ventana reutilizada sin navegación JS.
- Settings:
  - `src/settings/SettingsSurface.tsx` — `effectiveSection`, rail, Atajos y
    Presets.
  - `src/settings/settings-heroui.css:2-19,96-100,258-292,336-345` — owner del
    scroll y estados visuales existentes.
  - `src/settings/fixvox-cloud-control.ts::resolveSettingsAccess` — única
    autoridad de capacidades.
  - `src/personal-vocabulary/PersonalVocabularySettings.tsx` — carga y editor
    de Correcciones.
  - `src/settings/hotkey-edit-copy.ts` y
    `src/settings/hotkey-edit-contract.ts` — copy visible frente a contrato
    interno.
- Control Room y operaciones:
  - `admin/fixvox-web/public/app.js::filterAccounts`,
    `renderAccountsWorkbench`, `wireDynamicEvents`.
  - `scripts/admin-web-ui-smoke.mjs:57-76`.
  - `scripts/admin-web-deploy.ps1`.
  - `admin/fixvox-web/systemd/fixvox-omp-auth-broker.service`.
  - `scripts/omp-release-provision.ps1:119-125`.

### APIs permitidas

- Conservar sin cambios:
  - `show_settings_window_for_app<R: Runtime>(...) -> Result<(), String>`;
  - `show_existing_settings_window(...) -> Result<(), String>`;
  - `create_fresh_settings_window(...)`;
  - `resolveSettingsAccess(status) -> SettingsAccess`;
  - contratos internos de registro de hotkeys;
  - `GET /api/admin/accounts?limit=50` y el filtrado local actual;
  - broker loopback `OMP_AUTH_BROKER_URL=http://127.0.0.1:8765`.
- Usar el DOM existente para scroll:
  - `ref` sobre `.settings-content`;
  - `scrollTop = 0` o `scrollTo({ top: 0, behavior: "auto" })`.
- Reutilizar markup/clases de notices y empty states; no crear un nuevo sistema
  de componentes.

### Guardas contra anti-patrones

- No reemplazar la recarga de Settings por otro `eval`, evento renderer,
  persistencia de sección o recreación forzada.
- No debilitar `resolveSettingsAccess(undefined)`; la UI agrega `checking`, no
  inventa acceso.
- No mostrar mensajes nativos crudos, `host`, `renderer`, `binding`, `swap`,
  `rollback` o `runtime` en Atajos.
- No mostrar simultáneamente loading, error, empty y editor.
- No añadir filtros al backend para el slice actual de 50 cuentas.
- No copiar assets a producción con SCP ni editar el live tree.
- No copiar OAuth, refresh tokens ni secretos de proveedor al usuario
  `fixvox-agent`.

## Phase 1 — implementación 1: reapertura estable

### Qué implementar

1. En `show_settings_window_for_app` eliminar solamente:
   - `window.eval("window.location.replace('index.html#settings')")`;
   - el mapping `settings navigation failed` asociado.
2. Pasar la ventana configurada o recién creada directamente a
   `show_existing_settings_window(window)`.
3. No cambiar label, URL, builders, tray caller, close lifecycle ni firmas.
4. En `tests/settings/settings-window-host.test.ts`:
   - conservar los asserts de URL configurada, reuse y fallback;
   - aislar el cuerpo de `show_settings_window_for_app` con el patrón de slicing
     de `tests/desktop-control/account-setup-window-rust.test.ts:9-16`;
   - comprobar que ese cuerpo no contiene `.eval(`,
     `window.location.replace` ni `settings navigation failed`.

### Verificación

- `npm run test:pipeline -- tests/settings/settings-window-host.test.ts`
- App Tauri real:
  1. abrir Settings desde tray;
  2. elegir una sección no default;
  3. invocar Settings otra vez sin cerrarla;
  4. comprobar que conserva la sección y sigue respondiendo;
  5. cerrar Settings, reabrir y comprobar el fallback nuevo;
  6. observar `show ok`, `restore ok`, `focus ok` y ausencia de AppHang.

### Criterio de cierre

Una ventana viva se enfoca sin recargar el renderer; una ventana cerrada se
recrea directamente en `#settings`.

## Phase 2 — implementación 2: Settings honesto

Es una sola implementación de producto, aunque toque tres archivos existentes.
No extraer subcomponentes nuevos durante este lote.

### 2.1 Scroll por sección

En `SettingsSurface`:

- añadir un ref al `<section className="settings-content">`;
- al cambiar `effectiveSection`, resetear exclusivamente ese owner a top;
- cubrir rail, Ayuda → Avanzado y auto-selección Cuenta con la misma regla;
- no tocar scroll interno de listas ni CSS responsive.

### 2.2 Presets con un estado exclusivo

Mantener `resolveSettingsAccess` y derivar en UI:

- `checking`: Tauri todavía no obtuvo `cloudStatus`;
- `unavailable`: no puede ver Presets;
- `readOnly`: puede ver pero no editar;
- `editable`: puede ver y editar.

Renderizar ramas mutuamente exclusivas:

- `checking`: un notice “Comprobando disponibilidad…”;
- `unavailable`: un notice y una acción para ir a Cuenta; sin contador, lista,
  import, add, editor ni prompt;
- `readOnly`: lista visible y todas las mutaciones bloqueadas, incluida Importar;
- `editable`: controles actuales.

No mostrar “Cambios guardados” en el estado inicial ni denegado.

### 2.3 Atajos como producto, no diagnóstico

- Conservar `hotkey-edit-contract.ts` como contrato interno y dejar sus tests de
  host intactos.
- Dejar de renderizar heading, summary y steps de ese contrato en Settings.
- Sustituirlos por copy corto en español: atajo actual, capturar nuevo,
  conflicto, aplicar o restaurar.
- Mapear modos sólo en render:
  - `host` → `Editable`;
  - `fixed` → `Fijo`;
  - `planned` → `Próximamente`.
- Localizar resultados conocidos en `hotkey-edit-copy.ts` y usar fallback humano
  estable para errores desconocidos; los detalles crudos quedan en diagnóstico,
  no en Atajos.

### 2.4 Correcciones con estados honestos

En `PersonalVocabularySettings` derivar un único estado visible:

- loading sin snapshot;
- error/unavailable sin snapshot;
- loaded-empty;
- loaded con resultados/editor.

Reglas:

- no mostrar “Sin reglas cargadas” mientras carga o falló;
- no ofrecer guardado hasta que exista snapshot/revision;
- diferenciar “Todavía no hay correcciones” de “No hay coincidencias”;
- estandarizar copy visible a `corrección`, sin renombrar tipos/API internos.

### Tests mínimos

Actualizar, no multiplicar suites:

- `tests/settings/settings-surface.test.tsx`:
  - nueve secciones, incluida Correcciones;
  - ramas Presets denied/read-only/editable mutuamente exclusivas;
  - Atajos sin plan interno ni términos ingleses de host;
  - labels `Editable`, `Fijo`, `Próximamente`.
- `tests/settings/hotkey-edit-copy.test.ts`:
  - outcomes conocidos en español;
  - fallback sin mensaje nativo crudo.
- Cubrir estados de Correcciones en su suite existente o en el test de Settings
  más cercano; no crear una arquitectura de fixtures nueva.
- Un escenario Playwright de scroll real:
  - asignar scroll a `.settings-content`;
  - cambiar de sección;
  - comprobar `scrollTop === 0`.
- Actualizar `DESIGN.md:202` para incluir Correcciones en la navegación durable.

### Verificación

- Tests focales de Settings y Correcciones.
- `npm run build`.
- App Tauri real a 720×480:
  - recorrer las nueve secciones;
  - comprobar que todas abren arriba;
  - validar Presets en el estado efectivo de esta cuenta;
  - validar que Atajos no muestra lenguaje interno;
  - validar loading/error/empty de Correcciones sin estados simultáneos.
- Screenshot final de Atajos, Presets y Correcciones.

### Criterio de cierre

Settings siempre muestra una sola verdad operativa por sección, no expone
mecánica interna y conserva la navegación compacta existente.

## Phase 3 — cierre local integrado

Ejecutar una sola vez, después de ambos smokes:

- tests focales modificados;
- `npm run build`;
- `cd src-tauri && cargo check`;
- app Tauri real: reapertura Settings + recorrido visual corto;
- revisar que no queden términos prohibidos en la superficie Atajos;
- comprobar que no se añadió dependencia, API paralela ni archivo de UI nuevo.

No ejecutar suite global, release ni deploy para cerrar el lote local.

### Cierre local verificado — 2026-08-11

Phases 0–3 quedaron cerradas. El lote modificó únicamente los archivos
existentes previstos por el track:

- `src-tauri/src/settings_window.rs`;
- `src/settings/SettingsSurface.tsx`;
- `src/settings/hotkey-edit-copy.ts`;
- `src/personal-vocabulary/PersonalVocabularySettings.tsx`;
- los tests focales existentes de Settings y el smoke Playwright;
- `DESIGN.md`.

Resultado observado:

- una Settings viva conserva la sección al reabrirse desde tray; una Settings
  cerrada se recrea en `#settings` y vuelve a General;
- las nueve secciones reinician el scroll del owner `.settings-content`;
- Presets muestra una sola rama efectiva y respeta acceso de lectura/escritura;
- Atajos usa copy de producto en español y no expone términos internos;
- Correcciones separa carga, error, vacío y editor, exige snapshot/revisión y
  conserva resultados autoritativos de create/update/delete si falla el refresh;
- el cierre integrado pasó con 3 archivos/18 tests Vitest, 2/2 escenarios
  Playwright, `npm run build` y `cargo check`;
- el smoke Tauri final confirmó `show ok`, `restore ok`, `focus ok`, reapertura,
  recreación y ausencia de AppHang.

Evidencia visual final:

- `artifacts/live-app/20260811-131249/settings-final/atajos.png`;
- `artifacts/live-app/20260811-131249/settings-final/presets.png`;
- `artifacts/live-app/20260811-131249/settings-final/correcciones.png`.

No se ejecutaron Phase 4, deploy, VPS, provider calls, producción, commit ni
push. Esos gates permanecen separados y requieren una autorización nueva.


## Phase 4 — Control Room: verificación y gates productivos

Esta fase no agrega implementación de producto.

### 4.1 Verificación local existente

- Ejecutar `npm run admin:web:smoke`.
- Confirmar búsqueda, clear y restauración de filas.
- Confirmar que profile/activity controls están habilitados.
- Sólo si el smoke demuestra una brecha, extender el bloque existente en
  `scripts/admin-web-ui-smoke.mjs`; no tocar `app.js` sin una reproducción local.

### 4.2 Gate de rollout Admin

El source actual ya contiene:

- `state.accountFilters`;
- `normalizeAccountFilter`;
- `accountMatchesActivity`;
- `filterAccounts`;
- handlers en `wireDynamicEvents`.

La producción auditada está atrasada respecto del source. Con aprobación
productiva explícita y un commit aprobado/limpio:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/admin-web-deploy.ps1 -ConfirmProduction
```

Usar únicamente este deploy atómico con health y rollback. Después, smoke
browser autenticado de Personas. No acoplarlo a OMP.

### 4.3 Gate de recuperación OMP

Primero diagnóstico read-only en VPS:

- unit ausente vs disabled/inactive/failed;
- bearer ausente/stale;
- env de Admin sin `OMP_AUTH_BROKER_URL`;
- binario/CWD inválido.

Si unit y token existen y sólo hay drift de servicio, usar el enable/start
existente y verificar como `fixvox-agent`:

```text
OMP_AUTH_BROKER_URL=http://127.0.0.1:8765
/opt/fixvox-agent/bin/omp auth-broker status --json
```

Exigir `"ok":true`. Si falta bearer, copiar exactamente la secuencia de
`scripts/omp-release-provision.ps1:119-125`. Si falta el unit, detenerse y pedir
aprobación para el provisioning canónico completo: toca además deploy keys y
servicios de release.

Después del broker verde, verificar health de Admin y, sólo con autorización de
provider/producción, un prompt inocuo autenticado. `healthz` y `omp --version`
no prueban disponibilidad de modelo.

## Secuencia para la sesión nueva

1. Cargar `skill://do` y este track.
2. Ejecutar Phase 0.
3. Implementar y verificar Phase 1.
4. Implementar y verificar Phase 2.
5. Cerrar Phase 3 local.
6. Detenerse ante el gate productivo de Phase 4 salvo autorización explícita.

## Definición de terminado

El lote local está terminado cuando:

- Settings reutilizada no navega ni pierde su sección;
- Settings cerrada se recrea en la ruta correcta;
- las nueve secciones abren arriba;
- Presets muestra exactamente checking, unavailable, read-only o editable;
- Atajos no expone implementación interna;
- Correcciones muestra exactamente loading, error, empty o editor;
- tests focales, build, cargo check y smoke Tauri pasan;
- no se agregó dependencia, migración ni superficie.

Control Room productivo sólo queda terminado después de los gates separados de
deploy Admin y recuperación OMP, con receipts verificables y rollback existente.
