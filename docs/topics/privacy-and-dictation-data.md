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

## Pendiente

Registrar decisiones sobre:

- motor local o externo;
- rutas de datos locales;
- que artifacts se versionan, ignoran o quedan en app data;
- logs utiles para desarrollo;
- modo debug;
- retencion y exportacion.
