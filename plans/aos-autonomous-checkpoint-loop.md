# AOS: implementación autónoma con gates por checkpoint

## Context

JP quiere reducir al mínimo las instrucciones durante implementaciones largas y recibir control de calidad antes de que el agente avance entre partes. El AOS ya tiene casi todas las piezas: SpecKit con checkpoints, guardrails/gates, comandos de verificación, Working Memory, context index y audit. La oportunidad es convertirlas en un protocolo explícito de **autonomía acotada + verificación obligatoria + escalamiento sólo ante gates reales**.

Hallazgo inicial: hoy `tasks.md` exige detenerse al cerrar cada checkpoint. Eso maximiza control, pero obliga a JP a reautorizar cada tanda. Sin embargo, el AOS también registra una lección importante: `.pi/prompts/aos-gol.md` usa deliberadamente **Gol lite**, sin `until-done`, handoff ni thread nuevo, y `agent-tool-routing` prefiere ejecución manual para evitar latencia/costo injustificados. Por eso la recomendación no será otro orquestador autónomo pesado.

La dirección recomendada es un **loop lineal de un solo agente**, sin subagentes ni llamadas de revisión por defecto: implementar checkpoint → check enfocado barato → corregir si falla → check de cierre ya definido → receipt mecánico → continuar sólo dentro del rango preautorizado. La calidad la prueban tests/comandos/diff deterministas, no otra ronda de razonamiento costosa. Checks globales, advisor/lens o revisión profunda se reservan para cierre de checkpoint o señales de riesgo, no después de cada microtask.

## Approach

### Recomendación

Diseñar un contrato reutilizable llamado **Lean Checkpoint Loop**. No sería un agente, extensión ni workflow nuevo en la primera versión: sería una convención ejecutable por el agente actual desde `tasks.md` y una frase breve de autorización.

La idea responde directamente a los tres problemas observados:

- **Lento**: cero subagentes/evaluadores por defecto; checks enfocados durante el trabajo y suite amplia sólo al cierre.
- **Costoso**: un único **owner** por checkpoint; no planner + until-done + reviewer. La clase del checkpoint también elige capacidad: L0 puede usar el modelo más barato que cumpla la baseline y L1 usa un modelo capaz desde el inicio, en vez de pagar primero varios fallos previsibles de un modelo débil. Esto no significa una conversación/context window ilimitada: cada checkpoint usa una cápsula de contexto acotada y puede continuar en sesión limpia. Advisor/lens/web se activan sólo por trigger de riesgo o necesidad concreta de información externa.
- **Efectividad desconocida**: cada checkpoint produce una scorecard automática y barata (elapsed aproximado, comandos/checks, reruns, fallos detectados antes de avanzar, interrupciones humanas y tasks cerradas). Se prueba durante un checkpoint y se conserva sólo si mejora frente al proceso anterior.

### Contexto: un owner, ventanas acotadas

Corregimos la formulación “un solo contexto”: sería contraproducente acumular varios checkpoints largos en la misma ventana. La regla correcta es:

- **un solo owner por checkpoint**, sin fan-out ni evaluadores duplicando lectura;
- **una cápsula de contexto por checkpoint**: index/Working Memory sólo como router, tarjeta del checkpoint, diff relevante y archivos exactos;
- no releer toda la spec si `quickstart.md` + checkpoint + referencias puntuales alcanzan;
- no cargar outputs completos de suites: conservar exit code, conteos y error relevante;
- al cerrar, escribir un receipt de 10-20 líneas con decisiones, archivos, checks y siguiente gate;
- si el próximo checkpoint necesita otro dominio o la ventana creció, continuar en sesión limpia desde ese receipt, no desde el transcript.

El rango puede estar preautorizado sin exigir que todos sus checkpoints compartan la misma sesión. “Autonomía” y “contexto único” son problemas separados.

