# Decisiones

Registro corto de decisiones durables.

## Aprobadas

### 2026-06-10 - Usar commits atomicos por checkpoint SDD

Estado: accepted

Decision: el repo debe usar commits atomicos constantes. Cada task SpecKit completada o checkpoint verificable debe cerrarse con un commit coherente, despues de correr los checks relevantes y sincronizar `tasks.md`/docs si aplica.

Motivo: SpecKit divide el trabajo en tareas ejecutables, dependencias y checkpoints; los commits deben reflejar esa granularidad para poder volver a estados buenos sin perder contexto.

Alcance:

- Usar Conventional Commits cortos.
- No mezclar plan/spec/docs e implementacion cuando puedan separarse limpiamente.
- No commitear `.env`, secretos, artifacts locales, `node_modules/`, `dist/`, `target/`, audio/transcripciones sensibles ni reports.
- Publicar el repo como publico solo despues de tener `.gitignore` y revisar que no entren secretos.

Proximo paso: inicializar Git, crear el repo publico en GitHub y subir commits atomicos del baseline, SpecKit MVP 0 y primer scaffold frontend.

### 2026-06-05 - Instalar Agentic Project OS Lite

Estado: accepted

Decision: el repo usa `AGENTS.md`, `docs/`, `docs/topics/`, `docs/tasks/`, `docs/.generated/context-index.md`, `specs/`, `.agents/skills/`, `.specify/` y scripts de contexto como sistema agentico liviano.

Motivo: permitir continuidad entre sesiones y agentes sin cargar contexto innecesario.

Proximo paso: scaffold de `001-port-foundation` con el stack real y comandos verificables.

### 2026-06-07 - Migrar continuidad a `docs/tasks/`

Estado: accepted

Decision: la continuidad viva del proyecto vive en `docs/tasks/`; `active work` queda solo como alias historico. Las tasks activas tienen `status`, `started`, `updated` y `priority`; las cerradas viven en `docs/tasks/archive/` con `status: archived`.

Motivo: alinear Dictation Tauri con la version actual de OS Lite y permitir validacion mas estricta con indice generado y audit.

Proximo paso: usar `docs/tasks/TEMPLATE.md` para nuevas tasks y correr `bun scripts/context-index.ts` antes del audit cuando cambie contexto.

### 2026-06-05 - Cerrar baseline documental y agentico

Estado: accepted

Decision: el baseline documental/agentico queda cerrado: docs raiz, topics, SpecKit, skills locales y auditor de contexto estan instalados, indexados y sincronizados.

Motivo: antes de avanzar con la app Tauri, el proyecto necesita una fuente de verdad confiable y ligera para continuar entre sesiones sin perder reglas ni decisiones.

Proximo paso: usar `specs/001-port-foundation/` para cerrar la fundacion tecnica con stack, manifiestos, comandos, permisos y politica de datos.

### 2026-06-05 - Tratar datos de dictado como sensibles

Estado: superseded por "Modo personal/dev permisivo para datos locales" del 2026-06-07

Decision: audio, transcripciones, logs de reconocimiento y metadata de dictado son sensibles por defecto.

Motivo: pueden contener informacion privada del usuario.

Proximo paso: definir persistencia, retencion, cifrado y uso de servicios externos antes de implementar storage o integraciones.

### 2026-06-07 - Modo personal/dev permisivo para datos locales

Estado: accepted

Decision: en esta etapa personal/dev, privacidad no bloquea el trabajo. El asistente puede leer y usar `.env`, variables locales, logs, audio, transcripciones, bases locales, prompts, metadata y artifacts de referencia de este repo, Fixvox y otros proyectos personales cuando ayuden a avanzar.

Motivo: el proyecto es personal por ahora y la prioridad es avanzar de forma straightforward, usando lo que ya funciona localmente.

Alcance:

- Permitido leer valores reales de variables de entorno y `.env` locales para diagnostico, benchmarks y providers.
- Permitido usar audio/transcripciones/logs/artifacts locales como referencia o insumo de desarrollo.
- Permitido persistir datos experimentales localmente si acelera desarrollo.
- No imprimir secretos completos en respuestas ni commitear `.env`/tokens salvo pedido explicito y acotado de JP.
- Antes de convertir persistencia en contrato de producto, documentar ruta, formato y ciclo de vida.

Proximo paso: actualizar specs y topics para que la fundacion tecnica no trate privacidad como bloqueo inicial.

### 2026-06-05 - Usar el stack base de copyq-tauri

Estado: accepted

Decision: la fundacion tecnica usara el mismo stack base probado en `C:\dev\chat\copyq-tauri`: React, Vite, TypeScript strict, npm con `package-lock.json`, Tauri v2, Rust edition 2021 y Playwright para checks visuales.

Motivo: ese stack ya funciona bien en la maquina de JP, reduce decisiones nuevas y da una base conocida para una app desktop operativa.

Alcance: reutilizar el patron tecnico, no copiar dependencias ni permisos especificos de clipboard/storage. Para Dictation Tauri empezar con capabilities minimas (`core:default`) y sin persistencia sensible.

Proximo paso: crear manifiestos y app base verificable con scripts oficiales.

### 2026-06-05 - Usar Fixvox como referencia de voz, no como arquitectura

Estado: accepted

Decision: usar `C:\dev\electro-bun-1` / Fixvox como fuente de referencia para recursos de voz, fixtures, benchmarks, prompts y aprendizajes de producto, manteniendo el stack propio de Dictation Tauri: React, Vite, TypeScript, npm, Tauri v2 y Rust.

