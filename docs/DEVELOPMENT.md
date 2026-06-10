# Desarrollo Del Proyecto

## Repositorio

- Ruta local: `C:\dev\dictation-tauri`
- Remoto: no detectado.
- Git: no detectado al cierre del baseline documental del 2026-06-05.

Reglas:

- Mantener cambios chicos cuando aplique.
- Modo personal/dev permisivo: se pueden leer `.env`, variables locales, logs, audio, transcripciones, bases locales y artifacts cuando ayuden al trabajo.
- No imprimir secretos completos en respuestas ni commitear `.env`/tokens salvo pedido explicito y acotado de JP.
- Respetar worktree sucio: no revertir cambios de usuario.

## Git / SDD

El repo trabaja con Spec-Driven Development. La unidad normal de trabajo es:

1. actualizar o leer `spec.md`, `plan.md` y `tasks.md`;
2. implementar una task o checkpoint verificable;
3. correr los checks relevantes;
4. marcar la task completada;
5. commitear atomico.

Reglas:

- Commit despues de cada task SpecKit completada o checkpoint validado.
- Cada commit debe ser reversible y tener un motivo unico.
- No mezclar scaffolding, decisiones de spec, UI durable y cambios de runtime si pueden separarse.
- No commitear `.env`, tokens, bases locales, audio/transcripciones sensibles, `node_modules/`, `dist/`, `target/`, reports ni caches.
- Usar Conventional Commits (`docs:`, `chore:`, `feat:`, `test:`, `fix:`) con subject corto.
- Si una task cambia una decision durable, actualizar `docs/DECISIONS.md` o el topic correspondiente antes del commit de cierre.

## Stack

Stack decidido para la fundacion tecnica, pendiente de crear manifiestos:

- Shell principal: PowerShell en Windows.
- App desktop: Tauri v2.
- Frontend: React + Vite.
- Lenguaje frontend: TypeScript strict.
- Backend desktop: Rust/Tauri en `src-tauri/`.
- Rust edition: 2021.
- Package manager: npm con `package-lock.json`.
- Testing visual: Playwright.
- Storage: pendiente de definir como producto, pero en esta etapa personal/dev la persistencia experimental local de audio/transcripciones/logs no esta bloqueada por privacidad.

No copiar dependencias de `copyq-tauri` que sean especificas de clipboard, SQLite, Win32 o storage hasta que una spec las justifique.

## Estado De Implementacion

Baseline cerrado:

- Documentacion raiz creada y sincronizada.
- Topics principales indexados.
- SpecKit instalado con constitucion del proyecto.
- Skill local `impeccable` y skills SpecKit disponibles en `.agents/skills/`.
- Auditor de contexto disponible y pasando.

Pendiente para considerar cerrada la fundacion tecnica:

- Crear manifiestos reales de frontend/Tauri/Rust.
- Definir comandos oficiales de dev, build, lint y test.
- Documentar permisos/capabilities minimos.
- Documentar politica de persistencia antes de convertir datos en comportamiento estable de producto.
- Verificar una app base ejecutable.

## UI / Frontend Design

Para cualquier superficie UI en React/Tauri, usar `docs/topics/ui-design-and-impeccable.md` como entrada.

La skill local `.agents/skills/impeccable` queda aprobada para trabajos de interfaz: app shell, voice dock, settings, onboarding, preview, recovery, estados, responsive, accesibilidad, critique, audit y polish.

Limites:

- No usar `impeccable` para arquitectura nativa, audio, hotkeys globales, capabilities, model routing, proxy, storage o Rust backend.
- Antes de UI durable, crear `PRODUCT.md` y `DESIGN.md` o documentar por que se difiere.
- La UI debe tratar esta app como producto operativo desktop, no landing page.

## Estructura Observada

```text
src/
src-tauri/
src-tauri/capabilities/
src-tauri/icons/
src-tauri/src/
docs/
docs/tasks/
docs/topics/
specs/
specs/001-port-foundation/
```

## Comandos

Contexto agentico:

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
bun scripts/context-refresh.ts --task docs/tasks/<task>.md
```

Comandos de build, dev, lint y test: pendientes de confirmar cuando existan `package.json`, `Cargo.toml`, `tauri.conf.json` u otros manifiestos. El patron esperado viene de `copyq-tauri`:

```powershell
npm run dev
npm run build
npm run tauri:dev
npm run tauri:build
npm run visual:check
```

## Persistencia

Pendiente de decision de producto. Hasta entonces, en modo personal/dev:

- Se pueden leer y usar `.env`, logs, bases locales, audio, transcripciones y artifacts de referencia.
- Se puede guardar persistencia experimental local si acelera benchmarks, diagnostico o desarrollo.
- Antes de volverlo contrato de producto, documentar ruta, formato, ciclo de vida y politica de borrado.
- `.env`/tokens no se commitean salvo pedido explicito y acotado de JP.
- No usar `localStorage`, caches temporales o logs como fuente de verdad durable.

## SpecKit

Usar SpecKit para la fundacion del port y features grandes.

Estructura esperada:

```text
specs/<feature>/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

Spec draft actual: `specs/001-port-foundation/`.

## Verificacion

Antes de cerrar cambios:

1. Ejecutar checks relevantes cuando existan.
2. Ejecutar tests/build si existen.
3. Verificar manualmente flujos afectados.
4. Actualizar docs/specs si cambia comportamiento durable.
5. Correr `bun scripts/context-index.ts` y `bun scripts/agent-context-audit.ts` si se tocaron docs, topics o tasks.
