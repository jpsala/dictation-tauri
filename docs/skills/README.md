# Skills Locales

`docs/skills/` es la fuente canónica de las skills locales del repo.

## Regla

- No duplicar lógica: el comportamiento durable vive en topics, scripts o docs
  canónicos y la skill funciona como entrada fina.
- `.agents/skills` es compatibilidad técnica y debe apuntar por junction/symlink
  estable a `docs/skills/`.
- Pensar, planear, implementar, continuar y cerrar pertenecen al `/flow` global;
  no crear aliases locales competidores.

## Contenido Actual

Las skills AOS portables se descubren desde el kit upstream. Dictation Tauri
conserva sólo skills propias y no colisionantes:

- `aos-doctor/` para diagnóstico read-only;
- `realinear-os/` y `evaluar-skills/` para operaciones especializadas;
- `impeccable/` para UI/frontend;
- las skills SpecKit `speckit-*`.

## Validación

```powershell
powershell -ExecutionPolicy Bypass -File scripts/toggle-skills-link.ps1 status
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
bun run skills:check
bun run aos:doctor
bun run context:index
bun run context:audit
```

## Mantenimiento

- Si un doc apunta a `.agents/skills` como fuente de verdad, corregirlo a
  `docs/skills/`.
- Si discovery falla, reparar primero la junction.
- `off` y `toggle` son aliases técnicos no destructivos.
- No copiar inventarios globales ni `docs/OS_PROJECTS.md` al downstream.
