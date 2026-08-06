---
id: portable-multiharness-contract
status: reference
kind: topic
triggers: [traycer, omp, harness, handoff, worktree]
primary_refs: [AGENTS.md, docs/reference/tool-routing.yaml]
---

# Contrato portable multi-harness

- Traycer con el harness nativo activo es la interacción diaria y el dueño de
  la intención, planificación y edición de esta sesión.
- OMP es standalone/manual: no se invoca desde Traycer y no requiere `.traycer`
  ni leer artifacts del manager.
- Este repo no usa Pi como ruta diaria; cualquier uso de producto/laboratorio
  conserva sus gates locales y queda fuera de esta capa portable.
- El owner del worktree actual integra cambios; simultaneidad exige ramas o
  worktrees separados y ownership explícito. Secuencia entre harnesses usa
  handoff bajo demanda, no sincronización automática.
- El handoff contiene exactamente: objetivo, rama/worktree, decisiones,
  archivos/cambios, checks y siguiente gate.
