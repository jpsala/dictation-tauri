# Working Memory

Router operativo corto; el detalle durable vive en topics, tracks, specs y
decisiones.

Última actualización: 2026-08-21.

## Foco Único De Ejecución

- **Estado:** `blocked`.
- **Siguiente acción:** validar en un harness provider-free la carrera `stop_submit_pressed` → `stop_submit` antes de decidir adopción.
- **Bloqueo:** una prueba física post-fix de `Win+Space` fuerza stop/submit y puede ejecutar provider/paste real; eso está fuera de los invariantes de este lote.
- **Referencia:** `docs/tracks/stop-submit-hotkey-reliability.md`.

## Hotkey Win Space · Estado actual · 2026-08-21

- Objetivo activo: cerrar la acción Fixvox `stopAndSubmit` con `Win+Space`
  editable/persistente como default, sin cambiar Alt+Space.
- Contrato nativo: `WH_KEYBOARD_LL` emite
  `stop_submit_pressed` en keydown y `stop_submit` en keyup. El renderer usa la
  misma semántica hold/tap de `Alt+Space`: una pulsación larga inicia y el
  release detiene/envía con Enter; una pulsación breve inicia y queda latched,
  y la siguiente pulsación detiene/envía. El pressed inicia cuando la captura
  es iniciable y no hay una sesión ocupada; también permite iniciar una nueva
  captura desde `reviewing`.
- La corrección evita que el estado `reviewing` de una captura anterior bloquee
  el nuevo inicio de Win+Space y conserva el release largo durante el arranque
  asíncrono.
- La máquina nativa aplica por default el masking al chord exacto
  `Win+Space`: consume Space-down, autorepeat y Space-up, inyecta sólo `VK_E8`
  con marca propia, deja pasar Win-up físico y conserva `Alt+Space`/otros
  shortcuts fuera de esa ruta. Se eliminó el gate temporal por env que dejaba
  a builds normales en el fallback capaz de activar el selector de Windows.
- `App.tsx` conserva `pendingStopSubmitRef` durante
  `requesting_permission`/`arming` y ahora también conserva
  `stopSubmitStartInFlightRef` mientras `startCapture()` es asíncrono. Esto
  corrige la carrera observada cuando el release llegaba antes de que React
  reflejara el estado de arranque.
- Evidencia física anterior: el hook nativo activó Win+Space y llegó a
  `Recording`, pero el release no detuvo la captura durante la carrera
  asíncrona; un `Alt+Space` posterior terminó el ciclo y produjo un delivery
  real accidental. No repetir ese smoke.
- Evidencia física segura 2026-08-21: la app Tauri actualizada registró una
  activación Win+Space, inyectó la máscara, suprimió Space-up, llegó a
  `Recording` y volvió a idle por Escape. No apareció una ventana del selector
  de entrada de Windows y no hubo provider ni paste.
- Estado post-fix: pasan `cargo test win_space` (3), `cargo check` y la
  instalación/captura del hook en Tauri real; permanecen warnings
  preexistentes. El ciclo físico hold/tap completo sigue sin validarse porque
  el release puede ejecutar provider/paste real.
- Próximo paso: cerrar la validación provider-free de la integración renderer
  `pressed`/`released`; no ejecutar el stop-submit físico completo hasta aislar
  provider, paste, selección y persistencia de audio/transcripción.
- Corrección 2026-08-21: `get_fixvox_setup_readiness` podía quedar
  indefinidamente en `Comprobando tu sesión…` si el bootstrap HTTP quedaba
  colgado, porque el cliente Reqwest no tenía timeout global. El cliente ahora
  tiene timeout de request de 10 s y conexión de 5 s; ante indisponibilidad la
  UI puede pasar a estado recuperable en vez de dejar Setup bloqueado. Smoke
  Tauri posterior: Setup desapareció y `Dictation Dock` volvió a estar visible.
