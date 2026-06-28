---
status: active
started: 2026-06-27
updated: 2026-06-28
priority: high
owner: JP
related:
  - docs/topics/fixvox-cloud-runtime-port.md
  - docs/topics/backend-and-model-routing.md
  - specs/009-fixvox-cloud-runtime-port/tasks.md
  - C:/dev/infra/docs/runbooks/cloud-services.md
  - C:/dev/fixvox/.specify/specs/003-settings-policy-control-plane/spec.md
  - C:/dev/fixvox/.specify/specs/007-windows-release-installer/spec.md
topic: fixvox-cloud-runtime-port
source_refs:
  - C:/dev/fixvox/proxy/src/index.ts
  - C:/dev/fixvox/src/app/backend/control-plane.ts
  - C:/dev/fixvox/src/app/backend/managed-proxy.ts
  - C:/dev/fixvox/scripts/publish-windows-release.ps1
  - C:/dev/infra/docs/runbooks/cloud-services.md
---

# Fixvox Tauri Cloud Client + Release

## Objetivo

Llegar lo antes posible a un Fixvox Tauri instalable en otra PC, activable contra Fixvox Cloud y capaz de dictar usando managed transcription/policies sin depender de `.env` local ni de Groq BYOK en la maquina destino.

Decision de producto 2026-06-27: Dictation Tauri es el nuevo cliente desktop de Fixvox. Fixvox Cloud (`auth-fixvox.jpsala.dev`) es el control-plane canonico para device, activation, policy/preflight y managed runtime. No crear otro cloud/tenant salvo decision explicita posterior.

## Estado Actual

- Local/dev ya funciona con Tauri/Rust, dock, tray/hotkeys, Settings y managed transcription parcial.
- Installer Windows local inicial ya genera NSIS unsigned como `Fixvox Tauri_0.1.0_x64-setup.exe` bajo `src-tauri/target/release/bundle/nsis/` con `npm run release:windows`.
- Ruta cloud actual en este repo usa `src-tauri/src/fixvox_cloud.rs` y `src-tauri/src/runtime_transcription.rs` para readiness, preflight y managed STT cuando existen `FIXVOX_INSTALL_ID` + `FIXVOX_DEVICE_ID`.
- BYOK/direct Groq sigue siendo fallback/dev, no norte de producto.
- Fixvox canonico ya tiene control-plane/policies completos; infra documenta release artifacts en `jpsala/fixvox-releases`.
- Cuidado: no pisar el canal/update artifacts del cliente Fixvox viejo sin plan de migracion.

## Proximo Paso

Bootstrap inicial completado: installer local reproducible + release channel separado documentado para Tauri. Device identity/status host-owned y Settings activation estan implementados. Smoke real autorizado por JP diagnostico Cloudflare 1010 sin User-Agent; con `fixvox-tauri/<version>` el device local quedo Pro. Siguiente: T005 policy snapshot/capabilities y luego T006 managed transcription sin BYOK en PC nueva.

## Release Bootstrap Inicial

- Identidad instalable: `Fixvox Tauri` con app identifier separado `dev.jpsala.fixvox-tauri`.
- Canal/asset inicial local: NSIS Windows x64 generado bajo `src-tauri/target/release/bundle/nsis/` por `npm run release:windows`.
- Nombre esperado de artefacto local Tauri: `Fixvox Tauri_<version>_x64-setup.exe`; si se publica mas adelante, renombrar/subir como canal separado, por ejemplo `fixvox-tauri-win-x64` o `Fixvox-Tauri-Setup.exe`, sin pisar artifacts legacy/Electrobun.
- Guardrail: este batch solo genera artefactos locales unsigned; publicar/subir release, tocar secrets o usar invite codes reales requiere aprobacion explicita.

## Incidencias / Gotchas Activos

### Settings window blanca recurrente

- Estado: open / requiere investigacion.
- Sintoma observado por JP: la ventana `Dictation Tauri Settings` queda totalmente blanca en algunos ciclos de abrir/cerrar Settings y/o luego de intentar activation cloud. Capturas locales: `pi-clipboard-805fbc54-be34-4e2e-bd24-4474fbc332e6.png`, `pi-clipboard-b8f9fde0-0a1a-4c20-8d54-e2910dee4070.png`.
- Contexto: en browser/Vite `http://127.0.0.1:1420/?surface=settings` renderiza correctamente; el blanco parece especifico del WebView Tauri/settings window o de una instancia oculta/stale.
- Mitigacion ya probada: `src-tauri/src/settings_window.rs` primero forzo `window.navigate(.../index.html?surface=settings)` antes de `show()`, pero JP reporto recurrencia. Siguiente mitigacion aplicada 2026-06-28: quitar la ventana `settings` preconfigurada de `tauri.conf.json` y crear Settings on-demand como WebView visible/fresca; el cierre ahora destruye la ventana en vez de ocultarla para evitar instancias stale.
- Proximo debug recomendado: capturar consola/runtime del WebView Settings, registrar URL efectiva antes/despues de navigate, considerar destruir/recrear la ventana Settings al abrir si la WebView queda en blanco, y agregar una action/command de `reload_settings_window` o fallback visible.
- Workaround operativo actual: reiniciar la app con `npm run tauri:dev:hidden -- -StopExisting`; si persiste, cerrar la ventana blanca y reabrir Settings desde tray/dock.

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

- Estado: pending
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

- Estado: pending
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

### T007 — Publicar release artifact descargable

- Estado: pending
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
- Infra release actual Fixvox: `C:/dev/infra/docs/runbooks/cloud-services.md` seccion `Fixvox — Releases / Auto-update`.
- Policy/control-plane canonico: `C:/dev/fixvox/.specify/specs/003-settings-policy-control-plane/spec.md`.
- Installer checklist canonico: `C:/dev/fixvox/.specify/specs/007-windows-release-installer/spec.md`.
- Runtime cloud actual en este repo: `src-tauri/src/fixvox_cloud.rs`, `src-tauri/src/runtime_transcription.rs`, `src/host-runtime/readiness.ts`.