Incidente observado durante esta planificación: tres ejecuciones terminaron en `write EPIPE` desde `PiProcessNode.send` de `@plannotator/pi-extension` 0.23.1 y el browser/runtime auxiliar quedó sin servidor. La tercera ocurrió al intentar iniciar el piloto aun cuando el prompt decía “No uses Plannotator”: la instrucción conversacional no impide que la extensión global cargada intercepte plan mode. El plan markdown quedó intacto; falló el runtime auxiliar, no el archivo ni el repo. El código de la extensión inicia un runtime AI y hace model discovery lanzando otro `pi --mode rpc`; el child cerró stdin y el provider no tiene listener para el evento async `EPIPE`, por lo que cae todo Pi. Es la misma clase de fallo documentada en `backnotprop/plannotator#1039/#1040` para otro provider. Además, Pi estaba en `CH99.3%`, pero la saturación no explica por sí sola el stack.

Gate operativo actualizado: **desactivar primero la carga global de Plannotator y reiniciar Pi antes del piloto**. La entrada activa estaba en `C:/Users/jpsal/.pi/agent/settings.json` como `npm:@plannotator/pi-extension@0.23.1`. Al remover además el paquete instalado, `pi-menu.ps1 -Preset plan` dejó de arrancar porque `C:/tools/pi-menu.ps1` tenía una dependencia explícita a ese path y aborta si no existe; no es un fallo nuevo de Pi.

Para el piloto de implementación usar `pi-menu.ps1 -Preset aos -Session new`, no `-Preset plan`: B debe editar y verificar código, mientras `plan` es read-only hasta aprobación. Como reparación separada del launcher, reemplazar Plannotator en el preset `plan` por la extensión local oficial incluida con Pi en `C:/Program Files/nodejs/node_modules/@earendil-works/pi-coding-agent/examples/extensions/plan-mode`; conserva `--plan`, aplica allowlist read-only y no inicia browser, child RPC ni model discovery. Verificar con `-DryRun` antes de usarla. No reinstalar Plannotator para recuperar el preset.

### Loop

El contrato:

1. JP autoriza por adelantado un rango explícito de checkpoints y sus side effects permitidos.
2. El agente deriva para cada checkpoint: alcance, archivos esperados, invariantes, checks y stop conditions.
3. Implementa en small batches internos.
4. Ejecuta checks con escalera de costo: check enfocado tras el cambio; suite de checkpoint una sola vez al cierre; suite global sólo si el checkpoint la exige o cambió una frontera compartida.
5. Hace una revisión mecánica antes de avanzar: diff scoped, tasks realmente completas, secret/leak scan y evidencia/docs sólo cuando cambiaron decisiones o estado durable.
6. Si falla, diagnostica/corrige autónomamente dentro del alcance y repite el gate.
7. Sólo interrumpe a JP ante un gate real: decisión no inferible, permisos, install, producción, datos reales, cambio de arquitectura material o fallo externo no resoluble.
8. Al cerrar cada checkpoint deja un receipt compacto. Si el siguiente checkpoint autorizado es pequeño y comparte dominio, continúa; si cambia de dominio o supera el presupuesto contextual, prepara una cápsula de continuación limpia antes de seguir. Al terminar entrega un único resumen.

### Tres clases automáticas, no tres motores

El agente clasifica cada checkpoint desde sus efectos, sin preguntarle a JP:

- **L0 local/determinista**: cambio reversible, provider-free, sin contratos compartidos, installs ni producción. Auto-continúa con checks mecánicos.
- **L1 sensible**: arquitectura, auth, storage, privacidad o una frontera compartida. Sigue con un solo agente, pero agrega revisión de invariantes y suite amplia al cierre.
- **L2 externo/productivo**: installs, secrets, VPS, provider real, deploy, DNS, migraciones, imports o datos reales. Se detiene en el gate humano ya existente.

Si aplican varias clases, gana la más alta. Si hay duda, se trata como L1; si puede producir efectos externos, como L2. Son fronteras compartidas: APIs, schemas, protocolos, formatos persistidos, auth/permisos, configuración multi-componente, tipos o módulos exportados, storage durable e integraciones entre procesos, servicios o providers.

Así el control extra se paga sólo donde compra reducción de riesgo.

### Escalera de gasto justificable

- **Nivel 0 — siempre**: tests, typecheck, diff check, secret scan y fixtures deterministas. No agrega llamadas LLM.
- **Nivel 1 — por checkpoint L1**: una sola revisión del owner contra invariantes antes del close check; reutiliza el contexto actual.
- **Nivel 2 — excepcional**: una consulta diagnóstica a un tier más capaz o, si el owner ya usa el mejor disponible, a un advisor read-only con perspectiva, herramienta o fuente distinta; sólo ante arquitectura ambigua, seguridad/privacidad, fallo persistente o resultados contradictorios.
- **Nunca por defecto**: fan-out, council, evaluator-optimizer, full suite después de cada microtask o relectura total de docs.

