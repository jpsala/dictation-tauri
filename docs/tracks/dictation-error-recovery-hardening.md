---
id: dictation-error-recovery-hardening
status: active
kind: implementation-track
updated: 2026-07-27
triggers:
  - manejo de errores
  - recovery
  - Alt+Shift+X
  - paste last
  - copy transcript
  - dock inusable
primary_refs:
  - docs/topics/dictation-workflow.md
  - docs/topics/fixvox-dock-and-hotkeys-reference.md
  - src/App.tsx
  - src/voice-dock/visual-semantics.ts
---

# Dictation Error And Recovery Hardening

## Incidente observado — 2026-07-27

Después de un intento de dictado sin resultado, `Alt+Shift+X` abrió Dictation
Companion con `Dictation needs attention` y un fallo genérico de delivery. La
acción `Copy transcript` podía dejar el dock en un estado review/recovery
persistente que parecía inusable.

La inspección local redacted confirmó dos entradas históricas anteriores; no se
leyó ni reportó su texto. El intento nuevo no había agregado un resultado.

## Causas confirmadas

1. `pasteLastToForegroundTarget` caía silenciosamente al último resultado no
   vacío de History cuando el intento actual no tenía transcript.
2. `describeDeliveryEvidence` descartaba `evidence.reason` para `failed`, por lo
   que target inexistente, foreground cambiado y fallos nativos terminaban con
   el mismo mensaje genérico.
3. Copy, paste-last y dictado reutilizaban `pipelineUi.status="error"`; recovery
   titulaba todos como `Dictation needs attention`.
4. Copy exitoso dejaba `delivery.status="copied"` en fase `review`; esa fase
   volvía a ofrecer Copy/Paste y mantenía Companion visible. No existía
   transición `copy exitoso → idle`.
5. Las acciones async de recovery no tenían un guard de operación en curso.

## Fix local

- Un intento nuevo bloquea el fallback implícito a History hasta producir un
  transcript válido. No-speech conserva ese bloqueo aun después de cerrar su
  notice. History sigue disponible mediante selección explícita y como
  paste-last durable sólo cuando no hubo un intento más reciente.
- Los fallos de delivery muestran la razón redacted concreta.
- `PipelineUiState.operation` distingue `copy`, `paste_last` y
  `selection_transform`; recovery muestra `Copy failed`, `Paste last failed`,
  `Nothing to paste` o `Selected text unchanged` en lugar de atribuirlo al
  dictado. Los fallos de selección ya no heredan un summary viejo con acciones
  sobre texto no relacionado.
- Copy exitoso conserva el resultado en summary/History, cierra recovery y
  devuelve capture/pipeline al idle visual.
- Cerrar o descartar recovery también normaliza el dock a idle sin borrar el
  último resultado durable.
- Un ref host-owned impide copies/pastes concurrentes; durante la operación la
  UI pasa por processing y oculta las acciones repetibles.
- El menú nativo compartido por tray y botón derecho recupera `Paste last` y
  `History`. El tray cachea el foreground editable en mouse-down y el context
  menu del dock justo antes del popup; ambos comandos adjuntan ese snapshot.
  History lo conserva hasta que se elige una entrada y entrega con afinidad
  `saved`, evitando que el menú o Companion se conviertan en target.

## Invariantes de regresión

- Un intento sin transcript nunca pega automáticamente un resultado anterior.
- `Copy transcript` exitoso termina en `Ready`; no recrea otra recovery.
- Un fallo de copy/paste-last conserva el transcript disponible, identifica la
  operación y ofrece acciones coherentes; selección fallida no ofrece Copy de
  un transcript viejo.
- La causa útil de delivery se mantiene redacted y visible.
- Companion no puede ser la dueña permanente del estado operativo del dock.
- Paste-last/History abiertos desde tray o botón derecho siempre usan el target
  editable anterior al menú, nunca la propia superficie Tauri.

## Evidencia local

- `tests/desktop-control/app-delivery.test.ts`: política de fallback a History y
  causa específica de delivery.
