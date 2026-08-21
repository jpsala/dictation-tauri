---
id: fixvox-cloud-runtime-port
status: active
kind: decision-map
triggers:
  - Fixvox cloud
  - Fixbox backend
  - managed runtime
  - proxy compartido
  - reemplazar Bun por Rust
  - Rust Tauri port
  - cloud infrastructure
  - X-Device-Id
primary_refs:
  - docs/topics/backend-and-model-routing.md
  - docs/topics/source-project-map.md
  - docs/topics/fixvox-capability-map.md
  - specs/009-fixvox-cloud-runtime-port/plan.md
  - specs/016-fixvox-cloud-consolidation/plan.md
  - cloud/fixvox-proxy/src/index.ts
  - src-tauri/src/fixvox_cloud.rs
  - src-tauri/src/runtime_transcription.rs
---

# Fixvox Cloud Runtime Port

## Norte

Dictation Tauri debe reemplazar el runtime desktop hecho en el runtime desktop legacy de Fixvox por Rust/Tauri, usando Fixvox Cloud como control-plane canonico para device, activation, policy/preflight y managed runtime.

Decision 2026-06-27: este repo es el nuevo cliente desktop de Fixvox, no un producto cloud separado. La regla no es "copiar codigo Fixvox" ni "evitar Fixvox". La regla es:

- adoptar lo que ya funciona en Fixvox como producto/runtime;
- redisenar la frontera desktop en Rust/Tauri;
- usar contratos cloud estables en vez de acoplarse a internals Bun;
- hacer algo distinto solo cuando Tauri/Rust, packaging, seguridad o simplicidad lo justifiquen;
- mantener un canal de release Tauri separado mientras el cliente Fixvox legacy/Electrobun pueda seguir usando sus artifacts.

## Hallazgo Actual

Fixvox ya tiene una frontera managed funcional:

```text
Desktop Fixvox -> Fixvox Worker -> Groq
```

Para Dictation Tauri, la ruta deseada es:

```text
Dictation Tauri -> Rust/Tauri host -> auth-fixvox.jpsala.dev -> Fixvox API VPS -> PostgreSQL/policy
```

La autoridad canónica observada el 2026-08-21 es `auth-fixvox.jpsala.dev`
servida por `fixvox-api` en el VPS mediante Tunnel; no es el Worker
`fixvox-proxy`. `fixvox-proxy.jpsala.workers.dev` sigue siendo un endpoint
separado del Worker. Un `wrangler deploy` puede subir el Worker sin actualizar
el custom domain si Cloudflare rechaza la actualización del trigger; verificar
siempre el servicio declarado por `/health` antes de atribuir una ruta al
Worker.

El cliente Tauri usa readiness/bootstrap product y tiene timeout de conexión de
5 s y request de 10 s. El 2026-08-21 el API VPS quedó activo pero con
`/ready` y algunos bootstraps bloqueados; un reinicio controlado de
`fixvox-api.service` restauró `/health` y `/ready` a 200 y bootstrap a 200 en
59 ms. Este es un incidente operativo, no una señal suficiente para cambiar el
backend o hacer fallback silencioso.

Endpoints vivos verificados el 2026-08-21:

- `auth-fixvox.jpsala.dev/health` -> `fixvox-api`, 200.
- `auth-fixvox.jpsala.dev/ready` -> `database`, `schema`, `jobs` y
  `authorityMode=cloudflare-authority` verdaderos, 200.
- `fixvox-proxy.jpsala.workers.dev/health` -> Worker `fixvox-proxy`, 200.

`https://fixvox-api.jpsala.dev` continúa siendo stale/no confiable y no debe
ser default. No confundir el estado del Worker con el estado del API canónico.

## Contratos Cloud Relevantes

### Desktop readiness/auth

- `POST /product/v1/desktop/bootstrap` recibe `{installId, device:
  {platform: "windows", appVersion}}` y devuelve `{ok, data.binding,
  data.context}`. `data.context.profile.key` y las capacidades son necesarias
  para que Tauri construya su estado de policy.
- El cliente trata indisponibilidad con timeout y muestra Setup recuperable;
  no debe permanecer en `Comprobando tu sesión…`.
- El cierre de la ventana `account-setup` es host-owned mediante el comando
  Tauri `close_account_setup_window`; no depender de
  `getCurrentWindow().close()` desde WebView2.

### Device/control-plane

- `POST /v2/device/register`
- `POST /v2/device/activate`
- `POST /v2/execution/preflight`
- `POST /v1/usage/prewarm`

`/v2/device/register` acepta al menos:

- `installId`
- `deviceId` nullable
- `version`
- `platform`
- `arch`
- `hostname`
- `ts`

Devuelve al menos:

- `ok`
- `deviceId`
- `activated`
- `policyId`
- `policyLabel`
- `auth.required`
- `auth.providers`
- `features`
- `defaults`
- `limits`
- `telemetry`
- `transportPolicy`

Verificacion de estudio: un registro throwaway devolvio `activated: true`, `policyId: alpha-basic`, `auth.required: false`, `defaults`, `limits` y `transportPolicy`.

