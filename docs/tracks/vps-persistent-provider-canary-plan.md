---
status: complete
started: 2026-07-22
updated: 2026-07-22
priority: high
owner: Pi
parent: docs/tracks/cloudflare-proxy-latency-optimization.md
related:
  - docs/runbooks/fixvox-api-vps.md
  - docs/tracks/fixvox-self-hosted-checkpoint-f-vps-loopback-plan.md
  - artifacts/proxy-latency/vps-provider-support-promotion-receipt.json
  - artifacts/proxy-latency/vps-provider-canary-readiness.json
---

# VPS Persistent Provider And Canary Gate Plan

## Estado

R1-R3 y P1-P3 completos. El primer P1 histórico bloqueó sin mutación; R1 corrigió el contrato, R2 produjo una candidate exacta, R3 la promovió, P1 activó provider persistente sin llamadas, P2 preparó el harness y P3 ejecutó un único canary.

Baseline remoto final: release `4075da53c365a8b1`, schema 6, markers histórico/canary 1/1, provider configurado con key protegida, loopback y `cloudflare-authority`. Rollback inmediato: `66652d0fa6073c26`; rollback previo: `90ca26a7e3bd6f50`.

Canary: un request, provider calls 1, HTTP 200, expected match true y ledger settled. Identidad/binding/reservation/WAV/staging sintéticos limpiados; secret y transcript ausentes de output/journal/receipt. Restarts 0 y health/readiness/Admin 200. Sin routing, DNS/Tunnel ni cambio de authority.

## Decisiones Congeladas

- La release actual ya contiene el soporte Groq STT validado; no se construye ni despliega código nuevo para activar provider.
- `FIXVOX_API_MOCK_PROVIDERS=false` exige al menos `GROQ_API_KEY` u `OPENROUTER_API_KEY`. STT canónico usa exclusivamente `GROQ_API_KEY`.
- La release actual permite HTTP sólo cuando public URL y bind son loopback, incluso con provider configurado; HTTPS sigue obligatorio fuera de loopback. No se permite inventar hostname público ni authority URL como workaround.
- El provider configurado no hace retries ni mirroring. La composición sólo crea el cliente real; una llamada requiere un request explícito.
- El servicio conserva bind único `127.0.0.1:8790` y Cloudflare conserva authority/hot path durante todos estos gates.
- El marker histórico `vps_shadow_real_stt_once = 1` es append-only: no se borra, edita ni reutiliza.
- El canary usó identidad propia: action `vps_persistent_provider_canary_once`, `operationId` nuevo y presupuesto máximo de una llamada. Su marker se insertó antes del request externo y ahora bloquea cualquier retry.
- Provider persistente, preparación ejecutable del canary, llamada canary y cualquier routing/authority son cuatro decisiones distintas. Ninguna habilita automáticamente la siguiente.

## Remediación R1 — Contrato Local Loopback (`complete`)

Con autorización separada se corrigió sólo `loadConfig()` para permitir HTTP cuando **ambos** `FIXVOX_API_PUBLIC_BASE_URL` y `FIXVOX_API_HOST` son loopback, independientemente de mock/provider real. Fuera de ese caso HTTPS sigue obligatorio. Un bind `0.0.0.0` con public URL loopback falla cerrado.

Evidencia local:

- `cloud/fixvox-api/src/config.ts` difiere del runtime aprobado `66652…` únicamente en esta validación y en reutilizar el host ya normalizado;
- config focal 4/4 y LSP sin diagnósticos;
- los 22 tests de app, más jobs/preflight/providers y tres tests de migrations pasaron dentro del unit run;
- el unit run total quedó 33/34 por un test de migración ajeno al cambio: usa version 6 como “unknown” aunque 0006 ya es conocida y recibe `migration_checksum_mismatch:6`; no se reparó fuera de alcance;
- no se construyó bundle/release, no se usó secreto real, no hubo provider call, VPS, restart, deploy, commit ni push.

### Remediación R2 — Candidate Inmutable Exacta (`complete`)

Se construyó localmente desde el archive+manifest aprobado `66652…`, reemplazando sólo `cloud/fixvox-api/src/config.ts`; ningún otro file del checkout dirty entró al bundle.

- Candidate `4075da53c365a8b1`; archive SHA-256 `4075da53c365a8b1fa93bba16899a8c097d8a1378e7d1753ce9606592f5f914a`.
- Manifest SHA-256 `afb6da329985328a6ffaee7ce6b1ef4a891c13f5bc5d94a9d458102f79efb7b7`; 61 files y única diferencia funcional `config.ts` con SHA `ad0f50343d92fc440717c07710443cefc403579b036d868e4169e41c3f32d66a`.
- Dos builds independientes produjeron archive y manifest idénticos; allowlist/privacy pasaron.
- Boot aislado mock HTTP 200 y boot provider-configured con key fixture HTTP 200; provider calls 0 y ningún secreto real.
- Verificación independiente repitió hashes, 61 paths, diff de un file y boot mock.
- Artifacts: `artifacts/fixvox-api-bundles/fixvox-api-4075da53c365a8b1.{tar.gz,manifest.json}` y receipt `artifacts/proxy-latency/vps-provider-loopback-candidate-receipt.json`.
- No hubo VPS, transferencia, promoción, restart, provider real, routing, DNS/Tunnel, authority, commit ni push.