- `tests/voice-dock/voice-dock-ui.test.tsx`: semántica diferenciada de
  paste-last/copy failure.
- `tests/voice-dock/result-history-actions.test.ts`: guard estructural para
  settle a idle, bloqueo de History y operaciones tipadas.
- Checks: 47 archivos/264 tests focales, 3 tests Rust de tray, 22 de dock,
  frontend build, `cargo check` y LSP pasan; sólo quedan warnings `dead_code`
  preexistentes.

## Handoff De Release Autorizado — 2026-07-27

JP autorizó para una sesión nueva: revisar el diff completo, ejecutar gates,
commit, push a `main`, crear un prerelease Windows, verificar installer/checksum,
instalarlo localmente, hacer smoke controlado y entregar la URL directa para la
otra PC. No autorizó deploy cloud/VPS, cambios de cuentas ni provider calls que
no sean imprescindibles para el smoke acordado.

Orden:

1. Preservar todos los cambios actuales, incluidos el cierre mixed-DPI y su
   guardrail. Verificar que no entren artifacts, audio, transcripts, caches ni
   secretos.
2. Repetir suite desktop focal, build, Rust fmt/tests/check, context audit y
   `git diff --check`; revisar el diff antes de commit.
3. Commit y push de `main`; comprobar que `HEAD == origin/main`.
4. Ejecutar `npm run release:windows` desde source pusheado y árbol limpio.
5. Publicar prerelease unsigned en `jpsala/fixvox-releases` con installer
   canónico `Fixvox-Tauri-Setup.exe` y `.sha256.txt`; redescargar ambos y exigir
   SHA-256 local/publicado/redescargado idéntico.
6. Antes de installer/UI/hotkeys/clipboard, emitir beep/notificación. Instalar
   el asset publicado localmente sin terminar hosts compartidos, lanzar la app
   instalada y usar un target descartable. Restaurar clipboard si se modifica.
7. Smoke mínimo: menú de tray y botón derecho contienen Paste last/History;
   ambos preservan el target anterior; intento sin transcript no pega History
   viejo; Copy exitoso y Close Companion vuelven a Ready. No registrar texto
   crudo.
8. Registrar commit/tag/hash/smoke/URL en esta track y Working Memory; hacer el
   commit/push documental de receipt si corresponde.

## Receipt De Release — 2026-07-27

- Source de recovery/tray y mixed-DPI preservado en `2739597`; el smoke del
  primer candidato detectó que el cierre nativo de Companion sólo ocultaba la
  ventana. El follow-up `d5aa728` emite `close_companion` al dock y deja el
  source final pusheado con `HEAD == origin/main` antes del build definitivo.
- Gates finales: 47 archivos/264 tests focales; 3 tests Rust de tray, 22 de
  dock y 4 de companion; frontend build, Rust fmt/check, context index/audit y
  `git diff --check` verdes. Persisten sólo warnings `dead_code` conocidos y un
  warning documental por el tamaño del topic Fixvox.
- Prerelease final unsigned:
  `fixvox-tauri-v0.1.0-20260727234336`. Installer `29,595,980` bytes. SHA-256
  local, checksum publicado y redescarga:
  `b394b2a42ce2014ddec0b04c4b9b5e88954e9af15880321daddd23b1375cad60`.
- Release:
  `https://github.com/jpsala/fixvox-releases/releases/tag/fixvox-tauri-v0.1.0-20260727234336`.
  Installer directo:
  `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260727234336/Fixvox-Tauri-Setup.exe`.
- El asset redescargado se instaló localmente con exit `0`, versión `0.1.0` y
  entrada de uninstall presente. Smoke nativo instalado pasó: tray y botón
  derecho muestran Paste last/History; ambos conservaron el target descartable;
  History entregó con afinidad `saved`; un intento cancelado sin transcript más
  `Alt+Shift+X` no pegó History viejo; Copy exitoso y el cierre nativo de
  Companion volvieron a `Ready`.
