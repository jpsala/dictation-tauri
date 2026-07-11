---
id: local-codex-skills
status: reference
kind: decision-map
triggers:
  - skills locales
  - local skills
  - slash commands
  - docs/skills
  - .agents/skills
  - toggle skills
  - skills on
  - skills off
  - os help
  - perfect os
  - init os
  - adopt os
  - update os
  - sigamos
  - guardar sesion
  - documentar sesion
  - checkpoint
  - persistir estado
  - cerrar sesion
  - continuar
  - prompt de continuidad
  - realinear os
  - evaluar skills
  - hacer commits
  - push
  - publicar cambios
  - incluir todo en la repo
  - repo commit push
  - ejecutar lote
  - proximo lote
  - avancemos
  - orquestar
  - aos-orquestar
  - aos-fanout
  - aos-fleet-update
  - aos-threads
  - usar threads
  - spawn agents
  - subagentes
  - until-done
  - pasar a skills
  - promover a skill
  - que se puede pasar a skills
  - skill o topic
  - metadata mínima
  - metadata minima
  - modelo hibrido
primary_refs:
  - docs/skills/README.md
  - docs/skills/
  - AGENTS.md
  - docs/WORKING_MEMORY.md
  - scripts/ensure-skills-link.ps1
  - scripts/toggle-skills-link.ps1
  - scripts/agent-context-audit.ts
---

# Skills Locales De Codex

## Uso

Abrir este topic solo cuando el usuario pregunte por skills locales, slash commands, metadata, discovery, costo de tokens, o cuando haya que crear o revisar una skill.

No abrirlo durante trabajo normal del repo ni durante `guardar sesion`/`nueva sesion` salvo que el problema involucre skills.

## Regla Canonica

`docs/skills/` es la fuente de verdad de las skills locales del repo.

`.agents/skills` existe solo como compatibilidad tecnica y debe apuntar por junction o symlink a `docs/skills/` cuando el host debe descubrir skills.

`docs/skills/` siempre queda como canon. `.agents/skills` es un compatibility path estable hacia ese canon; no se borra para limpiar la paleta porque Pi/Codex pueden cachear paths de skills.

No duplicar la misma skill en dos carpetas reales.

## Skill, Topic O Regla Activa

No todo lo que vive en memoria activa debe convertirse en skill.

Usar esta regla:

| Tipo          | Usar cuando                                                                      | Costo                                | Ejemplo                                            |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| Regla activa  | Debe condicionar todo trabajo y no es un comando.                                | Alto pero necesario.                 | No commitear secretos, no revertir cambios ajenos. |
| Topic         | Es conocimiento recuperable, criterio o explicacion.                             | Bajo demanda.                        | Como decidir donde poner memoria durable.          |
| Skill         | Es una accion invocable, repetible y estable.                                    | Metadata siempre descubierta.        | `cerrar sesion`, `realinear os`.                   |
| Skill hibrida | Se quiere descubrimiento por nombre, pero la logica vive en docs/topics/scripts. | Metadata chica + referencia externa. | `crear-track`, `regenerar-contexto`.               |

Una instruccion activa puede funcionar como skill si tiene forma de accion. No conviene convertir reglas globales de seguridad o lectura en skills solo para nombrarlas.

## Modelo Hibrido

El modelo recomendado para comandos operativos nuevos es hibrido:

1. La skill existe para hacer descubrible el comando.
2. El `SKILL.md` se mantiene corto.
3. La logica durable vive en `AGENTS.md`, topic, track, spec o script.
4. La skill apunta a la fuente canonica y no duplica procedimiento largo.
5. Si cambia la logica, se actualiza la fuente canonica y se revisa si la skill sigue apuntando bien.

Esto permite usar skills como superficie de invocacion sin mover todo el sistema agentico a `docs/skills/`.

### Metadata Minima

Una skill con metadata minima es aceptable cuando:

- el nombre del comando ya es claro;
- el comportamiento canonico vive en un topic o script;
- el objetivo principal es que Codex descubra el comando;
- repetir el procedimiento dentro del `SKILL.md` aumentaria drift.

