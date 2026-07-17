# Preguntas Abiertas

## Resueltas Como Criterio

- Permisos/capabilities: mantener `core:default` hasta que una feature requiera permiso nuevo; agregar capabilities por ventana/feature, no como default amplio.
- Comandos oficiales actuales: `npm run build`, `npm run test:pipeline`, `npm run visual:check`, `$env:CARGO_TARGET_DIR="target-codex-check"; cargo check --manifest-path src-tauri/Cargo.toml`, `bun scripts/context-index.ts`, `bun scripts/agent-context-audit.ts`.
- `ModelGateway` directo por fases: MVP 2 puede empezar en script/harness TS/Node para benchmarks; runtime de producto con secretos o side effects debe cruzar por frontera Tauri/host.
- Para `009-fixvox-cloud-runtime-port`, el primer slice de persistencia usa JSON minimo en app data desde Rust/Tauri (`dictation-tauri/fixvox-device-state.json`), no React `localStorage`, no SQLite ni Tauri store plugin por ahora.
- CSP minima: producción restringe a recursos locales + IPC Tauri y mantiene cloud host-owned; desarrollo agrega solo WebSocket HMR local. Startup smoke WebView2 queda como validación operativa, no como decisión abierta.
- Postprocess/presets: dictado normal sigue policy; preset/selection reemplazan postprocess base y ejecutan una sola transformación.
- Routing managed: postprocess/selection usan engine Cloud por `X-Fixvox-Engine-Kind`; provider/model del preset no gobiernan runtime sin capability y enforcement Worker explícitos.
- Settings unificado: preferencias personales quedan nativas; administración global se integra mediante el Control Room OAuth/server-side existente, capability-gated y sin `ADMIN_API_KEY` en el cliente.

## Abiertas

- Se guardaran settings locales en la primera version tecnica?
- Que provider/model inicial se usa para STT sintetico en MVP 2?
- La primera captura de microfono usa Rust/cpal, plugin Tauri, WebView MediaRecorder o sidecar?
- Cual es la estrategia tecnica mas confiable para capturar texto seleccionado en Windows cuando entre post-MVP?
- Debe Dictation Tauri registrar devices con identidad/product id propio o reutilizar la semantica alpha de Fixvox tal cual?
