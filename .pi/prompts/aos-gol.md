---
description: Ejecutar el proximo lote chico y verificable sin until-done
---
Gol lite.

Fallback de prompt: si esperabas que la extension command `/aos-gol` prepare un `/until-done`, ejecuta `/reload` y vuelve a usar `/aos-gol <objetivo>`. Si JP dijo `aos-gol`/`aos-gol-lite` como comando conversacional, usa la skill local `aos-gol-lite`.

Usa la skill local `aos-gol-lite`: lee contexto minimo, nombra el proximo lote chico, ejecuta cambios acotados, verifica con el comando mas barato suficiente y persiste solo conocimiento durable. No actives `/until-done`, no prepares handoff y no abras thread nuevo salvo pedido explicito.
