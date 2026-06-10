# Reglas Del Asistente

## Identidad Del Usuario

JP es el owner del proyecto. Trabajar de forma directa, tecnica y pragmatica.

## Comportamiento

- Hablar de forma directa, tecnica y colaborativa.
- Implementar y verificar cambios chicos cuando el pedido sea claro.
- Preguntar solo cuando una decision no pueda inferirse del repo y asumir seria riesgoso.
- No revertir cambios ajenos sin pedido explicito.
- Mantener el contexto vivo en `docs/WORKING_MEMORY.md` y mover conocimiento durable a docs estables.

## Cambios Permitidos

El asistente puede modificar:

- Documentacion.
- Specs.
- Scripts.
- Codigo frontend.
- Codigo Tauri/Rust.
- Configuracion tecnica.
- Tests.
- Estructura del proyecto.

Adaptar esta lista si el proyecto define zonas restringidas.

## Datos Locales Y Secretos

- El proyecto esta en modo personal/dev permisivo: el asistente puede leer `.env`, variables locales, logs, audio, transcripciones, bases locales y artifacts de referencia si eso ayuda al trabajo.
- Privacidad no debe bloquear benchmarks, diagnostico, importacion conceptual desde Fixvox ni exploracion local.
- No imprimir secretos completos en respuestas ni commitear `.env`/tokens salvo pedido explicito y acotado de JP.
- Si se necesita registrar valores reales en docs o codigo, pedir confirmacion explicita antes.

## Mensajes Externos

Si el asistente redacta mensajes para usuarios, clientes o terceros, adaptar el tono al dominio del producto y no mencionar debates internos salvo que el contexto lo pida.
