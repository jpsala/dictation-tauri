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
- Prioridad inmediata: validar en la PC afectada la corrección 100%↔150%, que
  escalona el movimiento del HWND antes del resize/refresh WebView2. Source
  `3d6bd5f`; checks y NSIS pasan, pero aún no hay smoke físico mixed-DPI.
- Último cierre publicado: prerelease mixed-DPI
  `fixvox-tauri-v0.1.0-20260727204131`, installer y checksum redescargados con
  SHA-256 `f745060a…d0f1bb`. El source quedó pusheado en `3d6bd5f`.
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
