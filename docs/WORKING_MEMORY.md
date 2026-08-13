# Working Memory

Router operativo corto; el detalle durable vive en topics, tracks, specs y
decisiones.

Última actualización: 2026-08-13.

## Foco Único De Ejecución

- **Estado:** `waiting_gate`.
- **Referencia:** `docs/tracks/transcription-quality-program.md`.
- **Gate:** autorización provider-real nueva para `3 × 4`, `12` requests y `USD 0.005`.
- **Siguiente acción:** presentar el gate exacto a JP antes de cualquier provider call.

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
- El endpoint de execution grants responde
  `authoritative_one_shot_grant_unavailable`; provider-real falla antes de
  spawn/red sin consumo atómico de grant autorizado.
- Gate A exige igualdad exacta con `GATE_A_DEFINITION`; Gate B y vocabulary son
  unavailable sin prerrequisitos exactos.
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

## Gates No Afirmados

No se registra como completado auth mutation contra PostgreSQL, Gate B,
provider-real, deploy, release, publicación ni cambio de policy. El cierre
provider-free quedó validado; provider/OAuth real, cuentas, VPS, DNS,
instalación y acciones destructivas siguen gated.

## Frentes Retomables

| Frente | Estado | Abrir primero |
| --- | --- | --- |
| Calidad de transcripción | cierre provider-free validado; próximo batch espera gate provider-real | `docs/tracks/transcription-quality-program.md` |
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
