---
status: active
started: 2026-06-05
updated: 2026-06-19
priority: medium
topic: docs/topics/dictation-tauri-foundation.md
related:
  - docs/WORKING_MEMORY.md
  - specs/007-usable-dictation-loop/tasks.md
---

# Prompt Para Proxima Sesion

Prompt compacto para retomar sin reabrir decisiones resueltas:

```text
Estamos en C:\dev\dictation-tauri. Usa la ruta liviana de AGENTS.md: lee docs/.generated/context-index.md si existe, docs/WORKING_MEMORY.md y luego solo el topic/spec/track puntual.

Estado actual importante:

- Repo en main, ahead de origin/main. Verificar con `git status --short --branch` y `git log -1 --oneline` al iniciar.
- Hay cambios sin commitear del batch 007: spec nueva, UI host-client wiring, readiness UI, copy fallback tests/helpers, Rust host CI-safe tests y docs de contexto. No asumir arbol limpio.
- `specs/007-usable-dictation-loop/` existe con spec/plan/research/data-model/contracts/quickstart/tasks.
- 007 T001-T026 estan completos: `src/App.tsx` usa `HostRuntimeClient`, carga `getReadiness()`, muestra readiness compacta, mantiene copy fallback honesto sin `paste_observed`; JP eligio Rust nativo HTTP/multipart y `src-tauri/src/runtime_transcription.rs` tiene tests CI-safe de setup/path/provider/error/redaction/artifact roots.
- En Tauri, runtime selection usa `createTauriHostRuntimeClient(invoke)`; en browser/dev usa unavailable host client salvo fake inyectado en tests.
- Helpers nuevos: `src/host-runtime/pipeline-adapter.ts`, `src/host-runtime/readiness-ui.ts`, `src/host-runtime/runtime-selection.ts`.
- Tests nuevos/relevantes: `tests/host-runtime/host-client-pipeline-adapter.test.ts`, `readiness-ui.test.ts`, `runtime-selection.test.ts`, `copy-fallback.test.ts` y tests inline en `src-tauri/src/runtime_transcription.rs`.
- `tests/visual/app-smoke.spec.ts` espera browser/dev honesto: `Host runtime transcription boundary is unavailable.` y readiness `Unavailable`.
- `src-tauri/src/runtime_transcription.rs` sigue siendo stub seguro unavailable/setup-error; no hay provider real host-side todavia.
- No correr provider real sin gating local explicito y aprobacion para verificacion real T031.

Checks verdes del cierre anterior:

- `npm run test:pipeline -- tests/host-runtime/host-client-pipeline-adapter.test.ts tests/host-runtime/provider-free-ui.test.ts tests/host-runtime/tauri-client.test.ts`
- `npm run test:pipeline -- tests/host-runtime`
- `npm run test:pipeline`
- `npm run build`
- `cd src-tauri && cargo test && cargo check`
- `npm run visual:check` (hubo un timeout inicial flake en 1/8, retry focal y suite completa pasaron)
- `bun scripts/context-index.ts`
- `bun scripts/agent-context-audit.ts` con 0 errores y warnings conocidos de contexto grande.
- `git ls-files artifacts .env` no mostro archivos trackeados; `.env` y `artifacts/` aparecen como ignored esperados.

Siguiente batch recomendado:

- Continuar 007 T027-T029: implementar provider real Rust detras de gating explicito, usando los tests CI-safe existentes como guardrail.
- Mantener React provider-free, sin provider calls default, sin hotkeys/tray/selected-text/history/settings/paste observation.
- Checks sugeridos antes de cerrar: `npm run test:pipeline`, `npm run build`, `cd src-tauri && cargo test && cargo check`, `npm run visual:check`, `bun scripts/context-index.ts`, `bun scripts/agent-context-audit.ts`, hygiene de `.env`/`artifacts`.

Guardrails:

- No imprimir secretos ni commitear `.env`, artifacts, transcripts, reports o provider payloads.
- No mezclar real provider path con readiness UI salvo decision explicita.
- Si se commitea, usar Small Batch atomico; no push sin pedido de JP.
```

## Nota

Este prompt no reemplaza a `docs/WORKING_MEMORY.md`. Si queda viejo, compactarlo o archivarlo.
