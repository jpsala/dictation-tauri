---
name: aos-fanout
description: Maximize safe use of threads/subagents for an AOS task. Use when JP says `aos-fanout`, `aos-threads`, `/aos-fanout`, `do all you can with threads`, or wants the agent to parallelize everything that is safe.
---

# AOS Fanout

Alias intensivo de `aos-orquestar`: buscar activamente paralelismo seguro antes de empezar y usar threads/subagentes cuando aportan valor real.

Fuente canonica: `docs/topics/pi-agentic-os.md#orquestacion-con-threadssubagentes` y `docs/skills/aos-orquestar/`.

## Regla

- Si hay frentes independientes, usar `spawn_agent` con prompts autocontenidos.
- Preferir `explorer` read-only; usar `worker` solo con ownership exclusivo por archivo/repo y verificacion clara.
- No pedir confirmacion para fan-out seguro cuando JP invoco `aos-fanout` o `/aos-fanout`.
- Si la descomposicion tiene riesgo, pedir `ask_user` o trabajar serial.
- El hilo principal integra, verifica y conserva la decision final.

No paralelizar secretos, deploy/push, acciones destructivas, decisiones humanas, refactors sobre los mismos archivos ni tareas pequenas donde coordinar cueste mas que hacerlas serial.
