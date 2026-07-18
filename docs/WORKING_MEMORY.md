# Working Memory

Router operativo corto; detalle durable vive en topics, decisions, specs o tracks.

Última actualización: 2026-07-18.

## Lectura Rápida

| Área | Abrir |
| --- | --- |
| Producto/MVP | `docs/topics/product-direction.md` |
| Desktop/dock/selection | `docs/topics/dictation-tauri-foundation.md`, `docs/topics/fixvox-dock-and-hotkeys-reference.md`, `docs/topics/selection-and-assistant-actions.md` |
| Fixvox Cloud/runtime | `docs/tracks/fixvox-self-hosted-checkpoint-d-closure-plan.md`, `specs/019-fixvox-self-hosted-control-plane/`, `docs/topics/fixvox-cloud-runtime-port.md` |
| Admin web + Pi Chat | `docs/tracks/fixvox-admin-web-pi-chat.md` |
| Settings/UI | `docs/tracks/settings-window-and-ui-foundation.md`, `docs/topics/ui-design-and-impeccable.md` |
| Usuarios/Pi prod/AOS | `docs/tracks/fixvox-registered-users-opportunities.md`, `docs/tracks/pi-prod-workspace.md`, `docs/topics/agentic-os.md` |
| Assistant/Lulu | `docs/topics/fixvox-assistant-lulu-reference.md`, `docs/tracks/fixvox-lulu-assistant-parity-refactor.md` |

## Estado Vivo

