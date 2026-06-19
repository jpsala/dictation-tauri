# Working Memory

Estado vivo del proyecto. Mantener corto.

Ultima actualizacion manual: 2026-06-13.

## Regla

Este archivo es router operativo, no historia. Si un detalle crece, moverlo a topic, decision, spec o track.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Fundacion tecnica Tauri | mvp0-complete | `specs/001-port-foundation/tasks.md` | Mantener como baseline tecnico. |
| Producto/MVP dictado | decided | `docs/topics/product-direction.md` | Respetar MVP 0-3. |
| Fuentes de referencia | active | `docs/topics/source-project-map.md` | Usar como mapa adopt/adapt/reference bajo demanda. |
| Fixtures/STT | active | `docs/topics/automation-and-reference-fixtures.md` | Diseñar harness propio antes de pruebas manuales. |
| Backend/model routing | decided | `docs/topics/backend-and-model-routing.md` | Mock port primero; directo local en MVP 2; proxy como spike posterior. |
| UI/design | seeded | `PRODUCT.md`, `DESIGN.md` | Usar antes de cualquier UI durable. |
| Pipeline simulado | mvp1-complete | `specs/002-simulated-pipeline/tasks.md` | Mantener como baseline para MVP 2. |
| Audio sintetico/STT | mvp2-dry-run-complete | `specs/003-synthetic-audio-stt/tasks.md` | T031 queda opcional/local si se decide correr provider real. |
| Microfono real | mvp3-complete-provider-smoke | `specs/004-real-microphone-capture/tasks.md` | Mantener como baseline: captura nativa real + smoke local de provider real bajo artifacts ignorados. |
| Datos de dictado | decided | `docs/topics/privacy-and-dictation-data.md` | Modo personal/dev permisivo; no imprimir ni commitear secretos. |
| AOS/docs | active | `docs/topics/agentic-os.md` | Mantener `docs/tracks/`, `docs/skills/`, junction y audit verde. |

## Spec Activa

| Spec | Estado | Abrir |
| --- | --- | --- |
| `001-port-foundation` | complete | `specs/001-port-foundation/tasks.md` |
| `002-simulated-pipeline` | complete | `specs/002-simulated-pipeline/tasks.md` |
| `003-synthetic-audio-stt` | dry-run complete | `specs/003-synthetic-audio-stt/tasks.md` |
| `004-real-microphone-capture` | complete incl. optional provider smoke | `specs/004-real-microphone-capture/tasks.md` |
| `005-runtime-transcription-delivery` | US1-US3 CI-safe runtime/recovery/delivery evidence complete; optional provider verification gated | `specs/005-runtime-transcription-delivery/tasks.md` |

## Tracks Activas

| Trabajo | Abrir | Uso |
| --- | --- | --- |
| MVP y recursos | `docs/tracks/mvp-and-reference-resources.md` | Continuidad de recursos Fixvox y fases. |
| Estudio de fuentes | `docs/tracks/source-project-study-plan.md` | Plan vivo para CopyQ Tauri/Fixvox. |
| Prompt proxima sesion | `docs/tracks/next-session-prompt.md` | Handoff compacto; no reemplaza working memory. |

## Decisiones Vigentes

- Stack base: React, Vite, TypeScript strict, npm, Tauri v2, Rust 2021 y Playwright.
- `C:\dev\chat\copyq-tauri` es canon tecnico para Tauri/UI/settings/Windows desktop mechanics.
- `C:\dev\electro-bun-1` / Fixvox es canon funcional para dictado, runtime, backend/proxy, policies/env y benchmarks; no se porta literal.
- MVP 0-3: app base, pipeline simulado, audio sintetico/STT dry-run con shell de provider real, microfono real.
- MVP 3 cubre captura fake/WebView adapter en tests, captura real nativa Rust/Tauri en Windows con artifact WAV local ignorado, pipeline de captured audio, STT shell sin provider real por default, y evidencia honesta de delivery/recovery sin `paste_observed`.
- WebView2 `getUserMedia` quedo pendiente sin prompt operable en Windows; la ruta activa de microfono real es el fallback nativo `cpal`/`hound`.
- Runtime: pipeline por puertos/adapters, `PipelineService`, event ledger y summary derivado antes de side effects reales.
- `ModelGateway` hibrido: mock port primero, adapter directo local en MVP 2; proxied como spike posterior.
- Texto seleccionado real queda fuera de MVP 0-3; se permite simulacion en fixtures.
- Tauri/Rust posee side effects desktop cuando entren: microfono, hotkeys, tray, foco, clipboard, ventanas, permisos y secretos.
- Delivery se modela por evidencia/certeza; no prometer paste observado sin verificacion real.
- Post-MVP3: `005-runtime-transcription-delivery` ya cubre foundation runtime, US1 transcription boundary, US2 recovery/review y US3 delivery evidence honesta con tests fake/dry-run; real-provider verification sigue opcional/gated.
- UI durable requiere `PRODUCT.md` y `DESIGN.md`.
- Small Batches: una task SpecKit, comportamiento o checkpoint por tanda, checks verdes y commit atomico.
- La ruta inicial debe seguir liviana; no convertir `AGENTS.md`, `WORKING_MEMORY.md`, `TOPICS.md` ni tracks activas en historial.

## Riesgos

- No imprimir secretos completos ni commitear `.env`/tokens salvo pedido explicito y acotado.
- No copiar dependencias de clipboard/storage/Win32 de `copyq-tauri` sin decision documentada.
- En modo personal/dev se pueden usar servicios externos con variables locales; antes de producto estable, documentar frontera.
- `csp: null` no debe sobrevivir a runtime real con providers/contenido dinamico sin decision explicita.
- Si codigo contradice docs/specs, actualizar la fuente estable.

## Comandos

```powershell
npm run synthetic-audio:fixtures
npm run synthetic-audio:stt:dry-run
npm run test:pipeline
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
bun scripts/context-refresh.ts --track docs/tracks/<track>.md
bun scripts/check-skills-junction.ts
```

## Proximo Paso Probable

Cerrar o decidir el siguiente salto tras `005` CI-safe:

1. Si JP aprueba, ejecutar verificacion real-provider opcional (`T033-T036`) sobre artifact ignorado y reporte redacted.
2. Si no, hacer polish/final verification restante (`T043-T045`) y commit atomico.
3. Decidir aparte el cambio preexistente de `package.json`/`package-lock.json` que agrega `@earendil-works/pi-coding-agent` como dependency runtime.

## Promocion De Memoria

Regla critica -> `AGENTS.md`; estado vivo -> `WORKING_MEMORY.md`; conocimiento reusable -> topic; decision durable -> `docs/DECISIONS.md`; trabajo retomable -> track.
