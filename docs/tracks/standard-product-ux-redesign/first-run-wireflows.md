---
status: complete
updated: 2026-07-17
batch: standard-product-ux-redesign-2
scope: docs-only
---

# First-Run Wireflows

<!-- markdownlint-disable MD013 -->

## Happy path

```text
[Bienvenida]
  Dictation te ayuda a escribir con la voz.
  [Continuar con Google]  Salir
          │
          ▼
[Inicio de sesión en navegador]
  Abrimos el navegador para iniciar sesión.
  [Ya inicié sesión]  Cancelar
          │ validated host return
          ▼
[Configurando tu cuenta]
  Progress only. Salir
          │ automatic account/device link
          ▼
[Configurá el micrófono]
  [Permitir micrófono]  Salir
          │ permission granted
          ▼
[Elegí cómo iniciar el dictado]
  [Usar atajo recomendado]  Cambiar atajo
          │ registered host shortcut
          ▼
[Todo listo para dictar]
  [Probar dictado]  Abrir ajustes
```

The step indicator reads `Cuenta`, `Micrófono`, `Atajo`, and `Listo`. It shows
progress but is not clickable navigation. Automatic states show an indeterminate
progress treatment with no primary CTA.

## Compact Tauri wireframe

```text
┌──────────────────────────────────────────────┐
│ Dictation                         2 de 4      │
│                                              │
│ Configurá el micrófono                         │
│ Necesitamos acceso para capturar tu voz.       │
│                                              │
│ [ Permitir micrófono                       ]   │
│                                              │
│ Salir                                         │
└──────────────────────────────────────────────┘
```

- Target is a calm, single-column panel. It has no side rail, raw account
  identity, device data, runtime status, or browser URL.
- The primary action spans the practical content width. A secondary exit is a
  text button below it, never a competing filled button.
- At a narrow height, the supporting copy wraps before the CTA; the CTA remains
  visible without sticky overlays.

## Browser handoff and resume

| Situation | Visible screen | Primary action | Safe secondary action | Resume behavior |
| --- | --- | --- | --- | --- |
| Browser opened | `Abrimos el navegador…` | `Ya inicié sesión` | `Cancelar` | Host rechecks opaque handoff after return or restart |
| User cancels in browser | `No se completó…` | `Intentar de nuevo` | `Volver` | Clears only the handoff and returns to Bienvenida |
| Handoff expires | `La sesión… venció` | `Iniciar sesión de nuevo` | `Volver` | Clears stale handoff before a new browser flow |
| Restart during link | `Preparando Dictation` | none | `Salir` | Host validates the persisted phase and resumes progress or a redacted recovery state |
| User exits at microphone or shortcut | Current setup panel | state primary | `Salir` | Setup remains incomplete and resumes at the last host-owned safe phase |

## Recovery wireflow

```text
interrupted state
      │
      ├── connection failure ──> No pudimos conectarnos
      │                         [Reintentar] [Volver]
      ├── access denial ──────> Esta cuenta no tiene acceso
      │                         [Usar otra cuenta] [Cerrar]
      ├── device conflict ────> No pudimos preparar este dispositivo
      │                         [Intentar de nuevo] [Usar otra cuenta]
      ├── service/policy ─────> El servicio no está disponible por ahora
      │                         [Reintentar] [Volver]
      └── microphone denied ──> Necesitamos acceso al micrófono
                                [Abrir permisos] [Salir]
```

`Volver` restores the interrupted safe state, never a diagnostics or legacy
Cloud panel. `Salir` preserves partial host-owned context. No recovery route
uses a Repair, Refresh, raw error, device ID, policy, or provider label.

## Logout flow

Logout is available only from `Settings → Cuenta`, after a linked account exists.
It is not part of first-run navigation.

```text
[Cuenta]
  Signed-in identity, plan summary, devices
  …
  Cerrar sesión
      │
      ▼
[Confirmación inline]
  Vas a cerrar sesión en esta computadora.
  [Cerrar sesión]  Cancelar
      │
      ▼
[Bienvenida]
```

The confirmation explains that local setup may be resumed only after a new valid
account context is established. It never displays raw account or device IDs.

## Interaction and accessibility notes

- Enter activates the one primary action; Escape uses the safe secondary action
  only when it cannot discard a valid context.
- Progress states announce their status once and do not repeatedly interrupt a
  screen reader.
- Browser handoff retains keyboard focus in the app on return and announces the
  next redacted state.
- Permission-denied focus moves to the `Abrir permisos` action after host return.

<!-- markdownlint-enable MD013 -->