Formato recomendado:

```markdown
---
name: crear-track
description: Create a new AOS track from the canonical template and current work context. Use when the user says `crear track` or wants a resumable work item.
---

# Crear Track

Abrir `docs/topics/docs-knowledge-system.md` y `docs/tracks/TEMPLATE.md`.
Crear o actualizar la track siguiendo esas fuentes canonicas.
```

No usar metadata minima cuando el comando es riesgoso, tiene muchos pasos fragiles o requiere validacion precisa. En esos casos el `SKILL.md` debe tener guardrails suficientes o delegar a un script.

## Criterio De Promocion

Antes de crear una skill nueva, responder:

1. El usuario podria invocarlo por nombre?
2. Es una accion repetible, no solo una politica?
3. Tiene triggers claros?
4. Su logica puede vivir en una fuente canonica sin duplicarse?
5. El costo de metadata se justifica por descubribilidad?

Si la respuesta fuerte es "si" en 3 o mas puntos, crear skill. Si no, dejarlo como topic, regla activa o track.

## Auditoria De Candidatos

Cuando JP pida revisar que del sistema agentico se puede pasar a skills:

1. Usar la skill `aos-evaluar-skills`.
2. Leer ruta liviana: indice, working memory y topics.
3. Buscar candidatos en `AGENTS.md`, `docs/TOPICS.md`, `docs/topics/`, `docs/tracks/` y `docs/skills/README.md`.
4. Proponer shortlist con recomendacion: `skill`, `skill hibrida`, `topic`, `regla activa`, `track` o `no promover`.
5. Implementar solo despues de confirmar o si JP pide "hacelo".

## Comandos Cubiertos

- `os help` / `ayuda os` / `comandos os`
- `perfect os` / `dejar en condiciones`
- `init os` / `adopt os` / `update os`
- `aos-sigamos`
- `avancemos` / siguiente paso en esta sesion
- `aos-orquestar` / `aos-fanout` / `aos-threads` / `orquestá` / `usá threads`
- `guardar sesion` / `documentar sesion`
- `aos-checkpoint` / `persistir estado` / `cerrar sesion` aliases
- `/aos-continuar` para abrir sesion nueva desde docs vivos despues de guardar
- `realinear os`
- `evaluar skills`
- `repo commit push`
- `hacer commits` / `push` / `publicar cambios`
- Herramientas de planificación/implementación Pi: no crear skill nueva; rutear a `docs/topics/pi-extension-stack.md` o al topic local equivalente.

## Mapa De Skills

