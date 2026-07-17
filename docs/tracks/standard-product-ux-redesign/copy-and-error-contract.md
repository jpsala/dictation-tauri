---
status: complete
updated: 2026-07-17
batch: standard-product-ux-redesign-1
scope: docs-only
---

# Copy And Error Contract

**Status:** Batch 1 contract; Spanish-first, docs-only, provider-free.

## Copy rules

- Use Spanish in a single experience. Technical English is reserved for explicitly expanded advanced diagnostics.
- Name the user outcome, not the infrastructure. Prefer `No pudimos conectar` over a route, provider, policy, or status code.
- Each interactive setup/error screen has exactly one primary action. Automatic progress screens have none. Secondary actions explain safe escape; they do not compete with recovery.
- Never show `deviceId`, `installId`, `host-owned`, `policy`, `preflight`, runtime route, provider/model, token, raw account identity, raw browser callback detail, or raw error payload in normal copy.
- Keep functional body text at least 13–14 px with line-height at least 1.35; status is not color-only; focus and keyboard operation remain visible.

## Normal first-run copy

| State | Title / visible status | Supporting copy | Primary CTA | Secondary CTA |
| --- | --- | --- | --- | --- |
| Checking | `Preparando Dictation.` | `Estamos comprobando que todo esté listo.` | — | `Salir` |
| Welcome | `Dictation te ayuda a escribir con la voz.` | `Iniciá sesión para configurar esta computadora y empezar a dictar.` | `Continuar con Google` | `Salir` |
| Browser handoff | `Abrimos el navegador para iniciar sesión.` | `Cuando termines, volvé a esta ventana.` | `Ya inicié sesión` | `Cancelar` |
| Account linking | `Configurando tu cuenta.` | `Esto puede tardar unos segundos.` | — | `Salir` |
| Microphone | `Configurá el micrófono.` | `Necesitamos acceso para capturar tu voz.` | `Permitir micrófono` | `Salir` |
| Shortcut | `Elegí cómo iniciar el dictado.` | `Podés usar el atajo recomendado o cambiarlo ahora.` | `Usar atajo recomendado` | `Cambiar atajo` |
| Ready | `Todo listo para dictar.` | `Usá tu atajo cuando quieras empezar.` | `Probar dictado` | `Abrir ajustes` |

## Error and recovery copy

| Category | Title / visible status | Supporting copy | Primary CTA | Safe secondary CTA | Prohibited detail |
| --- | --- | --- | --- | --- | --- |
| Offline | `No pudimos conectarnos.` | `Revisá tu conexión e intentá de nuevo.` | `Reintentar` | `Volver` | Host, route, status code |
| OAuth cancelled | `No se completó el inicio de sesión.` | `Podés intentarlo de nuevo cuando estés listo.` | `Intentar de nuevo` | `Volver` | Browser callback/state |
| OAuth expired | `La sesión de inicio venció.` | `Iniciá sesión de nuevo para continuar.` | `Iniciar sesión de nuevo` | `Volver` | Nonce, token, expiry timestamp |
| Account not authorized | `Esta cuenta no tiene acceso a Dictation.` | `Probá con otra cuenta o consultá a quien administra el acceso.` | `Usar otra cuenta` | `Cerrar` | Role, allowlist, policy, account ID |
| Device binding conflict | `No pudimos preparar este dispositivo.` | `Intentalo de nuevo o usá otra cuenta.` | `Intentar de nuevo` | `Usar otra cuenta` | Existing device/account/binding IDs |
| Policy unavailable | `El servicio no está disponible por ahora.` | `Esperá un momento e intentá de nuevo.` | `Reintentar` | `Volver` | Policy, preflight, runtime fields |
| Microphone denied | `Necesitamos acceso al micrófono para dictar.` | `Habilitalo en los permisos de tu sistema para continuar.` | `Abrir permisos` | `Salir` | Native error payload |
| Service unavailable | `El servicio está temporalmente no disponible.` | `No se hizo ningún cambio. Intentá de nuevo en unos minutos.` | `Reintentar` | `Volver` | Provider, model, route, raw upstream error |

## Settings and Control Room vocabulary

| Prefer | Avoid in normal user surfaces | Where technical detail belongs |
| --- | --- | --- |
| `Cuenta` | `Cloud`, `registro de dispositivo`, `policy` | Avanzado / System advanced |
| `Dispositivo` | `deviceId`, `installId`, `binding` | Safe diagnostic report / authorized operator view |
| `Estado del servicio` | `preflight`, `runtime`, endpoint names | Avanzado / System advanced |
| `Planes y acceso` | `profiles`, `variants`, backend entities | Control Room task views; technical entities in Sistema avanzado |
| `Comportamiento` | engines/prompts as primary navigation | Control Room; engine/prompt details in Sistema avanzado |
| `Analizar con Pi` | `Chat` as primary navigation | Contextual Control Room action |

## Recovery behavior

- A retry repeats only the interrupted safe operation and communicates progress.
- `Volver` returns to the last safe completed state, not an infrastructure dashboard.
- `Cancelar` clears only the in-progress browser handoff.
- `Salir` preserves any valid or partial linked context and the incomplete host-owned setup phase. The next launch revalidates and resumes it.
- Microphone permission is required before shortcut setup and `ready`; no copy may imply a limited ready state.
- Copy may mention that no change was made only when the host/cloud contract can prove it.

## Acceptance assertions

- All normal first-run and Settings copy is Spanish-first and contains no internal terminology.
- Every interactive error category has a human explanation, exactly one recovery action, and a safe exit.
- Screen-reader labels describe current status and CTA outcome; color alone never communicates the category.
- Diagnostic copy is redacted and opt-in; it cannot reveal credentials or raw sensitive content.
