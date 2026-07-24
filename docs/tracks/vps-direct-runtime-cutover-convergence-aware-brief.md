---
status: blocked
execution_route: strong
started: 2026-07-24
updated: 2026-07-24
priority: high
owner: Pi
parent: specs/019-fixvox-self-hosted-control-plane
related:
  - docs/tracks/vps-direct-runtime-cutover-diagnostic-brief.md
---

# VPS Direct Runtime Cutover — Convergence-Aware

## Objetivo

Mover el hot path de `auth-fixvox.jpsala.dev` al VPS en una sola corrida,
esperando la convergencia medida del edge antes de la única STT.

## Comportamiento Observable

El hostname reemplaza el Custom Domain Worker por el CNAME del Tunnel, atraviesa
la ventana transitoria de 522 y sólo después de estabilizar `/health` en
`fixvox-api` procesa readiness, preflight y una STT desde VPS/PostgreSQL, sin
invocaciones Worker ni cambios en Workers KV.

## Límites Explícitos

- Esperar como máximo 150 segundos y exigir tres health 200 consecutivos de
  `fixvox-api`; si no ocurre, restaurar el Worker sin preflight ni STT.
- Usar la identidad persistida y la unit dedicada con
  `/usr/local/bin/cloudflared`; no tocar otros Tunnels.
- Sin deploy Worker, Workers KV, cliente, release, schema o provider config.
- Ejecutar una sola STT provider, sin retry; cualquier fallo posterior al corte
  restaura el Custom Domain Worker y confirma health 200.

## Criterios De Terminado

- El connector y CNAME exactos quedan activos, y el hostname estabiliza tres
  health 200 consecutivos desde `fixvox-api` dentro del límite.
- Readiness, preflight y la única STT responden por el hostname desde el VPS con
  receipt inequívoco.
- La ventana correlacionada muestra cero invocaciones Worker y delta cero en
  Workers KV; ante un fallo, el Worker queda restaurado con health 200.

## Checks Focales Mínimos

- Baseline de Worker, VPS, identidad y ausencia de recursos dedicados.
- Unit en `/usr/local/bin/cloudflared`, conexiones, CNAME y convergencia estable
  de `/health` antes de preflight/STT.
- Readiness, preflight, receipt de la única STT, Worker/KV y health final del VPS
  o del Worker tras rollback.

## Receipt — 2026-07-24

El edge convergió en `126.258 s`: 62 probes alcanzaron los tres `/health` 200
consecutivos requeridos desde `fixvox-api`. Readiness y preflight públicos dieron
200, y la única STT autorizada respondió 200 por el VPS con request ID,
transcript presente y exactamente un log allowlisted normalizado como
`/v1/audio/:action`; Workers KV conservó delta cero.

El harness esperaba erróneamente la ruta literal `/v1/audio/transcriptions` en
el journal y declaró `vps_stt_receipt_ambiguous` después de la respuesta válida.
Como exigía el brief, no reintentó: restauró `fixvox-proxy` con health 200 y
eliminó CNAME, Tunnel, unit, config y credencial dedicados. VPS quedó en
`4075da53c365a8b1`, restarts 0 y `cloudflare-authority`. El check de analytics
Worker no llegó a ejecutarse antes del rollback, por lo que el cutover final no
queda activo ni completo. Receipt redactado:
`artifacts/proxy-latency/vps-direct-runtime-cutover-convergence-receipt.json`.
