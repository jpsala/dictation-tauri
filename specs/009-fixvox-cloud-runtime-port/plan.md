# Plan: Fixvox Cloud Runtime Port

## Objetivo

Mover Dictation Tauri desde el provider directo local hacia una ruta managed compatible con la infraestructura cloud de Fixvox, reimplementando el desktop runtime en Rust/Tauri.

Resultado esperado:

```text
UI React -> HostRuntimeClient -> Tauri/Rust -> Fixvox Worker -> Groq
```

con fallback BYOK/direct explicito para dev, sin secretos en React y sin acoplarse a legacy Fixvox desktop internals.

## Contexto De Estudio

Fixvox funciona bien porque combina:

- control-plane/device registration;
- managed proxy con `X-Device-Id`;
- Groq server-side;
- policy/defaults/transportPolicy;
- preflight antes de ejecucion managed;
- headers de costo, usage y timings;
- prompts y heuristicas de dictado maduras.

Dictation Tauri ya tiene:

- captura nativa Rust;
- host boundary Tauri;
- Groq directo gated;
- transcript review/copy fallback;
- tests host-runtime y pipeline.

Esta spec cambia el transporte real de STT para que el camino principal use Fixvox managed cloud.

## Contratos Canonicos

Base URL configurable:

- `FIXVOX_BACKEND_URL`, `FIXVOX_API_BASE_URL` o `PROXY_BASE_URL`.
- Default inicial recomendado: `https://auth-fixvox.jpsala.dev`.
- No usar `https://fixvox-api.jpsala.dev` como default hasta reparar/confirmar su health.

Endpoints:

- `GET /health`
- `POST /v2/device/register`
- `POST /v2/device/activate`
- `POST /v2/execution/preflight`
- `POST /v1/usage/prewarm`
- `POST /v1/audio/transcriptions`
- futuro `POST /v1/chat/completions` para postprocess.

Headers managed:

- Request: `X-Device-Id`.
- Response: `X-Fixvox-*`, `X-Provider-Request-Id`, `Server-Timing`.

## Architecture

### Rust modules proposed

- `src-tauri/src/runtime_transcription.rs`
  - keep existing direct Groq path as BYOK/dev fallback;
  - add managed proxy path.
- `src-tauri/src/fixvox_cloud.rs` or equivalent
  - config resolution;
  - device register/activate/preflight;
  - response metadata parsing;
  - tests.
- Optional later: `src-tauri/src/app_state.rs`
  - durable local install/device id storage if current env/artifact approach is not enough.

### TS/UI contract

React should remain provider-secret-free. It can show:

- cloud backend configured/unconfigured;
- device registered/not registered;
- managed/direct mode;
- provider/model selected by backend;
- cost/usage/timing metadata if returned.

React should not:

- read provider keys;
- construct Authorization headers;
- know Groq endpoint details;
- decide silent direct fallback.

## Implementation Phases

### Phase 1 - RED: Contract Tests, No Network

Add Rust/TS tests that define:

- config resolution for backend base URL;
- request shape for `/v2/device/register`;
- missing backend/device errors are redacted;
- managed mode requires `X-Device-Id`;
- direct fallback only when explicitly requested;
- Fixvox response headers map into host response metadata.

No external calls.

### Phase 2 - GREEN: Device Registration Skeleton

Implement host-side device registration with injectable HTTP client/test seam.

Persist locally:

- install id;
- device id;
- last register success/error;
- policy id/label;
- transport policy snapshot enough for readiness.

For the first slice, file/appdata persistence can be minimal and documented; do not put this in React localStorage as the source of truth.

### Phase 3 - GREEN: Managed STT Transport

Add managed transcription request:

- validate artifact path as today;
- build multipart body OpenAI-compatible;
- send to `${baseUrl}/v1/audio/transcriptions`;
- header `X-Device-Id`;
- no vendor bearer token;
- parse transcript JSON;
- map Fixvox headers into response/report.

Keep default checks provider-free.

### Phase 4 - GREEN: Preflight And Fail-Closed Managed Mode

Before managed real provider work:

- call `/v2/execution/preflight` with `mode: managed`, `deviceId`, `installId`, `usageKind: transcription`, `estimate` seconds if known;
- deny locally on `device_not_registered`, `auth_required`, `policy_blocked`, `quota_exceeded`, `service_unavailable`;
- do not fall back to direct provider unless user selected BYOK/direct explicitly.

### Phase 5 - UI Readiness And Gated Manual Smoke

Update readiness UI to distinguish:

- `Managed cloud ready`;
- `Device registration needed`;
- `Backend unavailable`;
- `Direct BYOK ready`;
- `Provider-free smoke only`.

Run one manual gated smoke against `https://auth-fixvox.jpsala.dev` with ignored WAV artifact and record redacted evidence only.

### Phase 6 - Follow-up: Postprocess And Runtime Quality

After STT cloud path works:

- port Fixvox postprocess prompt path through `/v1/chat/completions`;
- port no-speech/VAD/prosody heuristics if useful;
- expose cost/latency/usage in debug surface;
- then proceed to delivery/hotkey work.

## Tests / Checks

Default safe checks:

```powershell
npm run test:pipeline
npm run build
cd src-tauri && cargo check
npm run visual:check
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

Manual gated checks only with explicit approval/local config:

```powershell
# Example target, exact command to be added by implementation
$env:FIXVOX_BACKEND_URL="https://auth-fixvox.jpsala.dev"
npm run tauri:dev
```

## Privacy / Security

- Managed mode sends audio/transcript to Fixvox cloud and Groq; UI copy must make this clear before product default.
- No provider secrets in frontend.
- Do not persist full provider payloads unless under ignored artifacts.
- Redact request ids if they look secret-like; keep short evidence only.
- Device id is less sensitive than provider keys, but still avoid printing it fully in user-facing summaries.

## Open Questions

- Should Dictation Tauri register as its own product/app id or reuse Fixvox alpha semantics exactly?
- Where should Rust persist device/install metadata: app data JSON, Tauri store plugin, or existing artifact policy?
- Should managed cloud become default immediately after smoke, or stay an explicit `Transcribe with cloud provider` action first?
- Do we want postprocess in the same spec or a follow-up spec after STT cloud is stable?
