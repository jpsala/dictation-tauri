---
name: cerrar-sesion
description: Close the current work session operationally by promoting durable knowledge into repo docs, updating live continuity, regenerating the context index, and running the contextual audit without saving a transcript. Use when the user says `cerrar sesion`.
---

# Cerrar Sesion

Cerrar el trabajo actual sin perder valor durable.

Fuente canonica: `docs/topics/docs-knowledge-system.md`, seccion `Cierre Y Continuacion De Sesion`.

## Flujo

1. Ejecutar el cierre de valor definido en la fuente canonica.
2. Regenerar `docs/.generated/context-index.md`.
3. Correr `bun scripts/agent-context-audit.ts`.
4. Responder con sintesis compacta.

## Reglas

- La memoria principal queda en archivos versionados del repo.
- El cierre debe dejar claro el estado actual y el siguiente paso.
- Si una validacion falla, reportar el blocker en vez de ocultarlo.

## No Hacer

- No abrir thread nuevo.
- No crear prompt de handoff salvo que el usuario cambie a `continuar sesion`.
- No guardar transcript largo.
