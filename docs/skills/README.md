# Skills Locales

`docs/skills/` es la fuente canonica de las skills locales del repo.

## Regla

- No duplicar logica: las carpetas legacy pueden quedar como aliases, pero el comportamiento durable vive en topics/scripts/docs canonicos.
- `.agents/skills` es compatibilidad tecnica y debe apuntar por junction/symlink estable a `docs/skills/`; no se borra para limpiar paletas cacheadas.
- Si se agrega o modifica una skill, editar `docs/skills/<nombre>/` y regenerar indice/audit.

## Contenido Actual

Las skills AOS portables se descubren desde el kit upstream y no se duplican en este repo. Las reglas y el contexto propios de Dictation Tauri permanecen en `AGENTS.md` y la documentación bajo `docs`.

Quedan skills locales no colisionantes: aliases legacy preexistentes (`sigamos/`, `realinear-os/`, `evaluar-skills/`, `cerrar-sesion/`, `continuar-sesion*/`, `plan-implementar/`), `impeccable/` para UI/frontend y las skills SpecKit (`speckit-*`). Mantener los aliases solo como compatibilidad hasta una limpieza explicita.

Las herramientas Pi de pensamiento/implementacion (`taskflow`, `pi-code-planner`, `/until-done`, `pi_long_task`, `advisor`, Ponytail, `pi-lens`) se documentan en `docs/topics/pi-extension-stack.md`, no como skills locales separadas.

## Validacion

```powershell
powershell -ExecutionPolicy Bypass -File scripts/toggle-skills-link.ps1 status
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
bun run skills:check
bun run context:index
bun run context:audit
```

## Mantenimiento

- Si un doc humano apunta a `.agents/skills` como fuente de verdad, corregirlo a `docs/skills/`.
- Si Codex/Pi deja de descubrir skills, reparar primero la junction: `bun run skills:on` o `scripts/ensure-skills-link.ps1`.
- `off` y `toggle` son aliases legacy no destructivos.
- No copiar inventarios globales ni `docs/OS_PROJECTS.md` al downstream.