Motivo: Fixvox ya contiene recursos valiosos para avanzar sin depender de pruebas manuales tempranas: scripts de TTS, matrices STT/postprocess, prompts, manifests de audio y variables `.env` locales con proveedores disponibles.

Alcance:

- Permitido usar audio sintetico o real local para pruebas automaticas.
- Permitido leer variables `.env` y usar claves locales cuando una tarea lo requiera.
- No imprimir ni commitear valores de secretos salvo pedido explicito y acotado de JP.
- Permitido leer y usar muestras humanas/artifacts de Fixvox como referencia local.
- No copiar arquitectura Electrobun/Bun ni dependencias de Fixvox.

Proximo paso: armar una capa propia de fixtures/benchmarks para Dictation Tauri, empezando por TTS sintetico y STT/postprocess controlado.

### 2026-06-05 - Filtrar capacidades Fixvox antes de implementarlas

Estado: accepted

Decision: `docs/topics/fixvox-capability-map.md` es el mapa de alcance para capacidades inspiradas en Fixvox. Ninguna capacidad de Fixvox entra automaticamente al backlog de Dictation Tauri.

Motivo: Fixvox tiene muchas capacidades utiles, pero Dictation Tauri necesita un producto propio, con arquitectura propia y alcance chico antes de implementar features durables.

Proximo paso: usar ese mapa para decidir MVP, early features, research spikes, later features y parked features antes del scaffold funcional.

### 2026-06-05 - Usar impeccable para UI React/Tauri

Estado: accepted

Decision: usar la skill local `.agents/skills/impeccable` para diseño, critique, audit, polish y construccion de superficies UI React/Tauri cuando la tarea toque interfaz.

Motivo: la app necesita una UI operativa, clara y confiable para estados de dictado, delivery y recovery. `impeccable` ya dio buenos resultados en otro proyecto y aporta proceso de producto, diseño, validacion visual y anti-patrones.

Limites: no usarla para arquitectura nativa, audio, hotkeys globales, capabilities, model routing, proxy, storage ni Rust backend.

Proximo paso: antes de UI durable, crear `PRODUCT.md` y `DESIGN.md`; despues usar `impeccable shape/craft/critique/audit/polish` segun la superficie.

### 2026-06-05 - Cerrar alcance MVP 0-3

Estado: accepted

Decision: Dictation Tauri empieza como dictado rapido universal. El alcance MVP queda dividido en:

- MVP 0: app Tauri base verificable.
- MVP 1: pipeline simulado automatizable, sin microfono ni servicios externos obligatorios.
- MVP 2: audio sintetico, STT real y benchmark de STT/postprocess contra texto esperado.
- MVP 3: captura real de microfono, push-to-talk/toggle, stop-submit y delivery best-effort con copy fallback.

Motivo: el producto necesita validar flujo, calidad, costo y delivery antes de pedir pruebas manuales repetidas o sumar interacciones complejas.

Alcance: no entran en MVP 0-3 Quick Chat, Assistant Mode persistente, `Alt+Q`, wake words, control plane, historial persistente, muestras humanas copiadas al repo ni captura real de texto seleccionado.

Proximo paso: scaffold tecnico de `001-port-foundation` y luego una spec separada para pipeline/fixtures si el cambio excede la fundacion.

### 2026-06-05 - Usar ModelGateway hibrido con adapter directo primero

Estado: accepted

Decision: crear una frontera propia `ModelGateway` para STT/postprocess. El primer adapter real sera directo local, usando variables de entorno o `.env` propio ignorado. El adapter proxied queda para spike posterior si el contrato del proxy existente alcanza.

Motivo: permite medir audio sintetico y proveedores sin acoplar Dictation Tauri al control plane de Fixvox, pero deja una ruta limpia para proxy, costos y policy mas adelante.

Alcance: Dictation Tauri puede leer `.env`/variables locales cuando una tarea lo requiera. Aun asi, para producto propio conviene tener `.env` propio o variables configuradas explicitamente y no acoplarse por accidente a rutas de Fixvox.

Proximo paso: definir contrato minimo del gateway en la spec de pipeline/fixtures antes de implementar STT real.

### 2026-06-05 - Postergar seleccion real a post-MVP

Estado: accepted

Decision: el modo con texto seleccionado no entra como captura real en MVP 0-3. Se puede simular `selectedText` en tests desde MVP 1 y medir transformaciones como fixtures, pero la captura real de seleccion y replace-selection quedan para early post-MVP.

Motivo: selection transform es valioso, pero mete riesgo tecnico y UX sobre target capture, privacidad y delivery. El primer flujo real debe probar dictado universal antes de ampliar alcance.

Proximo paso: mantener los contratos preparados para contexto opcional, sin bloquear MVP 3.

### 2026-06-05 - Inicializar PRODUCT/DESIGN antes de UI durable

Estado: accepted

Decision: no se construye UI durable sin `PRODUCT.md` y `DESIGN.md`. El momento correcto es despues de cerrar este pase de alcance y antes de implementar la primera superficie React/Tauri real como app shell, voice dock, preview o recovery.

Motivo: `impeccable` requiere `PRODUCT.md` y la app necesita una direccion de producto/diseno estable antes de que los componentes visuales se vuelvan fuente de verdad accidental.

Alcance: el scaffold tecnico minimo puede avanzar antes de esos archivos si solo crea una ventana base verificable y no fija una UI durable.

Proximo paso: correr el flujo `impeccable init` o equivalente para crear `PRODUCT.md`; luego seedear `DESIGN.md` antes de la primera superficie UI.

## Pendientes

- Motor de dictado/transcripcion.
- Politica de persistencia local.
- Permisos/capabilities minimos de Tauri.
- Comandos exactos de dev/build/test una vez creados los manifiestos.