El tiempo/tokens extra se justifica únicamente si corresponde a una clase de fallo concreta y queda registrada como `trigger -> control -> resultado`.

### Routing de capacidad, reparación y escalamiento

El modelo se elige antes de empezar según complejidad medida, no sólo después de fallar:

- **L0**: modelo económico que ya haya alcanzado la baseline local; puede escalar de tier si el problema resulta más difícil.
- **L1**: modelo capaz desde el inicio. Si ya es el mejor disponible, el fallback no se presenta falsamente como “más potencia”: debe aportar una perspectiva, herramienta o fuente distinta.
- **L2**: gate humano antes del side effect, independientemente del modelo.

Ante un gate fallido:

1. El owner diagnostica desde el error concreto y, si la causa es local y clara, intenta hasta dos correcciones materialmente distintas, repitiendo primero el focused check.
2. En L0, dos hipótesis fallidas habilitan una única consulta a un tier más capaz. En L1, habilitan una consulta read-only a un advisor; puede ocurrir antes ante ambigüedad arquitectónica, riesgo de auth/seguridad/privacidad/storage o contradicción entre código y checks.
3. El advisor recibe sólo objetivo, invariantes, diff relevante, comando/error e intentos previos; recomienda, pero no modifica en paralelo ni declara éxito. Web/retrieval se usa cuando falta información externa o actual, no como revisión genérica.
4. El owner evalúa la recomendación, puede aplicar una corrección derivada y vuelve a ejecutar el gate determinista.
5. Si aún falla, cambia el alcance o aparece un efecto L2, se detiene con evidencia. Permisos, secrets, producción, dependencias externas y requisitos no inferibles escalan directamente a JP, no a otro modelo.

Errores triviales al invocar un comando no consumen un intento. El presupuesto evita tanto perseverar con la misma hipótesis como pagar un modelo potente por fallos mecánicos. Esta secuencia completa es una síntesis a validar en AOS, no un resultado benchmarkeado directamente: lo respaldado por fuentes es usar modelos acordes a complejidad, feedback externo verificable, caps de iteración y fallback explícito.

### Tarjeta mínima por checkpoint

Cada checkpoint debería declarar únicamente:

```text
Protocol: Lean Checkpoint Loop v0.1
Scope: Txxx-Tyyy
Class: L0 | L1 | L2
Owner tier: baseline | capable
Focused check: <comando barato>
Close check: <comando de checkpoint>
Continue: if-green | stop
Escalate only: <gates reales>
```

No journal por microtask, no resumen intermedio para JP, no documentación si no cambió estado durable. El receipt puede vivir en `tasks.md`/`quickstart.md` o artifact ignorado; debe reemplazar contexto, no duplicarlo. Su límite de 20 líneas es orientativo, pero debe conservar este schema:

```text
Protocol version / checkpoint / class / scope:
Completed tasks:
Files changed:
Decisions and invariants:
Focused checks / close check:
Failures, fixes and advisor trigger/result:
Remaining risks / repo state:
Next checkpoint / next gate:
```

Frase de autorización propuesta: `Autorizo <checkpoints> bajo Lean Checkpoint Loop; continuá sólo if-green; side effects permitidos: <lista|ninguno>; hard stops: L2 y <gates específicos>.`

Principio de eficiencia: **no agregar pasos agentic por costumbre**. Cada control debe detectar una clase concreta de fallo y tener costo observable. La materialización recomendada es plantilla + convención de `tasks.md`; skill/script/extensión quedan descartados para V1. Esto replica lo mejor de mini-swe-agent/Agentless (control flow simple y verificable) y Aider (contexto presupuestado + feedback ejecutable) sin importar sus runtimes.

### Estado de la evidencia

- **Patrones respaldados y reutilizados**: menor complejidad suficiente, single owner, small batches, checks deterministas, contexto acotado, modelo acorde a complejidad, caps de iteración y handoff humano para acciones de riesgo.
- **Hipótesis locales a validar**: exactamente dos intentos antes del advisor, umbrales L0/L1 del AOS, una suite amplia por checkpoint, receipt orientativo de 20 líneas y continuidad entre checkpoints chicos.