- El smoke no hizo provider calls ni registró texto crudo. Clipboard y la
  preferencia temporal de focus fueron restaurados. Evidencia redacted ignorada
  en `artifacts/desktop-control/error-recovery-installed-smoke/fixvox-tauri-v0.1.0-20260727234336/report.json`.
- El candidato previo `fixvox-tauri-v0.1.0-20260727225134` quedó superseded por
  el prerelease final después de descubrir y corregir el lifecycle nativo de
  Companion; no usarlo para instalación.

## Hotfix Windows Terminal — 2026-07-28

- La prueba manual de JP encontró que `Paste last` desde el botón derecho del
  dock fallaba sobre un input de Windows Terminal con la causa redacted
  `No matching editable foreground target...`. El receipt anterior había usado
  un target descartable no-terminal y una preferencia temporal distinta, por lo
  que no cubría esta combinación.
- Causa: el watcher excluía terminales para no reemplazar silenciosamente un
  target de aplicación, pero esa exclusión también bloqueaba la captura
  explícita del menú. Además, `pasteWithoutFocusChange` impedía restaurar el
  target que el propio menú había desplazado temporalmente.
- Fix `d1b3c98`: la exclusión de terminales queda limitada al watcher de fondo;
  tray/botón derecho aceptan Windows Terminal como target explícito. Un flag
  host-owned acotado permite restaurar sólo ese target capturado por el menú,
  sin relajar la política general de no-focus ni la afinidad de selección.
- Gates: 47 archivos/265 tests focales, 20 tests Rust de desktop delivery,
  frontend build, `cargo fmt --check`, `cargo check`, LSP y `git diff --check`
  verdes. Smoke local source con proceso controlado `WindowsTerminal.exe` y
  `pasteWithoutFocusChange=true` pasó antes del release.
- Prerelease hotfix unsigned:
  `fixvox-tauri-v0.1.0-20260728002623`; installer `29,594,384` bytes. SHA-256
  local, checksum publicado y redescarga:
  `a829bc9e6d6fb3366fa5037fb12a0cfc9c9cda37af0a3fd3518b5840f13a0207`.
- Release:
  `https://github.com/jpsala/fixvox-releases/releases/tag/fixvox-tauri-v0.1.0-20260728002623`.
  Installer directo:
  `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260728002623/Fixvox-Tauri-Setup.exe`.
- El asset redescargado se instaló con exit `0`. Smoke sobre una ventana real y
  descartable de Windows Terminal pasó: target reconocido como editable,
  menú con Paste last/History, delivery `paste_sent` al input previo y foco
  restaurado después del menú. Enter quedó deshabilitado durante la prueba; no
  se ejecutó texto, no hubo provider calls ni texto crudo. Clipboard y
  preferencias fueron restaurados, la ventana descartable se cerró y no se
  terminó `WindowsTerminal.exe`.
- `fixvox-tauri-v0.1.0-20260727234336` queda superseded para esta ruta; usar el
  hotfix `...002623`.

## Hotfix Delivery Sin Clipboard — 2026-07-28

- JP detectó que el delivery introducido en `bc9de65` había reemplazado la ruta
  Unicode directa de `193ad54` por un `Ctrl+V` basado siempre en clipboard. La
  restauración posterior no satisface el contrato: dictado normal, Paste last e
  History no deben contaminar ni depender del clipboard.
- Fix `775c5c9`: `KEYEVENTF_UNICODE` vuelve a ser la ruta predeterminada y no
  toca el clipboard. El fallback temporal queda únicamente como opt-in explícito
  mediante `DICTATION_TAURI_ALLOW_CLIPBOARD_PASTE_FALLBACK`; no está definido en
  process/user/machine y por defecto falla cerrado. `Copy transcript` conserva
  su semántica explícita de copiar.
- El E2E de dictado quedó endurecido para preparar y restaurar el sentinel con
  Win32 real, sin formatos OLE que falseaban el guardrail. E2E completo con audio
  sintético y provider real pasó: target recibió texto, evidence disponible y
  el clipboard de control permaneció idéntico. JP probó dos dictados en dev; el
  log sólo mostró `using direct Unicode delivery without clipboard`.
