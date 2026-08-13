---
id: transcription-quality-program
status: active
phase: phase-1-corpus-runner
kind: implementation-track
priority: critical
started: 2026-08-12
updated: 2026-08-13
triggers:
  - mejorar transcripcion
  - calidad STT
  - benchmark de voz
  - corpus humano
  - comparar modelos
  - prompt STT
  - postprocess de dictado
  - Fixvox transcription
primary_refs:
  - docs/topics/transcription-quality-and-evaluation.md
  - docs/reference/transcription-quality-fixvox-inventory.md
  - docs/topics/automation-and-reference-fixtures.md
  - docs/topics/privacy-and-dictation-data.md
  - docs/topics/backend-and-model-routing.md
  - docs/topics/dictation-workflow.md
  - docs/tracks/archive/fixvox-effective-runtime-parity.md
  - C:/dev/fixvox/docs/navigation/topics/voice-postprocess-models/
  - C:/dev/fixvox/docs/reference/ops/voice-reference-manifest.yaml
---

# Transcription Quality Program

## Objetivo

Construir un programa permanente para medir y mejorar al maximo la
transcripcion y su materializacion. Debe recuperar todo aprendizaje util de
Fixvox, establecer baselines reproducibles, comparar calidad/costo/latencia y
convertir evidencia en rutas de producto explicitas.

La investigacion puede priorizar calidad aunque sea mas cara o lenta. Ninguna
ruta se promueve sin saber que etapa produjo la mejora y que regresiones agrega.

## Estado De Arranque

El estudio inicial de 2026-08-12 encontro divergencias plausibles entre Fixvox
y Dictation Tauri:

- el postprocess local no esta corriendo en reportes recientes;
- el contrato product-v1 y el resolver Rust no proyectan/consumen la misma forma
  de policy para la decision de postprocess;
- el prompt STT server-owned puede ser mas corto que el prompt tecnico Fixvox;
- product-v1 reduce la respuesta STT a texto y descarta words/segments;
- sin esa metadata no operan prosodia ni el gate probabilistico post-STT local;
- faltan defensas de materializacion y un equivalente efectivo del lexicon
  tecnico anterior;
- ambos runtimes managed usan normalmente Groq `whisper-large-v3-turbo`, por lo
  que el modelo no explica por si solo la diferencia percibida;
- VAD y MP3 son sustancialmente parejos y no son la primera hipotesis.

Esto es diagnostico, no causalidad cerrada. El primer objetivo es producir una
baseline comparable antes de reparar o activar componentes.

## Resultado Esperado

Al cerrar el programa inicial, el repo debe tener:

1. inventario verificable de activos y decisiones Fixvox;
2. corpus sintetico y humano con gold text y categorias;
3. runner reproducible que separe audio prep, STT y postprocess;
4. artifacts estructurados y summaries comparables;
5. baseline de la ruta productiva actual;
6. matriz de prompts, idiomas, modelos, postprocess, prosodia y vocabulario;
7. criterios de promocion y rollback;
8. perfiles de producto sustentados por evidencia;
9. observabilidad que muestre el runtime efectivo sin filtrar secretos;
10. ciclo continuo para incorporar errores reales y reevaluar modelos.

## Reglas De Ejecucion

- Un batch pequeno por vez; cerrar evidencia y docs antes del siguiente.
- Mismo audio y gold para comparar candidatos.
- Cambiar una variable por experimento cuando sea razonable.
- Guardar STT raw antes de evaluar postprocess.
- No usar TTS como unica evidencia de promocion.
- No habilitar postprocess porque una capability exista; policy debe expresar la
  decision de ruta.
- No asumir que un prompt/modelo configurado fue el ejecutado; registrar receipt.
- Provider/OAuth real, audio fisico, selection/delivery real, deploy, produccion,
  commit y push conservan sus gates existentes.
- Los provider calls aprobados para benchmarks deben usar un maximo explicito de
  muestras/candidatos y producir costo estimado/real.
- No imprimir ni versionar secretos, audio humano, transcript privado o payloads
  crudos fuera de su destino acordado.

## Prioridades

### P0 — Conocimiento Y Baseline

Bloquea cualquier conclusion de calidad:

- inventario Fixvox;
- contrato de corpus/artifacts;
- runner reproducible;
- baseline productiva actual;
- receipts de runtime efectivo.

### P1 — Recuperar Calidad Perdida

Solo despues de baseline:

- prompt tecnico efectivo;
- metadata verbose end-to-end;
- decision explicita de postprocess;
- prosodia, no-speech y filtros;
- lexicon/vocabulario medible.

### P2 — Buscar Calidad Absoluta

- `whisper-large-v3` y modelos actuales alternativos;
- postprocess de mayor calidad;
- routing condicionado;
- audio formats/preprocessing si la evidencia lo justifica.

### P3 — Producto Y Operacion Continua

- perfiles visibles;
- shadow evaluation local;
- feedback/correction loop;
- reevaluacion periodica y promotion gates.

## Phase 0 — Inventario Fixvox Y Contrato De Evidencia (P0)

### Objetivo

Preservar el proceso real de Fixvox y decidir que se adopta, adapta, referencia
o rechaza antes de escribir el nuevo runner.

### Tareas

- [x] Inventariar runtime de captura, audio prep, STT, parsing, prosodia,
  materializacion, postprocess, sanitizer, fallback y lexicon.
- [x] Inventariar policy/profile routing, providers, modelos, prompts, language y
  enablement efectivo.
- [x] Inventariar matrices, scripts, manifests, gold texts, audio humano,
  synthetic phrases, reports y decisiones de benchmarks.
- [x] Clasificar cada activo como `adopt-process`, `adapt`, `reference`, `stale` o
  `reject` con causa.
- [x] Identificar docs Fixvox stale frente a codigo/runtime.
- [x] Registrar limitaciones y experimentos negativos, no solo el camino feliz.
- [x] Definir schema versionado de manifest, candidate, run y result.
- [x] Definir politica local/versionada para audio, transcript, gold y reports.
- [x] Definir categorias y metricas iniciales.
- [x] Elegir el primer subset de corpus humano representativo.

### Cierre Batch 0A — 2026-08-12

Phase 0 quedó completa. El inventario profundo, source map, clasificaciones,
schema concreto, corpus candidato, matrices P0/P1 y contradicciones stale viven
en `docs/reference/transcription-quality-fixvox-inventory.md`.

Decisiones integradas:

- extender `SyntheticAudioFixture`; no crear una segunda convención de corpus;
- conservar `configured`, `resolved` y `observed` por separado;
- mantener raw STT inmutable y permitir replay de postprocess por referencia;
- usar IDs/hashes estables y texto humano por refs locales, nunca inline;
- derivar summaries desde JSON/JSONL; Markdown no es autoridad;
- adoptar el proceso Fixvox, adaptar implementación/storage y rechazar scripts
  manuales que mutan settings o imprimen contenido privado;
- iniciar con dos muestras core provisionales, una de adjudicación y dos shadow;
  sólo gold `approved` puede recibir scoring contra referencia.

Evidencia observada recuperada sin ejecutar runtime: un log local Fixvox prueba
una ruta `pro-stt-only` managed/proxied con Groq
`whisper-large-v3-turbo`, prompt presente, language omitido, VAD+MP3 y
postprocess resuelto pero no ejecutado. Filtros, sanitizer y lexicon permanecen
code/test-proven, no observed. Fuente exacta en la referencia profunda.

### Entregables

- Inventario durable dentro de este track o referencia acotada enlazada.
- Mapa source → destino sin copiar runtime legacy completo.
- Schema propuesto para runner y artifacts.
- Lista de muestras humanas candidatas sin exponer contenido privado en docs.
- Primera matriz de experimentos P0/P1.

### Verificacion

- Cada mecanismo atribuido a Fixvox tiene archivo/simbolo fuente.
- Cada prompt/modelo distingue configurado, resuelto y observado.
- Ningun artifact privado se agrega al repo.
- `bun scripts/context-index.ts` y `bun scripts/agent-context-audit.ts` pasan.

### Criterio De Cierre

Un agente nuevo puede explicar y localizar el pipeline Fixvox completo, elegir
las piezas reutilizables y construir el runner sin reauditar el repo entero.

## Phase 1 — Corpus Y Runner Reproducible (P0)

### Objetivo

Ejecutar comparaciones pareadas sin microfono y separar STT de postprocess.

### Tareas

- [ ] Adaptar el contrato del runner Fixvox a npm/Tauri y al gateway actual.
- [x] Reusar o extender `src/test-fixtures/synthetic-audio-manifest.ts` sin crear
  una segunda convencion de fixtures.
- [x] Crear manifest humano local con IDs estables, hash, gold, categorias y
  dificultad; no versionar audio sin decision explicita.
