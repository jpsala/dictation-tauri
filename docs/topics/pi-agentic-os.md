---
id: pi-agentic-os
status: active
kind: how-to
triggers:
  - pi
  - pi agentic os
  - computer use
  - cua-driver
  - background computer use
  - ask_user
  - /aos-gol
primary_refs:
  - .pi/
  - docs/topics/agentic-os-operations.md
  - C:/dev/infra/docs/runbooks/automations-agents.md
---

# Pi Agentic OS

Este proyecto se opera desde Pi cuando JP lo pide. La capa `.pi/` es adapter local; no debe contener secretos ni copiar infraestructura global de JP.

## Computer Use Local / Background

Usar computer use solo cuando APIs, tests o browser/DOM no alcancen para validar una UI real. No convertirlo en requisito duro del repo: la infraestructura global de JP vive en `C:\dev\infra`; hoy incluye Cua Driver global via Pi MCP `cua-driver` en modo `eager`/persistente (tras `/reload` o reinicio), y puede incluir browser remoto o VM segun la maquina.

Politica local:

- Permiso persistente vigente desde 2026-06-24: JP autoriza side effects locales controlados para este repo/dev machine cuando sirvan para implementar y verificar tareas. Incluye abrir/cerrar apps de prueba, usar CUA/computer-use, lanzar Vite/Tauri/Fixvox local, usar microfono o fixtures de audio, llamar provider real con `.env` local, mutar clipboard temporalmente con restauracion, enviar hotkeys/clicks a fixtures/sandboxes, crear artifacts ignorados y limpiar procesos.
- Documentar la superficie permitida antes de automatizar: app fixture, sandbox, browser remoto, VM o ventana especifica.
- Preferir fixtures efimeras y datos de prueba; no operar sobre documentos, cuentas o apps reales no preparadas como target.
- Mantener evidencia externa: archivo resultado, screenshot, log, estado de DB o comando de verificacion. No alcanza con decir que se clickeo.
- Orden recomendado: API/test directo -> Playwright/DOM/browser tool -> Cua/UIA background -> computer-use visual por screenshots/VM. Subir de nivel solo cuando el anterior no cubre el caso.
- Pedir confirmacion con `ask_user` antes de login, pagos, compras, envios, publicaciones, deploy/push, cambios productivos, aceptacion de terminos, instalar drivers, habilitar autostart/RunLevel Highest o Scheduled Tasks, exponer VNC/noVNC o abrir tunnels.
- `Alt+Space`, seleccion real, replace-selection, observer de `paste_observed` y cualquier app/documento personal fuera de sandbox requieren task/spec explicita y confirmacion si salen del alcance local controlado.
- Cerrar procesos/ventanas y limpiar temporales al finalizar. Registrar limitaciones conocidas por control (por ejemplo combos/selects) en el topic o track del trabajo.
- No imprimir secretos ni raw transcripts en docs/chat; reportar solo evidencia redacted/hash/longitud/tokens.

Smoke test minimo por repo:

1. Crear fixture/app efimera con inputs, boton y salida verificable.
2. Lanzarla con computer use sin robar foreground cuando aplique.
3. Leer accessibility tree/screenshot antes de actuar.
4. Completar campos y disparar accion final.
5. Verificar salida por comando/archivo/API y documentar gotchas.
6. Cerrar procesos y borrar datos temporales si corresponde.

Smoke local 2026-06-24 en este repo:

- Harness efimero: `artifacts/desktop-control/computer-use-smoke/Run-CuaSmoke.ps1` crea una app WinForms de prueba y verifica por JSON bajo `artifacts/desktop-control/computer-use-smoke/<run>/result.json`.
- Resultado verde: `cua-driver 0.6.7`, `health_report overall ok`, UIAutomation y screen capture `pass`, autostart `not-registered`, fixture no toma foreground al launch, UIA tree con 13 elementos, inputs/combo/checkbox/boton completados y resultado JSON correcto.
- Evidencia ultima corrida: `artifacts/desktop-control/computer-use-smoke/20260624-101545/report.json` y `result.json` (artifacts ignorados).
- Gotchas observados con CLI one-shot: los `element_index`/`element_token` no persisten entre `cua-driver call`; usar coordenadas o, preferentemente, servidor MCP persistente para acciones UIA background. Las acciones por coordenadas pueden traer la fixture al foreground. `start_recording` tampoco persiste en one-shot; usar MCP persistente para trajectory/replay.

E2E real local 2026-06-24 en este repo:

