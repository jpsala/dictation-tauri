---
name: aos-fleet-update
description: Run an ordered AOS fleet update across selected repos using pi-long-task instead of dgoal. Use when JP says `aos-fleet-update`, `actualizar repos`, `actualizar nuestras repos`, or wants a serial multi-repo AOS rollout with checks and local commits.
---

# AOS Fleet Update

Usar el comando Pi local:

```text
/aos-fleet-update --preview|--dry-run|--execute|--commit <repo...>
```

Default sin repos: `copicu`, `constelaciones`, `dictation-tauri`, `pi`, `infra`, `telegram`, `whatsapp`, `discord`.

Reglas:

- Motor principal: `pi_long_task` con TODO markdown explicito y `commit=false` a nivel tool.
- Procesar repos en orden, sin writers paralelos.
- Commits locales por repo solo con `--commit`; nunca push.
- Stagear solo docs/scripts AOS allowlisted e index generado.
- Preservar dirty state preexistente de producto/runtime/deploy/datos.
- No usar `dgoal` para este flujo mientras su UX/i18n/gate sea frágil.

Fuente canonica: `docs/topics/agent-tool-routing.md` y `docs/reference/tool-routing.yaml`.
