# Spec: Fixvox Cloud Runtime Port

## User Story

As JP, I want Dictation Tauri to use the same managed cloud infrastructure that makes Fixvox work well, while replacing the legacy Fixvox desktop runtime with Rust/Tauri, so the new app can inherit provider routing, policy, cost/usage tracking and mature dictation behavior without carrying old desktop architecture.

## Acceptance Criteria

- The app can register a device with the Fixvox backend from the Tauri host.
- Real managed STT sends captured audio to Fixvox Worker with `X-Device-Id`, not a frontend/provider API key.
- Managed mode fails closed when device/preflight/proxy lane is unavailable.
- Direct Groq remains available only as explicit BYOK/dev fallback.
- UI readiness clearly distinguishes managed cloud, direct BYOK, and provider-free smoke.
- Default tests/builds make no real cloud/provider calls.
- Manual cloud smoke evidence is redacted and artifacts remain ignored.

## Non-goals

- Do not copy legacy Fixvox desktop internals into Dictation Tauri.
- Do not implement all Fixvox surfaces in this spec.
- Do not add hotkeys/tray/delivery as part of the cloud transport slice.
- Do not make cloud default silently without privacy/product copy.
