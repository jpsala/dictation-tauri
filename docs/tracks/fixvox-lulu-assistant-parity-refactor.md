---
status: active
started: 2026-07-03
updated: 2026-07-03
priority: high
owner: JP
topic: selection-and-assistant-actions
related:
  - docs/topics/fixvox-assistant-lulu-reference.md
  - docs/topics/selection-and-assistant-actions.md
  - docs/topics/fixvox-dock-and-hotkeys-reference.md
source_refs:
  - C:/dev/fixvox/src/app/backend/voice-command-ai-interpreter.ts
  - C:/dev/fixvox/src/app/backend/assistant-voice-shortcuts.ts
  - C:/dev/fixvox/src/app/backend/assistant-quick-chat-launch.ts
  - C:/dev/fixvox/src/app/backend/smart-agent/
  - C:/dev/fixvox/src/app/backend/smart-dictation.ts
  - C:/dev/fixvox/src/app/backend/interaction-delivery.ts
  - C:/dev/fixvox/src/app/backend/native-input.ts
---

# Fixvox Lulu Assistant Parity Refactor

## Objetivo

Alinear completamente el comportamiento `Lulu ...` de Dictation Tauri con el modelo Fixvox documentado, reemplazando el routing actual ad-hoc por una capa explicita de intencion/superficie que decida entre paste, notify/chip, showMarkdown, optionPicker, toolAction y Quick Chat.

Referencia obligatoria antes de tocar codigo: `docs/topics/fixvox-assistant-lulu-reference.md`.

## Problema Actual

El port actual avanzo, pero todavia mezcla modelos:

- `Lulu ...` se parsea, pero el output assistant sigue pasando por estructuras heredadas de transcript/recovery.
- Quick Chat se usa como fallback para demasiadas respuestas.
- La logica de presets/arithmetic/cloud vive como regex en `src/assistant/quick-response.ts`, no como Smart Agent/tool loop.
- No hay superficie `notify`/chip ni `showMarkdown` real para respuestas assistant.
- No hay option picker para ambiguedades.
- El dock/companion puede dar feedback que no se siente como Fixvox si no hay una decision explicita de superficie.

## Estado Ya Implementado

- Parseo `Lulu`/alias en `src/assistant/voice-prefix.ts`.
- Algunos comandos locales: preset status, activar preset, Settings/history.
- Aritmetica simple insertable (`Lulu, cuanto es 2+2` -> `4`) con `paste_send`.
- Managed assistant fallback para preguntas no locales mediante `run_assistant_chat`.
- Delivery desktop con paste Fixvox-like: snapshot clipboard texto+DIB/DIBV5 -> `Ctrl+V` -> restore.
- Copy transcript en Tauri usa comando nativo `copy_text_to_clipboard`.
- Logging nativo de VAD agregado para diagnosticar `no speech`.

## Avance 2026-07-03 — T-001/T-002

- RED inicial agregado en `tests/voice-dock/assistant-intent-routing.test.ts` para la matriz Fixvox-like: arithmetic paste, preset notify/toolAction, follow-up ingles, JP ambiguo optionPicker, Quick Chat explicito, memoria/contexto showMarkdown y fallback managed no-Quick-Chat.
- GREEN: `src/assistant/intent-result.ts` define `AssistantIntentResult` tipado y helper de handoff Quick Chat; `src/assistant/quick-response.ts` ahora enruta por `createAssistantIntentResult()` antes de adaptar al wrapper legacy.
- Quick Chat dejo de ser fallback universal: desconocidos/general vuelven `toolAction` `run_assistant_chat`; Quick Chat solo aparece con lenguaje explicito de handoff.
- Correccion posterior por screenshot: el companion ya no abre la card `Quick Chat` para cualquier `source: assistant`; `assistantSurface` preserva `notify`, `showMarkdown`, `optionPicker`, `quickChat` o `none` desde el intent hasta UI.
- `showMarkdown` se renderiza como surface `Lulu`/titulo propio sin input `Ask Lulu`; `optionPicker` muestra opciones sin adivinar; `notify` no abre companion grande.
- Correccion posterior por dock residual: cuando una respuesta assistant ya esta resuelta por `assistantSurface`, el dock vuelve a idle y no queda chip `Lulu ready / Assistant reply is available...` como si fuera review pendiente.
- Tests focales, `npm run build` y `cargo check --quiet` pasan.

