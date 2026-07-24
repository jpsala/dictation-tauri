---
status: complete
execution_route: strong
started: 2026-07-23
updated: 2026-07-23
priority: high
owner: Pi
parent: docs/tracks/vps-routing-canary-single-attempt-brief.md
related:
  - docs/tracks/vps-routing-canary-worker-off-brief.md
---

# VPS Routing Canary — Provider-Free Diagnostic

## Objetivo

Aislar localmente por qué el intento autorizado no produjo receipt de routing
ni alcanzó el VPS.

## Comportamiento Observable

Un harness provider-free reproduce la forma exacta del request y la frontera de
routing desplegada, identifica la rama que impidió llegar al origin y deja una
prueba focal que distingue ese fallo del camino `vps-canary` válido.

## Límites Explícitos

- Sólo código y tests locales; sin VPS, Cloudflare, Worker deploy, secretos,
  identidad real, audio real ni llamadas provider.
- No autoriza otro canary, retry, cambio de contrato ni hardening adyacente.
- Preservar los cambios WIP existentes y mantener toda evidencia redacted.

## Criterios De Terminado

- La reproducción local explica de forma determinista la ausencia simultánea de
  receipt y evento VPS observada en el intento consumido.
- El test focal falla antes del fix y pasa con la corrección mínima, sin abrir
  routing para una identidad no-canary ni agregar retry/fallback.
- El camino válido conserva una sola invocación al origin y receipt
  `vps-canary`; el camino no-canary permanece en Worker.

## Checks Focales Mínimos

- Test focal del routing canary en `cloud/fixvox-proxy/src/managed-execution.test.ts`.
- Inspección del diff para confirmar que sólo cambia la frontera diagnosticada
  y que no introduce efectos externos.

## Resultado Del Batch — 2026-07-23

El harness reprodujo la forma consumida por el cliente gestionado: multipart con
`X-Device-Id` y sin header canary. Antes del fix esa request pasaba al Worker
porque la frontera exigía además un trigger aportado por la request; por eso no
podía emitir receipt `vps-canary` ni alcanzar el origin.

La corrección mínima hace que el KV server-owned (`enabled` más hash de
identidad) sea la única selección de ruta. El test focal falló antes con receipt
nulo y pasó después: la identidad allowlisted invoca una vez el origin y recibe
`vps-canary`; la no-canary invoca una vez el upstream Worker. No hay retry,
fallback, provider real ni efectos externos. `git diff --check` quedó limpio;
los diagnósticos LSP del paquete siguen mostrando únicamente el baseline de
tipos Cloudflare/Bun no resueltos por la configuración raíz.
