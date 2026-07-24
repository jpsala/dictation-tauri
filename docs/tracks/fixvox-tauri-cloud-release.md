---
status: superseded
started: 2026-06-27
updated: 2026-07-20
priority: high
owner: JP
related:
  - docs/tracks/standard-product-ux-external-operation-gate-plan.md
  - docs/topics/fixvox-cloud-runtime-port.md
  - docs/topics/backend-and-model-routing.md
  - specs/009-fixvox-cloud-runtime-port/tasks.md
  - specs/016-fixvox-cloud-consolidation/tasks.md
  - C:/dev/infra/docs/runbooks/cloud-services.md
topic: fixvox-cloud-runtime-port
source_refs:
  - cloud/fixvox-proxy/src/index.ts
  - cloud/fixvox-proxy/src/control-plane-store.ts
  - src-tauri/src/fixvox_cloud.rs
  - src-tauri/src/runtime_transcription.rs
  - C:/dev/infra/docs/runbooks/cloud-services.md
---

# Fixvox Tauri Cloud Client + Release

## Objetivo

Llegar lo antes posible a un Fixvox Tauri instalable en otra PC, activable contra Fixvox Cloud y capaz de dictar usando managed transcription/policies sin depender de `.env` local ni de Groq BYOK en la maquina destino. Desde 2026-06-30, el objetivo operativo incluye que este repo sea el dueño de Fixvox Tauri + Cloud para no depender de `C:/dev/fixvox` en trabajo nuevo.

Decision de producto 2026-06-27: Dictation Tauri es el nuevo cliente desktop de Fixvox. Fixvox Cloud (`auth-fixvox.jpsala.dev`) es el control-plane canonico para device, activation, policy/preflight y managed runtime. No crear otro cloud/tenant salvo decision explicita posterior.

## Estado Actual

- Local/dev ya funciona con Tauri/Rust, dock, tray/hotkeys, Settings y managed transcription parcial.
- `cloud/fixvox-proxy/` ahora vive en este repo como source operativo del Worker productivo; tests provider-free pasan desde este repo. Cutover deploy desde este repo ya se ejecuto con aprobacion. Versiones: `f23ad375-5056-483d-8f0a-417a5450bd76` para cutover inicial; `8218d344-adfc-467e-bd12-b4ad271e1826` para auth capabilities explícitas en refresh signed-in. T021 y T022 rerun OK.
- Installer Windows local genera NSIS unsigned como `Fixvox Tauri_0.1.0_x64-setup.exe` e incluye FFmpeg 7.1.1 Essentials GPLv3 como sidecar versionado, sin depender del `PATH` de la PC destino.
- Ruta cloud actual en este repo usa `src-tauri/src/fixvox_cloud.rs` y `src-tauri/src/runtime_transcription.rs` para readiness, preflight y managed STT cuando existen `FIXVOX_INSTALL_ID` + `FIXVOX_DEVICE_ID`.
- BYOK/direct Groq sigue siendo fallback/dev, no norte de producto.
- Control-plane/policies canonicos para Tauri ahora viven en `cloud/fixvox-proxy/`; infra documenta release artifacts en `jpsala/fixvox-releases`.
- Smoke real T021 2026-06-30: primer intento login/session redacted llego a `signed_in`, pero `/desktop/login/link-device` devolvio `FIXVOX_LOGIN_DEVICE_LINK_REJECTED` / `Not found`. Se implemento `POST /desktop/login/link-device`, se migro el Worker a `cloud/fixvox-proxy/`, se desplego con aprobacion desde este repo y rerun T021 paso con `authPolicy` signed-in redacted, policy Pro y managed capabilities active. Evidencia: `artifacts/desktop-control/fixvox-login-link-smoke/20260630-T021-after-repo-cloud-deploy/report.json`.
- Cuidado: no pisar el canal/update artifacts del cliente Fixvox viejo sin plan de migracion.

## Proximo Paso

