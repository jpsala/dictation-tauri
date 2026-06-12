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

Objetivo probable: definir el proximo Small Batch post-MVP3 o, solo con aprobacion explicita de JP, correr las verificaciones manuales/opcionales de audio/provider real. `specs/001-port-foundation/tasks.md` quedo completo para MVP 0, `specs/002-simulated-pipeline/tasks.md` para MVP 1, `specs/003-synthetic-audio-stt/tasks.md` para MVP 2 dry-run y `specs/004-real-microphone-capture/tasks.md` quedo completo en modo CI-safe.

Estado verificado:

- Verificar estado real inicial con `git status --short --branch` y `git log -1 --oneline`; el repo debe venir tracked limpio y ahead sobre `origin/main`.
- Ultimo cierre funcional de MVP3: `8331f97 docs: close mvp3 ci-safe`; commits posteriores pueden ser solo refresh de handoff/contexto.
- `npm run build` pasa.
- `npm run visual:check` pasa.
- `npm run test:pipeline` pasa para success/failure/cancelacion/no-overlap/event ledger.
- `npm run synthetic-audio:stt:dry-run`, `npm run microphone-capture:check`, `npm run microphone-capture:dry-run`, `bun scripts/context-index.ts` y `bun scripts/agent-context-audit.ts` pasan.
- MVP 3 CI-safe cubre fake capture, WebView adapter, captured-audio pipeline, STT shell sin provider real por default y delivery evidence honesta con copy fallback sin `paste_observed`.
- No se grabo audio real, no se pidio permiso real de microfono, no se llamo provider real.
- Arbol tracked limpio al cierre; ignored esperados pueden incluir `.env`, `artifacts/`, `dist/`, `node_modules/`, `target-codex-check/`, `test-results/` y `.agents/skills/`.
- Arquitectura guia: pipeline por puertos/adapters, `PipelineService`, event ledger, UI como observadora, Tauri/Rust para side effects desktop, delivery por evidencia.
- `PRODUCT.md` define register `product`, usuarios, proposito, personalidad, anti-referencias, principios y accesibilidad.
- `DESIGN.md` define el sistema visual inicial: "The Quiet Control Room", paleta restringida, tipografia Inter/system, componentes base y prohibiciones.

Siguiente batch sugerido:

- Si no hay aprobacion real: definir la proxima spec post-MVP3 o hacer una revision arquitectonica antes de sumar side effects reales.
- Si JP aprueba explicitamente audio/provider real: evaluar `T022-T024` y/o `T035-T036`, manteniendo artifacts locales ignorados y sin imprimir secretos ni payloads.

No reabras alcance MVP salvo contradiccion tecnica fuerte. Mantener microfono real, provider real, hotkeys, tray, settings amplias, selected-text real y persistencia durable fuera de alcance salvo decision explicita. Mantener modo personal/dev permisivo para lectura local, pero no imprimir secretos completos ni commitear `.env`/tokens.
```

## Nota

Este prompt no reemplaza a `docs/WORKING_MEMORY.md`. Si queda viejo, compactarlo o archivarlo.
