---
name: realinear-os
description: Audit and repair drift in the repo's agentic and documentation layer without touching product code unless the user explicitly asks for it. Use when the user says `realinear os`, `auditar sistema agentico`, or `reparar sistema agentico`.
---

# Realinear OS

Auditar y reparar la capa agentica del repo.

Fuente canonica: `docs/topics/agentic-os-operations.md`, seccion `Comando realinear os`.

## Flujo

1. Abrir la fuente canonica.
2. Mantener el alcance en la capa agentica salvo pedido explicito.
3. Corregir drift seguro.
4. Regenerar indice y correr audit.
5. Reportar correcciones, pendientes y resultado.

## No Hacer

- No tocar producto, arquitectura de runtime, datos ni deploy salvo pedido explicito.
- No borrar memoria potencialmente util sin integrarla o preguntar.