Bootstrap inicial completado: installer local reproducible + release channel separado documentado para Tauri. Device identity/status host-owned y Settings activation estan implementados. Smoke real autorizado por JP diagnostico Cloudflare 1010 sin User-Agent; con `fixvox-tauri/<version>` el device local quedo Pro. T005 ya agrega snapshot/capabilities policy-driven y T006 ya endurece el runtime para preferir device state persistido y no caer silenciosamente a BYOK. El smoke instalado local aislado ya paso; JP dejo la prueba en otra PC en pausa. UX de Cloud Settings ahora muestra health/next-step/actionable errors, repair/refresh, sign-in Google sin modal y polling redacted de session status; JP confirmo que el flow OAuth termina y Settings muestra signed-in redacted. Decision 2026-06-29: login cloud para todo lo que supere el modo basico, con grupos/policy templates/capabilities administrables desde Fixvox Cloud; ver `specs/015-fixvox-auth-policy-groups/`. T021 real link/policy refresh ya paso post-deploy; T022 tambien paso con aprobacion explicita: Pro unlocks managed dictation y alpha-basic signed-in fail-closed antes de provider. Nuevo arco `016`: consolidar el Cloud Worker en este repo; Phase 1 bootstrap copy listo y cutover deploy desde `cloud/fixvox-proxy` ejecutado con aprobacion. T021 y T022 pasaron post-cutover; queda legacy demotion/docs cleanup.

## Release Bootstrap Inicial

- Identidad instalable: `Fixvox Tauri` con app identifier separado `dev.jpsala.fixvox-tauri`.
- Canal/asset inicial local: NSIS Windows x64 generado bajo `src-tauri/target/release/bundle/nsis/` por `npm run release:windows`.
- Nombre esperado de artefacto local Tauri: `Fixvox Tauri_<version>_x64-setup.exe`; si se publica mas adelante, renombrar/subir como canal separado, por ejemplo `fixvox-tauri-win-x64` o `Fixvox-Tauri-Setup.exe`, sin pisar artifacts legacy/Electrobun.
- Sidecar Windows x64: `src-tauri/binaries/ffmpeg-x86_64-pc-windows-{gnu,msvc}.exe`; ambos aliases contienen el mismo binario y Tauri instala `ffmpeg.exe` junto a la app. Licencia, procedencia y hashes viven en `src-tauri/third-party/ffmpeg/`.
- Guardrail: este batch solo genera artefactos locales unsigned; publicar/subir release, tocar secrets o usar invite codes reales requiere aprobacion explicita.

## Incidencias / Gotchas Activos

### Settings window blanca recurrente

- Estado: open / requiere investigacion.
- Sintoma observado por JP: la ventana `Dictation Tauri Settings` queda totalmente blanca en algunos ciclos de abrir/cerrar Settings y/o luego de intentar activation cloud. Capturas locales: `pi-clipboard-805fbc54-be34-4e2e-bd24-4474fbc332e6.png`, `pi-clipboard-b8f9fde0-0a1a-4c20-8d54-e2910dee4070.png`.
- Contexto: en browser/Vite `http://127.0.0.1:1420/?surface=settings` renderiza correctamente; el blanco parece especifico del WebView Tauri/settings window o de una instancia oculta/stale.
- Mitigacion ya probada: `src-tauri/src/settings_window.rs` primero forzo `window.navigate(.../index.html?surface=settings)` antes de `show()`, pero JP reporto recurrencia. Siguiente mitigacion aplicada 2026-06-28: quitar la ventana `settings` preconfigurada de `tauri.conf.json` y crear Settings on-demand como WebView visible/fresca; el cierre ahora destruye la ventana en vez de ocultarla para evitar instancias stale.
- Mitigacion aplicada 2026-06-29: el caso vivo era dock `about:blank`/Settings negra por Vite dev server bloqueado transformando modulos y Settings on-demand quedando `about:blank`. Se excluyo `artifacts/**`/targets del watcher Vite, se declaro Settings como WebView preconfigurada oculta en `tauri.conf.json`, se usa `index.html#settings` (hash, no query on-demand), el renderer detecta `#settings`, y close de Settings ahora hace hide en vez de destruir. Smoke live `20260629-live-fixed-dock-settings`: dock renderiza `Ready`, `show_settings_window` responde OK y Settings CDP renderiza contenido `Settings / Hotkeys`.
- Workaround operativo actual: reiniciar la app con `npm run tauri:dev:hidden -- -StopExisting`; si el dock queda en `about:blank`, matar explicitamente `dictation-tauri.exe` y el owner del puerto 1420, limpiar `node_modules/.vite` y relanzar. No dejar artifacts vivos bajo paths vigilados salvo que `vite.config.ts` ignore el arbol.
- Hotfix browser paste 2026-06-29: dictado, dock y `Alt+Shift+X` fallaban al pegar en inputs de browser porque la ruta comun de delivery mandaba `Escape` antes de `Ctrl+V`; en Chromium eso blurreaba el input/textarea y dejaba `activeElement=BODY`. Se quito el `Escape` global de paste, se mantuvo delay extra de clipboard para `Chrome_WidgetWin_*`, y `Alt+Shift+X` captura target snapshot en keydown. JP confirmo que browser paste funciona bien en run `20260629-no-escape-before-paste`. Follow-up 2026-06-29: la delivery nativa ahora intenta `SendInput` Unicode directo primero, sin tocar portapapeles; el clipboard + `Ctrl+V` queda solo como fallback opt-in via `DICTATION_TAURI_ALLOW_CLIPBOARD_PASTE_FALLBACK=true`. Follow-up performance: para `Chrome_WidgetWin_*`/`Chrome_RenderWidgetHostHWND` se salta el observer Win32 bounded no util y el settle directo queda corto para evitar lentitud post-insercion en navegadores.