- Gates: 47 archivos/265 tests focales, 20 tests Rust de desktop delivery,
  frontend build, `cargo fmt --check`, `cargo check`, LSP, context audit y
  `git diff --check` verdes.
- Prerelease unsigned:
  `fixvox-tauri-v0.1.0-20260728122818`; installer `29,594,984` bytes. SHA-256
  local, checksum publicado y redescarga:
  `27ff95c3aa49a727ba0197a22fbdc67c0f84e4f5a6390ea21952f8adb66df6e7`.
- Release:
  `https://github.com/jpsala/fixvox-releases/releases/tag/fixvox-tauri-v0.1.0-20260728122818`.
  Installer directo:
  `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260728122818/Fixvox-Tauri-Setup.exe`.
- El asset redescargado se instaló con exit `0`. Smoke instalado sobre una
  ventana real descartable de Windows Terminal pasó: target editable, botón
  derecho → Paste last, foco restaurado, delivery `paste_sent`, Enter no enviado
  y clipboard sentinel preservado. Preferencias y clipboard fueron restaurados;
  la ventana descartable se cerró sin terminar el host compartido. No hubo
  provider calls ni texto crudo en este smoke instalado.
- `fixvox-tauri-v0.1.0-20260728002623` queda superseded; usar `...122818`.

## Hotfix Delivery Nativo Rápido — 2026-07-29

- Source final `5eb4ab872bc08d34c6ea34dc1fdd30e2f1921487`, commiteado y
  pusheado a `main`; `HEAD == origin/main` antes del build.
- El delivery captura el control enfocado con `GetGUIThreadInfo` y usa
  `EM_REPLACESEL` sólo para la allowlist `Edit`/`RichEdit` revalidada. WPF,
  Chromium, terminales y clases desconocidas conservan
  `SendInput(KEYEVENTF_UNICODE)` sin clipboard. Timeout del mensaje queda
  incierto y no hace fallback para evitar duplicados.
- Prueba real source: Notepad moderno entregó 426 unidades UTF-16 por
  `native_edit_message` en 8 ms de input/9 ms total con `observed=true`;
  Windows Terminal conservó `unicode_send_input` (118 unidades, 340 ms).
- Gates de release: 47 archivos/265 tests focales, frontend build, Rust
  `fmt --check`, `check`, test compile, context audit y NSIS verdes. Persisten
  sólo warnings `dead_code` conocidos y el warning documental preexistente.
- Prerelease unsigned: `fixvox-tauri-v0.1.0-20260729120801`; installer
  `29,597,629` bytes. SHA-256 local, checksum publicado y redescarga:
  `1ef208874a42681ba3e57afe0318160fc0e4492b3b0b9902cc884f227c7426d2`.
- Release:
  `https://github.com/jpsala/fixvox-releases/releases/tag/fixvox-tauri-v0.1.0-20260729120801`.
  Installer directo:
  `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260729120801/Fixvox-Tauri-Setup.exe`.
- El asset redescargado se instaló localmente con exit `0` en
  `%LOCALAPPDATA%/Fixvox Tauri`; versión `0.1.0`, entrada de uninstall presente
  y proceso instalado vivo tras el launch. La app dev atribuible fue cerrada
  sin terminar hosts compartidos. No hubo deploy cloud/VPS ni provider calls.
- `fixvox-tauri-v0.1.0-20260728122818` queda superseded para nuevas
  instalaciones. El caso CRLF en fallback Chromium sigue como follow-up
  separado; no bloquea este fast path.

## Hotfix Local De History — 2026-07-30

- JP confirmó que `Alt+Shift+X` reutilizaba correctamente el último dictado, pero
  History no acumulaba los resultados correctos.
- Causa: cada dictado construía una instancia nueva de `PipelineService`; su
  contador interno reiniciaba el `runId` en `sim-run-0001`. El writer de History
  deduplica por `${runId}:${source}`, así que cada dictado reemplazaba al anterior.
