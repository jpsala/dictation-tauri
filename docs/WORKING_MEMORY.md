# Working Memory

Router operativo corto; el detalle durable vive en topics, tracks, specs y
decisiones.

Última actualización: 2026-08-14.

## Foco Único De Ejecución

- **Estado:** `blocked`.
- **Referencia:** `docs/tracks/transcription-quality-program.md`.
- **Bloqueo:** Gate B no es emitible porque Gate A sigue `active` sin completion receipt ni raw refs canónicos; la UI no carga recipes mientras exige reautenticación.
- **Siguiente acción:** implementar el cierre server-owned de Gate A y resolver la carga segura del catálogo UI; no mutar PostgreSQL manualmente ni emitir Gate B.

## Contrato Congelado

- `profiles` y `profile_versions` son la autoridad única. La metadata de
  profile/version queda anidada fuera de la definición canónica y la mutación
  envía únicamente `definition`.
- El catálogo seguro vive en
  `GET /product/v1/control-room/laboratory/catalog`: exactamente cuatro recipes
  STT y dos de postprocess desde `evaluation-recipes.ts`. IDs encontrados en
  artifacts no son autoridad seleccionable.
- Runtime sólo conserva `engineId`/`promptId`; el idioma es
  `defaults["transcript.language"]`.
- Grants server-owned están desplegados y disponibles en producción. Gate A
  emitió y consumió exactamente un grant; el ledger reservó `12/12` requests y
  `4992/5000` microusd de forma atómica. Quedaron `0` grants open y `1`
  consumed; issue/consume persistieron `safe_metadata` como JSONB `object`.
- Gate A exige igualdad exacta con `GATE_A_DEFINITION`; Gate B deriva sólo de
  un Gate A completo `12/12`; vocabulary requiere snapshot inmutable por ID.
- `configured`, `resolved` y `observed` son independientes y muestran
  `null`/`unavailable` honestamente.
- Preview usa `add`/`remove`/`change` y `candidateFingerprint`; un diff stale no
  habilita publicación. Empty/no-op tienen estado explícito.
- Receipt `success` y refresh fallido son resultados separados.
- Roles, sesión y recursos no disponibles bloquean de forma honesta. Audio,
  gold, raw, final, paths, secretos y payloads de provider nunca aparecen en
  proyecciones públicas.
- La ventana desktop mantiene default/mínimo `720x620` mediante resize nativo;
  el smoke Tauri real confirmó `Responding=true`, cinco workspaces, cero
  overflow a `720x620`/`900x700` y 200% zoom, sin Win/Super, menú de sistema o
  snap.

## Gates Ejecutados Y Bloqueos Actuales

- El fix audit de `d9aa52006cb5ea09fd58439e62b493d2a6ec7f42` corre en el
  release inmutable `bc1a3e5cadba1903`; archive SHA-256
  `bc1a3e5cadba190307b8f04e4d530e0c0e337e1ed9d5d55d2e67e4a838a94b01`.
  `650b4c8f6ed00a2a` quedó preservado como rollback schema-9. No hubo schema,
  migración, backfill, env, DNS ni tunnel.
- Producción permanece schema `9`, migrations `0001..0009` y marker
  `laboratory_execution_grants`; service active/enabled, `NRestarts=0`,
  listener único `127.0.0.1:8790`, health/readiness local+público verdes y
  `cloudflare-authority`.
- La mutación aprobada owner→owner creó audit `sequence=11` con
  `safe_metadata` JSONB `object` y contenido lógico exacto `{role:"owner"}`.
  Owner count sigue `1`; los audits históricos `sequence=9/10` permanecen
  intactos como JSONB `string`.
- Gate A aprobado terminó `12/12`, sin retries, postprocess ni delivery. El
  artifact privado/ignored `lab-gate-a-20260814-bc1a3e5c` contiene 3 samples ×
  4 recipes, 12 resultados sin errores y costo local estimado USD `0.003724`.
  El ledger productivo registró `4992/5000` microusd.
- Gate B no fue emitido ni ejecutado. El servidor conserva la ejecución Gate A
  como `active`, `completed_request_count=null` y `canonical_raw_refs=[]`; su
  contrato exige `completed`, `12` y tres raw refs canónicos. No existe ruta de
  completion en el runtime desplegado.
- El replay final provider-free produjo 2 resultados sin errores, provider
  disabled y `maxRequests=0`. La app Tauri real mostró el Gate A como
  `completed/available` con cuatro candidatos y mantuvo `configured`
  disponible, `resolved`/`observed` honestamente `Not observed`.
- Limitaciones UI: con la sesión real en estado `Reauthentication required`,
  Experiments carga corpus pero no las recipes del catálogo y no habilita el
  job provider-free. El smoke automatizado llega al WebView pero selecciona un
  target Settings `about:blank`; la fuente limpia pinneada a `d9aa520` tampoco
  compila Tauri por drift Rust preexistente. No se publicó installer desktop.

## Frentes Retomables

| Frente | Estado | Abrir primero |
| --- | --- | --- |
| Calidad de transcripción | deploy cloud y Gate A `12/12` cerrados; Gate B bloqueado por completion server-owned ausente y catálogo UI gated por reauth | `docs/tracks/transcription-quality-program.md` |
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
