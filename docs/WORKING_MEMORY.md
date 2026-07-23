# Working Memory

Router operativo corto. El detalle durable vive en topics, tracks, specs y decisiones.

Última actualización: 2026-07-22.

## Foco Único De Ejecución

- **Estado:** `complete`.
- **Referencia:** `docs/tracks/vps-gate-f-external-closure-brief.md`.
- **Siguiente acción:** definir un foco nuevo antes de iniciar cualquier P4, routing o cambio de authority.

## Estado Vivo

- Dictation Tauri y Control Room son el producto canónico. Fixvox Cloud/Worker sigue como autoridad operativa temporal y rollback; `C:/dev/fixvox` queda sólo como referencia para comportamiento Fixvox-like.
- Spec 019 completó A-E y Gate F quedó completo: restart, rollback provider-loopback-compatible y restore aislado verdes. Current `4075da53c365a8b1`; rollback probado `73c764c8c679dc40`; schema 6, markers 1/1, provider configurado, loopback y `cloudflare-authority`. `66652…`, `90ca…` y `c0deb…` siguen preservados como releases anteriores; `9afa…` no es ready sobre schema 6. Cloudflare conserva authority/hot path.
- El desktop instalado mantiene compatibilidad `CF-DESKTOP`: artifacts release bajo app data y STT por el alias Worker mientras Cloudflare sea authority; la confirmación humana final del dictado queda pendiente.
- Pi Chat Trusted Owner remoto quedó operativo. Conversation-first Batch 1 está completo; Batch 2 queda postergado mientras Checkpoint F sea el foco. Infraestructura estable: `docs/tracks/pi-prod-workspace.md`.
- Standard Product UX completó implementación local. Operaciones de otra PC, provider, release o rollout viven detrás de `docs/tracks/standard-product-ux-external-operation-gate-plan.md`.
- Instrumentación productiva autorizada quedó activa en Worker `e8c642c3-6543-4794-8f32-b763a48c105a`, desplegada desde un worktree limpio byte-parity con la base productiva; rollback exacto: versión 158 `df416730-61b8-4222-ab5f-282879251db9`. Tres STT reales aislaron todo el overhead Worker: budget events `1326/326/421 ms`, engine `107/95/88`, prompt `44/47/71`, budget config `49/44/66`, multipart `15/14/19`; parse/usage `0`. En warm, budget events explica 62.7% de `595.5 ms` promedio de overhead.
- Batches 2A-2B quedaron completos local/provider-free: ledger monetario O(1), upgrade PostgreSQL 5→6, backfill/checkpoint idempotente con parity UTC día/mes, shadow redacted legacy-authoritative y expiry/outbox/read-model reintentables fuera de `reserve()`. Checks focales pasaron; p95 local final observado `2.131 ms`. No se cableó provider/authority ni se tocó producción.
- Batch 2C quedó completo local/provider-free para STT canónico: pricing PostgreSQL tipado USD/per-hour, estimación conservadora por duración, account→profile por campo, `operationId` estable, settle/release idempotente y receipt redacted; legacy conserva authority. Evidencia: core 5/5, API focal 28/28, PostgreSQL 12/12, reserve p95 `1.795 ms`, LSP limpio.
- VPS provider/canary y Gate F completos sobre `4075da53…`. La release `73c764c8c679dc40`, runtime byte-identical a current (61 paths), quedó instalada inmutable y probada como rollback con retorno final a current. Tres etapas dieron health/readiness/Admin 200; restarts 0, timers activos, backups 5/5, privacy verde, staging limpio y provider routes 0.

## Tracks Activas

| Track | Rol actual |
| --- | --- |
| `cloudflare-proxy-latency-optimization.md` | Batches 1 y 2A-2C, promoción shadow, único smoke STT real y provider-support code promotion completos. |
| `vps-persistent-provider-canary-plan.md` | R1-R3/P1-P3 completos; provider persistente y único canary verdes. P4 fuera de alcance/gated. |
| `vps-provider-loopback-rollback-brief.md` | Candidate `73c764c8c679dc40` construida determinísticamente y luego instalada/probada por el gate externo. |
| `vps-gate-f-external-closure-brief.md` | Completo: restart, rollback/retorno, restore previo y baseline final verdes. |
| `fixvox-product-first-self-hosted-contract-plan.md` | Plan cloud/runtime padre; Checkpoints A-E completos. |
| `fixvox-self-hosted-checkpoint-f-vps-loopback-plan.md` | Checkpoint F completo; F5R2 histórico permanece superseded. |
| `pi-chat-conversation-first-ux.md` | Batch 1 completo; Batch 2 queda postergado. |
| `standard-product-ux-external-operation-gate-plan.md` | Única puerta para operaciones externas. |
| `app-audit-autonomous-implementation-plan.md` | Residual pendiente de decidir: cerrar o pausar. |
| `fixvox-registered-users-opportunities.md` | Roadmap pendiente de decidir o consolidar. |

## Lectura Por Frente

- Producto: `docs/topics/product-direction.md`.
- Desktop/selection: `docs/topics/dictation-tauri-foundation.md`, `docs/topics/selection-and-assistant-actions.md`.
- Latencia proxy: `docs/tracks/cloudflare-proxy-latency-optimization.md`; comparar con `C:/dev/fixvox/proxy/src/index.ts`.
- Cloud/runtime: Spec 019, track product-first y `docs/topics/fixvox-cloud-runtime-port.md`.
- Pi Chat: track conversation-first; remote parity queda completa.
- UI: external-operation gate, `PRODUCT.md`, `DESIGN.md`, `docs/topics/ui-design-and-impeccable.md`.
- AOS: `docs/topics/agentic-os.md`; salud read-only con `bun run aos:doctor` o Pi `/doctor`.

## Guardrails

- No imprimir ni commitear secretos, `.env`, tokens, datos sensibles, artifacts o caches.
- Provider/OAuth real, cuentas, VPS, deploy, DNS, release, producción, commit/push y acciones destructivas requieren autorización explícita.
- Smokes físicos/live de hotkeys, audio, Alt+Space, selección, replace-selection, observer y paste real requieren task/spec o confirmación.
- Para UI durable abrir `PRODUCT.md` y `DESIGN.md`; usar app Tauri real para tray, hotkeys, ventanas y delivery cuando corresponda.
- Trabajo normal: manual por etapas, un bounded batch, checks proporcionales. No iniciar Taskflow ni loops largos sin opt-in explícito.

## Riesgos Transversales

- `cloud/fixvox-api/src/app.ts` conserva fan-out alto y preflight legacy pendiente de limpieza.
- No convertir esta ruta caliente en transcript; receipts y evidencia pertenecen a tracks/specs.

## Comandos

```powershell
bun run aos:doctor
bun run context:index
bun run context:audit
npm run check
```
