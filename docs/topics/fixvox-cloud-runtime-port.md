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
  - C:/dev/fixvox/proxy/src/index.ts
  - C:/dev/fixvox/src/app/backend/speech-to-text.ts
  - C:/dev/fixvox/src/app/backend/managed-proxy.ts
  - C:/dev/fixvox/src/app/backend/control-plane.ts
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
Dictation Tauri -> Rust/Tauri host -> Fixvox Worker -> Groq
```

Estado corregido 2026-06-29: Dictation Tauri ya tiene camino managed cloud en Rust/Tauri para STT y chat postprocess, y mantiene Groq directo como BYOK/dev fallback explicito. El gap de **runtime efectivo** tambien quedo cerrado para dictado normal: Tauri resuelve provider/model/prompt/postprocess desde policy/cache/runtimePolicy host-owned, usa `whisper-large-v3-turbo` para policy Pro efectiva, respeta postprocess disabled cuando Fixvox lo saltea, aplica preflight cache/prewarm + soft-timeout in-flight, VAD/no-speech y MP3 para audios largos.

El camino directo sigue siendo util como BYOK/dev fallback, pero no debe ser default silencioso ni fuente de verdad si queremos compartir infraestructura, costos, policy y telemetria con Fixvox.

## Infraestructura Observada

Endpoints vivos verificados el 2026-06-20:

- `https://auth-fixvox.jpsala.dev/health` -> OK.
- `https://fixvox-proxy.jpsala.workers.dev/health` -> OK.

Endpoint observado como no confiable ahora:

- `https://fixvox-api.jpsala.dev/health` -> `404 Application not found`.

Conclusion: usar `AUTH_BASE_URL`/`PROXY_BASE_URL` configurables, con default preferido `https://auth-fixvox.jpsala.dev` mientras no se repare o confirme `fixvox-api.jpsala.dev`.

## Contratos Cloud Relevantes

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

No requiere que el desktop envie API key de Groq. El Worker posee `GROQ_API_KEY` server-side.

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
- `X-Fixvox-Proxy-Init-Ms`
- `X-Fixvox-Proxy-Total-Ms`
- `Server-Timing`

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

La spec guia historica es `specs/009-fixvox-cloud-runtime-port/`. La track viva para el nuevo goal instalable/cloud es `docs/tracks/fixvox-tauri-cloud-release.md`.

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