### Remediación R3 — Promoción Code-Only Mock (`complete`)

Candidate `4075da53c365a8b1` fue transferida, instalada inmutable y promovida atómicamente con rollback automático a `66652d0fa6073c26`. La config permaneció mock-only y sin key.

Verificación independiente: manifest y 61 runtime files exactos, schema 6, markers histórico/canary 1/0, service active/enabled, restarts 0, loopback único, health/readiness/Admin 200 y Cloudflare authority. Provider calls 0; sin routing, DNS/Tunnel ni canary. Staging temporal limpiado. Receipt: `artifacts/proxy-latency/vps-provider-loopback-promotion-receipt.json`.

## Gate P1 — Activación Persistente Sin Llamada (`complete`)

**Objetivo:** persistir sólo la credencial Groq en el env protegido, cambiar el servicio de mock a provider configurado y reiniciarlo una vez, sin emitir requests de producto.

**Efectos permitidos con autorización nueva:**

- editar atómicamente `/home/jpsal/.config/dictation-tauri/fixvox-api.env` preservando owner y modo `0600`;
- agregar `GROQ_API_KEY` sin imprimir su valor y cambiar `FIXVOX_API_MOCK_PROVIDERS=true` a `false`;
- reiniciar una vez `fixvox-api.service` bajo rollback automático de config y release;
- ejecutar sólo health/readiness/Admin, listener, PID/restarts, authority, journal allowlisted y contador provider-call externo si existe una fuente redacted.

**Prohibido:** request de bootstrap/transcripción/chat/transform, audio, canary, routing, DNS/Tunnel, bind público, cambio de authority, schema, profile/engine/pricing, release, commit o push.

**Done:** servicio active/enabled sobre `4075da53c365a8b1`, schema 6, un listener loopback, health/readiness/Admin 200, `cloudflare-authority`, provider configurado, cero provider calls y secret absent en output/logs. Los markers permanecen histórico/canary 1/0.

**Rollback:** restaurar atómicamente el env mock-only previo, reiniciar una vez y exigir contratos verdes. Si la credencial pudo exponerse, detener y rotarla fuera de este batch.

**Receipt P1 preflight — 2026-07-22:** JP autorizó P1 y eligió la credencial específica de Fixvox porque las fuentes Fixvox e Infra no coinciden; ningún valor fue mostrado. El preflight remoto confirmó `current=66652…`, rollback `90ca…`, schema 6, marker histórico 1, marker canary 0, profile basic v2/revision 1, tres engines canónicos, pricing `40000`, servicio mock-only, sin key, loopback único, restarts 0, health/readiness/Admin 200 y Cloudflare authority. Antes de transferir el secreto o editar config se detectó `publicBaseUrl=http://127.0.0.1:8790`; el loader rechazaría esa URL con mocks desactivados. Se detuvo fail-closed. Post-check: config no mutada, key ausente, servicio sin restart, provider requests 0 y baseline intacto.

La autorización P1 histórica se consumió en el preflight bloqueado y no se reutilizó. Tras R1-R3, una autorización nueva eligió la credencial Fixvox. Un primer helper falló antes de mutar; post-check dejó current/config/service intactos. El único retry permitido usó un script standalone validado local/remoto y transmitió la key sólo por SSH stdin.

**Receipt P1 complete — 2026-07-22:** current `4075da53c365a8b1`, rollback `66652d0fa6073c26`, schema 6, markers 1/0, provider configurado, key presente en env `0600`, service active/enabled, restarts 0, loopback único, health/readiness/Admin 200 y Cloudflare authority. Verificación independiente confirmó secret absent en journal, backups 0 y provider/product requests 0. Staging limpio. Receipt redacted: `artifacts/proxy-latency/vps-persistent-provider-activation-receipt.json`.

## Gate P2 — Canary Ejecutable Provider-Free (`complete`)

**Objetivo:** preparar y verificar localmente el harness exacto del canary persistente sin acceder al VPS ni llamar al provider.

**Contrato del harness:**

- pin obligatorio a host `srv1761438`, `current -> 4075da53c365a8b1`, schema 6, authority Cloudflare y servicio real no-mock;
- action append-only `vps_persistent_provider_canary_once` y `operationId` único, ambos distintos del smoke histórico;
- preflight provider-free separado que prueba config/profile/engine/pricing y termina con provider calls 0;
- fixture WAV TTS sintética, acotada y no sensible; máximo 1 MiB y 30 s;
- wrapper de `fetch` con `providerCallsMax=1`, cero retries, marker insertado antes del request y receipt redacted;
- cleanup limitado a identidad sintética, binding, reservation/counters y WAV temporal; no borrar marker ni evidencia divergente;
- ningún transcript, audio, key, URL con credenciales, IDs raw o request body en stdout, logs, docs o receipt.

