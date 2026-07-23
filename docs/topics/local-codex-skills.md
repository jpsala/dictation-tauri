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
  - realinear os
  - doctor aos
  - evaluar skills
  - speckit
  - impeccable
  - pasar a skills
  - promover a skill
  - skill o topic
primary_refs:
  - docs/skills/README.md
  - docs/skills/
  - AGENTS.md
  - scripts/ensure-skills-link.ps1
  - scripts/toggle-skills-link.ps1
  - scripts/agent-context-audit.ts
---

# Skills Locales De Codex

## Uso

Abrir este topic sólo para crear, revisar o reparar skills locales y su
discovery. El trabajo diario de pensar, planear, implementar y cerrar entra por
el `/flow` global; no crear aliases locales que compitan con esas fases.

## Regla Canónica

`docs/skills/` es la fuente de verdad local. `.agents/skills` es compatibilidad
técnica y debe resolver por junction/symlink a ese canon. No duplicar la misma
skill en dos carpetas reales ni borrar el enlace para limpiar paletas cacheadas.

Las skills AOS portables se descubren desde `C:/dev/os`; el downstream conserva
sólo capacidades realmente locales:

- `aos-doctor`: diagnóstico read-only del contexto de Dictation Tauri;
- `realinear-os` y `evaluar-skills`: operaciones especializadas;
- `impeccable`: trabajo UI/frontend;
- `speckit-*`: workflow SpecKit del producto.

No mantener skills locales de planificación, implementación, continuidad o
cierre alternativas a `/flow`.

## Skill, Topic O Regla

| Tipo | Usar cuando | Ejemplo |
| --- | --- | --- |
| Regla activa | Debe condicionar todo trabajo. | No commitear secretos. |
| Topic | Es conocimiento o criterio recuperable. | Política de storage. |
| Skill | Es una acción repetible con triggers claros. | `aos-doctor`. |
| Skill híbrida | La acción es descubrible y la lógica vive en un topic/script. | `realinear-os`. |

Antes de crear una skill, confirmar que sea una acción repetible, tenga triggers
claros, no duplique `/flow` y justifique su costo de metadata. Mantener
`SKILL.md` corto cuando una fuente canónica ya contiene el procedimiento.

## Validación

```powershell
powershell -ExecutionPolicy Bypass -File scripts/toggle-skills-link.ps1 status
bun run skills:check
bun run context:index
bun run context:audit
```

`off` y `toggle` son aliases técnicos no destructivos: mantienen o reparan el
enlace. Después de mover el repo, correr `scripts/ensure-skills-link.ps1`.

## Mantenimiento

- Editar siempre `docs/skills/<nombre>/`.
- Indexar nuevas skills desde `docs/skills/README.md`.
- No copiar inventarios, registry ni skills manager-only al downstream.
- Ante una carpeta real en `.agents/skills`, preservarla antes de recrear el
  enlace y fusionar cualquier skill local faltante.
