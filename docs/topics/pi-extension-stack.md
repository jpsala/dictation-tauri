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
  - taskflow
  - pi-code-planner
  - advisor
  - pi-lens
primary_refs:
  - docs/topics/pi-agentic-os.md
  - docs/topics/pi-planning-implementation-tooling.md
  - docs/OS_PLAYBOOK.md
  - C:/dev/os/docs/topics/pi-extension-stack.md
---

# Pi Extension Stack

Referencia local para elegir herramientas Pi en Dictation Tauri/Fixvox. El
inventario global de la maquina de JP vive en
`C:/dev/os/docs/topics/pi-extension-stack.md`; no copiarlo aca como dependencia
local.

## Regla Operativa

1. Elegir la herramienta mas chica que cierre el objetivo.
2. Usar web cuando conocimiento externo/versionado evite adivinar.
3. Antes de instalar/remover paquetes globales, pedir permiso y hacer backup de
   `C:/Users/jpsal/.pi/agent/settings.json`.
4. No tocar provider/cloud/prod, desktop side effects, clipboard/paste mutation
   ni autostart sin aprobacion explicita y flags/checks locales.

## Superficie Operativa Local

| Nivel | Tools | Uso |
| --- | --- | --- |
| Core diario | `fffind`, `ffgrep`, CodeMapper (`map/search/outline`), `ask_user`, `advisor`, `lens_diagnostics` | Orientacion, decisiones humanas, segundo juicio y feedback tecnico. |
| Orquestacion | `taskflow`, council, `pi-link` si aplica | Auditorias/reviews paralelas con ownership claro; no para trabajo serial chico. |
| Piloto opt-in | `pi-dynamic-workflows` via `docs/skills/aos-dynamic-workflows-pilot/` si se instala | Comparar fan-out pesado/deep research/adversarial review contra `taskflow`; no dejar triggers genericos activos. |
| Ejecucion larga | planner, dgoal, `/until-done`, long-task | Elegir **uno** desde `/aos-plan-implementar`; no anidar sin decision explicita. |
| Research externo | `web_search`, `fetch_content`, `web_answer`, `web_research`, skill `librarian` | Docs oficiales, releases, APIs, issues e internals OSS; no enviar secretos. |
| UI/desktop | Playwright/Chrome/Cua Driver/fixtures locales | Fixture/sandbox primero; desktop real/clipboard/provider solo con aprobacion. |

## Planning Y Ejecucion

Usar `/aos-plan-implementar` para elegir un motor principal:
manual, planner, dgoal, until-done, long-task o taskflow. Para decisiones de
arquitectura/runtime/prod/provider/desktop side effects, `advisor()` es gate.

## Guardrails Dictation/Fixvox

- No ejecutar smokes con clipboard/paste/provider/cloud/prod sin aprobacion.
- No guardar audio, transcripciones, seleccion ni datos privados en docs/chat.
- Preferir fixtures y artefactos verificables.
- Si una capacidad Pi no aparece, tratarlo como drift de runtime: reload/smoke o
  instalacion solo con permiso.
