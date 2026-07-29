# Working Memory

Router operativo corto; el detalle durable vive en topics, tracks, specs y
decisiones.

Última actualización: 2026-07-29.

## Foco Único De Ejecución

- **Estado:** `ready`.
- **Plan:** `docs/tracks/dictation-error-recovery-hardening.md`.
- **Próximo batch:** **Batch 3 — continuar sólo la matriz de errores todavía colapsados**.

## Estado Vivo

- Dictation Tauri y Control Room son el producto canónico; `C:/dev/fixvox`
  queda como referencia de comportamiento Fixvox-like.
- El runtime cloud/self-hosted y Checkpoint F están cerrados. Estado, receipts,
  rollback y hashes viven en las tracks de cloud/VPS y en Spec 019; cualquier
  operación nueva requiere un brief y gate explícitos.
- Desktop mantiene compatibilidad `CF-DESKTOP`; OAuth/account linkage y prompt
  parity quedaron corregidos. Smokes reales, instalación, release, provider,
  VPS, DNS y deploy siguen gated.
- Error recovery quedó publicado y validado: un intento sin transcript ya no
  reutiliza History; copy/paste-last conservan causa y operación; Copy y cierre
  nativo de Companion vuelven a `Ready`; tray/botón derecho preservan el target,
  incluido Windows Terminal. Dictado, Paste last e History usan Unicode directo
  y no tocan el clipboard por defecto. No hubo deploy.
- La regresión mixed-DPI quedó cerrada físicamente en la PC afectada: el dock
  cruza correctamente del monitor inferior al 100% al superior al 150%. El
  guardrail conserva movimiento position-only antes del resize/refresh.
- Último cierre publicado, redescargado e instalado:
  `fixvox-tauri-v0.1.0-20260729120801`, source `5eb4ab8`, SHA-256
  `1ef20887…c7426d2`. Notepad moderno entregó 426 unidades UTF-16 por
  `native_edit_message` en 8 ms de input/9 ms total con `observed=true`;
  Windows Terminal conservó `unicode_send_input` (118 unidades, 340 ms).
  Installer/checksum remoto coinciden, instalación local exit `0` y app
  instalada viva. El release clipboard-free `...122818` queda superseded;
  CRLF del fallback Chromium continúa como follow-up separado.
- Standard Product UX cerró su operación local. Pi Chat Batch 2, App Audit y el
  roadmap de usuarios registrados están pausados hasta nueva priorización.
- La evidencia detallada no se duplica aquí: permanece en las tracks, specs,
  artifacts y topics enlazados por el índice.

## Frentes Retomables

| Frente | Estado | Abrir primero |
| --- | --- | --- |
| Error recovery | activo | `docs/tracks/dictation-error-recovery-hardening.md` |
| Dock/Wispr | listo para retomar | `docs/tracks/dock-skins-visual-refinement.md` |
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
