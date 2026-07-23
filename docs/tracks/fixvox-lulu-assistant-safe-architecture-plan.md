---
status: complete
started: 2026-07-03
updated: 2026-07-20
priority: high
owner: JP
topic: selection-and-assistant-actions
related:
  - docs/tracks/fixvox-lulu-assistant-parity-refactor.md
  - docs/topics/fixvox-assistant-lulu-reference.md
  - docs/topics/selection-and-assistant-actions.md
source_refs:
  - C:/dev/fixvox/src/app/backend/voice-command-ai-interpreter.ts
  - C:/dev/fixvox/src/app/backend/assistant-voice-shortcuts.ts
  - C:/dev/fixvox/src/app/backend/assistant-quick-chat-launch.ts
  - C:/dev/fixvox/src/app/backend/smart-agent/
  - C:/dev/fixvox/src/app/backend/smart-dictation.ts
---

# Fixvox Lulu Assistant Safe Architecture Plan

## Objetivo

Dejar una arquitectura segura para `Lulu ...` donde assistant no sea tratado como un transcript especial. El sistema debe tener ownership explicito de resultado/superficie para evitar fugas de `Transcript ready`, `Recovery`, Quick Chat universal, previews residuales o estados dock inconsistentes.

## Diagnostico

El problema actual es arquitectonico: el flujo de Lulu esta injertado dentro del pipeline de dictado y varias capas reinterpretan el resultado usando senales pobres:

- `resultSource: "assistant"`
- `deliveryEvidence.status = "available"`
- `transcriptReview`
- `assistantModeEnabled`
- `transcriptPreview`

Eso hace que UI/dock/companion puedan volver a convertir una respuesta assistant exitosa en review de transcript, Quick Chat, chip residual o preview de texto. Fixvox no funciona asi: primero decide una intencion/superficie, y luego esa superficie es dueña de la salida.

## Principio Arquitectonico

Introducir y respetar una union discriminada de resultado UI. Regla dura:

> Una respuesta assistant exitosa no puede pasar por review/recovery/transcript salvo que la surface sea `insertText` o `error` real.

Modelo objetivo:

```ts
type PipelineUiResult =
  | { kind: "dictation"; transcript: string; delivery: DeliveryState; recovery?: RecoveryState }
  | { kind: "selectionTransform"; output: string; delivery: DeliveryState; recovery?: RecoveryState }
  | { kind: "assistant"; intent: AssistantIntentResult; surface: AssistantSurface };
```

`AssistantSurface` debe ser la unica fuente de verdad para UI assistant:

```ts
type AssistantSurface =
  | { kind: "insertText"; text: string; delivery: "paste_send" }
  | { kind: "notify"; message: string; level?: "info" | "success" | "warning" | "error" }
  | { kind: "quickChat"; initialUserText?: string; initialAssistantText?: string }
  | { kind: "showMarkdown"; title: string; markdown: string }
  | { kind: "optionPicker"; title: string; prompt: string; options: AssistantOption[] }
  | { kind: "toolAction"; tool: string; args: Record<string, unknown> }
  | { kind: "error"; message: string; recoverable?: boolean };
```

## Plan TDD Seguro

### A-001 — Congelar regresion visual exacta

Crear tests RED que reproduzcan los screenshots reportados.

Archivos:

- `tests/desktop-control/app-delivery.test.ts`
- `tests/voice-dock/companion-state.test.ts`
- `tests/voice-dock/companion-view.test.tsx`
- `tests/voice-dock/voice-dock-ui.test.tsx`
- posible nuevo `tests/voice-dock/assistant-ui-result.test.ts`

Casos obligatorios:

1. `Lulu, que tenes en memoria/contexto?` produce surface `showMarkdown`.
2. Companion muestra `Lulu` + titulo propio, no `Quick Chat`, no input `Ask Lulu`, no `Send`.
3. Dock queda limpio/idle o neutral: no `Lulu ready`, no `Assistant reply is available`, no preview del markdown.
4. `Lulu, que preset esta activo?` produce `notify` compacto: no companion grande, no recovery, no preview.
5. `Lulu, activa el preset de JP` produce `optionPicker`: muestra opciones, no adivina, no Quick Chat.
6. `Lulu, segui esto en quick chat` produce Quick Chat real y solo ahi aparece input/chat.
7. `Lulu, cuanto es 2+2` produce `insertText` y delivery paste Fixvox-like, sin companion.
8. Fallo real assistant/provider produce `error`/recovery honesto; assistant success nunca usa recovery.

### A-002 — Crear `PipelineUiResult` y cortar inferencias legacy

Nuevo modulo sugerido:

- `src/pipeline/ui-result.ts`

Responsabilidad:

- Convertir `DesktopRuntimeResult` / pipeline summary a `PipelineUiResult`.
- Prohibir que assistant success sea convertido a `TranscriptReview`.
- Exponer helpers:
  - `isAssistantHandledBySurface(result)`
  - `getDockInputForPipelineUiResult(result)`
  - `getCompanionSurfaceForPipelineUiResult(result)`

No tocar delivery real todavia; primero hacer pasar tests de clasificacion.

### A-003 — Reemplazar `resultSource: "assistant"` como señal UI

Buscar y migrar todos los usos de:

- `resultSource === "assistant"`
- `transcriptReview?.source === "assistant"`
- `assistantModeEnabled`
- `transcriptPreview={transcriptReview?.text}`
- `deliveryEvidence.status === "available"` para assistant

Regla:

- UI no decide por `source`; decide por `PipelineUiResult.kind` y `AssistantSurface.kind`.
- `resultSource` puede quedar para historial/telemetria, no para render routing.

### A-004 — Surface mapper unico

Crear/aislar mapper unico:

- `src/assistant/surface-mapper.ts` o dentro de `src/pipeline/ui-result.ts`.

Entrada:

- `AssistantIntentResult`
- resultado de tool/managed assistant cuando aplique
- contexto activo (preset, history, selected text)

Salida:

- `AssistantSurface`

No permitir que `App.tsx`, `VoiceDock` o `companion-state` reinterpreten assistant.

### A-005 — Dock contract explicito

`VoiceDock` debe recibir un estado ya resuelto:

- Dictation review: puede mostrar transcript/recovery/copy/paste-last.
- Selection transform review: puede mostrar transform/recovery.
- Assistant success: dock vuelve a idle/neutral y no muestra preview ni recovery.
- Assistant `insertText`: delivery paste normal; si paste sent/observed, dock se comporta como delivery insertado, no Quick Chat.
- Assistant error: solo entonces failed/recovery.

Tests deben verificar ausencia de strings:

- `Transcript ready`
- `RECOVERY`
- `Quick Chat` fuera de handoff
- `Assistant reply is available`
- previews de markdown/notify en el dock

### A-006 — Companion contract explicito

`CompanionSurfaceView` solo renderiza assistant si recibe `AssistantSurface` interactiva:

- `quickChat`: chat + input.
- `showMarkdown`: rich card, sin input.
- `optionPicker`: opciones, sin input de chat.
- `notify`: no companion grande; chip/toast/estado compacto.
- `insertText`: no companion.
- `error`: error/recovery si corresponde.

### A-007 — Eliminar adaptadores legacy o encerrarlos

`createAssistantQuickResponse()` puede quedar temporalmente para tests viejos, pero no debe ser el tipo que gobierna UI. Debe ser adaptador sobre `AssistantIntentResult`/`AssistantSurface`, marcado como legacy si sigue existiendo.

Eliminar frases placeholder del producto:

- `Quick Chat local recibio...`
- `Lulu puede revisar memoria/contexto cuando esa superficie este conectada...` como respuesta final UX.

Para preguntas generales/contexto:

- usar managed `run_assistant_chat` si disponible;
- si no disponible, mostrar error honesto de setup, no placeholder falso.

### A-008 — Smoke live obligatorio

Despues de tests/build/cargo, reiniciar Tauri y probar con screenshot real:

```powershell
npm run tauri:dev:hidden -- -StopExisting
```