El piloto no intentará “probar” los patrones generales; comprobará si esos parámetros locales funcionan en este repo. Si una fuente externa contradice una decisión o cambió el estado de una herramienta/provider, se reabre la decisión con web/retrieval y se registra la fuente.

## Files to modify

Implementación mínima recomendada después del piloto:

- `.pi/prompts/aos-gol.md`: aclarar owner único, cápsula acotada, focused check y receipt.
- `.specify/templates/tasks-template.md`: agregar tarjeta opcional `Class / Focused check / Close check / Continue / Escalate only` por checkpoint.
- `docs/topics/speckit-workflow.md`: documentar L0/L1/L2, escalera de gasto y continuidad por receipt.
- `docs/topics/agent-tool-routing.md`: advisor/reviewer sólo por señal y presupuesto, no por checkpoint rutinario.
- `specs/019-fixvox-self-hosted-control-plane/quickstart.md` y `tasks.md`: piloto medido para B, sin alterar los gates de C.

No crear inicialmente una skill nueva, extensión, taskflow ni script. Un script sólo se justifica después del piloto si hay un check mecánico repetitivo que las herramientas actuales no cubren.

## Reuse

- `aos-gol` ya ordena “el comando más barato suficiente” y prohíbe `until-done`/handoff por defecto: `.pi/prompts/aos-gol.md`.
- `/aos-plan-implementar` ya incluye escalera `test enfocado -> check repo -> diagnostics -> diff`; hay que adelgazar su aplicación, no inventar otra: `docs/skills/plan-implementar/SKILL.md`.
- Small Batches y checkpoints: `docs/topics/agentic-os.md`, `docs/topics/speckit-workflow.md`.
- Routing Decision y gates: `docs/topics/agent-tool-routing.md`.
- Audit/index: `scripts/agent-context-audit.ts`, `scripts/context-index.ts`, `scripts/context-refresh.ts`.
- Patrón concreto exitoso: Checkpoint A de `specs/019-fixvox-self-hosted-control-plane/tasks.md`.
- Contexto de arranque: `docs/.generated/context-index.md`, `docs/WORKING_MEMORY.md`.

## Steps

