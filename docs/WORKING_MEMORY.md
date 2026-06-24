# Working Memory

Estado vivo del proyecto. Mantener corto.

Ultima actualizacion manual: 2026-06-24 (AOS continuar sesion after Alt+Space/default E2E hardening).

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
| `009-fixvox-cloud-runtime-port` | complete through T023 plus managed STT smoke on fresh hotkey WAV passed 2026-06-23 | `specs/009-fixvox-cloud-runtime-port/tasks.md` |
| `010-desktop-dictation-control-delivery` | complete incl. T046 and E2E: `Ctrl+Shift+F9` -> fresh WAV -> Fixvox managed STT -> review visible -> copy fallback changed clipboard | `specs/010-desktop-dictation-control-delivery/tasks.md` |
| `011-selection-transform-and-recovery-ergonomics` | active post-selection smoke: fixture-first routing/transforms, safe paste-last, explicit host command boundary, redacted target metadata, best-effort UIA selected-text read, and T039 product IPC smoke passed; replace-selection remains gated | `specs/011-selection-transform-and-recovery-ergonomics/tasks.md` |
| `012-fixvox-dock-dictation-key` | complete through larger parity follow-ups: Skin4-like dock, Rust/Tauri shell, tray/context menu, default native Alt+Space with fallback, companion window first-slice, bounded result history, side-by-side smoke, and real `paste_sent` E2E | `specs/012-fixvox-dock-dictation-key/tasks.md` |

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
- Permiso persistente 2026-06-24: Pi puede ejecutar side effects locales controlados para este repo/dev machine (CUA, apps sandbox, mic/audio fixtures, provider real con `.env`, clipboard temporal restaurado, hotkeys/clicks, artifacts ignorados, cleanup) sin pedir aprobacion por cada smoke; siguen gated login/cuentas, envios/pagos/publicaciones/deploy/push, installs/autostart/tunnels, borrar datos reales, apps/documentos personales, `Alt+Space`, seleccion real, replace-selection y observer `paste_observed`.
- Delivery se modela por evidencia/certeza; no prometer paste observado sin verificacion real.
- Post-MVP3: `005-runtime-transcription-delivery` cubre foundation runtime y script Groq gated; `007`/`008` cierran app UI -> Tauri host -> Groq STT real con gesto explicito, artifacts ignorados y evidencia honesta.
- UI durable requiere `PRODUCT.md` y `DESIGN.md`; para voice dock/hotkeys, `docs/topics/fixvox-dock-and-hotkeys-reference.md` es referencia fuerte porque JP quiere respetar la ergonomia Fixvox de dock compacto, VU/dots, recovery y dictation key hold/tap.
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

`011` T039 quedo cerrado con smoke real redacted de selected-text UIA por IPC de producto. `012` Checkpoint E y follow-ups principales quedaron cerrados: dock parity principal, tray/context menu, hide-on-close, Alt+Space default en Windows con fallback, companion window first-slice, result history local, UIA selected-text read y observer bounded. Observer interno hardeneado y E2E controlado `paste_observed` paso; proximo trabajo probable: conectar presets a selection-transform/replace-selection, sincronizar companion window real, o pasar mas E2E post-default/Alt+Space.

