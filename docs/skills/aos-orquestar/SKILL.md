---
name: aos-orquestar
description: Design or run an AOS orchestration fan-out with Pi threads/subagents. Use when JP says `aos-orquestar`, `orquestá`, `usá threads`, `abrí explorers`, `paralelizá esto`, or asks whether subagents should be used.
---

# AOS Orquestar

Usar threads/subagentes solo cuando aportan paralelismo real y el hilo principal puede seguir siendo el orquestador.

## Flujo

1. Leer la ruta minima del repo actual: `docs/.generated/context-index.md` si existe, `docs/WORKING_MEMORY.md` y el topic/track/spec puntual.
2. Si existe `docs/topics/pi-agentic-os.md#orquestacion-con-threadssubagentes`, usarlo como politica local; si no existe, aplicar esta skill como politica suficiente.
3. Nombrar el fan-out propuesto: objetivo, agentes, tipo (`explorer`, `worker`, `reviewer`), ownership y criterio de integracion.
4. Si JP no pidio threads explicitamente, pedir confirmacion con `ask_user` antes de `spawn_agent`.
5. Si JP lo pidio explicitamente, lanzar agentes directamente despues de una frase corta de plan.
6. Preferir 2-4 `explorer` read-only como primera tanda. Si son frentes independientes, lanzar mas workers por tandas.
7. Usar `worker` solo con archivos/repos no solapados, verificacion clara y archivos compartidos reservados al orquestador.
8. Continuar trabajo no solapado; usar `wait_agent` solo si estas bloqueado por el resultado o JP pidio cerrar el fan-out completo.
9. Integrar notificaciones de subagentes, verificar evidencia critica, cerrar agentes terminados y responder con sintesis unica.

## Prompt Base

```text
Contexto: estas trabajando como subagente de AOS. Repo/cwd: <ruta absoluta>. No eres el unico agente activo.
Objetivo acotado: <una tarea concreta>.
Lectura minima: <docs/archivos/comandos iniciales>.
Alcance permitido: <read-only | archivos/directorios permitidos>.
Archivos compartidos reservados al orquestador: <registry/plan/changelog/etc.; no editarlos>.
Guardrails: no secretos, no side effects externos, no git push/deploy, no editar fuera del ownership, no lanzar agentes nested salvo permiso explicito, preservar cambios preexistentes.
Devuelve:
- Estado: done | blocked | partial
- Hallazgos: bullets con paths/lineas cuando aplique
- Cambios preexistentes preservados:
- Riesgos/gaps:
- Cambios realizados: solo si eras worker
- Verificacion: comandos ejecutados o no ejecutados y por que
- Recomendacion para integracion compartida: entrada de registry/plan/changelog o siguiente paso concreto
```

## Guardrails

- No orquestar tareas pequenas, secuenciales o sensibles.
- No lanzar agentes para evitar una decision humana; usar `ask_user`.
- No permitir edits paralelos sobre los mismos archivos.
- No permitir que workers editen registries/planes compartidos; deben devolver recomendaciones para que integre el orquestador.
- No permitir nested agents salvo autorizacion explicita y solo read-only por defecto.
- Cerrar agentes terminados y correr higiene del repo orquestador si se actualizaron docs AOS.
- Las respuestas de subagentes son insumos: la fuente de verdad sigue siendo docs, codigo y verificaciones.

## Patron Probado

`align all` multi-repo funciono con un worker por repo, workers sin permiso para editar `docs/OS_PROJECTS.md`, recomendaciones de registry como output y consolidacion final en el hilo principal. Reusar este patron para migraciones/auditorias por lotes.
