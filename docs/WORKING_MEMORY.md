# Working Memory

Estado vivo del proyecto. Mantener corto.

Ultima actualizacion manual: 2026-06-23 (batch policy update).

## Regla

Este archivo es router operativo, no historia. Si un detalle crece, moverlo a topic, decision, spec o track.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Fundacion tecnica Tauri | mvp0-complete | `specs/001-port-foundation/tasks.md` | Mantener como baseline tecnico. |
| Producto/MVP dictado | decided | `docs/topics/product-direction.md` | Respetar MVP 0-3. |
| Fuentes de referencia | active | `docs/topics/source-project-map.md` | Usar como mapa adopt/adapt/reference bajo demanda. |
| Fixtures/STT | active | `docs/topics/automation-and-reference-fixtures.md` | Diseñar harness propio antes de pruebas manuales. |
| Backend/model routing | decided | `docs/topics/backend-and-model-routing.md`, `docs/topics/fixvox-cloud-runtime-port.md` | Post-008: promover Fixvox managed cloud desde Rust/Tauri; directo Groq queda BYOK/dev fallback. |
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
| `005-runtime-transcription-delivery` | complete incl. reusable gated runtime script and approved real-provider verification | `specs/005-runtime-transcription-delivery/tasks.md` |
| `006-host-runtime-transcription-boundary` | complete: TS host boundary, provider-free UI guardrails, Tauri invoke client and safe unavailable Tauri stub | `specs/006-host-runtime-transcription-boundary/tasks.md` |
| `007-usable-dictation-loop` | complete and committed (`78438e7`): Rust host Groq multipart path implemented behind explicit gate; provider smoke passed with redacted evidence | `specs/007-usable-dictation-loop/tasks.md` |
| `008-real-provider-ui-gate` | complete and committed (`d0cfac7` + fixes): UI separates `Transcribe with provider` from provider-free `Check host boundary`; manual Tauri real-provider validation passed | `specs/008-real-provider-ui-gate/tasks.md` |
| `009-fixvox-cloud-runtime-port` | complete through T023: managed STT/postprocess passed; delivery/hotkey next spec decided | `specs/009-fixvox-cloud-runtime-port/tasks.md` |
| `010-desktop-dictation-control-delivery` | complete incl. T046: Rust-owned `Ctrl+Shift+F9` hotkey smoke passed locally with redacted ignored artifact evidence | `specs/010-desktop-dictation-control-delivery/tasks.md` |
| `011-selection-transform-and-recovery-ergonomics` | active: fixture-first selection routing/transforms and safe paste-last recovery implemented; T036/T037 chose and compile-guarded host-owned non-mutating Windows UI Automation first route, real capture still gated | `specs/011-selection-transform-and-recovery-ergonomics/tasks.md` |

## Tracks Activas

| Trabajo | Abrir | Uso |
| --- | --- | --- |
| MVP y recursos | `docs/tracks/mvp-and-reference-resources.md` | Continuidad de recursos Fixvox y fases. |
| Estudio de fuentes | `docs/tracks/source-project-study-plan.md` | Plan vivo para CopyQ Tauri/Fixvox. |

## Decisiones Vigentes