- [x] Importar solo las muestras Fixvox representativas.
- [ ] Agregar categorias: rioplatense, bilingüe, technical entities, spoken
  punctuation, lists, corrections, silence, quiet voice, short y long.
- [x] Registrar raw STT y final text como outputs distintos.
- [x] Registrar provider/model/prompt ID+hash/language/audio config/latencias/costo.
- [ ] Implementar scoring por fidelidad, entidades, estructura, seguridad y
  robustez; no reducir la decision a un score unico.
- [x] Generar JSON estructurado y summary humano derivado.
- [x] Soportar dry-run/provider-free por default.
- [ ] Agregar un modo provider-real explicitamente gated y acotado.

### Verificacion

- Dos ejecuciones provider-free producen manifests/results deterministas.
- Un candidate no puede omitir identidad de modelo/prompt/configuracion.
- El mismo raw transcript puede reevaluarse con varios postprocessors sin volver
  a llamar STT.
- Tests protegen schema, redaction y scoring observable.

### Criterio De Cierre

El runner compara candidates sobre el mismo corpus y produce evidencia
reconstruible sin depender de dictado manual.

### Cierre Batch 1A — 2026-08-12

Contrato provider-free implementado sobre `SyntheticAudioFixture`, sin manifest
paralelo ni cambios al runtime productivo. El schema mínimo vive en
`src/test-fixtures/transcription-quality-contract.ts`; el writer canónico e
incremental en `scripts/transcription-quality-artifacts.ts`; el runner
provider-free en `scripts/transcription-quality-provider-free.ts`, integrado
como `quality-provider-free` en `scripts/synthetic-audio-stt.ts`.

El smoke real sobre `en-clean-note` y `es-short-reminder` emitió:

- `artifacts/transcription-quality/provider-free-synthetic-v1/run.json`;
- `artifacts/transcription-quality/provider-free-synthetic-v1/results.jsonl`;
- `artifacts/transcription-quality/provider-free-synthetic-v1/summary.json`.

Dos ejecuciones consecutivas conservaron exactamente los SHA-256:

- `run.json`: `2b0305b5825ab01d94fead45161333f5be648cc57382f1dba8016807c54ccbeb`;
- `results.jsonl`: `4d0ee9c275464909c5cbdd99f69427e6af6af5d41d6b4b412241b7a3a748d6ca`;
- `summary.json`: `4508f1942bd6e118fc8e31303f5a3a0dc53d1a01b7a0baa7fe171a14104ebc51`.

Verificación ejercida:

```powershell
npx vitest run --config vitest.config.ts tests/synthetic-audio-stt/manifest-validation.test.ts tests/synthetic-audio-stt/dry-run-stt.test.ts tests/synthetic-audio-stt/report-generation.test.ts tests/synthetic-audio-stt/transcription-quality-contract.test.ts tests/synthetic-audio-stt/transcription-quality-artifacts.test.ts
npm run transcription-quality:provider-free
npm run build
```

Resultado: 5 archivos / 35 tests focales pasaron; smoke provider-free produjo
dos results ordenados, `providerCalls={enabled:false,maxRequests:0}` y cero
texto sensible en summary/receipts. Build pasó. Replay raw por
`sourceRunId/sourceSampleId`, separación raw/final, EvidenceState y redaction
local-sensitive quedaron protegidos por tests. Scoring, corpus humano,
provider-real y gateway productivo siguen abiertos.

### Cierre Batch 1B — 2026-08-12

Los cinco candidatos humanos quedaron representados con
`TranscriptionQualityCorpusManifest`/`SyntheticAudioFixture`, sin un segundo
schema. `expectedText` ahora es opcional sólo para permitir samples humanos sin
texto inline; los fixtures `generated-tts` siguen obligados a tenerlo.
`audioBytes` agrega la longitud observable al mismo sample.

El comando metadata-only
`scripts/transcription-quality-local-human-corpus.ts`:

- resuelve únicamente refs Fixvox workspace-relative bajo
  `docs/reference/ops/audio/human/`;
- verifica archivo, bytes y SHA-256 por stream, sin reproducir audio ni leer
  gold/transcripts;
- escribe el manifest efectivo local y una proyección safe canónica bajo
  `artifacts/transcription-quality/corpus/`;
- no crea `Run`, `Result`, budget ni llamada de provider.

Estados cerrados: dos core `provisional`, una adjudication `provisional` y dos
`shadow-only`. `approved` es el único estado scoreable; el gate
`assertTranscriptionQualityGoldScoreable` rechaza los otros dos. La dificultad,
ausente como valor por sample en el inventario inicial, quedó fijada de forma
explícita por rol/categoría: los tres casos estructurados son `hard`,
`jp-recent-01` es `baseline` y `jp-recent-06` es `edge`.

Privacidad y paths quedan protegidos por códigos estables:
`PRIVATE_INLINE_TEXT`, `INVALID_GOLD_SCORING`, `MISSING_REF`,
`HASH_MISMATCH`, `BYTES_MISMATCH` y `PATH_ESCAPE`. La proyección pública
contiene sólo ID, hash, bytes, formato, categorías, dificultad, idioma,
`goldStatus`, sensibilidad y status de validación; omite refs y contenido.

Verificación final:

```powershell
npx vitest run --config vitest.config.ts tests/synthetic-audio-stt/manifest-validation.test.ts tests/synthetic-audio-stt/dry-run-stt.test.ts tests/synthetic-audio-stt/report-generation.test.ts tests/synthetic-audio-stt/transcription-quality-contract.test.ts tests/synthetic-audio-stt/transcription-quality-artifacts.test.ts tests/synthetic-audio-stt/transcription-quality-local-human-corpus.test.ts
npm run transcription-quality:human-corpus:metadata
npm run build
git check-ignore -v artifacts/transcription-quality/corpus/manifest.json artifacts/transcription-quality/corpus/projection.json
```

Resultado: 6 archivos / 51 tests pasaron; el smoke reportó cinco samples con
existencia/hash/bytes válidos; build pasó. `manifest.json` y `projection.json`
quedaron gitignored con SHA-256
`0a19f7d830f5bfde879659e9b8e63d1fb81e0d767d218a534ee8d3762da23f90`
y
`96d1c053f8666913b1740c69347ed6034c0f1c050d034c7598570a3aaac9ca0e`.

### Cierre Batch 1C — 2026-08-12

JP adjudicó en privado los tres casos provisionales. Los WAV Fixvox históricos
resultaron demasiado bajos y ambiguos para funcionar como gold confiable; los
tres pasaron explícitamente a `shadow-only` y no se borraron. Los dos shadow
preexistentes conservaron su estado.

Se grabaron con el micrófono nuevo tres reemplazos controlados y JP aprobó sus
gold después de reproducir cada WAV:

- `jp-quality-bilingual-technical-20260812`;
- `jp-quality-punctuation-list-20260812`;
- `jp-quality-model-comparison-20260812`.

Audio, gold y salida STT observada viven separados bajo
`artifacts/transcription-quality/corpus/private/`, gitignored. El catálogo
versionado conserva sólo IDs, hashes, bytes, categorías, dificultad, idioma,
estado y refs workspace-relative. El corpus efectivo `batch-1c` contiene ocho
samples: tres `approved` y cinco `shadow-only`; no quedan provisionales.

El resolver distingue explícitamente storage `fixvox` y `workspace`, valida una
allowlist distinta para cada uno y verifica bytes/SHA-256 por stream. La
proyección safe sigue omitiendo refs y contenido. El gate scoreable admite sólo
los tres reemplazos aprobados.

Verificación final:

```powershell
npx vitest run --config vitest.config.ts tests/synthetic-audio-stt/manifest-validation.test.ts tests/synthetic-audio-stt/dry-run-stt.test.ts tests/synthetic-audio-stt/report-generation.test.ts tests/synthetic-audio-stt/transcription-quality-contract.test.ts tests/synthetic-audio-stt/transcription-quality-artifacts.test.ts tests/synthetic-audio-stt/transcription-quality-local-human-corpus.test.ts
npm run transcription-quality:human-corpus:metadata
npm run build
bun scripts/context-index.ts && bun scripts/agent-context-audit.ts
```

Resultado final: 6 archivos / 52 tests pasaron. Dos smokes equivalentes
reportaron ocho samples con existencia/hash/bytes válidos, sin `Run` ni
`providerCalls`. `manifest.json` y `projection.json` quedaron deterministas con
SHA-256 `31dc41843f5a222893611a7f3f51fd4a7bfe0f72eb529c032c434b8a50e12b27`
y `7e91246f2a6fcb818b498f5d5805d43dd741688a3f78fd24b3e80b7f42dc9a2b`.
Build e índice/audit pasaron. Las capturas interactivas usaron provider `mock`,
postprocess desactivado y costo cero; no hubo provider real, deploy, commit ni
push.