| Comando o grupo                                                       | Skill o fuente                                                 | Comportamiento                                                                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `os help`, `ayuda os`, `comandos os`                                  | upstream `aos-help`                                            | Muestra comandos OS y cuando usarlos sin ejecutar cambios.                                                     |
| `perfect os`, `dejar en condiciones`                                  | upstream `aos-perfect-os`                                      | Optimiza un repo para agentes: contexto, docs, continuidad, comandos y audit.                                  |
| `init os`                                                             | upstream `aos-init-os`                                         | Inicializa AOS minimo en un proyecto nuevo o sin capa agentica.                                                |
| `adopt os`                                                            | upstream `aos-adopt-os`                                        | Fusiona AOS en un repo existente preservando reglas y memoria local.                                           |
| `update os`                                                           | upstream `aos-update-os`                                       | Actualiza una instalacion downstream contra el upstream sin copiar piezas manager-only.                        |
| `aos-sigamos`                                                         | upstream `aos-sigamos`                                         | Continua con lo siguiente en la misma sesion, sin lote formal.                                                 |
| `avancemos`, `ejecutar lote`, siguiente paso                          | upstream `aos-sigamos`                                         | Continua en esta sesion con el siguiente paso concreto; para loops largos usar tooling explicito.              |
| `aos-orquestar`, `orquestá`, `usá threads`, `spawn agents`            | upstream `aos-orquestar`                                       | Propone o ejecuta fan-out controlado con threads/subagentes, con confirmacion si no fue pedido explicitamente. |
| `aos-fanout`, `aos-threads`, `/aos-fanout`                            | upstream `aos-fanout`                                          | Alias intensivo: maximiza paralelismo seguro y vuelve a serial si no conviene.                                 |
| `aos-dynamic-workflows-pilot`, `probar pi-dynamic-workflows`          | `docs/skills/aos-dynamic-workflows-pilot/`                     | Piloto local opt-in para comparar `pi-dynamic-workflows` contra `taskflow` sin volverlo default.                |
| `aos-fleet-update`, `actualizar repos`, `actualizar nuestras repos`   | upstream `aos-fleet-update`                                    | Genera un `pi_long_task` serial para actualizar repos AOS con allowlist, checks y commits locales opcionales. |
| Pi planning tools, advisor, taskflow, dgoal, pi-lens, pi-code-planner | `docs/topics/pi-extension-stack.md`                            | No es skill nueva: topic/runbook canonico para elegir herramientas de pensamiento/implementación.              |
| `guardar sesion`, `documentar sesion`                                 | upstream `aos-guardar-sesion`                                  | Persiste valor durable en docs vivos, sin handoff ni thread nuevo.                                             |
| `aos-checkpoint`, `persistir estado`, `cerrar sesion`                 | upstream `aos-guardar-sesion`                                  | Aliases de guardar sesion; `cerrar` agrega solo sintesis final.                                                |
| `/aos-continuar [objetivo]`                                           | `.pi/extensions/aos-tools.ts` + `.pi/prompts/aos-continuar.md` | Abre sesion Pi nueva y pasa un prompt de continuidad desde docs vivos; JP debe haber guardado antes.           |
| `realinear os`                                                        | upstream `aos-realinear-os`                                    | Audita y repara la capa agentica sin tocar producto salvo pedido.                                              |
| `evaluar skills`, `pasar a skills`                                    | `docs/skills/evaluar-skills/`                                  | Audita candidatos del sistema agentico para promoverlos a skills hibridas.                                     |
| `hacer commits`, `push`, `publicar cambios`, `repo commit push`       | upstream `aos-repo-commit-push`                                | Revisa inclusion, valida, commitea y pushea el batch del repo.                                                 |

## Validacion

1. Verificar o alternar el enlace tecnico:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/toggle-skills-link.ps1 status
powershell -ExecutionPolicy Bypass -File scripts/toggle-skills-link.ps1 on
# `off`/`toggle` quedan como aliases legacy no destructivos.
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
```

`off` y `toggle` ya no remueven el junction/symlink `.agents/skills`; lo mantienen o lo reparan para evitar paths cacheados rotos.

1. Validar una skill o todas las necesarias:

```powershell
bun run skills:check
python C:\dev\agent-infra\rules\skills\.system\skill-creator\scripts\quick_validate.py docs/skills/evaluar-skills
```

1. Regenerar indice y correr audit:

```powershell
bun run context:index
bun run context:audit
```

## Mantenimiento

- Editar siempre `docs/skills/<nombre>/`.
- Si se agrega una skill nueva, indexarla desde `docs/skills/README.md`; actualizar este topic solo si cambia el criterio de diseño o mantenimiento.
- Si una skill necesita metadata UI, mantener `agents/openai.yaml` alineado con `SKILL.md`.
- Preferir skills hibridas cortas cuando ya existe una fuente canonica confiable.
- Si Git empieza a detectar ruido por la compatibilidad tecnica, mantener `.agents/skills/` ignorado.
- Para trabajar con Codex, habilitar discovery con `bun run skills:on` o `scripts/toggle-skills-link.ps1 on`.
- Para trabajar con Pi, mantener `.agents/skills` estable; `/aos-skills off` y `scripts/toggle-skills-link.ps1 off` son aliases legacy no destructivos.
- Despues de portar o mover el repo, correr `scripts/ensure-skills-link.ps1`. Si `.agents/skills` llego como carpeta real, el script debe preservarla como backup, copiar skills faltantes a `docs/skills/` y recrear el junction.