- Stack base: React, Vite, TypeScript strict, npm, Tauri v2, Rust 2021 y Playwright.
- `C:\dev\chat\copyq-tauri` es canon tecnico para Tauri/UI/settings/Windows desktop mechanics.
- `C:\dev\electro-bun-1` / Fixvox es canon funcional para dictado, runtime, backend/proxy, policies/env y benchmarks; no se porta literal.
- MVP 0-3: app base, pipeline simulado, audio sintetico/STT dry-run con shell de provider real, microfono real.
- MVP 3 cubre captura fake/WebView adapter en tests, captura real nativa Rust/Tauri en Windows con artifact WAV local ignorado, pipeline de captured audio, STT shell sin provider real por default, y evidencia honesta de delivery/recovery sin `paste_observed`.
- WebView2 `getUserMedia` quedo pendiente sin prompt operable en Windows; la ruta activa de microfono real es el fallback nativo `cpal`/`hound`.
- Runtime: pipeline por puertos/adapters, `PipelineService`, event ledger y summary derivado antes de side effects reales.
- `ModelGateway` hibrido: mock/provider-free para tests, directo local como BYOK/dev fallback explicito y managed cloud Fixvox como camino principal post-008.
- Texto seleccionado real queda fuera de MVP 0-3; se permite simulacion en fixtures.
- Tauri/Rust posee side effects desktop cuando entren: microfono, hotkeys, tray, foco, clipboard, ventanas, permisos y secretos.
- Delivery se modela por evidencia/certeza; no prometer paste observado sin verificacion real.
- Post-MVP3: `005-runtime-transcription-delivery` cubre foundation runtime y script Groq gated; `007`/`008` cierran app UI -> Tauri host -> Groq STT real con gesto explicito, artifacts ignorados y evidencia honesta.
- UI durable requiere `PRODUCT.md` y `DESIGN.md`.
- Small Batches ahora optimizan por checkpoint verificable: agrupar 2-5 tasks acopladas cuando aceleran un unico comportamiento; separar siempre gates, manual smokes, provider calls, side effects reales, paste/selection real e historial durable.
- Post-010: `011` arranca seleccion fixture-first; T036/T037 definen y compile-guardan captura real futura como host-owned Windows UI Automation no-mutating first, con clipboard roundtrip separado/gated; no leer seleccion real, no paste automation y no historial durable hasta aprobacion explicita.
- `paste-last` seguro es solo evidencia/UI `uncertain`: no envia teclas, no toca foco/clipboard y nunca reclama `paste_observed`.
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
npm run runtime-transcription:check
npm run runtime-transcription:groq:dry-run
npm run test:pipeline
npm run build
cd src-tauri && cargo check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
bun scripts/context-refresh.ts --track docs/tracks/<track>.md
bun scripts/check-skills-junction.ts
```

## Proximo Paso Probable

`011` seleccion/recovery esta abierto con alcance seguro avanzado:

1. `010` quedo cerrado completo: shortcut fijo `Ctrl+Shift+F9`, ruta Rust-owned Tauri v2 global shortcut, renderer solo escucha evento `desktop-control://global-hotkey`, sin JS hotkey registration ni permisos frontend global-shortcut. T046 smoke manual paso con evidencia redacted en `specs/010-desktop-dictation-control-delivery/quickstart.md`.
2. `011` se creo como siguiente spec post-010: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/selection-transform-and-recovery.md`, `quickstart.md`, `tasks.md`.
3. Foundation/US1/US2 `011` quedaron implementados provider-free: `src/selection-transform/*` con `SelectionContext`, routing direct-vs-transform, presets fixture `rewrite`/`shorten`/`bulletize` y latest-result helpers ephemerales; tests en `tests/selection-transform/*`.
4. US3/US4 safe recovery quedo implementado/refinado en `src/App.tsx`: boton `Paste last (safe)` solo con latest result exitoso, helper `applySafePasteLastRecovery`, evidencia `uncertain`, review visible y sin teclas/foco/clipboard/paste observado.
5. `vitest.config.ts` incluye `tests/selection-transform/**/*.test.ts`; visual smoke verifica que el estado inicial no reclama paste observed.
6. Phase 8 documental de `011` quedo cerrado y commiteado; OS sync posterior dejo `.agents/skills` apuntando a `docs/skills`, context index/audit OK con 4 warnings conocidos.
7. Ultimo refinement no-gated de `011`: `latestResultFromPipelineSummary` y `latestResultFromSelectionTransform` impiden que runs fallidos/cancelados/vacios se vuelvan reusables y mantienen latest-result en memoria/tipo, sin historial durable.
8. Modo de trabajo actualizado por JP: evitar microbatches; ejecutar batches de checkpoint mas amplios cuando sean verificables y reversibles.
9. `011` T036/T037 quedaron diseñados/compile-guarded sin captura real: ruta futura host-owned non-mutating Windows UI Automation first; failure behavior modelado (`unsupported_target`, `no_selection`, `timeout`, etc.); clipboard roundtrip/`Ctrl+C` diferido a decision separada.
10. Proximo checkpoint recomendado hacia usable v0: pedir aprobacion explicita antes de un smoke E2E real de dictado con provider/hotkey o antes de `011` T038 real selection capture.
11. Guardrails vigentes: no selection real, no paste automation, no durable history, no provider calls por default, no `paste_observed` sin observador verificado.
12. Checks recientes: antes del smoke `010 T046`, `npm run test:pipeline -- tests/desktop-control` OK (48 tests) y `cd src-tauri && cargo check` OK; smoke `Ctrl+Shift+F9` genero artifact ignorado `capture-native-1782219726497.wav` sin provider/seleccion/paste automation. Checks previos de `011`: `npm run test:pipeline` OK (207 tests), `npm run build` OK, context index/audit OK con 4 warnings conocidos.

## Promocion De Memoria

Regla critica -> `AGENTS.md`; estado vivo -> `WORKING_MEMORY.md`; conocimiento reusable -> topic; decision durable -> `docs/DECISIONS.md`; trabajo retomable -> track.
