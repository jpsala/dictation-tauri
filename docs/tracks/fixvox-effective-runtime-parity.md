---
status: active
started: 2026-06-29
updated: 2026-06-29
priority: high
owner:
related:
  - docs/topics/source-project-map.md
  - docs/topics/dictation-workflow.md
  - docs/topics/fixvox-cloud-runtime-port.md
  - docs/topics/backend-and-model-routing.md
  - specs/013-fixvox-text-runtime-parity/tasks.md
topic: docs/topics/source-project-map.md
source_refs:
  - C:/dev/fixvox/src/app/backend/settings-types.ts
  - C:/dev/fixvox/src/app/backend/settings-service.ts
  - C:/dev/fixvox/src/app/backend/managed-runtime.ts
  - C:/dev/fixvox/src/app/backend/voice-execution-plan.ts
  - C:/dev/fixvox/src/app/backend/speech-to-text.ts
  - C:/dev/fixvox/src/app/backend/managed-execution-gate.ts
  - src/App.tsx
  - src/fixvox-text-runtime/index.ts
  - src-tauri/src/runtime_transcription.rs
---

# Fixvox Effective Runtime Parity

## Objetivo

Hacer que Dictation Tauri ejecute transcripcion y postproceso exactamente como el Fixvox real de JP para dictado normal: mismo provider/model, prompt, policy/routing, request multipart, postprocess enablement, fallback, evidencia y performance-shaping gates. La UI/Tauri shell sigue siendo propia, pero no puede decidir ni hardcodear el runtime de texto.

## Estado Actual

Descubrimiento 2026-06-29: el parity de `013-fixvox-text-runtime-parity` copio bien los primitivos puros de texto, pero no cerro la parity del **runtime efectivo**.

Fixvox real en esta maquina (`%APPDATA%/fixvox/main.db`, `settings.cached_policy.v1`, policy `pro`) esta usando:

- STT provider: `groq`.
- STT model: `whisper-large-v3-turbo`.
- STT prompt: prompt tecnico en español desde policy/cache, orientado a conservar comandos, modelos, paquetes, archivos, URLs, emails, numeros y mayusculas.
- STT request: `verbose_json`, `timestamp_granularities[]=word`, `timestamp_granularities[]=segment`, `temperature=0`, language opcional, `X-Device-Id` en managed.
- Postprocess: `voicePolicy.enableRawPostProcess=false` para el perfil efectivo actual; no debe correr chat-completions salvo que la policy/ruta lo habilite.
- Performance: `managed-execution-gate` prewarm/cache para transcription preflight; VAD local antes de upload; MP3 compression para audios largos.

Dictation Tauri hoy difiere en puntos que afectan calidad y velocidad:

- `src-tauri/src/runtime_transcription.rs` cae a default `whisper-large-v3` si no hay `FIXVOX_STT_MODEL`, en vez de resolver el modelo efectivo de Fixvox policy/cache.
- Managed STT no manda prompt efectivo, timestamps word/segment ni `temperature=0`.
- `src/App.tsx` fuerza `postProcess.enabled=true` y `voiceRoutingProfileId="pro-post-process"`, aunque Fixvox actual tiene postprocess off.
- El preflight managed en Rust es sin el prewarm/cache equivalente de Fixvox.
- Audio prep aun no tiene VAD/MP3 parity.

Causa raiz: dos fuentes de verdad. Fixvox resuelve runtime desde cached policy/control-plane + voice routing; Dictation Tauri mezcla defaults Rust/env y un hardcode React de postprocess.

## Proximo Paso

Abrir el siguiente Small Batch con objetivo unico: **runtime effective parity de STT/postprocess**. No tocar delivery/target/audio prep hasta que el plan efectivo y request STT matcheen.

### Tareas Propuestas Para La Proxima Sesion

