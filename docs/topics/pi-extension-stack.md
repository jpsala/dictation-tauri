---
id: pi-extension-stack
status: active
kind: reference
triggers:
  - extensiones pi
  - paquetes pi
  - pi packages
  - sincronizar pi
  - web_search
  - web_research
  - codemapper
  - fff
  - fffind
  - ffgrep
  - taskflow
  - pi-code-planner
  - advisor
  - pi-lens
  - pi-footer
  - image_generate
primary_refs:
  - C:/Users/jpsal/.pi/agent/settings.json
  - C:/Users/jpsal/.pi/agent/extensions/pi-footer.json
  - C:/dev/os/docs/reference/pi-extension-stack-inventory.md
  - docs/topics/pi-agentic-os.md
  - docs/topics/agent-tool-routing.md
  - docs/reference/tool-routing.yaml
  - docs/OS_PLAYBOOK.md
---

# Pi Extension Stack

Referencia de entrada para elegir herramientas Pi. El inventario completo de
paquetes globales vive en `C:/dev/os/docs/reference/pi-extension-stack-inventory.md`.
No duplicar esa lista en este downstream: es configuracion global de la maquina
de JP, no dependencia core de Dictation Tauri.

## Regla Operativa

1. Elegir la herramienta mas chica que cierre el objetivo.
2. Usar web cuando conocimiento externo/versionado evite adivinar.
3. Antes de instalar/remover paquetes globales, pedir permiso y hacer backup de
   `C:/Users/jpsal/.pi/agent/settings.json`.
4. Despues de cambios Pi, correr `/reload` y smoke-testear la capacidad tocada.

## Superficie Operativa AOS

| Nivel | Tools | Uso |
| --- | --- | --- |
| Core diario | `fffind`, `ffgrep`, CodeMapper (`map/search/outline`), `ask_user`, `advisor`, `lens_diagnostics` | Orientacion, decisiones humanas, segundo juicio y feedback tecnico. |
| Orquestacion | `taskflow`, `pi-council`, `pi-link` | Auditorias/reviews paralelas con ownership claro; no para trabajo serial chico. |
| Piloto opt-in | `pi-dynamic-workflows` via la skill local `aos-dynamic-workflows-pilot` si se instala | Comparar fan-out pesado/deep research/adversarial review contra `taskflow`; no dejar triggers genericos activos. |
| Ejecucion larga | `pi-code-planner`, `/until-done`, `pi_long_task`; `pi-dgoal` solo experimental | Elegir **uno** desde `/aos-plan-implementar`; para fleet updates AOS usar `pi_long_task`/`/aos-fleet-update`, no `dgoal`. |
| Research externo | `web_search`, `fetch_content`, `web_answer`, `web_research`, skill `librarian` | Usar para docs, releases, issues, APIs, internals OSS; no enviar secretos. |
| Visual/UI | `pi-chrome`, `cua-driver`, `image_generate`, `aos-impeccable` | UI, browser signed-in y assets; pedir aprobacion para cuentas reales/envios/material privado. |
| Global/optional | footer, Telegram/Discord remotes, MCP, RTK, themes, shims | Entorno de JP; no copiarlos como dependencia AOS ni usarlos si no aportan. |



## Fleet Updates AOS

Para actualizar varias repos AOS en orden, usar `/aos-fleet-update` como
superficie local. El comando genera un `pi_long_task` serial con TODO markdown,
allowlist de paths AOS, checks por repo y commits locales opcionales.

No usar `dgoal` para este caso mientras su startup gate dependa de confirmacion
modal fragil, fallback chino sin `pi-di18n`, y abandono por feedback vacio.

## Pi Dynamic Workflows Trigger Seguro

`pi-dynamic-workflows` queda explicito-only. Default seguro:

```json
{
  "keywordTriggerEnabled": false,
  "keywordTriggerWord": "pi-workflow"
}
```

Guardar `C:/Users/jpsal/.pi/workflows/settings.json` como JSON UTF-8 sin BOM. Si aparece `[workflows mode is ON]` al escribir mensajes normales, la config probablemente no fue parseada y el paquete volvio al trigger default `workflow`; reescribir el JSON sin BOM, correr `/reload` y verificar `/workflows-trigger status`.

## Research / Web

- `web_search`: descubrir fuentes con 2-4 queries variadas.
- `fetch_content`: leer fuentes candidatas antes de decidir.
- `web_answer`: factual chico con grounding rapido.
- `web_research`: informe asincronico para temas amplios.
- `librarian`: internals de librerias open-source con permalinks.

Playbook: `docs/topics/conversational-research.md`.

## Busqueda Local Y Codigo

- `fffind`/`ffgrep`: ubicar archivos o texto arbitrario rapido.
- CodeMapper `map/search/outline/expand/path`: estructura, simbolos y relaciones.
- `pi-lens`: LSP/diagnostics/AST; es feedback tecnico, no reemplaza checks del repo.

## Planning Y Ejecucion

Usar `/aos-plan-implementar` para elegir un motor principal. La matriz completa
esta en `docs/topics/agent-tool-routing.md` y su policy verificable en
`docs/reference/tool-routing.yaml`.

- manual + Ponytail para cambios chicos;
- planner para features con stages/worktree;
- dgoal/until-done para objetivos largos acotados;
- long-task para TODO secuencial claro;
- taskflow/council para auditorias, reviews y fan-out.

## UI / Browser / Computer Use

`pi-chrome`, Cua Driver e image-gen son capacidades reales sobre la maquina o
servicios externos. Aplican las reglas de `AGENTS.md`: avisar al iniciar un
batch visible, no tocar cuentas/canales reales ni enviar datos privados sin
permiso, y guardar evidencia reproducible.

## Footer / Statusline

`pi-footer` es la pieza correcta para ajustar statusline/footer. Config actual:
`C:/Users/jpsal/.pi/agent/extensions/pi-footer.json`. Detalle global en
`C:/dev/os/docs/reference/pi-extension-stack-inventory.md`.

## Sincronizar Otra PC

1. Comparar `C:/Users/jpsal/.pi/agent/settings.json`.
2. Revisar paquetes en `~/.pi/agent/npm` y git skills/extensiones.
3. Verificar extras: `C:\dev\pi`, API keys, CLIs opcionales, ffmpeg si aplica.
4. Smoke-testear solo capacidades clave: `ask_user`, FFF, taskflow, footer y la
   herramienta modificada.

## Aprendizajes Recientes

Solo guardar aca aprendizajes de runtime Pi o patrones agenticos genericos. No
incluir fixes de producto, canales, credenciales ni datos downstream. El detalle
global historico vive en `C:/dev/os/docs/reference/pi-extension-stack-inventory.md`.
