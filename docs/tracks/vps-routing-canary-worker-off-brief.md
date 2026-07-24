---
status: complete
execution_route: strong
started: 2026-07-23
updated: 2026-07-23
priority: high
owner: Pi
parent: docs/tracks/vps-routing-canary-brief.md
related:
  - docs/tracks/vps-routing-canary-source-parity-brief.md
---

# VPS Routing Canary — Worker Off

## Objetivo

Desplegar el soporte de routing revisado sobre la base productiva byte-parity,
con trigger y kill switch ausentes o apagados para mantener todo el tráfico en
el Worker.

## Comportamiento Observable

El Worker productivo conserva health verde, ninguna request alcanza el VPS y la
versión activa previa queda disponible como rollback exacto.

## Límites Explícitos

- Sin crear Tunnel, DNS o Access ni habilitar trigger, kill switch, identidad canary o routing efectivo.
- Sin audio, provider call, mutación VPS, cambio de authority, commit, push ni trabajo de los Gates D/E.
- Autorización explícita de JP otorgada el 2026-07-23 sólo para este deploy con routing apagado; cualquier ampliación requiere un gate nuevo.

## Criterios De Terminado

- Se despliega únicamente el patch canary verificado sobre la base fuente que reproduce el Worker activo.
- Trigger y kill switch permanecen ausentes o apagados y no hay tránsito al VPS.
- Worker health sigue verde y la versión activa previa queda confirmada como rollback exacto.

## Checks Focales Mínimos

- Dos tests focales de routing y `wrangler deploy --dry-run` sobre la base reconstruida.
- Inspección redacted de versión y configuración antes y después del deploy.
- Health público y confirmación de cero tránsito al VPS.

## Resultado Del Batch — 2026-07-23

Se reconstruyó la base `8e5dd3d` con los patches de instrumentación y routing:
los 2 tests focales pasaron y el dry-run reprodujo el bundle canary esperado
(`516315` bytes, SHA-256 `7ce5be7a…e575`). El preflight confirmó Worker activo
`e8c642c3-6543-4794-8f32-b763a48c105a`, health 200 y ausencia tanto de secrets
canary como de `control:vps-routing-canary:v1`.

Wrangler desplegó `4a97683d-0198-4af5-8f70-ee892a5a9253`. El health posterior
siguió 200/`ok`, los bindings no contienen trigger, origin ni credenciales
canary y la clave KV continúa ausente; por lo tanto el routing permanece
inoperable y no existe camino de tránsito al VPS. La versión previa
`e8c642c3-6543-4794-8f32-b763a48c105a` permanece listada como rollback exacto.
No hubo Tunnel, DNS, Access, audio, provider, mutación VPS, commit ni push.
