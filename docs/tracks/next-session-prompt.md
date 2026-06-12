---
status: active
started: 2026-06-05
updated: 2026-06-12
priority: medium
topic: docs/topics/dictation-tauri-foundation.md
related:
  - docs/WORKING_MEMORY.md
  - specs/001-port-foundation/tasks.md
---

# Prompt Para Proxima Sesion

Prompt compacto para retomar sin reabrir decisiones resueltas:

```text
Estamos en C:\dev\dictation-tauri. Usa la ruta liviana de AGENTS.md: context-index si existe, WORKING_MEMORY y luego el topic/spec/track puntual.

Objetivo probable: cerrar MVP 3 Phase 6 o, solo con aprobacion explicita de JP, correr las verificaciones manuales/opcionales de audio/provider real. `specs/001-port-foundation/tasks.md` quedo completo para MVP 0, `specs/002-simulated-pipeline/tasks.md` para MVP 1, `specs/003-synthetic-audio-stt/tasks.md` para MVP 2 dry-run y `specs/004-real-microphone-capture/tasks.md` ya tiene US1-US3 CI-safe completas.

Estado verificado:

- Branch `main` ahead 21 sobre `origin/main`.
- Ultimo commit previo: `84d845a feat: route captured audio through stt shell`.
- `npm run build` pasa.
- `npm run visual:check` pasa.
- `npm run test:pipeline` pasa para success/failure/cancelacion/no-overlap/event ledger.
- MVP 3 CI-safe cubre fake capture, WebView adapter, captured-audio pipeline, STT shell sin provider real por default y delivery evidence honesta con copy fallback sin `paste_observed`.
- No se grabo audio real, no se pidio permiso real de microfono, no se llamo provider real.
- El arbol puede seguir dirty por cambios amplios de docs/skills/tracks/scripts; no asumir repo limpio ni revertir cambios ajenos.
- Arquitectura guia: pipeline por puertos/adapters, `PipelineService`, event ledger, UI como observadora, Tauri/Rust para side effects desktop, delivery por evidencia.
- `PRODUCT.md` define register `product`, usuarios, proposito, personalidad, anti-referencias, principios y accesibilidad.
- `DESIGN.md` define el sistema visual inicial: "The Quiet Control Room", paleta restringida, tipografia Inter/system, componentes base y prohibiciones.

Siguiente batch sugerido:

- Si no hay aprobacion real: avanzar solo con `T045-T054` de `specs/004-real-microphone-capture/tasks.md`, con checks verdes y commit atomico.
- Si JP aprueba explicitamente audio/provider real: evaluar `T022-T024` y/o `T035-T036`, manteniendo artifacts locales ignorados y sin imprimir secretos ni payloads.

No reabras alcance MVP salvo contradiccion tecnica fuerte. Mantener microfono real, provider real, hotkeys, tray, settings amplias, selected-text real y persistencia durable fuera de alcance salvo decision explicita. Mantener modo personal/dev permisivo para lectura local, pero no imprimir secretos completos ni commitear `.env`/tokens.
```

## Nota

Este prompt no reemplaza a `docs/WORKING_MEMORY.md`. Si queda viejo, compactarlo o archivarlo.