## Phase 2 — Baseline Del Runtime Productivo Actual (P0)

### Objetivo

Medir lo que Dictation Tauri ejecuta hoy, no lo que docs o policy intentan.

### Tareas

- [x] Capturar receipt redacted de endpoint, engine, modelo, prompt ID/hash,
  language, response format y postprocess decision.
- [x] Confirmar el schema product-v1 persistido y su interpretacion Rust.
- [x] Registrar baseline managed sobre el corpus humano aprobado y baseline
  provider-free sobre el sintetico.
- [x] Separar metricas raw/final; confirmar en evidencia si postprocess corre.
- [x] Preservar metadata provider disponible sin persistir payloads sensibles.
- [x] Comparar runner directo y ruta Tauri real para detectar bypasses.
- [x] Documentar gaps entre catalog, DB/policy publicada, state local y request
  upstream observado.

### Verificacion

- Un smoke Tauri real aprobado produce el mismo candidate identity que el runner.
- El summary no reporta prompts/modelos que el upstream no recibio.
- Existe baseline con scores, latencia, costo y fallbacks.

### Criterio De Cierre

Toda mejora posterior tiene una baseline estable y una ruta productiva trazable.

**Estado:** cerrada el 2026-08-12 por Batch 2D. La baseline queda trazable
end-to-end sobre el sample bilingue aprobado y la candidate product-v1.

### Ejecución Batch 2A — 2026-08-12

Se ejecutó `product-baseline-current-v2` sobre los tres samples humanos
`approved`, con exactamente tres requests STT reales por
`/product/v1/runtime/transcriptions`, sin postprocess, delivery, clipboard ni
cambios de policy. El preflight resolvió perfil `pro` revision/version `1`,
capability de transcripción activa y autoridad `cloudflare-authority`.

Resultado raw:

| Sample | WER | CER | STT ms | Costo STT estimado |
| --- | ---: | ---: | ---: | ---: |
| `jp-quality-bilingual-technical-20260812` | 0.2000 | 0.0702 | 2240.2 | USD 0.000340 |
| `jp-quality-punctuation-list-20260812` | 0.2727 | 0.2755 | 2060.1 | USD 0.000255 |
| `jp-quality-model-comparison-20260812` | 0.3256 | 0.1885 | 2829.5 | USD 0.000368 |

Macro WER: `0.2661`; macro CER: `0.1781`; latencia media STT: `2376.6 ms`;
costo total estimado: `USD 0.000963`. Los tres requests terminaron `ok`.

Hallazgos:

- el dictado bilingüe conserva el tramo inglés, pero degrada entidades técnicas
  (`Fixvox`, `App.svelte`, `bun run dev`, `voice-dock-output.ts`);
- el raw conserva literalmente palabras de puntuación y lista, por lo que la
  estructura esperada depende de postprocess;
- el caso de comparación también degrada números/modelos/comandos y casing;
- el endpoint product-v1 no devolvió provider, modelo ni prompt efectivos en el
  body y el runner v1 no persistió headers de identidad; esos campos siguen
  correctamente como `not-observed`, no inferidos;
- raw y final quedaron en refs privadas distintas pero son iguales porque este
  corte aisló STT y dejó postprocess `off`.

Artifacts locales/redacted:
`artifacts/transcription-quality/product-baseline-current-v2/`. Audio, gold,
raw y final permanecen gitignored. Hubo antes un request fallido bajo una
autorización separada: `language: es-en` fue rechazado upstream con `502`; el
runner se corrigió para reproducir el runtime Tauri, que omite idioma cuando la
configuración efectiva es `auto`.

**Estado:** la ejecución acotada terminó, pero Phase 2 no cierra todavía. Falta
capturar identidad observada desde headers/receipts y comparar el mismo
candidate mediante Tauri real. No corresponde abrir la matriz de Phase 3 ni
promover cambios productivos hasta cerrar ese gap.

### Ejecución Batch 2B — 2026-08-12

El runner product-v1 ahora conserva una allowlist estricta de headers seguros
por request (`engine`, `profile`, `prompt`, runtime route, costo y timings) y
publica estados `configured`/`resolved`/`observed` sin copiar headers
desconocidos ni convertir placeholders en evidencia.

Se ejecutó un smoke Tauri real autorizado sobre
`jp-quality-bilingual-technical-20260812`: exactamente un request managed, tope
`USD 0.001`, idioma `auto`, postprocess `off` y cero delivery/clipboard/typing.
El host produjo:

- audio original WAV `5,328,044` bytes;
- upload MP3 `167,228` bytes, ratio `0.0314`, `27,750 ms`;
- normalización omitida por nivel suficiente y VAD con voz;
- postprocess no ejecutado, fallback raw, raw/final de igual longitud;
- texto final exactamente igual al raw de `product-baseline-current-v2`
  (mismo SHA-256 privado; WER `0.2000`, CER `0.0702`).

La comparación rechazó paridad de candidate identity:

| Capa | Runner Batch 2A | Tauri real |
| --- | --- | --- |
| Route | `/product/v1/runtime/transcriptions` | `/v1/audio/transcriptions` resuelta por la configuración preferred actual |
| Audio prep | WAV sin cambios | ffmpeg MP3 |
| Language | `auto`/omitido | `auto`/omitido |
| Postprocess | `off` | `off`, no corrió |
| Provider/model/prompt | server-owned; headers futuros allowlisted | no persistidos en el receipt de esta ejecución |
| Texto final | raw STT | idéntico al runner para este sample |

El smoke terminó provider-side correctamente. El wrapper falló después del
request al usar un cmdlet SHA-256 no disponible; se corrigió con
`System.Security.Cryptography.SHA256` y la evidencia se reconcilió desde el
report/transcript host-owned, sin otra llamada. Artifact:
`artifacts/transcription-quality/tauri-parity-batch-2b-v1/tauri-parity.json`.

**Estado:** Batch 2B terminó y demostró que la baseline product-v1 no representa
la recipe que ejecuta Tauri hoy, aunque este sample produjo texto idéntico.
Phase 2 permanece abierta; abrir A/B de prompts ahora mezclaría route y audio
prep con el efecto del prompt.


### Implementación Batch 2C — 2026-08-12

El host Tauri dejó de bifurcar STT managed por backend preferred. Todo backend
managed construye ahora `/product/v1/runtime/transcriptions`, envía únicamente
`metadata` + `audio` con `X-Device-Id`, y mantiene provider/modelo/prompt bajo
autoridad server-owned. Se eliminaron `ManagedSttInput`, el multipart legacy y
la interpretación de respuesta dependiente de `/v1/audio/transcriptions`.

El runner product-v1 usa la recipe de audio efectiva del host:

- VAD/medición PCM y normalización low-level con los mismos thresholds;
- umbral de optimización de `160,000` bytes;
- ffmpeg mono, `16 kHz`, `libmp3lame`, `48 kbps`;
- fallback al WAV original si ffmpeg falla o no reduce tamaño;
- duración derivada del chunk WAV y audio prep registrado en timings;
- una sola preparación por sample, antes de cualquier candidate futuro.

Un smoke provider-free sobre `jp-quality-bilingual-technical-20260812`
reprodujo exactamente la identidad de upload observada en Batch 2B:
WAV `5,328,044` bytes y `27,750 ms` → MP3 `167,228` bytes. No hubo request de
provider. Los contratos Rust verifican route canónica, multipart y ausencia de
bearer/route legacy; los tests TypeScript verifican que metadata, artifacts y
timings usan el audio preparado.

**Estado:** implementación local completa. Phase 2 sigue abierta hasta un único
smoke Tauri real nuevo que confirme route/receipt product-v1 y permita comparar
end-to-end la misma candidate identity sin inferir headers ausentes.

### Cierre Batch 2D — 2026-08-12

Se ejecutó `tauri-parity-batch-2d-v1` mediante Tauri real sobre
`jp-quality-bilingual-technical-20260812`: exactamente un request STT managed,
tope `USD 0.001`, idioma `auto` omitido, postprocess `off` y cero
delivery/clipboard/typing. El request terminó `ok` en `675 ms`; no se hizo ni
se necesita una segunda llamada.

La candidate observada cerró la paridad:

