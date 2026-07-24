---
status: complete
execution_route: strong
started: 2026-07-23
updated: 2026-07-23
priority: high
owner: Pi
parent: docs/tracks/vps-routing-canary-brief.md
related:
  - docs/tracks/vps-routing-canary-access-gate-brief.md
---

# VPS Routing Canary — D1 Provider-Free

## Objetivo

Probar `edge → Tunnel dedicado → loopback` sin provider ni routing productivo.

## Comportamiento Observable

Sin credencial Access el origen responde `403`; con service token responde `200` con un marcador fijo y aumenta la métrica del Tunnel, tras lo cual `/health` y `/ready` responden autenticados por el mismo canal privado.

## Límites Explícitos

- Configurar Access antes de arrancar el connector y no tocar los Tunnels existentes.
- Sin Worker deploy, KV, identidad, audio, provider ni routing.
- Eliminar Tunnel, DNS, Access, connector y temporales tanto en éxito como en fallo.

## Criterios De Terminado

- Los probes sin y con credencial producen respectivamente `403` y `200`, y la métrica confirma tránsito por el Tunnel dedicado.
- `/health` y `/ready` responden autenticados por el mismo canal sin cambiar authority ni baseline productivo.
- El cleanup deja ausentes todos los recursos D1 temporales y preserva VPS/Worker.

## Checks Focales Mínimos

- Preflight redacted del token scoped, baseline VPS/Worker y ausencia de recursos D1.
- Probes Access `403/200`, marcador fijo y delta de métrica del Tunnel.
- `/health`, `/ready` y verificación final de cleanup y baseline.

## Receipt — 2026-07-23

D1 quedó completo sin provider ni routing productivo. Un hostname, Tunnel, Access app/policy y service token dedicados produjeron `403` sin credencial y `200` autenticado con marcador `FIXVOX_D1_OK`; `cloudflared_tunnel_total_requests` aumentó `0 → 1`. El mismo canal privado respondió `/health` y `/ready` con HTTP 200 y `cloudflare-authority`.

El cleanup final dejó cero apps/tokens/DNS/Tunnels D1, units, listeners `18790`/`49312`, credenciales, configs y temporales. VPS permanece en `4075da53c365a8b1`, servicio active/enabled, restarts 0, único loopback `8790`, health/readiness verdes; Worker público sigue 200. No hubo Worker deploy, KV, identidad, audio, provider, routing, cambio de authority, commit ni push.
