---
id: source-project-map
status: reference
kind: decision-map
triggers:
  - proyectos fuente
  - proyecto Tauri
  - Copicu
  - copicu
  - proyecto canonico
  - Fixvox
  - fixvox
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

- proyecto Tauri canonico: `C:\dev\copicu`;
- proyecto funcional canonico: `C:\dev\fixvox` / Fixvox.

Decision 2026-06-27: estas son las unicas rutas fuente activas; no usar worktrees/rutas anteriores como referencia.

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
| Stack/scaffold | Copicu | `adopt` | React, Vite, TypeScript strict, npm, Tauri v2, Rust 2021, Playwright. |
| Scripts base | Copicu | `adopt` | `dev`, `build`, `tauri`, `tauri:dev`, `tauri:build`, `visual:check`; `cargo check` con target separado para agentes. |
| App/window base | Copicu | `adapt` | Ventana inicial solida y verificable, sin copiar comportamiento de clipboard/picker. |
| Custom chrome | Copicu | `adapt` | Frame compartido despues del scaffold; `decorations:false`, `transparent:false`, `shadow:false` como default Windows para ventanas custom. |
| UI library/theme | Copicu | `adapt` | Mantine para settings/controles comunes, lucide para iconos, theme catalog propio. |
| Settings standalone | Copicu | `adapt` | Settings como ventana propia, no overlay; contenido de dictado y hotkeys propios. |
| Shortcut/tray/background | Copicu | `adapt` | Registrar shortcut y tray desde Rust; cerrar ventana debe ocultar salvo quit explicito. |
| Focus/delivery Win32 | Fixvox + Copicu | `adapt` | Delivery best-effort con niveles de certeza; evitar prometer paste observado en Chromium/WebView. |
| Voice runtime process | Fixvox | `adopt` | Para dictado/texto normal usar el proceso Fixvox como canon: audio prep, STT, prompts, policy, postprocess, sanitizer, fallback y materializacion. No reinventar prompts/reglas. |
| Voice runtime shell | Dictation Tauri | `adapt` | Mantener Tauri/Rust para dock, hotkeys, ventanas, tray, foco/clipboard, permisos y packaging. |
| STT/TTS/benchmarks | Fixvox | `adopt-process` | Reusar contratos, prompts, matrices y evidencia como canon del proceso; harness propio solo como envoltorio Tauri/test. |
| Model routing | Fixvox/Tauri Cloud | `adopt-process` | Managed cloud Fixvox, provider/model/policy/prompts y postprocess como fuente de verdad; mock/provider-free solo para tests. Worker operativo en `cloud/fixvox-proxy/`. |
| Policy/control plane | Tauri Cloud | `owned` | Contratos cloud (`/v2/device/register`, preflight, policy/defaults, desktop login link) viven en `cloud/fixvox-proxy/` y Rust/Tauri; `C:/dev/fixvox` queda legacy/reference. |
| Wake words/assistant/Quick Chat | Fixvox | `parked` | No entran en MVP; usar solo para diseno futuro de rutas. |
| UIA/Koffi/Python/PowerShell helper | Fixvox | `reject` | No reintroducir en hot path sin nueva decision explicita. |

## Implementable Ahora

### Fundacion Tecnica

Estado: `adopt` desde Copicu.

Implementar en `001-port-foundation`:

- `package.json` con Vite, React, TypeScript, Tauri CLI y Playwright.
- `package-lock.json`.
- `vite.config.ts`, `tsconfig.json` y entrada React minima.
- `src-tauri/Cargo.toml` con Tauri v2, Rust 2021, `serde`/`serde_json` solo si se usan comandos.
- `src-tauri/tauri.conf.json` con producto Dictation Tauri, `devUrl` local y capabilities minimas.
- Scripts oficiales documentados en `docs/DEVELOPMENT.md`.
- App base ejecutable sin UI durable de producto.

No incluir todavia:

- dependencias de clipboard/storage de Copicu;
- plugin de notification hasta que haya una superficie que lo use;
- `windows` crate hasta que se implemente delivery/focus;
- global shortcut/tray si el corte es solo scaffold tecnico.

### Custom Window Base

Estado: `adapt` desde Copicu.

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

Estado: `adapt` desde Copicu, condicionado por producto/diseno.

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
- Si un fragmento Fixvox depende de legacy Fixvox desktop app state/UI, se copia o extrae el nucleo de proceso y se documenta la minima divergencia tecnica.

Spec activa para este giro: `specs/013-fixvox-text-runtime-parity/`.

### Estudio 2026-06-29 — Dictado End-To-End Fixvox vs Dictation Tauri

Fuente auditada: `C:\dev\fixvox\docs\navigation\features\voice-dock.md`, `voice-dock-window.ts`, `voice-dock-output.ts`, `speech-to-text.ts`, `hotkeys.ts` y archivos adyacentes de target/delivery/recording; comparado contra `src/desktop-control`, `src/capture`, `src/host-runtime`, `src/fixvox-text-runtime`, `src/delivery` y `src-tauri/src/desktop_delivery.rs`.

