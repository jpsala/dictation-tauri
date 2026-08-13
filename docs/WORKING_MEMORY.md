# Working Memory

Router operativo corto; el detalle durable vive en topics, tracks, specs y
decisiones.

Última actualización: 2026-08-13.

## Foco Único De Ejecución

- **Estado:** `complete`.
- **Referencia:** `docs/tracks/transcription-quality-program.md`.
- **Siguiente acción:** autenticar un principal con rol Control Room para cargar perfiles reales en Dictation Laboratory; cualquier corrida Gate A provider-real sigue requiriendo aprobación explícita en el punto de riesgo.

## Estado Vivo

- Wave 1 provider-free conserva metadata STT privada bounded detrás de refs;
  receipts públicos quedan redacted. Fallbacks segmentarios usan máximo
  `no_speech_prob` y mínimo `avg_logprob`.
- Identidad separa `configured`, `resolved` y `observed`; un prompt ID nunca se
  presenta como hash de cuerpo.
- Gate A quedó fijado a tres samples × cuatro recipes, `12` requests,
  `USD 0.005`, audio prep único, secuencial y stop-on-first-error. Checks
  provider-free completos y cero red sin autorización.
- Dictation Laboratory quedó implementado en Tauri con cinco workspaces,
  gateway privado allowlisted, replay provider-free `2/2`, adjudicación
  versionada y promoción a draft. El gate real muestra exactamente `3 × 4`,
  `12` requests y `USD 0.005`, pero no puede iniciar sin grant externo exacto.
- Corte server-owned inicial: backup cifrado
  `fixvox-20260812T191930155462815Z.dump.zst.age`, schema PostgreSQL `6→8`
  mediante migraciones aditivas `0007`/`0008`.
- Deploy Gate B inicial: release `a909ece64107d62d`, rollback histórico
  `f86ee896478cbd03`.
- Batch 3D autorizado y publicado: release inmutable actual
  `9279c043233eada6`, rollback inmediato `a909ece64107d62d`. Sin migraciones,
  provider calls ni cambios de prompt/modelo/policy. Servicio active/running,
  `NRestarts=0`, listener loopback y health/readiness local más health público
  verdes con `cloudflare-authority`.
- Gate A completó `12/12`: `short-auto`/`short-es` empataron y dominaron al
  prompt rico; baseline corta/auto permanece.
- Gate B completó `6/6`: plain mejoró WER/CER pero omitió contenido; prosodia
  degradó ambos y obedeció una petición dictada. No se promueve postprocess ni
  prosodia; los scores históricos no se reinterpretan.
- Batch 3C agregó una única autoridad pura en `cloud/fixvox-core`: alineación
  token a token, receipt redacted y fallback raw. Smoke histórico: cuatro casos
  seguros aceptados y los dos peligrosos rechazados sin red.
- Batch 3D publicó sólo esa defensa. Cualquier benchmark posterior requiere
  hipótesis medible y autorización nueva.
- Batch 3E/3F provider-free descubrió `6.546` pares reales locales, `5.682`
  cotidianos usables y seleccionó determinísticamente `18` (`6`
  audio+raw+final, `12` raw+final). JP adjudicó `12/12`: `10` referencias
  aprobadas (`raw=2`, `final=3`, `equivalent=5`) y `2` rechazadas por errores
  STT ya compartidos entre raw/final. Artifacts privados y summary redacted:
  `artifacts/transcription-quality/everyday-prototype-39a746e23c60/`.
- Batch 3G replayó siete correcciones técnicas sin provider/STT: all-auto llevó
  entidades `0/8→8/8`; JP promovió `5 automatic` y `2 ask`. El snapshot
  aprobado dejó WER `0.25094→0.15964`, CER `0.16926→0.14375` y entidades
  automáticas `0/8→5/8`; `18` controles cotidianos tuvieron cero cambios.
  Persistencia de producto todavía no aplicada.
- Batch 3H agregó experimentación personal host-owned: cuatro recetas
  versionadas, alcance próximo dictado o sesión, one-shot atómico, precedencia
  conservadora y recipe ID/version/source en telemetry redacted. Estado sólo en
  memoria; sin provider calls ni policy/account changes. Smoke Tauri real aplicó
  `Literal` al próximo dictado sin ejecutar dictado ni delivery.
- Batch 3I agregó Dictation Laboratory desktop-first sobre profiles server-owned:
  builder, validate/preview bounded, apply/rollback/assignment gated y
  comparación provider-free de history redacted. Build, Rust, cloud baseline y
  tests focales pasan. Smoke Tauri abre la ventana; el principal actual recibe
  `DICTATION_LAB_UNAUTHORIZED`. Deploy y role binding siguen sin ejecutar.
- Reliability/truthfulness quedó cerrado localmente; evidencia y gates de
  Phase 4 viven en su track.
- Dictation Tauri y Control Room son el producto canónico; `C:/dev/fixvox`
  queda como referencia de comportamiento Fixvox-like.
- Cloud/self-hosted, Checkpoint F, runtime OMP de Fixvox Admin, desktop parity,
  error recovery, History, mixed-DPI y el último release instalado permanecen
  cerrados en sus tracks/specs canónicos. Operaciones reales nuevas, provider,
  VPS, DNS, deploy, instalación y release siguen gated.
- Standard Product UX cerró su operación local. Pi Chat Batch 2, App Audit y el
  roadmap de usuarios registrados están pausados hasta nueva priorización.
- La evidencia detallada no se duplica aquí: permanece en las tracks, specs,
  artifacts y topics enlazados por el índice.

## Frentes Retomables

| Frente | Estado | Abrir primero |
| --- | --- | --- |
| Calidad de transcripción | activo; Batch 3E listo para adjudicar | `docs/tracks/transcription-quality-program.md` |
| Reliability/truthfulness | local completo; Phase 4 gated | `docs/tracks/fixvox-minimal-reliability-and-truthfulness.md` |
| Dock/Wispr | listo para retomar | `docs/tracks/dock-skins-visual-refinement.md` |
| Cloud/runtime | referencia cerrada | Spec 019 y `docs/topics/fixvox-cloud-runtime-port.md` |
| Operaciones externas | sin batch activa | `docs/tracks/standard-product-ux-external-operation-gate-plan.md` |
| Pi Chat | pausado | `docs/tracks/pi-chat-conversation-first-ux.md` |
| Error recovery | listo para retomar | `docs/tracks/dictation-error-recovery-hardening.md` |
| App audit | absorbido por el cierre local | `docs/tracks/app-audit-autonomous-implementation-plan.md` |
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
