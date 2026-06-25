---
id: source-project-map
status: reference
kind: decision-map
triggers:
  - proyectos fuente
  - proyecto Tauri
  - CopyQ Tauri
  - copyq-tauri
  - proyecto canonico
  - Fixvox
  - electro-bun
  - que implementar
  - que portar
primary_refs:
  - docs/tracks/source-project-study-plan.md
  - docs/topics/dictation-tauri-foundation.md
  - docs/topics/fixvox-capability-map.md
  - docs/topics/product-direction.md
  - docs/topics/backend-and-model-routing.md
  - docs/topics/automation-and-reference-fixtures.md
---

# Mapa De Proyectos Fuente

## Objetivo

Definir que se puede traer a Dictation Tauri desde:

- proyecto Tauri: `C:\dev\chat\copyq-tauri`;
- proyecto canonico: `C:\dev\electro-bun-1` / Fixvox.

Este mapa no convierte ningun proyecto fuente en dependencia. Todo lo adoptado debe quedar como decision, spec o codigo propio en `C:\dev\dictation-tauri`.

## Estados

| Estado | Significado |
| --- | --- |
| `adopt` | Traer el patron casi directo, ajustando nombre/producto. |
| `adapt` | Usar como referencia fuerte, pero redisenar el contrato para Dictation Tauri. |
| `reference` | Leer como evidencia o aprendizaje, sin implementarlo ahora. |
| `parked` | Valioso pero fuera del alcance actual. |
| `reject` | No traer salvo nueva decision explicita. |

## Resumen Ejecutivo

| Dominio | Fuente principal | Estado | Que implementar en Dictation Tauri |
| --- | --- | --- | --- |
| Stack/scaffold | CopyQ Tauri | `adopt` | React, Vite, TypeScript strict, npm, Tauri v2, Rust 2021, Playwright. |
| Scripts base | CopyQ Tauri | `adopt` | `dev`, `build`, `tauri`, `tauri:dev`, `tauri:build`, `visual:check`; `cargo check` con target separado para agentes. |
| App/window base | CopyQ Tauri | `adapt` | Ventana inicial solida y verificable, sin copiar comportamiento de clipboard/picker. |
| Custom chrome | CopyQ Tauri | `adapt` | Frame compartido despues del scaffold; `decorations:false`, `transparent:false`, `shadow:false` como default Windows para ventanas custom. |
| UI library/theme | CopyQ Tauri | `adapt` | Mantine para settings/controles comunes, lucide para iconos, theme catalog propio. |
| Settings standalone | CopyQ Tauri | `adapt` | Settings como ventana propia, no overlay; contenido de dictado y hotkeys propios. |
| Shortcut/tray/background | CopyQ Tauri | `adapt` | Registrar shortcut y tray desde Rust; cerrar ventana debe ocultar salvo quit explicito. |
| Focus/delivery Win32 | Fixvox + CopyQ Tauri | `adapt` | Delivery best-effort con niveles de certeza; evitar prometer paste observado en Chromium/WebView. |
| Voice runtime process | Fixvox | `adopt` | Para dictado/texto normal usar el proceso Fixvox como canon: audio prep, STT, prompts, policy, postprocess, sanitizer, fallback y materializacion. No reinventar prompts/reglas. |
| Voice runtime shell | Dictation Tauri | `adapt` | Mantener Tauri/Rust para dock, hotkeys, ventanas, tray, foco/clipboard, permisos y packaging. |
| STT/TTS/benchmarks | Fixvox | `adopt-process` | Reusar contratos, prompts, matrices y evidencia como canon del proceso; harness propio solo como envoltorio Tauri/test. |
| Model routing | Fixvox | `adopt-process` | Managed cloud Fixvox, provider/model/policy/prompts y postprocess como fuente de verdad; mock/provider-free solo para tests. |
| Policy/control plane | Fixvox | `adapt` | Reusar contratos cloud (`/v2/device/register`, preflight, policy/defaults) desde Rust/Tauri, no internals Bun. |
| Wake words/assistant/Quick Chat | Fixvox | `parked` | No entran en MVP; usar solo para diseno futuro de rutas. |
| UIA/Koffi/Python/PowerShell helper | Fixvox | `reject` | No reintroducir en hot path sin nueva decision explicita. |

## Implementable Ahora

### Fundacion Tecnica

Estado: `adopt` desde CopyQ Tauri.

Implementar en `001-port-foundation`:

- `package.json` con Vite, React, TypeScript, Tauri CLI y Playwright.
- `package-lock.json`.
- `vite.config.ts`, `tsconfig.json` y entrada React minima.
- `src-tauri/Cargo.toml` con Tauri v2, Rust 2021, `serde`/`serde_json` solo si se usan comandos.
- `src-tauri/tauri.conf.json` con producto Dictation Tauri, `devUrl` local y capabilities minimas.
- Scripts oficiales documentados en `docs/DEVELOPMENT.md`.
- App base ejecutable sin UI durable de producto.

