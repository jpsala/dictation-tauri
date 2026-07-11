---
status: active
started: 2026-07-08
updated: 2026-07-08
priority: high
owner: Pi
related:
  - artifacts/app-audit-20260708.md
  - docs/topics/privacy-and-dictation-data.md
  - docs/topics/dictation-tauri-foundation.md
  - docs/topics/selection-and-assistant-actions.md
topic: app-audit-remediation
source_refs:
  - src-tauri/tests/fixvox_cloud_contract.rs
  - src-tauri/tauri.conf.json
  - src/desktop-control/controller.ts
  - src-tauri/src/fixvox_cloud.rs
  - src-tauri/src/runtime_transcription.rs
  - src-tauri/src/desktop_delivery.rs
  - src/App.tsx
---

# App Audit Autonomous Implementation Plan

## Objetivo

Cerrar los issues comprobados y convertir la auditoría de `artifacts/app-audit-20260708.md` en mejoras implementables con ejecución autónoma local: tests verdes, hardening mínimo antes de release, deuda documentada y backlog ordenado.

## Alcance Autónomo Permitido

Pi puede ejecutar sin pedir supervisión adicional:

- Editar código/docs locales en este repo.
- Correr checks locales: `npm run test:pipeline`, `npm run build`, `cd src-tauri && cargo test --no-run`, `cd src-tauri && cargo check`, `npm run cloud:test`, `npm run context:audit`, `npm run context:index`.
- Usar `lsp_diagnostics`, `lens_diagnostics`, `ffgrep`, `ast_grep_search`, `module_report`, `read_symbol`, `taskflow` para auditoría/revisión aislada.
- Crear artifacts bajo `artifacts/` y tracks/docs bajo `docs/`.
- Usar actores solo para smokes locales largos/inspeccionables, con aviso desktop si tocan UI/hotkeys/clipboard.

Sigue requiriendo autorización explícita aunque el trabajo sea “sin supervisión”:

- Instalar dependencias, CLIs, paquetes del sistema o binarios remotos.
- Deploy, push, publish, release o cambios de producción.
- Login/cuentas, pagos, borrar datos reales.
- Smokes con side effects reales de selección/replace-selection, `Alt+Space`, hotkeys globales, clipboard real o apps personales, salvo que el task explícito lo active y se emita aviso de inicio.

## No-Goals

- No refactor masivo de `src/App.tsx`.
- No reescribir delivery clipboard ni prometer privacidad fuerte.
- No introducir nuevas dependencias para DPAPI/keyring sin aprobación.
- No cambiar diseño visual global sin decisión de producto.
- No tocar cloud prod ni secrets reales.

## Estado Actual

Evidencia de auditoría:

- `npm run test:pipeline` pasó: 86 archivos, 418 tests.
- `cd src-tauri && cargo test --no-run` falla por dos inicializadores incompletos de `FixvoxDeviceState`.
- `src-tauri/tauri.conf.json` tiene `"csp": null`.
- `src/desktop-control/controller.ts` define `cryptoSafeRandom()` con `Math.random()` para session IDs no secretos.
- `persist_auth_session_state()` guarda secretos de sesión como JSON plano.
- `runtime_transcription.rs` usa `Command::new("ffmpeg")` por PATH.
- Clipboard delivery expone dictation text durante una ventana corta por diseño snapshot/write/paste/restore.

Nota de higiene: el working tree tiene muchos cambios existentes. Cada task debe leer antes de editar y usar reemplazos mínimos para no pisar trabajo ajeno.

## Plan Por Fases

### Fase 0 — Baseline y protección de cambios existentes

**Objetivo:** asegurar que cada cambio sea mínimo y verificable.

**Tools:** `git status --short`, `read`, `ffgrep`, `lsp_diagnostics`, `lens_diagnostics`.

**Pasos:**