| Etapa | Estado | Hallazgo / gap concreto | Proxima accion |
| --- | --- | --- | --- |
| Target capture antes de grabar | `adapt` | Fixvox resuelve target con retry, `lastKnownTarget` + `lastInputTarget`, input-like heuristics, metadata de target, selection seed y re-resolucion post-STT si el foco cambio. Dictation Tauri ya tiene primer slice de target assurance: guarda target inicial, re-resuelve target editable actual antes de paste normal, evita que Terminal/Tabby pisen el cache editable, y bloquea selection replace al target guardado. `inputLike` y drift/evidencia siguen siendo coarse. | Completar drift log/telemetria redacted, heuristics de non-editable/uncertain targets y recovery visible cuando no haya target plausible. |
| Semantica start/stop/submit | `adopt/adapt` | Ambos tienen tap/hold dictation key, latch, Esc cancel y `Stop & submit` con Enter. Fixvox tiene start guard mas rico, cancel durante processing por execution id, auto-stop por silencio/stop phrase, sound cues y bloqueo por policy trust antes de armar. | Adoptar solo los invariantes de estado/cancel/busy/policy trust; auto-stop/sound cues quedan `reference` salvo pedido de producto. |
| Settings de flujo de dictado | `adopt` | Los defaults fuente de Fixvox son: hotkey principal `Alt+Space`, paste-last `Alt+Shift+X`, stop-and-submit `Alt+Shift+Space`, `pressEnterAfterPaste=false`, `pasteWithShiftInsert=false`, `muteOutputDuringRecording=true`, sound cues true, auto-stop silence true/2000ms, stop phrase `terminar dictado`, pro routing por default `pro-stt-only` con STT prompt enabled y postprocess disabled salvo perfil `pro-post-process`. Dictation Tauri hoy solo persiste hotkey principal y cloud; delivery/dock settings estan marcados `Later`, no hay stop-and-submit global, y `src/App.tsx` fuerza `pro-post-process`/postprocess enabled. | Antes de producto nuevo, crear una fuente de verdad de settings Fixvox-compatible para dictation flow y cambiar Tauri para leer esos valores en vez de hardcodes. |
| Recording/audio prep | `adopt-process` | Fixvox: mute opcional del sistema antes de capturar, meter/VU, WAV local, VAD local antes de STT, compresion ffmpeg a MP3 para audios grandes, restore output y metricas de latencia. Dictation Tauri: CPAL -> WAV local con VU, sin mute, sin VAD local, sin compresion MP3. | Gap grande: spec/batch separado para VAD local + compresion/audio prep Fixvox-equivalent antes de STT. Mute/sound cues quedan feature separada. |
| STT | `adopt` | Fixvox envia `model`, `language`, `prompt`, `response_format=verbose_json`, word+segment timestamps y `temperature=0`, con no-speech checks/prosody/headers/cost. Dictation Tauri managed Rust usa `verbose_json` pero no manda prompt, timestamps, temperature ni prosody/no-speech parsing equivalente; direct BYOK usa `json`. | Prioridad alta: alinear request STT Rust managed con Fixvox, incluyendo prompt/policy y timestamps; agregar tests de preview/request y smoke redacted. |
| Postprocess/materializacion | `adopt` | `013` ya copio prompts, sanitizer, policy y postprocess managed. Fixvox ademas filtra ASR hallucinations antes de rutas y soporta rutas command/assistant/selection/active preset/lexicon. Dictation Tauri cubre dictado normal y presets fixture, no todo command/assistant. | Hotfix chico posible: portar filtro de ASR silence/trailing hallucination para dictado normal. Command/assistant/active smart preset quedan `parked/reference`. |
| Delivery/recovery | `adapt` | Fixvox materializa, opcionalmente review/edit, decide delivery action, bloquea targets claramente no editables, elige shortcut por target (`ctrl-v`, `shift-insert`, unicode para Tabby), muestra recovery persistente si no verifica. Dictation Tauri usa direct Unicode por default, clipboard solo fallback env-gated, evidence `paste_sent/observed`, copy/paste-last/history. | Mantener direct Unicode por feedback de browser; adaptar target assurance + recovery visible para non-editable/uncertain targets sin volver a clipboard default. |
| History/evidence | `adapt` | Fixvox registra `recordDebugEvent` y telemetry fina por etapa: target assurance, routing, STT metrics, postprocess, delivery foreground timeline; puede incluir raw texto en debug local. Dictation Tauri tiene pipeline summary, result history bounded y reports redacted, pero menos timeline target/routing/STT detail en UI/evidence. | Adaptar schema redacted de evidencia por etapas: raw/final length/hash, target start/final, route, upload source, STT/postprocess IDs, delivery confidence. |
| Browser targets / clipboard / direct input | `adapt` | Fixvox usa clipboard snapshot + paste shortcut, foco WebView2 child y settle largo para Chromium; saltea verificacion post-paste por default en Chromium. Dictation Tauri ya resolvio browser paste removiendo Escape y usando direct Unicode + skip observer en Chromium. | No adoptar clipboard default. Referenciar Fixvox solo para target-specific shortcut/recovery; conservar direct Unicode y fallback clipboard explicito/env-gated. |

