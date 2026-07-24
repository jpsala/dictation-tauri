---
status: complete
updated: 2026-07-24
priority: high
execution_route: balanced
topic: docs/topics/ui-design-and-impeccable.md
---

# No-Speech Transient Recovery

## Objetivo

Convertir una grabación sin voz en un aviso temporal, compacto y no bloqueante, en lugar de un error genérico persistente.

## Comportamiento observable

- Al no detectarse voz, el dock vuelve a `Listo` y muestra `No te escuché` sin exponer mensajes técnicos.
- El aviso queda anclado al dock, no roba foco ni se presenta como una ventana normal, y ofrece `Grabar de nuevo` más cierre visible y con `Esc`.
- El aviso desaparece aproximadamente a los 8 segundos; el temporizador se pausa mientras el usuario interactúa con él.
- `Grabar de nuevo` cierra el aviso e inicia una captura nueva; cerrar o esperar sólo descarta el aviso.

## Límites

- Cubrir únicamente los resultados de no-speech locales o informados por el servicio.
- No rediseñar otras categorías de error, Settings, onboarding, delivery, selección ni Assistant.
- No agregar dependencias ni ejecutar micrófono, provider, release o producción.

## Criterios de terminado

1. Ambos resultados de no-speech llegan a la UI como aviso temporal y nunca como `failed`, `Needs attention` ni error técnico crudo.
2. Retry, cierre, `Esc` y timeout tienen el comportamiento observable acordado sin bloquear el dock.
3. El aviso usa sólo el espacio necesario y una captura provider-free confirma que no aparece como la ventana grande actual.

## Checks focales mínimos

```powershell
npm run test:pipeline -- tests/voice-dock/voice-dock-ui.test.tsx tests/voice-dock/companion-state.test.ts tests/voice-dock/companion-view.test.tsx
npm run build
cd src-tauri && cargo test companion_window --quiet
```

Además, capturar una sola evidencia visual provider-free del estado `No te escuché`.

## Resultado

Implementado el aviso compacto `No te escuché` para no-speech local y del servicio. El dock vuelve a `Listo`; retry, cierre, `Esc`, timeout de 8 s con pausa por interacción y ventana nativa no enfocada/taskbar-free quedaron cubiertos. Evidencia provider-free: `artifacts/user-facing-error-experience/no-speech-notice.png`.