1. Registrar `git status --short` en artifact de ejecución.
2. Leer el bloque exacto antes de editar cada archivo.
3. No formatear archivos completos.
4. Antes de cada edit, identificar si el archivo ya está modificado/untracked y limitar el diff a líneas objetivo.
5. Después de cada fase, guardar evidencia en `artifacts/app-audit-remediation/<phase>.md`.

**Validación:**

- `git diff -- <files touched>` solo muestra cambios esperados.

**Rollback:**

- Revertir manualmente el bloque editado; no usar `git checkout` por cambios ajenos.

---

### Fase 1 — Reparar Rust integration tests rotos

**Objetivo:** desbloquear `cargo test --no-run`.

**Issue:** `FixvoxDeviceState` ganó `auth_policy`; dos fixtures no lo inicializan.

**Archivos:**

- `src-tauri/tests/fixvox_cloud_contract.rs`

**Cambios mínimos:**

0. Leer la definición de `FixvoxDeviceState` y confirmar que `auth_policy` es opcional.
1. En el initializer exacto de `src-tauri/tests/fixvox_cloud_contract.rs:450`, agregar `auth_policy: None,` inmediatamente después de `policy_snapshot: None,`.
2. En el initializer exacto de `src-tauri/tests/fixvox_cloud_contract.rs:492`, agregar `auth_policy: None,` inmediatamente después de `policy_snapshot: None,`.

**Nota flaky:** estos tests limpian temp files con `remove_file` manual; si fallan antes del cleanup pueden quedar restos en `%TEMP%`. No bloquear el fix por eso; registrarlo si aparece.

**Validación:**

```powershell
cd src-tauri && cargo test --no-run
cd src-tauri && cargo check
```

Si `cargo test --no-run` falla por `STATUS_ENTRYPOINT_NOT_FOUND`, usar `cargo check` como validación secundaria y registrar el error completo, pero primero intentar `cargo test --no-run` porque el fallo actual es de compilación.

**Criterio de done:**

- El error `missing field auth_policy` desaparece.
- No aparecen nuevos errores por el cambio.

---

### Fase 2 — Hardening mínimo de naming/random no secreto

**Objetivo:** eliminar nombre engañoso sin cambiar comportamiento de producto.

**Issue:** `cryptoSafeRandom()` usa `Math.random()`; hoy no es token de seguridad, pero el nombre es falso.

**Archivos:**

- `src/desktop-control/controller.ts`
- tests relacionados si referencian el nombre o formato.

**Opción lazy recomendada:**

- Renombrar `cryptoSafeRandom()` a `createNonSecretSessionSuffix()` y mantener `Math.random()` si el ID no cruza trust boundary.

**Opción hardening igual de simple:**

- Usar `globalThis.crypto?.randomUUID?.()` con fallback a `Math.random()` para entornos test antiguos.
- Mantener formato `desktop-session-<suffix>`.

**Pasos:**

1. Buscar referencias con `ffgrep cryptoSafeRandom`.
2. Confirmar el scan actual: no hay tests que referencien `cryptoSafeRandom`, `createDefaultSessionId` ni `desktop-session`; solo definición + uso local.
3. Leer test coverage de `DesktopDictationController`.
4. Aplicar cambio mínimo.

**Rollback:** revertir manualmente el rename o volver al helper anterior si algún entorno test carece de `crypto.randomUUID()`.

**Validación:**

```powershell
npm run test:pipeline
npm run build
```

**Criterio de done:**

- No queda función con nombre `cryptoSafeRandom` usando `Math.random()`.
- Tests TS pasan.

---

### Fase 3 — CSP mínima de Tauri

**Objetivo:** reemplazar `csp: null` por una política explícita que no rompa la app.

**Archivos:**

- `src-tauri/tauri.conf.json`
- posiblemente docs si se documenta endpoint permitido.

**Política inicial propuesta:**

```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: data:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost https://auth-fixvox.jpsala.dev https://*.jpsala.dev; media-src 'self' asset: blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
```

**Notas:**

