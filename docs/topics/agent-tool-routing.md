---
id: agent-tool-routing
status: active
kind: policy
triggers:
  - tool routing
  - routing decision
  - /flow
  - elegir herramienta
  - subagente
primary_refs:
  - docs/reference/tool-routing.yaml
  - docs/topics/pi-agentic-os.md
  - aos.requirements.json
---

# Agent Tool Routing

Dictation Tauri usa una política **flow-first**: una entrada humana, un foco y el
menor mecanismo suficiente.

## Ruta Canónica

| Intención | Ruta |
| --- | --- |
| Entender o decidir | `/flow → Pensar` en el hilo actual |
| Materializar un brief | `/flow → Planear` en el hilo actual |
| Seleccionar foco | `/flow → Hacer`; 0 deriva, 1 autoselecciona, N abre picker |
| Implementar | Hacer abre una sesión nueva enlazada y ejecuta directamente allí |
| Persistir valor faltante | `/flow → Cerrar`, opcional si Hacer ya cerró correctamente |

## Selección Y Ejecución

Hacer lee sólo `Foco Único De Ejecución` en `WORKING_MEMORY`. Un foco inválido,
un path fuera de `docs/tracks`/`specs` o campos inconsistentes bloquean antes del
handoff. Un foco `ready` abre una nueva sesión con linaje, índice, Working Memory
y brief en el editor; no usa Agent, resumen LLM, runtime state ni auto-send.

Planear declara una ruta revisable en el brief: `economical` usa Luna High para
docs o mecánica de bajo riesgo, `balanced` usa Sol Medium por defecto y `strong`
usa Sol High para trabajo sensible. Hacer la aplica en la sesión nueva; modelo o
auth ausentes bloquean sin fallback. No hay Terra, clasificador extra ni routing
por turno.

Para trabajo local, reversible y barato de rehacer, el brief es orientación y no
checklist exhaustiva. Inspeccionar sólo lo necesario para preservar cambios,
resolver el comportamiento observable en una pasada y correr evidencia mínima
no duplicada. Si el alcance crece materialmente, detenerse.

## Herramientas De Apoyo

- CodeMapper/FFF: orientación y búsqueda.
- LSP/Lens: feedback técnico.
- Advisor: riesgo, arquitectura o evidencia en conflicto.
- Web/librarian: conocimiento externo o versionado.
- Ask User: producto, permisos y side effects reales.
- Chrome/CUA: UI explícita con aviso inicial.

Agent se usa únicamente por pedido explícito fuera de Hacer. Taskflow, Council,
planner, until-done, dgoal, Ponytail, Governed Runner y worktree bridge están
retirados del runtime AOS actual; no recrearlos como fallback local.

## Gates

Preguntar antes de installs, credenciales, acciones destructivas o externas,
commit, push, deploy o producción cuando aún no estén autorizados. Para audio,
selección, hotkeys y delivery físico aplican además los guardrails de `AGENTS.md`
y la spec/track activa. No volver a pedir una autorización explícita vigente.

La policy verificable vive en `docs/reference/tool-routing.yaml`.