- Estado posterior: el timeout evita el cuelgue, pero el bootstrap real falla
  porque el host configurado responde `/health` con 200 y
  `/product/v1/desktop/bootstrap` con 404. El cliente muestra correctamente
  `No pudimos preparar Dictation` y `Reintentar`; no cambiar el backend local ni
  desplegar infraestructura desde este lote. El bloqueo restante es externo:
  hay que alinear el endpoint product desktop en `auth-fixvox.jpsala.dev` con
  el contrato que el cliente ya usa.
- Release Windows 2026-08-19: prerelease unsigned
  `fixvox-tauri-v0.1.0-20260819130850` publicada desde el commit fuente
  `3697811981df99db571741bc7aa4833810046f21`; el installer y la redescarga
  coinciden en SHA-256 `d7a09415ed33f4400d3461138e3980ea56ceb003a7a87a9e1e7ad86cdeb3daa7`.
  Instalación exit `0`, versión `0.1.0`, app instalada viva. Evidencia y URLs:
  `docs/tracks/fixvox-tauri-cloud-release.md`.

## Cuenta / Onboarding · Corrección en source (sin release)

- Problema reportado en la app instalada: el pill del dock "Conectá tu cuenta" no tenía
  padding derecho y al hacer click abría una ventana `account-notice` que no iba a ningún lado
  (solo "Cerrar").
- Causa raíz original: `capabilities/default.json` no listaba `account-notice`/`account-setup`,
  así que `getCurrentWindow().close()` desde esas ventanas era denegado.
- Fix en source (pendiente de release):
  - Pill del dock `service_unavailable` ahora abre directo la ventana de setup/login
    (`openTauriAccountSetup` → `hide_dock` + `show_account_setup_window`), saltando el aviso
    intermedio redundante.
  - Se eliminó la superficie `account-notice` (ventana Rust `show_account_notice_window`, ruta
    `?surface=account-notice`, componente `AccountNoticeSurface`, tests y entrada de capability);
    `default.json` quedó en `["main","dock-companion","settings","account-setup"]`.
  - CSS del pill: `padding: 0 11px` → `0 13px` (respiración derecha cómoda y simétrica).
- Verificado provider-free: `npm run check`, tests onboarding, `npm run build` y el test visual
  `account-gate.spec.ts` (pill → `show_account_setup_window`). Publicado en prerelease
  `fixvox-tauri-v0.1.0-20260819144426` (instalado y corriendo, pid vivo). El login real (OAuth) sigue sin comprobarse en vivo (gated).

## Contrato Congelado

- `profiles` y `profile_versions` son la autoridad única. La metadata de
  profile/version queda anidada fuera de la definición canónica y la mutación
  envía únicamente `definition`.
- El catálogo seguro vive en
  `GET /product/v1/control-room/laboratory/catalog`: cuatro recipes STT y tres
  de postprocess desde `evaluation-recipes.ts`; Gate B v1 conserva su par
  histórico y Gate B v2 usa `plain` + `conservative-timing`. IDs encontrados en
  artifacts no son autoridad seleccionable.
- Runtime sólo conserva `engineId`/`promptId`; el idioma es
  `defaults["transcript.language"]`.
- El lifecycle server-owned está completo en producción: issue opaco, consume
  único, reserva atómica por request, completion/abort terminal e idempotencia.
  Gate A completó `12/12` con `4992/5000` microusd y tres refs canónicos; Gate B
  completó `6/6` con `4998/5000` microusd. No quedan ejecuciones activas.
- Gate A exige igualdad exacta con `GATE_A_DEFINITION`; Gate B deriva sólo de
  ese Gate A completo e identity-bound; vocabulary requiere snapshot inmutable
  por ID.
- `configured`, `resolved` y `observed` son independientes y muestran
  `null`/`unavailable` honestamente.
- Preview usa `add`/`remove`/`change` y `candidateFingerprint`; un diff stale no
  habilita publicación. Empty/no-op tienen estado explícito.
- Receipt `success` y refresh fallido son resultados separados.
- Roles, sesión y recursos no disponibles bloquean de forma honesta. Audio,
  gold, raw, final, paths, secretos y payloads de provider nunca aparecen en
  proyecciones públicas.
