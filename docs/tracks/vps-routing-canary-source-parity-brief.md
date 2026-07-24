---
status: complete
execution_route: strong
started: 2026-07-23
updated: 2026-07-23
priority: high
owner: Pi
parent: docs/tracks/vps-routing-canary-worker-off-brief.md
---

# VPS Routing Canary — Source Parity

## Objetivo

Reconstruir una base fuente auditable cuyo bundle sea byte-parity con el Worker
activo `e8c642c3-6543-4794-8f32-b763a48c105a`.

## Comportamiento Observable

Una construcción limpia reproduce exactamente el artifact activo y, al aplicar
el patch canary preservado, el único cambio del bundle es el soporte de routing
revisado.

## Límites Explícitos

- Sin deploy, cirugía del artifact compilado ni cambios de configuración Cloudflare o KV.
- Sin VPS, provider, audio, secretos, commit, push ni trabajo adyacente.

## Criterios De Terminado

- El bundle reconstruido coincide byte a byte con el Worker activo.
- El origen fuente y commit de la base quedan identificados y reproducibles.
- El diff base→patch contiene únicamente el soporte de routing revisado.
- Los tests focales y el dry-run del Worker pasan.

## Checks Focales Mínimos

- Hash y comparación byte a byte entre bundle activo y reconstruido.
- Diff focal del bundle base contra el bundle con patch.
- Dos tests focales de routing y `wrangler deploy --dry-run` sin deploy.

## Resultado Del Batch — 2026-07-23

Base reconstruida desde commit `8e5dd3d50824c513b65c16f5765a9f7202aac936`
más `cloud/fixvox-proxy/patches/active-v159-instrumentation.patch`. Wrangler
`4.110.0` produjo `513153` bytes y SHA-256
`4f8a2eb352c2104f0d9f330d88f3ebbbdf90f5aeaa5086834c896c7af9f3f953`;
`cmp` contra el módulo activo descargado resultó idéntico.

`active-v159-vps-routing-canary.patch` aplica limpiamente sobre esa base. Su
bundle mide `516315` bytes, SHA-256
`7ce5be7ac103a0f9919e28afcf30ad9331cdc300b306bcd9885f871685b0e575`, y el
diff base→canary contiene `62` líneas agregadas, cero removidas y sólo el
soporte de routing revisado. Los dos tests focales pasaron y ambos dry-runs de
Wrangler terminaron sin deploy.

Reproducción: extraer `cloud/fixvox-proxy` y `cloud/fixvox-core` con
`git archive 8e5dd3d`, aplicar primero el patch de instrumentación y luego el
patch canary con `patch -p1`; construir cada etapa con
`wrangler deploy --dry-run --outdir <dir>` desde `cloud/fixvox-proxy`.

No hubo deploy, mutación Cloudflare/KV/VPS, provider, audio, secretos, commit ni
push. El deploy del brief padre continúa como gate externo separado.