**Checks locales:** tests focales provider/API/ledger, sintaxis, comparación de release pin, dry-run/preflight simulado con fetch bloqueado y privacy sentinel. No se transfiere ni instala el harness en este gate.

**Rollback:** revertir sólo el harness y docs propios de P2; preservar el baseline remoto intacto.

**Receipt P2 — 2026-07-22:** harness production-pinned en `cloud/fixvox-api/tests/vps-persistent-provider-canary.mjs` y tests provider-free en `vps-persistent-provider-canary.test.mjs`. Identidad/action/operation nuevas; current pin `4075da53…`; health/readiness/Admin y service/listener guards; baseline schema/profile/engines/pricing/markers; WAV sintético acotado; marker serializado con advisory lock `91827403` y recheck transaccional; marker insertado antes del request; un request máximo, cero retries, receipt sin transcript/audio/IDs y cleanup sintético. Evidencia: harness 6/6, app/provider + harness 30/30, sintaxis y LSP verdes. No se leyó secreto real, no hubo VPS, transferencia, provider call, canary, routing, DNS/Tunnel ni authority. Receipt: `artifacts/proxy-latency/vps-persistent-provider-canary-harness-receipt.json`.

## Gate P3 — Un Canary Host-Local (`complete`)

**Objetivo:** ejecutar exactamente una transcripción sintética contra el servicio persistente ya activado, sólo por loopback.

**Presupuesto:** una fixture, un `operationId`, un marker y como máximo una llamada externa. Cualquier timeout, HTTP ambiguo o error consume el intento; no retry.

**Done:** HTTP 200, provider calls 1, match semántico acotado, ledger settled, receipt redacted, datos sintéticos limpiados, marker nuevo en 1, servicio/release/config persistente sin cambios durante la llamada y Cloudflare aún authority/hot path.

**Rollback:** si falla el servicio o contrato, volver inmediatamente al env mock-only; si falla sólo el resultado del canary, no repetir, preservar marker/receipt redacted y diagnosticar offline.

**Receipt P3 — 2026-07-22:** fixture local `ddd7cfa3…331f9e`, 4814 ms/212332 bytes. Transfer y syntax-import pasaron; `bun --check` ejecutó el entrypoint y falló antes del gate, sin marker/request. El primer preflight provider-free falló `canary_service_inactive` porque el runner allowlisted omitió DBus/XDG; diagnóstico confirmó fixture/DB/baseline sanos. Con el env de sesión user-systemd allowlisted, el preflight limpio devolvió 200, calls/request 0, marker 0 y cleanup total. La ejecución real posterior ocurrió una sola vez: marker append-only 1 antes del request, transcription requests/provider calls 1, HTTP 200, match true, ledger settled y receipt redacted. Verificación independiente: schema 6, markers 1/1, current/rollback intactos, provider configurado, restarts 0, loopback, health/readiness/Admin 200, authority Cloudflare, identidad/binding/reservation 0 y secret/transcript absent en journal. Staging/WAV limpiados. Receipt SHA-256 `08736c19f38570298ba70eee5f2a6c6e2a9442341b6f6dc6bbdf3ae52dc91761`: `artifacts/proxy-latency/vps-persistent-provider-canary-receipt.json`.

## Gate P4 — Routing O Authority (`out of scope`)

Canary verde no autoriza Tunnel, DNS, endpoint público, tráfico de desktop, porcentaje canary, cambio de authority ni cutover. Eso requiere un plan y autorización nuevos con rollback Cloudflare explícito.

## Preflight Común

Antes de P1, P2 o P3, detenerse si no coinciden exactamente:

- `current -> 4075da53c365a8b1` y rollback `66652d0fa6073c26` disponible e inmutable;
- schema 6, markers histórico/canary en su valor esperado para el gate y `cloudflare-authority`;
- servicio active/enabled, cero automatic restarts y un único listener `127.0.0.1:8790`;
- health/readiness/Admin HTTP 200;
- profile `basic` v2, tres engines canónicos y pricing STT `40000` microUSD/hour;
- recursos por encima de los umbrales del runbook y checkout VPS intocado;
- forma de inyectar/rotar el secreto sin argumentos, stdout, shell history ni repos.

## Stop Conditions

- baseline, release, schema, marker, config, profile, pricing o authority inesperados;
- secreto ausente, inválido, visible o imposible de rotar;
- provider call no explicada, intento previo del marker nuevo o falta de contador confiable;
- bind no-loopback, ruta pública, tráfico inesperado o necesidad de routing/DNS/Tunnel;
- cleanup exigiría borrar evidencia, datos no sintéticos o marker append-only;
- necesidad de dependencia, schema, código de runtime, release, commit/push o segundo intento.

## Siguiente Acción

Ninguna. R1-R3 y P1-P3 quedan completos. P4 routing/authority permanece fuera de alcance y requiere un plan más autorización nuevos; no existe continuidad automática.