No incluir todavia:

- dependencias de clipboard/storage de CopyQ Tauri;
- plugin de notification hasta que haya una superficie que lo use;
- `windows` crate hasta que se implemente delivery/focus;
- global shortcut/tray si el corte es solo scaffold tecnico.

### Custom Window Base

Estado: `adapt` desde CopyQ Tauri.

Se puede implementar despues de que exista app base:

- `src/ui/window/CustomWindowFrame.tsx`;
- `src/ui/window/WindowControls.tsx`;
- `src/ui/window/windowChrome.ts`;
- `src/ui/window/windowVariants.ts`;
- permiso `core:window:allow-start-dragging` cuando el drag strip exista.

Reglas a adoptar:

- `transparent:false` por default;
- `shadow:false` en Windows para evitar borde blanco en ventanas undecorated;
- no agregar resize handles CSS en el primer corte;
- no mezclar drag region con botones/inputs;
- Settings debe ser standalone si se crea.

### UI Y Settings

Estado: `adapt` desde CopyQ Tauri, condicionado por producto/diseno.

Antes de UI durable:

- crear `PRODUCT.md`;
- crear `DESIGN.md`;
- usar `docs/topics/ui-design-and-impeccable.md`.

Cuando se implemente:

- Mantine para controles comunes, settings, tabs, selects, switches, buttons, tooltips y menus;
- lucide para iconos;
- wrappers locales para evitar CSS ad hoc repetido;
- theme catalog propio de Dictation Tauri.

No copiar:

- feed virtualizado;
- preview Markdown/imagen;
- acciones de clipboard;
- settings de CopyQ.

## Implementable En MVP 1-3

### Pipeline / Proceso De Dictado

Estado actualizado 2026-06-25: `adopt` desde Fixvox para el proceso de texto; `adapt` solo para shell desktop Tauri.

Decision de JP: lo que ya funciona impecable en Fixvox debe usarse igual para el proceso. Dictation Tauri no debe inventar prompts, reglas de cleanup, postprocess, sanitizer, provider/model routing ni materializacion de salida para dictado normal.

Proceso canonico a adoptar:

1. Trigger desde Tauri/dock/hotkey propio.
2. Target capture/delivery desde Tauri/Rust propio cuando aplique.
3. Recording/audio preparation igual a Fixvox si hay logica de compresion/conversion/preparacion en la ruta vigente.
4. Transcription request igual a Fixvox: endpoint, headers, device id, provider/model, fields, prompt/policy y parsing.
5. Raw transcript handling igual a Fixvox.
6. Postprocess igual a Fixvox cuando policy lo habilita: system prompt, user message, provider/model, endpoint y telemetry/evidence redacted.
7. Sanitizer/fallback igual a Fixvox.
8. Output materialization igual a Fixvox antes de entregar/copiar/pegar desde Tauri.

Reglas propias que se mantienen:

- Tauri/Rust sigue siendo dueño de ventanas, dock, hotkeys, tray, foco, clipboard, permisos, packaging y secrets host-owned.
- Tests default siguen provider-free; pueden validar request previews, prompts, sanitizer y policy sin llamar proveedores.
- Un ledger/evidencia redacted sigue siendo obligatorio, pero no puede cambiar el comportamiento de texto.
- Si un fragmento Fixvox depende de Electrobun/Bun/appStore/UI, se copia o extrae el nucleo de proceso y se documenta la minima divergencia tecnica.

Spec activa para este giro: `specs/013-fixvox-text-runtime-parity/`.

No traer todavia salvo que sea dependencia directa de dictado normal:

- Assistant Mode persistente;
- command wake words;
- Quick Chat;
- full picker/Alt+Q;
- UX completa de selection transform.

### Benchmarks STT/Postprocess

Estado: `adapt` desde Fixvox.

Implementar harness propio:

- frases de benchmark sinteticas;
- prompts STT y postprocess como fixtures;
- salida JSON con latencia, costo estimado, provider/model y texto esperado;
- logs redacted;
- uso local de `.env` permitido en dev.

Recursos fuente utiles:

- `C:\dev\electro-bun-1\docs\reference\ops\tts-benchmark-phrases.txt`;
- matrices `voice-benchmark-matrix.*.json`;
- prompts en `voice-benchmark-prompts\`.

Regla:

- se pueden usar muestras humanas locales como referencia, pero no copiarlas al repo sin decision explicita.

### ModelGateway Y Managed Cloud

Estado: `adapt` desde Fixvox.

Actualizacion 2026-06-20: Fixvox no es solo referencia futura de proxy; su infraestructura cloud managed es el camino recomendado para el siguiente runtime real. El codigo desktop se reimplementa en Rust/Tauri, pero se pueden adoptar contratos, policy, prompts, headers de telemetria, usage/cost y fail-closed managed behavior.

Implementar una frontera propia:

```ts
type ModelGateway = {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
  postProcess(input: PostProcessInput): Promise<PostProcessResult>;
};
```

Adapters:

- mock/fixture-backed para tests y provider-free smoke;
- directo local para BYOK/dev, configurado por `.env`/variables locales desde host Rust/Tauri, no desde UI React;
- managed Fixvox cloud como camino principal post-008, usando `X-Device-Id`, `/v1/audio/transcriptions`, `/v2/execution/preflight` y headers `X-Fixvox-*`.

Regla: acoplarse a contratos HTTP documentados, no a internals Bun/Electrobun. Si Tauri/Rust pide un diseño distinto para side effects, packaging, storage o seguridad, preferir el diseño propio.

### Delivery Y Target Assurance

Estado: `adapt` desde Fixvox.

Principios a traer:

- distinguir `pasteSent` de `pasteObserved`;
- Chromium/WebView no tiene verificacion universal rapida via Win32;
- si el usuario cambia de app durante dictado, el target final plausible puede ganar sobre el target inicial;
- recovery/copy fallback importa mas que prometer insercion perfecta;
- logs deben mostrar target inicial, target final y certeza de delivery.
- el resultado de delivery debe guardar evidencia: texto disponible, fallback, paste enviado, paste observado cuando exista, target inicial/final y razon de incertidumbre.

No reimplementar ahora:

- UI Automation Python;
- PowerShell UIA;
- Koffi/UIAutomationCore in-process;
- helper exe separado.

## Referencia Para Despues

### Policy / Control Plane

Estado: `reference` desde Fixvox.

Lecciones utiles:

- UI hiding no alcanza como frontera de autoridad;
- runtime/backend debe validar capacidades;
- policy efectiva debe resolver una sola vez antes de ejecutar;
- postprocess debe depender de runtime/policy, no de prompts o recipes sueltas.

No implementar en MVP 0-3:

- admin/control plane;
- roles por device;
- policy sync remota;
- cuotas/capabilities remotas.

### Recovery UI

Estado: `early` por producto, `reference/adapt` desde Fixvox.

Primero:

- copy fallback;
- logs claros;
- accion manual simple.

Despues:

- ventana o dock de recovery con copiar, paste-again, type/send keys si se decide.

### Assistant / Selection / Presets

Estado: `parked` o `early` segun `fixvox-capability-map`.

Implementar despues de MVP 3:

- captura real de seleccion;
- selection transform;
- presets locales;
- paste last result.

No implementar todavia:

- Assistant Mode persistente;
- Quick Chat;
- `Alt+Q`;
- wake words.

## Rechazos Actuales

| Fuente | Elemento | Motivo |
| --- | --- | --- |
| CopyQ Tauri | Clipboard manager domain | Producto distinto; no copiar storage, history, query grammar ni clipboard watchers. |
| CopyQ Tauri | SQLite/rusqlite | Persistencia de dictado no esta decidida como contrato. |
| CopyQ Tauri | Notification plugin | Esperar una necesidad real de recovery/toasts. |
| Fixvox | Electrobun/Bun architecture | Dictation Tauri ya decidio Tauri v2 + Rust + npm. |
| Fixvox | Koffi UIA in-process | Crash/finalizer risk en runtime fuente; no llevar al hot path. |
| Fixvox | Python/PowerShell UIA | Dependencia y fragilidad no aceptadas para producto inicial. |
| Fixvox | Wake listening default | No pedir microfono al startup; wake word disabled por default. |

## Orden Recomendado

1. Cerrar `001-port-foundation` con scaffold Tauri minimo.
2. Crear `PRODUCT.md` y `DESIGN.md`.
3. Implementar app shell/voice dock minimo con custom chrome si aplica.
4. Crear spec de pipeline/fixtures.
5. Implementar pipeline simulado y logs.
6. Implementar harness TTS/STT/postprocess con `ModelGateway` directo.
7. Implementar microfono real y delivery best-effort.
8. Reabrir selection/recovery/presets como specs early post-MVP.

## Regla De Mantenimiento

Cuando se adopte algo de un proyecto fuente:

1. actualizar este mapa si cambia el estado;
2. actualizar `docs/DECISIONS.md` si es decision durable;
3. actualizar la spec activa si afecta implementacion;
4. borrar la dependencia implicita al repo fuente en el codigo final.
