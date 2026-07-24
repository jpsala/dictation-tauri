---
status: complete
execution_route: strong
started: 2026-07-24
updated: 2026-07-24
priority: high
owner: Pi
parent: specs/019-fixvox-self-hosted-control-plane
related:
  - docs/tracks/vps-direct-runtime-cutover-corrected-connector-brief.md
---

# VPS Direct Runtime Cutover — Provider-Free Diagnostic

## Objetivo

Aislar provider-free por qué `auth-fixvox.jpsala.dev` no convergió al Tunnel
dedicado aunque el connector y el CNAME estaban verdes.

## Comportamiento Observable

Una secuencia acotada de `/health` correlaciona el estado del Custom Domain,
DNS y Tunnel con el servicio que responde en el edge, identificando la fase que
impide o demora la convergencia.

## Límites Explícitos

- Usar sólo `/health`: sin identidad, preflight, audio, STT ni provider calls.
- Sin deploy Worker, Workers KV, release, schema o provider config; no tocar
  otros Tunnels.
- Restaurar automáticamente el Custom Domain Worker y eliminar CNAME, Tunnel,
  unit, config y credencial dedicados tanto en éxito como en fallo.
- No convertir el diagnóstico en otro intento de cutover ni repetirlo para
  probar una corrección.

## Criterios De Terminado

- La evidencia temporal distingue la fase exacta que bloquea la convergencia
  entre Custom Domain, DNS, edge y connector.
- Todos los probes son provider-free y no cambian Workers KV ni el runtime VPS.
- El cierre deja `fixvox-proxy` sirviendo health 200 y cero recursos dedicados.

## Checks Focales Mínimos

- Baseline de Worker, DNS, VPS y ausencia de recursos dedicados.
- Estado API/DNS/Tunnel y probes `/health` correlacionados durante una única
  ventana acotada.
- Health Worker 200, VPS ready/restarts y cleanup total al finalizar.

## Receipt — 2026-07-24

El diagnóstico aisló una convergencia demorada, no un fallo del connector. Tras
separar el Custom Domain, DNS quedó vacío y 10/10 probes devolvieron 522. Con el
CNAME proxied exacto al Tunnel, los primeros 54 probes siguieron en 522; unos
110 segundos después del primer probe con CNAME, los últimos 6 respondieron
200 desde `fixvox-api`.

El Tunnel registró delta `+9`, Workers KV quedó en `0`, provider attempts `0` y
el VPS mantuvo restarts `0`. El cleanup restauró el Custom Domain de
`fixvox-proxy` con health 200 y dejó cero Tunnel, CNAME, unit, config,
credencial o listener dedicados. Receipt redactado:
`artifacts/proxy-latency/vps-direct-runtime-cutover-diagnostic-receipt.json`.
