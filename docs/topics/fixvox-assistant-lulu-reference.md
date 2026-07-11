---
id: fixvox-assistant-lulu-reference
status: active
kind: reference
triggers:
  - Lulu
  - asistente Fixvox
  - assistant prefix
  - Quick Chat Fixvox
  - Smart Agent
  - comportamiento Fixvox
  - paridad asistente
primary_refs:
  - C:/dev/fixvox/src/app/backend/voice-command-ai-interpreter.ts
  - C:/dev/fixvox/src/app/backend/assistant-voice-shortcuts.ts
  - C:/dev/fixvox/src/app/backend/assistant-quick-chat-launch.ts
  - C:/dev/fixvox/src/app/backend/smart-agent/
  - C:/dev/fixvox/src/app/backend/smart-dictation.ts
  - C:/dev/fixvox/src/app/backend/interaction-delivery.ts
  - C:/dev/fixvox/src/app/backend/native-input.ts
---

# Referencia Fixvox: Lulu, Assistant, Smart Agent Y Quick Chat

Objetivo: evitar implementar por intuicion. Antes de tocar `Lulu ...`, Quick Chat, assistant actions, delivery o companion, usar esta referencia y volver a mirar los archivos fuente listados arriba.

## Regla Principal

En Fixvox, `Lulu ...` no significa automaticamente "abrir Quick Chat" ni "mostrar transcript ready".

`Lulu ...` es un prefijo dentro de una captura iniciada por el usuario. Lo que ocurre despues depende de la intencion:

1. **Accion directa / tool local**: ejecutar herramienta, cambiar preset, notificar, insertar o pegar resultado.
2. **Respuesta insertable**: si la salida es texto a entregar, se inserta/pastea en el target con el mecanismo normal de delivery.
3. **Respuesta conversacional corta**: assistant chat puede responder, pero no debe presentarse como transcript/recovery.
4. **Quick Chat**: se abre solo cuando el flujo realmente es Quick Chat/manual/handoff explicito o necesita conversacion multi-turn.
5. **Interaccion/eleccion**: si hay ambiguedad, usar option picker/interaccion, no inventar un resultado.

## Flujo De Entrada

### 1. Parseo Del Prefijo

Fuente: `voice-command-ai-interpreter.ts`, `voice-wake-words.ts`.

- `parseAssistantVoicePrompt(transcript)` detecta wake words (`assistant`, `asistente`, `ai`, `zuno`, `lulu`, alias ASR como `ludo`).
- Si no hay prefijo: dictado normal.
- Si hay prefijo sin prompt: invalid assistant.
- Si hay prompt: se procesa como assistant/smart intent, no como dictado literal.

### 2. No Es Wake Word Always-On

Fixvox usa el prefijo dentro de una captura/hotkey iniciada. Para este proyecto sigue fuera de scope escuchar microfono en background esperando `Lulu`.

## Rutas De Intencion

### A. Smart Agent / Tool Loop

Fuentes: `smart-agent/runtime.ts`, `smart-agent/graph.ts`, `smart-agent/model.ts`, `smart-agent/tools.ts`, `smart-agent/smart-agent.test.ts`.

Fixvox tiene un loop de agente con herramientas tipadas. Ejemplos observados en tests:

- `Lulu, que preset esta activo?`
  - tool: `preset.getActive`
  - output si no hay preset: `No hay preset activo.`
  - notifica `Preset lookup`.
- Follow-up: `Entonces activa el que arregla el texto.`
  - usa estado previo/contexto.
  - tool: `preset.activate` con `writing.fix.es`.
  - notifica `Preset activated`.
- `No, el otro en ingles.`
  - usa `lastActivatedPresetId` para cambiar a variante inglesa.
- `Lulu, activa el preset de JP.` ambiguo:
  - tool/interruption: `optionPicker` con opciones.

Regla para Dictation Tauri: comandos de presets no deben caer a Quick Chat si pueden ser herramientas locales. Si hay ambiguedad, no elegir a ciegas: surface de opcion.

### B. Assistant Chat