## Tasks

### T001 — Declarar identidad Fixvox Tauri y release channel inicial

- Estado: done
- Tipo: docs/decision
- Objetivo: dejar estable que este repo produce el nuevo cliente desktop Fixvox Tauri y que usa Fixvox Cloud.
- Pasos:
  1. Actualizar docs raiz/topic si aparecen referencias ambiguas a producto separado.
  2. Definir nombre de artefacto/canal inicial, sin pisar Electrobun legacy: ejemplo `Fixvox-Tauri-Setup.exe` y/o `fixvox-tauri-win-x64`.
  3. Registrar guardrail: no publicar source/secrets; release publicable solo artifact generado.
- Checks:
  - `bun scripts/context-index.ts`
  - `bun scripts/agent-context-audit.ts`

### T002 — Crear installer Windows local reproducible

- Estado: done
- Tipo: implementation
- Objetivo: `npm run release:windows` genera un installer Windows local desde main.
- Pasos:
  1. Revisar config Tauri bundle actual (`src-tauri/tauri.conf.json`).
  2. Activar bundle Windows con target inicial recomendado NSIS `.exe`.
  3. Agregar script `release:windows` que ejecute checks relevantes y `tauri build`.
  4. Confirmar output bajo `src-tauri/target/release/bundle/...`.
- Checks:
  - `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`
  - `npm run build`
  - `cd src-tauri && cargo fmt --check && cargo check`
  - `npm run release:windows`
- Guardrails:
  - No publicar/subir en esta task.
  - No instalar autostart ni tocar system-wide sin aprobacion.

### T003 — Persistir device identity y cloud status host-owned

- Estado: done
- Tipo: implementation
- Objetivo: otra PC puede tener `install_id` durable y ver estado cloud sin `.env` manual.
- Pasos:
  1. Usar/pulir `FixvoxDeviceState` en app data host-owned.
  2. Generar `install_id` si falta.
  3. Exponer comandos Tauri: `get_fixvox_cloud_status`, `register_fixvox_device`, `refresh_fixvox_policy`.
  4. Redactar `device_id`/errores en UI/logs.
- Checks:
  - tests Rust/TS de parse/persist/readiness sin llamadas reales.
  - `npm run build`
  - `cd src-tauri && cargo check`
- Guardrails:
  - No imprimir ids completos ni secrets.
  - Registro real contra cloud requiere confirmacion si impacta backend productivo.

### T004 — Activation minima con invite/code

- Estado: done
- Tipo: implementation
- Objetivo: Settings permite activar el cliente Tauri contra Fixvox Cloud.
- Pasos:
  1. Agregar comando host-owned `activate_fixvox_device(inviteCode)` contra `/v2/device/activate`.
  2. UI minima en Settings: cloud status, policy label, input invite code, errores accionables.
  3. Persistir snapshot devuelto y refrescar readiness.
- Checks:
  - tests provider-free de UI/host contract.
  - smoke real gated con invite de prueba aprobado por JP.
- Guardrails:
  - No usar invite/codes reales sin aprobacion.
  - No declarar activacion productiva sin sync real confirmado.

### T005 — Policy snapshot y capabilities runtime/UI

- Estado: done
- Tipo: implementation
- Objetivo: comportarse como Fixvox: cloud policy manda, UI solo refleja.
- Pasos:
  1. Definir `PolicySnapshot` local con `policyId`, `policyLabel`, `features/capabilities`, `transportPolicy`, `fetchedAt`, `trust/stale/error`.
  2. Derivar capabilities iniciales: `canUseManagedTranscription`, `canSeeAdvancedSettings`, `canUseDebugTools`.
  3. Validar capabilities en backend/runtime, no solo esconder UI.
  4. Settings muestra basic/advanced state de forma clara.
- Checks:
  - tests de `alpha-basic` y `alpha-full/pro` con fixtures.
  - preflight denied no ejecuta provider.
