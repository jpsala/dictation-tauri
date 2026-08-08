---
status: complete
started: 2026-07-24
updated: 2026-07-24
priority: high
owner: Pi
parent: docs/tracks/fixvox-tauri-cloud-release.md
related:
  - docs/tracks/vps-direct-runtime-cutover-provider-free-finalization-brief.md
---

# Fixvox Clean Install — Device Bootstrap Hotfix

## Objetivo

Hacer que una PC nueva o con identidad local no reconocida quede registrada en
el VPS antes de login o dictado, sin intervención manual.

## Comportamiento Observable

El host confirma o repara provider-free el vínculo del dispositivo mediante la
frontera soportada; luego login y dictado continúan normalmente, y Settings no
muestra `Lista` mientras el backend responda `device_not_registered`.

## Límites Explícitos

- Sin SQL manual, import de devices, cambios de schema, Worker, DNS, provider o
  publicación de installer.
- La reparación no puede ejecutar STT, reintentar provider ni duplicar la
  operación original.
- No exponer ni registrar `installId`, `deviceId`, tokens o datos de cuenta.

## Criterios De Terminado

- Una instalación limpia obtiene registro backend antes de iniciar login o STT.
- Un `deviceId` local ausente en VPS se repara provider-free y la operación
  solicitada continúa como máximo una vez.
- Settings sólo declara la computadora lista después de una confirmación backend
  vigente.

## Checks Focales Mínimos

- Tests Rust para bootstrap limpio, reparación de `device_not_registered` y cero
  provider calls/retries durante el repair.
- Test focal de Settings/readiness contra el falso estado `Lista`.
- `cargo fmt --check`, test Rust focal, test frontend focal y `cargo check`.

## Resultado

- Bootstrap provider-free obligatorio antes de readiness, login y primer dictado
  gestionado; confirmación en memoria evita sumar una llamada por dictado.
- Un binding reparado conserva la sesión sólo si el backend confirma el mismo
  `deviceId`; un reemplazo invalida el falso estado conectado y habilita login.
- Settings y el gate de cuenta exigen `lastRegisterOk === true` para declarar la
  computadora lista.
- Verificación focal inicial: Rust `40/40`, frontend `11/11`,
  `cargo fmt --check` y `cargo check` verdes.
- Source pusheado en `a99a493`; release build desde worktree limpio del commit
  `6ba7f54`: 47 archivos, 246 tests, frontend, Rust y NSIS verdes.
- Prerelease `fixvox-tauri-v0.1.0-20260724125602` publicado con installer y
  checksum canónicos. Redescarga idéntica: SHA-256
  `53115eb673f2b9e72a6782c151a29a122675d2dcaf34a68dbb3e3e048510bd2a`.
- `fixvox.pages.dev` migrado al source `site/` de este repo y desplegado como
  `0e00217a`; desktop/móvil, demo, dock y URL del installer quedaron verdes.

## Reparación De Login Post-Cutover

- La validación en una PC con upgrade viejo ya no reprodujo
  `device_not_registered`; expuso `FIXVOX_LOGIN_START_INVALID` porque el VPS
  generaba la `verificationUri` con origen interno `http://127.0.0.1:8790`.
- La causa fue `FIXVOX_API_PUBLIC_BASE_URL` heredada del modo loopback durante
  el cutover. El cliente falló cerrado correctamente; no era estado stale de la
  PC ni requería relajar la validación de origen.
- Con autorización, se creó backup `0600`, se cambió sólo esa variable a
  `https://auth-fixvox.jpsala.dev` y se reinició `fixvox-api.service` una vez.
  Servicio, listener, health y readiness quedaron verdes; login start 200,
  verification origin y callback OAuth canónicos, sin llamada provider.
- `ops/fixvox-api/provision.sh` quedó endurecido para no volver a provisionar
  una URL pública loopback; `assets-smoke.sh` lo exige y pasó.
- El siguiente intento llegó a Google y expuso `400 invalid_request`: la URL
  omitía `client_id`, `response_type` y `scope`; además la composición VPS aún
  usaba un exchange OAuth mock. No era una cuenta Google elegida por error.
- Source `faf1985` completa OAuth server-side: authorization request con
  `response_type=code`, scope `openid email profile`, callback histórico
  `/callback`, `prompt=select_account`, token exchange confidencial y UserInfo
  verificado sin persistir tokens. Config parcial falla cerrado.
- API unit `38/38`, TypeScript y assets smoke verdes. Bundle determinístico
  `68eae40e974909c5`, SHA-256
  `68eae40e974909c500db3523e33a5f788e034e39d9192904cb9baa119295647d`.
- Credenciales Google se transfirieron por SSH stdin al env `0600`, con backup
  protegido; candidate boot health/readiness 200, promoción y restart únicos.
  Producción quedó con login start 200, parámetros OAuth completos,
  `prompt=select_account` y callback canónico. No se completó login ni hubo
  provider call.
- JP repitió el flujo en la PC afectada y confirmó que el selector de cuenta y
  el inicio de sesión funcionan. El hotfix queda cerrado sin reinstalación
  adicional ni otro release desktop.
