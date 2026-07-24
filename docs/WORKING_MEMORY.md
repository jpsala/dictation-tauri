# Working Memory

Router operativo corto. El detalle durable vive en topics, tracks, specs y decisiones.

Última actualización: 2026-07-24.

## Foco Único De Ejecución

- **Estado:** `complete`.
- **Referencia:** `docs/tracks/fixvox-tauri-cloud-release.md`.
- **Siguiente acción:** instalar el prerelease `fixvox-tauri-v0.1.0-20260724030810` en la otra PC autorizada y validar primer launch/dictado.

## Estado Vivo

- Dictation Tauri y Control Room son el producto canónico. Cloudflare conserva front door, TLS y authority; el VPS sirve el hot path y `fixvox-proxy` queda como rollback sin Custom Domain. `C:/dev/fixvox` queda sólo como referencia para comportamiento Fixvox-like.
- Spec 019 completó A-E y Gate F quedó completo: restart, rollback provider-loopback-compatible y restore aislado verdes. Current `4075da53c365a8b1`; rollback probado `73c764c8c679dc40`; schema 6, markers 1/1, provider configurado, loopback y `cloudflare-authority`. `66652…`, `90ca…` y `c0deb…` siguen preservados como releases anteriores; `9afa…` no es ready sobre schema 6. Cloudflare conserva authority y el hot path llega al VPS por Tunnel dedicado.
- El desktop instalado mantiene compatibilidad `CF-DESKTOP`: artifacts release bajo app data y STT por el mismo alias público, ahora servido por VPS/PostgreSQL; la confirmación humana final del dictado queda pendiente.
- Pi Chat Trusted Owner remoto quedó operativo. Conversation-first Batch 1 está completo; Batch 2 queda postergado mientras Checkpoint F sea el foco. Infraestructura estable: `docs/tracks/pi-prod-workspace.md`.
- Standard Product UX completó implementación local. Operaciones de otra PC, provider, release o rollout viven detrás de `docs/tracks/standard-product-ux-external-operation-gate-plan.md`.
- Instrumentación productiva autorizada quedó activa en Worker `e8c642c3-6543-4794-8f32-b763a48c105a`, desplegada desde un worktree limpio byte-parity con la base productiva; rollback exacto: versión 158 `df416730-61b8-4222-ab5f-282879251db9`. Tres STT reales aislaron todo el overhead Worker: budget events `1326/326/421 ms`, engine `107/95/88`, prompt `44/47/71`, budget config `49/44/66`, multipart `15/14/19`; parse/usage `0`. En warm, budget events explica 62.7% de `595.5 ms` promedio de overhead.
- Batches 2A-2B quedaron completos local/provider-free: ledger monetario O(1), upgrade PostgreSQL 5→6, backfill/checkpoint idempotente con parity UTC día/mes, shadow redacted legacy-authoritative y expiry/outbox/read-model reintentables fuera de `reserve()`. Checks focales pasaron; p95 local final observado `2.131 ms`. No se cableó provider/authority ni se tocó producción.
- Batch 2C quedó completo local/provider-free para STT canónico: pricing PostgreSQL tipado USD/per-hour, estimación conservadora por duración, account→profile por campo, `operationId` estable, settle/release idempotente y receipt redacted; legacy conserva authority. Evidencia: core 5/5, API focal 28/28, PostgreSQL 12/12, reserve p95 `1.795 ms`, LSP limpio.
- VPS provider/canary y Gate F completos sobre `4075da53…`. La release `73c764c8c679dc40`, runtime byte-identical a current (61 paths), quedó instalada inmutable y probada como rollback con retorno final a current. Tres etapas dieron health/readiness/Admin 200; restarts 0, timers activos, backups 5/5, privacy verde, staging limpio y provider routes 0.
- Batch D1 provider-free quedó completo: Access dio `403/200`, marcador fijo `FIXVOX_D1_OK`, métrica Tunnel `0→1` y `/health`/`/ready` 200 por el canal privado con `cloudflare-authority`. Cleanup dejó cero recursos D1; VPS/Worker siguen verdes y el patch Worker permanece sólo local, sin deploy.
- Worker-off completo: la base `8e5dd3d` más instrumentación y routing produjo el bundle verificado (`516315` bytes, SHA-256 `7ce5be…e575`), 2/2 tests verdes y deploy productivo `4a97683d-0198-4af5-8f70-ee892a5a9253`. Health 200; trigger/origin/credenciales canary y KV de kill switch ausentes, sin camino al VPS. Rollback exacto disponible: `e8c642c3-6543-4794-8f32-b763a48c105a`.
- Single-attempt quedó bloqueado: JP pasó `403→200` por registro soportado, pero el único intento no produjo receipt ni evento VPS/provider; no se repitió. Cleanup total confirmado: JP volvió a `403`, routing/recursos efímeros ausentes y Worker/VPS verdes.
- Diagnóstico provider-free completo: el request gestionado consumido no llevaba trigger, mientras la frontera desplegada lo exigía antes de consultar el allowlist server-owned. La corrección local selecciona sólo por KV habilitado más hash; test focal rojo→verde confirma una invocación `vps-canary` para la identidad válida y Worker para la no-canary, sin efectos externos.
- Cutover directo inicial bloqueado antes de DNS/STT: la identidad local quedó registrada y con preflight VPS permitido, pero la unit del Tunnel fijó `/usr/bin/cloudflared` frente al binario real en `/usr/local/bin/cloudflared`. Rollback removió todos los recursos dedicados y preservó Worker público 200, VPS ready, restarts 0; no hubo provider call.
- Cutover con connector corregido también quedó bloqueado provider-free: la unit en `/usr/local/bin/cloudflared`, conexiones y CNAME exacto quedaron verdes, pero el hostname no convergió a `fixvox-api` dentro de la ventana acotada. Rollback automático restauró el custom domain Worker con health 200 y eliminó Tunnel/DNS/unit/config/credencial; VPS ready, restarts 0, provider attempts 0.
- Diagnóstico de convergencia completo: al separar el Custom Domain, DNS vacío dio 522; con CNAME exacto al Tunnel hubo 54 probes 522 y luego 6 respuestas 200 de `fixvox-api`, con convergencia observada de ~110 s. Tunnel `+9`, Workers KV `0`, provider `0`; cleanup restauró Worker 200 y cero recursos dedicados.
- Cutover convergence-aware bloqueado tras un falso negativo del receipt: convergió 3× health en `126.258 s`, readiness/preflight y la única STT dieron 200 por VPS, pero el logger normalizó la ruta y el harness restauró Worker. KV `0`; analytics Worker no ejecutado; cleanup total, VPS restarts 0.
- Cutover provider-free final completo: receipt/log STT previo validados sin otra llamada provider; CNAME, Tunnel y unit `/usr/local/bin/cloudflared` activos; 3× health `fixvox-api` en `19.124 s`, readiness/preflight 200, Worker invocations 0, KV delta 0, VPS restarts 0 y Custom Domain Worker ausente.
- Desktop prewarm completo: cliente reqwest compartido y `/health` best-effort al iniciar captura redujeron la prueba fría real de `1625 ms` a `687 ms`; health ocurrió `12.25 s` antes de STT, test focal 1/1 y cargo/LSP verdes. Commit `3f0804e` pusheado con los cinco commits locales previos.
- Prerelease Windows publicado desde worktree limpio en `fixvox-tauri-v0.1.0-20260724030810`: NSIS unsigned `29,553,376` bytes, SHA-256 `32738e2e…aefec`, redescarga idéntica. URL directa: `https://github.com/jpsala/fixvox-releases/releases/download/fixvox-tauri-v0.1.0-20260724030810/Fixvox-Tauri-Setup.exe`.

