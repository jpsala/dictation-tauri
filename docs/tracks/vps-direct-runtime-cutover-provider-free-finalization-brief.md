---
status: complete
execution_route: strong
started: 2026-07-24
updated: 2026-07-24
priority: high
owner: Pi
parent: specs/019-fixvox-self-hosted-control-plane
related:
  - docs/tracks/vps-direct-runtime-cutover-convergence-aware-brief.md
---

# VPS Direct Runtime Cutover — Provider-Free Finalization

## Objetivo

Dejar `auth-fixvox.jpsala.dev` sirviendo permanentemente desde el VPS sin una
segunda llamada provider.

## Comportamiento Observable

El hostname reemplaza el Custom Domain Worker por el CNAME del Tunnel, alcanza
tres `/health` 200 consecutivos de `fixvox-api` dentro de 150 segundos y queda
activo después de readiness, preflight y la verificación Worker/KV; la STT 200
ya consumida se acredita mediante su receipt y el log normalizado
`/v1/audio/:action`.

## Límites Explícitos

- Validar antes de mutar el receipt redactado de la STT previa y su único log
  VPS 200; no ejecutar audio, STT ni otra llamada provider.
- Usar la identidad persistida y la unit dedicada con
  `/usr/local/bin/cloudflared`; no tocar otros Tunnels.
- Sin deploy Worker, escrituras Workers KV, cliente, release, schema o provider
  config.
- Ante cualquier fallo, restaurar `fixvox-proxy` con health 200 y eliminar sólo
  los recursos dedicados del corte.

## Criterios De Terminado

- La evidencia STT previa queda validada y el hostname estabiliza tres health
  200 consecutivos desde `fixvox-api` dentro del límite.
- Readiness y preflight públicos responden 200 desde el VPS, y el CNAME y el
  connector dedicados quedan activos.
- La ventana del corte muestra cero invocaciones Worker y delta cero en Workers
  KV; ante fallo, el rollback queda verde y sin recursos dedicados.

## Checks Focales Mínimos

- Baseline de Worker, VPS, identidad, receipt STT previo y ausencia de recursos
  dedicados.
- Unit, conexiones, CNAME y convergencia estable antes de readiness/preflight.
- Analytics Worker, delta KV y health final del VPS o del Worker tras rollback.

## Receipt — 2026-07-24

La STT previa quedó acreditada sin repetir provider: el receipt redactado y el
journal VPS contienen una única entrada POST 200 normalizada como
`/v1/audio/:action`, con request ID y sólo campos allowlisted. Los ajustes
provider-free del harness fallaron cerrado antes del corte efectivo y cada uno
restauró el baseline sin dejar recursos dedicados.

El corte final creó un Tunnel local-managed aislado, dejó activa la unit con
`/usr/local/bin/cloudflared`, reemplazó el Custom Domain Worker por el CNAME
exacto y estabilizó tres `/health` 200 consecutivos de `fixvox-api` en
`19.124 s` y 10 probes. Readiness y preflight públicos dieron 200; el Custom
Domain Worker quedó ausente y el connector, CNAME y Tunnel dedicados permanecen
activos.

La ventana final registró cero invocaciones `fixvox-proxy`, delta cero y digest
sin cambios sobre 2351 keys de Workers KV, provider attempts 0, deploy Worker 0
y restarts VPS 0. Receipt redactado:
`artifacts/proxy-latency/vps-direct-runtime-cutover-provider-free-finalization-receipt.json`.