- Guardrails:
  - Failed assignment/refresh no se muestra como policy confirmada.

### T006 — Managed transcription sin BYOK en PC nueva

- Estado: implementation-done / packaged-local-smoke-done / other-PC-smoke-pending
- Tipo: smoke/implementation
- Objetivo: PC instalada + activada dicta usando Fixvox Cloud sin `GROQ_API_KEY` local.
- Pasos:
  1. Cambiar runtime para preferir device state persistido sobre env manual.
  2. Confirmar `/v2/execution/preflight` antes de `/v1/audio/transcriptions`.
  3. Mostrar recovery si falta activation/policy/quota.
  4. Smoke real con policy permitida y, si hay fixture/control, denegada.
- Checks:
  - `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`
  - `npm run build`
  - `cd src-tauri && cargo check`
  - smoke real gated con artifact/report redacted.
- Guardrails:
  - Audio/transcripts reales quedan en artifacts/app data ignorados y no se commitean.

### T008 — UX local de activation/policy/errors

- Estado: done
- Tipo: implementation/ux
- Objetivo: antes de volver a otra PC o publish, Settings debe explicar estados cloud accionables sin filtrar IDs/rutas ni permitir fallback BYOK silencioso.
- Pasos:
  1. Derivar health local: open-in-Tauri, local setup, activation needed, cloud refresh failed, policy stale, managed blocked o ready.
  2. Mostrar status/next-step/capabilities con errores redacted y path de state reducido a app-data basename.
  3. Agregar accion host-owned `Repair device link` ademas de local status, refresh policy y activate.
  4. Mantener confirmacion antes de contactar Fixvox Cloud.
- Checks:
  - `npm run test:pipeline -- tests/settings`
  - `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`
  - `npm run build`
- Guardrails:
  - No llamadas cloud reales nuevas en este batch.
  - No publicar/subir assets.
  - No mostrar invite codes, device IDs completos, transcripts ni rutas personales completas.

### T009 — Login cloud, grupos y policy capabilities administrables

- Estado: browser-google-oauth-done / tauri-polling-ux-done / T021-real-link-smoke-done
- Tipo: product/control-plane
- Objetivo: pasar de activation/invite como mecanismo principal a usuario autenticado + device linked + policy group administrable desde Fixvox Cloud.
- Pasos:
  1. Mantener modo anonimo/basic con `installId` para onboarding limitado.
  2. Requerir login para capacidades superiores: dictation managed, postprocess, transforms, assistant actions, advanced/debug y limites altos.
  3. Modelar `User -> Group -> Policy Template -> Capabilities + Limits` y vincular devices a usuarios.
  4. Agregar Settings/Cloud signed-out/signed-in UX con `Sign in` via browser externo.
  5. Validar capabilities en Cloud y host runtime; UI gating no cuenta como seguridad.
  6. Estado 2026-06-30: Cloud production `/desktop/login` muestra Google OAuth y browser flow completo; Settings no usa modal, abre browser directo, hace polling/focus polling de `/desktop/login/status` via comando host-owned `poll_fixvox_cloud_login`. El host completa link/refresco post-OAuth contra `/desktop/login/link-device` usando state + install/device metadata redacted-safe, persiste el policy snapshot devuelto y Settings deja de mostrar `device link pending` cuando `authPolicy` signed-in llega desde Cloud. Smoke real T021 paso post-deploy con policy Pro/capabilities managed active y Settings `Fixvox policy active`; T022 sigue pendiente y gated.
- Checks:
  - `specs/015-fixvox-auth-policy-groups/tasks.md`
  - `npm run test:pipeline -- tests/settings/auth-policy-groups.test.ts`
  - `npm run test:pipeline -- tests/settings`
  - `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`
  - `npm run build`
- Guardrails:
  - Login/OAuth/device-link real requiere aprobacion explicita.
  - No tokens/user IDs/device IDs completos en logs/docs.
  - No deploy/publish/push.

### T007 — Publicar release artifact descargable

- Estado: done / other-PC-smoke-pending
- Tipo: release
- Objetivo: bajar installer desde otra PC.
- Pasos:
  1. Usar patron `jpsala/fixvox-releases` documentado en `C:/dev/infra`.
  2. Crear canal/asset separado para Tauri para no romper cliente viejo.
  3. Subida inicial manual o script `publish:windows:tauri` con `gh release upload`.
  4. Documentar URL y procedimiento de install/activation.
- Checks:
  - `gh release view --repo jpsala/fixvox-releases --json tagName,assets` despues de publicar.
  - install en otra PC/VM y first launch.
