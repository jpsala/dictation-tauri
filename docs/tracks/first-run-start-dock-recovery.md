---
status: complete
updated: 2026-07-25
priority: high
topic: docs/topics/dictation-tauri-foundation.md
related:
  - docs/tracks/first-run-installed-google-validation.md
  - docs/tracks/first-run-welcome-and-sign-in.md
---

# First-Run Start Dock Recovery

## Objetivo

Corregir localmente el handoff final del first-run para que `Empezar` abra el dock de forma confiable.

## Comportamiento observable

- Desde `Todo listo para dictar`, un click en `Empezar` abre el dock y cierra la bienvenida.
- El handoff no requiere repetir Google, vínculo de cuenta ni confirmaciones intermedias.

## Límites

- Diagnóstico e implementación local, provider-free y reversibles; usar dobles o estado sintético para reproducir el handoff.
- No reset, OAuth real, cuenta, audio, dictado, clipboard, STT/provider, instalación, release, deploy, commit ni push.
- Corregir sólo la causa del handoff `ready → dock`; no ampliar onboarding ni rediseñar superficies.

## Criterios de terminado

1. Un test focal reproduce el fallo observado y queda verde con la corrección.
2. `Empezar` solicita abrir el dock una sola vez y la bienvenida se cierra únicamente después del handoff exitoso.
3. La ruta de first-run previa hasta `Todo listo` conserva su comportamiento.

## Checks focales mínimos

```powershell
npx vitest run --config vitest.config.ts tests/onboarding
npm run build
```

Si la corrección toca Rust, agregar sólo el test Rust focal del comando o ventana de dock afectado.

## Cierre

Handoff corregido provider-free: `Empezar` serializa una única apertura del dock, espera confirmación del host y sólo entonces cierra la bienvenida; si falla, la mantiene abierta para reintentar. Tests onboarding focales, build y diagnósticos quedaron verdes. No se tocó Rust ni se ejecutaron operaciones externas.