- Harness versionado: `scripts/desktop-dictation-e2e.ps1` (`npm run desktop-control:e2e -- <flags>` o PowerShell directo).
- Comando base probado para `paste_sent`: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/desktop-dictation-e2e.ps1 -AllowDesktopSideEffects -AllowProviderCall -AllowClipboardMutation -RecordingSeconds 2 -InitialDelaySeconds 12 -DeliveryTimeoutSeconds 180`.
- Comando observer probado para `paste_observed`: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/desktop-dictation-e2e.ps1 -AllowDesktopSideEffects -AllowProviderCall -AllowClipboardMutation -ExpectPasteObserved -DictationKey CtrlShiftF9 -RunId <id> -InitialDelaySeconds 8 -RecordingSeconds 5 -DeliveryTimeoutSeconds 180 -RemoteDebugPort <free-port>`.
- Flujo validado de punta a punta: Cua health/autostart -> Tauri `Dictation Dock` -> CDP/WebView2 listo -> fixture target editable foreground -> hotkey start -> UI `Listening` confirmada -> speech synthesis local -> hotkey stop -> WAV fresco -> provider real configurado -> paste al target -> evidencia de delivery desde UI -> clipboard sentinel restaurado -> cleanup.
- Evidencia `paste_sent`: `artifacts/desktop-control/dictation-e2e/20260624-104246/report.json`; audio fresco `artifacts/microphone-capture/audio/capture-native-1782308585886.wav`.
- Evidencia `paste_observed`: `artifacts/desktop-control/dictation-e2e/20260624-observer-paste-observed-e2e-verified/report.json`; product UI `deliveryStatus = paste_observed`, target length/hash en report, fresh WAV `artifacts/microphone-capture/audio/capture-native-1782336845813.wav`, clipboard sentinel restored. El texto raw del target queda en artifact ignorado; docs/report usan longitud/hash/tokens.
- Gotchas resueltos: lanzar el target despues del dock evita guardar el dock como destino; outputs vivos del target van a `%TEMP%` y se copian al final porque Vite puede crashear con `EBUSY` si watch-ea archivos escritos dentro de `artifacts/`; no hablar hasta confirmar UI `Listening` por CDP porque si no el speech se emite fuera de la grabacion; pasar expresiones CDP como `base64:` en `scripts/cdp-evaluate.mjs` evita corrupcion de quotes/`&&`/heredocs al cruzar PowerShell/Node/CDP; leer el estado de delivery desde la UI/product IPC es mas confiable que inferirlo por el target file; para observer-focused runs el token match de STT puede ser non-gating si hay speech ambiente, pero debe quedar advertido y no usarse como benchmark de calidad STT.

### Computer Use Playbook Especifico Para Dictation Dock

1. **Preparar el target antes de actuar**: cerrar procesos viejos (`dictation-tauri`, ventanas fixture), elegir `RunId`, puerto CDP libre y fixture local; nunca usar documentos/apps personales como target.
2. **Lanzar y observar antes de inputs**: esperar `Dictation Dock`, comprobar Cua `health_report`, abrir WebView2 CDP y verificar `window.__TAURI_INTERNALS__.invoke`; registrar `get_desktop_control_hotkey_config` para saber si se esta probando `Alt+Space` o `Ctrl+Shift+F9`.
3. **Verificar activacion real**: tras el primer hotkey, muestrear producto por CDP hasta `captureState = Listening`; solo entonces emitir speech o audio fixture. Si no llega a `Listening`, abortar con logs de estado, no seguir hablando.
4. **Separar objetivos de smoke**: un smoke de observer prueba `paste_observed`; un smoke de STT quality prueba tokens/transcript. Si se mezclan, los tokens pueden fallar por speech ambiente aunque observer sea valido.
5. **Guardar evidencia redacted**: report JSON bajo `artifacts/`, target raw ignorado, docs con status/longitud/hash/rutas; no pegar raw transcript ni selected text en chat/docs.
6. **Limpiar y restaurar**: detener arbol de procesos Tauri/fixture, restaurar clipboard original/sentinel y dejar autostart deshabilitado salvo aprobacion explicita.
7. **Preferir producto/IPC sobre clicks visuales**: para validar estado, usar CDP/product UI, Tauri invoke y archivos; usar CUA visual para foreground/window/foco o cuando el comportamiento solo existe en el desktop shell.
8. **Si algo falla, registrar el primer estado invalido**: hotkey config, foreground antes/despues, samples de UI, fresh WAV, delivery status, stderr/stdout de Tauri. No reintentar a ciegas.

## Uso Practico En Dictation Tauri

- Preferir tests/unitarios y fixtures de audio/texto para validar pipeline.
- Usar computer use solo para UI real del dock/settings/hotkeys cuando no alcance un test determinista.
- Bajo el permiso persistente 2026-06-24, se puede usar microfono/provider/clipboard/hotkeys en smokes locales controlados con artifacts ignorados y evidencia redactada; si el objetivo involucra seleccion real, `Alt+Space`, observer de paste o apps/documentos personales, pedir confirmacion puntual.
