---
id: agent-tool-routing
status: active
kind: policy
triggers:
  - tool routing
  - routing decision
  - OMP
  - elegir herramienta
  - subagente
primary_refs:
  - docs/reference/tool-routing.yaml
  - AGENTS.md
---

# Agent Tool Routing

Dictation Tauri usa Traycer y el harness activo de forma **intent-first**: la
persona expresa el resultado buscado y el agente elige el menor mecanismo
nativo suficiente. OMP queda fallback standalone/manual bajo demanda.

## Ruta Canónica

| Intención | Ruta |
| --- | --- |
| Entender o decidir | Conversar y converger en el hilo actual. |
| Materializar un brief | Escribir un plan liviano sin ejecutarlo. |
| Implementar | Trabajar directamente en la sesión actual con tools OMP nativas. |
| Mantener progreso | Usar todos nativos cuando el alcance lo justifique. |
| Persistir valor durable | Actualizar la fuente canónica una sola vez al cerrar. |

No hay selector de fases, paquete global, nueva sesión enlazada, handoff
automático ni auto-send. Un plan orienta; no ejecuta ni autoriza side effects.
La implementación conserva el WIP, inspecciona sólo lo necesario y resuelve el
comportamiento observable en una pasada acotada. Si el alcance crece
materialmente, se detiene.

## Herramientas De Apoyo

- Búsqueda, lectura y edición nativas: orientación y cambios locales.
- LSP/diagnósticos: feedback técnico cuando corresponde.
- Reviewer o librarian especializados: juicio o fuentes externas verificables.
- Ask User: decisiones de producto, permisos y side effects reales.
- Browser/computer: UI explícita con los gates locales.

Los subagentes se usan únicamente por pedido explícito. No recrear planners,
taskflows, relays, runners, clasificadores, handoffs ni fallbacks locales.

## Gates

Preguntar antes de installs, credenciales, acciones destructivas o externas,
commit, push, deploy o producción cuando aún no estén autorizados. Para audio,
selección, hotkeys y delivery físico aplican además los guardrails de `AGENTS.md`
y la spec/track activa. No volver a pedir una autorización explícita vigente.

La policy verificable vive en `docs/reference/tool-routing.yaml`.
