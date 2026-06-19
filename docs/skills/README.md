# Skills Locales

`docs/skills/` es la fuente canonica de las skills locales del repo.

## Regla

- No duplicar skills en dos carpetas reales.
- `.agents/skills` existe solo como compatibilidad tecnica y puede apuntar por junction a `docs/skills/` o estar deshabilitado intencionalmente como toggle de discovery.
- Si se agrega o modifica una skill, editar `docs/skills/<nombre>/`.
- Si una skill es operativa del sistema, documentarla tambien en topics/working memory/decisions cuando cambie el comportamiento durable.

## Contenido Actual

- `impeccable/`: skill local para trabajo de UI/frontend.
- `speckit-*/`: skills locales del workflow SpecKit.
- `sigamos/`: continuar el trabajo activo en la misma sesion.
- `cerrar-sesion/`: cierre de valor sin transcript.
- `continuar-sesion/`: cierre de valor mas handoff compacto para sesion nueva.
- `continuar-sesion-con-gol/`: variante de continuidad que pide arrancar la proxima sesion con `gol`.
- `realinear-os/`: auditoria y reparacion de la capa agentica.
- `evaluar-skills/`: auditar que partes del sistema agentico conviene promover a skills hibridas.

## Validacion

```powershell
npm run skills:status
npm run skills:on
npm run skills:off
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
python C:\dev\agent-infra\rules\skills\.system\skill-creator\scripts\quick_validate.py docs/skills/<nombre>
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

## Mantenimiento

- Tras mover o portar el repo a otro disco, correr `scripts/ensure-skills-link.ps1`: si encuentra una carpeta real en `.agents/skills`, la mueve a backup, fusiona items faltantes hacia `docs/skills/` y recrea el junction sin perder contenido.
- Para bajar ruido de discovery, usar `npm run skills:off`; para restaurarlo, `npm run skills:on`.

- Si una skill nueva usa metadata UI, crear o regenerar `agents/openai.yaml`.
- Si un doc humano apunta a `.agents/skills` como fuente de verdad, corregirlo a `docs/skills/`.
- Si Codex deja de descubrir skills, reparar primero la junction antes de tocar contenido.

## Aplicar En Otros Repos

- Copiar o fusionar `docs/skills/` como parte de AOS cuando el repo destino necesite slash commands locales.
- No copiar `.agents/skills` como carpeta real; recrearla en destino con `scripts/ensure-skills-link.ps1`.
- Mantener las skills hibridas: metadata y cuerpo corto en la skill, procedimiento durable en topics, scripts o docs canonicos del repo destino.

## Orquestacion

- `aos-orquestar/`: proponer o ejecutar un fan-out controlado con threads/subagentes AOS.
