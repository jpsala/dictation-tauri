# Working Memory

Router operativo corto; detalle durable vive en topics, decisions, specs o tracks.

Última actualización: 2026-07-11.

## Lectura Rápida

| Área | Abrir |
| --- | --- |
| Producto/MVP | `docs/topics/product-direction.md` |
| Desktop/dock/selection | `docs/topics/dictation-tauri-foundation.md`, `docs/topics/fixvox-dock-and-hotkeys-reference.md`, `docs/topics/selection-and-assistant-actions.md` |
| Fixvox Cloud/runtime | `docs/topics/fixvox-cloud-runtime-port.md`, `docs/tracks/fixvox-tauri-cloud-release.md` |
| Admin web + Pi Chat | `docs/tracks/fixvox-admin-web-pi-chat.md` |
| Settings/UI | `docs/tracks/settings-window-and-ui-foundation.md`, `docs/topics/ui-design-and-impeccable.md` |
| Usuarios/Pi prod/AOS | `docs/tracks/fixvox-registered-users-opportunities.md`, `docs/tracks/pi-prod-workspace.md`, `docs/topics/agentic-os.md` |
| Assistant/Lulu | `docs/topics/fixvox-assistant-lulu-reference.md`, `docs/tracks/fixvox-lulu-assistant-parity-refactor.md` |

## Estado Vivo

- Dictation Tauri es el cliente desktop de Fixvox; Fixvox Cloud es canónico. Worker operativo vive en `cloud/fixvox-proxy/`; secrets/admin env fuera del repo; `C:/dev/fixvox` queda legacy/reference.
- Admin/cloud: Profiles, Engines, Prompts, budgets, Usage y Groups runtime implementados/deployados. Worker prod registrado en docs anteriores; no mutar prod sin permiso.
- Presets activos: `como-yo-es`, `corregir-texto`, `fix-writing`, `like-me-en`. Settings / Presets tiene CRUD local y prod publica defaults/preset prompts.
- Alt+Q usa `preset-picker`; quick-run y which-key base validados. Faltan smokes físicos/live `Alt+Q then Y/C/F/L`.
- Settings prefs afectan runtime: dock startup hidden, press-enter-after-paste, review-before-delivery, auto-stop/mute/cues. Action hotkeys tienen recorder/persistencia y smoke físico versionado.
- Selection transform pasó smokes redacted; replace sigue side effect real y debe fallar cerrado.
- Delivery normal re-resuelve target editable post-STT; selection replace usa target guardado. Clipboard fallback restaura snapshot y tiene guardrails.
- Spec `018-fixvox-audio-runtime-parity` completa: VAD/no-speech local, auto-stop, long-audio optimization/fallback, mute/cues, telemetry redacted, docs y audit/context-index.
- Installer Windows unsigned `0.1.0` regenerado e instalado localmente en `%LOCALAPPDATA%\Fixvox Tauri` con FFmpeg 7.1.1 Essentials GPLv3 como sidecar. Compresión MP3 validada en build instalada para dictado corto; falta smoke físico en otra PC. No se publicó ni desplegó.
- Lulu/Fixvox assistant: `Lulu ...` es prefijo dentro de captura iniciada, no wake word always-on. Arquitectura segura: `AssistantIntentResult` -> `AssistantSurface` -> `PipelineUiResult`; solo `insertText` pastea. Smart Agent mínimo provider-free existe para presets; falta tool loop completo/estado rico/opciones no-preset.

## Guardrails

Fuentes: `C:/dev/copicu` para Tauri/UI/settings/Windows desktop; `C:/dev/fixvox` para comportamientos Fixvox-like antes de cerrar features. Login requerido sobre básico; policy/capabilities fallan cerrado antes de provider. Runtime normal: audio prep, STT, postprocess, policy, materialización y evidencia redacted. Delivery no promete `paste_observed` sin observer verificado. Side effects locales controlados permitidos; deploy/push/login/cuentas/Alt+Space/selección real/replace-selection/observer requieren aprobación o spec/task explícita. UI durable requiere `PRODUCT.md` + `DESIGN.md`; admin/web importante usa screenshot real + Impeccable/product-register. Usar app Tauri real para dock/tray/hotkeys/delivery/companion/Settings.

## Riesgos

- No imprimir secretos ni commitear `.env`, tokens, raw transcripts, audio sensible, build artifacts o caches.
- No production mutations/deploy/push/publicación sin confirmación explícita.
- No convertir ruta caliente en transcript.
- Selection capture/replace debe fallar cerrado.
- Cargo tests pueden fallar por `STATUS_ENTRYPOINT_NOT_FOUND`; usar `cargo check` salvo instrucción puntual.
- `cargo check` puede requerir `WebView2Loader.dll` en `src-tauri/target/release`; no cambiar installer config sin revisar release path.
- `scripts/release-windows.ps1` no corta ante `$LASTEXITCODE != 0`: `cargo fmt --check` puede detectar drift y el release continuar.
- FFmpeg sidecar agrega ~87 MB sin comprimir (installer NSIS ~29,8 MB), se distribuye bajo GPLv3 y requiere ambos aliases de target Windows GNU/MSVC mientras convivan ambos entrypoints de build.
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

## Próximo Paso Probable

1. Antes del próximo release, corregir la propagación de errores en `scripts/release-windows.ps1` y normalizar el formato Rust pendiente.
2. Revalidar con JP en Notepad con voz real: `Alt+Space` sin keytips/menu, dictado normal pega, `Lulu what is two plus two` pega `4`.
3. Si sigue assistant: usar `assistant_routed` para dogfood del Smart Agent mínimo y avanzar tool loop real sin regex ad-hoc fuera de `AssistantIntentResult`/`AssistantSurface`.
4. Completar smoke físico/live `Alt+Q then Y/C/F/L` y smoke Settings/Tauri `Import Cloud defaults` contra prod.
5. Decidir smokes live pendientes de audio runtime si JP habilita side effects.
6. Decidir estrategia Chrome sin `--force-renderer-accessibility`.
7. Release installer/otra PC solo con aprobación.