- Dictation Tauri y Control Room definen el producto canónico. Fixvox Cloud/Worker sigue siendo la autoridad operativa temporal y rollback, no la arquitectura objetivo. Worker vive en `cloud/fixvox-proxy/`; secrets/admin env fuera del repo; `C:/dev/fixvox` queda legacy/reference.
- Admin/cloud operativo. Worker activo `df416730-61b8-4222-ab5f-282879251db9` desde el 2026-07-18; health público 200/OK. Admin VPS healthz OK; Pi Chat volvió al sidebar (`36daed2`), corrigió narrow overflow (`e7c59eb`) y dejó de mostrar prompt/contexto user como respuesta del agente (`b96363e`). El bridge filtra role assistant y espera `agent_settled`; proceso runaway inicial detenido, sin child residual. Tests Admin 15/15, smoke y Browser productivo verdes; backup `20260718-011852.tar.gz`. No mutar prod sin permiso.
- Presets activos: `como-yo-es`, `corregir-texto`, `fix-writing`, `like-me-en`. Semántica cerrada: dictado normal sigue postprocess de policy; preset/selection lo reemplazan y hacen una sola transformación. Chat managed envía engine kind y Cloud gobierna provider/model; safety postprocess queda inmutable. Detalle: `docs/topics/backend-and-model-routing.md`.
- Alt+Q usa picker `380×320`: selección = transform one-off y deja el preset inactivo; sin selección = preset persistente y removible desde el badge `×`. Main hidrata el store host-owned antes de ejecutar/transcribir. Smoke: `artifacts/desktop-control/preset-picker-smoke/20260713/` y regresión selection one-off: `artifacts/desktop-control/selection-browser-smoke/20260714-user-altq-oneoff-clears-active-r3/`.
- Settings prefs afectan runtime: dock startup hidden, press-enter-after-paste, review-before-delivery, auto-stop/mute/cues. Action hotkeys tienen recorder/persistencia y smoke físico versionado. Presets se gatean por capabilities y ya no muestran provider/model local como routing efectivo; `admin_settings` habilita una entrada Control Room host-owned solo para power-admin.
- Control Room se abre desde Settings en el navegador autenticado porque la WebView Tauri externa falló; la app nunca recibe credenciales Admin. La cuenta existente se enlaza a Google por `sub` hasheado server-side, sin duplicar accounts ni enviar el `sub` al browser, y ahora resuelve el profile custom `JP` por Account override. Detalle: `docs/tracks/settings-window-and-ui-foundation.md`.
- Admin Configuration hub está desplegado: Profiles/Engines/Prompts/Presets separados y Groups como targeting visible. Overrides quedó oculto; sus datos legacy siguen intactos y read-only. Worker activo: 153 / `27d27754-069a-4a5f-bcd4-348d1f5b13b8`; evidencia histórica en `docs/tracks/fixvox-admin-configuration-hub.md`.
- Profile Composer Phases 1-3: Worker/DO y Admin Web desplegados bajo gates E/D1/P el 2026-07-14. La versión histórica Worker 153 (`27d27754-069a-4a5f-bcd4-348d1f5b13b8`) introdujo view/edit/publish y el fix de resolución de cuotas publicadas; la versión activa es `df416730-61b8-4222-ab5f-282879251db9`. Legacy sigue ausente. D1 bootstrappeó el DO y materializó las tres proyecciones KV schema v1 con authority revision compartida. Tras autorización explícita de `PUBLISH pro v2`, Browser/Admin Web -> Worker -> DO promovió `pro` a published v2: sin draft, historia 2, audit publish exitoso v1 -> v2 y Chrome muestra `Pro · Published v2 · 9 funciones`; no hubo rollback. Cierre read-only confirmó Profiles/Audit/Accounts/Devices 200 y marker/proyecciones schema v1 con misma authority revision. Tras autorización explícita posterior, `jp` fue publicado como v1 sin capability `postprocess`, con audit publish único; la única account administrativa y su device activo resuelven ahora `jp`. `pro` conserva v2 y sus 6 devices asignados. Ocho transcripciones `pro` posteriores son tráfico runtime normal, no llamadas del publish. En producción edit/publish permanecen sólo server-side detrás de OAuth Google reciente + RBAC + preview/confirmación/audit; fallback es view-only. Ajuste desplegado y validado interactivamente: sesión Google verificada + rol basta para draft/preview/lecturas; OAuth reciente sigue obligatoria para publish/rollback y cambios de roles. Health y hash remoto verificados. Diagnóstico posterior: el preflight/listado de Devices no aplicaba `limits.quotaProfile` de profiles publicados custom (`jp`), caía al fallback 20/120 y bloqueó el dictado aunque `jp` declara `pro-unlimited`. El fix centraliza la policy publicada también para limits/preflight; la versión activa además evita writes de eventos de cuota para `pro-unlimited` y responde JSON `503` ante fallos inesperados de storage. Focused checks, cloud 143/143 y Wrangler dry-run pasaron. Health activo respondió 200 y el smoke managed real del 2026-07-15 completó una transcripción con provider request, sin postprocess ni payload raw persistido en el reporte redacted. Evidencia histórica: `C:/Users/jpsal/fixvox-rollout-evidence/20260714-profile-composer-post-publish-close/`; evidencia nueva ignorada bajo `artifacts/microphone-capture/reports/`. Detalle: `docs/tracks/profile-composer-cloudflare-rollout-plan.md`.
- Result history queda limitado a 50 entradas y 256 KiB, con eviction oldest-first y `Clear history` visible; contrato en `docs/topics/privacy-and-dictation-data.md`.
- Selection transform pasó smokes redacted; replace sigue side effect real y debe fallar cerrado.
- Delivery fija el target al detener; follow-focus es opt-in. Hace focus → snapshot → paste → restore; preserva texto/DIB y formatos custom clonables como bytes `HGLOBAL`, acepta metadata bitmap conocida con DIB y falla cerrado solo ante formatos no clonables. Smokes A→B + restore pasaron; el hardening de custom clonables corrigió la regresión de `Clipboard contains unsupported data` observada en dogfood.
- Spec `018-fixvox-audio-runtime-parity` completa: VAD/no-speech local, auto-stop, long-audio optimization/fallback, mute/cues, telemetry redacted, docs y audit/context-index.
- Spec `019-fixvox-self-hosted-control-plane`: Checkpoints A-C (T001-T021) completos provider-free/local; PostgreSQL 18 `fixvox_test`, schema v4 y repositorios base siguen verdes. Checkpoint D sigue incompleto. JP eligió **producto primero**: los 73 fixtures HTTP/72 rutas únicas + 1 scheduled son evidencia histórica, no contrato objetivo; API, Bun, Tauri y Admin pueden migrar coordinadamente. D-R1/Batch 1 del plan product-first quedó completo docs-only en `contracts/product-route-disposition.md`: 1 `canonical`, 9 `redesign`, 39 `temporary-compat`, 24 `drop`; ocho URLs Tauri, downstreams `proxyAdmin(...)`, ambos `/desktop/login` y scheduled boundary reconciliados. Mantener privacidad/redacción, auth fail-closed, cuota autoritativa inmediatamente antes de una única llamada provider, audit y cero persistencia raw. Cada alias tiene consumidor/reemplazo/retiro; Discord/Telegram, Admin embebido, benchmark, recipe-policy legacy y fetch APIs internas quedan fuera. Próximo: D-R2/Batch 2, contratos tipados `product-api.md` y `temporary-aliases.md`; no implementar runtime ni avanzar a E. Plan canónico: `docs/tracks/fixvox-product-first-self-hosted-contract-plan.md`; el closure plan anterior queda superseded como evidencia histórica. Cloudflare sigue authority y no hubo VPS, provider real, producción, deploy, import ni secreto.
- Spike automático re-scopeado sin ejecución: el V1 `dictation-bounded-implementation-spike` conserva su run fail-closed y FlowIR R2 bloqueado como evidencia histórica. El nuevo `dictation-bounded-plan-implement-spike` está `prepared-not-run`: planner read-only → writer único de `tests/cloud-contract/product-route-disposition.test.ts` → contract tests/scope hash → gate con una reparación → receipt; FlowIR `ir:22e51921382eaa06db7a9dfa9a7b70aa9e63031e3473363bfae83da950664b20`, verify/compile PASS, 0 errores y warning fail-closed intencional. Su futura ejecución requiere aprobación explícita separada del autonomy contract V2. `/flow` continúa como helper de recomendación/prompt revisable. Detalle: `docs/tracks/bounded-taskflow-implementation-spike.md`.
- Usage/quota Admin B0-B4 cerró local/provider-free. B0: `USAGE_COUNTERS` conserva siete contadores diarios sanitizados por device implícito, sin writes KV ni cambio de respuesta y fail-open vía `waitUntil`; implementación Green pero observación Lean Loop Red por el dry-run con descarga temporal no autorizada que JP aceptó. B1-B4: endpoint `/admin/usage/summary` extendido aditivamente con proyección bounded/redacted por account/device (STT, LLM, failures, prewarm y remaining quota), UI Admin con estados empty/unavailable/blocked y tests Green; no agrega writers/providers. B5 smoke real sigue gated. Receipts en `docs/tracks/fixvox-registered-users-opportunities.md`.
- Installer Windows unsigned `0.1.0` publicado como prerelease `fixvox-tauri-v0.1.0-20260718000133` desde source producto `9274577a7fa2e6d0bba52ac5492a65b0dccd1a44`; assets canónicos `Fixvox-Tauri-Setup.exe` + checksum verificados por redescarga con SHA256 `8f6ecbb1453eda2856b5ee254a853cc9dc91ed3a270ec999cb3ed3a2937754c8`. Upgrade local y smoke account-first instalado pasaron; falta smoke físico en otra PC.
- Lulu es prefijo dentro de captura, no wake word. Flujo seguro `AssistantIntentResult` -> `AssistantSurface` -> `PipelineUiResult`; Smart Agent mínimo de presets existe, sin tool loop rico.