- Fix local: el `runId` predeterminado de una corrida con captura usa el
  `captureId` nativo, que ya es único por captura. Fixtures sin captura conservan
  el contador determinístico y `createRunId` sigue siendo inyectable en tests.
- Regresión: dos servicios nuevos con capturas distintas producen IDs distintos.
  Pasaron 97 archivos/508 tests, build, Rust History (4 tests), `cargo check`, LSP
  focal y `git diff --check`.
- Smoke Tauri redacted: el store retuvo tres capturas distintas, Companion mostró
  exactamente los tres resultados en orden newest-first y seleccionar el del
  medio promovió ese texto exacto a paste-last. El History original se restauró;
  no hubo provider calls ni texto real en el reporte. Evidencia ignorada en
  `artifacts/desktop-control/result-history-smoke/history-fix-20260730/report.json`.
- El smoke físico general de action hotkeys quedó rojo antes de llegar a
  `Alt+Shift+X` porque todavía busca el copy viejo `PRESET PICKER`; la superficie
  actual dice `Presets`. No contradice el smoke focal de History ni el atajo que
  JP ya confirmó, pero el harness debe actualizarse por separado.

## History Table Y Estudio De VS Code — 2026-07-30

- History dejó las cards expansibles y usa una tabla compacta de filas estables:
  Result, Type, Status y Paste. El hover sólo cambia fondo; flechas recorren
  resultados y Enter/click conservan la acción de paste.
- El preview flotante aparece después de 800 ms, queda fuera del flujo de la
  tabla, no cambia alturas y respeta reduced motion. Smoke Playwright a 440×420
  confirmó `0` previews a 750 ms, `1` a 850 ms, alturas idénticas y foco por
  ArrowDown. Screenshots redacted ignoradas en `artifacts/visual/`.
- La ruta Chromium/VS Code ya agrupa hasta 512 unidades UTF-16 por llamada a
  `SendInput`; Microsoft documenta que el array se inserta serialmente en el
  keyboard stream y `KEYEVENTF_UNICODE` se convierte en `VK_PACKET`/`WM_CHAR`.
  Los logs locales muestran el costo observable en el target: 199 unidades en
  377 ms y 672–741 unidades en 1.17–1.27 s. Aumentar el batch no resuelve que
  Monaco procese eventos de teclado individuales.
- UI Automation no ofrece un fast path equivalente: TextPattern/TextRange es de
  lectura y ValuePattern no es el contrato de edición multilínea de Monaco.
  `WM_CHAR` sobre `Chrome_WidgetWin_1` tampoco apunta a un control editable y no
  es una entrega confiable.
- Una integración opt-in mediante extensión local podría acelerar VS Code, pero
  JP la descartó por ser específica de cada aplicación. La decisión es mantener
  una ruta estándar de Windows, sin extensiones ni hooks por aplicación.
- Bajo esas restricciones no existe otra API universal de inserción bulk en el
  caret de un proceso arbitrario. TSF/`ITfInsertAtSelection` pertenece a text
  services/IME cargados dentro del contexto del target, no a una app externa;
  `InputInjector` sigue inyectando eventos y UIA no expone inserción de caret para
  Monaco. Se conserva `EM_REPLACESEL` para controles nativos y `SendInput` para
  Chromium/terminales, sin clipboard. La lentitud de Monaco queda como limitación
  explícita, no como un fast path inseguro.
