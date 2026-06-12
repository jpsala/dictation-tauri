---
name: sigamos
description: Continue the active work in the current Codex session without doing session closeout, handoff creation, new thread creation, or asking the next session to start with gol. Use when the user says `sigamos` or explicitly wants to keep momentum in the same thread.
---

# Sigamos

Continuar el trabajo activo en esta misma sesion.

## Flujo

1. Mantener el objetivo actual y el contexto de la sesion.
2. No ejecutar cierre de valor.
3. No crear handoff, thread nuevo ni prompt pegable.
4. No pedir `gol` salvo instruccion explicita del usuario.
5. Seguir con el siguiente paso concreto usando los docs vivos ya existentes.

## Comportamiento Esperado

- Usar la track, topic o spec activa si ya existe.
- Si el repo ya tiene contexto suficiente en el hilo actual, no reabrir toda la ruta caliente.
- Si durante el trabajo aparece conocimiento durable, promoverlo solo cuando realmente cambie una regla o el estado vivo.

## No Hacer

- No tratar `sigamos` como alias de `continuar sesion`.
- No cerrar la sesion por cuenta propia.
- No crear transcript.