## Guardrails

Fuentes: `C:/dev/copicu` para Tauri/UI/settings/Windows desktop; `C:/dev/fixvox` para comportamientos Fixvox-like antes de cerrar features. Login requerido sobre básico; policy/capabilities fallan cerrado antes de provider. Runtime normal: audio prep, STT, postprocess, policy, materialización y evidencia redacted. Delivery no promete `paste_observed` sin observer verificado. Side effects locales controlados permitidos; deploy/push/login/cuentas/Alt+Space/selección real/replace-selection/observer requieren aprobación o spec/task explícita. UI durable requiere `PRODUCT.md` + `DESIGN.md`; admin/web importante usa screenshot real + Impeccable/product-register. Usar app Tauri real para dock/tray/hotkeys/delivery/companion/Settings.

Preferencia de routing JP 2026-07-14: investigaciones, explicaciones y auditorias acotadas se hacen manualmente por etapas con `read`/`rg`/`bash` y checks; no iniciar ni reanudar Taskflow salvo opt-in explicito de JP. Excepción acotada 2026-07-15: preparar, sin ejecutar, el spike `dictation-bounded-implementation-spike`; su ejecución requiere la aprobación única definida en el track.

## Riesgos

- Incidente live 2026-07-14 resuelto el 2026-07-15: Cloudflare KV agotó el límite diario de `put` y preflight devolvía `500 text/plain` antes del STT. La versión activa evita el write para `pro-unlimited`, responde JSON `503` ante otros fallos inesperados, conserva health 200 y pasó smoke managed real con provider request.
- No imprimir secretos ni commitear `.env`, tokens, raw transcripts, audio sensible, build artifacts o caches.
- No production mutations/deploy/push/publicación sin confirmación explícita.
- No convertir ruta caliente en transcript.
- Selection capture/replace debe fallar cerrado.
- Release gate Rust corta por exit code. `cargo fmt --check`, `cargo check`, `cargo test --lib` (90 passed, 1 ignored) y `cargo test --no-run` pasaron; se usó target aislado por un lock transitorio.
- CSP explícita sin cloud desde renderer; config/build/check/debug build pasan. Smoke inconcluso: debug y release control fallan igual sin `main WebView loaded`; no se atribuye a CSP. Evidencia en `artifacts/startup-smoke/20260713-csp-{runtime,control}/`.
- `cargo check` puede requerir `WebView2Loader.dll` en `src-tauri/target/release`; no cambiar installer config sin revisar release path.
- Si `tauri:dev:hidden` falla, revisar `stopWarnings` y `artifacts/live-app/<runId>/tauri-dev.log`.