- Fuentes primarias:
  [SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput),
  [KEYBDINPUT](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-keybdinput),
  [UIA TextPattern](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-implementingtextandtextrange),
  [UIA ValuePattern](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-implementingvalue) y
  [VS Code TextEditor API](https://code.visualstudio.com/api/references/vscode-api#TextEditor).

## Receipt De Release History — 2026-07-30

- Código y tests: `f58c53b`; documentación previa: `ffc99b0`. Ambos commits
  quedaron pusheados a `main` y `HEAD == origin/main` antes del build.
- Gates: 97 archivos/508 tests frontend, 125 tests Rust + 1 ignored, 40 tests
  Rust adicionales, build frontend, `cargo fmt --check`, `cargo check`, LSP,
  context audit y `git diff --check` verdes. El release script repitió 47
  archivos/265 tests focales, build, Rust compile/test compile y NSIS.
- Prerelease unsigned:
  `fixvox-tauri-v0.1.0-20260730180738`; installer `29,619,349` bytes. SHA-256
  local, checksum publicado y redescarga:
  `46683ed9449cbc9be9c2819242d114de5da3bb97ec2aaf1d6858fc07c789dd77`.
- Release:
  `https://github.com/jpsala/fixvox-releases/releases/tag/fixvox-tauri-v0.1.0-20260730180738`.
  Installer directo:
  `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260730180738/Fixvox-Tauri-Setup.exe`.
- El asset redescargado se instaló localmente con exit `0`; versión `0.1.0`,
  executable y uninstall canónico presentes. Smoke instalado redacted pasó con
  10 IDs únicos: store legible, snapshot completo, 10 filas renderizadas,
  preview visible tras hover sostenido y alturas estables. No registró texto
  crudo, no hizo provider calls y dejó la app instalada viva. Evidencia ignorada
  en `artifacts/desktop-control/installed-history-smoke/fixvox-tauri-v0.1.0-20260730180738/report.json`.

### Corrección De Scroll Del Release

- La revisión visual instalada detectó dos barras verticales: el shell completo
  podía crecer además del scroll propio de la tabla. El fix `865c1ef` hace que
  History ocupe el alto disponible con flex, bloquea overflow del shell y deja
  `overflow-y: auto` únicamente en el wrapper de la tabla. Una regresión verifica
  los tres contratos CSS.
- Release sustituto:
  `fixvox-tauri-v0.1.0-20260730182241`; installer `29,629,572` bytes. SHA-256
  local, checksum remoto y redescarga:
  `6da1bc942b3957c35309bfaa0ca243df56fd66e6b01555135272a6009a956c0d`.
  URL:
  `https://github.com/jpsala/fixvox-releases/releases/tag/fixvox-tauri-v0.1.0-20260730182241`.
- El reemplazo redescargado se instaló con exit `0`. Smoke sobre la app instalada
  pasó con 11 filas: document `420 == 420`, shell `420 == 420`, tabla
  `445 > 326`, overflow exterior `hidden` e interior `auto`. La captura final
  muestra una única barra dentro de la tabla. No se registró texto crudo ni hubo
  provider calls. El release `...180738` queda superseded.

## Receipt De Release Dock/Hotkey — 2026-07-31

- Source `94114d9cb76bb01da24cea5442e995e468cef26c` quedó commiteado y
  pusheado a `main`; `HEAD == origin/main` antes del build. El fix sincroniza la
  state machine de la tecla de dictado cuando la captura empieza por clic en el
  dock, por lo que el primer `Alt+Space` ya detiene la sesión. También conserva
  los ajustes pendientes de onboarding y routing AOS incluidos en el árbol.
- Gates: 97 archivos/510 tests frontend, LSP y context audit verdes. El release
  script repitió 47 archivos/267 tests focales, build frontend,
  `cargo fmt --check`, `cargo check`, `cargo test --no-run` y bundle NSIS.
- Prerelease unsigned:
  `fixvox-tauri-v0.1.0-20260731220417`; installer `29,623,077` bytes. SHA-256
  local, checksum publicado y redescarga:
  `bc70205ec30d5eb50914c73a1eeeb09c8c6b5582105cf0102f394cb84f70795b`.
- Release:
  `https://github.com/jpsala/fixvox-releases/releases/tag/fixvox-tauri-v0.1.0-20260731220417`.
  Installer directo:
  `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260731220417/Fixvox-Tauri-Setup.exe`.
- El asset redescargado se instaló localmente con exit `0`; versión `0.1.0` y
  executable canónico bajo `%LOCALAPPDATA%/Fixvox Tauri` confirmados. La app
  instalada quedó viva. No hubo deploy cloud ni provider calls.

## Pendiente

1. Continuar la matriz capture → STT → postprocess → delivery sólo para errores
   todavía colapsados o estados no operativos.
