# Proyecto

Dictation Tauri.

## Objetivo

Construir una aplicacion de escritorio basada en Tauri para dictado rapido universal. El primer tramo prioriza una base verificable, pipeline automatizable, audio sintetico/STT medido y captura real de microfono. En esta etapa personal/dev, privacidad no bloquea lectura, uso ni persistencia experimental local de datos.

## Usuarios / Actores

- JP, como owner del proyecto.
- Usuarios finales que necesitan dictar texto desde el escritorio.
- Agentes de codigo que necesitan continuar el port o la implementacion sin perder decisiones de producto, privacidad y arquitectura.

## Estado Actual

- Repo: `C:\dev\dictation-tauri`
- Baseline documental/agentico: cerrado y auditado el 2026-06-05.
- Estado tecnico observado: estructura inicial con `src/`, `src-tauri/`, `docs/`, `specs/`, `.agents/` y `.specify/`; sin manifiestos de frontend, Rust o Tauri todavia detectados.
- Spec activa: `specs/001-port-foundation/` en estado draft para la fundacion tecnica del port.
- Direccion actual: crear base Tauri verificable y documentar comandos antes de implementar comportamiento durable de dictado.

## Baseline Cerrado

El proyecto ya tiene una fuente de verdad liviana para continuidad entre sesiones:

- `AGENTS.md` define reglas de trabajo del repo.
- `docs/WORKING_MEMORY.md` apunta al estado vivo y proximo paso.
- `docs/TOPICS.md` enruta topics recuperables.
- `docs/DECISIONS.md` registra decisiones durables iniciales.
- `.specify/memory/constitution.md` define principios SpecKit del proyecto.
- `scripts/context-index.ts` genera un indice rapido de topics, tracks, specs, skills y aliases.
- `scripts/agent-context-audit.ts` valida que topics, tracks, skills e indice esten sincronizados.

Este baseline no incluye una app Tauri funcional todavia.

## Principios

- Modo personal/dev permisivo: audio, transcripciones, logs, `.env` y artifacts locales pueden leerse y usarse para avanzar.
- Desktop-first: la app debe sentirse nativa, rapida y confiable.
- Port incremental: preferir una base minima verificable antes de sumar features.
- Estado explicito: no dejar configuraciones, modelos, caches o transcripciones como fuentes accidentales de verdad.
- Contexto liviano: decisiones durables van a `docs/`, specs o topics; no a notas sueltas.

## Infraestructura Relacionada

- `docs/skills/`: skills locales incluidas como parte del sistema.
- `.specify/`: infraestructura SpecKit portable.
- `scripts/context-index.ts`: generador de `docs/.generated/context-index.md`.
- `scripts/agent-context-audit.ts`: auditor de docs, topics, tracks, skills e indice generado.