### Managed inference

- `POST /v1/audio/transcriptions`
- `POST /v1/chat/completions`

Requiere header:

```text
X-Device-Id: <device-id>
```

No requiere que el desktop envie API key de Groq. El Worker posee `GROQ_API_KEY` server-side. Para cambios de endpoints/policy nuevos, editar `cloud/fixvox-proxy/` en este repo; no usar `C:/dev/fixvox/proxy` salvo investigacion legacy explicita.

Para speech, el body es multipart OpenAI-compatible:

- `file`
- `model`
- `language` opcional
- `prompt` opcional
- `response_format` opcional (`verbose_json` en Fixvox)
- `timestamp_granularities[]` opcional
- `temperature` opcional

### Telemetry y headers utiles

Cliente desktop debe enviar `User-Agent: fixvox-tauri/<version>` en llamadas a Fixvox Cloud. Smoke real 2026-06-28 mostro que Cloudflare puede devolver `403 error code: 1010` a requests sin User-Agent aunque el invite code sea valido; con User-Agent estable, `/v2/device/activate` y `/v2/device/register` devolvieron policy `pro` correctamente.

El proxy devuelve headers que Dictation Tauri deberia conservar en `HostTranscriptionResponse`/reports redacted:

- `X-Fixvox-Request-Id`
- `X-Provider-Request-Id`
- `X-Fixvox-Cost-Usd`
- `X-Fixvox-Pricing-Source`
- `X-Fixvox-Limit`
- `X-Fixvox-Remaining`
- `X-Fixvox-Reset-At`
- `X-Fixvox-Usage-Key`
- `X-Fixvox-Proxy-Parse-Ms`
- `X-Fixvox-Proxy-Usage-Ms`
- `X-Fixvox-Proxy-Upstream-Ms`
- `X-Fixvox-Proxy-Engine-Binding-Ms`
- `X-Fixvox-Proxy-Budget-Ms`
- `X-Fixvox-Proxy-Init-Ms`
- `X-Fixvox-Proxy-Total-Ms`
- `Server-Timing`

`X-Fixvox-Proxy-Init-Ms` es un nombre legacy: mide acumulado desde el inicio de la request hasta después del upstream, no sólo cold start. Para diagnóstico nuevo usar `engine_binding`, `budget`, `parse`, `usage`, `upstream` y `total`.

## Update 2026-07-21: Hot Path De Audio

- Evidencia real previa al cambio local: proxy total `4401 ms`, upstream Groq `625 ms`, compresión host `164 ms` y postproceso apagado. El overhead no explicado dentro del Worker era aproximadamente `3776 ms`.
- La regresión probable entró con `bc9de65`, que agregó resolución de profile/engine/prompt y budget al hot path de `/v1/audio/transcriptions`; Fixvox de referencia conserva una ruta más directa.
- Optimización local, todavía sin deploy: una sola resolución reusable por request, eliminación de dos reconstrucciones completas de Control Room config, lecturas KV independientes en paralelo, una sola lectura del variants store por config y timings explícitos `engineBindingMs`/`budgetMs` preservados por Rust en reports redacted.
- El test de hot path limita la request de audio a 18 lecturas KV y exige concurrencia de lecturas, manteniendo binding de profile/engine/prompt y bloqueo `402` por budget.
- Gate arquitectónico pendiente: si `budgetMs` sigue dominando tras validar la build desplegada, reemplazar `listRequestEvents()` por un ledger de gasto O(1) y concurrency-safe, preferentemente Durable Object. No relajar budgets ni desplegar sin gate separado.

## Soporte Actual Del Managed Proxy

Actualmente managed proxy cubre:

- Groq speech/STT.
- Groq chat/LLM.

No cubre como lane managed estable:

- OpenAI speech.
- Anthropic/OpenAI/OpenRouter/xAI/Cerebras LLM.
- Model discovery vendor-side en managed mode.

Por eso Dictation Tauri debe tratar managed como `Groq-only` hasta que el Worker expanda soporte.

## Decision De Producto/Tecnica

Decision 2026-06-29: Fixvox Tauri evoluciona de invite/device activation hacia **login cloud para todo lo que supere el modo basico**. El modo anonimo conserva `installId` y una experiencia limitada/onboarding; dictado managed, postprocess, transforms, assistant actions, advanced settings, debug y limites de producto deben venir de un usuario autenticado con policy de Fixvox Cloud. Auth objetivo: email magic link, Google OAuth y GitHub OAuth. Invites quedan para beta/grants manuales.

Modelo conceptual:

```text
User
  -> Org/Workspace opcional
    -> Group/Membership
      -> Policy Template
        -> Capabilities + Limits
Device
  -> installId anonimo
  -> linked to User after login
  -> policy snapshot host-owned/redacted
```

Capabilities iniciales de producto: `translate`, `dictation`, `postprocess`, `selection_transform`, `assistant_actions`, `custom_prompts`, `advanced_settings`, `debug_tools`, `managed_stt`, `managed_llm`. La UI solo refleja; Cloud y Rust/Tauri deben validar y fallar cerrado.

