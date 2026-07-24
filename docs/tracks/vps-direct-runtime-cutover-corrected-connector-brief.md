---
status: blocked
execution_route: strong
started: 2026-07-24
updated: 2026-07-24
priority: high
owner: Pi
parent: specs/019-fixvox-self-hosted-control-plane
related:
  - docs/tracks/vps-direct-runtime-cutover-brief.md
  - docs/tracks/vps-gate-f-external-closure-brief.md
---

# VPS Direct Runtime Cutover — Corrected Connector

## Objetivo

Completar en una sola corrida recuperable el cutover del hostname actual al VPS
usando el ejecutable remoto real de `cloudflared` y una única STT controlada.

## Comportamiento Observable

La identidad local ya registrada conserva preflight permitido; el hostname
sirve health, readiness, preflight y STT desde VPS/PostgreSQL por Cloudflare
Tunnel, sin invocaciones Worker ni incrementos en Workers KV.

## Límites Explícitos

- Verificar antes de DNS que la unit dedicada arranca con
  `/usr/local/bin/cloudflared`; no reutilizar ni modificar otros Tunnels.
- Usar la identidad persistida mediante fronteras soportadas, sin SQL manual,
  import de cuentas, cambios de schema, cliente, release o provider config.
- Ejecutar una sola STT provider, sin retry; ante cualquier fallo posterior al
  cutover, restaurar la ruta Worker y confirmar health en la misma corrida.
- Cloudflare conserva DNS, TLS y Tunnel; no abrir puertos públicos ni ampliar el
  batch con trabajo adyacente.

## Criterios De Terminado

- Identidad y preflight VPS están verdes, y la unit dedicada mantiene el Tunnel
  activo con el ejecutable remoto verificado antes de cambiar DNS.
- Health, readiness, preflight y la única STT responden por el hostname desde el
  VPS con receipt inequívoco.
- La ventana correlacionada muestra delta cero en invocaciones Worker y Workers
  KV.
- Si falla un check, el Worker vuelve a servir el hostname con health 200.

## Checks Focales Mínimos

- Baseline de Worker, VPS, ruta e identidad; arranque y conexión del Tunnel antes
  de mutar DNS.
- Health/readiness/preflight por el dominio y receipt de la única STT.
- Delta correlacionado Worker/KV y health final del VPS, o health del Worker tras
  rollback.

## Receipt — 2026-07-24

La identidad persistida y el preflight loopback VPS siguieron permitidos. El
Tunnel dedicado se creó aislado, su connector quedó activo y conectado, y la
unit verificó antes de DNS el `ExecStart` real en
`/usr/local/bin/cloudflared`. El custom domain Worker se separó y el DNS quedó
como único CNAME proxied al Tunnel esperado.

El hostname no llegó a servir `fixvox-api` dentro de la ventana acotada de
convergencia, por lo que se detuvo antes de health/readiness/preflight públicos
y antes de STT: provider attempts `0`. No se abrió otro frente ni se reintentó
la llamada provider.

El rollback automático eliminó el CNAME, Tunnel, unit, config y credencial
dedicados, volvió a adjuntar el custom domain a `fixvox-proxy` y confirmó health
público 200. Verificación independiente: cero Tunnels dedicados, VPS activo con
restarts `0`, readiness `cloudflare-authority` y sin listener de métricas. El
resultado observable queda bloqueado; un nuevo intento requiere explicar por
qué el hostname no convergió al connector ya activo antes de autorizar más
DNS/STT.