- Tauri/WebView IPC puede necesitar esquema específico (`ipc:` / `http://ipc.localhost`) según runtime. Validar contra runtime real; si `http://ipc.localhost` no hace falta, quitarlo antes de release.
- No permitir `img-src https:` salvo evidencia concreta: facilita exfiltración por tags de imagen si alguna XSS llega al DOM.
- `style-src 'unsafe-inline'` se acepta por React/CSS runtime actual; no meter nonce/hash ahora.
- Si algo falla por CSP, relajar solo la directiva necesaria y registrar evidencia.
- Revisar si existe uso de WebSocket (`new WebSocket`, `wss://`) antes de cerrar `connect-src`; si existe, agregar la fuente mínima necesaria.

**Pasos:**

1. Revisar config Tauri actual y docs locales si hay CSP previa.
2. Buscar `new WebSocket`, `wss://`, `<img`, `src=` externo y `url(https://` en `src/`.
3. Aplicar CSP.
4. Correr build frontend.
5. Correr Tauri check/build liviano si viable.
6. Si hay smoke UI, iniciar `tauri:dev:hidden` con actor y revisar consola/logs, sin tocar hotkeys globales.

**Validación:**

```powershell
npm run build
cd src-tauri && cargo check
```

Opcional si se necesita smoke visual sin side effects peligrosos:

```powershell
npm run tauri:dev:hidden -- -StopExisting
npm run visual:check
```

**Criterio de done:**

- `csp` deja de ser `null`.
- `npm run build` y `cargo check` pasan como validación de formato/compilación, pero no prueban CSP runtime.
- CSP queda validada en Tauri runtime o marcada explícitamente como `[runtime no verificado]` con el comando pendiente.
- Cualquier relajación queda documentada.

---

### Fase 4 — Documentar constraints reales de delivery/privacy

**Objetivo:** convertir riesgos aceptados en contrato visible para futuras decisiones.

**Issues:**

- Clipboard paste expone texto durante una ventana corta.
- Secretos locales sin cifrado son aceptables en dev, no en release multiusuario.
- `ffmpeg` por PATH es dev-friendly, no hardening release.

**Archivos candidatos:**

- `docs/topics/privacy-and-dictation-data.md`
- `docs/topics/selection-and-assistant-actions.md`
- `docs/topics/dictation-tauri-foundation.md`
- este track.

**Cambios mínimos:**

1. Agregar sección corta “Constraints conocidos antes de release”.
2. Nombrar exactamente:
   - clipboard window por snapshot/write/paste/restore;
   - sesión cloud local sin cifrado;
   - `ffmpeg` por PATH para audio optimization.
3. Marcar upgrade path:
   - DPAPI/keyring;
   - resolver path absoluto/signature para ffmpeg;
   - no prometer `paste_observed` sin observer.

**Validación:**

```powershell
npm run context:audit
```

**Criterio de done:**

- Riesgos no quedan solo en un artifact temporal.
- Docs siguen livianas y audit pasa.

---

### Fase 5 — Validación completa local

**Objetivo:** cerrar el lote con evidencia reproducible.

**Comandos en orden:**

```powershell
npm run test:pipeline
npm run build
cd src-tauri && cargo test --no-run
cd src-tauri && cargo check
npm run context:audit
```

Opcional si el entorno cloud local está listo y no requiere installs:

```powershell
npm run cloud:test
```

**Si un comando falla:**

1. Guardar output resumido y path del log.
2. Clasificar si es regresión causada por el lote o fallo preexistente.
3. Corregir solo si está dentro del alcance.
4. Si requiere install/deploy/secret/side effect real, bloquear y dejar instrucción.

**Evidencia final:**

- `artifacts/app-audit-remediation/final-validation.md`
- comandos corridos;
- pass/fail;
- archivos modificados;
- deuda pendiente.

---

### Fase 6 — Backlog post-lote, no implementar automáticamente salvo tiempo/consenso

#### 6.1 DPAPI/keyring para auth session