Auditoria puntual 2026-06-29 sobre transcripcion/postproceso: no estan 100% parejos. Fixvox resuelve STT desde policy/runtime (`resolveEffectiveSpeechRuntime` + `resolveVoiceExecutionPlan`), manda prompt efectivo, language, `verbose_json`, `timestamp_granularities[]=word/segment` y `temperature=0`, y usa prosody/no-speech del payload. En la maquina de JP, la policy cacheada de Fixvox `pro` usa `transcript.model=whisper-large-v3-turbo`, prompt tecnico en español y `voicePolicy.enableRawPostProcess=false`. Dictation Tauri hoy usa Rust host runtime; managed STT queda en default `whisper-large-v3` si no hay `FIXVOX_STT_MODEL`, no manda prompt efectivo, timestamps ni temperature, y no propaga prosody/no-speech equivalente. En postprocess, los prompts/sanitizer base estan copiados, pero `src/App.tsx` fuerza `enabled: true` + `voiceRoutingProfileId: pro-post-process`, mientras Fixvox en esta maquina tiene raw postprocess deshabilitado y solo lo activa cuando la policy/ruta lo decide. Diferencias de velocidad probables: Tauri usa modelo STT mas lento, suma un chat-completions postprocess que Fixvox saltea, hace preflight managed sin el prewarm/cache de Fixvox y sube WAV sin compresion MP3 para audios largos. Esto debe corregirse con una fuente de verdad de policy/settings antes de afirmar parity.

Plan operativo para el proximo batch: `docs/tracks/fixvox-effective-runtime-parity.md`.

Orden sugerido antes de tocar producto: (1) tests/request parity STT, (2) policy/settings parity para STT/postprocess, (3) target assurance resolver — primer slice hecho 2026-07-01, falta drift/recovery UI, (4) VAD/MP3 audio prep, (5) evidencia redacted por etapa, (6) ASR hallucination filter si aparece en fixtures.

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

- `C:\dev\fixvox\docs\reference\ops\tts-benchmark-phrases.txt`;
- matrices `voice-benchmark-matrix.*.json`;
- prompts en `voice-benchmark-prompts\`.

Regla:

- se pueden usar muestras humanas locales como referencia, pero no copiarlas al repo sin decision explicita.

### ModelGateway Y Managed Cloud

Estado: `owned` para Tauri Cloud, con aprendizaje historico desde Fixvox.

Actualizacion 2026-06-30: la infraestructura cloud managed necesaria para Fixvox Tauri vive en este repo bajo `cloud/fixvox-proxy/` y ya fue desplegada desde aca. `C:/dev/fixvox` no debe ser dependencia operativa para cambios nuevos de Worker/policy; queda como referencia legacy si hace falta entender decisiones previas. El codigo desktop se reimplementa en Rust/Tauri, y los contratos/policy/prompts/headers/usage/fail-closed managed behavior se mantienen como source propio en este repo.

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

Regla: acoplarse a contratos HTTP documentados y al Worker `cloud/fixvox-proxy/`, no a legacy Fixvox desktop internals ni a `C:/dev/fixvox/proxy`. Si Tauri/Rust pide un diseño distinto para side effects, packaging, storage o seguridad, preferir el diseño propio.

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

Estado: `owned` en `cloud/fixvox-proxy/`; `reference` historica desde Fixvox.

Lecciones utiles:

- UI hiding no alcanza como frontera de autoridad;
- runtime/backend debe validar capacidades;
- policy efectiva debe resolver una sola vez antes de ejecutar;
- postprocess debe depender de runtime/policy, no de prompts o recipes sueltas.

Ya implementado/operativo para el nuevo flujo:

- device register/activate;
- admin policy assignment;
- signed-in authPolicy/capabilities;
- fail-closed runtime enforcement;
- Cloud deploy desde este repo.

Pendiente segun futuro alcance:

- UI admin mas pulida para grupos/users;
- release/otra PC smoke post-cutover;
- legacy demotion final de docs antiguas.

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
| Copicu | Clipboard manager domain | Producto distinto; no copiar storage, history, query grammar ni clipboard watchers. |
| Copicu | SQLite/rusqlite | Persistencia de dictado no esta decidida como contrato. |
| Copicu | Notification plugin | Esperar una necesidad real de recovery/toasts. |
| Fixvox | legacy Fixvox desktop architecture | Dictation Tauri ya decidio Tauri v2 + Rust + npm. |
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