| Capa | Runner product-v1 | Tauri real Batch 2D |
| --- | --- | --- |
| Route | `/product/v1/runtime/transcriptions` | mismo sender product-v1; no existe bifurcación legacy |
| Multipart/auth | `metadata` + `audio`, `X-Device-Id`, sin bearer vendor | igual |
| Audio | WAV `5,328,044` bytes y `27,750 ms` → MP3 `167,228` bytes | igual; `audio/mpeg`, `recording.mp3`, ffmpeg |
| Language | `auto` omitido | `auto` omitido |
| Postprocess | `off` | `enabled=false`, `ran=false`, fallback raw |
| Receipt | allowlist estricta | sólo request ID redacted fue expuesto |
| Provider/model/prompt | server-owned / `not-observed` si ausente | no se infirieron valores ausentes |
| Output | baseline WER `0.2000`, CER `0.0702` | raw/final idénticos entre sí y a la baseline |

El wrapper detectó después del único request que Windows PowerShell decodificaba
stdout UTF-8 de Node con la code page local: inflaba la longitud y calculaba un
SHA-256 distinto aunque el transcript host-owned era correcto. Se fijó
`Console.OutputEncoding` a UTF-8 alrededor del bridge CDP y se restauró al
salir. El artifact se reconcilió desde el report y transcript host-owned, sin
provider call adicional. Evidencia local/redacted:
`artifacts/transcription-quality/tauri-parity-batch-2d-v1/tauri-parity.json`.

Checks provider-free focales:

- Vitest product baseline: `1` archivo, `7` tests pasaron;
- Rust managed product boundary: `2` tests pasaron;
- parse PowerShell y decoding UTF-8 de stdout nativo: pasaron.

**Estado:** Batch 2D y Phase 2 cerrados. Route, upload identity, idioma,
postprocess, receipt allowlisted y output son reproducibles. Phase 3 queda
habilitada; provider/modelo/prompt continúan correctamente server-owned o
`not-observed` hasta que el servidor los exponga.


## Phase 3 — Prompt STT E Idioma (P1)

### Hipotesis

El prompt tecnico Fixvox mejora terminos y puntuacion hablada frente al builtin
corto; `es` puede ayudar o perjudicar el dictado bilingüe frente a `auto`.

### Matriz Inicial

Mantener Groq Turbo y el audio constantes:

1. prompt corto + `auto`;
2. prompt corto + `es`;
3. prompt rico Fixvox + `auto`;
4. prompt rico Fixvox + `es`.

### Tareas

- [ ] Versionar prompts candidates con ID/version y tests de longitud/hash.
- [ ] Ejecutar corpus sintetico y humano aprobado.
- [ ] Evaluar fidelidad y entidades por categoria.
- [ ] Inspeccionar efectos sobre palabras de puntuacion/lista.
- [ ] Medir latencia/costo aunque se esperen equivalentes.
- [ ] Elegir prompt/language por ruta, no necesariamente un default universal.

### Criterio De Promocion

Mejora reproducible de entidades/fidelidad sin degradacion relevante de mezcla de
idiomas ni instrucciones literales.

## Phase 4 — Verbose Metadata, No-Speech Y Prosodia (P1)

### Objetivo

Conservar y utilizar `segments`, `words`, `no_speech_prob`, `avg_logprob` y
timestamps end-to-end.

### Tareas

- [ ] Extender product-v1/provider boundary sin romper autoridad server-owned.
- [ ] Preservar metadata necesaria con contrato bounded y redacted.
- [ ] Probar gates no-speech sobre silencio, voz baja y frases cortas reales.
- [ ] Derivar prosodia como hints advisory, no puntuacion obligatoria.
- [ ] Agregar filtro conservador de alucinaciones completas/trailing.
- [ ] Registrar por que se descarto o materializo un transcript.
- [ ] Probar que `gracias` real no se bloquea por una phrase list ingenua.

### Criterio De Promocion

Menos alucinaciones y mejor diagnostico/puntuacion sin falsos no-speech sobre voz
real baja o corta.

## Phase 5 — Postprocess Y Seguridad Semantica (P1)

### Objetivo

Medir cuando un LLM mejora el texto final y cuando introduce drift.

### Matriz Inicial

Congelar STT raw y comparar:

1. raw/materializacion minima;
2. GPT-OSS 120B sin prosodia;
3. GPT-OSS 120B con prosodia;
4. niveles light/medium/strong solo si el contrato los soporta;
5. modelos alternativos solo despues de obtener baseline.

### Tareas

- [ ] Definir una decision de enablement distinta de capability.
- [ ] Reusar contrato anti-assistant y transcript delimitado.
- [ ] Evaluar puntuacion, listas, fillers, autocorrecciones y entidades.
- [ ] Agregar casos instruction-in-transcript y requests que no deben responderse.
- [ ] Medir omisiones, agregados, traduccion y cambio de intencion.
- [ ] Endurecer sanitizer/fallback con señales observables, no heuristicas opacas.
- [ ] Comparar costo/latencia y variabilidad entre repeticiones.
- [ ] Definir candidatos para always-on, conditional o manual quality mode.

### Criterio De Promocion

Mejora perceptible y medible de estructura/errores sin drift semantico relevante,
con fallback raw seguro y decision de routing explicita.

## Phase 6 — Vocabulario Y Terminos Tecnicos (P1)

### Objetivo

Recuperar las correcciones tecnicas de Fixvox dentro del sistema propio de
vocabulario sin crear un segundo lexicon incompatible.

### Tareas

- [ ] Inventariar correcciones Fixvox genericas frente a fixture-specific.
- [ ] Importar solo reglas validas para el producto actual.
- [ ] Comparar correction-after-STT frente a hints antes del decoder cuando el
  provider lo soporte.
- [ ] Medir exact match de entidades y falsos reemplazos.
- [ ] Evaluar reglas automaticas vs `ask` sobre ambigüedad.
- [ ] Capturar correcciones humanas aprobadas y promoverlas deliberadamente.

### Criterio De Promocion

Mejora de entidades tecnicas sin reemplazos silenciosos incorrectos y con una
unica autoridad de vocabulario.

## Phase 7 — Modelos Y Audio De Maxima Calidad (P2)

### Objetivo

Buscar calidad absoluta una vez recuperadas las capacidades del pipeline.

### Tareas

- [ ] Agregar Groq `whisper-large-v3` como brazo de alta precision.
- [ ] Investigar modelos STT vigentes y soporte real de prompt/language/metadata.
- [ ] Comparar candidatos mediante el mismo corpus y contrato.
- [ ] Evaluar repetibilidad, disponibilidad, limites, privacidad, costo y latencia.
- [ ] Comparar WAV, FLAC lossless y MP3 48 kbps sobre los mismos audios.
- [ ] Evaluar normalizacion/denoise/trim solo con una hipotesis y corpus adecuado.
- [ ] Rechazar candidatos que mejoran promedio pero fallan entidades criticas.

### Criterio De Promocion

Una mejora de calidad que justifique costo/latencia y mantenga contratos de
operacion/fallback.

## Phase 8 — Routing Y Perfiles De Producto (P2/P3)

### Objetivo

Convertir resultados en rutas comprensibles y controlables.

Candidatos a validar, no defaults comprometidos:

- `Fast`;
- `Balanced`;
- `Best`;
- `Literal`;
- `Technical`.

### Tareas

- [ ] Definir candidate recipe completa por perfil.
- [ ] Decidir routing por preferencia, longitud, confidence, entidades, costo o
  review mode usando solo señales demostradas.
- [ ] Exponer runtime efectivo y tradeoff sin detalles internos engañosos.
- [ ] Mantener server-owned authority y receipts.
- [ ] Agregar rollback a baseline anterior.
- [ ] Validar en Tauri real con latencia percibida y texto paste-ready.

### Criterio De Promocion

Cada perfil tiene contrato, benchmark, costo, latencia, fallback y copy de
producto honestos.

## Phase 9 — Evaluacion Continua (P3)

### Objetivo

Evitar que calidad vuelva a degradarse silenciosamente.

### Tareas

- [ ] Modo local opt-in de shadow evaluation.
- [ ] Promocion deliberada de errores reales al corpus estable.
- [ ] Revision periodica de providers/modelos/precios.
- [ ] Regression gate para prompts, policies y product-v1 schema.
- [ ] Reporte de drift contra baseline y ultima ruta aprobada.
- [ ] Historial compacto de decisiones y experimentos negativos en el topic.
- [ ] Retencion/cleanup local definidos para audio y outputs de evaluacion.

## Plan Consolidado De Ejecución Restante — 2026-08-12

Objetivo operativo: cerrar Phases 3–9 sin volver a implementar infraestructura
por experimento, sin recomprimir audio por candidate y sin repetir STT cuando
raws existentes permiten replay. Cada wave termina en evidencia o en un gate
explícito; no se abre un batch documental por cada subpaso.

### Wave 1 — Plataforma P1 Provider-Free

Es el único corte de implementación previo a nuevas llamadas reales. Primero se
congela un contrato compartido; después se ejecutan cuatro lanes en paralelo:

1. **Contrato común:** extender `TranscriptionQualityCandidateRecipe`,
   `SampleResult` y receipts con metadata STT bounded, materialization reasons,
   métricas dimensionales de entidades/estructura/seguridad semántica y refs
   privadas. El summary público nunca incluye texto humano.
2. **Lane cloud:** versionar cuatro IDs server-owned para prompt corto/rico ×
   `auto`/`es`; el cliente sólo puede seleccionar un ID allowlisted de
   evaluación y nunca enviar prompt/modelo. Preservar desde provider words,
   segments, timestamps, `no_speech_prob` y `avg_logprob` mediante un envelope
   bounded/redacted de product-v1.
3. **Lane host Rust:** consumir ese envelope sin cambiar el multipart
   `metadata` + `audio`; reutilizar el gate probabilístico existente; registrar
   kept/changed/discarded y razones; derivar prosodia advisory; cubrir silencio,
   voz baja, frase corta, `gracias` real y alucinación completa/trailing.
4. **Lane replay:** generalizar el runner product-v1 a una matriz de candidates
   con audio prep único por sample; implementar replay sobre raw refs para
   postprocess y vocabulario; conservar latency/cost/cleanup level/prosody y
   medir omisiones, agregados, traducción, intención, entidades y estructura.
   Eliminar la duplicación efectiva de sanitizer o fijar una única batería de
   contrato que obligue a TS/Rust a producir la misma decisión.
5. **Lane continuidad:** agregar regression gate contra baseline/candidate
   aprobado, drift report redacted, shadow local opt-in y política explícita de
   retención/cleanup. No exponer todavía perfiles `Fast/Balanced/Best/Literal/
   Technical`.

Dependencias: el contrato común bloquea las cuatro lanes. Después pueden correr
en paralelo con el mismo schema y fixtures; una integración final ejecuta sólo
tests focales de cloud, Rust, runner/replay y artifacts, más build/check
proporcional.
#### Revisión De Aceptación Batch 3A — 2026-08-12

La plataforma parcial quedó verificada localmente sin provider calls:

- contrato común, cuatro recipes cloud server-owned y envelope product-v1
  bounded/redacted;
- materialización host conservadora y metadata STT contractual;
- regression/drift, shadow opt-in y retención dry-run;
- checks repetidos: TypeScript `50/50`, cloud `27/27`, Rust `34/34`,
  build/typechecks y ejecución provider-free sin red.

Wave 1 no está cerrada. La revisión del camino ejecutable encontró dos gaps:

1. `scripts/transcription-quality-product-baseline.ts` sigue fijo a
   `product-v1-current`, `3` requests y cap `USD 0.01`; no envía
   `evaluationRecipeId`, no recorre las cuatro recipes y prepara audio dentro
   del único loop.
2. El replay actual valida refs y contratos, pero no ejecuta todavía la matriz
   real de postprocess/vocabulario requerida por Wave 2.

La misma revisión corrigió el sentido de `instructionFollowing` en el
regression gate y agregó cobertura del contrato higher-is-better.

No se promovió recipe ni perfil y no hubo provider, deploy, VPS, cuentas,
policy productiva, commit ni push. Gate A permanece bloqueado hasta reparar y
probar provider-free el ejecutor exacto de 12 requests.
#### Revisión De Aceptación De La Reparación — 2026-08-12

El recorrido matricial local quedó implementado y verificado:

- tres samples × cuatro recipes, gate exacto de `12` requests y `USD 0.005`;
- audio prep único por sample, secuencialidad y stop-on-first-error;
- artifacts públicos redacted, refs privadas separadas y replay local de
  vocabulario;
- checks repetidos: TypeScript `36/36`, cloud `27/27`, Rust `34/34`,
  build/typechecks y comando Gate A sin autorización detenido antes de red.

Wave 1 aún no cierra por dos defectos de evidencia:

1. `buildBoundedSttMetadata()` devuelve `{ public, private }`, pero
   `cloud/fixvox-api/src/app.ts` conserva sólo `.public`. El runner vuelve a
   escribir ese receipt como `stt-metadata.json`; los words/segments privados
   reales se pierden y la `privateRef` no resuelve al payload prometido.
   `no_speech_prob` y `avg_logprob` tampoco se agregan desde segments.
2. La identidad `observed` del runner fija provider/model desde la recipe y
   calcula `sttPromptSha256` sobre el valor de `x-fixvox-prompt-id`. Eso no
   observa ni el modelo ni el cuerpo/hash del prompt y debe permanecer
   configured/resolved salvo evidencia efectiva.

Gate A permanece bloqueado hasta corregir ambos contratos y probarlos
provider-free. No hubo provider, deploy, VPS, cuentas, policy productiva,
commit ni push.

#### Cierre Provider-Free Batch 3A — 2026-08-12

Wave 1 quedó cerrada localmente:

- product-v1 conserva `words`/`segments` bounded en un envelope privado sólo
  para una `evaluationRecipeId` allowlisted; el receipt wire y los artifacts
  públicos no contienen texto humano, words ni segments;
- el runner persiste el payload real en
  `artifacts/transcription-quality/<run>/private/<sample>/<recipe>/stt-metadata.json`
  y publica una `privateRef` resoluble con counts/bounds;
- `no_speech_prob` segmentario usa el máximo y `avg_logprob` el mínimo cuando
  falta el top-level: criterio conservador para no sobrestimar calidad;
- identidad conserva `configured` como pedido del runner, `resolved` como
  recipe server-owned resuelta y `observed` sólo desde body/headers. Un prompt
  ID queda como ID y nunca se presenta como hash de cuerpo;
- el recorrido sigue siendo tres samples × cuatro recipes, `12` requests,
  cap `USD 0.005`, audio prep único, secuencial y stop-on-first-error.

Evidencia final provider-free: TypeScript focal `36/36`, cloud `29/29`, Rust
afectado `34/34` más contrato cloud `42/42`, build TypeScript/Vite, typecheck
cloud y `cargo check`. El comando real
`npm run transcription-quality:gate-a` sin autorización devolvió
`provider-call-gate-required` con `requestCount: 0`.

Estado: `waiting_gate`. El corte server-owned fue autorizado y completado:
backup cifrado `fixvox-20260812T191930155462815Z.dump.zst.age`, migraciones
aditivas `0007`/`0008` (`schema 6→8`) y release inmutable actual
`f86ee896478cbd03`, con rollback de código inmediato `059201435708ad33`.
Servicio, health/readiness local y health público quedaron verdes con
`cloudflare-authority`.

Gate A completó `12/12` requests provider-real bajo el cap: costo estimado
`USD 0.003724`, artifacts privados y reportes redacted bajo
`artifacts/transcription-quality/gate-a-20260812-v3/`. El prompt corto ganó
contra el rico en macro WER (`0.25094` vs `0.26610`) y macro CER (`0.16926` vs
`0.17193`); `auto` y `es` produjeron texto byte-idéntico dentro de cada prompt.
No hay evidencia para fijar idioma ni promover la recipe rica: se conserva la
baseline corta/auto. Gate B permanece separado, pendiente de reparación
provider-free y autorización nueva.


### Gate A — Matriz STT Phase 3 + Metadata Phase 4

Requiere autorización nueva y, si el código server-owned debe publicarse antes
del benchmark, autorización separada para ese deploy exacto.

- corpus: los tres samples humanos `approved`;
- candidates: exactamente cuatro, corto/rico × `auto`/`es`;
- máximo: `12` requests STT; cada combinación usa el mismo audio preparado;
- costo estimado a tarifa pública `USD 0.04/h`: `USD 0.003848`; declarar un cap
  cerrado antes de ejecutar;
- postprocess, vocabulario y delivery `off`;
- el mismo run captura verbose metadata, no-speech evidence, entidades,
  puntuación/listas, latencia y costo. No repetir llamadas para Phase 4.

Precondición de autorización: debe existir un único comando/provider-call gate
que pruebe antes de red `12` requests exactos y cap `USD 0.005`, prepare cada
audio una sola vez, envíe los cuatro `evaluationRecipeId` allowlisted, preserve
metadata privada bounded detrás de refs resolubles y no fabrique identidad
observada. El runner matricial ya cubre recorrido y caps; metadata e identidad
siguen pendientes.

Promover sólo una recipe de prompt/idioma si mejora entidades/fidelidad sin
degradar bilingüe ni instrucciones literales. Si ninguna gana, conservar la
baseline y registrar el resultado negativo.

#### Resultado Gate A — 2026-08-12

- `12/12` transcripciones secuenciales; costo estimado total `USD 0.003724`,
  por debajo del cap `USD 0.005`.
