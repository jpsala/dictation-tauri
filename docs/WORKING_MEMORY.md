# Working Memory

Estado vivo del proyecto. Mantener corto.

Ultima actualizacion manual: 2026-06-21 (AOS guardar sesion).

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
| `010-desktop-dictation-control-delivery` | drafted: session controller, honest delivery, fake desktop control events, gated minimal hotkey | `specs/010-desktop-dictation-control-delivery/tasks.md` |

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

Continuar con `010`:

1. `009` quedo decidido hasta T023: managed STT + managed postprocess funcionan; la proxima spec de delivery/hotkey es `010-desktop-dictation-control-delivery`.
2. Primer Small Batch recomendado: ejecutar `010` Phase 1-2 RED/foundation (`tests/desktop-control/*`, `src/desktop-control/types.ts`, `src/delivery/types.ts`) sin provider calls ni desktop side effects reales.
3. Decision vigente: direct Groq queda como BYOK/dev fallback explicito (`provider: groq/direct/byok`), no fallback silencioso si managed/preflight no esta listo; managed+device cuenta como configured aunque no haya `GROQ_API_KEY` local.
4. Guardrail `010`: fake control events antes de hotkey real; review/manual copy antes de paste automation; nunca `paste_observed` sin observador verificado.
5. Estado repo: cerrar con commit atomico local; no push.
6. Checks recientes pre-010: `bun scripts/fixvox-managed-smoke.ts --allow-provider-call --postprocess` OK; `npm run build` OK; `npm run test:pipeline` OK (138 tests); `cd src-tauri && cargo check` OK; `cd src-tauri && cargo test --test fixvox_cloud_contract --no-run` OK. Rust test executables currently fail to launch in this shell with `STATUS_ENTRYPOINT_NOT_FOUND`, so real smoke used the Bun gated script.

## Promocion De Memoria

Regla critica -> `AGENTS.md`; estado vivo -> `WORKING_MEMORY.md`; conocimiento reusable -> topic; decision durable -> `docs/DECISIONS.md`; trabajo retomable -> track.