Matriz manual minima:

1. `Lulu, que tenes en memoria/contexto?`
   - Companion: Lulu/showMarkdown o managed answer.
   - Dock: limpio, sin preview residual.
2. `Lulu, que preset esta activo?`
   - Notify compacto o dock idle; no companion grande.
3. `Lulu, activa el preset de JP`
   - Option picker; no adivina.
4. `Lulu, segui esto en quick chat`
   - Quick Chat real con input.
5. `Lulu, cuanto es 2+2`
   - Paste `4`; no companion.

Guardar screenshots/evidencia en `artifacts/lulu-assistant-safe-architecture/<run-id>/` si se generan artifacts nuevos.

## Guardrails

- No implementar wake word always-on.
- No hacer push/deploy/release.
- No revertir cambios de usuario.
- No agregar regex ad-hoc que saltee `AssistantIntentResult`/`AssistantSurface`.
- Quick Chat solo manual/handoff explicito/multi-turn real.
- Delivery normal debe conservar paste Fixvox-like.
- Assistant success nunca muestra `RECOVERY`, `Transcript ready`, `Assistant reply is available`, ni preview residual en dock.
- Si se toca UI visual, verificar con screenshot real.

## Comandos De Verificacion

```powershell
npm run test:pipeline -- tests/voice-dock/assistant-quick-response.test.ts tests/voice-dock/assistant-intent-routing.test.ts tests/desktop-control/app-delivery.test.ts tests/voice-dock/dock-visual-semantics.test.ts tests/voice-dock/companion-state.test.ts tests/voice-dock/companion-view.test.tsx tests/voice-dock/voice-dock-ui.test.tsx
npm run build
cd src-tauri && cargo check --quiet
npm run tauri:dev:hidden -- -StopExisting
```

## Avance 2026-07-03 — Implementacion central

- Se agrego `src/pipeline/ui-result.ts` con `PipelineUiResult`, `AssistantSurface` expandido y helpers centrales (`createPipelineUiResult`, `isAssistantHandledBySurface`, `getCompanionSurfaceForPipelineUiResult`, `shouldExposeTranscriptReview`).
- `App.tsx` dejo de usar `transcriptReview.source === "assistant"` como fuente primaria de render: dock, transcript review y companion pasan por `PipelineUiResult`/`AssistantSurface`.
- `getTranscriptReview()` ya no expone assistant success para `notify`, `showMarkdown`, `optionPicker` o Quick Chat handled; `insertText`/errores siguen quedando disponibles para delivery/recovery real.
- `CompanionSurfaceView` renderiza `showMarkdown`/`optionPicker`/`quickChat` por payload de `AssistantSurface`, sin fallback visual a `Assistant reply is available` ni input de Quick Chat fuera de handoff.
- Se elimino el placeholder UX `Lulu puede revisar...` como respuesta de memoria/contexto; en runtime Tauri se intenta managed assistant para esa superficie y, sin setup, se muestra error honesto.
- Verificados: tests focales del plan, `npm run build`, `cd src-tauri && cargo check --quiet`, y arranque `npm run tauri:dev:hidden -- -StopExisting` con run `artifacts/live-app/20260703-165215/`.
- Smoke live en ingles ejecutado con dictado/TTS real: `artifacts/lulu-assistant-safe-architecture/english-live-20260703-1725/report.json` paso `context`, `preset-status`, `option-picker` y `quick-chat`.
- Smoke live insertable en ingles: `artifacts/desktop-control/dictation-e2e/lulu-arithmetic-en-20260703-1713/report.json` paso con paste observado para `Lulu what is two plus two`.

## Definition Of Done

- Existe `PipelineUiResult` o equivalente central.
- `AssistantSurface` es la unica fuente de verdad para render assistant.
- No hay rutas donde assistant success pase por transcript review/recovery.
- Tests cubren ausencia de fugas en dock y companion.
- Smoke live confirma que los screenshots reportados ya no se reproducen.
- Track `docs/tracks/fixvox-lulu-assistant-parity-refactor.md` queda actualizado con el cierre.