- `short-auto`: macro WER `0.25094`, macro CER `0.16926`, STT medio `606 ms`.
- `short-es`: misma salida y mismos scores que `short-auto`; STT medio `511 ms`.
- `rich-auto`: macro WER `0.26610`, macro CER `0.17193`, STT medio `666 ms`.
- `rich-es`: misma salida y mismos scores que `rich-auto`; STT medio `595 ms`.
- El prompt rico degradó dos de tres samples y empató el tercero. El idioma
  forzado no cambió ningún texto. No se promueve ninguna alternativa; la
  baseline corta/auto sigue siendo la receta de referencia para Wave 2.

### Wave 2 — Replay Postprocess Y Vocabulario

Usar únicamente los raws del Gate A:

1. comparar raw, GPT-OSS 120B sin prosodia y GPT-OSS 120B con prosodia sobre el
   raw ganador de cada uno de los tres samples;
2. aplicar vocabulario post-STT `off`/`automatic`/`ask` localmente sobre los
   mismos raws; importar sólo correcciones Fixvox genéricas aprobadas a la
   autoridad existente de personal vocabulary;
3. no probar niveles/modelos adicionales hasta que el primer contraste muestre
   una ganancia medible;
4. hints pre-decoder quedan en un gate STT posterior porque no pueden evaluarse
   por replay.

Sólo las `6` ejecuciones LLM iniciales requieren autorización provider-real; la
ablación de vocabulario y todos los scores son locales. Promover postprocess
como always-on, conditional o manual sólo con fallback raw, costo, latencia y
semantic safety observados.

#### Cierre Provider-Free Gate B — 2026-08-12

El contrato local quedó implementado y verificado sin provider:

- el runner rechaza matrices ambiguas y selecciona exactamente los tres raws
  canónicos `transcription-quality-v1-short-auto` del Gate A;
- dos recipes server-owned cerradas:
  `transcription-quality-v1-postprocess-120b-plain` y
  `transcription-quality-v1-postprocess-120b-prosody`;
- ambas fijan Groq `openai/gpt-oss-120b`, prompt
  `managed-postprocess-v1`, `temperature: 0` y máximo `512` completion tokens;
- la variante prosódica deriva hints advisory desde los `words` privados; el
  servidor exige hints sólo para esa recipe y los trata como señal, no regla;
- runner secuencial, stop-on-first-error, exactamente `3 × 2 = 6` requests,
  identidad configured/resolved/observed separada y artifacts públicos sin
  transcript ni hints;
- plan provider-free sobre los raws reales: `providerCalls: 0`,
  `plannedRequests: 6`, prosodia disponible en los tres samples y costo máximo
  conservador `USD 0.003936` bajo tarifas públicas actuales Groq
  (`USD 0.15/M` input, `USD 0.60/M` output), debajo del cap `USD 0.005`.

Evidencia: TypeScript focal `12/12`, core recipes `4/4`, API/actions/providers
`27/27`, build raíz y typecheck cloud. El comando sin
`--allow-provider-call` volvió a detenerse antes de red con
`requestCount: 0`.

No hubo deploy, provider, VPS, policy productiva, commit ni push. Próximos gates
separados: (1) publicar exactamente las dos recipes/envelope server-owned;
(2) después de verificar health/readiness, autorizar el comando Gate B de seis
llamadas con cap `USD 0.005`.

#### Deploy Server-Owned Gate B — 2026-08-12

JP autorizó sólo el deploy. Se publicó el bundle inmutable
`a909ece64107d62d` con SHA-256
`a909ece64107d62d52657f486f8d3087581487684822bf3ffeb74a90e44d6b67`.
No hubo migraciones nuevas ni llamadas al provider. Rollback inmediato:
`f86ee896478cbd03`.

Verificación productiva: symlink `current` apunta al release nuevo;
`fixvox-api.service` está `active/running`, `NRestarts=0`; `/health` y `/ready`
locales están verdes, schema/jobs/database true y autoridad
`cloudflare-authority`; health público también verde.

Estado: `waiting_gate`. Falta autorización separada para ejecutar exactamente
las seis llamadas Gate B con cap `USD 0.005`.

#### Resultado Gate B — 2026-08-12

La matriz autorizada `gate-b-20260812-v1` completó `6/6` requests:

- raw de referencia: macro WER `0.25094`, macro CER `0.16926`;
- GPT-OSS 120B plain: WER `0.22839`, CER `0.13346`, latencia media
  `1220 ms`; mejora automática de `9.0%` WER y `21.2%` CER;
- GPT-OSS 120B con prosodia: WER `0.33692`, CER `0.24658`, latencia media
  `1235 ms`; degradación de `34.3%` WER y `45.7%` CER;
- costo real no fue observable en product-v1; el límite conservador previo fue
  `USD 0.003936`, debajo del cap autorizado `USD 0.005`.

La mejora media plain no es promocionable. En el sample de modelos eliminó
`Fin de la lista` y `Fin de la muestra`; tampoco reparó `Fixbox`,
`voice-doc-output.ts`, `boom run dead`, `3.370B` ni `GPT-OSS20D`.

Prosodia queda rechazada en esta forma. En el sample de modelos el LLM obedeció
la petición dictada y reemplazó la frase solicitante por una respuesta:
`El modelo que conserva mejor...`. Es una violación directa del contrato
anti-assistant, además de una degradación grande.

El scorer automático marcó `instructionFollowing: 1` y no contó esa sustitución
como adición porque usa proxies de longitud. Esa evidencia es falsa para este
caso: antes de otro benchmark hay que reparar semantic safety/medición
provider-free y exigir fallback raw ante omisiones, contenido novedoso o
respuesta al transcript. No se promueve postprocess always-on, conditional ni
manual; baseline STT raw corta/auto permanece.

#### Cierre Provider-Free Batch 3C — 2026-08-12

La reparación quedó integrada sin duplicar checks:

- `cloud/fixvox-core/src/execution/postprocess-semantic-safety.ts` es la única
  autoridad pura. Compara raw/candidate con alineación de tokens, tolera
  puntuación, casing, listas, fillers inequívocos y correcciones técnicas de
  distancia mínima; cualquier token material omitido o novedoso produce
  fallback al raw. Las razones cerradas son `empty_candidate`,
  `material_omission`, `unsupported_addition`, `semantic_transformation` y
  `comparison_limit_exceeded`; más de `512` tokens por lado cae a raw antes de
  reservar la matriz cuadrática.
- El resultado privado contiene el texto seguro; el receipt público contiene
  sólo `decision`, reasons cerradas, conteos de alineación y `redacted: true`.
  `fixvox-api` lo ejecuta para todo `kind=postprocess` antes de construir
  `output`.
- Gate B exige ese receipt, entrega/persiste sólo el texto ya seguro y usa sus
  operaciones alineadas para omissions/additions. Un fallback fija
  `instructionFollowing: 0`; ya no puede declarar éxito por igualdad de
  longitudes.
- Smoke sin red sobre `gate-b-20260812-v1`: bilingüe plain/prosodia y lista
  plain/prosodia quedaron `accepted` con `0/0`; modelos plain cayó a raw por
  `9` omisiones; modelos prosodia cayó a raw por `15` omisiones, `14` adiciones
  y transformación semántica.
- Cobertura sintética reproduce omisión de cola y respuesta a una petición
  dictada; también acepta limpieza, lista, fillers y corrección técnica
  conservadora. Evidencia: core `43/43`, API unit `59/59`, runner/scorer raíz
  focal `12/12`, build raíz y typecheck API verdes.

No hubo provider calls, red, deploy, VPS, cambio de policy productiva, commit
ni push. Estado: `waiting_gate`. Próximo corte mínimo: publicar sólo este
evaluador/receipt server-owned y verificar health/readiness; no repetir Gate B
ni experimentar con prompt/modelo sin una decisión y autorización posteriores.

#### Deploy Batch 3D — 2026-08-12

JP autorizó sólo la publicación de la defensa. Se desplegó el bundle inmutable
`9279c043233eada6`, SHA-256
`9279c043233eada68f802b5626e2699340fb64db4444f8c0cf8ad8a6e9809eca`;
rollback inmediato `a909ece64107d62d`.

No hubo migraciones, provider calls, repetición de Gate B, cambios de
prompt/modelo/policy, DNS, commit ni push. Verificación productiva:

- symlink `current` apunta a `9279c043233eada6`;
- `fixvox-api.service` `active/running`, `NRestarts=0`;
- listener `127.0.0.1:8790`;
- `/health` y `/ready` locales verdes, database/schema/jobs true y
  `cloudflare-authority`;
- health público verde.

Batch 3C/3D queda completo. No se promueve postprocess; el runtime sólo obtuvo
el fallback defensivo para cualquier uso permitido por policy existente.
Cualquier benchmark nuevo requiere una hipótesis discriminante y autorización
separada.

