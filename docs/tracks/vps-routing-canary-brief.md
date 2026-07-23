---
status: blocked
execution_route: strong
started: 2026-07-22
updated: 2026-07-22
priority: high
owner: Pi
parent: specs/019-fixvox-self-hosted-control-plane
related:
  - docs/tracks/vps-persistent-provider-canary-plan.md
  - docs/tracks/fixvox-self-hosted-checkpoint-f-vps-loopback-plan.md
---

# VPS Routing Canary

## Objetivo

Enrutar una única identidad JP allowlisted al VPS para un dictado controlado
y reversible, sin cambiar la autoridad productiva.

## Comportamiento Observable

- La identidad canary usa el VPS mediante el hostname existente; el resto del
  tráfico continúa en el Worker.
- El dictado controlado produce una sola llamada al provider, sin mirroring ni
  retry, y respeta el profile efectivo.
- Cloudflare conserva la autoridad y el rollback devuelve inmediatamente la
  identidad canary al Worker.

## Límites Explícitos

- No ejecutar hasta cerrar F5R3-F6 y Checkpoint G, y obtener autorización
  explícita para DNS/Tunnel, canary y provider real.
- Sin cutover de authority, import final, cambio de hostname o contrato de
  cliente, ni tráfico porcentual.
- Una identidad y un dictado controlado; no persistir audio, transcript,
  credenciales ni identificadores crudos.

## Criterios De Terminado

- La identidad canary completa el dictado por VPS con respuesta correcta y
  exactamente una llamada al provider.
- Una identidad no-canary permanece en el Worker y Cloudflare sigue declarada
  como authority.
- La evidencia queda redacted y no contiene contenido ni identificadores
  crudos.
- El rollback al Worker pasa y no requiere reparación de datos.

## Checks Focales Mínimos

- Health, readiness, Admin y authority antes y después.
- Probes de routing canary/no-canary.
- Contador de provider y receipt redacted del único dictado.
- Probe post-rollback por Worker.
