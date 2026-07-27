# Working Memory

Router operativo corto; el detalle durable vive en topics, tracks, specs y
decisiones.

Última actualización: 2026-07-27.

## Foco Único De Ejecución

- **Estado:** `ready`.
- **Plan:** `docs/tracks/dock-skins-visual-refinement.md`.
- **Próximo batch:** **Batch Urgente — Regresión Mixed-DPI — 2026-07-27**.

## Estado Vivo

- Dictation Tauri y Control Room son el producto canónico; `C:/dev/fixvox`
  queda como referencia de comportamiento Fixvox-like.
- El runtime cloud/self-hosted y Checkpoint F están cerrados. Estado, receipts,
  rollback y hashes viven en las tracks de cloud/VPS y en Spec 019; cualquier
  operación nueva requiere un brief y gate explícitos.
- Desktop mantiene compatibilidad `CF-DESKTOP`; OAuth/account linkage y prompt
  parity quedaron corregidos. Smokes reales, instalación, release, provider,
  VPS, DNS y deploy siguen gated.
- Prioridad inmediata: la falla 100%↔150% apunta al watcher agregado en
  `1c8a4f9`, que movía y redimensionaba el HWND en el mismo `SetWindowPos`
  mientras Tao procesaba `WM_DPICHANGED`. Hay un patch local que escalona el
  movimiento y fuerza refresh de bounds WebView2; checks pasan, pero sigue sin
  smoke físico en la PC afectada y no tiene release.
- Último cierre publicado: hotfix bitmap/dock idle `c2d07cb`, prerelease
  `fixvox-tauri-v0.1.0-20260727194108`, instalado localmente y validado con
  paste real preservando una imagen en clipboard. `main` quedó en `e625166`.
- Standard Product UX cerró su operación local. Pi Chat Batch 2, App Audit y el
  roadmap de usuarios registrados están pausados hasta nueva priorización.
- La evidencia detallada no se duplica aquí: permanece en las tracks, specs,
  artifacts y topics enlazados por el índice.

## Frentes Retomables

| Frente | Estado | Abrir primero |
| --- | --- | --- |
| Dock/Wispr | activo | `docs/tracks/dock-skins-visual-refinement.md` |
| Cloud/runtime | referencia cerrada | Spec 019 y `docs/topics/fixvox-cloud-runtime-port.md` |
| Operaciones externas | sin batch activa | `docs/tracks/standard-product-ux-external-operation-gate-plan.md` |
| Pi Chat | pausado | `docs/tracks/pi-chat-conversation-first-ux.md` |
| App audit | pausado | `docs/tracks/app-audit-autonomous-implementation-plan.md` |
| Usuarios registrados | pausado | `docs/tracks/fixvox-registered-users-opportunities.md` |
| Producto | referencia | `docs/topics/product-direction.md` |
| AOS | operativo | `docs/topics/agentic-os.md` |

## Guardrails

- No imprimir ni commitear secretos, `.env`, tokens, datos sensibles, artifacts
  o caches.
- Provider/OAuth real, cuentas, VPS, deploy, DNS, release, producción,
  commit/push y acciones destructivas requieren autorización explícita.
- Smokes físicos/live de hotkeys, audio, selección, replace-selection, observer
  y paste real requieren task/spec o confirmación.
- Para UI durable abrir `PRODUCT.md` y `DESIGN.md`; usar app Tauri real cuando
  el shell nativo sea parte del comportamiento.
- Ejecutar un solo batch acotado con checks proporcionales; no revivir motores
  de orquestación retirados.

## Comandos

```powershell
bun run aos:doctor
bun run context:index
bun run context:audit
npm run check
```
