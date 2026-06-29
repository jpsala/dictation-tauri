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

Implementacion 2026-06-29: el primer batch de effective runtime parity quedo aplicado en codigo y tests provider-free. La UI React ya no hardcodea `pro-post-process`; el runtime Tauri/Rust resuelve un `DictationRuntimePlan` host-owned desde policy/cache (`FIXVOX_CACHED_POLICY_JSON`/path o snapshot persistido), usa modelo/prompt/language de ese plan para managed STT, y solo habilita `/v1/chat/completions` cuando la policy lo pide. Para policy `pro` sin payload completo, el fallback host-owned usa `whisper-large-v3-turbo` y postprocess disabled; para prompt completo necesita policy/cache completo o env/path explicitamente host-owned.

Implementacion 2026-06-29 follow-up: el refresh/register de policy ahora preserva un `runtimePolicy` completo dentro de `policySnapshot` (incluye transcript/voicePolicy/voiceRouting/speech/prompts si los devuelve cloud) para que el host pueda resolver prompt/model/postprocess sin overrides React. Tambien se porto el cache de preflight managed de transcripcion con TTL 60s y prewarm fire-and-forget al iniciar captura nativa; el stop path reutiliza un allow cacheado si coincide backend/install/device/usageKind.

Descubrimiento 2026-06-29: el parity de `013-fixvox-text-runtime-parity` copio bien los primitivos puros de texto, pero no cerro la parity del **runtime efectivo**.

Fixvox real en esta maquina (`%APPDATA%/fixvox/main.db`, `settings.cached_policy.v1`, policy `pro`) esta usando:

- STT provider: `groq`.
- STT model: `whisper-large-v3-turbo`.
- STT prompt: prompt tecnico en español desde policy/cache, orientado a conservar comandos, modelos, paquetes, archivos, URLs, emails, numeros y mayusculas.
- STT request: `verbose_json`, `timestamp_granularities[]=word`, `timestamp_granularities[]=segment`, `temperature=0`, language opcional, `X-Device-Id` en managed.
- Postprocess: `voicePolicy.enableRawPostProcess=false` para el perfil efectivo actual; no debe correr chat-completions salvo que la policy/ruta lo habilite.
- Performance: `managed-execution-gate` prewarm/cache para transcription preflight; VAD local antes de upload; MP3 compression para audios largos.

Dictation Tauri todavia difiere en puntos que afectan performance/calidad:

- Falta smoke real de latencia y el in-flight soft-timeout exacto de Fixvox para preflight managed; el cache TTL 60s y prewarm ya estan.
- Audio prep aun no tiene VAD/MP3/no-speech parity.

Causa raiz original: dos fuentes de verdad. Fixvox resuelve runtime desde cached policy/control-plane + voice routing; Dictation Tauri mezclaba defaults Rust/env y un hardcode React de postprocess. Esa parte quedo corregida para STT/postprocess provider-free; queda cerrar audio prep y smoke real.

## Proximo Paso

Abrir el siguiente Small Batch con objetivo unico: **audio prep Fixvox-equivalent + smoke real redacted**. No tocar delivery/target; cerrar VAD/MP3/no-speech y medir el flow completo con audio controlado.

### Batch 2026-06-29 Cerrado

- **RED/GREEN golden plan**: fixture redacted/minimizado `specs/013-fixvox-text-runtime-parity/fixtures/fixvox-pro-effective-policy.redacted.json` y tests en `tests/fixvox-text-runtime/fixvox-runtime-regression.test.ts` validan `provider=groq`, `model=whisper-large-v3-turbo`, prompt presente por hash/length y postprocess disabled.
- **GREEN host-owned plan**: `src-tauri/src/runtime_transcription.rs` agrega resolver `DictationRuntimePlan` desde policy/cache; `src/fixvox-text-runtime/index.ts` conserva preview provider-free equivalente para regression tests.
- **RED/GREEN STT request managed**: `src-tauri/src/fixvox_cloud.rs`/`runtime_transcription.rs` incluyen prompt opcional, `response_format=verbose_json`, `timestamp_granularities[]=word/segment`, `temperature=0`, language opcional omitiendo `auto`, y `X-Device-Id` sin Authorization vendor.
- **RED/GREEN postprocess**: `src/App.tsx` dejo de pasar `fixvoxManagedPostProcessPolicy`; con la policy `pro-stt-only`/`enableRawPostProcess=false`, Rust adjunta evidencia skipped y no llama `/v1/chat/completions`.

Checks ejecutados:

```powershell
npm run test:pipeline -- tests/fixvox-text-runtime tests/host-runtime tests/desktop-control
npm run build
cd src-tauri && cargo fmt --check && cargo check
cd src-tauri && cargo check --tests
```

Nota: `cargo test --lib` y `cargo test --test fixvox_cloud_contract` ya corren en Windows despues del fix de manifest Common Controls v6 (`c7cf731`).

### Batch 2026-06-29 Follow-up Cerrado

- **Policy payload completo**: `src-tauri/src/fixvox_cloud.rs` persiste `policySnapshot.runtimePolicy` desde register/refresh para conservar transcript/voicePolicy/voiceRouting/prompts si cloud los devuelve; `runtime_transcription.rs` lo prefiere sobre `transportPolicy` legacy.
- **Preflight cache/prewarm**: `runtime_transcription.rs` agrega cache de allow managed transcription por backend/install/device/usageKind con TTL 60s; `src/capture/native-tauri-gateway.ts` dispara `prewarm_fixvox_managed_transcription` al arrancar captura nativa.
- **Tests**: cargo unit/contract tests ahora cubren cache hit/expiry/denial y persistencia de runtime policy completo.

Checks ejecutados:

```powershell
cd src-tauri && cargo test --lib -- --nocapture
cd src-tauri && cargo test --test fixvox_cloud_contract -- --nocapture
npm run test:pipeline -- tests/fixvox-text-runtime tests/host-runtime tests/desktop-control
npm run build
cd src-tauri && cargo fmt --check && cargo check --tests
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

### Tareas Propuestas Para La Proxima Sesion

1. **RED/GREEN — Audio prep Fixvox-equivalent**
   - Portar VAD local antes de upload y compresion MP3 para audios largos.
   - Evidencia redacted: upload source/mime/bytes, duration, compression ratio y no-speech reason.

2. **VALIDACION — Smoke managed redacted**
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
