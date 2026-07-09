---
name: aos-dynamic-workflows-pilot
description: Pilot pi-dynamic-workflows as an explicit opt-in competitor to taskflow for heavy fan-out, deep research, adversarial review, or codebase-wide audits. Use when JP says `aos-dynamic-workflows-pilot`, `probar pi-dynamic-workflows`, `usar pi-workflow`, `comparar con taskflow`, or asks to evaluate dynamic workflows against taskflow.
---

# AOS Dynamic Workflows Pilot

Piloto experimental y opt-in. `taskflow` sigue siendo el default AOS para orquestacion; usar pi-dynamic-workflows solo cuando JP lo pida por nombre o el objetivo sea comparar motores.

## Regla De Activacion

1. No asumir que `@quintinshaw/pi-dynamic-workflows` esta instalado.
2. Si no esta instalado, pedir confirmacion antes de instalar globalmente. Incluir comando exacto, backup de settings, motivo y rollback.
3. Si esta instalado, endurecer triggers antes de usarlo:
   - default seguro: `/workflows-trigger off`
   - alternativa para pilotos: `/workflows-trigger set pi-workflow`
4. No activar `/ultracode` ni keyword trigger generico `workflow` como default AOS.

## Preflight Obligatorio

Antes de lanzar un piloto:

1. JP pidio explicitamente `aos-dynamic-workflows-pilot`, `pi-workflow` o comparar contra `taskflow`.
2. Verificar que el paquete/tool/comandos esten disponibles; si falta, pedir permiso antes de instalar globalmente.
3. Antes de instalar o tocar config global, respaldar `C:\Users\jpsal\.pi\agent\settings.json`.
4. Endurecer trigger: preferir `/workflows-trigger off`; alternativa para pilotos: `/workflows-trigger set pi-workflow`.
5. Si se edita `C:/Users/jpsal/.pi/workflows/settings.json` a mano, guardarlo como JSON UTF-8 **sin BOM**. BOM/config corrupta hace que el paquete ignore el setting y vuelva al default `workflow`, inyectando `[workflows mode is ON]` en mensajes normales. Config segura:

```json
{
  "keywordTriggerEnabled": false,
  "keywordTriggerWord": "pi-workflow"
}
```

6. Correr `/reload` y verificar con `/workflows-trigger status` antes de seguir.
7. Declarar objetivo, presupuesto/concurrency si aplica, y criterio de cierre.
8. No usar `/ultracode`, trigger generico `workflow`, ni side effects destructivos/externos/privados sin `ask_user`.

## Cuando Usarlo

Usar solo para tareas donde el costo de otro motor se justifica:

- deep research con fuentes y cross-check;
- adversarial review;
- multi-perspective sobre producto/arquitectura;
- codebase-wide audit con muchos exploradores;
- experimentos con worktree isolation y runners paralelos;
- benchmark directo contra `taskflow`.

No usar para cambios chicos, flujos AOS repetibles ya cubiertos por `taskflow`, ni loops gobernados por planner/dgoal/until-done.

## Receta Rapida De Piloto

1. Elegir una tarea read-only chica pero real: audit, research o review multi-perspectiva.
2. Correr baseline con `taskflow` o registrar como resolveria AOS default.
3. Correr `pi-dynamic-workflows` solo mediante `pi-workflow`/tool explicito.
4. Completar la tabla de comparacion.
5. Decidir: mantener opt-in, ajustar trigger, o remover el paquete.

## Comparacion Contra Taskflow

Para comparar, correr la misma tarea en ambos motores cuando sea razonable y registrar:

| Criterio | Taskflow | pi-dynamic-workflows |
| --- | --- | --- |
| Calidad del resultado |  |  |
| Evidencia/citas |  |  |
| Ruido en contexto |  |  |
| Control y auditabilidad |  |  |
| Tiempo/costo |  |  |
| Riesgo de triggers/molestias |  |  |
| Reutilizacion futura |  |  |

Decision lazy: si `taskflow` resuelve igual con menos moving parts, quedarse con `taskflow`. Si pi-dynamic-workflows gana claramente en fan-out pesado, mantenerlo como herramienta opt-in `pi-workflow`.

## Guardrails

- Un motor gobierna: no mezclar `taskflow` y pi-dynamic-workflows en el mismo objetivo salvo benchmark explicito.
- No dejar triggers genericos prendidos si molestan.
- No lanzar fan-out caro sin decir objetivo, presupuesto y criterio de cierre.
- No permitir edits paralelos sobre los mismos archivos salvo worktree isolation explicita.
- El orquestador integra y valida; los agentes paralelos son insumos, no fuente de verdad.