## Comandos Útiles

```powershell
npm run check
npm run build
npm run test:pipeline
npm run cloud:test
cd src-tauri && cargo check
bun scripts/context-index.ts && bun scripts/agent-context-audit.ts
npm run tauri:dev:hidden -- -StopExisting
```

Smokes físicos/live requieren confirmación: hotkeys, audio mute/cues, auto-stop, Alt+Space/selection real, provider/live paste.

## Foco Único De Ejecución

- **Plan:** `docs/tracks/pi-chat-remote-agent-parity.md`.
- **Decisión:** JP eligió **Agente remoto total** para Pi Chat. Paridad funcional multi-repo/infra, no ejecución irrestricta como `jpsal` ni herencia de secrets/SSH/Chrome local.
- **Estado:** sandbox VPS activo con `PI_CHAT_REMOTE_AGENT_ENABLED=1` después de cierre RBAC y OAuth owner explícitamente autorizado. Owner health 200; prompt owner serial y `constelaciones_future_appointments` terminaron con `agent_settled`; token legacy/viewer/editor 403. Confirms son session-bound + operation hash + TTL 65 s + one-time + OAuth reciente; tests de forged/stale/reused/cross-session verdes. Stop libera lock. Brokers aislados activos, turnos en timezone `America/Argentina/Buenos_Aires`, cero smoke files residuales. Backup Admin final `20260718-024234.tar.gz`.
- **Próximo batch/corte:** Batch 3 rollout/sync durable `DONE`: source `5400a16`, run `20260718-025551`, bundle hash OK, mirrors clean dictation `5400a16`/Constelaciones `02a4b1e`, backup+rollback preservados, services/sockets/isolation/health PASS y feature `1`. Siguiente recomendado: grep/find/ls read-only sobre broker, sin credenciales nuevas. Después, gates separados para git/deploy y relay Chrome. No conceder Docker/sudo/SSH ni homes/stores.
- **Perfil recomendado:** **Arquitecto/Implementador**, manual staged, un owner y security review antes del rollout.
- **Gate:** crear usuario/permisos, tocar systemd, provisionar provider credential, ejecutar Pi real, desplegar o exponer browser local requieren rollout separado con backup/rollback. Stop si el child sigue como `jpsal`, ve secrets o muta antes de approval.
