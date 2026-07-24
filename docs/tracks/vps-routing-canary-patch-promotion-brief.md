---
status: paused
execution_route: balanced
started: 2026-07-23
updated: 2026-07-24
priority: high
owner: Pi
parent: docs/tracks/vps-routing-canary-provider-free-diagnostic-brief.md
related:
  - docs/tracks/vps-routing-canary-source-parity-brief.md
---

# VPS Routing Canary — Local Patch Promotion

## Objetivo

Promover la corrección server-owned validada al patch canary local reproducible.

## Comportamiento Observable

El patch preservado aplica limpiamente sobre la base conocida y reproduce la
frontera corregida: la identidad allowlisted toma `vps-canary` sin trigger de
cliente y la identidad no-canary permanece en Worker.

## Límites Explícitos

- Sólo patch, código y tests locales; sin deploy, Cloudflare, KV/VPS, provider,
  secretos, identidad o audio reales.
- No autoriza otro canary, retry, rollout, release ni cambios fuera de la
  frontera diagnosticada.
- Preservar la base de instrumentación y los cambios WIP ajenos.

## Criterios De Terminado

- El patch canary local contiene la corrección ya validada y aplica sin conflicto
  sobre la base reproducible.
- El test focal confirma una sola invocación `vps-canary` para la identidad
  allowlisted y Worker para la no-canary.
- El diff resultante queda limitado a la selección de ruta y su prueba focal.

## Checks Focales Mínimos

- Aplicación limpia del patch sobre la base local conocida e inspección del diff.
- Test focal de routing en `cloud/fixvox-proxy/src/managed-execution.test.ts`.

## Pausa — 2026-07-24

El cutover directo dejó el hot path en VPS y el Worker sólo como rollback sin
Custom Domain. La promoción del patch canary no es necesaria para el release
desktop actual y permanece pausada junto con el WIP local, sin deploy.
