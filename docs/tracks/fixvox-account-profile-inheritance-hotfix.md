---
status: complete
started: 2026-07-24
updated: 2026-07-24
priority: critical
owner: JP/Pi
related:
  - docs/tracks/fixvox-clean-install-device-bootstrap-hotfix-brief.md
  - docs/tracks/fixvox-tauri-cloud-release.md
  - docs/topics/fixvox-cloud-runtime-port.md
source_refs:
  - cloud/fixvox-api/src/postgres/auth-session-repository.ts
  - cloud/fixvox-api/src/postgres/control-plane-repository.ts
  - cloud/fixvox-api/src/postgres/admin-repository.ts
  - cloud/fixvox-api/src/routes/admin.ts
  - cloud/fixvox-api/src/app.ts
---

# Fixvox Account Profile Inheritance Hotfix

## Objetivo

Hacer que la identidad Google canónica resuelva una sola cuenta Fixvox y que el
perfil asignado a esa cuenta se herede automáticamente en todas sus
computadoras, sin asignaciones manuales por dispositivo.

## Incidente

Una instalación nueva completó Google OAuth pero quedó en `Basic`; selection
transform no estaba disponible. La primera PC funcionaba porque `Pro` había
sido asignado sólo a ese dispositivo durante una reparación anterior.

La inspección productiva provider-free confirmó:

- una sola cuenta Google canónica, con un dispositivo nuevo vinculado;
- cero asignaciones de perfil a nivel cuenta;
- el dispositivo anterior `Pro` seguía sin account linkage;
- el callback OAuth completaba el flujo pero devolvía una página visualmente
  vacía;
- health/readiness y schema 6 permanecían verdes.

## Contrato Definitivo

1. `(provider, provider_subject_hash)` sigue siendo la identidad única; nunca se
   expone el subject crudo.
2. El handle operativo se deriva de forma estable y opaca del hash, no usa el
   placeholder compartido `google-redacted`.
3. Una asignación `account → profile` gana sobre device/group/fallback y alcanza
   computadoras futuras vinculadas con la misma identidad Google.
4. Usuarios nuevos comienzan en `Basic` hasta que Control Room les asigne un
   perfil; esa mutación es auditable, idempotente y actualiza las proyecciones de
   sus dispositivos.
5. El callback muestra un resultado humano Spanish-first sin state, code, token
   ni identidad.

## Reparación Productiva Acotada

Con autorización explícita de JP se creó primero un backup cifrado F4. Una
transacción fail-closed verificó exactamente una cuenta Google vinculada, cero
account assignments y un `Pro` publicado con `selection_transform`; luego:

- convirtió el placeholder a un handle opaco estable y conservó `JPSALA` sólo
  como display label;
- creó una única asignación `account → Pro` con prioridad account-level;
- agregó audit redacted `account.profile.assign`;
- verificó `effective profile = pro`, `source = account` para la PC nueva.

No hubo provider call, audio, transcript, selected text, DNS, Tunnel, Worker,
login adicional ni cambio de secretos. El servicio no se reinició y
health/readiness siguieron 200.

## Implementación Versionada

- OAuth claim reutiliza la misma cuenta por subject hash y genera handles
  `acc_<fingerprint>` estables para cuentas nuevas o placeholders legacy.
- La ruta de compatibilidad protegida de Control Room vuelve a soportar
  `account → profile` sobre PostgreSQL con edit credential, validación de perfil
  publicado, idempotencia, audit y actualización de proyecciones device.
- `/callback` y el callback canónico muestran éxito, cancelación, error o
  expiración con una página visible y `no-store`.
- Integración cubre dos computadoras con el mismo subject y herencia de `Pro`.

## Checks

- API unit: 39/39.
- PostgreSQL focal: 12 tests del comportamiento pasan; el único fallo del archivo
  completo es la expectativa histórica preexistente `schemaVersion=5` frente al
  schema real 6.
- LSP focal: limpio.
- `git diff --check`: limpio.

## Resultado

- Source pusheado en `62a5519`; bundle determinístico
  `e835f7f678b528c8`, SHA-256
  `e835f7f678b528c827b9d961254926a016973512ddc99e84e6cc6a329c49f378`.
- Candidate aislado pasó health/readiness sobre schema 6 antes de promoción.
- Promoción atómica y restart quedaron verdes con rollback inmediato
  `68eae40e974909c5`, `NRestarts=0` y un único listener loopback.
- Se restauraron las credenciales protegidas edit/publish del API copiándolas
  desde el env admin `0600` al env runtime `0600`, con backup `0600`; ningún
  valor apareció en output, archivos versionados o logs.
- La ruta account-policy respondió idempotente y actualizó la proyección del
  dispositivo ya vinculado. Admin proyecta una cuenta, profile `pro`,
  `source=account`, un device y handle opaco válido.
- Callback local y público responden la página visible Spanish-first con
  `Cache-Control: no-store`; la prueba sin state devuelve 400 esperado sin
  ejecutar OAuth.
- DB confirma `account → pro`, device projection `Pro` y audit redacted; no hay
  provider events. Health/readiness públicos y locales siguen 200.
- Staging limpio; backup cifrado DB y backup del env quedan disponibles para
  rollback. La otra PC debe reiniciar Fixvox una vez para invalidar el cache en
  memoria y refrescar el contexto account-wide.
