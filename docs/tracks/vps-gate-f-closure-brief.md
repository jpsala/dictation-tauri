---
status: complete
execution_route: strong
started: 2026-07-22
updated: 2026-07-22
priority: high
owner: Pi
parent: specs/019-fixvox-self-hosted-control-plane
related:
  - docs/tracks/fixvox-self-hosted-checkpoint-f-vps-loopback-plan.md
  - docs/runbooks/fixvox-api-vps.md
---

# VPS Gate F Closure

## Objetivo

Preparar localmente un harness con polling acotado de readiness y recovery no reentrante para una futura ejecución autorizada de Gate F.

## Comportamiento Observable

- Readiness se consulta hasta pasar o alcanzar un timeout explícito.
- Ante un fallo posterior a una mutación, recovery desactiva el trap primario, se ejecuta una sola vez, verifica el baseline restaurado y conserva el error original.

## Límites Explícitos

- Sin SSH, VPS, provider, decrypt, restore ni mutaciones externas.
- Sin cambiar releases, configuración, schema, authority ni ampliar el contrato vigente de Gate F.
- Sin imprimir secretos ni datos sensibles.

## Criterios De Terminado

- Éxito demorado y timeout de readiness producen resultados deterministas.
- Recovery permanece single-entry aunque falle una de sus verificaciones.
- El harness pasa su validación local sin acceder a servicios externos.

## Checks Focales Mínimos

- Validación de sintaxis shell.
- Test o dry-run con comandos stub para éxito demorado, timeout y recovery no reentrante.

## Receipt Local — 2026-07-22

`ops/fixvox-api/gate-f-harness.sh` agregó polling acotado y recovery single-entry que restaura/verifica baseline sin reemplazar el error original. El smoke local con stubs pasó éxito demorado, timeout `124`, recovery/verificación fallidos sin reentrada y fallo previo a mutación; no accedió a servicios externos. Este brief queda completo; F5R3-F5R4/F6 siguen bloqueados detrás de planificación y autorización externas específicas.