## Arquitectura Segura — Avance 2026-07-03

La deuda arquitectonica principal quedo encauzada con `src/pipeline/ui-result.ts`: `PipelineUiResult` + `AssistantSurface` son ahora la frontera central para decidir UI assistant.

- Assistant success handled (`notify`, `showMarkdown`, `optionPicker`, `quickChat`) ya no se expone como `TranscriptReview` ni alimenta recovery/preview dock.
- `VoiceDock` vuelve a idle/neutral para assistant handled; no deberia mostrar `Lulu ready`, `Assistant reply is available`, `Transcript ready`, `RECOVERY` ni preview residual.
- `CompanionSurfaceView` renderiza solo superficies interactivas explicitas; Quick Chat conserva input solo cuando `AssistantSurface.kind === "quickChat"`.
- `showMarkdown` usa markdown/payload real de surface; el placeholder `Lulu puede revisar...` fue reemplazado por managed assistant cuando hay runtime o error honesto de setup.
- Tests focales, build, cargo check y arranque Tauri hidden pasan.
- Feedback del smoke: el primer intento en ingles mostro que `what is two plus two` no caia en arithmetic local porque faltaban operadores ingleses (`plus`, `minus`, `times`, `divided by`). Se corrigio en `src/assistant/quick-response.ts` y se agrego RED/GREEN en `tests/voice-dock/assistant-intent-routing.test.ts`.
- Smoke live en ingles con dictado/TTS real paso: `artifacts/lulu-assistant-safe-architecture/english-live-20260703-1725/report.json` cubre contexto, preset activo, option picker JP y Quick Chat; `artifacts/desktop-control/dictation-e2e/lulu-arithmetic-en-20260703-1713/report.json` cubre paste observado de `Lulu what is two plus two`.
- Dogfood posterior en `artifacts/live-app/20260703-173519/tauri-dev.log`: hubo speech real (`has_speech=true`) y algunas capturas volvieron a idle sin evidencia clara de paste/companion. El log muestra targets terminal-like salteados y una seleccion capturada de 79 chars; se agrego logging redacted `[dictation-tauri][assistant] routed` para diagnosticar sin transcript.
- Avance inmediato: `src/App.tsx` ahora emite `assistant_routed` con `intentKind`, `quickResponseIntent`, `surfaceKind`, `deliveryStrategy`, tool/action opcional, longitudes y `redacted: true`. Test en `tests/desktop-control/app-delivery.test.ts` verifica que no se loguea el prompt. Validado con `npm run test:pipeline -- tests/desktop-control/app-delivery.test.ts tests/voice-dock/assistant-intent-routing.test.ts` y `npm run build`; app reiniciada en `artifacts/live-app/20260703-181007/tauri-dev.log`.
- Siguiente slice 2026-07-03: existe `src/assistant/smart-agent.ts` como Smart Agent minimo provider-free para presets con tools tipadas (`preset.getActive`, `preset.activate`, `preset.clearActive`, `optionPicker`) y estado (`activePresetId`, `lastActivatedPresetId`, `recentToolResults`). `createAssistantIntentResult()` delega ahi la familia de presets antes de surfaces, y `App.tsx` pasa el preset activo como estado minimo para follow-ups tipo `No, el otro en ingles`. Validado con `tests/voice-dock/assistant-smart-agent.test.ts` mas matriz intent/app delivery.
- Smoke live Notepad 2026-07-03: app real `artifacts/live-app/notepad-smoke-20260703-183320/tauri-dev.log`, dictado normal con `Alt+Space` pego texto sintetico no vacio en Notepad, `Lulu what is two plus two` pego exactamente `4`, clipboard se restauro y hubo WAV fresco con `has_speech=true`; `Alt+Q` con Notepad foreground abrio `Preset Picker` y se cerro tras la prueba. Resumen redacted: `artifacts/desktop-control/notepad-smoke/notepad-smoke-summary-20260703-1836.json`.
- Bug post-smoke: screenshot de JP mostro dock residual `Processing / Transcribing and preparing review` despues de cerrar picker. Causa: `openPresetPicker()` ponia `pipelineUi.status = idle` pero dejaba `capture.state = captured`, y `createDockInputFromUi()` renderizaba `captured` como `postprocessing`. Fix aplicado: al abrir picker se limpia recovery y se resetea `capture` a `idle` con mensaje de action picker, evitando chip Processing residual.
- QA walkthrough 2026-07-03 (`artifacts/desktop-control/qa-app-walkthrough-20260703-1855.md`): se encontro race/gap de delivery target en Notepad rerun (`freshWavCreated=true` pero target vacio; logs muestran target terminal-like capturado antes de dictation y Notepad cacheado despues), fragilidad VAD/no-speech en speech sintetico corto, y falsos fallos de `selection-capture-smoke.ps1` cuando queda `:1420` ocupado. Postproceso local controlado paso en retry (`artifacts/desktop-control/selection-capture-smoke/qa-postprocess-local-20260703-1850/report.json`). Fix adicional aplicado: `optionPicker` de Lulu ya no renderiza botones disabled para presets conocidos; emite `select_preset` y usa la ruta existente de picker/preset.
- Regression Fixvox-like 2026-07-03: JP detecto que Notepad volvia a quedar con keytips/menu de Alt (`File/Edit/View` subrayado) despues de `Alt+Space`. Causa: el hook nativo tragaba Space pero dejaba pasar/sintetizaba Alt-up; Fixvox ya usaba el patron de suprimir Alt-up para evitar keytips. Fix aplicado en `src-tauri/src/desktop_control.rs`: `Alt+Space` dictation/capture marca `SUPPRESS_NEXT_ALT_UP_ONLY`, consume el Space-up y luego consume el Alt-up con `release_modifiers()`, igualando el patron que ya tenia `Alt+Q`.
- Target race hotfix 2026-07-03: `src-tauri/src/desktop_delivery.rs` agrega `cacheReason` al target cacheado; `src/delivery/tauri-desktop-delivery.ts` prefiere cache no-terminal reciente (`cacheReason: foreground_watcher`) sobre current/saved terminal-like solo para delivery normal, manteniendo terminal explicito si el cache no es del watcher y manteniendo selection replace con `targetAffinity: saved`. Tests: `tests/desktop-control/tauri-desktop-delivery.test.ts` cubre race Notepad/terminal y terminal explicito.