#### Prototipo Provider-Free Batch 3E — 2026-08-12

El corte priorizó dictados cotidianos reales existentes sin provider calls. Un
único harness, `scripts/transcription-quality-everyday-prototype.ts`, descubre
artifacts de micrófono de Dictation Tauri y bases locales de Fixvox/Wispr,
deduplica por hash y selecciona determinísticamente. Reutiliza directamente la
autoridad de semantic safety Batch 3C; ningún final histórico se presenta como
gold sin adjudicación.

La corrida reproducible
`artifacts/transcription-quality/everyday-prototype-39a746e23c60/` encontró
`6.546` pares raw/final: `227` de Dictation Tauri con audio, `5.336` de Fixvox
y `983` de Wispr. Después de dedupe y prioridad cotidiana quedaron `5.682`
usables; el corpus pequeño seleccionó `18`: `6` con audio+raw+final y `12` con
raw+final. Cobertura multi-etiqueta: preguntas `18`, fillers/repetición `17`,
rioplatense `16`, explicación breve `11`, corrección hablada `11`, notas `8`,
listas `7` y mensajes `7`.

Batch 3C aceptó `14` finales históricos y produjo fallback para `4`: los cuatro
por `material_omission`, uno además por `unsupported_addition` y
`semantic_transformation`. Esto es una señal conservadora raw/candidate, no
calidad contra referencia adjudicada. Manifest, results y summary públicos sólo
contienen IDs, hashes, conteos, receipts y refs; textos, audio y la cola
lado-a-lado de `12` casos viven bajo `private/` ignorado.

Evidencia provider-free: tests conductuales focales `5/5`, semantic safety
`5/5`, build/typecheck raíz y comando real completos. No hubo red, provider,
deploy, VPS, cambios productivos, commit ni push.

Estado: `complete`. Ya se puede adjudicar la cola privada. Próximo corte mínimo:
revisar como máximo sus `12` casos, registrar por ID si el final histórico
preserva intención y estructura, y promover a referencia aprobada sólo los
textos explícitamente adjudicados; no abrir modelos, prompts ni provider calls.


#### Adjudicación Provider-Free Batch 3F — 2026-08-13

JP adjudicó los `12/12` casos privados por ID. El resultado promovió `10`
referencias de preferencia y rechazó `2`: `raw=2`, `final=3`,
`equivalent=5`, `reject=2`. La decisión completa vive en
`private/adjudication.json`; `adjudication-summary.json` publica sólo IDs,
decisiones, hashes y conteos redacted.

Los cuatro fallbacks conservadores se dividieron en dos raws preferidos y dos
finales preferidos. Los raws evitaron una reestructuración con HTML/cambios
semánticos y un truncamiento material; los finales preferidos sólo limpiaron
puntuación hablada o agregaron comas. El gate evita los daños observados, pero
sacrifica dos mejoras menores: es el tradeoff conservador esperado.

De los ocho casos aceptados por semantic safety, seis quedaron aprobados y dos
rechazados porque raw y final ya compartían errores de STT. Esto no es un falso
positivo del gate de preservación: confirma que semantic safety no mide
exactitud contra audio/gold.

El harness ahora aplica adjudicaciones completas, rechaza subsets silenciosos,
exige igualdad byte a byte para `equivalent` y genera una proyección pública sin
texto. Evidencia: test focal `7/7`, aplicación real provider-free y build raíz
verdes; `approved=10`, `rejected=2`, cero provider/STT calls.

Próximo experimento discriminante: replay local sobre los tres raws
`short-auto` del Gate A con un snapshot candidato pequeño de correcciones
técnicas Fixvox (`off`/`automatic`/`ask`). Debe medir exactitud de entidades y
falsos reemplazos contra los gold aprobados, sin persistir reglas en producto ni
abrir prompt/modelo/provider. Sólo reglas ganadoras explícitamente adjudicadas
pueden promoverse después.


#### Replay Provider-Free De Vocabulario Batch 3G — 2026-08-13

Se evaluaron siete correcciones exactas recuperadas de Fixvox sobre los tres
raws `short-auto` de Gate A. El snapshot fue sólo un artifact local; no existía
cache personal local y no se mutó vocabulario de producto, cuenta ni policy.

La ablación all-automatic, derivada deliberadamente de los errores del mismo
corpus, bajó macro WER `0.25094→0.15224`, macro CER `0.16926→0.13970` y llevó
entidades exactas `0/8→8/8`. Es una prueba de capacidad/regresión, no evidencia
de generalización. Los `18` controles cotidianos no tuvieron coincidencias ni
reemplazos.

JP adjudicó las siete reglas: cinco `automatic` (`fixbox`, `boom run dead`,
`boonrandev`, `GPT-OSS20D`, `Llama 3.370B`) y dos `ask` (`app.svelte`,
`voice-doc-output.ts`) por riesgo de que el filename literal sea válido. Con
sólo las automáticas aprobadas, macro WER quedó en `0.15964`, CER en `0.14375`
y entidades exactas en `5/8`; las tres restantes quedan detrás de elección. Los
`18` controles siguieron con cero cambios o preguntas.

Artifacts redacted y snapshots privados:
`artifacts/transcription-quality/vocabulary-replay-batch-3g-*-v1/`. Todos los
replays reportaron `providerCalls=0` y `sttCalls=0`.

Estado: referencia local aprobada, `productPersistence=not-applied`. El próximo
gate es aplicar exactamente esas siete reglas al vocabulario de la cuenta
destino, refrescar el cache host-owned y ejecutar un smoke Tauri sin provider ni
delivery. Esa mutación externa debe confirmar cuenta/scope y valores exactos en
el punto de riesgo.

#### Modo Personal De Experimentación Batch 3H — 2026-08-13

Settings > Dictado incorporó un selector host-owned para comparar recetas
versionadas durante uso cotidiano, sin editar policy cloud ni reiniciar la app:

- `Según mi perfil`: limpia el override local;
- `Literal`: STT productivo actual, postprocess apagado;
- `Limpieza segura`: mismo STT, postprocess managed encendido con fallback raw;
- `Experimental`: recipe allowlisted `transcription-quality-v1-rich-auto`,
  postprocess apagado.

Cada recipe puede aplicarse al próximo dictado o a la sesión. El one-shot se
reserva atómicamente para una sola request, no se consume ante una salida
pre-provider y no pisa rutas explícitas como `exclusive-transform-route`.
Recipe ID, versión y source viajan separados de `policyId` en evidence
postprocess y llegan al ledger redacted del pipeline. El estado es temporal,
en memoria del host; no persiste al cerrar la app y un override `next` no se
apila todavía sobre uno de sesión.

Verificación: Rust `6/6`, Vitest focal `17/17`, `cargo check`, build TypeScript/
Vite y smoke visual Tauri real. En el smoke se seleccionó `Literal`, alcance
`Próximo dictado`, se aplicó y la UI confirmó el one-shot. No hubo dictado,
provider call, STT, postprocess, delivery ni cambio de cuenta/policy.

Próximo uso: alternar recetas durante dictados normales, guardar el run ID y
marcar `Mejor`, `Igual`, `Perdió contenido`, `Agregó contenido`, `Cambió
intención`, `Mejoró estructura` o `Mejoró términos` al pedir comparación. No
promover defaults ni persistencia de cuenta hasta acumular evidencia cotidiana.

#### Dictation Laboratory Prototype Batch 3I — 2026-08-13

Se implementó el prototipo desktop-first del laboratorio sobre la autoridad de
profiles ya existente; no se creó storage paralelo. Settings > Dictado quedó
reducido a receta activa y entrada **Abrir laboratorio**. La ventana Tauri
dedicada incorpora:

- catálogo de profiles/versiones/revisión y draft local estructurado;
- STT, prompt/idioma, postprocess, defaults, límites, controles y JSON avanzado;
- validación y preview/diff server-owned, obligatorios antes de habilitar
  publicación;
- apply/rollback con `expectedRevision`, confirmación tipada y auditoría;
- asignación de cuenta por la autoridad existente;
- configuración `configured` y estados `resolved`/`observed` honestamente
  `unavailable` cuando la evidencia no existe;
- selección y comparación provider-free de runs locales mediante longitudes,
  refs opacas, seguridad, costo, latencia, fallback y provider/modelo, sin
  copiar texto al modelo público.

El control plane canónico agregó detail/version metadata y endpoints read-only
`validate`/`preview`; ambos validan referencias y producen diff bounded/redacted
sin insertar versiones ni audit records. Las rutas productivas de apply,
rollback y account assignment conservan sus gates.

