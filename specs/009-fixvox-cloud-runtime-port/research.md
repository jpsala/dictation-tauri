# Research: Fixvox Cloud Runtime Port

## Evidence From Fixvox Study

Files studied:

- `C:/dev/fixvox/proxy/src/index.ts`
- `C:/dev/fixvox/proxy/src/control-plane-store.ts`
- `C:/dev/fixvox/proxy/src/runtime-policy-store.ts`
- `C:/dev/fixvox/src/app/backend/speech-to-text.ts`
- `C:/dev/fixvox/src/app/backend/managed-proxy.ts`
- `C:/dev/fixvox/src/app/backend/control-plane.ts`
- `C:/dev/fixvox/src/app/backend/managed-runtime.ts`
- `C:/dev/fixvox/docs/archive/2026-04-07-docs-cleanup/reference/implementation/managed-proxy-audit.md`

## Findings

- Fixvox managed mode is already fail-closed for supported Groq lanes.
- The cloud Worker supports Groq chat and Groq speech via OpenAI-compatible endpoints.
- The desktop registers a device and then uses `X-Device-Id` for proxy inference.
- The Worker owns provider keys and returns usage/cost/timing headers.
- The current managed provider support matrix is intentionally narrower than BYOK.
- `https://auth-fixvox.jpsala.dev` and `https://fixvox-proxy.jpsala.workers.dev` are live.
- `https://fixvox-api.jpsala.dev` returned `404 Application not found` during study.

## Recommendation

Implement managed cloud support as a first-class Rust/Tauri host adapter, not as a port of Bun internals. Use Fixvox contracts and behavior as the product/runtime reference.
