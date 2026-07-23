---
status: complete
execution_route: strong
started: 2026-07-22
updated: 2026-07-22
priority: high
owner: Pi
parent: specs/019-fixvox-self-hosted-control-plane
related:
  - docs/tracks/vps-gate-f-external-closure-brief.md
  - docs/tracks/fixvox-self-hosted-checkpoint-f-vps-loopback-plan.md
  - docs/runbooks/fixvox-api-vps.md
---

# VPS Provider-Loopback Rollback Candidate

## Objetivo

Producir localmente una candidate de rollback inmutable y provider-loopback-compatible desde los artifacts aprobados de `4075da53c365a8b1`.

## Comportamiento Observable

- El source archive verifica SHA-256 `4075da53c365a8b1fa93bba16899a8c097d8a1378e7d1753ce9606592f5f914a` y su manifest `afb6da329985328a6ffaee7ce6b1ef4a891c13f5bc5d94a9d458102f79efb7b7`.
- Dos builds aislados generan candidate y manifest idénticos entre sí, con release ID distinto del source y runtime byte-identical.
- Un boot aislado provider-configured con credencial fixture alcanza health/readiness en loopback sin llamadas externas.

## Límites Explícitos

- Sólo se leen los artifacts aprobados; nunca se toma runtime del checkout actual.
- Sin cambios de código, configuración, schema o authority, y sin secretos reales ni provider calls.
- Sin SSH, VPS, transferencia, instalación, promoción ni cambio de `current`.

## Criterios De Terminado

- Los dos builds son deterministas y producen una release ID nueva.
- Todos los paths y hashes runtime coinciden exactamente con el source y pasan allowlist/privacy.
- El boot provider-loopback aislado queda verde y limpia sus procesos y temporales.

## Checks Focales Mínimos

- Sintaxis shell y smoke focal del builder.
- Dos builds independientes y comparación de archive/manifest.
- Comparación integral de paths/hashes más allowlist/privacy.
- Boot aislado provider-configured con fixture y cero llamadas externas.

## Receipt De Ejecución — 2026-07-22

Candidate local `73c764c8c679dc40`, archive SHA-256 `73c764c8c679dc4089af8a0841562e4c04ea00aac9d4916cc9d9dad17e382551` y manifest SHA-256 `7d17a011e2d10f5b7e9b74df9ee894483c04a2f21eaee62fdc861fcb5891f7f4`. Dos builds aislados fueron idénticos; los 61 paths y hashes runtime coinciden con `4075da53…`; allowlist/privacy pasaron. El `main.ts` extraído arrancó provider-configured con key fixture y PostgreSQL local aislado `fixvox_test`; el preflight confirmó schema 6 y `cloudflare-authority`, health/readiness dieron 200, no se solicitaron rutas provider y el proceso/puerto quedaron limpios. Artifacts ignorados: `artifacts/fixvox-api-provider-loopback-rollback/`. No hubo checkout runtime, secretos reales, mutación de DB/schema/authority, SSH, VPS, instalación, promoción ni cambio de `current`.
