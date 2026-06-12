---
name: continuar-sesion-con-gol
description: Perform the same closeout and handoff flow as `continuar sesion`, but explicitly ask the new session to start with `gol` for the next agreed batch. Use when the user says `continuar sesion con gol`, `continuar con gol`, or `siguiente`.
---

# Continuar Sesion Con Gol

Cerrar con valor y pedir que la sesion nueva arranque con `gol`.

Fuente canonica: `docs/topics/agentic-project-os-lite.md`, seccion `Continuar Sesion Con Gol`.

## Flujo

1. Ejecutar el flujo de `continuar sesion`.
2. Persistir el plan y el proximo lote en docs vivos.
3. Incluir en el handoff o prompt una instruccion explicita: arrancar con `gol`.

## Aliases

- `continuar con gol`
- `siguiente`

## Regla

Usar esta skill solo cuando conviene cortar contexto y el proximo lote ya esta acordado.

## No Hacer

- No seguir trabajando en la misma sesion como si fuera `sigamos`.
- No omitir la instruccion de arrancar con `gol`.
