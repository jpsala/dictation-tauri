---
id: agent-tool-routing
status: active
kind: how-to
triggers:
  - tool routing
  - routing decision
  - combinar tools
  - elegir herramienta
  - dgoal
  - until-done
  - taskflow
  - advisor
  - ask_user
primary_refs:
  - docs/reference/tool-routing.yaml
  - docs/topics/pi-agentic-os.md
  - docs/topics/pi-extension-stack.md
  - upstream skill `aos-plan-implementar`
  - .pi/extensions/aos-tools.ts
---

# Agent Tool Routing

Contrato operativo para que AOS elija y combine herramientas Pi sin pisarse. La
regla base: **un motor gobierna; las demas herramientas apoyan**.

## Routing Decision

Antes de un trabajo mediano/grande, declarar:

```text
Routing Decision
- Intent: discuss | study | spec | plan | implement | review
- Primary engine: manual | planner | dgoal | until-done | long-task | taskflow | pi-dynamic-workflows (solo piloto opt-in)
- Why: scenario de docs/reference/tool-routing.yaml que matchea
- Support tools: advisor | ask_user | lens | web | librarian | council | taskflow
- Forbidden nesting: combinaciones que no se van a iniciar
- Required gates: ask_user/advisor/lens/checks
- Verification: comando/check/evidencia de cierre
```

Si el trabajo es chico y reversible, basta una linea: `Routing: manual, porque
es cambio chico; validar con <check>`.

## Matriz Corta

| Escenario | Motor principal | Apoyos | Gate |
| --- | --- | --- | --- |
| Cambio chico/reversible | manual | Ponytail si aplica, lens, checks | ninguno |
| Feature grande con stages/TDD | planner | advisor, lens, checks | advisor si cambia arquitectura |
| Objetivo largo por fases | dgoal | taskflow read-only, advisor, lens | dgoal_check por fase |
| Loop con verify command claro | until-done | advisor, lens, checks | verify command |
| TODO secuencial claro | long-task | checks | ask_user si costo/side effects |
| Fleet update AOS serial | long-task via `/aos-fleet-update` | checks, git, registry | commits solo si JP los pidio; no push |
| Auditoria/fan-out/multi-repo | taskflow | advisor/council si aporta | workers read-only por defecto |
| Fan-out pesado experimental/benchmark | pi-dynamic-workflows | taskflow baseline, advisor | opt-in explicito, trigger seguro, tabla comparativa |
| Research externo/versionado | manual/research | web_search, fetch_content, web_answer, librarian | no secretos/datos privados |
| Prod/deploy/envios/datos/destructivo | el que corresponda | ask_user | confirmacion explicita |

La version verificable vive en `docs/reference/tool-routing.yaml`.

## Routing GPT-5.6

Para elegir modelo y nivel de razonamiento dentro del motor ya seleccionado:

| Trabajo | Ruta preferida |
| --- | --- |
| Pi normal y planificacion compacta | Sol medium |
| Planificacion sustantiva, arquitectura, advisor y conformance | Sol high |
| Trabajo mecanico barato | Luna medium |
| Implementacion background acotada | Luna xhigh; reintentar con Luna max |
| Implementacion interactiva sensible a latencia | Terra high |
| Trabajo de alta garantia | Terra max, validado por Sol xhigh |

Tests, conformance y riesgo prevalecen sobre las heuristicas de costo. Los
cambios de settings requieren reload o una sesion nueva cuando aplique.

## Nesting Permitido

- `long-task -> checks/git` para fleet updates AOS seriales; `/aos-fleet-update` arma el TODO y mantiene commits por repo aislados.
- `dgoal -> taskflow` solo como auditoria/research/review acotada; dgoal sigue
gobernando.
- `dgoal/until-done/planner -> advisor|ask_user|lens|web` como apoyo.
- `taskflow -> workers read-only`; el orquestador integra y escribe.
- `pi-dynamic-workflows` solo via `aos-dynamic-workflows-pilot`/`pi-workflow`, preferentemente read-only, para comparar fan-out pesado contra `taskflow`; keyword trigger off por defecto y config JSON sin BOM.
- `manual -> cualquier apoyo chico` si no crea estado persistente ni fan-out caro.

## Nesting Prohibido

- `dgoal` como default para fleet updates AOS mientras mantenga UX/i18n/gate fragil.
- `dgoal -> until-done` o `until-done -> dgoal`.
- `planner -> dgoal/until-done` salvo decision explicita de migrar de motor.
- `taskflow detached -> taskflow detached`.
- `pi-dynamic-workflows` como reemplazo default de `taskflow`, `/ultracode` permanente, trigger generico `workflow`, o settings con BOM/corruptos que hagan volver al default.
- dos branches paralelas escribiendo los mismos archivos.
- desktop/browser automation con cuentas/canales reales sin `ask_user`.

## Active Engine Register

`/aos-routing status|set <engine> [goal]|clear` mantiene un registro advisory en
`.pi/state/aos-routing.json` (ignorado por git). Sirve para que `/aos-status`,
`/aos-continuar` y `/aos-plan-implementar` avisen si el motor pedido entra en
conflicto con el motor principal ya activo. No es un interceptor global de tool
calls; enforcement duro requiere hooks del runtime Pi.

Usarlo cuando arranca o termina un loop principal:

```text
/aos-routing set dgoal "alinear repos AOS"
/aos-routing clear
```

## Gates

- `ask_user`: prod, deploy, installs, commits/push, envios externos, datos
privados, acciones destructivas, fan-out costoso o scope ambiguo.
- `advisor`: arquitectura/storage/prod/security, decisiones `DECISIONS.md`-worthy
o loops largos. No usarlo para confirmar obviedades, orientación barata,
checks, ni pasos chicos de un playbook ya decidido; una vez por racimo de
riesgo alcanza.
- `lens`: despues de tocar codigo; si hay error real, resolver o documentar por
que es ruido ambiental.
- checks del repo: siempre mandan sobre heuristicas.

## Si Hay Duda

Elegir la opcion mas chica que no pierda seguridad:

```text
manual < long-task < until-done < planner < taskflow/council
```

Si dos motores parecen igual de buenos, usar `ask_user` o `advisor`, pero no
activar dos motores principales a la vez.