- [x] Revisar prompts/templates/routing AOS existentes: `aos-gol` ya optimiza por loop manual liviano y SpecKit ya tiene Small Batch Gate; no conviene duplicar `until-done`/planner/taskflow.
- [x] Investigar publicaciones/papers externos útiles. Evidencia relevante:
  - Anthropic, [Building effective agents](https://www.anthropic.com/research/building-effective-agents): empezar por la solución más simple; los sistemas agentic cambian latencia/costo por performance; workflows predecibles encajan mejor en tareas definidas; evaluator-optimizer sólo cuando la mejora es medible.
  - Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents): usar el conjunto mínimo de tokens de alta señal; el contexto tiene retornos decrecientes; recomienda retrieval just-in-time, compaction y notas estructuradas para horizontes largos.
  - Liu et al., [Lost in the Middle](https://arxiv.org/abs/2307.03172): incluso modelos long-context degradan cuando la información relevante queda en el medio de contextos largos. Respalda cápsulas y sesiones limpias, no transcripts crecientes.
  - Xia et al., [Agentless](https://arxiv.org/abs/2407.01489): un proceso simple de localización → reparación → validación logró en SWE-bench Lite 32%/96 fixes a costo reportado de USD 0,70, superando en ese benchmark a agentes open-source contemporáneos. No prueba que siempre gane, pero sí que “más autonomía/orquestación” no implica más efectividad.
  - DORA, [Working in small batches](https://dora.dev/capabilities/working-in-small-batches/): lotes chicos acortan feedback, facilitan triage/remediación y sirven como contramedida a inestabilidad asociada con mayor velocidad por IA.
  - Google SRE, [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/): señales ruidosas elevan costo humano y terminan ignoradas; mantener simple el camino crítico. Esto respalda gates por señal, no revisión permanente.
  - OpenAI, [A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf): asignar modelos según complejidad, establecer primero una baseline con el modelo capaz y sustituir por modelos menores sólo si mantienen calidad; fijar failure thresholds y devolver control humano ante retries excedidos o acciones de alto riesgo.
  - Microsoft Azure Architecture Center, [AI agent orchestration patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns): usar la menor complejidad que cumpla el objetivo; single-agent con tools suele ser el default; maker-checker requiere criterios de aceptación, límite de iteraciones y fallback; validar outputs antes de propagarlos y elegir modelo según tarea.
  - Google SRE, [Handling overload](https://sre.google/sre-book/handling-overload/): usa budgets finitos de retry y deja subir el fallo al caller cuando insistir ya tiene baja probabilidad de ayudar. Es una analogía operativa para el cap, no evidencia específica de LLMs.
  - Huang et al., [Large Language Models Cannot Self-Correct Reasoning Yet](https://arxiv.org/abs/2310.01798), encuentra que la autocorrección sin feedback externo puede no ayudar e incluso degradar; Self-Refine reporta mejoras en otras tareas con ciclos estructurados de feedback. La conclusión prudente para coding es no confiar en reflexión libre: anclar cada reparación en tests, errores o un advisor con aporte realmente distinto.
- [x] Hacer un segundo pase profundo en GitHub y separar evidencia de recomendaciones:
  - [`SWE-agent/mini-swe-agent`](https://github.com/SWE-agent/mini-swe-agent): agente deliberadamente mínimo (~100 líneas de clase), loop lineal y benchmark declarado >74% SWE-bench Verified. Su implementación incorpora límites explícitos de steps, costo y wall-clock; persiste exit status/costo y trunca outputs mayores a 10k caracteres mostrando head/tail. Patrón útil: loop simple + presupuestos duros + observaciones acotadas. Caveat: su historia lineal sigue creciendo y un issue de reproducción mostró variación material de resultados según config/model/eval; no tomar el headline como garantía local.
  - [`OpenAutoCoder/Agentless`](https://github.com/OpenAutoCoder/Agentless): topología explícita de localización → reparación → validación; el README histórico reporta 27,3%/82 fixes y USD 0,34 promedio, mientras el paper posterior reporta 32%/96 y USD 0,70. Patrón útil: reducir grados de libertad y validar patches; caveat: genera/rerankea múltiples patches, por lo que “agentless” no equivale a una sola llamada.
  - [`Aider-AI/aider`](https://github.com/Aider-AI/aider): repo map dinámico con budget default de ~1k tokens y selección de símbolos relevantes; lint/test integrados. Patrón útil: contexto just-in-time con presupuesto y feedback ejecutable. No copiar `--auto-test` de suite completa tras cada edición para este repo; usar test enfocado y suite de cierre.
  - [`humanlayer/12-factor-agents`](https://github.com/humanlayer/12-factor-agents): recomienda “own your context window”, representación token-efficient y estado/eventos reanudables. Es guía de diseño, no benchmark independiente; sirve para el receipt/cápsula, no como evidencia de performance.
  - [`All-Hands-AI/OpenHands`](https://github.com/All-Hands-AI/OpenHands): contiene condensers configurables, métricas de costo/tokens y una arquitectura mucho más amplia. Confirma que horizontes largos pueden manejarse, pero también exhibe el overhead que queremos evitar para un repo individual.
  - Issues observados: mini-swe-agent #756 muestra dificultad/variación al reproducir scores; Aider #649 pide confirmación por cambio como modo opcional, no default; Aider #705 muestra problemas prácticos de output/token limits en cambios grandes. Conclusión: budgets y medición local son obligatorios; no extrapolar leaderboards.
- [x] Definir el contrato propuesto de preautorización: rango, clase L0/L1/L2, checks y gates reales.
- [x] Definir la compuerta estándar: focused check durante implementación, close check una vez, auto-continuación sólo `if-green`.
- [x] Definir política de escalamiento: corregir autónomamente dentro de scope; detenerse sólo en L2, decisión material no inferible o fallo externo persistente.
- [x] Objetivar L0/L1/L2 y fronteras compartidas; definir routing de modelo por clase, presupuesto de reparación, escalamiento selectivo de capacidad y schema del receipt.
- [x] Contrastar el escalamiento con guías de OpenAI/Microsoft, retry budgets de Google SRE y evidencia mixta sobre self-correction; documentar que la secuencia concreta debe validarse en el piloto.
- [x] Recomendar implementación mínima en AOS y archivos exactos; no crear tooling nuevo antes de medir el piloto.
- [x] Definir un prompt breve reutilizable para JP y un receipt de checkpoint.
- [x] Elegir política de sesión híbrida: continuar same-session sólo si el próximo checkpoint comparte dominio y clase, no cruza fronteras y no hubo compaction/context warning; usar sesión limpia ante cambio de dominio/clase, checkpoint grande o presión contextual.
- [x] Definir prueba piloto segura sobre Checkpoint B de Spec 019, sin ejecutarlo: B es L1, un owner, cápsula B, localización por slice → extracción → focused test; cloud/contract/dry-run una vez al cierre; hard stop antes de C.
- [x] Versionar el protocolo y compararlo de forma secuencial: baseline/replay de A, v0.1 en B y v0.2 sólo ante una fricción medible, cambiando una variable por vez.

## Verification

### Diseño del piloto y versionado

No conviene construir varias implementaciones completas ni correr agentes en paralelo desde el inicio: con pocos checkpoints y tareas de distinta dificultad, un A/B produciría costo y una falsa sensación de rigor. Usar un esquema **champion/challenger secuencial**:

1. **Baseline**: reconstruir las métricas disponibles del Checkpoint A y hacer replay documental del protocolo, sin modificarlo.
2. **v0.1 candidate**: ejecutar el Lean Checkpoint Loop en B, dejando hard stop antes de C.
3. **Observar 2-3 checkpoints** antes de conservarlo como default; comparar sólo checkpoints de clase y alcance razonablemente similares y explicitar diferencias de dificultad.
4. Crear **v0.2** únicamente si v0.1 muestra una fricción concreta; cambiar una sola variable por versión (por ejemplo, retry cap, tier inicial, criterio de sesión o close check).
5. Registrar en cada receipt `versión -> cambio -> hipótesis -> resultado`. No mantener variantes que no tengan una hipótesis medible.
6. Decidir `keep | revise | reject`: conservar si reduce interrupciones o costo sin aumentar defectos escapados, cambios fuera de alcance ni gates omitidos; revisar si el fallo es atribuible a un parámetro; rechazar si agrega overhead sin señal de calidad.

Es un buen patrón para mejora operativa de bajo volumen, pero no un experimento estadístico ni prueba causal. Si dos versiones necesitan comparación directa, repetir ambas sólo sobre un checkpoint ya resuelto en modo replay/shadow; nunca duplicar modificaciones reales sobre ramas concurrentes para este piloto.

### Cómo decidir si funciona

Evaluar con guardrails y semáforo, no con un score único fácil de optimizar:

**Hard gates — todos obligatorios**

- focused checks y close check verdes;
- cero tareas declaradas completas sin evidencia;
- cero cambios fuera del scope autorizado;
- cero gates L2 omitidos o side effects no autorizados;
- diff mecánicamente limpio y sin secrets;
- el siguiente checkpoint puede arrancar con baseline verde.

Un hard gate fallido impide adoptar esa versión, aunque haya sido más rápida.

**Semáforo operativo por checkpoint**

- **Green**: ninguna pregunta rutinaria; como máximo una interrupción material; una sola suite amplia más rerun justificado; retry/advisor dentro del presupuesto; receipt suficiente para reanudar; sin defecto escapado atribuible durante el siguiente checkpoint.
- **Yellow**: todos los hard gates pasan, pero aparece una fricción aislada — relectura evitable, advisor sin aporte, suite redundante, receipt incompleto o tiempo/costo sin mejora clara.
- **Red**: falla un hard gate, se agota el presupuesto sin diagnóstico accionable, hay dos o más interrupciones evitables, o el protocolo agrega overhead material sin reducir riesgo.

**Prueba en cuatro momentos**

1. Replay de A: comprobar clasificación, checks, stop conditions y receipt hipotético.
2. Ejecución de B: capturar comandos, reruns, interrupciones, retries, advisor y resultado sin instrumentación nueva.
3. Continuation drill en sesión limpia: arrancar sólo con receipt + referencias exactas y verificar que identifica estado, baseline y hard stop de C sin releer el transcript.
4. Escape check: durante el arranque del siguiente checkpoint, confirmar que no aparece un defecto atribuible a B.

**Regla de decisión después de 2-3 checkpoints**

- `keep`: todos pasan hard gates y al menos dos quedan Green, sin tendencia peor en costo/interrupciones que la baseline;
- `revise`: seguridad/calidad pasan, pero la misma fricción Yellow se repite dos veces; crear v0.2 cambiando sólo esa variable;
- `reject`: cualquier gate omitido o side effect no autorizado, defecto material escapado, o overhead repetido sin beneficio observable.

### Criterios del piloto

- cero preguntas rutinarias; como máximo una interrupción por gate material;
- cero subagentes/reviewers adicionales salvo ambigüedad o riesgo técnico L1, o fallo persistente L0; nunca usar otro modelo para saltar un gate L2;
- una ejecución de suite completa al cierre, con rerun sólo si hubo corrección;
- cada fallo corregido queda asociado al check que lo detectó;
- el siguiente checkpoint abre con baseline verde, sin defecto escapado atribuible al anterior;
- no relectura completa de spec/docs si la cápsula y referencias exactas alcanzan;
- no invocar Plannotator/handoff auxiliar cuando la sesión está cerca del límite contextual; usar sesión limpia;
- receipt menor a 20 líneas y resumen final único.

Un checkpoint no alcanza para demostrar causalidad porque A y B tienen dificultad distinta. El piloto sirve para detectar fricción evidente; la decisión durable debería esperar 2-3 checkpoints y comparar tendencias, no una cifra aislada.

- Simular el protocolo contra Checkpoint A ya terminado y comprobar que habría detectado/validado T001-T006 sin preguntas rutinarias.
- Simular Checkpoint B: T007-T012 sería L1 (arquitectura/ports), un solo agente, focused tests por slice y cloud/contract/dry-run al cierre; no avanza a C porque T013 cruza el gate de dependencias/PostgreSQL.
- Verificar que ningún mecanismo puede saltar installs, producción, secrets, deploy, datos reales o cambios no autorizados.
- Ejecutar context index/audit si finalmente se implementa el cambio de AOS.
- Registrar por checkpoint: versión; clase y tier del owner; tareas completadas; preguntas/interrupciones; focused checks y full-suite runs; gates fallidos y ciclos de reparación; trigger, fuente y resultado de advisor/web; defectos detectados antes del cierre; cambios fuera de alcance; tiempo aproximado; continuidad o reinicio de sesión; suficiencia del receipt; y resultado final (`green | yellow | red | blocked | reverted`).
- Comparar el piloto con Checkpoint A usando esa misma baseline. No atribuir causalidad por un único checkpoint ni adoptar el protocolo por una cifra aislada: esperar 2-3 checkpoints y exigir menor interrupción o costo sin aumentar defectos escapados ni cambios fuera de alcance.

### Observaciones del piloto

- Checkpoint B / T007-T012 (L1): Green; receipt en Spec 019 `tasks.md`.
- Prewarm observability B0 (L1, 2026-07-15): implementación y checks deterministas Green, pero protocolo Red. Un dry-run fue invocado desde el cwd raíz y `npx` descargó Wrangler 4.110.0 en caché temporal sin autorización antes de fallar; no hubo deploy ni cambios en manifests raíz. JP aceptó explícitamente el efecto y autorizó finalizar; el dry-run correcto desde `cloud/fixvox-proxy` pasó.
- Usage/quota Admin B1-B4 (L1, 2026-07-15): Green; proyección read-only bounded/redacted, focused checks, Cloud y Wrangler offline dry-run pasaron sin installs, providers, producción ni interrupciones rutinarias.
- Resultado tras tres observaciones: dos Green y una Red. Según los hard gates definidos, v0.1 no se adopta como default (`reject` para este piloto) aunque la implementación del checkpoint Red haya sido correcta.
- Candidata v0.2, todavía no creada: exigir que cada check de tooling declare `cwd` exacto y una variante offline/no-download en la tarjeta antes de ejecutarse. La fricción ya apareció dos veces —cwd/comando ausente en el receipt B y descarga accidental en B0—, cambia una sola variable medible y B1-B4 validó el patrón con `npm exec --offline -- wrangler deploy --dry-run` desde `cloud/fixvox-proxy`. Requiere decisión explícita de JP antes de versionar el protocolo.