1. `010` quedo cerrado completo: shortcut fijo `Ctrl+Shift+F9`, ruta Rust-owned Tauri v2 global shortcut, renderer solo escucha evento `desktop-control://global-hotkey`, sin JS hotkey registration ni permisos frontend global-shortcut. T046 smoke manual paso con evidencia redacted en `specs/010-desktop-dictation-control-delivery/quickstart.md`.
2. `011` se creo como siguiente spec post-010: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/selection-transform-and-recovery.md`, `quickstart.md`, `tasks.md`.
3. Foundation/US1/US2 `011` quedaron implementados provider-free: `src/selection-transform/*` con `SelectionContext`, routing direct-vs-transform, presets fixture `rewrite`/`shorten`/`bulletize` y latest-result helpers ephemerales; tests en `tests/selection-transform/*`.
4. US3/US4 safe recovery quedo implementado/refinado en `src/App.tsx`: boton `Paste last (safe)` solo con latest result exitoso, helper `applySafePasteLastRecovery`, evidencia `uncertain`, review visible y sin teclas/foco/clipboard/paste observado.
5. `vitest.config.ts` incluye `tests/selection-transform/**/*.test.ts`; visual smoke verifica que el estado inicial no reclama paste observed.
6. Phase 8 documental de `011` quedo cerrado y commiteado; OS sync posterior dejo `.agents/skills` apuntando a `docs/skills`, context index/audit OK con 4 warnings conocidos.
7. Ultimo refinement no-gated de `011`: `latestResultFromPipelineSummary` y `latestResultFromSelectionTransform` impiden que runs fallidos/cancelados/vacios se vuelvan reusables y mantienen latest-result en memoria/tipo, sin historial durable.
8. Modo de trabajo actualizado por JP: evitar microbatches; ejecutar batches de checkpoint mas amplios cuando sean verificables y reversibles.
9. `011` T036/T037 quedaron diseñados/compile-guarded sin captura real: ruta futura host-owned non-mutating Windows UI Automation first; failure behavior modelado (`unsupported_target`, `no_selection`, `timeout`, etc.); clipboard roundtrip/`Ctrl+C` diferido a decision separada.
10. E2E usable v0 paso con aprobacion explicita `E2E con copy real`: `Ctrl+Shift+F9` -> nuevo WAV -> Fixvox managed STT -> transcript review visible -> `Copy transcript` mutó clipboard a texto no vacio. Evidencia redacted en `specs/010-desktop-dictation-control-delivery/quickstart.md` y `specs/009-fixvox-cloud-runtime-port/quickstart.md`.
11. JP pidio respetar bien la estetica/funcionalidad/hotkeys de Fixvox (`C:\dev\fixvox`): antes de rediseñar dock o hotkeys abrir `docs/topics/fixvox-dock-and-hotkeys-reference.md` y contrastar con `C:/dev/fixvox/src/app/views/voice-dock/` + `src/app/backend/hotkeys.ts`.
12. `012-fixvox-dock-dictation-key` quedo creado para avanzar usabilidad en pocos checkpoints grandes: A contratos/estado, B dock React compacto, C dictation-key press/release sobre Tauri actual, D floating dock/recovery, y Alt+Space como decision gated.
13. `012` Checkpoint A quedo implementado: `src/voice-dock/*` deriva semantica visual provider-free, `src/desktop-control/dictation-key.ts` resuelve hold/tap/latched/cancel sin Tauri ni side effects, y `tests/voice-dock/*` + `tests/desktop-control/dictation-key.test.ts` cubren contratos/guardrails.
14. `012` Checkpoint B quedo implementado: `VoiceDock.tsx` es superficie primaria compacta, `src/App.tsx` deja evidencia/dev tools detras de `Developer evidence`, `src/styles.css` agrega dock oscuro compacto con VU/dots y reduced-motion, y `tests/voice-dock/voice-dock-ui.test.tsx` + visual smoke cubren estado/copy/recovery sin `paste_observed`.
15. `012` Checkpoint C quedo completo: Rust emite payloads `pressed`/`released` para `Ctrl+Shift+F9`, el renderer los mapea a `DictationKeyEvent`, `App.tsx` resuelve hold/tap/deferred release via `DesktopDictationController`, y T017 paso con smoke manual Tauri aprobado/redacted; evidencia en `specs/012-fixvox-dock-dictation-key/quickstart.md`.
16. `012` Checkpoint D quedo completo para la ruta dev dock: `npm run tauri:dev` abre `Dictation Dock` transparente `164x64` always-on-top con 7 dots estilo Fixvox, controles laterales al grabar y chip compacto de estado/recovery; tray queda despues.
17. Dock smoke computer-use paso side-by-side contra Fixvox: `Ctrl+Shift+F9` tap/hold inicio/detuvo captura por ruta Tauri real y genero WAVs ignorados; se corrigio feedback de voz agregando VU RMS real desde Rust (`get_native_microphone_capture_level`), polling renderer y scaling visual amplificado para barras verdes visibles.
18. Dock stop explicito ahora usa host STT real en Tauri y llego a chip compacto `Transcript ready` con WAV fresco; tambien se normalizo evidencia `uncertain` con transcript disponible a `review/available` para no mostrar `Check target`/`Needs attention` cuando hay texto. Browser/dev tests siguen provider-free.
19. Primer paste/insert real gated quedo implementado y smokeado: Tauri guarda target foreground antes de grabar, al stop enfoca target, escribe clipboard, envia `Ctrl+V`, restaura clipboard y reporta solo `paste_sent`; smoke controlado con Notepad cambio archivo 0->10 bytes y restauro sentinel, sin `paste_observed`, sin selection/replace, sin Alt+Space.
20. Closeout `012` T024-T028 quedo hecho para el alcance safe shortcut/dev dock/saved-target `paste_sent`; Alt+Space, tray/background, selection/replace y observer/verificacion real quedan future/gated.
21. JP cambio prioridad inmediata: antes de observer/tray, llevar el dock a paridad cercana con Fixvox Skin4. Nueva task activa: `012` Phase 8 / Checkpoint E para comparar side-by-side con Fixvox, ajustar visuales/shell, y preferir Rust/Tauri Windows APIs para no-activate, transparencia, hit-test/region, posicion/DPI y preservacion de foco.
22. `012` T030 quedo cerrado: `tests/voice-dock/voice-dock-parity.test.tsx` agrega contrato provider-free de paridad Skin4 (idle `164x64`, 7 dots, dot gap/size, recording controls, processing chip, reduced motion, no `paste_observed`, no panel dev/provider). CUA MCP persistente smokeo Vite/browser: Start -> Recording -> Stop -> recovery provider-free; evidencia en `artifacts/desktop-control/cua-visual-smoke/20260624-110253/report.json`.
23. `012` T031 quedo cerrado renderer-only: `VoiceDock.tsx` nombra constantes Skin4 y expone `data-skin`, `styles.css` acerca el core a `66x28`, controles laterales `31px`, gap Skin4, companion chip compacto de dos lineas, hover/focus y reduced motion. Checks pasaron: `npm run test:pipeline -- tests/voice-dock`, `npm run test:pipeline -- tests/voice-dock tests/desktop-control`, `npm run build`, `npm run visual:check`.
24. `012` T032/T033 quedaron cerrados en serial tras fan-out de explorers: nuevo `src-tauri/src/dock_shell.rs` posiciona y muestra `Dictation Dock` desde Rust/Tauri, config arranca hidden/`focus:false`/`skipTaskbar:true`, Windows aplica `WS_EX_NOACTIVATE` + `WS_EX_TOOLWINDOW` y quita `WS_EX_APPWINDOW`. Smoke CUA/Win32 `artifacts/desktop-control/dock-shell-smoke/20260624-114946/report.json`: rect `164x64`, foreground siguio en terminal, `noActivate=true`, `toolWindow=true`, `appWindow=false`.
25. `012` T034 quedo cerrado con smoke side-by-side contra Fixvox ya corriendo. Evidencia ignorada en `artifacts/desktop-control/dock-parity-smoke/20260624-124835/summary.json` + crops. Resultado: idle/recording muy cercanos (`164x64`, transparente, 7 dots, VU, controles laterales, no-activate/toolWindow/appWindow false, foreground preservado). Deviations para JP review: falta enter-submit azul, hit-region idle nativa, resize state-aware processing/error, context menu/preset/assistant. Dictation stop contra fixture llego a `Transcript ready`; Fixvox stop volvio a idle demasiado rapido para capturar processing chip.
26. `012` T035 quedo cerrado con smoke real post-parity: `scripts/desktop-dictation-e2e.ps1` run id `20260624-T035-post-parity` paso `Ctrl+Shift+F9` -> speech fixture -> live VU/fresh WAV -> managed STT -> saved-target `paste_sent` -> clipboard sentinel restore. Evidencia redacted: `artifacts/desktop-control/dictation-e2e/20260624-T035-post-parity/report.json`.
27. `012` T036 cerro docs finales. JP eligio `Aceptar como follow-ups` para desviaciones restantes: enter-submit azul, hit-region idle nativa/rounded hit-test, resize state-aware processing/error, context menu, preset badge e indicadores assistant. No bloquean Checkpoint E.
28. Computer use / E2E real: `scripts/desktop-dictation-e2e.ps1` quedo como harness reusable para punta a punta real con permiso persistente local controlado. Passing runs: `artifacts/desktop-control/dictation-e2e/20260624-104246/report.json` y post-parity `artifacts/desktop-control/dictation-e2e/20260624-T035-post-parity/report.json`. Live target output usa `%TEMP%` para evitar crash Vite `EBUSY` al watch-ear artifacts escritos.
29. Checks recientes de Checkpoint E: `npm run test:pipeline -- tests/voice-dock` OK (4 files / 16 tests), `npm run test:pipeline -- tests/voice-dock tests/desktop-control` OK (15 files / 75 tests), `npm run build` OK, `npm run visual:check` OK (8 tests tras reintento por timeout inicial), `cd src-tauri && cargo check` OK, `bun scripts/context-index.ts && bun scripts/agent-context-audit.ts` OK con 4 warnings conocidos. `cd src-tauri && cargo test dock_shell`/`desktop_control` no fue usado como gate por `STATUS_ENTRYPOINT_NOT_FOUND` en este entorno.
30. Lote 1 follow-up dock parity quedo implementado: `VoiceDock` muestra `Stop & review` verde, `Stop & submit` azul y `Cancel` rojo; `Stop & submit` pide paste-then-Enter solo por esa accion y mantiene evidencia `paste_sent`; soporte visual-only para preset badge e assistant indicator; Rust/Tauri agrega `update_dock_shell_state`, idle rounded hit-region y resize state-aware (`260x90` en recovery). Feedback CUA uso `Dictation Dock` real y contexto controlado tipo Notepad, no browsers; evidencia `artifacts/desktop-control/dock-lote1-smoke/20260624-renderer-native/report.json`. Checks: `npm run test:pipeline` OK (50/239), `npm run build` OK, `cd src-tauri && cargo check` OK, `npm run visual:check` OK.
31. Lote 2 combinado implemento items 1/2/3 pedidos: Tauri tray/context menu y hide-on-close; host command event `desktop-control://host-command`; resolver Rust de dictation key configurable con default `Ctrl+Shift+F9` y `Alt+Space` solo con `DICTATION_TAURI_DICTATION_KEY=Alt+Space` + `DICTATION_TAURI_ALLOW_ALT_SPACE=true/1`; comando `capture_selection_context` de `011` registrado pero no invocado por renderer, retorna outcomes redacted/no_selection sin leer seleccion real por default. CUA smoke: `artifacts/desktop-control/combined-lote-smoke/20260624-tray-altspace-selection/report.json`. Checks: `npm run test:pipeline` OK (50/240), `npm run build` OK, `npm run visual:check` OK, `cd src-tauri && cargo check` OK.
32. Lote 3 avanzo los 5 frentes Fixvox: backend nativo Windows `WH_KEYBOARD_LL` para `Alt+Space` gateado y smokeado Start/Cancel sin menu del sistema; tray/context menu con presets/history/settings; companion panel renderer para recovery/history/settings; `result-history.v1.jsonl` host-owned en app data bounded a 50 entradas; selection capture redakta labels de target antes de cruzar frontera. E2E real retry paso en `artifacts/desktop-control/dictation-e2e/20260624-five-fronts-e2e-retry/report.json`; smoke Alt+Space/companion en `artifacts/desktop-control/combined-lote-smoke/20260624-five-fronts-altspace-companion/report.json`. Checks: `npm run test:pipeline` OK (50/242), `npm run build` OK, `npm run visual:check` OK, `cd src-tauri && cargo check` OK.
33. Lote 4 avanzo los 6 frentes: `Alt+Space` es default Windows con fallback explicito `DICTATION_TAURI_DICTATION_KEY=Ctrl+Shift+F9`; `capture_selection_context` intenta UIA `TextPattern.GetSelection()` real sin clipboard/keyboard/focus mutation; desktop delivery agrega observer Win32 bounded que solo eleva a `paste_observed` si verifica texto insertado; `dock-companion` es una segunda ventana Tauri hidden/no-taskbar first-slice; settings/history/presets siguen cableados desde menu. Smoke Alt+Space default paso en `artifacts/desktop-control/combined-lote-smoke/20260624-six-fronts-default-altspace-uia-observer/report.json`; checks OK (50/242, build, visual 8, cargo). El bloqueo E2E por Windows foreground-lock se resolvio hardeneando `scripts/desktop-dictation-e2e.ps1` con `AttachThreadInput` y `-DictationKey AltSpace`; full default Alt+Space E2E paso en `artifacts/desktop-control/dictation-e2e/20260624-e2e-altspace-default/report.json`.
34. `011` T039 quedo cerrado: se agrego harness gated `scripts/selection-capture-smoke.ps1` + `scripts/cdp-evaluate.mjs` (`npm run selection-capture:smoke`) y paso un smoke con target WPF controlado, texto sintetico seleccionado e IPC de producto `capture_selection_context` via Tauri WebView/CDP. Evidencia redacted: `artifacts/desktop-control/selection-capture-smoke/20260624-T039-uia-selection-smoke-retry/report.json` (`status: ok`, length/hash only, target labels `[redacted]`, no raw selected text, no clipboard/keyboard/focus mutation por el comando, no paste/replace/observer).
35. Observer interno hardeneado y probado en E2E controlado: `did_observe_inserted_text` normaliza CRLF/LF y exige aumento de ocurrencias entre lecturas Win32; hay unit tests Rust compile-guarded y test renderer del camino Tauri verified-observer. JP noto que el harness hablaba antes de activar dictado; se corrigio `scripts/desktop-dictation-e2e.ps1` para loggear CDP/hotkey/UI y esperar `Listening` antes de speech. Passing observer run: `artifacts/desktop-control/dictation-e2e/20260624-observer-paste-observed-e2e-verified/report.json` con product UI `paste_observed`, target text length/hash only en docs, fresh WAV y clipboard sentinel restored. `docs/topics/pi-agentic-os.md` documenta el playbook efectivo de computer use/CDP para Dictation Dock. Checks: `npm run test:pipeline` OK (50/243), focused delivery-evidence OK (13), `npm run build` OK, `cargo fmt --check` OK, `cargo check` OK. `cargo test desktop_delivery::platform::tests --lib` sigue bloqueado por `STATUS_ENTRYPOINT_NOT_FOUND` conocido.

## Promocion De Memoria

Regla critica -> `AGENTS.md`; estado vivo -> `WORKING_MEMORY.md`; conocimiento reusable -> topic; decision durable -> `docs/DECISIONS.md`; trabajo retomable -> track.
