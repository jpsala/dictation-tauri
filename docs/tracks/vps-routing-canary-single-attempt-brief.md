---
status: blocked
execution_route: strong
started: 2026-07-23
updated: 2026-07-23
priority: high
owner: Pi
parent: docs/tracks/vps-routing-canary-brief.md
related:
  - docs/tracks/vps-routing-canary-d1-provider-free-brief.md
  - docs/tracks/vps-routing-canary-worker-off-brief.md
---

# VPS Routing Canary — Single Attempt And Return

## Objetivo

Reconciliar temporalmente la identidad JP en el VPS, ejecutar un único canary
de transcripción y retornar de inmediato al Worker con cleanup total.

## Comportamiento Observable

La identidad JP pasa de `403` a contexto válido en el VPS, completa una sola
transcripción con receipt `vps-canary` y exactamente una llamada provider; una
identidad no-canary permanece en el Worker y, al cerrar, ambas vuelven al
Worker sin conservar el alta temporal.

## Límites Explícitos

- El alta usa sólo la identidad JP ya persistida localmente y una frontera de
  registro soportada; sin SQL manual, import de cuentas ni cambios de schema.
- Cloudflare conserva front door y authority; identidad, Tunnel, DNS, Access,
  secretos y routing del canary son efímeros y se eliminan al retornar.
- Un solo intento provider, sin retry, mirroring, tráfico porcentual ni fallback
  después de iniciar el canary.
- No persistir ni exponer audio, transcript, credenciales o identificadores
  crudos; toda evidencia queda redacted.

## Criterios De Terminado

- La identidad JP obtiene contexto VPS válido sin alterar otra identidad,
  cuenta o perfil.
- El canary responde correctamente con receipt `vps-canary`, marker previo,
  exactamente una llamada provider y cero retry.
- La identidad no-canary permanece en el Worker durante el intento.
- El alta temporal, routing y recursos efímeros quedan removidos; JP y
  no-canary vuelven al Worker con health y authority verdes.

## Checks Focales Mínimos

- Preflight redacted de baseline/rollback y transición JP `403 → 200` sin
  provider ni conflicto de identidad.
- Receipt de ruta, marker y conteo provider del único intento, más control
  no-canary.
- Confirmación final del retorno al Worker, remoción del alta temporal y cleanup
  total con Worker/VPS verdes.

## Receipt — 2026-07-23

El preflight registró JP por `/v2/device/register` con la identidad local ya
persistida y verificó `403 → 200` sin conflicto. Tunnel, DNS, Access y secretos
fueron efímeros; el control no-canary permaneció en Worker y el marker
append-only quedó en `1` antes del intento.

El único intento autorizado no produjo receipt `vps-canary` ni evento VPS; no
hay reservation ni evidencia de llamada provider. El intento queda consumido y
no se repitió. Cleanup posterior removió identidad, KV, cuatro secretos, DNS,
Access, Tunnel, connector y temporales. JP vuelve a `403` en VPS; Worker health
200 y VPS active, restarts 0, readiness 200 con `cloudflare-authority`.

El resultado observable queda bloqueado. Cualquier diagnóstico o nuevo intento
requiere un brief nuevo por `/flow → Planear`; este track no autoriza retry.