- La ventana desktop mantiene default/mínimo `720x620` mediante resize nativo.
  El smoke Tauri real final pasó `11/11`: Settings→Laboratory, cinco workspaces,
  `720x620`, `900x700`, 200% zoom, provider-free y cero
  bootstrap/device/cloud/provider.
- Settings quedó modularizado: shell/registry/search, controller compartido de
  preferencias y nueve secciones aisladas. El smoke Tauri provider-free abrió
  desde tray, validó rail completo a `720x480`, búsqueda con foco exacto,
  resize compacto y reapertura nativa. Evidencia en
  `artifacts/settings-architecture/20260815/`.
- Settings ahora muestra procedencia, alcance, efecto, persistencia, relaciones,
  búsqueda/deep links y diagnóstico redactado sin inventar autoridad. El smoke
  Tauri provider-free recorrió las nueve secciones, cinco búsquedas, preview,
  cierre/reapertura nativa y dejó Avanzado abierto. Evidencia en
  `artifacts/settings-transparency/20260815-dev-smoke/`.
- El pulido posterior corrigió una divergencia real: Cuenta refrescaba el estado
  Cloud sin compartirlo con Acciones, Ayuda y Avanzado. `SettingsSurface` ahora
  conserva una proyección segura común. Evidencia en
  `artifacts/settings-transparency/20260815-polish-smoke/`.

## Gates Ejecutados Y Cierre Actual

- Producción corre el release inmutable `5d53030dca65cf0a`, archive SHA-256
  `5d53030dca65cf0a0001b3e88cb2ebdbb96e111855799b4b8c6c0ba350c71572`.
  `a8dc509b64506240` es el rollback inmediato schema-9;
  `bb1de673e1c36c50`, `6ac7ed0a2a88f0d0`, `c1154baf25dbe005`,
  `2a49be9eccf4ce17`, `0434f2cf3d0a6607`, `bc1a3e5cadba1903` y
  `650b4c8f6ed00a2a` siguen preservados; `11bf651ce5d983b6` no es ejecutable
  directamente contra schema 9.
- Producción permanece schema `9`, migrations `0001..0009` y marker
  `laboratory_execution_grants`; service active/enabled, `NRestarts=0`,
  listener único `127.0.0.1:8790`, health/readiness local+público verdes y
  `cloudflare-authority`. No hubo migración, backfill, SQL manual, env, DNS ni
  tunnel.
- El runtime desktop proyecta por separado el profile asignado y el plan que
  lo agrupa. La asignación productiva observada es profile
  `dictation-complete-v1` / `Dictado completo` bajo plan `pro` / `Pro`; el
  cliente local construido desde `cec5ecf` quedó instalado y muestra ambos
  nombres en Cuenta. STT server-owned deriva señales privadas de prosodia desde
  timestamps y las entrega sólo al postprocess `openai/gpt-oss-120b`; no se
  serializan en receipts ni UI. Un dictado sintético real único confirmó
  `fixvox-cloud` + postprocess policy-owned, sin fallback, y materializó una
  lista numerada.
- El modo global host-owned persiste en `user_preferences` y se selecciona
  desde Settings, tray o menú contextual del dock: `Según mi perfil`, `Rápido`,
  `Limpieza segura` o `Completo`. Runtime resuelve respectivamente perfil
  publicado, `daily-literal-v1`, `daily-safe-cleanup-v1` o
  `daily-experimental-rich-v1`; los dos últimos usan postprocess canónico
  conservador y `Completo` habilita STT rich allowlisted. Los overrides
  next/session de Laboratory conservan precedencia sin mutar el modo global.
- Un replay separado y aprobado del dictado complejo de `59.3 s` ejecutó una
  sola llamada STT y una postprocess, sin retries. El raw STT conservó la lista
  hablada y el path fonético; `openai/gpt-oss-120b` los convirtió en una lista
  numerada multilínea y `C:\dev\dictation-tauri`. El sanitizer preservó el
  layout byte por byte (`sanitizedChanged=false`). En este replay no se observó
  guidance de prosodia; la mejora provino del contrato semántico del prompt.
  Raw STT, output pre-sanitizer y final quedaron sólo en artifacts privados
  ignorados.
