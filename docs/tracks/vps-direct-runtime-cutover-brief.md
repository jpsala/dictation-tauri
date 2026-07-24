---
status: blocked
execution_route: strong
started: 2026-07-23
updated: 2026-07-24
priority: high
owner: Pi
parent: specs/019-fixvox-self-hosted-control-plane
related:
  - docs/tracks/vps-routing-canary-provider-free-diagnostic-brief.md
  - docs/tracks/vps-gate-f-external-closure-brief.md
---

# VPS Direct Runtime Cutover

## Objetivo

Registrar la identidad local en el VPS y mover en una sola corrida el hot path
del desktop a VPS/PostgreSQL detrás de Cloudflare Tunnel.

## Comportamiento Observable

La identidad ya persistida en el desktop queda registrada mediante la frontera
soportada; luego el hostname actual procesa preflight y una STT controlada en el
VPS, sin cambios de cliente, invocaciones Worker ni incrementos en Workers KV.

## Límites Explícitos

- El batch autoriza el registro persistente de esa única identidad local por
  `/v2/device/register`, el cambio DNS/Tunnel y una sola STT provider.
- Sin SQL manual, import de cuentas, cambios de schema o contrato, instalación
  del desktop, release, segundo intento ni trabajo adyacente.
- Cloudflare conserva DNS, TLS y Tunnel; no exponer un puerto público del VPS.
- Ante cualquier fallo posterior al registro, restaurar sólo la ruta Worker en
  la misma corrida; evidencia redacted, sin audio, transcript, secretos ni IDs.

## Criterios De Terminado

- La identidad local queda registrada en VPS y su preflight devuelve
  `allowed=true` antes del cutover.
- Health, readiness, preflight y una STT responden por el hostname desde
  VPS/PostgreSQL con receipt inequívoco.
- La STT produce cero invocaciones Worker y delta cero en Workers KV.
- Si falla un check, la ruta Worker queda restaurada con health verde.

## Checks Focales Mínimos

- Baseline de Worker, VPS y ruta antes de mutar.
- Registro soportado y preflight VPS `allowed=true` para la identidad local.
- Health/readiness/preflight por el dominio, receipt de la única STT y delta
  cero correlacionado en Worker/KV.
- Health final del VPS con ruta activa, o del Worker tras rollback.

## Receipt — 2026-07-24

La identidad local quedó registrada de forma persistente por la frontera
soportada y el preflight loopback del VPS devolvió `allowed=true`. El Tunnel
dedicado llegó a crearse, pero su unit falló antes de tocar la ruta pública:
el binario remoto real está en `/usr/local/bin/cloudflared` y el runner había
fijado `/usr/bin/cloudflared`.

La misma corrida eliminó unit, configuración, credencial y Tunnel dedicados;
el custom domain/AAAA del Worker permaneció operativo. Verificación final:
Worker público `fixvox-proxy` 200, VPS active con restarts 0 y readiness 200 en
`cloudflare-authority`, sin recursos del Tunnel. No hubo cutover DNS, STT ni
llamada provider; el conteo allowlisted sólo registró device/preflight y health.

El resultado observable queda bloqueado. Este brief no autoriza corregir y
repetir la corrida; hace falta `/flow → Planear` para un nuevo intento acotado.
