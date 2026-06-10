---
status: active
started: 2026-06-05
updated: 2026-06-10
priority: medium
topic: docs/topics/dictation-tauri-foundation.md
related:
  - docs/WORKING_MEMORY.md
  - specs/001-port-foundation/tasks.md
---

# Prompt Para Proxima Sesion

Prompt compacto para retomar sin reabrir decisiones resueltas:

```text
Estamos en C:\dev\dictation-tauri. Usa la ruta liviana de AGENTS.md: context-index si existe, WORKING_MEMORY y luego el topic/spec/task puntual.

Objetivo probable: abrir la spec de MVP 2 para audio sintetico + STT real sobre fixtures. `specs/001-port-foundation/tasks.md` quedo completo para MVP 0, `specs/002-simulated-pipeline/tasks.md` quedo completo para MVP 1, y `PRODUCT.md`/`DESIGN.md` ya existen como contexto para UI durable.

Estado verificado:

- `npm run build` pasa.
- `npm run visual:check` pasa.
- `npm run test:pipeline` pasa para success/failure/cancelacion/no-overlap/event ledger.
- `$env:CARGO_TARGET_DIR='target-codex-check'; cargo check --manifest-path src-tauri/Cargo.toml` pasa.
- `bun scripts/context-index.ts` y `bun scripts/agent-context-audit.ts` pasan.
- MVP 0-1 no incluye audio real, hotkeys, tray, settings, provider routing real, persistencia de producto ni UI durable.
- Arquitectura guia: pipeline por puertos/adapters, `PipelineService`, event ledger, UI como observadora, Tauri/Rust para side effects desktop, delivery por evidencia.
- `PRODUCT.md` define register `product`, usuarios, proposito, personalidad, anti-referencias, principios y accesibilidad.
- `DESIGN.md` define el sistema visual inicial: "The Quiet Control Room", paleta restringida, tipografia Inter/system, componentes base y prohibiciones.

No reabras alcance MVP salvo contradiccion tecnica fuerte. Para MVP 2, mantener microfono real, Tauri commands de producto, clipboard real, hotkeys, tray y persistencia fuera de alcance salvo decision explicita. Mantener modo personal/dev permisivo para lectura local, pero no imprimir secretos completos ni commitear `.env`/tokens.
```

## Nota

Este prompt no reemplaza a `docs/WORKING_MEMORY.md`. Si queda viejo, compactarlo o archivarlo.
