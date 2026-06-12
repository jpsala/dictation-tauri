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
  - sigamos
  - cerrar sesion
  - continuar sesion
  - continuar sesion con gol
  - continuar con gol
  - siguiente
  - realinear os
  - evaluar skills
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
  - scripts/agent-context-audit.ts
---

# Skills Locales De Codex

## Uso

Abrir este topic solo cuando el usuario pregunte por skills locales, slash commands, metadata, discovery, costo de tokens, o cuando haya que crear o revisar una skill.

No abrirlo durante trabajo normal del repo ni durante `cerrar sesion`/`continuar sesion` salvo que el problema involucre skills.

## Regla Canonica

`docs/skills/` es la fuente de verdad de las skills locales del repo.

`.agents/skills` existe solo como compatibilidad tecnica y debe apuntar por junction o symlink a `docs/skills/`.

No duplicar la misma skill en dos carpetas reales.

## Skill, Topic O Regla Activa

No todo lo que vive en memoria activa debe convertirse en skill.

Usar esta regla:

| Tipo | Usar cuando | Costo | Ejemplo |
| --- | --- | --- | --- |
| Regla activa | Debe condicionar todo trabajo y no es un comando. | Alto pero necesario. | No commitear secretos, no revertir cambios ajenos. |
| Topic | Es conocimiento recuperable, criterio o explicacion. | Bajo demanda. | Como decidir donde poner memoria durable. |
| Skill | Es una accion invocable, repetible y estable. | Metadata siempre descubierta. | `cerrar sesion`, `realinear os`. |
| Skill hibrida | Se quiere descubrimiento por nombre, pero la logica vive en docs/topics/scripts. | Metadata chica + referencia externa. | `crear-track`, `regenerar-contexto`. |

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
description: Create a new OS Lite track from the canonical template and current work context. Use when the user says `crear track` or wants a resumable work item.
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

1. Usar la skill `evaluar-skills`.
2. Leer ruta liviana: indice, working memory y topics.
3. Buscar candidatos en `AGENTS.md`, `docs/TOPICS.md`, `docs/topics/`, `docs/tracks/` y `docs/skills/README.md`.
4. Proponer shortlist con recomendacion: `skill`, `skill hibrida`, `topic`, `regla activa`, `track` o `no promover`.
5. Implementar solo despues de confirmar o si JP pide "hacelo".

## Comandos Cubiertos

- `sigamos`
- `cerrar sesion`
- `continuar sesion`
- `continuar sesion con gol`
- `continuar con gol`
- `siguiente`
- `realinear os`
- `evaluar skills`

## Mapa De Skills

| Comando o grupo | Skill | Comportamiento |
| --- | --- | --- |
| `sigamos` | `docs/skills/sigamos/` | Sigue en la misma sesion sin cierre ni handoff. |
| `cerrar sesion` | `docs/skills/cerrar-sesion/` | Promueve memoria durable, regenera indice, corre audit y cierra con sintesis. |
| `continuar sesion` | `docs/skills/continuar-sesion/` | Hace el mismo cierre de valor y prepara handoff compacto para un thread nuevo. |
| `continuar sesion con gol`, `continuar con gol`, `siguiente` | `docs/skills/continuar-sesion-con-gol/` | Cierra con valor y pide que la nueva sesion arranque con `gol`. |
| `realinear os` | `docs/skills/realinear-os/` | Audita y repara la capa agentica sin tocar producto salvo pedido. |
| `evaluar skills`, `pasar a skills` | `docs/skills/evaluar-skills/` | Audita candidatos del sistema agentico para promoverlos a skills hibridas. |

## Validacion

1. Verificar el enlace tecnico:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
```

2. Validar una skill o todas las necesarias:

```powershell
python C:\dev\agent-infra\rules\skills\.system\skill-creator\scripts\quick_validate.py docs/skills/sigamos
python C:\dev\agent-infra\rules\skills\.system\skill-creator\scripts\quick_validate.py docs/skills/cerrar-sesion
python C:\dev\agent-infra\rules\skills\.system\skill-creator\scripts\quick_validate.py docs/skills/continuar-sesion
python C:\dev\agent-infra\rules\skills\.system\skill-creator\scripts\quick_validate.py docs/skills/continuar-sesion-con-gol
python C:\dev\agent-infra\rules\skills\.system\skill-creator\scripts\quick_validate.py docs/skills/realinear-os
python C:\dev\agent-infra\rules\skills\.system\skill-creator\scripts\quick_validate.py docs/skills/evaluar-skills
```

3. Regenerar indice y correr audit:

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

## Mantenimiento

- Editar siempre `docs/skills/<nombre>/`.
- Si se agrega una skill nueva, indexarla desde `docs/skills/README.md`; actualizar este topic solo si cambia el criterio de diseño o mantenimiento.
- Si una skill necesita metadata UI, mantener `agents/openai.yaml` alineado con `SKILL.md`.
- Preferir skills hibridas cortas cuando ya existe una fuente canonica confiable.
- Si Git empieza a detectar ruido por la compatibilidad tecnica, mantener `.agents/skills/` ignorado.
- Despues de portar o mover el repo, correr `scripts/ensure-skills-link.ps1`. Si `.agents/skills` llego como carpeta real, el script debe preservarla como backup, copiar skills faltantes a `docs/skills/` y recrear el junction.
