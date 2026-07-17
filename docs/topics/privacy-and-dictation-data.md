---
id: privacy-and-dictation-data
status: active
kind: decision-map
triggers:
  - privacidad
  - audio
  - transcripciones
  - dictado
  - logs
  - storage
  - modelos
primary_refs:
  - docs/ASSISTANT_RULES.md
  - docs/DEVELOPMENT.md
  - docs/DECISIONS.md
---

# Datos De Dictado En Modo Personal/Dev

## Regla Actual

JP definio el 2026-06-07 que, por ahora, privacidad no debe ser un tema bloqueante. El proyecto esta en modo personal/dev permisivo.

El asistente puede leer y usar `.env`, variables locales, logs, audio, transcripciones, bases locales, prompts, metadata y artifacts de referencia cuando ayuden al trabajo.

## Implicancias

- No bloquear benchmarks, diagnostico ni exploracion por privacidad.
- Se permite usar valores locales de entorno para correr proveedores y comparar modelos.
- Se permite leer archivos de Fixvox y otros proyectos personales aunque contengan datos reales o artifacts.
- No imprimir secretos completos en respuestas ni commitear `.env`/tokens salvo pedido explicito y acotado de JP.
- No convertir persistencia experimental en contrato de producto sin documentar ruta, formato y ciclo de vida.

## Decision Para MVP 0-3

- Audio real, transcripciones reales y logs pueden usarse localmente si aceleran desarrollo.
- Fixtures sinteticos siguen siendo utiles para automatizacion, pero no son una restriccion de privacidad.
- Artifacts generados pueden existir localmente; decidir despues que se versiona, ignora o limpia.
- Servicios externos de STT/LLM pueden usarse con variables locales cuando una tarea lo requiera.
- `ModelGateway` sigue siendo la frontera tecnica deseada, pero no por una restriccion de privacidad.

## Clipboard Delivery Actual

- Delivery nativo enfoca el target guardado antes de tomar el snapshot, pega y restaura.
- Solo sobrescribe clipboards reconstruibles: texto, DIB/DIBV5 y formatos adicionales clonables como bytes `HGLOBAL`. Metadata bitmap conocida se acepta únicamente con DIB; cualquier formato que no pueda clonarse sigue fallando cerrado antes del paste.
- Durante la ventana write/paste/restore el texto dictado puede ser visible para clipboard watchers; es un constraint conocido, no privacidad fuerte.

## Retencion Local De Resultados

`result-history.v1.jsonl` vive en app data host-owned y guarda solo resultados de texto reutilizables. El contrato actual limita el historial a 50 entradas y 256 KiB serializados; al superar cualquiera de los dos limites se eliminan primero las entradas mas antiguas. Entradas vacias o de schema desconocido se ignoran y `paste_observed` no se persiste desde evidencia renderer no verificada.

La companion muestra `Clear history`; la accion borra el archivo local completo mediante `clear_result_history`. No borra presets, configuracion, cuentas ni datos Cloud. Presets/configuracion tienen ciclo de vida propio y permanecen hasta editar, resetear o borrar explicitamente.

## Pendiente

Registrar decisiones sobre:

- motor local o externo;
- rutas de datos locales;
- que artifacts se versionan, ignoran o quedan en app data;
- logs utiles para desarrollo;
- modo debug;
- exportacion y retencion de otros artifacts fuera de result history.
