---
status: active
started: 2026-06-05
updated: 2026-06-13
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

Objetivo probable: definir spec post-MVP3 de transcripcion/delivery runtime o, solo con aprobacion explicita de JP, correr las verificaciones manuales/opcionales de provider real. `specs/001-port-foundation/tasks.md` quedo completo para MVP 0, `specs/002-simulated-pipeline/tasks.md` para MVP 1, `specs/003-synthetic-audio-stt/tasks.md` para MVP 2 dry-run y `specs/004-real-microphone-capture/tasks.md` quedo completo con captura nativa real.

Estado verificado:

- Verificar estado real inicial con `git status --short --branch` y `git log -1 --oneline`; el repo debe venir tracked limpio y ahead sobre `origin/main`.
- Ultimo cierre de secuencia post-MVP3: `9ee59e1 docs: decide post-mvp3 sequence`.
- Ultimo cierre funcional de MVP3 real/native capture: `8ba5bc9 feat: add native microphone fallback`; commits posteriores pueden ser refresh de handoff/contexto.
- `npm run build` pasa.
- `npm run visual:check` pasa.
- `npm run test:pipeline` pasa para success/failure/cancelacion/no-overlap/event ledger.
- `npm run synthetic-audio:stt:dry-run`, `npm run microphone-capture:check`, `npm run microphone-capture:dry-run`, `bun scripts/context-index.ts` y `bun scripts/agent-context-audit.ts` pasan.
- MVP 3 cubre fake capture, WebView adapter testeado, captura real nativa Rust/Tauri en Windows, captured-audio pipeline, STT shell sin provider real por default y delivery evidence honesta con copy fallback sin `paste_observed`.
- WebView2 `getUserMedia` quedo pendiente sin prompt operable; la ruta activa de microfono real es `NativeTauriCaptureGateway` + comandos Tauri `cpal`/`hound`.
- Se grabo un WAV real local con aprobacion de JP y quedo bajo `artifacts/microphone-capture/audio/`, ignorado por git. No se llamo provider real.
- Arbol tracked limpio al cierre; ignored esperados pueden incluir `.env`, `artifacts/`, `dist/`, `node_modules/`, `target-codex-check/`, `test-results/` y `.agents/skills/`.
- Arquitectura guia: pipeline por puertos/adapters, `PipelineService`, event ledger, UI como observadora, Tauri/Rust para side effects desktop, delivery por evidencia.
- `PRODUCT.md` define register `product`, usuarios, proposito, personalidad, anti-referencias, principios y accesibilidad.
- `DESIGN.md` define el sistema visual inicial: "The Quiet Control Room", paleta restringida, tipografia Inter/system, componentes base y prohibiciones.

Siguiente batch sugerido:

- Si no hay aprobacion de provider real: definir spec post-MVP3 de transcripcion/delivery runtime.
- Si JP aprueba explicitamente provider real: evaluar `T035-T036`, manteniendo artifacts locales ignorados y sin imprimir secretos ni payloads.

No reabras alcance MVP salvo contradiccion tecnica fuerte. Priorizar evidencia end-to-end de dictado antes de ergonomia desktop amplia. Mantener provider real, hotkeys, tray, settings amplias, selected-text real y persistencia durable fuera de alcance salvo decision explicita. Mantener modo personal/dev permisivo para lectura local, pero no imprimir secretos completos ni commitear `.env`/tokens.
```

## Nota

Este prompt no reemplaza a `docs/WORKING_MEMORY.md`. Si queda viejo, compactarlo o archivarlo.