## Done Criteria

- `Lulu ...` ya no cae por defecto a Quick Chat.
- Existe una capa tipada tipo `AssistantIntentResult`.
- Casos Fixvox-like cubiertos por tests:
  1. `Lulu, cuanto es 2+2` -> paste `4`, sin companion.
  2. `Lulu, que preset esta activo?` -> tool/notify compacto, sin recovery ni Quick Chat grande.
  3. `Lulu, activa el que arregla el texto` -> activa preset correcto y feedback compacto.
  4. `No, el otro en ingles` -> usa estado previo y cambia a variante inglesa.
  5. `Lulu, activa el preset de JP` ambiguo -> option picker, no adivina.
  6. `Lulu, abri/segui en quick chat` -> abre Quick Chat explicitamente.
  7. Pregunta de memoria/contexto -> showMarkdown o surface rica/compacta, no paste automatico.
  8. Fallos reales -> recovery; respuestas exitosas assistant -> nunca `RECOVERY` ni `Transcript ready`.
- Delivery sigue con paste Fixvox-like.
- `npm run build`, tests focales y `cargo check` pasan.

## Plan TDD

### T-001 — Congelar referencia y matriz

Crear/actualizar tests de matriz antes de tocar implementacion.

Archivos probables:

- `tests/voice-dock/assistant-quick-response.test.ts`
- `tests/desktop-control/app-delivery.test.ts`
- nuevo `tests/voice-dock/assistant-intent-routing.test.ts`