Fuente: `voice-command-ai-interpreter.ts` (`runAssistantChatTurn`).

- Usa prompt de sistema `You are the Fixvox assistant chat mode`.
- Es conciso y orientado a accion.
- Si no hay selected text pero el prompt parece requerirlo, responde fail-closed: no pudo capturar seleccion.
- Si no hay selected text, agrega ventana de contexto de sesion (`getAssistantSessionContextWindow({ maxTurns: 10 })`).
- Usa provider/managed proxy si esta configurado.
- Devuelve texto. El caller decide delivery/surface segun intencion.

Regla para Dictation Tauri: si una pregunta `Lulu ...` no matchea comando local, usar managed assistant/chat real o fallar honesto. No responder `Quick Chat local recibio...` salvo placeholder de test, nunca en UX final.

### C. Quick Chat

Fuentes: `assistant-quick-chat-launch.ts`, `voice-command-ai-interpreter.ts` (`runQuickChatTurn`), `assistant-voice-shortcuts.ts`.

Quick Chat en Fixvox es una superficie especifica de conversacion:

- Puede abrirse manualmente/hotkey.
- Puede abrirse por handoff explicito desde assistant cuando el prompt menciona Quick Chat y una intencion de abrir/continuar/pasar:
  - `shouldHandoffAssistantReplyToQuickChat()` requiere `quick chat/chat rapido` + verbo tipo abrir/seguir/pasar/usar.
- `createAssistantQuickChatRequest()` crea `quick-chat-surface` con:
  - `initialUserText`
  - `initialAssistantText`
  - `selectedText`
  - `deliveryOptions: [copy, insert, replace]`
- `runQuickChatTurn()` usa prompt de sistema `Fixvox assistant quick chat mode`, conversacion normalizada y selected text opcional.

Regla para Dictation Tauri: no abrir companion Quick Chat para cualquier respuesta assistant. Abrirlo solo por:

1. comando/hotkey Quick Chat;
2. handoff explicito;
3. conversacion multi-turn ya abierta;
4. respuesta suficientemente larga o interactiva que no conviene pegar/notificar.

## Superficies De Salida

### Insert / Paste

Fuentes: `interaction-delivery.ts`, `native-input.ts`, `paste-shortcut.ts`, `native-input-legacy.ts`.

Fixvox delivery para texto hace clipboard snapshot + paste:

1. guarda snapshot del clipboard (texto + formatos imagen DIB/DIBV5 cuando existen);
2. escribe texto al clipboard;
3. enfoca target;
4. manda `Ctrl+V`/atajo resuelto (`shift-insert` o unicode-text en casos especiales como Tabby);
5. opcional Enter;
6. restaura clipboard snapshot.

Regla para Dictation Tauri: delivery normal debe usar esta familia de paste, no `KEYEVENTF_UNICODE` primero, salvo casos especiales justificados y documentados.

### Notify / Agent Notify

Fuente: `smart-dictation.ts`.

Fixvox usa `notify`/`agentNotify` para feedback corto o transparencia operacional:

- memoria actualizada;
- preset activado;
- resultado corto que no necesita superficie grande;
- error/confirmacion simple.

Regla para Dictation Tauri: respuestas cortas no insertables no deben abrir una companion grande por default. Preferir chip/toast/notificacion compacta.

### Show Markdown

Fuente: `smart-dictation.ts`.

Cuando el usuario pide ver/listar/formatear informacion larga (memoria, instrucciones, contexto), Fixvox usa `showMarkdown` en vez de notify o insertText.

Regla para Dictation Tauri: preguntas tipo `que hay en memoria/contexto` no son paste automatico. Si la respuesta es larga, usar superficie rich/markdown; si es corta, notify/chip; si el usuario pide Quick Chat, abrir Quick Chat.

### Option Picker

Fuente: `smart-agent/model.ts`, `smart-agent/tools.ts`, `smart-dictation.ts`.

Si el pedido es ambiguo (ej. dos presets JP), Fixvox no adivina: abre `optionPicker`/interaccion.