1. El camino principal pasa a ser Fixvox managed cloud para STT/postprocess cuando haya backend configurado.
2. El camino directo Groq local queda como BYOK/dev fallback explicito, no como default silencioso.
3. React no recibe secretos ni decide transporte real.
4. Rust/Tauri posee:
   - device registration local;
   - lectura/escritura de device id;
   - preflight;
   - multipart upload;
   - redaccion de errores;
   - artifact/report policy;
   - futuro delivery desktop.
5. Se puede tomar de Fixvox todo lo que sirva: contratos, prompts, runtime states, proxy headers, policy model, telemetry, VAD/no-speech heuristics, postprocess prompts, voice routing y recovery behavior.
6. Se reimplementa distinto cuando convenga por Tauri/Rust: side effects desktop, packaging, hotkeys, tray, clipboard/focus/paste, seguridad y lifecycle.

## Riesgos Y Guardrails

- Audio y transcript pasan por cloud si managed esta activo; debe ser explicito en UI/docs antes de convertirlo en default de producto.
- No imprimir ni commitear device ids sensibles, `.env`, provider payloads, audio real, transcripts reales ni reports con contenido sensible.
- No acoplar Dictation Tauri a archivos internos legacy Fixvox desktop internals; acoplar solo a contratos HTTP documentados o a specs propias.
- Managed mode debe fallar cerrado: si falta device id, preflight o lane proxied, no debe caer silenciosamente a Groq directo.
- BYOK/direct debe existir como modo avanzado/dev separado.
- No prometer delivery observado hasta implementar evidencia real de paste/target.

## Persistencia Inicial De Device State

Para el primer slice de `009` T008, Rust/Tauri persiste un JSON minimo fuera de React en una ruta de app data resuelta desde el host:

```text
<APPDATA|LOCALAPPDATA|XDG_DATA_HOME|HOME>/dictation-tauri/fixvox-device-state.json
```

Formato: `installId`, `deviceId`, ultimo resultado de registro (`lastRegisterOk` o error redactado), `policyId`, `policyLabel` y snapshot `transportPolicy` suficiente para readiness. No es una base de historial ni fuente de transcripts/audio. No usar React `localStorage`, logs, caches, SQLite ni Tauri store plugin para este slice salvo decision posterior.

## Camino De Implementacion

La spec guia historica es `specs/009-fixvox-cloud-runtime-port/`. La track viva para el nuevo goal instalable/cloud es `docs/tracks/fixvox-tauri-cloud-release.md`. La evolucion de login, grupos y capabilities administrables vive en `specs/015-fixvox-auth-policy-groups/`.

Orden recomendado:

1. Documentar contrato y tests de adapter sin llamadas reales.
2. Agregar `CloudRuntimeConfig` en Rust con base URL configurable y default seguro.
3. Registrar device desde Rust/Tauri y persistir `deviceId` localmente.
4. Agregar readiness que distinga `managedConfigured`, `deviceRegistered`, `directConfigured` y `unavailable`.
5. Implementar proxied STT multipart con `X-Device-Id` y sin bearer vendor.
6. Parsear headers Fixvox en response/report.
7. Agregar preflight antes de provider real managed.
8. Hacer smoke manual gated con audio ignorado.
9. Sumar postprocess cloud y delivery/hotkey.
10. Runtime effective parity cerrado para dictado normal: resolver provider/model/prompt/postprocess desde la misma policy/cache efectiva que Fixvox; no hardcodear postprocess en React ni defaults Rust si hay policy valida.
11. Crear installer Windows local reproducible con identidad `Fixvox Tauri`, app id separado `dev.jpsala.fixvox-tauri` y bundle NSIS local bajo `src-tauri/target/release/bundle/nsis/`.
12. Completar activation/policy snapshot como cliente Fixvox Tauri.
13. Publicar artifact separado para Tauri en el release repo de Fixvox solo con aprobacion explicita; no pisar el canal/update artifacts Fixvox legacy/Electrobun.

## Invariante De Preflight Ante Presion De KV

Diagnostico live read-only 2026-07-14: un dictado fallo antes del provider porque
`evaluateExecutionPreflight` intento persistir el evento de cuota y Cloudflare KV
respondio `KV put() limit exceeded for the day.`. La excepcion sin capturar produjo
`500 text/plain`, que el cliente presento como contrato de preflight invalido. No
hubo llamada STT.

Reglas durables:

- El profile `pro-unlimited` no debe escribir un evento de cuota por preflight;
  sus limites practicamente ilimitados no justifican consumir writes KV.
- Una falla inesperada de storage durante preflight debe responder JSON fail-closed
  (`503`, `reason=service_unavailable`), nunca una excepcion `text/plain`.
- Los profiles con cuota real conservan tracking y denial; no generalizar el
  bypass a tiers limitados.
- Verificar con tests Worker y `wrangler deploy --dry-run`; deploy y smoke live
  requieren autorizacion explicita.

Fix local preparado, todavia no desplegado al documentar esta regla:
`cloud/fixvox-proxy/src/control-plane-store.ts` y
`cloud/fixvox-proxy/src/index.ts`.