1. **RED — Golden effective runtime plan**
   - Agregar fixture redacted/minimizado de la policy/cache Fixvox `pro` actual.
   - Testear que Dictation Tauri resuelve `provider=groq`, `model=whisper-large-v3-turbo`, prompt tecnico presente, postprocess disabled y `voiceRoutingProfileId` efectivo de Fixvox.
   - El test debe fallar con el estado actual.

2. **GREEN — Fuente de verdad host-owned**
   - Crear un `DictationRuntimePlan`/resolver en host boundary (preferible Rust con preview TS si hace falta) que lea device/policy snapshot y env fallback sin secretos en React.
   - Reemplazar defaults sueltos por policy/cache: modelo, prompt, language, postprocess enabled/provider/model/prompt/source.
   - Mantener BYOK/direct como fallback explicito, no silencioso.

3. **RED/GREEN — STT request exacto Fixvox**
   - Test de request preview/multipart para managed STT con campos exactos: `model`, `language` opcional, `prompt`, `response_format=verbose_json`, `timestamp_granularities[]=word`, `timestamp_granularities[]=segment`, `temperature=0`, `X-Device-Id`.
   - Implementar en `src-tauri/src/runtime_transcription.rs` y reportar evidencia redacted de prompt length/hash, model, upload source y timings.

4. **RED/GREEN — No postprocess hardcodeado**
   - Test que falle si `src/App.tsx` decide provider/model/postprocess para el runtime real.
   - El stop path debe pedir el plan efectivo y pasar postprocess solo si la policy lo habilita.
   - Con la policy actual de JP, no debe llamar `/v1/chat/completions`.

5. **REFACTOR — Preflight performance parity**
   - Portar cache/prewarm de managed transcription preflight equivalente a Fixvox (`TRANSCRIPTION_PREFLIGHT_CACHE_TTL_MS=60_000`, in-flight behavior seguro).
   - Prewarm al iniciar grabacion para que stop no pague toda la latencia.

6. **VALIDACION — Evidencia local**
   - Ejecutar tests provider-free.
   - Hacer un smoke gated con audio controlado y reporte redacted: modelo usado, prompt hash/length, STT latency, postprocess skipped/ran, total end-to-end.
   - Comparar contra Fixvox local/logs sin imprimir transcript ni secretos.

### Checks Sugeridos

```powershell
npm run test:pipeline -- tests/fixvox-text-runtime tests/host-runtime tests/desktop-control
npm run build
cd src-tauri && cargo fmt --check && cargo check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Smoke real gated solo despues de provider-free GREEN:

```powershell
npm run tauri:dev:hidden -- -StopExisting
# usar audio controlado/artifacts ignorados; no push
```

## Guardrails

- No imprimir ni commitear prompt completo si incluye datos sensibles; usar hash/length en evidencia durable. En docs se puede describir su proposito sin copiar todo el texto.
- No usar React como fuente de verdad de provider/model/prompt/postprocess.
- No volver a defaults Rust si existe policy/cache Fixvox valida.
- No habilitar postprocess para "mejorar" si Fixvox efectivo lo tiene deshabilitado.
- No tocar delivery/browser target en este batch salvo que un test compile requiera adaptar tipos.
- No hacer push ni publish.

## Evidencia / Source Refs

- Fixvox effective policy real observada en `%APPDATA%/fixvox/main.db`, `settings.cached_policy.v1`: model `whisper-large-v3-turbo`, STT prompt tecnico, `enableRawPostProcess=false`.
- `C:/dev/fixvox/src/app/backend/voice-execution-plan.ts` resuelve `sttPromptEnabled`, prompt, postprocess enabled y runtime.
- `C:/dev/fixvox/src/app/backend/speech-to-text.ts` define request STT exacto y parsing prosody/no-speech.
- `C:/dev/fixvox/src/app/backend/managed-execution-gate.ts` define prewarm/cache de preflight.
- `src/App.tsx` contiene el hardcode actual que debe eliminarse.
- `src-tauri/src/runtime_transcription.rs` contiene los defaults/request managed actuales que deben alinearse.