- Requiere elegir crate o API Windows directa.
- No instalar dependencias sin autorización.
- Alternativa sin dependency: usar `windows` crate existente si features alcanzan; si no, pedir aprobación.

#### 6.2 Resolver `ffmpeg` absoluto

- Primero decidir si release debe bundlear ffmpeg o depender de instalación externa.
- No descargar/binariar ffmpeg sin aprobación.
- Implementación mínima posible: detectar ruta con `where ffmpeg`, rechazar rutas en directorios world-writable, cachear path.

#### 6.3 Extracción incremental de `App.tsx`

- No hacer “clean architecture”.
- Regla: extraer solo al tocar un flujo.
- Primer candidato: assistant delivery status / companion recovery, porque cruza UX y estado.

#### 6.4 Design token alignment

- Requiere decisión de producto:
  - mantener dark/Fixvox-green como overlay explícito;
  - o migrar a DESIGN light/cool-neutral.
- No hacer cambio visual masivo sin screenshot/smoke.

#### 6.5 Smokes live pendientes

- Alt+Q suffix chords.
- Audio runtime mute/cues/auto-stop.
- Chrome accessibility strategy.
- Release installer/otra PC.

Estos sí tocan desktop/hotkeys/clipboard/audio; deben iniciar con notificación/beep y artifacts.

## Orden De Ejecución Recomendado

1. Fase 0 baseline.
2. Fase 1 cargo tests.
3. Fase 2 random naming.
4. Fase 3 CSP.
5. Fase 4 docs.
6. Fase 5 validación completa.
7. Fase 6 solo como backlog/documentación, no scope principal.

## Tooling Plan

### Main agent

- Edits mínimos.
- Corre validaciones.
- Escribe evidencia.

### `taskflow`

Usar solo para revisión aislada, no para editar en paralelo sobre los mismos archivos:

- `security-reviewer`: revisar CSP propuesta y si rompe trust boundaries.
- `test-engineer`: revisar matriz de validación.
- `reviewer`: revisar diff final antes de cierre.

### `lsp_diagnostics` / `lens_diagnostics`

- Antes de cada build si se toca TS.
- `lens_diagnostics mode=all` antes de cierre.

### `actors`

Usar solo si se corre `tauri:dev:hidden` o smokes largos. Artifact bajo `artifacts/actors/<run-id>/`.

## Definition Of Done Del Lote Principal

- `cargo test --no-run` ya no falla por `auth_policy`.
- No queda `cryptoSafeRandom` con nombre falso.
- `tauri.conf.json` tiene CSP explícita o queda documentado por qué se bloqueó.
- Constraints clipboard/auth-session/ffmpeg quedan en docs vivos.
- `npm run test:pipeline` pasa.
- `npm run build` pasa o fallo preexistente queda identificado.
- `cd src-tauri && cargo check` pasa.
- `npm run context:audit` pasa.
- `npm run cloud:test` pasa o queda marcado como opcional/no ejecutado por entorno sin instalar nada.
- Se crea `artifacts/app-audit-remediation/final-validation.md`.

## Riesgos Y Mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Pisar cambios existentes | Editar solo bloques leídos; revisar `git diff -- <file>` por fase. |
| CSP rompe WebView IPC | Validar build/dev; relajar directiva específica, no volver a `null`. |
| Cargo test falla por entorno Windows | Separar compile errors reales de `STATUS_ENTRYPOINT_NOT_FOUND`; conservar `cargo check`. |
| Docs se vuelven largas | Agregar constraints breves; detalle queda en artifact. |
| Scope creep hacia App.tsx | No refactor salvo que un fix lo exija. |
| Smokes con side effects molestan al usuario | Notificación/beep al inicio; solo si fase lo requiere. |

## Próximo Paso Concreto

Ejecutar Fase 1: agregar `auth_policy: None` en dos fixtures de `src-tauri/tests/fixvox_cloud_contract.rs` y correr `cd src-tauri && cargo test --no-run`.