## Lo Que NO Debe Pasar

- No mostrar `Transcript ready` para resultados assistant.
- No mostrar `RECOVERY` para una respuesta assistant exitosa.
- No abrir Quick Chat grande para toda respuesta `Lulu`.
- No dejar `Quick Chat local recibio...` en producto.
- No pegar preguntas generales salvo que la intencion sea insertable.
- No tratar `Lulu` como texto dictado normal.
- No hacer acciones externas/mutantes sin herramienta tipada, policy y confirmacion si corresponde.

## Matriz De Comportamiento Esperado

| Input | Fixvox-like esperado | Superficie |
| --- | --- | --- |
| `Lulu, cuanto es 2+2` | calcular/responder `4` e insertar/pastear si el contexto es entrega directa | paste normal |
| `Lulu, que preset esta activo?` | tool `preset.getActive`; respuesta corta | notify/chip o assistant compact; no transcript recovery |
| `Entonces activa el que arregla el texto` | tool `preset.activate` fuzzy usando contexto | notify/chip de preset activado |
| `No, el otro en ingles` | tool `preset.activate` con variante inglesa usando estado | notify/chip |
| `Lulu, activa el preset de JP` | ambiguo si hay JP ES/EN | option picker |
| `Lulu, abrí quick chat con esto` | handoff explicito | Quick Chat |
| `Lulu, seguí esto en quick chat` | handoff explicito | Quick Chat |
| `Lulu, qué tenés en memoria/contexto?` | assistant chat/showMarkdown segun longitud; no paste automatico | compact/markdown/quick chat solo si corresponde |
| dictado normal sin `Lulu` | STT/postprocess/delivery normal | paste/review segun prefs |

## Implementacion Recomendada En Dictation Tauri

Crear una capa de decision antes de UI/delivery:

```text
AssistantIntentResult =
  | { kind: 'insertText', text }
  | { kind: 'notify', message, level }
  | { kind: 'quickChat', initialUserText, initialAssistantText }
  | { kind: 'showMarkdown', title, markdown }
  | { kind: 'optionPicker', options }
  | { kind: 'toolAction', tool, args, confirmation? }
  | { kind: 'error', message }
```

Luego mapear cada salida:

- `insertText` -> delivery paste normal.
- `notify` -> dock chip/toast, vuelve a idle.
- `quickChat` -> companion Quick Chat.
- `showMarkdown` -> companion/rich surface.
- `optionPicker` -> picker/interaccion.
- `toolAction` -> ejecutar herramienta local/cloud gated.
- `error` -> failed/recovery solo si realmente fallo una accion; no recovery para respuesta exitosa.

## Estado Actual Del Port (2026-07-03)

Implementado:

- parseo `Lulu`/alias;
- `AssistantIntentResult` tipado en `src/assistant/intent-result.ts`;
- `AssistantSurface`/`PipelineUiResult` central en `src/pipeline/ui-result.ts`;
- comandos locales (`preset status`, `activate preset`, Settings/history);
- aritmetica simple insertable en espanol/ingles (`2+2`, `two plus two`) con paste;
- managed assistant fallback para preguntas no locales;
- `showMarkdown`, `optionPicker`, `notify` y `quickChat` como surfaces explicitas;
- delivery desktop con paste Fixvox-like solo para `insertText`;
- smokes live ingles de contexto, preset activo, option picker JP, Quick Chat y arithmetic paste observado;
- logging runtime redacted `[dictation-tauri][assistant] routed` con intent/surface/delivery y longitudes, sin transcript.

Aun falta para paridad real:

- Smart Agent tool loop completo con estado y tool results;
- notify/chip visual mas rico como superficie primaria de respuestas cortas;
- option picker interactivo que ejecute la opcion elegida;
- estado multi-turn robusto para follow-ups fuera de Quick Chat;
- usar el logging redacted para cerrar casos dogfood ambiguos;
- Smart Agent/tool loop real debe reemplazar gradualmente reglas locales sin saltear `AssistantIntentResult`/`AssistantSurface`.
