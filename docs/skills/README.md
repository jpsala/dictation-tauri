# Skills Locales

`docs/skills/` es la fuente canonica de las skills locales del repo.

## Regla

- No duplicar skills en dos carpetas reales.
- `.agents/skills` existe solo como compatibilidad tecnica y debe apuntar por junction a `docs/skills/` cuando el host debe descubrir skills.
- Si se agrega o modifica una skill, editar `docs/skills/<nombre>/`.
- Si una skill es operativa del sistema, documentarla tambien en topics/working memory/decisions cuando cambie el comportamiento durable.

## Contenido Actual

- `aos-impeccable/`: skill local para trabajo de UI/frontend.
- `aos-speckit-*/`: skills locales del workflow SpecKit.
- `aos-help/`: mostrar comandos AOS disponibles y cuando usarlos.
- `aos-perfect-os/`: auditar y optimizar un proyecto para agentes: contexto, docs, continuidad, comandos y audit.
- `aos-align-os-project/`: actualizar/adoptar y auditar proyectos registrados para alinear mecanica y vision AOS.
- `aos-init-os/`, `aos-adopt-os/`, `aos-update-os/`: inicializar, adoptar o actualizar AOS en repos destino.
- `aos-plan-implementar/`: crear, revisar y ejecutar un plan acotado eligiendo un solo motor principal (`manual`, planner, dgoal, until-done, long-task o taskflow).
- `aos-sigamos/`: continuar con lo siguiente en la misma sesion, sin lote formal.
- `aos-orquestar/`: proponer o ejecutar un fan-out controlado con taskflow/subagentes disponibles.
- `aos-fanout/`: alias intensivo para maximizar orquestacion segura y volver a serial cuando no conviene.
- `aos-dynamic-workflows-pilot/`: piloto opt-in para comparar `pi-dynamic-workflows` contra `taskflow` sin volverlo default.
- `aos-fleet-update/`: lote serial multi-repo con `pi_long_task`, allowlist, checks y commits locales opcionales.
- `aos-guardar-sesion/`: guardar lo valioso de la sesion en docs vivos.
- `aos-checkpoint/` y `aos-cerrar-sesion/`: aliases legados de `aos-guardar-sesion/`.
- `/aos-continuar` vive en el adapter Pi (`.pi/extensions/aos-tools.ts`): abre sesion nueva con prompt de continuidad despues de que JP guardo sesion.
- `aos-realinear-os/`: auditoria y reparacion de la capa agentica.
- `aos-evaluar-skills/`: auditar que partes del sistema agentico conviene promover a skills hibridas.
- `aos-repo-commit-push/`: checklist para incluir cambios necesarios, commitear y pushear.

Las herramientas Pi de pensamiento/implementacion (`taskflow`, `pi-code-planner`, `pi-task`, `advisor`, Ponytail, `dgoal`, `context-viewer`, `pi-lens`) se documentan en `docs/topics/pi-extension-stack.md`, no como skills locales separadas.

## Validacion

```powershell
powershell -ExecutionPolicy Bypass -File scripts/toggle-skills-link.ps1 status
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
python C:\dev\agent-infra\rules\skills\.system\skill-creator\scripts\quick_validate.py docs/skills/<nombre>
bun run context:index
bun run context:audit
```

## Mantenimiento

- Si una skill nueva usa metadata UI, crear o regenerar `agents/openai.yaml`.
- Si un doc humano apunta a `.agents/skills` como fuente de verdad, corregirlo a `docs/skills/`.
- Si Codex deja de descubrir skills, reparar primero la junction antes de tocar contenido: `bun run skills:on`.
- Si Pi muestra demasiadas skills en `/`, no borrar el junction: Pi/Codex pueden cachear paths; `off`/`toggle` son aliases legacy no destructivos.
- Tras mover o portar el repo a otro disco, correr `scripts/ensure-skills-link.ps1`: si encuentra una carpeta real en `.agents/skills`, la mueve a backup, fusiona items faltantes hacia `docs/skills/` y recrea el junction sin perder contenido.

## Aplicar En Otros Repos

- Copiar o fusionar `docs/skills/` como parte de AOS cuando el repo destino necesite slash commands locales.
- No copiar `.agents/skills` como carpeta real; recrearla en destino con `scripts/ensure-skills-link.ps1`. Si el port ya trajo una carpeta real, el script la preserva como `.agents/skills.backup-*` y copia skills faltantes al canon.
- Mantener las skills hibridas: metadata y cuerpo corto en la skill, procedimiento durable en topics, scripts o docs canonicos del repo destino.
