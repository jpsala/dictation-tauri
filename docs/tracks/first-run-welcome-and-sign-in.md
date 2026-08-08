---
status: complete
updated: 2026-07-25
priority: high
topic: docs/topics/ui-design-and-impeccable.md
---

# First-Run Welcome And Sign-In

## Objetivo

Dar a una instalación nueva una bienvenida breve que la lleve de Google al dock
en la menor cantidad de pasos posible.

## Comportamiento observable

- Sin una sesión local válida, la app muestra una única pantalla de bienvenida
  con `Continuar con Google`; durante el login, esa misma pantalla comunica que
  debe terminarse en el navegador y continúa automáticamente al recibir el
  resultado.
- Al completar autenticación y vínculo del dispositivo, muestra
  `Todo listo para dictar` con el atajo recomendado y una acción `Empezar` que
  abre el dock.
- Una sesión válida conservada abre directamente el dock; una sesión vencida
  vuelve a pedir autenticación sin presentar al usuario como nuevo.

## Límites

- Reutilizar el login, device link y estado host-owned existentes; React no
  guarda tokens ni decide readiness.
- No agregar tutoriales, configuración previa de micrófono o atajo, dependencias
  ni nuevas pantallas.
- No cambiar el desinstalador, borrar datos locales ni ejecutar OAuth real,
  provider, release o producción durante este trabajo local.

## Criterios de terminado

1. El recorrido provider-free comprobable pasa por `Bienvenida`,
   `Google en curso`, `Todo listo` y `dock`, sin botón manual
   `Ya inicié sesión`.
2. El arranque distingue sesión válida, sesión vencida y ausencia de sesión con
   el comportamiento observable acordado.
3. La UI conserva una sola acción primaria por estado y funciona con teclado,
   foco visible y texto sin recortes.

## Checks focales mínimos

```powershell
npm run test:pipeline -- `
  tests/onboarding/account-first-flow.test.tsx `
  tests/onboarding/tauri-account-gate.test.ts `
  tests/onboarding/setup-readiness-router.test.tsx `
  tests/onboarding/tauri-setup-readiness.test.ts
npm run build
cd src-tauri && cargo test setup_readiness --quiet
```

## Cierre

Implementado provider-free: bienvenida única, handoff Google con polling
automático host-owned, recuperación diferenciada para sesión vencida y
confirmación `Todo listo para dictar` antes de abrir el dock con `Empezar`.
Checks focales: 15/15, build frontend y 6 tests Rust verdes. No quedan gates
externos para este corte local.
