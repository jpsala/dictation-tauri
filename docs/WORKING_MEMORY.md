# Working Memory

Router operativo corto; el detalle durable vive en topics, tracks, specs y
decisiones.

Última actualización: 2026-08-14.

## Foco Único De Ejecución

- **Estado:** `complete`.
- **Referencia:** `docs/tracks/transcription-quality-program.md`.
- **Siguiente acción:** Seleccionar el próximo frente desde Frentes Retomables.

## Contrato Congelado

- `profiles` y `profile_versions` son la autoridad única. La metadata de
  profile/version queda anidada fuera de la definición canónica y la mutación
  envía únicamente `definition`.
- El catálogo seguro vive en
  `GET /product/v1/control-room/laboratory/catalog`: cuatro recipes STT y tres
  de postprocess desde `evaluation-recipes.ts`; Gate B v1 conserva su par
  histórico y Gate B v2 usa `plain` + `conservative-timing`. IDs encontrados en
  artifacts no son autoridad seleccionable.
- Runtime sólo conserva `engineId`/`promptId`; el idioma es
  `defaults["transcript.language"]`.
- El lifecycle server-owned está completo en producción: issue opaco, consume
  único, reserva atómica por request, completion/abort terminal e idempotencia.
  Gate A completó `12/12` con `4992/5000` microusd y tres refs canónicos; Gate B
  completó `6/6` con `4998/5000` microusd. No quedan ejecuciones activas.
- Gate A exige igualdad exacta con `GATE_A_DEFINITION`; Gate B deriva sólo de
  ese Gate A completo e identity-bound; vocabulary requiere snapshot inmutable
  por ID.
- `configured`, `resolved` y `observed` son independientes y muestran
  `null`/`unavailable` honestamente.
- Preview usa `add`/`remove`/`change` y `candidateFingerprint`; un diff stale no
  habilita publicación. Empty/no-op tienen estado explícito.
- Receipt `success` y refresh fallido son resultados separados.
- Roles, sesión y recursos no disponibles bloquean de forma honesta. Audio,
  gold, raw, final, paths, secretos y payloads de provider nunca aparecen en
  proyecciones públicas.
- La ventana desktop mantiene default/mínimo `720x620` mediante resize nativo.
  El smoke Tauri real final pasó `11/11`: Settings→Laboratory, cinco workspaces,
  `720x620`, `900x700`, 200% zoom, provider-free y cero
  bootstrap/device/cloud/provider.

## Gates Ejecutados Y Cierre Actual

- Producción corre el release inmutable `6ac7ed0a2a88f0d0`, archive SHA-256
  `6ac7ed0a2a88f0d07f7cf7604d885ea8e81edd1ca854e450c67575f3ba064990`.
  `c1154baf25dbe005` es el rollback inmediato schema-9;
  `2a49be9eccf4ce17`, `0434f2cf3d0a6607`, `bc1a3e5cadba1903` y
  `650b4c8f6ed00a2a` siguen preservados; `11bf651ce5d983b6` no es ejecutable
  directamente contra schema 9.
- Producción permanece schema `9`, migrations `0001..0009` y marker
  `laboratory_execution_grants`; service active/enabled, `NRestarts=0`,
  listener único `127.0.0.1:8790`, health/readiness local+público verdes y
  `cloudflare-authority`. No hubo migración, backfill, SQL manual, env, DNS ni
  tunnel.
- El runtime desktop vuelve a proyectar el profile productivo `pro` desde
  `runtimePolicy.profile.key` y `capabilities.postprocess`. STT server-owned
  deriva señales privadas de prosodia desde timestamps y las entrega sólo al
  postprocess `openai/gpt-oss-120b`; no se serializan en receipts ni UI. Un
  dictado sintético real único confirmó `fixvox-cloud` + postprocess
  policy-owned, sin fallback, y materializó una lista numerada.
- La mutación aprobada owner→owner creó audit `sequence=11` con
  `safe_metadata` JSONB `object`; owner count siguió `1` y los audits históricos
  `sequence=9/10` permanecieron intactos como JSONB `string`.
- Gate A completó `12/12`, sin retries, postprocess ni delivery. El ledger
  productivo quedó en `4992/5000` microusd; completion acuñó tres refs canónicos
  y audit `sequence=14` como JSONB `object`.
- Un primer setup Gate B fue abortado antes de spawn por un verifier local que
  incluyó `candidateId` donde el servidor proyecta `{sampleId, rawRef}`:
  `0/6` requests, costo `0/5000`, cero provider calls. El packet sustituto
  aprobado corrigió sólo esa proyección.
- Gate B v1 completó exactamente `6/6` requests secuenciales, sin retries, STT,
  audio, delivery, vocabulary ni mutación de profile. El ledger quedó en
  `4998/5000` microusd y audit `sequence=20` como JSONB `object`.
- Gate B v2 también completó una única matriz `3×2`: `6/6`, `4998/5000`
  microusd, audit `sequence=23` JSONB `object`, cero retries y cero requests STT.
  Baseline `plain` quedó `3/3 accepted`, safety `3/3`, WER `0.2206`, CER
  `0.1295`, latencia media `1114 ms`. `conservative-timing` quedó `2/3
  accepted`, un fallback por `material_omission`, `9` omissions, safety `2/3`,
  mismo WER, CER `0.1299` y latencia `1149 ms`.
- Decisión: no promover `conservative-timing`. No mejora WER y degrada safety,
  CER y latencia. El fallback preservó el raw privado; no quedan ejecuciones
  Gate B activas.
- La UI separa recursos y razones de indisponibilidad; owner stale conserva
  catálogo/preview/grants bajo sus gates y provider-free local no depende de
  recent-auth. Los planes Gate A/B son matrices bloqueadas. No se publicó
  installer desktop.

## Frentes Retomables

| Frente | Estado | Abrir primero |
| --- | --- | --- |
| Calidad de transcripción | Gate B v1 y v2 cerrados; candidato metadata v2 no promovido por regresión semántica | `docs/tracks/transcription-quality-program.md` |
| Reliability/truthfulness | local complete; Phase 4 gated | `docs/tracks/fixvox-minimal-reliability-and-truthfulness.md` |
| Dock/Wispr | listo para retomar | `docs/tracks/dock-skins-visual-refinement.md` |
| Cloud/runtime | referencia cerrada | Spec 019 y `docs/topics/fixvox-cloud-runtime-port.md` |
| Operaciones externas | sin batch activa | `docs/tracks/standard-product-ux-external-operation-gate-plan.md` |
| Pi Chat | pausado | `docs/tracks/pi-chat-conversation-first-ux.md` |
| Error recovery | listo para retomar | `docs/tracks/dictation-error-recovery-hardening.md` |
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
