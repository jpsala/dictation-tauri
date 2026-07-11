---
id: pi-agentic-os
status: active
kind: how-to
triggers:
  - pi os
  - pi agentic os
  - /aos-continuar
  - /aos-sync
  - /aos-skills
  - /aos-plan-implementar
  - /aos-orquestar
  - /aos-fanout
  - ask_user
  - taskflow
  - advisor
  - pi-lens
  - computer use
primary_refs:
  - .pi/extensions/aos-tools.ts
  - .pi/extensions/aos-checkpoint-nudge.ts
  - .pi/prompts/
  - docs/topics/pi-extension-stack.md
  - docs/topics/agent-tool-routing.md
  - docs/reference/tool-routing.yaml
  - docs/reference/pi-agentic-os-command-surface.md
  - docs/OS_PLAYBOOK.md
  - scripts/toggle-skills-link.ps1
  - upstream skill `aos-guardar-sesion`
---

# Pi Agentic OS

Adapter Pi para Agentic OS. La fuente de verdad sigue siendo el repo
(`AGENTS.md`, `WORKING_MEMORY`, topics, tracks, specs y decisiones); Pi aporta
slash commands, prompts, tools y compaction controlada.

Detalle historico/completo de comandos y paquetes:
`docs/reference/pi-agentic-os-command-surface.md` y
`docs/topics/pi-extension-stack.md`.

## Comandos Pi Locales

Regla de visibilidad: con `enableSkillCommands=false`, `docs/skills/*` no aparece
como slash command. Los slash visibles de AOS deben existir como
`.pi/prompts/aos-*.md` o registrarse en `.pi/extensions/aos-tools.ts`.

| Comando | Tipo | Uso |
| --- | --- | --- |
| `/aos-help` | prompt | Mostrar comandos AOS. |
| `/aos-guardar-sesion` | prompt | Persistir valor durable sin abrir sesion nueva. |
| `/aos-checkpoint`, `/aos-cerrar` | prompt legacy | Alias de guardado/cierre. |
| `/aos-continuar [objetivo]` | extension | Abrir sesion nueva con prompt desde docs vivos. |
| `/aos-plan-implementar` | extension | Crear/revisar plan y elegir un motor principal. |
| `/aos-routing status | set | clear` | extension | Registro advisory del motor principal activo. |
| `/aos-status [audit]` | extension | Estado git/contexto/audit/routing. |
| `/aos-sync` | extension | Ensure skills link, regenerar indice y correr audit. |
| `/aos-skills status | on | off | toggle` | extension | Ver/reparar `.agents/skills`; `off`/`toggle` son aliases legacy no destructivos. |
| `/aos-compact [foco]` | extension | Compactacion manual OS-aware. |
| `/aos-orquestar`, `/aos-fanout` | prompt | Fan-out controlado con taskflow/subagentes. |
| `/aos-evaluar-skills` | prompt | Auditar skills/prompts/extensiones. |
| `/ask`, `/advisor`, `/until-done`, `/planner-*` | paquetes Pi | Disponibles segun stack global. |

## Extensiones Locales

- `.pi/extensions/aos-tools.ts`: `/aos-status`, `/aos-routing`, `/aos-sync`,
  `/aos-skills`, `/aos-compact`, `/aos-continuar`, `/aos-plan-implementar`.
- `.pi/extensions/aos-checkpoint-nudge.ts`: nudges para guardar contexto cuando
  uso de ventana/diff/tiempo lo justifica.

## Strategy Gate

Usar `/aos-plan-implementar` para trabajos medianos/grandes. Elegir **un** motor:
manual, planner, dgoal, until-done, long-task o taskflow. No anidar motores sin
explicitar por que.

La fuente canonica de combinacion es `docs/topics/agent-tool-routing.md`; la
policy verificable vive en `docs/reference/tool-routing.yaml`.

Antes de implementar, emitir un bloque `Routing Decision` con intent, motor
principal, motivo, apoyos, nesting prohibido, gates y verificacion.

Heuristica corta:

- cambio chico: manual + Ponytail si aplica + checks;
- investigacion externa/versionada: `web_search`/`fetch_content`/`web_answer`,
  `librarian` para internals OSS;
- decision fuerte: `advisor()` antes de `DECISIONS.md`, arquitectura/storage/prod
  o loops largos; no para orientación barata, checks o pasos chicos de un
  playbook ya decidido;
- fleet update AOS serial: `/aos-fleet-update` -> `pi_long_task`; no `dgoal`;
- auditoria/review/fan-out: `taskflow` o council si el paralelismo vale el costo;
- codigo tocado: `lens_diagnostics`/LSP como feedback y checks del repo como gate.

## Human-in-the-loop

Usar `ask_user`/`ask_user_question` cuando hay decision de producto, arquitectura,
credenciales, permisos, instalaciones, prod/deploy, acciones destructivas o
contradiccion internet-vs-local. No preguntar lo inferible ni encadenar modales.

## Browser / Computer Use

Browser signed-in, Cua Driver, hotkeys, clipboard, apps o UI visible requieren el
aviso inicial de `AGENTS.md` para un batch coherente. No tocar cuentas reales,
canales, pagos, prod ni datos privados sin confirmacion explicita.

## Orquestacion

Usar taskflow/council cuando haya paralelismo real, ownership claro y retorno
comprimido. El orquestador integra y verifica; workers empiezan read-only salvo
plan aprobado.

## Flujo Recomendado

1. Leer ruta liviana: index -> working memory -> TOPICS -> topic puntual.
2. Inspeccionar git antes de editar.
3. Elegir herramienta con la tabla de `docs/topics/pi-extension-stack.md`.
4. Ejecutar el corte mas chico verificable.
5. Si se tocaron docs: `bun run context:index` y `bun run check`.
6. Guardar valor durable en docs; no transcript.

## Portabilidad

`.pi/` es adapter opcional. Repos destino reciben solo lo que necesitan; no copiar
settings globales, inventarios de JP ni registry manager-only.