Verificación local: Vitest del laboratorio `8/8`, cloud route baseline `26/26`,
TypeScript cloud/frontend sin errores, build Vite, `cargo check` aislado y smoke
Tauri real de Settings -> Dictado -> Abrir laboratorio. El smoke confirmó que
la ventana abre y que una sesión sin rol de operador termina en estado bounded
`DICTATION_LAB_UNAUTHORIZED` después de `10 s`, sin provider call ni datos de
ejemplo.

Pendiente gated: desplegar las rutas cloud nuevas y vincular el principal exacto
de JP a un rol Control Room. La mutación de permisos requiere confirmar
principal, rol y alcance en el punto de riesgo; el deploy también requiere
autorización explícita. Hasta entonces no se puede validar visualmente el
builder con datos reales ni ejecutar apply/rollback/assignment.


### Wave 3 — Alta Precisión Y Formatos

Después de cerrar P1:

1. investigar vigencia, límites, privacidad y metadata de modelos sin llamadas;
2. agregar `whisper-large-v3` como candidate server-owned, no como default;
3. reutilizar Turbo ya producido y ejecutar primero V3 sobre los tres samples
   (`3` requests);
4. sólo si V3 o una anomalía de compresión lo justifica, comparar WAV/FLAC/MP3
   con el menor subset discriminante; no abrir el factorial completo;
5. denoise/trim/normalización adicional exige una hipótesis y fixture que la
   necesite.

Cada ampliación declara un gate nuevo. Rechazar mejoras promedio que dañen
entidades críticas.

### Wave 4 — Perfiles, Routing Y Operación Continua

Sólo después de elegir recipes:

1. materializar perfiles server-owned únicamente para winners demostrados;
2. routing usa sólo señales medidas; sin thresholds inventados;
3. exponer recipe efectiva, costo/latencia/fallback y copy honesto;
4. conservar apply/rollback versionado del control plane;
5. validar cada perfil promovido con un smoke Tauri real acotado;
6. activar shadow evaluation sólo por opt-in local, promover errores reales al
   corpus deliberadamente y ejecutar regression/drift gates ante cambios de
   prompt, policy, modelo o schema;
7. revisar providers/modelos/precios periódicamente sin alterar defaults por
   descubrimiento.

### Regla De Ejecución

Una sesión implementadora debe completar toda Wave 1 en un solo batch,
paralelizando lanes con contratos fijados por el agente principal. Después debe
detenerse en Gate A y devolver el brief exacto de autorización; nunca convertir
la falta de autorización en un subset silencioso ni ejecutar provider, deploy,
VPS, commit o push.

## Schema Acordado En Phase 0

Entidades: `CorpusManifest`, `Sample`, `Candidate`, `Run` y `SampleResult`.
El contrato completo está en
`docs/reference/transcription-quality-fixvox-inventory.md`, sección
“Schema Mínimo Propuesto (Phase 1)”.

Invariantes:

- `Sample` extiende los campos de `SyntheticAudioFixture`;
- manifest/sample/candidate/run/result tienen versión e identidad estable;
- cada result fija exactamente un run, sample y candidate;
- raw/final son refs distintas y raw puede reutilizarse sin repetir STT;
- identidad efectiva conserva configured/resolved/observed;
- artifacts humanos se representan por refs, hashes, lengths y metadata safe;
- scores son dimensionales; no existe `overallScore`;
- no hay plugin system ni jerarquía genérica de stages.

## Primera Matriz Priorizada

| Orden | Variable | Control | Evidencia buscada | Prioridad |
| --- | --- | --- | --- | --- |
| 0 | Schema/path/redaction provider-free | dos runs iguales | determinismo y cero texto humano en summary | P0 |
| 1 | Gold approved/provisional/shadow | adjudicación privada | corpus scoreable y shadow separado | P0 |
| 2 | Baseline productiva | receipt configured/resolved/observed | raw/final y candidate identity reales | P0 |
| 3 | Prompt vacío/corto/rico | Turbo + mismo audio + auto | entidades y fidelidad | P1 |
| 4 | `auto` vs `es` | modelo/prompt fijos | bilingüe vs español | P1 |
| 5 | No-speech/filtros | misma respuesta/metadata | descartes y falsos positivos | P1 |
| 6 | Raw/medium/ultra-conservative | mismo raw STT | estructura vs drift/fallback | P1 |
| 7 | Sin/con prosodia | mismo raw/modelo PP | puntuacion y listas | P1 |
| 8 | Sin/con vocabulario | mismo raw | entidades y falsos reemplazos | P1 |
| 9 | 120B vs alternativas | mismo raw + repeticiones | calidad, costo y tail latency | P1 |

## Artifacts

Ruta confirmada con los invariantes existentes:

`artifacts/transcription-quality/<run-id>/`

Contenido:

- `run.json`;
- `results.jsonl`;
- `summary.json`;
- `summary.md` sólo cuando exista un consumidor concreto; siempre derivado y
  redacted. Batch 1A no lo emite;
- refs privadas por sample cuando la politica de datos lo permita.

El namespace no crea otra convención de fixture: el manifest canónico sigue
extendiéndose desde `src/test-fixtures/synthetic-audio-manifest.ts`. Reutiliza
rutas workspace-relative, allowlist y policy gitignored. Manifest/gold sintético
no sensible pueden versionarse. Audio/gold/raw/final humano y provider payloads
quedan locales/gitignored con retención inicial `manual-delete`.

## Gates De Provider Real

Antes de cada batch real declarar:

- corpus/subset exacto;
- candidates exactos;
- numero maximo de requests;
- provider/modelos;
- costo estimado maximo;
- si usa audio humano;
- artifacts producidos;
- ausencia de delivery/foreground side effects.

La autorizacion de un benchmark no autoriza deploy, production policy changes,
cuentas, instalaciones, release, commit ni push.


## Dictation Laboratory — Frozen Closure Contract — 2026-08-13

Este cierre quedó validado provider-free el 2026-08-13. La implementación y
sus pruebas preservan:

- `profiles` y `profile_versions` siguen siendo la única autoridad; la metadata
  de profile/version queda anidada fuera de la definición canónica y una mutación
  envía únicamente `definition`.
- El catálogo es `GET /product/v1/control-room/laboratory/catalog` y sólo expone
  metadata segura: exactamente cuatro recipes STT y dos recipes de
  postprocess de `evaluation-recipes.ts`; IDs descubiertos en artifacts nunca
  se vuelven autoridad seleccionable.
- En runtime, cada operación sólo usa `engineId` y `promptId`; el idioma vive
  en `defaults["transcript.language"]`.
- `POST /product/v1/control-room/laboratory/execution-grants` debe devolver
  `authoritative_one_shot_grant_unavailable`. Provider-real falla cerrado antes
  de spawn o red mientras no exista consumo atómico de un grant autorizado.
- Gate A debe ser exactamente `GATE_A_DEFINITION` o rechazar antes de ejecutar.
  Gate B y vocabulary permanecen unavailable sin sus prerrequisitos exactos.
- `configured`, `resolved` y `observed` son capas independientes; la UI muestra
  `null`/`unavailable` cuando no existe evidencia, sin completar huecos.
- Preview usa cambios `add`/`remove`/`change` y `candidateFingerprint`; un diff
  viejo se marca stale y no habilita publicación. Los estados no-op y vacíos son
  explícitos.
- Un receipt de mutación `success` no se convierte en error si falla el refresh:
  la mutación y el refresh se muestran como hechos separados.
- Roles, sesión y recursos no disponibles deben bloquear de forma honesta;
  audio, gold, raw, final, paths, secretos y payloads de provider permanecen
  detrás de refs/comandos allowlisted y nunca aparecen en proyecciones públicas.
- La ventana desktop usa un mínimo/default de `720x620` y sólo resize nativo;
  no usa Win/Super, menú de sistema ni snap.

La validación observada pasó `35` tests frontend focales, `4` tests de recipes,
`26` tests API y `9` tests Rust del laboratorio, más `npm run check`,
`npm run build`, `cargo check` e index/audit sin errores. El smoke Tauri real:

- abrió la superficie con cinco workspaces y estado signed-out honesto;
- mantuvo `Responding=true` y cero overflow tras resize nativo a `720x620` y
  `900x700`, además de 200% zoom;
- ejecutó el replay provider-free a través del host Tauri: `2/2` samples,
  `providerCalls.enabled=false`, `maxRequests=0`;
- no ejecutó provider-real, audio, delivery ni mutación productiva.

## Próximo Corte

**Batch 3A — A/B inicial de prompt STT e idioma**, gated. Antes de ejecutarlo
se requiere una autorización provider-real nueva para la definición exacta de
tres samples por cuatro recipes, `12` requests y costo máximo `USD 0.005`.
Auth mutation contra PostgreSQL, Gate B, deploy, producción y release tampoco
se afirman en este cierre.