## Tracks Activas

| Track | Rol actual |
| --- | --- |
| `cloudflare-proxy-latency-optimization.md` | Batches 1 y 2A-2C, promoción shadow, único smoke STT real y provider-support code promotion completos. |
| `vps-persistent-provider-canary-plan.md` | R1-R3/P1-P3 completos; provider persistente y único canary verdes. |
| `vps-routing-canary-brief.md` | Gates A-C completos; Gates D/E siguen bloqueados hasta un nuevo plan/gate explícito. |
| `vps-routing-canary-d1-provider-free-brief.md` | Completo: `403/200`, marcador, delta Tunnel, health/readiness privados y cleanup total verdes. |
| `vps-routing-canary-worker-off-brief.md` | Completo: Worker `4a97683d…` activo con routing inoperable y rollback exacto `e8c642c3…`. |
| `vps-routing-canary-single-attempt-brief.md` | Bloqueado: intento consumido sin receipt/evento VPS; cleanup total verde y sin retry autorizado. |
| `vps-routing-canary-provider-free-diagnostic-brief.md` | Completo: trigger client-side aislado como causa; selección local corregida a KV + hash y test rojo→verde. |
| `vps-direct-runtime-cutover-brief.md` | Bloqueado antes de DNS/STT; registro persistente verde y rollback total, sin provider. |
| `vps-direct-runtime-cutover-corrected-connector-brief.md` | Bloqueado provider-free: connector/CNAME verdes, hostname sin convergencia y rollback total al Worker. |
| `vps-direct-runtime-cutover-diagnostic-brief.md` | Completo: convergencia al Tunnel observada tras ~110 s; provider-free y cleanup total. |
| `vps-direct-runtime-cutover-convergence-aware-brief.md` | Bloqueado: corte y STT VPS 200, pero falso negativo del receipt disparó rollback total; sin retry autorizado. |
| `vps-direct-runtime-cutover-provider-free-finalization-brief.md` | Completo: hot path permanente por VPS, evidencia STT reutilizada, Worker/KV en cero y recursos dedicados activos. |
| `vps-routing-canary-patch-promotion-brief.md` | Pausado: el cutover directo volvió innecesaria la promoción; WIP local preservado sin deploy. |
| `vps-routing-canary-source-parity-brief.md` | Completo: base activa reproducible, `cmp` idéntico y diff canary limitado a routing. |
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