- La mutación aprobada owner→owner creó audit `sequence=11` con
  `safe_metadata` JSONB `object`; owner count siguió `1` y los audits históricos
  `sequence=9/10` permanecieron intactos como JSONB `string`.
- Gate A completó `12/12`, sin retries, postprocess ni delivery. El ledger
  productivo quedó en `4992/5000` microusd; completion acuñó tres refs canónicos
  y audit `sequence=14` como JSONB `object`.
- Un primer setup Gate B fue abortado antes de spawn por un verifier local que
  incluyó `candidateId` donde el servidor proyecta `{sampleId, rawRef}`:
  `0/6` requests, costo `0/5000`, cero provider calls. El packet sustituto
  aprobado corrigió sólo esa proyección.
- Gate B v1 completó exactamente `6/6` requests secuenciales, sin retries, STT,
  audio, delivery, vocabulary ni mutación de profile. El ledger quedó en
  `4998/5000` microusd y audit `sequence=20` como JSONB `object`.
- Gate B v2 también completó una única matriz `3×2`: `6/6`, `4998/5000`
  microusd, audit `sequence=23` JSONB `object`, cero retries y cero requests STT.
  Baseline `plain` quedó `3/3 accepted`, safety `3/3`, WER `0.2206`, CER
  `0.1295`, latencia media `1114 ms`. `conservative-timing` quedó `2/3
  accepted`, un fallback por `material_omission`, `9` omissions, safety `2/3`,
  mismo WER, CER `0.1299` y latencia `1149 ms`.
- Decisión: no promover `conservative-timing`. No mejora WER y degrada safety,
  CER y latencia. El fallback preservó el raw privado; no quedan ejecuciones
  Gate B activas.
- La UI separa recursos y razones de indisponibilidad; owner stale conserva
  catálogo/preview/grants bajo sus gates y provider-free local no depende de
  recent-auth. Los planes Gate A/B son matrices bloqueadas. El cliente desktop
  actualizado se instaló localmente desde source limpio; no se publicó
  prerelease.

## Frentes Retomables

| Frente | Estado | Abrir primero |
| --- | --- | --- |
| Calidad de transcripción | Gate B v1 y v2 cerrados; candidato metadata v2 no promovido por regresión semántica | `docs/tracks/transcription-quality-program.md` |
| Reliability/truthfulness | local complete; Phase 4 gated | `docs/tracks/fixvox-minimal-reliability-and-truthfulness.md` |
| Dock/Wispr | listo para retomar | `docs/tracks/dock-skins-visual-refinement.md` |
| Cloud/runtime | referencia cerrada | Spec 019 y `docs/topics/fixvox-cloud-runtime-port.md` |
| Operaciones externas | sin batch activa | `docs/tracks/standard-product-ux-external-operation-gate-plan.md` |
| Pi Chat | pausado | `docs/tracks/pi-chat-conversation-first-ux.md` |
| Error recovery | listo para retomar | `docs/tracks/dictation-error-recovery-hardening.md` |
| Producto | referencia | `docs/topics/product-direction.md` |
| AOS | operativo | `docs/topics/agentic-os.md` |


## Guardrails

- No imprimir ni commitear secretos, `.env`, tokens, datos sensibles, artifacts
  o caches.
- Provider/OAuth real, cuentas, VPS, deploy, DNS, release, producción,
  commit/push y acciones destructivas requieren autorización explícita.
- Smokes físicos/live de hotkeys, audio, selección, replace-selection, observer
  y paste real requieren task/spec o confirmación.
- Para UI durable abrir `PRODUCT.md` y `DESIGN.md`; usar app Tauri real cuando
  el shell nativo sea parte del comportamiento.
- Ejecutar un solo batch acotado con checks proporcionales; no revivir motores
  de orquestación retirados.

## Comandos

```powershell
bun run aos:doctor
bun run context:index
bun run context:audit
npm run check
```
