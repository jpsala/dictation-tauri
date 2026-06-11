# Desarrollo Del Proyecto

## Repositorio

- Ruta local: `C:\dev\dictation-tauri`
- Remoto: `https://github.com/jpsala/dictation-tauri`
- Git: inicializado en `main`, repo publico en GitHub.

Reglas:

- Mantener cambios chicos cuando aplique.
- Modo personal/dev permisivo: se pueden leer `.env`, variables locales, logs, audio, transcripciones, bases locales y artifacts cuando ayuden al trabajo.
- No imprimir secretos completos en respuestas ni commitear `.env`/tokens salvo pedido explicito y acotado de JP.
- Respetar worktree sucio: no revertir cambios de usuario.

## Git / SDD / Small Batches

El repo trabaja con Spec-Driven Development. La unidad normal de trabajo es:

1. actualizar o leer `spec.md`, `plan.md` y `tasks.md`;
2. implementar una task, comportamiento o checkpoint verificable;
3. correr los checks relevantes;
4. marcar la task completada;
5. commitear atomico.

Reglas:

- Trabajar en Small Batches: una task SpecKit, un comportamiento observable o una sincronizacion documental acotada por tanda.
- Commit despues de cada tanda verificada.
- Cada commit debe ser reversible y tener un motivo unico.
- Si una tanda toca demasiadas responsabilidades, dividirla antes de implementar.
- No mezclar scaffolding, decisiones de spec, UI durable y cambios de runtime si pueden separarse.
- No commitear `.env`, tokens, bases locales, audio/transcripciones sensibles, `node_modules/`, `dist/`, `target/`, reports ni caches.
- Usar Conventional Commits (`docs:`, `chore:`, `feat:`, `test:`, `fix:`) con subject corto.
- Si una task cambia una decision durable, actualizar `docs/DECISIONS.md` o el topic correspondiente antes del commit de cierre.

## Stack

Stack decidido para la fundacion tecnica:

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

Cerrado para MVP 0:

- App React/Vite base verificable.
- Smoke test Playwright.
- Crate Tauri/Rust minimo con ventana `main`.
- Capability minima `core:default`.
- Checks de quickstart e indice/auditor de contexto verdes.

Completado para Checkpoint A de MVP 0:

- `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts` e app React base existen.
- `npm run build` pasa.

Completado para Checkpoint B de MVP 0:

- `playwright.config.ts` y `tests/visual/app-smoke.spec.ts` existen.
- `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs` y `src-tauri/src/lib.rs` existen.
- Capability minima en `src-tauri/capabilities/default.json`: `core:default` para la ventana `main`.
- `src-tauri/icons/icon.ico` existe como icono neutro minimo requerido por `tauri-build` en Windows.
- `npm run build`, `npm run visual:check` y `cargo check` pasan.

Proximo trabajo recomendado:

- Abrir spec de MVP 2: audio sintetico + STT real sobre fixtures, usando `ModelGateway` directo local como primer adapter real.
- Mantener MVP 2 sin microfono real, hotkeys, tray, settings, persistencia de producto ni UI durable salvo decision explicita.
- Mantener el pipeline por puertos/adapters y la UI como observadora antes de agregar side effects desktop.

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

Comandos frontend reales:

```powershell
npm run dev
npm run build
npm run test:pipeline
npm run preview
```

Comandos MVP 2 de audio sintetico/STT, por ahora placeholders dry-run sin `.env`, audio ni provider calls:

```powershell
npm run synthetic-audio:fixtures
npm run synthetic-audio:stt:dry-run
```

Artifacts locales MVP 2:

```text
artifacts/synthetic-audio-stt/
├── audio/
├── transcripts/
├── provider-payloads/
└── reports/
```

Estos paths son evidencia local gitignored. No son persistencia de producto y no deben commitearse.

Comandos MVP 3 de microfono real, por ahora placeholders dry-run sin `.env`, microfono, audio ni provider calls:

```powershell
npm run microphone-capture:check
npm run microphone-capture:dry-run
```

Artifacts locales MVP 3 planeados:

```text
artifacts/microphone-capture/
├── audio/
├── transcripts/
├── provider-payloads/
└── reports/
```

Estos paths son evidencia local gitignored. No son persistencia de producto y no deben commitearse. No imprimir ni commitear audio real, transcripciones reales, provider payloads, logs de captura con contenido sensible, `.env` ni tokens.

Checks manuales opcionales para MVP 3, solo cuando JP apruebe grabar audio local:

```powershell
npm run tauri:dev
git status --short --ignored
```

El check manual debe confirmar que los artifacts bajo `artifacts/microphone-capture/` siguen ignored y que cualquier estado de provider faltante queda redactado.

Comandos Tauri y verificacion reales:

```powershell
npm run visual:check
npm run tauri:dev
npm run tauri:build
$env:CARGO_TARGET_DIR="target-codex-check"; cargo check --manifest-path src-tauri/Cargo.toml
```

## Persistencia

Pendiente de decision de producto. Hasta entonces, en modo personal/dev:

- Se pueden leer y usar `.env`, logs, bases locales, audio, transcripciones y artifacts de referencia.
- Se puede guardar persistencia experimental local si acelera benchmarks, diagnostico o desarrollo.
- Antes de volverlo contrato de producto, documentar ruta, formato, ciclo de vida y politica de borrado.
- `.env`/tokens no se commitean salvo pedido explicito y acotado de JP.
- No usar `localStorage`, caches temporales o logs como fuente de verdad durable.

## Arquitectura Runtime

Guia vigente antes de audio/STT/delivery reales:

- Core de pipeline TypeScript puro mientras no requiera permisos desktop.
- `PipelineService` o runner equivalente controla run activo, no-overlap, cancelacion, ids y eventos.
- Transcripcion, postprocess/materializacion y delivery entran por puertos/adapters mockeables.
- Event ledger es la evidencia primaria; summaries, UI y logs se derivan de sus eventos.
- UI React dispara comandos y observa estado/eventos; no muta transiciones.
- Rust/Tauri posee side effects desktop cuando entren: microfono, hotkeys, tray, foco, clipboard, ventanas, permisos y secretos.
- Tauri capabilities se agregan por feature/ventana; `core:default` sigue siendo baseline.
- `csp: null` no debe quedar como configuracion de runtime real con providers/contenido dinamico sin decision explicita.

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

Spec activa actual: `specs/003-synthetic-audio-stt/`.

## Verificacion

Antes de cerrar cambios:

1. Ejecutar checks relevantes cuando existan.
2. Ejecutar tests/build si existen.
3. Verificar manualmente flujos afectados.
4. Actualizar docs/specs si cambia comportamiento durable.
5. Correr `bun scripts/context-index.ts` y `bun scripts/agent-context-audit.ts` si se tocaron docs, topics o tasks.