- Guardrails:
  - Requiere aprobacion explicita antes de publicar/subir.
  - No subir source, `.env`, logs, audio, transcripts ni symbols sensibles.

## Evidencia / Source Refs

- 2026-06-27 bootstrap local: `npm run release:windows` OK; genero `src-tauri/target/release/bundle/nsis/Fixvox Tauri_0.1.0_x64-setup.exe` sin publicar/subir.
- 2026-06-27 T003: `fixvox_cloud` expone comandos Tauri `get_fixvox_cloud_status`, `register_fixvox_device`, `refresh_fixvox_policy`; `get_fixvox_cloud_status` genera/persiste `install_id` si falta, devuelve ids redactados y conserva policy/transport snapshot host-owned. Helpers provider-free con fake client cubren register/refresh sin llamadas reales.
- 2026-06-27 T004 provider-free: comando Tauri `activate_fixvox_device(inviteCode)` contra `/v2/device/activate`, request con `inviteCode`, persistencia host-owned y Settings compacta `Fixvox Cloud` con status local, policy, invite input y confirmacion `window.confirm` antes de contactar cloud. Tras feedback de JP, activation ahora sigue el flujo canonico Fixvox: activate devuelve respuesta minima y luego se fuerza register/refresh para obtener policy/transport completos. No se uso invite real desde Pi ni se hizo smoke cloud real.
- 2026-06-28 incidencia abierta: Settings window blanca recurrente en WebView Tauri despues de ciclos de open/close/activation. Ver seccion `Incidencias / Gotchas Activos`; workaround parcial con navigate forced no alcanzo para cerrarla.
- 2026-06-28 activation real autorizada por JP: leer `.env` y probar invite pro revelo que Cloudflare devolvia `403 error code: 1010` cuando el request HTTP no llevaba `User-Agent`. Con `User-Agent: fixvox-tauri/0.1.0` el invite pro activó OK y register devolvio `policyId=pro`, `policyLabel=Pro`, `transportPolicy` proxied para Groq. Se agrego `FIXVOX_TAURI_USER_AGENT` al cliente Rust reqwest para activation/register/preflight/managed STT/postprocess y se sincronizo el device state local a Pro.
- 2026-06-27 checks: `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`, `npm run build`, `cd src-tauri && cargo fmt --check && cargo check`, `bun scripts/context-index.ts`, `bun scripts/agent-context-audit.ts` OK (audit con warnings conocidos de contexto grande/prefijo 013 duplicado).
- 2026-06-29 T005/T006 implementation: `FixvoxDeviceState` ahora persiste `policySnapshot` con capabilities (`canUseManagedTranscription`, `canSeeAdvancedSettings`, `canUseDebugTools`), Settings refleja capabilities basic/advanced, runtime valida policy host-side antes de preflight/provider, device state persistido gana sobre env manual y managed mode falla cerrado sin fallback silencioso a Groq BYOK. Checks OK: `npm run test:pipeline`, `npm run build`, `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`, `cd src-tauri && cargo fmt --check && cargo check`. `cargo test fixvox_cloud::tests --lib` sigue bloqueado por `STATUS_ENTRYPOINT_NOT_FOUND` conocido en este entorno.
- 2026-06-29 publish alpha: `fixvox-tauri-v0.1.0-20260629114744` publicado como prerelease separado en `jpsala/fixvox-releases` con asset `Fixvox-Tauri-Setup.exe` sin marcar latest. Primer build fallaba en PC limpia con `WebView2Loader.dll was not found`; se corrigio agregando `WebView2Loader.dll` como resource del bundle NSIS. Segundo build llegaba a managed preflight sin `install_id` si el usuario dictaba antes de abrir Settings/cloud status; se corrigio para auto-crear device state durable antes de reportar activation/device faltante. Tercer build grababa audio con ruta relativa/dev que el host packaged no podia leer; se corrigio para escribir/leer artifacts packaged bajo app data. Cuarto build reemplazo el icono placeholder `DT` por assets Fixvox app/tray. Quinto build hace que comandos de preset del tray apunten explicitamente al dock y que el listener de host-command sea estable para que `Clear preset` no se pierda durante rerenders. Sexto build corrige activation/register reqwest: estaba serializando el `Result` como wrapper en vez del JSON plano (`inviteCode` quedaba anidado y Cloud devolvia `invite_code_required`). Asset actual SHA256 `4dd4670d3a2a46fa5a605718abaab8f1891b619a6e0f7345bf30b8043f69f74c`. Direct link: `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260629114744/Fixvox-Tauri-Setup.exe`.
- 2026-06-29 validacion de continuidad: `npm run test:pipeline`, `npm run build`, `cd src-tauri && cargo fmt --check && cargo check`, `npm run release:windows`, `bun scripts/context-index.ts && bun scripts/agent-context-audit.ts` OK. `gh release view` confirmo prerelease + assets `Fixvox-Tauri-Setup.exe` y `.sha256.txt`; el `.sha256.txt` publicado coincide con `4dd4670d3a2a46fa5a605718abaab8f1891b619a6e0f7345bf30b8043f69f74c`. Build local regenerado queda solo local y no se republish sin aprobacion. `cargo test --lib` sigue bloqueado por `STATUS_ENTRYPOINT_NOT_FOUND` conocido.
- 2026-06-29 smoke local tipo PC limpia sin instalar: se agrego `scripts/packaged-clean-smoke.ps1` / `npm run packaged-clean:smoke -- -AllowDesktopSideEffects`, que lanza `src-tauri/target/release/dictation-tauri.exe` con `APPDATA/LOCALAPPDATA` aislados, working dir sin `.env`, sin `GROQ_API_KEY`/device env y shortcut `Ctrl+Shift+F9` para no interceptar `Alt+Space`. Passing runs: `artifacts/release/packaged-clean-smoke/20260629-packaged-clean-first-run-nocdp/report.json` contra exe local previo y `artifacts/release/packaged-clean-smoke/20260629-packaged-clean-post-redaction-fix/report.json` contra build local post-fix; verifica que el exe empaquetado queda vivo, configura dock, crea `fixvox-device-state.json` con `installId` y sin `deviceId` antes de activation, y no lee dotenv del repo. Tambien se descargo el asset publicado a temp y el SHA256 remoto coincide con `4dd4670d3a2a46fa5a605718abaab8f1891b619a6e0f7345bf30b8043f69f74c`, sin instalar ni republish. Gotcha: no usar `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`/CDP en este smoke empaquetado; en este host hace fallar setup del WebView con `failed to receive message from webview`.
- 2026-06-29 smoke instalado local aprobado por JP: se descargo el asset publicado `Fixvox-Tauri-Setup.exe`, se verifico SHA256 `4dd4670d3a2a46fa5a605718abaab8f1891b619a6e0f7345bf30b8043f69f74c`, se instalo silenciosamente en carpeta aislada bajo `artifacts/release/installed-smoke/20260629-installed-release-smoke/install`, se activo un device Pro contra Fixvox Cloud con invite local sin imprimir IDs/codes (`activation-report.json`) y se ejecuto dictado E2E con el exe instalado, `APPDATA/LOCALAPPDATA` aislados, sin `.env`/BYOK/device env y `Ctrl+Shift+F9`: managed STT + postprocess + paste al target controlado paso con `targetTextLength=10`, clipboard restaurado y report redacted en `installed-dictation-report.json`. Durante el smoke se encontro que el redacted report local conservaba request IDs completos; se corrigio `redact_request_id` para siempre materializar `redacted-request-id`, se saneo el artifact local y se genero un nuevo installer local no publicado con SHA256 `1ecaa89a503bd1a93f4b894e6b2dc811357cfb53eaaebae71e3a309da968ea12`.
- 2026-06-29 UX hardening local: `src/settings/fixvox-cloud-control.ts` deriva health accionable para activation/policy/errors; `SettingsSurface` muestra badge/headline/next-step/capabilities, reduce `statePath` a `fixvox-device-state.json · host app data`, expone `Repair device link` host-owned y conserva `window.confirm` antes de operaciones cloud. Checks: `npm run test:pipeline -- tests/settings`, `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`, `npm run build`, `cd src-tauri && cargo fmt --check && cargo check`.
- 2026-06-29 auth/policy groups decision: JP decidio que el usuario que quiera mas que lo basico debe autenticarse por email/Google/GitHub usando Fixvox Cloud. Se documento `specs/015-fixvox-auth-policy-groups/`, `docs/DECISIONS.md` y este track. Modelo objetivo: anonymous basic -> login -> link device to user -> policy group/template -> capabilities/limits -> runtime/cloud enforcement.
- 2026-06-29 T009 provider-free contracts: `src/fixvox-auth/policy-groups.ts` define capabilities de producto, templates `basic-anonymous`, `translate-only`, `dictation-basic`, `pro`, `power-admin`, required-capability checks y serializacion redacted. Tests en `tests/settings/auth-policy-groups.test.ts` validan templates progresivos y fail-closed sin login real. Commits: `5881a02`, `f665b58`.
- 2026-06-29 T009 Settings UX provider-free: `SettingsSurface`/`fixvox-cloud-control` muestran signed-out anonymous/basic con `Sign in to unlock`, signed-in simulado con user redacted + group/template/capabilities/limits, y tests DOM cubren que no se filtren IDs/tokens/rutas personales. No hay login real ni llamadas OAuth/device-link.
- 2026-06-29 T010/T011 host-owned login start: se eligio device-code polling como primer mecanismo; `start_fixvox_cloud_login` prepara una URL externa redacted-safe, abre browser solo bajo click/confirmacion del usuario, devuelve flow/expiry/poll interval/state redacted y no persiste ni expone session secrets a React. Tests provider-free cubren comando/renderer y guardrails. No se hizo login real.
- 2026-06-29 T012/T013 auth session state provider-free: Rust persiste metadata pending en `fixvox-auth-session.v1.json` bajo app data y define campos host-owned para session/refresh secrets; comando `get_fixvox_auth_session_status` expone solo status/path/state/session/user redacted + `secretsPresent`. Settings lee ese status y no recibe secretos. Tests TS/Rust guardan que React no use storage ni nombres de secretos y que el status serializado no filtre material sensible.
- 2026-06-29 T014/T015/T016 provider-free link/policy refresh: el response de register/refresh ya puede traer `auth` + `limits`; Rust persiste `authPolicy` redacted en `fixvox-device-state.json` y `get_fixvox_cloud_status` lo expone a Settings con user redacted, group, policy template, product capabilities y limits. Settings ya usa ese `authPolicy` para mostrar signed-in group/template/capabilities/next step. No se hizo login/link real.
- 2026-06-29 T017/T018/T019/T020 runtime enforcement: `policy_allows_managed_operation` exige product capabilities por lane (`dictation+managed_stt`, `postprocess+managed_llm`, `translate+managed_llm`, `assistant_actions+managed_llm`, etc.). `read_managed_runtime_config` falla cerrado antes de STT/postprocess si falta capability y no cae a BYOK aunque exista `GROQ_API_KEY`. Tests Rust cubren translate-only deny de dictation, postprocess sin managed_llm y no leakage de secrets.
- 2026-06-30 post-OAuth host link contract: `poll_fixvox_cloud_login` persiste status signed-in redacted y, si no hay `authPolicy` signed-in local, llama host-owned `/desktop/login/link-device` con `state`, `installId` y device metadata para obtener register/policy response, persistir `fixvox-device-state.json` y refrescar Settings. Settings distingue `device link pending` vs `Fixvox policy active`, redakta `userRedacted` aun si un fixture trae ID crudo y `Link signed-in device` reintenta el polling/link en vez de usar register anonimo. Checks: `npm run test:pipeline`, `npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control`, `npm run build`, `cd src-tauri && cargo fmt --check && CARGO_TARGET_DIR=target/pi-auth-link cargo check`. Smoke real T021 inicial fallo redacted porque Cloud no tenia `link-device`; el primer parche se hizo en el repo legacy para desbloquear produccion, luego se consolido el Worker en `cloud/fixvox-proxy/`, se corto deploy desde este repo y T021/T022 pasaron post-cutover. Evidencia: T021 `artifacts/desktop-control/fixvox-login-link-smoke/20260630-T021-after-repo-cloud-deploy/report.json`; T022 Pro managed dictation `artifacts/desktop-control/dictation-e2e/20260630-T022-pro-managed-r2/report.json`; denied alpha-basic signed-in policy fail-closed `artifacts/desktop-control/policy-deny-smoke/20260630-T022-denied-policy-r2/report.json`. Para soportar denied signed-in por refresh se desplego Worker version `8218d344-adfc-467e-bd12-b4ad271e1826` y se actualizo Tauri para honrar `auth.capabilities: []` sin caer al legacy transport-policy allowlist.
- Infra release actual Fixvox: `C:/dev/infra/docs/runbooks/cloud-services.md` seccion `Fixvox — Releases / Auto-update`.
- Policy/control-plane canonico para Tauri: `cloud/fixvox-proxy/`, `specs/015-fixvox-auth-policy-groups/` y `specs/016-fixvox-cloud-consolidation/`.
- Installer checklist canonico para Tauri: este track + `npm run release:windows`; referencias Electrobun viejas son legacy/historia, no fuente operativa.
- Runtime cloud actual en este repo: `src-tauri/src/fixvox_cloud.rs`, `src-tauri/src/runtime_transcription.rs`, `src/host-runtime/readiness.ts`.
- Cloud Worker consolidado en este repo desde 2026-06-30: `cloud/fixvox-proxy/` contiene el source/config/tests operativos, incluyendo el endpoint `POST /desktop/login/link-device`. `npm run cloud:test` pasa (65/65). Cutover deploy desde este repo paso; version vigente tras T022 `8218d344-adfc-467e-bd12-b4ad271e1826`; futuros deploys siguen gated por aprobacion explicita.
- 2026-07-09 release local: `src-tauri/target/release/bundle/nsis/Fixvox Tauri_0.1.0_x64-setup.exe` regenerado con SHA256 `0b89ad995ecc238bc583b16018b325a64f1f86617145b6a4a31c215283a025ff`; pasaron 43 archivos/218 tests y completaron frontend, `cargo check` y bundle NSIS. Instalacion silenciosa exit `0`, registro HKCU y ejecutable `C:/Users/jpsal/AppData/Local/Fixvox Tauri/dictation-tauri.exe` version `0.1.0`; no hubo publish/deploy. Gotchas: un `InstallLocation` viejo del smoke aislado hizo que el primer `/S` reutilizara `artifacts/...`, corregido con `/S /D=%LOCALAPPDATA%\Fixvox Tauri`; `cargo fmt --check` detecto drift en `desktop_delivery.rs`, `native_capture.rs` y `runtime_transcription.rs`, pero `scripts/release-windows.ps1` no propago el fallo.
- 2026-07-11 FFmpeg sidecar y compresión corta: se fijó Gyan FFmpeg 7.1.1 Essentials GPLv3 (SHA256 exe `b90225987bdd042cca09a1efb5e34e9848f2d1dbf5fbcd388753a44145522997`), se incluyeron licencia/notices y aliases Tauri GNU/MSVC, y el runtime ahora prefiere el sidecar con `CREATE_NO_WINDOW`, fallback a `PATH` y fallback seguro a WAV. Smoke real instalado corto: `2,61 s`, WAV `501164 B` -> MP3 `16460 B`, compresión `107 ms`, upstream `331 ms`, `status=ok`, postprocess off y sin flash de consola.
- 2026-07-11 release publicado: source `main` en `bc9de656eb9e9b13fb395be4e0bcef5ee2c7c2aa`; prerelease `fixvox-tauri-v0.1.0-20260711195705` con `Fixvox-Tauri-Setup.exe` y checksum. SHA256 local, publicado y redescargado coinciden en `161a97a8d924d4f303fadd0337ca8829b8cfe9a75596f269560e30921eda2e16`. URL directa: `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260711195705/Fixvox-Tauri-Setup.exe`. No hubo deploy cloud; falta validación física en otra PC.
- 2026-07-17 release publicado: source `main` en `1c8a4f9d8ced1a3d8a1f5294ddfae15fef5ac8da`; prerelease `fixvox-tauri-v0.1.0-20260717122820` con installer unsigned y checksum. Gates verdes: pipeline 454/454, focused release 240/240, frontend, Rust fmt/check/test compile, Worker, Bun API unit/PostgreSQL/bootstrap/contracts y Admin Web. SHA256 local, publicado y redescargado coinciden en `3a388bdc17e82ff31bb74c467a7a1383896f97b6bc733fcc09ea8605269de02c`. URL directa: `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260717122820/Fixvox-Tauri-Setup.exe`. No hubo deploy cloud; falta smoke físico en otra PC.
- 2026-07-24 prewarm y release: `main` quedó pusheado en `3f0804e6e1cac40da6e3b3277f00b39bb7b5f83d` con cliente reqwest compartido y `/health` provider-free al iniciar captura. La prueba fría real bajó `1625→687 ms`; el health ocurrió `12.25 s` antes de STT. Build desde worktree limpio: 47 archivos/245 tests focales, frontend, Rust fmt/check/test compile y NSIS. Se reutilizó el `WebView2Loader.dll` x64 generado por el mismo lock, SHA-256 `8427b1fc…0f1c`, para satisfacer el resource previo a `cargo check`. Prerelease `fixvox-tauri-v0.1.0-20260724030810`: installer unsigned `29,553,376` bytes, SHA-256 local/publicado/redescargado `32738e2ef11a208e7c8d1d32047c00bf42df2fb947f35e7370cb4c79d53aefec`. URL directa: `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260724030810/Fixvox-Tauri-Setup.exe`. Queda pendiente instalar y validar en la otra PC.
