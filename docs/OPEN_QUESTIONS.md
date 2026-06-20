# Preguntas Abiertas

## Resueltas Como Criterio

- Permisos/capabilities: mantener `core:default` hasta que una feature requiera permiso nuevo; agregar capabilities por ventana/feature, no como default amplio.
- Comandos oficiales actuales: `npm run build`, `npm run test:pipeline`, `npm run visual:check`, `$env:CARGO_TARGET_DIR="target-codex-check"; cargo check --manifest-path src-tauri/Cargo.toml`, `bun scripts/context-index.ts`, `bun scripts/agent-context-audit.ts`.
- `ModelGateway` directo por fases: MVP 2 puede empezar en script/harness TS/Node para benchmarks; runtime de producto con secretos o side effects debe cruzar por frontera Tauri/host.
- Para `009-fixvox-cloud-runtime-port`, el primer slice de persistencia usa JSON minimo en app data desde Rust/Tauri (`dictation-tauri/fixvox-device-state.json`), no React `localStorage`, no SQLite ni Tauri store plugin por ahora.

## Abiertas

- Se guardaran settings locales en la primera version tecnica?
- Que provider/model inicial se usa para STT sintetico en MVP 2?
- La primera captura de microfono usa Rust/cpal, plugin Tauri, WebView MediaRecorder o sidecar?
- Cual es la estrategia tecnica mas confiable para capturar texto seleccionado en Windows cuando entre post-MVP?
- Cuando se deje de usar `csp: null`, cual es la CSP minima compatible con Tauri, Vite build y providers reales?
- Debe Dictation Tauri registrar devices con identidad/product id propio o reutilizar la semantica alpha de Fixvox tal cual?
