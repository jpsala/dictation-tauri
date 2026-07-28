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

## Pendiente

1. Completar el handoff autorizado anterior en una sesión limpia.
2. Después del release, continuar la matriz capture → STT → postprocess →
   delivery sólo para errores todavía colapsados o estados no operativos.