Validar contra `docs/topics/fixvox-assistant-lulu-reference.md`.

### T-002 — Crear `AssistantIntentResult`

Nuevo modulo sugerido:

- `src/assistant/intent-result.ts`

Tipos sugeridos:

```ts
export type AssistantIntentResult =
  | { kind: "insertText"; text: string; reason?: string }
  | { kind: "notify"; message: string; level?: "info" | "success" | "warning" | "error" }
  | { kind: "quickChat"; initialUserText?: string; initialAssistantText?: string }
  | { kind: "showMarkdown"; title: string; markdown: string }
  | { kind: "optionPicker"; title: string; prompt: string; options: Array<{ id: string; label: string; description?: string }> }
  | { kind: "toolAction"; tool: string; args: Record<string, unknown>; confirmation?: "required" | "none" }
  | { kind: "error"; message: string; recoverable?: boolean };
```

### T-003 — Reemplazar fallback `quick-chat`

- `createAssistantQuickResponse()` deja de devolver `Quick Chat local recibio...`.
- Unknown/general -> assistantChat/managed candidate, no Quick Chat automatico.
- Quick Chat solo si el prompt pide Quick Chat/handoff (`quick chat/chat rapido` + abrir/seguir/pasar/usar), como `shouldHandoffAssistantReplyToQuickChat` en Fixvox.

### T-004 — Smart Agent minimo de presets

Estado local minimo:

- active preset
- last activated preset
- recent assistant messages/tool result

Tools minimas:

- `preset.getActive`
- `preset.activate`
- `preset.clearActive`
- `optionPicker` para ambiguedad

Cubrir follow-ups Fixvox-like:

- `que preset esta activo?`
- `activa el que arregla el texto`
- `no, el otro en ingles`
- `activa el preset de JP` -> picker

### T-005 — Surface mapper

En `App.tsx` o un modulo nuevo, mapear `AssistantIntentResult`:

- `insertText` -> `paste_send`
- `notify` -> chip/toast/dock compact, volver idle
- `quickChat` -> companion Quick Chat
- `showMarkdown` -> companion/rich card
- `optionPicker` -> picker/interaccion
- `toolAction` -> ejecutar local/cloud gated
- `error` -> failed/recovery solo si corresponde

### T-006 — Dock/companion cleanup

- `Transcript ready` solo para transcript real.
- `RECOVERY` solo para fallos/recovery reales.
- Assistant success no debe mostrar recovery.
- Quick Chat no debe abrirse salvo por decision explicita de superficie.

### T-007 — Validacion live

Reiniciar Tauri dev y hacer smoke manual de la matriz:

- arithmetic paste
- preset status
- preset activation
- explicit Quick Chat
- general question/context
- no-speech diagnostic separado

## Comandos De Verificacion

```powershell
npm run test:pipeline -- tests/voice-dock/assistant-quick-response.test.ts tests/desktop-control/app-delivery.test.ts tests/voice-dock/dock-visual-semantics.test.ts tests/voice-dock/companion-state.test.ts tests/voice-dock/companion-view.test.tsx
npm run build
cd src-tauri && cargo check --quiet
npm run tauri:dev:hidden -- -StopExisting
```

## Guardrails

- No implementar wake word always-on.
- No acciones externas/mutantes sin tool tipada, policy y confirmacion si corresponde.
- No seguir agregando regex sueltas sin pasar por `AssistantIntentResult`.
- No usar Quick Chat como fallback universal.
- No mostrar raw transcripts/audio en docs o logs nuevos.
- No hacer push/deploy/release.

## Riesgos Abiertos

- VAD/no-speech: logging agregado en `native_capture.rs`; revisar ultimo `tauri-dev.log` si JP reporta que el dock graba pero termina en no-speech.
- `pi-clipboard-*.png`: son artefactos temporales del harness Pi al materializar screenshots/clipboard; no confundir con archivos creados por Dictation Tauri.
- Worktree tiene muchos cambios previos; no revertir cambios de usuario.
