---
status: complete
execution_route: strong
started: 2026-07-22
updated: 2026-07-22
priority: high
owner: Pi
parent: specs/019-fixvox-self-hosted-control-plane
related:
  - docs/tracks/fixvox-self-hosted-checkpoint-f-vps-loopback-plan.md
  - docs/tracks/vps-gate-f-closure-brief.md
  - docs/runbooks/fixvox-api-vps.md
---

# VPS Gate F External Closure

## Objetivo

Cerrar Gate F mediante un único rehearsal privado y recuperable de restart, rollback y restore aislado, preservando el baseline vigente.

## Comportamiento Observable

- El preflight falla cerrado salvo que confirme current `4075da53c365a8b1`, candidate rollback `73c764c8c679dc40`, schema 6, markers 1/1, loopback, `cloudflare-authority` y un backup/manifest cifrado compatible con schema 6.
- El servicio reinicia sobre current, cambia al rollback, espera readiness acotada y vuelve a current; un fallo posterior a la primera mutación recupera current una sola vez y conserva el error original.
- Off-host, el backup se descifra por stream hacia una DB temporal allowlisted, se compara con los campos seguros del manifest y se elimina sólo ante paridad exacta; una divergencia preserva DB y evidencia.
- La verificación final confirma el baseline original sin tráfico público ni requests al provider.

## Límites Explícitos

- Sin provider requests, tráfico público, DNS/Tunnel, routing, cambios de authority/schema/configuración ni mutaciones de la DB principal; la única instalación autorizada fue la candidate inmutable `73c764c8c679dc40`.
- La identidad privada `age` permanece off-host; no se imprimen secretos, audio ni transcripciones.
- Sólo puede eliminarse la DB temporal tras paridad exacta; ante divergencia se preserva junto con evidencia redacted.
- La autorización explícita quedó consumida por la transferencia, instalación y rehearsal exactos; no habilita operaciones externas adicionales.

## Criterios De Terminado

- Restart, rollback y retorno a current alcanzan readiness acotada con release, PID y listener esperados.
- El restore aislado coincide en schema, authority, counts y projection hashes, y su DB temporal se elimina sólo después del match.
- El baseline final coincide con el preflight y conserva `cloudflare-authority`, loopback, markers, timers y backups.
- La evidencia queda redacted y el harness conserva el error original si necesita recovery.

## Checks Focales Mínimos

- Preflight de release/symlink, schema, markers, listener, health/readiness/Admin y backup/manifest schema 6.
- Readiness acotada y recovery single-entry durante restart, rollback y retorno.
- Comparador del manifest sobre la DB temporal restaurada.
- Verificación final de baseline, recursos/timers/backups y journal allowlisted sin datos sensibles.

## Receipt De Ejecución — 2026-07-22

El preflight confirmó current `4075da53…`, rollback `66652d0f…`, schema 6, markers 1/1, loopback, endpoints, timers, recursos y backup íntegros. Quedaron disponibles los CLI autorizados: `age` 1.3.1 ya estaba instalado y `zstd` 1.5.7 se instaló. Restart sobre current quedó verde.

El rollback `66652d0f…` no alcanzó readiness con la configuración provider-loopback vigente: el journal registró `config_invalid:FIXVOX_API_PUBLIC_BASE_URL` y 19 auto-restarts. El runner efímero no propagó ese timeout y continuó el retorno a current; no se reutilizará. Current quedó sano y `reset-failed` restauró el contador a cero sin otro restart. Baseline final: schema 6, markers 1/1, loopback único, endpoints 200, `cloudflare-authority` y privacy sentinel limpio.

El restore off-host sí alcanzó paridad exacta. Una configuración temporal con `dbname=postgres` desvió el comparador inicial, pero preservó la DB restaurada; la verificación explícita sobre la DB aislada confirmó schema, authority, counts y projection hashes. Luego se eliminó esa DB y las copias/configuración temporales. Se preservó un rol local `fixvox_migrator` `NOLOGIN` porque no puede atribuirse con certeza a esa corrida.

## Receipt De Cierre Provider-Loopback — 2026-07-22

Con autorización explícita, el preflight confirmó current `4075da53…`, schema 6, markers 1/1, provider configurado, restarts 0, loopback, health/readiness/Admin 200, recursos y `cloudflare-authority`. La candidate `73c764c8c679dc40` se transfirió con hashes exactos, se instaló `--install-only`, verificó 61/61 archivos e inmutabilidad y no cambió current ni PID.

El rehearsal reinició current, cambió atómicamente a `73c764c8c679dc40` y volvió a current: las tres etapas alcanzaron health/readiness/Admin 200, schema 6, markers 1/1 y loopback con PIDs distintos. El baseline final dejó current `4075da53…`, candidate instalada como rollback probado, service active/enabled, restarts 0, timers activos, backups 5/5 y staging limpio. La verificación independiente final corrigió una ERE no portable del primer privacy check sin repetir mutaciones: journal allowlisted, privacy verde y cero rutas/provider requests. Junto con el restore previo en paridad exacta, Gate F queda completo. No hubo tráfico público, DNS/Tunnel, routing ni cambios de schema/authority/configuración.
